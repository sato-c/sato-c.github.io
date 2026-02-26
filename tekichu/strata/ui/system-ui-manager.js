/**
 * SystemUIManager - システムUI管理（通知・モーダル・ダイアログ）
 * 依存: MessageBus
 */

import { MessageBus } from '../core/message-bus.js';

export class SystemUIManager {
  static notifications = new Map();
  static activeModal = null;
  
  static MAX_NOTIFICATIONS = 5;
  static NOTIFICATION_DURATION = {
    low: 3000,
    normal: 5000,
    high: 8000
  };
  
  static NOTIFICATION_CONTAINER_ID = 'notification-container';
  static MODAL_CONTAINER_ID = 'modal-container';
  
  // =========================================
  // 初期化
  // =========================================
  
  static init() {
    // 通知購読
    MessageBus.on('show-notification', (notification) => {
      this.showNotification(notification);
    });
    
    // 通知コンテナ作成
    if (!document.getElementById(this.NOTIFICATION_CONTAINER_ID)) {
      const container = document.createElement('div');
      container.id = this.NOTIFICATION_CONTAINER_ID;
      container.className = 'notification-container';
      document.body.appendChild(container);
    }
    
    // モーダルコンテナ作成
    if (!document.getElementById(this.MODAL_CONTAINER_ID)) {
      const container = document.createElement('div');
      container.id = this.MODAL_CONTAINER_ID;
      container.className = 'modal-container';
      document.body.appendChild(container);
    }
    
    console.log('[SystemUIManager] Initialized');
  }
  
  // =========================================
  // 通知
  // =========================================
  
  static showNotification(notification) {
    const container = document.getElementById(this.NOTIFICATION_CONTAINER_ID);
    if (!container) return;
    
    // 最大数チェック
    if (this.notifications.size >= this.MAX_NOTIFICATIONS) {
      const oldest = this.notifications.keys().next().value;
      this.hideNotification(oldest);
    }
    
    // DOM生成
    const element = this.createNotificationElement(notification);
    container.appendChild(element);
    
    // タイマー設定
    const duration = this.NOTIFICATION_DURATION[notification.priority] || this.NOTIFICATION_DURATION.normal;
    const timerId = setTimeout(() => {
      this.hideNotification(notification.id);
    }, duration);
    
    this.notifications.set(notification.id, { element, timerId });
  }
  
  static hideNotification(notificationId) {
    const entry = this.notifications.get(notificationId);
    if (!entry) return;
    
    clearTimeout(entry.timerId);
    entry.element.classList.add('notification--hiding');
    
    setTimeout(() => {
      entry.element.remove();
      this.notifications.delete(notificationId);
    }, 300);
  }
  
  static createNotificationElement(notification) {
    const element = document.createElement('div');
    element.className = `notification notification--${notification.type}`;
    element.dataset.notificationId = notification.id;
    
    const message = document.createElement('span');
    message.className = 'notification__message';
    message.textContent = notification.message;
    element.appendChild(message);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification__close';
    closeBtn.textContent = '×';
    const hideHandler = (e) => {
      e.preventDefault();
      this.hideNotification(notification.id);
    };
    closeBtn.addEventListener('click', hideHandler);
    closeBtn.addEventListener('touchend', hideHandler);
    element.appendChild(closeBtn);
    
    return element;
  }
  
  // =========================================
  // モーダル
  // =========================================
  
  static async showModal(options) {
    // 既存モーダルがあれば閉じる
    if (this.activeModal) {
      this.closeModal(null);
    }
    
    return new Promise((resolve) => {
      const container = document.getElementById(this.MODAL_CONTAINER_ID);
      if (!container) {
        resolve(null);
        return;
      }
      
      // オーバーレイ
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = '95';
      container.appendChild(overlay);
      
      // モーダル本体
      const modal = this.createModalElement(options);
      modal.style.zIndex = '96';
      container.appendChild(modal);
      
      this.activeModal = { element: modal, overlay, resolve };
      
      // オーバーレイクリックで閉じる（キャンセル扱い）
      overlay.addEventListener('click', () => {
        this.closeModal(null);
      });
    });
  }
  
