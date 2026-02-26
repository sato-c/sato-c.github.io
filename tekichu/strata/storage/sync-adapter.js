/**
 * SyncAdapter - 同期アダプタ抽象基底クラス
 * 依存: なし
 * 
 * 具体的なリモートストレージ実装（Google Drive, S3等）は
 * このクラスを継承して実装する。
 * 
 * データの中身には関与しない。アプリから渡されたデータを
 * そのまま保存/読み込みするだけ。
 */

export class SyncAdapter {
  /**
   * リモートにデータを保存
   * @param {any} data - 保存するデータ（アプリが用意した任意の構造）
   * @param {string} token - 認証トークン
   * @returns {Promise<boolean>} 成功/失敗
   */
  async save(data, token) {
    throw new Error('Not implemented: save');
  }
  
  /**
   * リモートからデータを読み込み
   * @param {string} token - 認証トークン
   * @returns {Promise<any|null>} データ、なければnull
   */
  async load(token) {
    throw new Error('Not implemented: load');
  }
}
