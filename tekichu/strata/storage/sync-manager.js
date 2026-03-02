/**
 * sync-manager.js - backup and restore orchestration.
 */

import { StorageManager } from './storage-manager.js';
import { AuthManager } from '../auth/auth-manager.js';
import { MessageBus } from '../core/message-bus.js';
import { NotificationManager } from '../core/notification-manager.js';
import { I18n } from '../core/i18n.js';

export class SyncManager {
  static adapter = null;
  static isSyncing = false;

  static STORAGE_KEY = 'sync:backup';

  static setAdapter(adapter) {
    this.adapter = adapter;
  }

  static init() {
    console.log('[SyncManager] Initialized');
  }

  static async backup(data) {
    if (this.isSyncing) {
      NotificationManager.warning(I18n.t('sync.inProgress'));
      return false;
    }

    if (!this.adapter) {
      NotificationManager.error(I18n.t('sync.adapterNotConfigured'));
      return false;
    }

    if (!AuthManager.isAuthenticated()) {
      NotificationManager.error(I18n.t('sync.loginRequired'));
      return false;
    }

    this.isSyncing = true;
    MessageBus.emit('sync-start', { action: 'backup' });

    try {
      const token = AuthManager.getToken();
      const backupData = {
        data,
        savedAt: Date.now()
      };

      const localSaved = await StorageManager.save(this.STORAGE_KEY, backupData);
      if (!localSaved) {
        throw new Error('[SyncManager] Failed to persist local backup');
      }

      const remoteSaved = await this.adapter.save(backupData, token);
      if (!remoteSaved) {
        throw new Error('[SyncManager] Remote backup save returned false');
      }

      NotificationManager.success(I18n.t('sync.backupSuccess'));
      MessageBus.emit('sync-complete', { action: 'backup', success: true });
      return true;
    } catch (error) {
      console.error('[SyncManager] Backup failed:', error);
      NotificationManager.error(I18n.t('sync.backupFailed'));
      MessageBus.emit('sync-complete', { action: 'backup', success: false, error });
      return false;
    } finally {
      this.isSyncing = false;
    }
  }

  static async restore() {
    if (this.isSyncing) {
      NotificationManager.warning(I18n.t('sync.inProgress'));
      return null;
    }

    if (!this.adapter) {
      NotificationManager.error(I18n.t('sync.adapterNotConfigured'));
      return null;
    }

    if (!AuthManager.isAuthenticated()) {
      NotificationManager.error(I18n.t('sync.loginRequired'));
      return null;
    }

    this.isSyncing = true;
    MessageBus.emit('sync-start', { action: 'restore' });

    try {
      const token = AuthManager.getToken();
      const backupData = await this.adapter.load(token);

      if (!backupData) {
        NotificationManager.info(I18n.t('sync.restoreNoData'));
        MessageBus.emit('sync-complete', { action: 'restore', success: true, empty: true });
        return null;
      }

      const localData = {
        ...backupData,
        restoredAt: Date.now()
      };

      const localSaved = await StorageManager.save(this.STORAGE_KEY, localData);
      if (!localSaved) {
        throw new Error('[SyncManager] Failed to persist restored backup');
      }

      NotificationManager.success(I18n.t('sync.restoreSuccess'));
      MessageBus.emit('sync-complete', { action: 'restore', success: true });
      return backupData.data;
    } catch (error) {
      console.error('[SyncManager] Restore failed:', error);
      NotificationManager.error(I18n.t('sync.restoreFailed'));
      MessageBus.emit('sync-complete', { action: 'restore', success: false, error });
      return null;
    } finally {
      this.isSyncing = false;
    }
  }

  static getIsSyncing() {
    return this.isSyncing;
  }

  static getLastBackup() {
    return StorageManager.load(this.STORAGE_KEY);
  }

  static async clearLocalBackup() {
    return await StorageManager.remove(this.STORAGE_KEY);
  }
}