  static createModalElement(options) {
    const modal = document.createElement('div');
    modal.className = 'modal';
    
    // ヘッダー
    if (options.title) {
      const header = document.createElement('div');
      header.className = 'modal__header';
      header.textContent = options.title;
      modal.appendChild(header);
    }
    
    // ボディ
    const body = document.createElement('div');
    body.className = 'modal__body';
    
    if (options.content) {
      // カスタムコンテンツ（DOM要素）
      body.appendChild(options.content);
    } else if (options.message) {
      // テキストメッセージ
      body.textContent = options.message;
    }
    modal.appendChild(body);
    
    // フッター（ボタン）- カスタムコンテンツの場合はスキップ可能
    if (!options.noFooter) {
      const footer = document.createElement('div');
      footer.className = 'modal__footer';
      
      const buttons = options.buttons || ['OK'];
      buttons.forEach((btnText, index) => {
        const btn = document.createElement('button');
        btn.className = 'modal__btn';
        if (index === 0) {
          btn.classList.add('modal__btn--primary');
        }
        btn.textContent = btnText;
        const clickHandler = () => {
          this.closeModal(btnText);
        };
        btn.addEventListener('click', clickHandler);
        btn.addEventListener('touchend', (e) => {
          e.preventDefault();
          clickHandler();
        });
        footer.appendChild(btn);
      });
      
      modal.appendChild(footer);
    }
    
    return modal;
  }
  
  static closeModal(result) {
    if (!this.activeModal) return;
    
    const { element, overlay, resolve } = this.activeModal;
    
    element.remove();
    overlay.remove();
    
    this.activeModal = null;
    resolve(result);
  }
  
  // =========================================
  // ダイアログ
  // =========================================
  
  static async showDialog(options) {
    if (this.activeModal) {
      this.closeModal(null);
    }
    
    return new Promise((resolve) => {
      const container = document.getElementById(this.MODAL_CONTAINER_ID);
      if (!container) {
        resolve(null);
        return;
      }
      
      // オーバーレイ
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.style.zIndex = '95';
      container.appendChild(overlay);
      
      // ダイアログ本体
      const dialog = this.createDialogElement(options);
      dialog.style.zIndex = '96';
      container.appendChild(dialog);
      
      this.activeModal = { element: dialog, overlay, resolve };
      
      // オーバーレイクリックで閉じる（キャンセル扱い）
      overlay.addEventListener('click', () => {
        this.closeModal(null);
      });
    });
  }
  
  static createDialogElement(options) {
    const dialog = document.createElement('div');
    dialog.className = 'modal dialog';
    
    // ヘッダー
    if (options.title) {
      const header = document.createElement('div');
      header.className = 'modal__header';
      header.textContent = options.title;
      dialog.appendChild(header);
    }
    
    // ボディ
    const body = document.createElement('div');
    body.className = 'modal__body';
    
    if (options.message) {
      const msg = document.createElement('p');
      msg.textContent = options.message;
      body.appendChild(msg);
    }
    
    // 入力フィールド
    let input = null;
    if (options.type === 'input') {
      input = document.createElement('input');
      input.type = 'text';
      input.className = 'dialog__input';
      input.value = options.defaultValue || '';
      body.appendChild(input);
      
      // inputへの参照を保持
      dialog._input = input;
    } else if (options.type === 'select') {
      input = document.createElement('select');
      input.className = 'dialog__select';
      (options.options || []).forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.textContent = opt;
        input.appendChild(option);
      });
      body.appendChild(input);
      
