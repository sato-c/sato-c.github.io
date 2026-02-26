/**
 * STRATA SDK - Entry Point
 * 
 * Webアプリケーション向け汎用SDKライブラリ
 */

// ===========================================
// Core
// ===========================================
export { Utils } from './core/utils.js';
export { MessageBus } from './core/message-bus.js';
export { NotificationManager } from './core/notification-manager.js';
export { ErrorManager } from './core/error-manager.js';

// ===========================================
// Storage
// ===========================================
export { StorageAdapter } from './storage/storage-adapter.js';
export { StorageManager } from './storage/storage-manager.js';
export { LocalStorageAdapter } from './storage/adapters/local-storage-adapter.js';

// ===========================================
// Auth
// ===========================================
export { AuthAdapter } from './auth/auth-adapter.js';
export { AuthManager } from './auth/auth-manager.js';
export { GoogleOAuthAdapter } from './auth/adapters/google-oauth-adapter.js';

// ===========================================
// UI
// ===========================================
export { SystemUIManager } from './ui/system-ui-manager.js';
export { PanelManager } from './ui/panel-manager.js';

// ===========================================
// API
// ===========================================
export { APIManager } from './api/api-manager.js';

// ===========================================
// Sync
// ===========================================
export { SyncAdapter } from './storage/sync-adapter.js';
export { SyncManager } from './storage/sync-manager.js';
