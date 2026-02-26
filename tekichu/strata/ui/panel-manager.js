/**
 * PanelManager - パネル管理
 * 依存: StorageManager, Utils, ErrorManager, MessageBus
 * 
 * フローティングパネルのDOM生成・ドラッグ・リサイズを管理。
 * init(options)で設定を外部注入（CONFIG依存を排除）。
 */

import { StorageManager } from '../storage/storage-manager.js';
import { Utils } from '../core/utils.js';
import { ErrorManager } from '../core/error-manager.js';
import { MessageBus } from '../core/message-bus.js';

export class PanelManager {
  // =========================================
  // 状態
  // =========================================
  
  static panels = new Map();
  static saveStateTimers = {};
  
  // [STRATA変更] CONFIG依存を排除、init(options)で設定
  static options = {
    zIndexMin: 11,
    zIndexMax: 80,
    minWidth: 200,
    minHeight: 150,
    saveDelay: 3000,
    containerId: 'panel-container'
  };
  static currentZIndex = 11;
  
  // =========================================
  // 初期化
  // =========================================
  
  /**
   * 初期化
   * @param {Object} options
   * @param {number} options.zIndexMin - z-index最小値（デフォルト: 11）
   * @param {number} options.zIndexMax - z-index最大値（デフォルト: 80）
   * @param {number} options.minWidth - パネル最小幅（デフォルト: 200）
   * @param {number} options.minHeight - パネル最小高さ（デフォルト: 150）
   * @param {number} options.saveDelay - 保存遅延ms（デフォルト: 3000）
   * @param {string} options.containerId - コンテナID（デフォルト: 'panel-container'）
   */
  static init(options = {}) {
    this.options = { ...this.options, ...options };
    this.currentZIndex = this.options.zIndexMin;
    
    // コンテナ確認
    if (!document.getElementById(this.options.containerId)) {
      const container = document.createElement('div');
      container.id = this.options.containerId;
      document.body.appendChild(container);
    }
    
    // 保存リクエスト購読
    MessageBus.on('request-save', ({ panelId }) => {
      this.scheduleSaveState(panelId);
    });
    
    // 即時保存リクエスト購読
    MessageBus.on('request-save-immediate', ({ panelId }) => {
      this.saveState(panelId);
    });
    
    console.log('[PanelManager] Initialized');
  }
  
  // =========================================
  // パネル作成
  // =========================================
  
