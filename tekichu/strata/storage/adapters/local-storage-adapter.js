/**
 * LocalStorageAdapter - localStorage操作
 * 依存: StorageAdapter
 * 
 * ブラウザのlocalStorageを使用したストレージ実装。
 */

import { StorageAdapter } from '../storage-adapter.js';

export class LocalStorageAdapter extends StorageAdapter {
  /**
   * @param {Object} options
   * @param {string} options.prefix - キーのプレフィックス（デフォルト: 'strata_'）
   */
  constructor(options = {}) {
    super();
    this.prefix = options.prefix || 'strata_';
  }
  
  /**
   * データ保存
   * @param {string} key - キー
   * @param {any} data - データ
   * @returns {Promise<boolean>}
   */
  async save(key, data) {
    try {
      localStorage.setItem(this.prefix + key, JSON.stringify(data));
      return true;
    } catch (error) {
      console.error('[LocalStorageAdapter] Save failed:', error);
      return false;
    }
  }
  
  /**
   * データ読み込み
   * @param {string} key - キー
   * @param {any} defaultValue - デフォルト値
   * @returns {any}
   */
  load(key, defaultValue = null) {
    try {
      const data = localStorage.getItem(this.prefix + key);
      if (data === null) {
        return defaultValue;
      }
      // JSON としてパース試行
      try {
        return JSON.parse(data);
      } catch {
        // JSON でなければ生の値を返す
        return data;
      }
    } catch (error) {
      console.error('[LocalStorageAdapter] Load failed:', error);
      return defaultValue;
    }
  }
  
  /**
   * データ削除
   * @param {string} key - キー
   * @returns {Promise<boolean>}
   */
  async remove(key) {
    try {
      localStorage.removeItem(this.prefix + key);
      return true;
    } catch (error) {
      console.error('[LocalStorageAdapter] Remove failed:', error);
      return false;
    }
  }
  
  /**
   * キー一覧取得
   * @param {string} prefix - プレフィックス
   * @returns {string[]}
   */
  getAllKeys(prefix = '') {
    const keys = [];
    const fullPrefix = this.prefix + prefix;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(fullPrefix)) {
        // this.prefix を除いたキーを返す
        keys.push(key.substring(this.prefix.length));
      }
    }
    return keys;
  }
}
