/**
 * NotificationManager - 通知メッセージ構築
 * 依存: MessageBus, Utils
 */

import { MessageBus } from './message-bus.js';
import { Utils } from './utils.js';

export class NotificationManager {
  /**
   * 通知を表示
   * @param {string} message - メッセージ
   * @param {string} type - 'info' | 'success' | 'error' | 'warning'
   * @param {string} priority - 'low' | 'normal' | 'high'
   */
  static show(message, type = 'info', priority = 'normal') {
    const notification = {
      id: Utils.generateId('notification'),
      message,
      type,
      priority,
      timestamp: Date.now()
    };
    
    MessageBus.send({
      action: 'show-notification',
      data: notification
    });
  }
  
  /**
   * 成功通知
   * @param {string} message - メッセージ
   */
  static success(message) {
    this.show(message, 'success', 'normal');
  }
  
  /**
   * エラー通知
   * @param {string} message - メッセージ
   */
  static error(message) {
    this.show(message, 'error', 'high');
  }
  
  /**
   * 警告通知
   * @param {string} message - メッセージ
   */
  static warning(message) {
    this.show(message, 'warning', 'normal');
  }
  
  /**
   * 情報通知
   * @param {string} message - メッセージ
   */
  static info(message) {
    this.show(message, 'info', 'low');
  }
}
