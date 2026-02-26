/**
 * AuthManager - 認証管理
 * 依存: AuthAdapter, NotificationManager, MessageBus
 * 
 * Adapterを外部から注入することで、Google OAuth以外の認証にも対応可能。
 */

import { NotificationManager } from '../core/notification-manager.js';
import { MessageBus } from '../core/message-bus.js';

export class AuthManager {
  static adapter = null;
  
  // =========================================
  // Adapter設定
  // =========================================
  
  /**
   * Adapterをセット（init前に呼ぶ）
   * @param {AuthAdapter} adapter
   */
  static setAdapter(adapter) {
    this.adapter = adapter;
  }
  
  // =========================================
  // 初期化
  // =========================================
  
  /**
   * 初期化
   */
  static async init() {
    if (!this.adapter) {
      throw new Error('[AuthManager] Adapter not set. Call setAdapter() first.');
    }
    
    // Adapter初期化（保存済みトークン復元）
    this.adapter.init();
    
    // コールバック処理（OAuth redirect後など）
    const callbackResult = await this.adapter.handleCallback();
    
    if (callbackResult) {
      // 認証成功
      NotificationManager.success('ログインしました');
      MessageBus.emit('auth-changed', { authenticated: true });
    }
    
    console.log('[AuthManager] Initialized', 
      this.isAuthenticated() ? '(logged in)' : '(not logged in)');
  }
  
  // =========================================
  // 認証操作
  // =========================================
  
  /**
   * ログイン
   */
  static login() {
    if (!this.adapter) {
      NotificationManager.error('認証が設定されていません');
      return;
    }
    
    this.adapter.login();
  }
  
  /**
   * ログアウト
   */
  static logout() {
    if (!this.adapter) {
      return;
    }
    
    this.adapter.logout();
    
    MessageBus.emit('auth-changed', { authenticated: false });
    NotificationManager.info('ログアウトしました');
  }
  
  // =========================================
  // 状態取得（Adapterに委譲）
  // =========================================
  
  /**
   * トークン取得
   * @returns {string|null}
   */
  static getToken() {
    if (!this.adapter) return null;
    return this.adapter.getToken();
  }
  
  /**
   * 認証済みか判定
   * @returns {boolean}
   */
  static isAuthenticated() {
    if (!this.adapter) return false;
    return this.adapter.isAuthenticated();
  }
  
  /**
   * ユーザー情報取得
   * @returns {Object|null}
   */
  static getUserInfo() {
    if (!this.adapter) return null;
    return this.adapter.getUserInfo();
  }
}
