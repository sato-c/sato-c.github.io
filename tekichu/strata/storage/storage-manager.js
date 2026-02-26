/**
 * StorageManager - データ永続化管理
 * 依存: StorageAdapter, MessageBus
 * 
 * Adapterを外部から注入することで、localStorage以外のストレージにも対応可能。
 * パネル状態管理はPanelManagerに移動済み。
 */

import { MessageBus } from '../core/message-bus.js';

export class StorageManager {
  static adapter = null;
  static isOnline = true;
  
  // =========================================
  // Adapter設定
  // =========================================
  
  /**
   * Adapterをセット（init前に呼ぶ）
   * @param {StorageAdapter} adapter
   */
  static setAdapter(adapter) {
    this.adapter = adapter;
  }
  
  /**
   * 現在のAdapterを取得
   * @returns {StorageAdapter|null}
   * 
   * TODO: 将来的に削除検討。アプリ側が自分でAdapter変数を保持すべき。
   */
  static getAdapter() {
    return this.adapter;
  }
  
  // =========================================
  // 初期化
  // =========================================
  
  /**
   * 初期化
   */
  static async init() {
    if (!this.adapter) {
      throw new Error('[StorageManager] Adapter not set. Call setAdapter() first.');
    }
    
    // オンライン状態監視
    window.addEventListener('online', () => this.onOnline());
    window.addEventListener('offline', () => this.onOffline());
    this.isOnline = navigator.onLine;
    
    console.log('[StorageManager] Initialized');
  }
  
  // =========================================
  // 汎用API
  // =========================================
  
  /**
   * データ保存
   * @param {string} key - キー
   * @param {any} data - データ
   * @returns {Promise<boolean>}
   */
  static async save(key, data) {
    if (!this.adapter) {
      console.error('[StorageManager] Adapter not set');
      return false;
    }
    
    const result = await this.adapter.save(key, data);
    
    // 変更を通知（SyncManager等が購読）
    if (result) {
      MessageBus.emit('storage-changed', { key, data });
    }
    
    return result;
  }
  
  /**
   * データ読み込み
   * @param {string} key - キー
   * @param {any} defaultValue - デフォルト値
   * @returns {any}
   */
  static load(key, defaultValue = null) {
    if (!this.adapter) {
      console.error('[StorageManager] Adapter not set');
      return defaultValue;
    }
    
    return this.adapter.load(key, defaultValue);
  }
  
  /**
   * データ削除
   * @param {string} key - キー
   * @returns {Promise<boolean>}
   */
  static async remove(key) {
    if (!this.adapter) {
      console.error('[StorageManager] Adapter not set');
      return false;
    }
    
    const result = await this.adapter.remove(key);
    
    // 変更を通知
    if (result) {
      MessageBus.emit('storage-changed', { key, data: null });
    }
    
    return result;
  }
  
  /**
   * 全キー取得
   * @param {string} prefix - プレフィックス
   * @returns {string[]}
   */
  static getAllKeys(prefix = '') {
    if (!this.adapter) {
      console.error('[StorageManager] Adapter not set');
      return [];
    }
    
    return this.adapter.getAllKeys(prefix);
  }
  
  // =========================================
  // オンライン/オフライン
  // =========================================
  
  static onOnline() {
    this.isOnline = true;
    console.log('[StorageManager] Online');
    MessageBus.emit('online');
  }
  
  static onOffline() {
    this.isOnline = false;
    console.log('[StorageManager] Offline');
    MessageBus.emit('offline');
  }
  
  /**
   * オンライン状態を取得
   * @returns {boolean}
   */
  static getIsOnline() {
    return this.isOnline;
  }
}