  /**
   * パネルを作成
   * @param {Object} panelConfig - パネル設定
   * @param {string} panelConfig.id - パネル識別子
   * @param {string} panelConfig.title - タイトル
   * @param {string} panelConfig.storageKey - 状態保存用キー
   * @param {boolean} panelConfig.singleton - true: 同じidは1つのみ
   * @param {string} panelConfig.modulePath - モジュールのパス
   * @param {string} panelConfig.className - モジュールのクラス名
   * @param {boolean} panelConfig.showTitle - タイトル表示
   * @param {boolean} panelConfig.showClose - 閉じるボタン表示
   * @param {boolean} panelConfig.showRefresh - 更新ボタン表示
   * @param {boolean} panelConfig.showMaximize - 最大化ボタン表示
   * @param {boolean} panelConfig.draggable - ドラッグ可能
   * @param {boolean} panelConfig.resizable - リサイズ可能
   * @param {boolean} panelConfig.overlay - オーバーレイ表示
   * @param {Object} panelConfig.defaultPosition - { left, top }
   * @param {Object} panelConfig.defaultSize - { width, height }
   * @param {Object} savedState - 復元時の保存済み状態
   * @returns {Promise<string>} panelId
   */
  static async createPanel(panelConfig, savedState = null) {
    try {
      // Singleton重複チェック
      if (panelConfig.singleton) {
        const existing = this.findPanelByConfigId(panelConfig.id);
        if (existing) {
          this.bringToFront(existing);
          return existing;
        }
      }
      
      // パネルID生成
      const panelId = Utils.generateId('panel');
      
      // インスタンスID（複数インスタンス用）
      let instanceId = null;
      if (!panelConfig.singleton) {
        instanceId = savedState?.instanceId || Utils.generateId(panelConfig.id);
      }
      
      // 位置・サイズ決定
      const position = savedState?.position || this.getOffsetPosition(panelConfig);
      const size = savedState?.size || { ...panelConfig.defaultSize };
      
      // パネルDOM生成
      const element = this.createPanelElement(panelId, panelConfig, position, size);
      
      // オーバーレイ（必要なら）
      let overlay = null;
      if (panelConfig.overlay) {
        overlay = this.createOverlay();
        document.getElementById(this.options.containerId).appendChild(overlay);
      }
      
      // コンテナに追加
      document.getElementById(this.options.containerId).appendChild(element);
      
      // z-index設定
      element.style.zIndex = this.currentZIndex++;
      
      // [STRATA変更] modulePathはアプリ側が正しいパスを渡す
      const module = await import(panelConfig.modulePath);
      const ModuleClass = module[panelConfig.className];
      const instance = new ModuleClass();
      
      // コンテンツエリア取得
      const container = element.querySelector('.panel-content');
      
      // モジュール初期化（panelIdを渡す）
      await instance.init(container, panelConfig, panelId);
      
      // 保存データ復元
      if (savedState?.data && typeof instance.setData === 'function') {
        instance.setData(savedState.data);
      }
      
      // PanelEntry登録
      this.panels.set(panelId, {
        element,
        instance,
        config: panelConfig,
        overlay,
        instanceId
      });
      
      // ドラッグ・リサイズ設定
      if (panelConfig.draggable) {
        this.makeDraggable(panelId);
      }
      if (panelConfig.resizable) {
        this.makeResizable(panelId);
      }
      
      // イベントリスナー設定
      this.setupPanelEventListeners(panelId);
      
      // onShow呼び出し
      if (typeof instance.onShow === 'function') {
        instance.onShow();
      }
      
      // 新規作成時は即時保存（復元時は不要）
      if (!savedState) {
        await this.saveState(panelId);
      }
      
      console.log(`[PanelManager] Created panel: ${panelId} (${panelConfig.id})`);
      return panelId;
      
    } catch (error) {
      ErrorManager.handle(error, { 
        module: 'PanelManager', 
        action: 'createPanel', 
        config: panelConfig.id 
      });
      throw error;
    }
  }
  
  /**
   * 複数インスタンス時の位置オフセット
   */
  static getOffsetPosition(config) {
    const existingCount = this.countPanelsByConfigId(config.id);
    const offset = existingCount * 30;
    return {
      left: config.defaultPosition.left + offset,
      top: config.defaultPosition.top + offset
    };
  }
  
  /**
   * 同じconfigIdのパネル数をカウント
   */
  static countPanelsByConfigId(configId) {
    let count = 0;
    for (const entry of this.panels.values()) {
      if (entry.config.id === configId) count++;
    }
    return count;
  }
  
  // =========================================
  // パネル削除
  // =========================================
  
  /**
   * パネルを閉じる
   * @param {string} panelId
   */
  static async closePanel(panelId) {
    const entry = this.panels.get(panelId);
    if (!entry) return;
    
    try {
      // onHide呼び出し
      if (typeof entry.instance.onHide === 'function') {
        entry.instance.onHide();
      }
      
      // 状態保存（閉じる前に保存）
      await this.saveState(panelId);
      
      // destroy呼び出し
      if (typeof entry.instance.destroy === 'function') {
        entry.instance.destroy();
      }
      
      // クリーンアップ
      if (entry._dragCleanup) entry._dragCleanup();
      if (entry._resizeCleanup) entry._resizeCleanup();
      
      // タイマークリア
      if (this.saveStateTimers[panelId]) {
        clearTimeout(this.saveStateTimers[panelId]);
        delete this.saveStateTimers[panelId];
      }
      
      // オーバーレイ削除
      if (entry.overlay) {
        entry.overlay.remove();
      }
      
      // パネルDOM削除
      entry.element.remove();
      
      // 登録解除
      this.panels.delete(panelId);
      
      console.log(`[PanelManager] Closed panel: ${panelId}`);
      
    } catch (error) {
      ErrorManager.handle(error, { 
        module: 'PanelManager', 
        action: 'closePanel', 
        panelId 
      });
    }
  }
  
