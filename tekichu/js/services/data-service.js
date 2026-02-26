/**
 * DataService - データ操作サービス
 * 依存: StorageManager
 */

import { StorageManager } from '../../strata/index.js';
import { STORAGE_KEYS, DEFAULT_RACECOURSES, BET_TYPES } from '../constants.js';

export class DataService {
  // =========================================
  // 初期化
  // =========================================

  /**
   * 初期データ設定（初回起動時）
   */
  static async initDefaultData() {
    const courses = StorageManager.load(STORAGE_KEYS.RACECOURSES, null);
    if (courses === null) {
      const now = Date.now();
      const defaults = DEFAULT_RACECOURSES.map(c => ({
        ...c,
        createdAt: now,
      }));
      await StorageManager.save(STORAGE_KEYS.RACECOURSES, defaults);
      console.log('[DataService] Default racecourses initialized');
    }
  }

  // =========================================
  // 競馬場マスタ
  // =========================================

  /**
   * 全競馬場取得
   * @returns {Array}
   */
  static getAllRacecourses() {
    const courses = StorageManager.load(STORAGE_KEYS.RACECOURSES, []);
    return courses.sort((a, b) => a.order - b.order);
  }

  /**
   * カテゴリ別競馬場取得
   * @param {string} category - 'jra' | 'local' | 'overseas'
   * @returns {Array}
   */
  static getRacecoursesByCategory(category) {
    return this.getAllRacecourses().filter(c => c.category === category);
  }

  /**
   * 競馬場取得（ID指定）
   * @param {string} id
   * @returns {Object|null}
   */
  static getRacecourse(id) {
    const courses = this.getAllRacecourses();
    return courses.find(c => c.id === id) || null;
  }

  /**
   * 競馬場名から検索
   * @param {string} name
   * @returns {Object|null}
   */
  static findRacecourseByName(name) {
    const courses = this.getAllRacecourses();
    return courses.find(c => c.name === name) || null;
  }

  /**
   * 競馬場保存（新規/更新）
   * @param {Object} course
   * @returns {Promise<Object>}
   */
  static async saveRacecourse(course) {
    const courses = StorageManager.load(STORAGE_KEYS.RACECOURSES, []);

    if (course.id) {
      const index = courses.findIndex(c => c.id === course.id);
      if (index !== -1) {
        courses[index] = { ...courses[index], ...course };
      }
    } else {
      course.id = crypto.randomUUID();
      course.createdAt = Date.now();
      course.order = courses.length + 1;
      courses.push(course);
    }

    await StorageManager.save(STORAGE_KEYS.RACECOURSES, courses);
    return course;
  }

  /**
   * 競馬場削除
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  static async deleteRacecourse(id) {
    const courses = StorageManager.load(STORAGE_KEYS.RACECOURSES, []);
    const filtered = courses.filter(c => c.id !== id);

    if (filtered.length === courses.length) return false;

    await StorageManager.save(STORAGE_KEYS.RACECOURSES, filtered);
    return true;
  }

  // =========================================
  // 馬券レコード
  // =========================================

  /**
   * 全レコード取得
   * @returns {Array}
   */
  static getAllBets() {
    return StorageManager.load(STORAGE_KEYS.BETS, []);
  }

  /**
   * レコード取得（ID指定）
   * @param {string} id
   * @returns {Object|null}
   */
  static getBet(id) {
    const bets = this.getAllBets();
    return bets.find(b => b.id === id) || null;
  }

  /**
   * レコード保存（新規/更新）
   * @param {Object} bet
   * @returns {Promise<Object>}
   */
  static async saveBet(bet) {
    const bets = this.getAllBets();

    if (bet.id) {
      const index = bets.findIndex(b => b.id === bet.id);
      if (index !== -1) {
        bet.updatedAt = Date.now();
        bets[index] = bet;
      }
    } else {
      bet.id = crypto.randomUUID();
      bet.createdAt = Date.now();
      bet.updatedAt = Date.now();
      bets.push(bet);
    }

    await StorageManager.save(STORAGE_KEYS.BETS, bets);
    return bet;
  }

  /**
   * レコード一括保存（CSVインポート用）
   * @param {Array} newBets
   * @returns {Promise<number>} 追加件数
   */
  static async saveBetsBulk(newBets) {
    const bets = this.getAllBets();
    const now = Date.now();

    newBets.forEach(bet => {
      if (!bet.id) {
        bet.id = crypto.randomUUID();
        bet.createdAt = now;
        bet.updatedAt = now;
      }
      bets.push(bet);
    });

    await StorageManager.save(STORAGE_KEYS.BETS, bets);
    return newBets.length;
  }

  /**
   * レコード削除
   * @param {string} id
   * @returns {Promise<boolean>}
   */
  static async deleteBet(id) {
    const bets = this.getAllBets();
    const filtered = bets.filter(b => b.id !== id);

    if (filtered.length === bets.length) return false;

    await StorageManager.save(STORAGE_KEYS.BETS, filtered);
    return true;
  }

  /**
   * 日付でレコード取得
   * @param {string} date - YYYY-MM-DD
   * @returns {Array}
   */
  static getBetsByDate(date) {
    return this.getAllBets().filter(b => b.date === date);
  }

