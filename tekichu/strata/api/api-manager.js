/**
 * APIManager - 外部API通信管理
 * 依存: Utils, AuthManager（任意）
 * 
 * キャッシュ、リトライ、タイムアウト対応。
 * options.auth = true でAuthManagerのトークンを自動付与。
 */

import { Utils } from '../core/utils.js';

export class APIManager {
  static cache = new Map();
  static pendingRequests = new Set();
  static isOnlineFlag = true;
  
  static DEFAULT_TIMEOUT = 30000;
  static DEFAULT_RETRY = 3;
  static DEFAULT_RETRY_DELAY = 1000;
  static DEFAULT_CACHE_TTL = 300000;  // 5分
  
  // =========================================
  // 初期化
  // =========================================
  
  static init() {
    window.addEventListener('online', () => {
      this.isOnlineFlag = true;
    });
    window.addEventListener('offline', () => {
      this.isOnlineFlag = false;
    });
    this.isOnlineFlag = navigator.onLine;
    
    console.log('[APIManager] Initialized');
  }
  
  // =========================================
  // リクエストメソッド
  // =========================================
  
  /**
   * GETリクエスト
   * @param {string} url - URL
   * @param {Object} options - オプション
   * @param {boolean} options.auth - trueでAuthManagerのトークンを付与
   * @param {boolean} options.cache - falseでキャッシュ無効
   * @param {string} options.cacheKey - キャッシュキー
   * @param {number} options.cacheTTL - キャッシュTTL（ms）
   * @param {number} options.timeout - タイムアウト（ms）
   * @param {number} options.retry - リトライ回数
   * @param {Object} options.headers - 追加ヘッダー
   */
  static async get(url, options = {}) {
    return this.request('GET', url, null, options);
  }
  
  /**
   * POSTリクエスト
   */
  static async post(url, data, options = {}) {
    return this.request('POST', url, data, options);
  }
  
  /**
   * PUTリクエスト
   */
  static async put(url, data, options = {}) {
    return this.request('PUT', url, data, options);
  }
  
  /**
   * DELETEリクエスト
   */
  static async delete(url, options = {}) {
    return this.request('DELETE', url, null, options);
  }
  
  // =========================================
  // リクエスト実行
  // =========================================
  
  static async request(method, url, data, options = {}) {
    // オフラインチェック
    if (!this.isOnlineFlag) {
      const error = new Error('オフラインです');
      error.name = 'NetworkError';
      throw error;
    }
    
    // キャッシュチェック（GETのみ）
    if (method === 'GET' && options.cache !== false) {
      const cacheKey = options.cacheKey || url;
      const cached = this.getCached(cacheKey);
      if (cached !== null) {
        return cached;
      }
    }
    
    // リクエスト実行
    const result = await this.executeWithRetry(method, url, data, options);
    
    // キャッシュ保存（GETのみ）
    if (method === 'GET' && options.cache !== false) {
      const cacheKey = options.cacheKey || url;
      const ttl = options.cacheTTL || this.DEFAULT_CACHE_TTL;
      this.setCache(cacheKey, result, ttl);
    }
    
    return result;
  }
  
  static async executeWithRetry(method, url, data, options) {
    const maxRetries = options.retry ?? this.DEFAULT_RETRY;
    const retryDelay = options.retryDelay ?? this.DEFAULT_RETRY_DELAY;
    
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeSingle(method, url, data, options);
      } catch (error) {
        lastError = error;
        
        // 4xx エラーはリトライしない
        if (error.status && error.status >= 400 && error.status < 500) {
          throw error;
        }
        
        // 最後の試行なら投げる
        if (attempt === maxRetries) {
          throw error;
        }
        
        // 指数バックオフで待機
        await Utils.sleep(retryDelay * (attempt + 1));
      }
    }
    
    throw lastError;
  }
  
  static async executeSingle(method, url, data, options) {
    const controller = new AbortController();
    this.pendingRequests.add(controller);
    
    const timeout = options.timeout || this.DEFAULT_TIMEOUT;
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      // ヘッダー準備
      const headers = {
        ...options.headers
      };
      
      // [STRATA変更] options.auth = true でAuthManagerのトークンを付与
      if (options.auth) {
        try {
          const { AuthManager } = await import('../auth/auth-manager.js');
          const token = AuthManager.getToken();
          if (token) {
            headers['Authorization'] = `Bearer ${token}`;
          }
        } catch (e) {
          // AuthManager未使用の場合は無視
          console.warn('[APIManager] AuthManager not available');
        }
      }
      
      // POST/PUT のみ Content-Type を付ける
      if (data) {
        headers['Content-Type'] = 'application/json';
      }
      
      // リクエストオプション
      const fetchOptions = {
        method,
        headers,
        signal: controller.signal
      };
      
      // ボディ（POST/PUT）
      if (data) {
        fetchOptions.body = JSON.stringify(data);
      }
      
      // リクエスト実行
      const response = await fetch(url, fetchOptions);
      
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      
      // レスポンス解析
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('application/json')) {
        return await response.json();
      } else {
        return await response.text();
      }
      
    } finally {
      clearTimeout(timeoutId);
      this.pendingRequests.delete(controller);
    }
  }
  
  // =========================================
  // キャッシュ
  // =========================================
  
  static getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }
  
  static setCache(key, data, ttl = this.DEFAULT_CACHE_TTL) {
    this.cache.set(key, {
      data,
      expiresAt: Date.now() + ttl
    });
  }
  
  /**
   * キャッシュクリア
   * @param {string|null} keyPattern - nullで全クリア、文字列で部分一致削除
   */
  static clearCache(keyPattern = null) {
    if (keyPattern === null) {
      this.cache.clear();
    } else {
      for (const key of this.cache.keys()) {
        if (key.includes(keyPattern)) {
          this.cache.delete(key);
        }
      }
    }
  }
  
  // =========================================
  // 状態
  // =========================================
  
  static isOnline() {
    return this.isOnlineFlag;
  }
  
  static getPendingRequests() {
    return this.pendingRequests.size;
  }
}