  // =========================================
  // z-index管理
  // =========================================
  
  /**
   * パネルを最前面に
   * @param {string} panelId
   */
  static bringToFront(panelId) {
    if (this.currentZIndex >= this.options.zIndexMax) {
      this.recalculateZIndexes();
    }
    
    const entry = this.panels.get(panelId);
    if (!entry) return;
    
    entry.element.style.zIndex = this.currentZIndex++;
  }
  
  /**
   * z-indexを再計算
   */
  static recalculateZIndexes() {
    // 現在のz-index順にソート
    const sorted = [...this.panels.entries()]
      .sort((a, b) => {
        const zA = parseInt(a[1].element.style.zIndex) || 0;
        const zB = parseInt(b[1].element.style.zIndex) || 0;
        return zA - zB;
      });
    
    // zIndexMinから振り直し
    this.currentZIndex = this.options.zIndexMin;
    sorted.forEach(([panelId, entry]) => {
      entry.element.style.zIndex = this.currentZIndex++;
    });
  }
  
  // =========================================
  // DOM生成
  // =========================================
  
  static createPanelElement(panelId, config, position, size) {
    const panel = document.createElement('div');
    panel.id = panelId;
    panel.className = 'panel';
    panel.dataset.configId = config.id;
    
    panel.style.left = `${position.left}px`;
    panel.style.top = `${position.top}px`;
    panel.style.width = `${size.width}px`;
    panel.style.height = `${size.height}px`;
    
    // ヘッダー
    const header = document.createElement('div');
    header.className = 'panel-header';
    
    // タイトル
    if (config.showTitle !== false) {
      const title = document.createElement('span');
      title.className = 'panel-header__title';
      title.textContent = config.title || '';
      header.appendChild(title);
    }
    
    // ボタンコンテナ
    const buttons = document.createElement('div');
    buttons.className = 'panel-header__buttons';
    
    // 更新ボタン
    if (config.showRefresh) {
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'panel-btn panel-btn--refresh';
      refreshBtn.textContent = '↻';
      refreshBtn.title = '更新';
      buttons.appendChild(refreshBtn);
    }
    
    // 最大化ボタン
    if (config.showMaximize) {
      const maxBtn = document.createElement('button');
      maxBtn.className = 'panel-btn panel-btn--maximize';
      maxBtn.textContent = '□';
      maxBtn.title = '最大化';
      buttons.appendChild(maxBtn);
    }
    
    // 閉じるボタン
    if (config.showClose !== false) {
      const closeBtn = document.createElement('button');
      closeBtn.className = 'panel-btn panel-btn--close';
      closeBtn.textContent = '×';
      closeBtn.title = '閉じる';
      buttons.appendChild(closeBtn);
    }
    
    header.appendChild(buttons);
    panel.appendChild(header);
    
    // コンテンツエリア
    const content = document.createElement('div');
    content.className = 'panel-content';
    panel.appendChild(content);
    
    // リサイズハンドル
    if (config.resizable) {
      const resizeHandle = document.createElement('div');
      resizeHandle.className = 'panel-resize-handle';
      panel.appendChild(resizeHandle);
    }
    
    return panel;
  }
  
