/**
 * ErrorManager - エラー処理統一
 * 依存: NotificationManager
 */

import { NotificationManager } from './notification-manager.js';

export class ErrorManager {
  /**
   * エラーハンドリング
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - コンテキスト情報
   */
  static handle(error, context = {}) {
    try {
      this.logError(error, context);
      
      if (this.shouldNotifyUser(error)) {
        NotificationManager.error(this.getUserMessage(error));
      }
    } catch (handleError) {
      console.error('[ErrorManager] Critical error:', handleError);
    }
  }
  
  /**
   * エラーログ記録
   * @param {Error} error - エラーオブジェクト
   * @param {Object} context - コンテキスト情報
   */
  static logError(error, context) {
    console.error('[Error]', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      timestamp: new Date().toISOString()
    });
  }
  
  /**
   * ユーザー通知判断
   * @param {Error} error - エラーオブジェクト
   * @returns {boolean}
   */
  static shouldNotifyUser(error) {
    // AbortErrorは通知不要
    if (error.name === 'AbortError') return false;
    return true;
  }
  
  /**
   * ユーザー向けメッセージ取得
   * @param {Error} error - エラーオブジェクト
   * @returns {string}
   */
  static getUserMessage(error) {
    const messages = {
      'NetworkError': 'ネットワークエラーが発生しました',
      'TypeError': '予期しないエラーが発生しました',
      'AuthError': '認証に失敗しました',
      'QuotaExceededError': 'ストレージ容量が不足しています'
    };
    return messages[error.name] || 'エラーが発生しました';
  }
}
