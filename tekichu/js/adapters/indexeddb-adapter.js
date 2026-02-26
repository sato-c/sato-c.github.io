/**
 * IndexedDBAdapter - IndexedDBを使用したストレージ実装
 * 依存: StorageAdapter
 * 
 * loadは同期インターフェースのため、init時に全データをメモリにキャッシュする。
 * save/removeは非同期でIndexedDBとキャッシュ両方を更新。
 */

import { StorageAdapter } from '../../strata/storage/storage-adapter.js';

export class IndexedDBAdapter extends StorageAdapter {
  /**
   * @param {Object} options
   * @param {string} options.dbName - データベース名（デフォルト: 'strata_db'）
   * @param {string} options.storeName - オブジェクトストア名（デフォルト: 'data'）
   * @param {string} options.prefix - キーのプレフィックス（デフォルト: ''）
   */
  constructor(options = {}) {
    super();
    this.dbName = options.dbName || 'strata_db';
    this.storeName = options.storeName || 'data';
    this.prefix = options.prefix || '';
    this.db = null;
    this.cache = new Map();
    this.initialized = false;
  }

  /**
   * 初期化（使用前に必ず呼ぶ）
   * @returns {Promise<void>}
   */
  async init() {
    if (this.initialized) return;

    // IndexedDBを開く
    this.db = await this.openDB();

    // 全データをキャッシュに読み込む
    await this.loadAllToCache();

    this.initialized = true;
    console.log(`[IndexedDBAdapter] Initialized: ${this.dbName}/${this.storeName}`);
  }

  /**
   * データベースを開く
   * @returns {Promise<IDBDatabase>}
   */
  openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);

      request.onerror = () => {
        reject(new Error(`[IndexedDBAdapter] Failed to open DB: ${request.error}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'key' });
          console.log(`[IndexedDBAdapter] Created object store: ${this.storeName}`);
        }
      };
    });
  }

  /**
   * 全データをキャッシュに読み込む
   * @returns {Promise<void>}
   */
  loadAllToCache() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();

      request.onerror = () => {
        reject(new Error(`[IndexedDBAdapter] Failed to load cache: ${request.error}`));
      };

      request.onsuccess = () => {
        this.cache.clear();
        const records = request.result || [];
        records.forEach(record => {
          // prefixでフィルタ
          if (this.prefix === '' || record.key.startsWith(this.prefix)) {
            this.cache.set(record.key, record.value);
          }
        });
        console.log(`[IndexedDBAdapter] Loaded ${this.cache.size} items to cache`);
        resolve();
      };
    });
  }

  /**
   * データ保存
   * @param {string} key - キー
   * @param {any} data - データ
   * @returns {Promise<boolean>}
   */
  async save(key, data) {
    if (!this.initialized) {
      console.error('[IndexedDBAdapter] Not initialized. Call init() first.');
      return false;
    }

    const fullKey = this.prefix + key;

    try {
      await this.putToDB(fullKey, data);
      this.cache.set(fullKey, data);
      return true;
    } catch (error) {
      console.error('[IndexedDBAdapter] Save failed:', error);
      return false;
    }
  }

  /**
   * IndexedDBに書き込む
   * @param {string} key
   * @param {any} value
   * @returns {Promise<void>}
   */
  putToDB(key, value) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.put({ key, value });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * データ読み込み（同期、キャッシュから）
   * @param {string} key - キー
   * @param {any} defaultValue - デフォルト値
   * @returns {any}
   */
  load(key, defaultValue = null) {
    if (!this.initialized) {
      console.error('[IndexedDBAdapter] Not initialized. Call init() first.');
      return defaultValue;
    }

    const fullKey = this.prefix + key;

    if (this.cache.has(fullKey)) {
      return this.cache.get(fullKey);
    }

    return defaultValue;
  }

  /**
   * データ削除
   * @param {string} key - キー
   * @returns {Promise<boolean>}
   */
  async remove(key) {
    if (!this.initialized) {
      console.error('[IndexedDBAdapter] Not initialized. Call init() first.');
      return false;
    }

    const fullKey = this.prefix + key;

    try {
      await this.deleteFromDB(fullKey);
      this.cache.delete(fullKey);
      return true;
    } catch (error) {
      console.error('[IndexedDBAdapter] Remove failed:', error);
      return false;
    }
  }

  /**
   * IndexedDBから削除
   * @param {string} key
   * @returns {Promise<void>}
   */
  deleteFromDB(key) {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  /**
   * キー一覧取得
   * @param {string} prefix - プレフィックス
   * @returns {string[]}
   */
  getAllKeys(prefix = '') {
    if (!this.initialized) {
      console.error('[IndexedDBAdapter] Not initialized. Call init() first.');
      return [];
    }

    const fullPrefix = this.prefix + prefix;
    const keys = [];

    this.cache.forEach((_, key) => {
      if (key.startsWith(fullPrefix)) {
        // this.prefix を除いたキーを返す
        keys.push(key.substring(this.prefix.length));
      }
    });

    return keys;
  }

  /**
   * データベースを閉じる
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
      console.log('[IndexedDBAdapter] Closed');
    }
  }

  /**
   * 全データ削除（デバッグ用）
   * @returns {Promise<void>}
   */
  async clearAll() {
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(this.storeName, 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.cache.clear();
        console.log('[IndexedDBAdapter] All data cleared');
        resolve();
      };
    });
  }
}
