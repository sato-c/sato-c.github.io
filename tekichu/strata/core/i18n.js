/**
 * I18n - minimal locale resource manager.
 * Default locale is Japanese.
 */

const resources = {
  ja: {
    common: {
      unknownError: 'エラーが発生しました'
    },
    ui: {
      common: {
        ok: 'OK',
        cancel: 'キャンセル',
        closeSymbol: '×'
      },
      panel: {
        refreshSymbol: '↻',
        refreshTitle: '更新',
        maximizeSymbol: '□',
        maximizeTitle: '最大化',
        closeTitle: '閉じる'
      },
      system: {
        confirmTitle: '確認',
        inputTitle: '入力',
        selectTitle: '選択',
        noItems: 'アイテムがありません'
      }
    },
    auth: {
      loginSuccess: 'ログインしました',
      adapterNotConfigured: '認証が設定されていません',
      logoutSuccess: 'ログアウトしました'
    },
    sync: {
      inProgress: '同期中です',
      adapterNotConfigured: '同期アダプタが設定されていません',
      loginRequired: 'ログインが必要です',
      backupSuccess: 'バックアップ完了',
      backupFailed: 'バックアップに失敗しました',
      restoreNoData: 'バックアップデータがありません',
      restoreSuccess: '復元完了',
      restoreFailed: '復元に失敗しました'
    },
    error: {
      network: 'ネットワークエラーが発生しました',
      type: '予期しないエラーが発生しました',
      auth: '認証に失敗しました',
      quotaExceeded: 'ストレージ容量が上限に達しました'
    }
  },
  en: {
    common: {
      unknownError: 'An error occurred'
    },
    ui: {
      common: {
        ok: 'OK',
        cancel: 'Cancel',
        closeSymbol: '×'
      },
      panel: {
        refreshSymbol: '↻',
        refreshTitle: 'Refresh',
        maximizeSymbol: '□',
        maximizeTitle: 'Maximize',
        closeTitle: 'Close'
      },
      system: {
        confirmTitle: 'Confirm',
        inputTitle: 'Input',
        selectTitle: 'Select',
        noItems: 'No items'
      }
    },
    auth: {
      loginSuccess: 'Logged in',
      adapterNotConfigured: 'Authentication is not configured',
      logoutSuccess: 'Logged out'
    },
    sync: {
      inProgress: 'Sync is already in progress',
      adapterNotConfigured: 'Sync adapter is not configured',
      loginRequired: 'Login is required',
      backupSuccess: 'Backup completed',
      backupFailed: 'Backup failed',
      restoreNoData: 'No backup data found',
      restoreSuccess: 'Restore completed',
      restoreFailed: 'Restore failed'
    },
    error: {
      network: 'A network error occurred',
      type: 'An unexpected error occurred',
      auth: 'Authentication failed',
      quotaExceeded: 'Storage quota has been exceeded'
    }
  }
};

function getByPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc && key in acc ? acc[key] : undefined), obj);
}

export class I18n {
  static locale = 'ja';
  static fallbackLocale = 'ja';

  static setLocale(locale) {
    if (resources[locale]) {
      this.locale = locale;
      return true;
    }
    return false;
  }

  static getLocale() {
    return this.locale;
  }

  static t(key, vars = null, fallback = key) {
    const localized = getByPath(resources[this.locale], key);
    const fallbackValue = getByPath(resources[this.fallbackLocale], key);
    let text = localized ?? fallbackValue ?? fallback;
    if (vars && typeof text === 'string') {
      for (const [varKey, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${varKey}}`, String(value));
      }
    }
    return text;
  }
}