      // inputへの参照を保持
      dialog._input = input;
    }
    
    dialog.appendChild(body);
    
    // フッター
    const footer = document.createElement('div');
    footer.className = 'modal__footer';
    
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'modal__btn';
    cancelBtn.textContent = 'キャンセル';
    cancelBtn.addEventListener('click', () => this.closeModal(null));
    cancelBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.closeModal(null);
    });
    footer.appendChild(cancelBtn);
    
    const okBtn = document.createElement('button');
    okBtn.className = 'modal__btn modal__btn--primary';
    okBtn.textContent = 'OK';
    okBtn.addEventListener('click', () => {
      this.closeModal(dialog._input ? dialog._input.value : true);
    });
    okBtn.addEventListener('touchend', (e) => {
      e.preventDefault();
      this.closeModal(dialog._input ? dialog._input.value : true);
    });
    footer.appendChild(okBtn);
    
    dialog.appendChild(footer);
    
    // フォーカス
    setTimeout(() => {
      if (input) input.focus();
    }, 100);
    
    return dialog;
  }
  
  // =========================================
  // ショートカット
  // =========================================
  
  /**
   * 確認ダイアログ
   * @param {string} message - メッセージ
   * @param {string} title - タイトル
   * @returns {Promise<boolean>}
   */
  static async confirm(message, title = '確認') {
    const result = await this.showModal({
      title,
      message,
      buttons: ['OK', 'キャンセル']
    });
    return result === 'OK';
  }
  
  /**
   * 入力ダイアログ
   * @param {string} message - メッセージ
   * @param {string} defaultValue - デフォルト値
   * @param {string} title - タイトル
   * @returns {Promise<string|null>}
   */
  static async prompt(message, defaultValue = '', title = '入力') {
    return await this.showDialog({
      title,
      message,
      type: 'input',
      defaultValue
    });
  }
  
  /**
   * 選択ダイアログ
   * @param {string} message - メッセージ
   * @param {Array<string>} options - 選択肢
   * @param {string} title - タイトル
   * @returns {Promise<string|null>}
   */
  static async select(message, options, title = '選択') {
    return await this.showDialog({
      title,
      message,
      type: 'select',
      options
    });
  }
  
  // =========================================
  // 汎用リストモーダル
  // =========================================
  
  static listModalOptions = null;
  
  /**
   * 汎用リストモーダル
   * @param {Object} options
   * @param {string} options.title - タイトル
   * @param {Array} options.items - アイテム配列
   * @param {string} options.emptyMessage - 空の時のメッセージ
   * @param {Function} options.getItemId - (item) => string
   * @param {Function} options.renderItem - (item, actions) => HTMLElement
   * @param {string} options.footerInfo - フッター情報テキスト
   * @param {Array} options.footerButtons - [{ label, className, onClick }]
   * @param {Function} options.onRefresh - 再描画時のコールバック
   */
  static async showListModal(options) {
    this.listModalOptions = options;
    
    const content = document.createElement('div');
    content.className = 'list-modal';
    content.id = 'list-modal-content';
    
    this.renderListModalContent(content, options);
    
    await this.showModal({
      title: options.title,
      content: content,
      noFooter: true
    });
    
    this.listModalOptions = null;
  }
  
  /**
   * リストモーダルの内容を描画
   */
  static renderListModalContent(container, options) {
    // [STRATA変更] innerHTML禁止のためreplaceChildrenを使用
    container.replaceChildren();
    
    const items = options.items;
    
    if (!items || items.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'list-modal__empty';
      empty.textContent = options.emptyMessage || 'アイテムがありません';
      container.appendChild(empty);
    } else {
      const list = document.createElement('div');
      list.className = 'list-modal__list';
      
      for (const item of items) {
        const itemId = options.getItemId(item);
        const actions = this.createListItemActions(itemId);
        const element = options.renderItem(item, actions);
        element.dataset.itemId = itemId;
        list.appendChild(element);
      }
      
      container.appendChild(list);
    }
    
    // フッター
    if (options.footerInfo || (options.footerButtons && options.footerButtons.length > 0)) {
      const footer = document.createElement('div');
      footer.className = 'list-modal__footer';
      
      if (options.footerInfo) {
        const info = document.createElement('div');
        info.className = 'list-modal__info';
        info.textContent = options.footerInfo;
        footer.appendChild(info);
      }
      
      if (options.footerButtons && options.footerButtons.length > 0) {
        const buttons = document.createElement('div');
        buttons.className = 'list-modal__buttons';
        
        for (const btnConfig of options.footerButtons) {
          const btn = document.createElement('button');
          btn.className = `list-modal__btn ${btnConfig.className || ''}`;
          btn.textContent = btnConfig.label;
          btn.addEventListener('click', btnConfig.onClick);
          buttons.appendChild(btn);
        }
        
        footer.appendChild(buttons);
      }
      
      container.appendChild(footer);
    }
  }
  
  /**
   * リストアイテム用アクションヘルパーを作成
   */
  static createListItemActions(itemId) {
    return {
      remove: () => this.removeListItem(itemId),
      refresh: () => this.refreshListModal()
    };
  }
  
  /**
   * リストからアイテムを削除
   */
  static removeListItem(itemId) {
    const container = document.getElementById('list-modal-content');
    if (!container) return;
    
    const item = container.querySelector(`[data-item-id="${itemId}"]`);
    if (item) {
      item.remove();
    }
    
    // リストが空になったかチェック
    const list = container.querySelector('.list-modal__list');
    if (list && list.children.length === 0) {
      this.refreshListModal();
    }
  }
  
  /**
   * リストモーダルを再描画
   */
  static refreshListModal() {
    if (!this.listModalOptions) return;
    
    const container = document.getElementById('list-modal-content');
    if (!container) return;
    
    // onRefresh で最新データを取得
    if (this.listModalOptions.onRefresh) {
      this.listModalOptions.items = this.listModalOptions.onRefresh();
    }
    
    this.renderListModalContent(container, this.listModalOptions);
  }
}
