/**
 * AuthAdapter - 認証アダプタ抽象基底クラス
 * 依存: なし
 * 
 * 具体的な認証プロバイダ実装（Google OAuth, Firebase Auth等）は
 * このクラスを継承して実装する。
 */

export class AuthAdapter {
  /**
   * 初期化（保存済みトークン復元など）
   */
  init() {
    throw new Error('Not implemented: init');
  }
  
  /**
   * ログイン処理を開始
   */
  login() {
    throw new Error('Not implemented: login');
  }
  
  /**
   * ログアウト処理
   */
  logout() {
    throw new Error('Not implemented: logout');
  }
  
  /**
   * トークン取得（期限切れチェック込み）
   * @returns {string|null}
   */
  getToken() {
    throw new Error('Not implemented: getToken');
  }
  
  /**
   * 認証済みか判定
   * @returns {boolean}
   */
  isAuthenticated() {
    throw new Error('Not implemented: isAuthenticated');
  }
  
  /**
   * ユーザー情報取得
   * @returns {Object|null}
   */
  getUserInfo() {
    throw new Error('Not implemented: getUserInfo');
  }
  
  /**
   * 認証コールバック処理（OAuth redirect後など）
   * @returns {Promise<boolean>} 認証成功したか
   */
  async handleCallback() {
    throw new Error('Not implemented: handleCallback');
  }
}
