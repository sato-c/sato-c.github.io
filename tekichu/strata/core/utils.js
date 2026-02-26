/**
 * Utils - ユーティリティ関数
 * 依存: なし
 * 
 * 純粋関数・変換処理のみ。状態を持たない。DOM依存しない。
 */

export const Utils = {
  /**
   * ID生成
   * @param {string} prefix - 接頭辞
   * @returns {string} ユニークID
   */
  generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return prefix ? `${prefix}-${timestamp}-${random}` : `${timestamp}-${random}`;
  },
  
  /**
   * ディープコピー
   * @param {any} obj - コピー対象
   * @returns {any} コピー結果
   */
  deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (obj instanceof Date) {
      return new Date(obj.getTime());
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.deepCopy(item));
    }
    
    const copy = {};
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        copy[key] = this.deepCopy(obj[key]);
      }
    }
    return copy;
  },
  
  /**
   * デバウンス
   * @param {Function} fn - 実行する関数
   * @param {number} delay - 遅延時間（ms）
   * @returns {Function} デバウンスされた関数
   */
  debounce(fn, delay) {
    let timerId = null;
    return function (...args) {
      if (timerId) {
        clearTimeout(timerId);
      }
      timerId = setTimeout(() => {
        fn.apply(this, args);
        timerId = null;
      }, delay);
    };
  },
  
  /**
   * スリープ
   * @param {number} ms - 待機時間（ms）
   * @returns {Promise<void>}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  },
  
  /**
   * HTMLエスケープ（DOM非依存）
   * @param {string} text - エスケープ対象
   * @returns {string} エスケープ結果
   */
  escapeHTML(text) {
    if (typeof text !== 'string') return '';
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, char => map[char]);
  },
  
  /**
   * 文字列切り詰め
   * @param {string} text - 対象文字列
   * @param {number} length - 最大長
   * @param {string} suffix - 省略記号
   * @returns {string} 切り詰め結果
   */
  truncate(text, length, suffix = '...') {
    if (typeof text !== 'string') return '';
    if (text.length <= length) return text;
    return text.substring(0, length - suffix.length) + suffix;
  },
  
  /**
   * 配列の重複排除
   * @param {Array} array - 対象配列
   * @returns {Array} 重複排除後の配列
   */
  unique(array) {
    return [...new Set(array)];
  },
  
  /**
   * 日付フォーマット
   * @param {Date} date - 日付
   * @param {string} format - フォーマット
   * @returns {string} フォーマット結果
   */
  formatDate(date, format = 'YYYY/MM/DD') {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    
    return format
      .replace('YYYY', year)
      .replace('MM', month)
      .replace('DD', day);
  },
  
  /**
   * 時刻フォーマット
   * @param {Date} date - 日付
   * @returns {string} HH:MM:SS形式
   */
  formatTime(date) {
    if (!(date instanceof Date)) {
      date = new Date(date);
    }
    
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');
    
    return `${hours}:${minutes}:${seconds}`;
  },
  
  /**
   * 明るさ調整
   * @param {string} hex - 16進数カラーコード
   * @param {number} amount - 調整量
   * @returns {string} 調整後のカラーコード
   */
  adjustBrightness(hex, amount) {
    const color = hex.replace('#', '');
    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);
    
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));
    
    return '#' +
      r.toString(16).padStart(2, '0') +
      g.toString(16).padStart(2, '0') +
      b.toString(16).padStart(2, '0');
  }
};
