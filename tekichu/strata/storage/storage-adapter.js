/**
 * StorageAdapter - ストレージアダプタ抽象基底クラス
 * 依存: なし
 * 
 * 具体的なストレージ実装（localStorage, IndexedDB, Drive等）は
 * このクラスを継承して実装する。
 */

export class StorageAdapter {
  /**
   * データ保存
   * @param {string} key - キー
   * @param {any} data - データ
   * @returns {Promise<boolean>} 成功/失敗
   */
  async save(key, data) {
    throw new Error('Not implemented: save');
  }
  
  /**
   * データ読み込み（同期）
   * @param {string} key - キー
   * @param {any} defaultValue - デフォルト値
   * @returns {any} データ
   */
  load(key, defaultValue = null) {
    throw new Error('Not implemented: load');
  }
  
  /**
   * データ削除
   * @param {string} key - キー
   * @returns {Promise<boolean>} 成功/失敗
   */
  async remove(key) {
    throw new Error('Not implemented: remove');
  }
  
  /**
   * キー一覧取得
   * @param {string} prefix - フィルタ用プレフィックス
   * @returns {string[]} キー配列
   */
  getAllKeys(prefix = '') {
    throw new Error('Not implemented: getAllKeys');
  }
}