  static createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'panel-overlay';
    overlay.style.zIndex = String(this.currentZIndex - 1);
    return overlay;
  }
  
  // =========================================
  // ドラッグ
  // =========================================
  
  static makeDraggable(panelId) {
    const entry = this.panels.get(panelId);
    if (!entry) return;
    
    const panel = entry.element;
    const header = panel.querySelector('.panel-header');
    if (!header) return;
    
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;
    
    const onStart = (e) => {
      // ボタンクリックは無視
      if (e.target.closest('.panel-btn')) return;
      
      isDragging = true;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      startX = clientX;
      startY = clientY;
      initialLeft = panel.offsetLeft;
      initialTop = panel.offsetTop;
      
      this.bringToFront(panelId);
      panel.classList.add('panel--dragging');
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
    };
    
    const onMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      
      panel.style.transform = '';
      panel.style.left = `${initialLeft + deltaX}px`;
      panel.style.top = `${initialTop + deltaY}px`;
    };
    
    const onEnd = () => {
      if (!isDragging) return;
      
      isDragging = false;
      panel.classList.remove('panel--dragging');
      
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      
      this.constrainToViewport(panelId);
      this.scheduleSaveState(panelId);
    };
    
    header.addEventListener('mousedown', onStart);
    header.addEventListener('touchstart', onStart, { passive: true });
    
    entry._dragCleanup = () => {
      header.removeEventListener('mousedown', onStart);
      header.removeEventListener('touchstart', onStart);
    };
  }
  
  // =========================================
  // リサイズ
  // =========================================
  
  static makeResizable(panelId) {
    const entry = this.panels.get(panelId);
    if (!entry) return;
    
    const panel = entry.element;
    const handle = panel.querySelector('.panel-resize-handle');
    if (!handle) return;
    
    let isResizing = false;
    let startX, startY, initialWidth, initialHeight;
    
    const onStart = (e) => {
      isResizing = true;
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      startX = clientX;
      startY = clientY;
      initialWidth = panel.offsetWidth;
      initialHeight = panel.offsetHeight;
      
      panel.classList.add('panel--resizing');
      
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onEnd);
      document.addEventListener('touchmove', onMove, { passive: false });
      document.addEventListener('touchend', onEnd);
      
      e.preventDefault();
      e.stopPropagation();
    };
    
    const onMove = (e) => {
      if (!isResizing) return;
      e.preventDefault();
      
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      
      const deltaX = clientX - startX;
      const deltaY = clientY - startY;
      
      // [STRATA変更] CONFIG依存を排除
      const minWidth = this.options.minWidth;
      const minHeight = this.options.minHeight;
      
      const newWidth = Math.max(minWidth, initialWidth + deltaX);
      const newHeight = Math.max(minHeight, initialHeight + deltaY);
      
      panel.style.width = `${newWidth}px`;
      panel.style.height = `${newHeight}px`;
      
      if (typeof entry.instance.onResize === 'function') {
        entry.instance.onResize(newWidth, newHeight);
      }
    };
    
    const onEnd = () => {
      if (!isResizing) return;
      
      isResizing = false;
      panel.classList.remove('panel--resizing');
      
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      
      this.scheduleSaveState(panelId);
    };
    
    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: false });
    
    entry._resizeCleanup = () => {
      handle.removeEventListener('mousedown', onStart);
      handle.removeEventListener('touchstart', onStart);
    };
  }
  
  // =========================================
  // 境界チェック
  // =========================================
  
  static constrainToViewport(panelId) {
    const entry = this.panels.get(panelId);
    if (!entry) return;
    
    const panel = entry.element;
    const header = panel.querySelector('.panel-header');
    const headerHeight = header ? header.offsetHeight : 40;
    
    const rect = panel.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    
    let left = panel.offsetLeft;
    let top = panel.offsetTop;
    
    // 左端
    if (rect.right < 50) {
      left = 50 - rect.width;
    }
    // 右端
    if (rect.left > vw - 50) {
      left = vw - 50;
    }
    // 上端
    if (rect.top < 0) {
      top = 0;
    }
    // 下端
    if (rect.top > vh - headerHeight) {
      top = vh - headerHeight;
    }
    
    panel.style.left = `${left}px`;
    panel.style.top = `${top}px`;
  }
  
  // =========================================
  // イベントリスナー
  // =========================================
  
  static setupPanelEventListeners(panelId) {
    const entry = this.panels.get(panelId);
    if (!entry) return;
    
    const panel = entry.element;
    
    // 閉じるボタン
    const closeBtns = panel.querySelectorAll('.panel-btn--close');
    closeBtns.forEach(btn => {
      const handler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.closePanel(panelId);
      };
      btn.addEventListener('click', handler);
      btn.addEventListener('touchend', handler);
    });
    
    // 更新ボタン
    const refreshBtn = panel.querySelector('.panel-btn--refresh');
    if (refreshBtn) {
      const handler = (e) => {
        e.preventDefault();
        if (typeof entry.instance.refresh === 'function') {
          entry.instance.refresh();
        }
      };
      refreshBtn.addEventListener('click', handler);
      refreshBtn.addEventListener('touchend', handler);
    }
    
    // 最大化ボタン（未実装）
    
    // パネルクリックで最前面
    panel.addEventListener('mousedown', () => this.bringToFront(panelId));
    panel.addEventListener('touchstart', () => this.bringToFront(panelId), { passive: true });
  }
  
  // =========================================
  // 状態保存
  // =========================================
  
  static async saveState(panelId) {
    const entry = this.panels.get(panelId);
    if (!entry) return;
    
    // storageKeyがない場合は保存しない
    if (!entry.config.storageKey) return;
    
    const panel = entry.element;
    const state = {
      position: {
        left: panel.offsetLeft,
        top: panel.offsetTop
      },
      size: {
        width: panel.offsetWidth,
        height: panel.offsetHeight
      },
      data: typeof entry.instance.getData === 'function' 
        ? entry.instance.getData() 
        : {}
    };
    
    // [STRATA変更] StorageManager.save/loadを直接使用
    if (entry.config.singleton) {
      const key = `panel:${entry.config.storageKey}`;
      await StorageManager.save(key, { ...state, _updatedAt: Date.now() });
    } else {
      state.instanceId = entry.instanceId;
      const key = `instances:${entry.config.storageKey}`;
      const all = StorageManager.load(key, {});
      all[entry.instanceId] = { ...state, _updatedAt: Date.now() };
      await StorageManager.save(key, all);
    }
  }
  
  static scheduleSaveState(panelId) {
    if (this.saveStateTimers[panelId]) {
      clearTimeout(this.saveStateTimers[panelId]);
    }
    
    // [STRATA変更] CONFIG依存を排除
    this.saveStateTimers[panelId] = setTimeout(() => {
      this.saveState(panelId);
      delete this.saveStateTimers[panelId];
    }, this.options.saveDelay);
  }
  
  // =========================================
  // 状態読み込み（アプリ側ヘルパー）
  // =========================================
  
  /**
   * singletonパネル状態を読み込み
   * @param {string} storageKey
   * @returns {Object|null}
   */
  static loadPanelState(storageKey) {
    return StorageManager.load(`panel:${storageKey}`);
  }
  
  /**
   * 全インスタンス状態を読み込み
   * @param {string} storageKey
   * @returns {Object} { instanceId: state, ... }
   */
  static loadAllInstances(storageKey) {
    return StorageManager.load(`instances:${storageKey}`, {});
  }
  
  /**
   * インスタンス状態を削除
   * @param {string} storageKey
   * @param {string} instanceId
   */
  static async deleteInstance(storageKey, instanceId) {
    const key = `instances:${storageKey}`;
    const all = StorageManager.load(key, {});
    delete all[instanceId];
    
    if (Object.keys(all).length === 0) {
      await StorageManager.remove(key);
    } else {
      await StorageManager.save(key, all);
    }
  }
  
  // =========================================
  // ユーティリティ
  // =========================================
  
  static findPanelByConfigId(configId) {
    for (const [panelId, entry] of this.panels) {
      if (entry.config.id === configId) {
        return panelId;
      }
    }
    return null;
  }
  
  /**
   * 全パネルを画面内に戻す
   */
  static resetAllPanelPositions() {
    for (const [panelId, entry] of this.panels) {
      const config = entry.config;
      entry.element.style.left = `${config.defaultPosition.left}px`;
      entry.element.style.top = `${config.defaultPosition.top}px`;
      this.saveState(panelId);
    }
  }
}
