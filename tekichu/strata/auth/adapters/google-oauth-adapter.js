/**
 * GoogleOAuthAdapter - Google OAuth 2.0 認証
 * 依存: AuthAdapter
 * 
 * Google OAuth 2.0 Implicit Grant Flow を使用した認証実装。
 */

import { AuthAdapter } from '../auth-adapter.js';

export class GoogleOAuthAdapter extends AuthAdapter {
  /**
   * @param {Object} options
   * @param {string} options.clientId - Google Cloud Console のクライアントID
   * @param {string[]} options.scopes - 認可スコープ配列
   * @param {string} options.storageKey - localStorage保存キー（デフォルト: 'strata_auth'）
   */
  constructor(options = {}) {
    super();
    
    if (!options.clientId) {
      throw new Error('[GoogleOAuthAdapter] clientId is required');
    }
    
    this.clientId = options.clientId;
    this.scopes = options.scopes || ['email', 'profile'];
    this.storageKey = options.storageKey || 'strata_auth';
    
    this.state = {
      token: null,
      expiresAt: null,
      userInfo: null
    };
  }
  
  // =========================================
  // AuthAdapter実装
  // =========================================
  
  /**
   * 初期化（保存済みトークン復元）
   */
  init() {
    this.loadState();
    console.log('[GoogleOAuthAdapter] Initialized', 
      this.isAuthenticated() ? '(logged in)' : '(not logged in)');
  }
  
  /**
   * ログイン処理（Google認証ページへリダイレクト）
   */
  login() {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.getRedirectUri(),
      response_type: 'token',
      scope: this.scopes.join(' '),
      state: this.generateState(),
      prompt: 'consent'
    });
    
    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
    window.location.href = authUrl;
  }
  
  /**
   * ログアウト処理
   */
  logout() {
    this.state = {
      token: null,
      expiresAt: null,
      userInfo: null
    };
    this.saveState();
    console.log('[GoogleOAuthAdapter] Logged out');
  }
  
  /**
   * トークン取得（期限切れチェック込み）
   * @returns {string|null}
   */
  getToken() {
    if (!this.state.token) return null;
    
    // 有効期限チェック
    if (this.state.expiresAt && Date.now() > this.state.expiresAt) {
      console.log('[GoogleOAuthAdapter] Token expired');
      this.logout();
      return null;
    }
    
    return this.state.token;
  }
  
  /**
   * 認証済みか判定
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.getToken();
  }
  
  /**
   * ユーザー情報取得
   * @returns {Object|null}
   */
  getUserInfo() {
    return this.state.userInfo;
  }
  
  /**
   * 認証コールバック処理（OAuth redirect後）
   * @returns {Promise<boolean>} 認証成功したか
   */
  async handleCallback() {
    // URLのハッシュからトークンを取得
    const hash = window.location.hash;
    if (!hash || !hash.includes('access_token')) {
      return false;
    }
    
    const params = new URLSearchParams(hash.substring(1));
    const accessToken = params.get('access_token');
    const expiresIn = params.get('expires_in');
    const state = params.get('state');
    
    // state検証
    const savedState = sessionStorage.getItem('oauth_state');
    if (state !== savedState) {
      console.error('[GoogleOAuthAdapter] State mismatch');
      return false;
    }
    sessionStorage.removeItem('oauth_state');
    
    if (!accessToken) {
      return false;
    }
    
    this.state.token = accessToken;
    this.state.expiresAt = Date.now() + (parseInt(expiresIn) * 1000);
    
    // URLからハッシュを削除
    history.replaceState(null, '', window.location.pathname + window.location.search);
    
    // ユーザー情報を取得
    await this.fetchUserInfo();
    
    this.saveState();
    console.log('[GoogleOAuthAdapter] Login successful');
    
    return true;
  }
  
  // =========================================
  // 内部メソッド
  // =========================================
  
  /**
   * Google UserInfo API からユーザー情報を取得
   */
  async fetchUserInfo() {
    if (!this.state.token) return;
    
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${this.state.token}`
        }
      });
      
      if (response.ok) {
        this.state.userInfo = await response.json();
        console.log('[GoogleOAuthAdapter] User info fetched:', this.state.userInfo.email);
      }
    } catch (error) {
      console.error('[GoogleOAuthAdapter] Failed to fetch user info:', error);
    }
  }
  
  /**
   * 状態をlocalStorageに保存
   */
  saveState() {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify(this.state));
    } catch (error) {
      console.error('[GoogleOAuthAdapter] Save failed:', error);
    }
  }
  
  /**
   * localStorageから状態を復元
   */
  loadState() {
    try {
      const json = localStorage.getItem(this.storageKey);
      if (json) {
        this.state = JSON.parse(json);
      }
    } catch (error) {
      console.error('[GoogleOAuthAdapter] Load failed:', error);
    }
  }
  
  /**
   * リダイレクトURI取得
   * @returns {string}
   */
  getRedirectUri() {
    return window.location.origin + window.location.pathname;
  }
  
  /**
   * CSRF対策用state生成
   * @returns {string}
   */
  generateState() {
    const state = Math.random().toString(36).substring(2);
    sessionStorage.setItem('oauth_state', state);
    return state;
  }
  
  // =========================================
  // 追加ユーティリティ
  // =========================================
  
  /**
   * ユーザーのメールアドレス取得
   * @returns {string|null}
   */
  getUserEmail() {
    return this.state.userInfo?.email || null;
  }
}
