/**
 * ErrorManager - centralized error handling and user messaging.
 */

import { NotificationManager } from './notification-manager.js';
import { I18n } from './i18n.js';

export class ErrorManager {
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

  static logError(error, context) {
    console.error('[Error]', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      context,
      timestamp: new Date().toISOString()
    });
  }

  static shouldNotifyUser(error) {
    if (error.name === 'AbortError') return false;
    return true;
  }

  static getUserMessage(error) {
    const messages = {
      NetworkError: I18n.t('error.network'),
      TypeError: I18n.t('error.type'),
      AuthError: I18n.t('error.auth'),
      QuotaExceededError: I18n.t('error.quotaExceeded')
    };
    return messages[error.name] || I18n.t('common.unknownError');
  }
}

