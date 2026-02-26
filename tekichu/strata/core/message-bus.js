/**
 * MessageBus - モジュール間通信
 * 依存: なし
 */

export class MessageBus {
  static listeners = {};
  
  /**
   * イベント購読
   * @param {string} action - アクション名
   * @param {Function} callback - コールバック関数
   */
  static on(action, callback) {
    if (!this.listeners[action]) {
      this.listeners[action] = [];
    }
    this.listeners[action].push(callback);
  }
  
  /**
   * イベント購読解除
   * @param {string} action - アクション名
   * @param {Function} callback - コールバック関数
   */
  static off(action, callback) {
    if (!this.listeners[action]) return;
    this.listeners[action] = this.listeners[action].filter(cb => cb !== callback);
  }
  
  /**
   * イベント送信
   * @param {Object} intent - { action: string, data: any }
   */
  static send(intent) {
    const callbacks = this.listeners[intent.action] || [];
    callbacks.forEach(callback => {
      try {
        callback(intent.data);
      } catch (error) {
        console.error('[MessageBus] Callback error:', {
          action: intent.action,
          error: error.message
        });
      }
    });
  }
  
  /**
   * イベント送信（emit形式）
   * @param {string} action - アクション名
   * @param {any} data - データ
   */
  static emit(action, data = null) {
    this.send({ action, data });
  }
  
  /**
   * 全リスナー解除
   */
  static clear() {
    this.listeners = {};
  }
}
