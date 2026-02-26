/**
 * helpers.js - アプリ側ユーティリティ関数
 * STRATAのUtilsにない、アプリ固有のヘルパー
 */

/**
 * 数値をカンマ区切りでフォーマット
 * @param {number} num
 * @returns {string}
 */
export function formatNumber(num) {
  if (num == null || isNaN(num)) return '0';
  return Number(num).toLocaleString();
}
