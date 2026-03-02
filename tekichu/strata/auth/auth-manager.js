/**
 * auth-manager.js - manager module.
 */

import { NotificationManager } from '../core/notification-manager.js';
import { MessageBus } from '../core/message-bus.js';
import { I18n } from '../core/i18n.js';

export class AuthManager {
  static adapter = null;
  static initialized = false;

  static setAdapter(adapter) {
    this.adapter = adapter;
  }

  static async init() {
    if (this.initialized) {
      return;
    }

    if (!this.adapter) {
      throw new Error('[AuthManager] Adapter not set. Call setAdapter() first.');
    }

    this.adapter.init();
    const callbackResult = await this.adapter.handleCallback();

    if (callbackResult) {
      NotificationManager.success(I18n.t('auth.loginSuccess'));
      MessageBus.emit('auth-changed', { authenticated: true });
    }

    this.initialized = true;
    console.log(
      '[AuthManager] Initialized',
      this.isAuthenticated() ? '(logged in)' : '(not logged in)'
    );
  }

  static login() {
    if (!this.adapter) {
      NotificationManager.error(I18n.t('auth.adapterNotConfigured'));
      return;
    }

    this.adapter.login();
  }

  static logout() {
    if (!this.adapter) {
      return;
    }

    this.adapter.logout();
    MessageBus.emit('auth-changed', { authenticated: false });
    NotificationManager.info(I18n.t('auth.logoutSuccess'));
  }

  static getToken() {
    if (!this.adapter) return null;
    return this.adapter.getToken();
  }

  static isAuthenticated() {
    if (!this.adapter) return false;
    return this.adapter.isAuthenticated();
  }

  static getUserInfo() {
    if (!this.adapter) return null;
    return this.adapter.getUserInfo();
  }

  static destroy() {
    this.initialized = false;
  }
}

