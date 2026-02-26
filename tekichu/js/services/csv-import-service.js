/**
 * CsvImportService - JRA-VAN CSV取り込み
 * 依存: DataService
 * 
 * JRA-VANの収支履歴CSVをパースしてbetレコードに変換する。
 * CSVフォーマット: 年月日,回場日,R,式別買い目,オッズ,購入金額,払戻金額,返還
 * エンコーディング: Shift-JIS
 * 半角カナ混在（ﾜｲﾄﾞ等）
 */

import { DataService } from './data-service.js';

export class CsvImportService {

  // 半角カナ→全角カナ変換テーブル
  static HALF_TO_FULL = {
    'ﾜｲﾄﾞ': 'ワイド',
  };

  // 式別名の正規化マッピング
  static BET_TYPE_MAP = {
    '単勝': '単勝',
    '複勝': '複勝',
    '枠連': '枠連',
    '馬連': '馬連',
    '馬単': '馬単',
    'ワイド': 'ワイド',
    'ﾜｲﾄﾞ': 'ワイド',
    '3連複': '3連複',
    '3連単': '3連単',
    '三連複': '3連複',
    '三連単': '3連単',
  };

  /**
   * CSVファイルを読み込んでインポート
   * @param {File} file - CSVファイル
   * @returns {Promise<Object>} { imported: number, skipped: number, lastDate: string }
   */
  static async importFromFile(file) {
    const text = await this.readFileAsText(file);
    return await this.importFromText(text);
  }

  /**
   * ファイルをテキストとして読み込む（Shift-JIS対応）
   * @param {File} file
   * @returns {Promise<string>}
   */
  static readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('ファイル読み込みに失敗しました'));
      // Shift-JIS対応
      reader.readAsText(file, 'Shift_JIS');
    });
  }

  /**
   * CSVテキストからインポート
   * @param {string} text
   * @returns {Promise<Object>}
   */
  static async importFromText(text) {
    const lines = text.split(/\r?\n/).filter(line => line.trim());

    // ヘッダー確認
    if (lines.length === 0) {
      throw new Error('CSVが空です');
    }

    // ヘッダー行をスキップ
    const header = lines[0];
    const isHeader = header.includes('年月日') || header.includes('式別');
    const dataLines = isHeader ? lines.slice(1) : lines;

    // 最終インポート日付を取得
    const lastImportDate = DataService.getLastImportDate();

    // パースと差分フィルタ
    const parsed = [];
    let skipped = 0;
    let maxDate = lastImportDate || '';

    for (const line of dataLines) {
      const bet = this.parseLine(line);
      if (!bet) {
        skipped++;
        continue;
      }

      // 差分チェック: 最終インポート日付より後のデータのみ
      if (lastImportDate && bet.rawDate <= lastImportDate) {
        skipped++;
        continue;
      }

      parsed.push(bet);

      if (bet.rawDate > maxDate) {
        maxDate = bet.rawDate;
      }
    }

    // 一括保存
    if (parsed.length > 0) {
      await DataService.saveBetsBulk(parsed);
      await DataService.saveLastImportDate(maxDate);
    }

    return {
      imported: parsed.length,
      skipped,
      lastDate: maxDate,
    };
  }

  /**
   * CSV1行をパース
   * @param {string} line
   * @returns {Object|null}
   */
  static parseLine(line) {
    // CSVをカンマ分割（簡易。引用符内カンマは想定しない）
    const cols = line.split(',').map(c => c.trim());

    if (cols.length < 7) return null;

    const rawDate = cols[0];            // 20211127
    const kaisaiInfo = cols[1];          // ５回阪神７日
    const raceNum = cols[2];             // 11R
    const betTypeAndHorses = cols[3];    // ﾜｲﾄﾞ 4-5
    const odds = cols[4];                // 14.2
    const amount = cols[5];              // 100
    const payout = cols[6];              // 0
    const refund = cols[7] || '';         // 返還

    // 日付変換: 20211127 → 2021-11-27
    const date = this.parseDate(rawDate);
    if (!date) return null;

    // 回場日パース: ５回阪神７日 → { racecourse: '阪神' }
    const courseInfo = this.parseKaisaiInfo(kaisaiInfo);

    // 式別・馬番パース: ﾜｲﾄﾞ 4-5 → { betType: 'ワイド', horses: '4-5' }
    const betInfo = this.parseBetTypeAndHorses(betTypeAndHorses);
    if (!betInfo) return null;

    // レース番号: 11R → 11
    const race = parseInt(raceNum) || 0;

    // 競馬場ID解決
    const racecourseId = this.resolveRacecourseId(courseInfo.racecourse);

    return {
      date,
      rawDate,
      racecourseId,
      raceNumber: race,
      kaisaiInfo: kaisaiInfo,
      betType: betInfo.betType,
      horses: betInfo.horses,
      odds: parseFloat(odds) || 0,
      amount: parseInt(amount) || 0,
      payout: parseInt(payout) || 0,
      refund: parseInt(refund) || 0,
      source: 'jravan',
    };
  }

  /**
   * 日付パース: 20211127 → 2021-11-27
   * @param {string} raw
   * @returns {string|null}
   */
  static parseDate(raw) {
    if (!raw || raw.length !== 8) return null;
    const y = raw.substring(0, 4);
    const m = raw.substring(4, 6);
    const d = raw.substring(6, 8);
    return `${y}-${m}-${d}`;
  }

  /**
   * 回場日パース: ５回阪神７日 → { racecourse: '阪神' }
   * 全角数字・回・日を除去して競馬場名を取得
   * @param {string} info
   * @returns {Object}
   */
  static parseKaisaiInfo(info) {
    if (!info) return { racecourse: '' };

    // 全角数字→半角
    let s = info.replace(/[０-９]/g, c =>
      String.fromCharCode(c.charCodeAt(0) - 0xFEE0)
    );

    // 数字、回、日を除去
    s = s.replace(/[0-9]/g, '').replace(/回/g, '').replace(/日/g, '').trim();

    return { racecourse: s };
  }

  /**
   * 式別・馬番パース: ﾜｲﾄﾞ 4-5 → { betType: 'ワイド', horses: '4-5' }
   * @param {string} raw
   * @returns {Object|null}
   */
  static parseBetTypeAndHorses(raw) {
    if (!raw) return null;

    // スペースで分割（最初のスペースで式別と馬番を分ける）
    const trimmed = raw.trim();
    const spaceIndex = trimmed.indexOf(' ');

    if (spaceIndex === -1) return null;

    const rawType = trimmed.substring(0, spaceIndex).trim();
    const horses = trimmed.substring(spaceIndex + 1).trim();

    // 式別名を正規化
    const betType = this.BET_TYPE_MAP[rawType] || rawType;

    return { betType, horses };
  }

  /**
   * 競馬場名からIDを解決
   * @param {string} name
   * @returns {string|null}
   */
  static resolveRacecourseId(name) {
    if (!name) return null;
    const course = DataService.findRacecourseByName(name);
    return course ? course.id : null;
  }
}
