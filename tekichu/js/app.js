/**
 * App - TEKICHU エントリーポイント
 * STRATA SDK初期化とビュー管理
 */

import {
  StorageManager,
  MessageBus,
  SystemUIManager,
  NotificationManager,
} from '../strata/index.js';

import { IndexedDBAdapter } from './adapters/indexeddb-adapter.js';
import { NAV_ITEMS, APP_CONFIG } from './constants.js';
import { DataService } from './services/data-service.js';
import { InputView } from './views/input-view.js';
import { ListView } from './views/list-view.js';
import { StatsView } from './views/stats-view.js';
import { SettingsView } from './views/settings-view.js';

class App {
  static currentView = 'input';
  static views = {};

  /**
   * 初期化
   */
  static async init() {
    console.log('[App] Initializing...');

    try {
      // STRATA SDK初期化
      await this.initSTRATA();

      // 初期データ設定
      await DataService.initDefaultData();

      // DOM構築
      this.buildUI();

      // ビュー初期化
      this.initViews();

      // イベント購読
      this.subscribeEvents();

      // 初期表示
      this.navigate('input');

      console.log('[App] Ready');
    } catch (error) {
      console.error('[App] Init failed:', error);
    }
  }

  /**
   * STRATA SDK初期化
   */
  static async initSTRATA() {
    // StorageManager（IndexedDB使用）
    const adapter = new IndexedDBAdapter({
      dbName: 'tekichu_db',
      storeName: 'data',
      prefix: 'tekichu_',
    });
    await adapter.init();
    StorageManager.setAdapter(adapter);
    await StorageManager.init();

    // SystemUIManager（通知表示用）
    SystemUIManager.init();

    console.log('[App] STRATA initialized (IndexedDB)');
  }

  /**
   * UI構築
   */
  static buildUI() {
    const app = document.getElementById('app');
    app.innerHTML = '';
    app.className = 'app';

    // ヘッダー
    const header = document.createElement('header');
    header.className = 'app-header';
    header.id = 'app-header';
    header.textContent = APP_CONFIG.DEFAULT_TITLE;
    app.appendChild(header);

    document.title = APP_CONFIG.DEFAULT_TITLE;

    // コンテンツエリア
    const content = document.createElement('main');
    content.className = 'app-content';
    content.id = 'app-content';
    app.appendChild(content);

    // ボトムナビ
    const nav = this.createBottomNav();
    app.appendChild(nav);
  }

  /**
   * ボトムナビゲーション作成
   */
  static createBottomNav() {
    const nav = document.createElement('nav');
    nav.className = 'bottom-nav';

    NAV_ITEMS.forEach(item => {
      const btn = document.createElement('div');
      btn.className = 'nav-item';
      btn.dataset.view = item.id;

      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = item.icon;
      btn.appendChild(icon);

      const label = document.createElement('span');
      label.textContent = item.label;
      btn.appendChild(label);

      btn.addEventListener('click', () => this.navigate(item.id));

      nav.appendChild(btn);
    });

    return nav;
  }

  /**
   * ビュー初期化
   */
  static initViews() {
    const content = document.getElementById('app-content');

    this.views = {
      input: InputView,
      list: ListView,
      stats: StatsView,
      settings: SettingsView,
    };

    Object.values(this.views).forEach(view => {
      if (view.init) {
        view.init(content);
      }
    });
  }

  /**
   * イベント購読
   */
  static subscribeEvents() {
    MessageBus.on('navigate', (data) => {
      this.navigate(data.view, data);
    });

    MessageBus.on('record-saved', () => {
      if (this.currentView === 'list') {
        this.views.list.render();
      }
    });

    MessageBus.on('record-deleted', () => {
      if (this.currentView === 'list') {
        this.views.list.render();
      }
    });
  }

  /**
   * ナビゲーション
   */
  static navigate(viewId, data = {}) {
    const currentViewInstance = this.views[this.currentView];
    if (currentViewInstance?.hide) {
      currentViewInstance.hide();
    }

    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.toggle('active', item.dataset.view === viewId);
    });

    this.currentView = viewId;
    const nextView = this.views[viewId];

    if (nextView) {
      if (data.record && nextView.editRecord) {
        nextView.editRecord(data.record);
      } else if (nextView.show) {
        nextView.show();
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => App.init());
