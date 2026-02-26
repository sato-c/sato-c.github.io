/**
 * SyncManager - バックアップ/復元管理
 * 依存: StorageManager, AuthManager, MessageBus, NotificationManager
 * 
 * データの中身には関与しない。アプリから渡されたデータを
 * ローカル+リモートに保存し、復元時はそのまま返す。
 * 
 * - backup(data): ローカル+リモートに保存
 * - restore(): リモートから復元して返す
 * - getLastBackup(): 最後のバックアップ情報
 */

import { StorageManager } from './storage-manager.js';
import { AuthManager } from '../auth/auth-manager.js';
import { MessageBus } from '../core/message-bus.js';
import { NotificationManager } from '../core/notification-manager.js';

export class SyncManager {
  static adapter = null;
  static isSyncing = false;
  
  static STORAGE_KEY = 'sync:backup';
  
  // =========================================
  // Adapter設定
  // =========================================
  
  /**
   * Adapterをセット
   * @param {SyncAdapter} adapter
   */
  static setAdapter(adapter) {
    this.adapter = adapter;
  }
  
  // =========================================
  // 初期化
  // =========================================
  
  static init() {
    console.log('[SyncManager] Initialized');
  }
  
  // =========================================
  // バックアップ
  // =========================================
  
  /**
   * バックアップ（ローカル+リモート）
   * @param {any} data - アプリが用意したバックアップデータ
   * @returns {Promise<boolean>} 成功/失敗
   */
  static async backup(data) {
    if (this.isSyncing) {
      NotificationManager.warning('同期中です');
      return false;
    }
    
    if (!this.adapter) {
      NotificationManager.error('同期アダプタが設定されていません');
      return false;
    }
    
    if (!AuthManager.isAuthenticated()) {
      NotificationManager.error('ログインが必要です');
      return false;
    }
    
    this.isSyncing = true;
    MessageBus.emit('sync-start', { action: 'backup' });
    
    try {
      const token = AuthManager.getToken();
      
      // メタ情報を付与
      const backupData = {
        data,
        savedAt: Date.now()
      };
      
      // ローカルに保存
      await StorageManager.save(this.STORAGE_KEY, backupData);
      
      // リモートに保存
      await this.adapter.save(backupData, token);
      
      NotificationManager.success('バックアップ完了');
      MessageBus.emit('sync-complete', { action: 'backup', success: true });
      
      return true;
      
    } catch (error) {
      console.error('[SyncManager] Backup failed:', error);
      NotificationManager.error('バックアップに失敗しました');
      MessageBus.emit('sync-complete', { action: 'backup', success: false, error });
      
      return false;
      
    } finally {
      this.isSyncing = false;
    }
  }
  
  // =========================================
  // 復元
  // =========================================
  
  /**
   * 復元（リモートから取得）
   * @returns {Promise<any|null>} アプリのバックアップデータ、失敗時null
   */
  static async restore() {
    if (this.isSyncing) {
      NotificationManager.warning('同期中です');
      return null;
    }
    
    if (!this.adapter) {
      NotificationManager.error('同期アダプタが設定されていません');
      return null;
    }
    
    if (!AuthManager.isAuthenticated()) {
      NotificationManager.error('ログインが必要です');
      return null;
    }
    
    this.isSyncing = true;
    MessageBus.emit('sync-start', { action: 'restore' });
    
    try {
      const token = AuthManager.getToken();
      
      // リモートから取得
      const backupData = await this.adapter.load(token);
      
      if (!backupData) {
        NotificationManager.info('バックアップデータがありません');
        MessageBus.emit('sync-complete', { action: 'restore', success: true, empty: true });
        return null;
      }
      
      // ローカルにも保存（キャッシュ）
      const localData = {
        ...backupData,
        restoredAt: Date.now()
      };
      await StorageManager.save(this.STORAGE_KEY, localData);
      
      NotificationManager.success('復元完了');
      MessageBus.emit('sync-complete', { action: 'restore', success: true });
      
      // アプリのデータ部分だけ返す
      return backupData.data;
      
    } catch (error) {
      console.error('[SyncManager] Restore failed:', error);
      NotificationManager.error('復元に失敗しました');
      MessageBus.emit('sync-complete', { action: 'restore', success: false, error });
      
      return null;
      
    } finally {
      this.isSyncing = false;
    }
  }
  
  // =========================================
  // 状態取得
  // =========================================
  
  /**
   * 同期中か判定
   * @returns {boolean}
   */
  static getIsSyncing() {
    return this.isSyncing;
  }
  
  /**
   * 最後のバックアップ情報を取得
   * @returns {Object|null} { data, savedAt, restoredAt? }
   */
  static getLastBackup() {
    return StorageManager.load(this.STORAGE_KEY);
  }
  
  /**
   * ローカルのバックアップキャッシュを削除
   * @returns {Promise<boolean>}
   */
  static async clearLocalBackup() {
    return await StorageManager.remove(this.STORAGE_KEY);
  }
}