  /**
   * 月別レコード取得
   * @param {number} year
   * @param {number} month - 1-12
   * @returns {Array}
   */
  static getBetsByMonth(year, month) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return this.getAllBets().filter(b => b.date.startsWith(prefix));
  }

  // =========================================
  // インポート
  // =========================================

  /**
   * 最終インポート日付を取得
   * @returns {string|null} YYYYMMDD形式
   */
  static getLastImportDate() {
    const settings = StorageManager.load(STORAGE_KEYS.SETTINGS, {});
    return settings.lastImportDate || null;
  }

  /**
   * 最終インポート日付を保存
   * @param {string} date - YYYYMMDD形式
   */
  static async saveLastImportDate(date) {
    const settings = StorageManager.load(STORAGE_KEYS.SETTINGS, {});
    settings.lastImportDate = date;
    await StorageManager.save(STORAGE_KEYS.SETTINGS, settings);
  }

  // =========================================
  // 集計
  // =========================================

  /**
   * 収支サマリー計算
   * @param {Array} bets
   * @returns {Object}
   */
  static calculateSummary(bets) {
    const totalBet = bets.reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalPayout = bets.reduce((sum, b) => sum + (b.payout || 0), 0);
    const totalRefund = bets.reduce((sum, b) => sum + (b.refund || 0), 0);
    const hitCount = bets.filter(b => (b.payout || 0) > 0).length;

    return {
      bet: totalBet,
      payout: totalPayout,
      refund: totalRefund,
      profit: totalPayout + totalRefund - totalBet,
      count: bets.length,
      hitCount,
      hitRate: bets.length > 0 ? (hitCount / bets.length * 100) : 0,
      returnRate: totalBet > 0 ? ((totalPayout + totalRefund) / totalBet * 100) : 0,
    };
  }

  /**
   * 月別推移データ取得（グラフ用）
   * @param {number} year - 年（nullで全期間）
   * @returns {Array}
   */
  static getMonthlyTrend(year = null) {
    const bets = this.getAllBets();
    const grouped = {};

    bets.forEach(b => {
      const [y, m] = b.date.split('-');
      if (year && parseInt(y) !== year) return;

      const key = `${y}-${m}`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(b);
    });

    return Object.keys(grouped)
      .sort()
      .map(key => {
        const [y, m] = key.split('-');
        const summary = this.calculateSummary(grouped[key]);
        return {
          year: parseInt(y),
          month: parseInt(m),
          label: `${y}/${m}`,
          ...summary,
        };
      });
  }

  /**
   * 競馬場別集計
   * @returns {Array}
   */
  static getSummaryByRacecourse() {
    const bets = this.getAllBets();
    const courses = this.getAllRacecourses();
    const grouped = {};

    bets.forEach(b => {
      const key = b.racecourseId || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(b);
    });

    return courses.map(course => {
      const courseBets = grouped[course.id] || [];
      if (courseBets.length === 0) return null;
      const summary = this.calculateSummary(courseBets);
      return {
        racecourseId: course.id,
        name: course.name,
        category: course.category,
        ...summary,
      };
    }).filter(Boolean);
  }

  /**
   * 式別別集計
   * @returns {Array}
   */
  static getSummaryByBetType() {
    const bets = this.getAllBets();
    const grouped = {};

    bets.forEach(b => {
      const key = b.betType || 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(b);
    });

    return BET_TYPES.map(bt => {
      const typeBets = grouped[bt.name] || [];
      if (typeBets.length === 0) return null;
      const summary = this.calculateSummary(typeBets);
      return {
        betType: bt.name,
        ...summary,
      };
    }).filter(Boolean);
  }

  /**
   * 年リスト取得
   * @returns {number[]}
   */
  static getYears() {
    const bets = this.getAllBets();
    const years = new Set();
    bets.forEach(b => {
      const year = parseInt(b.date.split('-')[0]);
      years.add(year);
    });
    return Array.from(years).sort((a, b) => b - a);
  }

  /**
   * 万馬券一覧取得
   * @returns {Array}
   */
  static getHighPayouts(threshold = 10000) {
    return this.getAllBets()
      .filter(b => (b.payout || 0) >= threshold)
      .sort((a, b) => b.payout - a.payout);
  }

  // =========================================
  // エクスポート/インポート（JSON）
  // =========================================

  /**
   * 全データをJSON形式でエクスポート
   * @returns {Object}
   */
  static exportAllData() {
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      app: 'tekichu',
      bets: this.getAllBets(),
      racecourses: this.getAllRacecourses(),
      settings: StorageManager.load(STORAGE_KEYS.SETTINGS, {}),
    };
  }

  /**
   * JSONデータをインポート
   * @param {Object} data
   * @returns {Promise<Object>} インポート結果
   */
  static async importAllData(data) {
    if (data.app !== 'tekichu') {
      throw new Error('TEKICHUのデータではありません');
    }

    if (data.bets) {
      await StorageManager.save(STORAGE_KEYS.BETS, data.bets);
    }
    if (data.racecourses) {
      await StorageManager.save(STORAGE_KEYS.RACECOURSES, data.racecourses);
    }
    if (data.settings) {
      await StorageManager.save(STORAGE_KEYS.SETTINGS, data.settings);
    }

    return {
      bets: (data.bets || []).length,
      racecourses: (data.racecourses || []).length,
    };
  }
}
