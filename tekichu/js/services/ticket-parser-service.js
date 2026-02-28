/**
 * TicketParserService - JRA馬券QRコード解析
 * 
 * 馬券裏面のQR2つ（各95桁）を結合した190桁の数字列をパースする。
 * 参考: https://ys223.blogspot.com/2019/07/jra.html
 *       https://strangerxxx.hateblo.jp/entry/20250617/1750132067
 * 
 * 190桁フォーマット:
 *   1桁目:    フォーマット種別（エントリの桁数を決定）
 *   2-3桁:    開催場コード（01-10）
 *   7-8桁:    年（下2桁）
 *   9-10桁:   回
 *   11-12桁:  日
 *   13-14桁:  レース番号
 *   15桁:     券種（0通常/1BOX/2ながし/3フォーメ/4QP/5応援）
 *   29-32桁:  発券所コード
 *   43桁〜:   式別+馬番+金額（券種・フォーマットで形式が変わる）
 */

import { BET_TYPES } from '../constants.js';

export class TicketParserService {

  // QR式別コード → 式別名
  static BET_CODE_MAP = {
    '1': '単勝', '2': '複勝', '3': '枠連',
    '5': '馬連', '6': '馬単', '7': 'ワイド',
    '8': '3連複', '9': '3連単',
  };

  // QR開催場コード → 競馬場ID
  static VENUE_MAP = {
    '01': 'jra_sapporo', '02': 'jra_hakodate', '03': 'jra_fukushima',
    '04': 'jra_niigata', '05': 'jra_tokyo',    '06': 'jra_nakayama',
    '07': 'jra_chukyo',  '08': 'jra_kyoto',    '09': 'jra_hanshin',
    '10': 'jra_kokura',
  };

  /**
   * 2つのQRコードの数字列を結合して190桁にする
   * QR1（前半）とQR2（後半）を判別して正しい順序で結合
   */
  static parse(digits190) {
    if (!digits190 || digits190.length !== 190) {
      throw new Error(`190桁の数字列が必要です（${digits190?.length || 0}桁）`);
    }

    // ヘッダー解析
    const format = parseInt(digits190[0]);            // フォーマット種別
    const venueCode = digits190.substring(1, 3);      // 開催場コード
    const year = parseInt(digits190.substring(6, 8));  // 年（下2桁）
    const kai = parseInt(digits190.substring(8, 10));  // 回
    const nichi = parseInt(digits190.substring(10, 12)); // 日
    const raceNumber = parseInt(digits190.substring(12, 14)); // R
    const ticketType = parseInt(digits190[14]);        // 券種

    const racecourseId = this.VENUE_MAP[venueCode] || null;
    const fullYear = year < 50 ? 2000 + year : 1900 + year;

    const result = {
      racecourseId,
      venueCode,
      year: fullYear,
      kai,
      nichi,
      raceNumber,
      ticketType,
      ticketTypeName: this._ticketTypeName(ticketType),
      format,
      bets: [],
    };

    // 本文開始位置は原則 42 固定。42で成立するならそれを最優先する。
    let best = this._tryParseAtOffset(digits190, format, ticketType, 42);
    if (this._isUsableParse(best, ticketType)) {
      result.bets = best.bets;
      result.bodyOffset = 42;
      result.parseScore = best.score;
      result.offsetReason = 'fixed-42';
      return result;
    }

    // 42が失敗時のみ、近傍(41/43)を試す
    const primaryOffsets = [41, 43];
    for (const bodyOffset of primaryOffsets) {
      const cand = this._tryParseAtOffset(digits190, format, ticketType, bodyOffset);
      if (cand.score > best.score) {
        best = cand;
      }
    }

    // フォーメーションは過剰探索で壊れやすいので、42/41/43以外は試さない

    result.bets = best.bets;
    result.bodyOffset = best.bodyOffset;
    result.parseScore = best.score;
    result.offsetReason = best.bodyOffset === 42 ? 'fixed-42' : 'fallback-nearby';
    if (best.bodyOffset !== 42) {
      console.log(`[QR parse] bodyOffset adjusted: ${best.bodyOffset}`);
    }

    return result;
  }

  static _tryParseAtOffset(digits190, format, ticketType, bodyOffset) {
    try {
      const body = digits190.substring(bodyOffset);
      const bets = this._parseByTicketType(body, format, ticketType);
      const score = this._scoreParsedBets(bets, bodyOffset, ticketType);
      return { bets, score, bodyOffset };
    } catch (e) {
      return { bets: [], score: -Infinity, bodyOffset };
    }
  }

  static _isUsableParse(candidate, ticketType) {
    if (!candidate || !Array.isArray(candidate.bets)) return false;
    if (candidate.bets.length === 0) return false;

    const amounts = candidate.bets.map(b => Number(b.amount || 0));
    const hasPositiveAmount = amounts.some(a => Number.isFinite(a) && a > 0);
    if (!hasPositiveAmount) return false;

    // フォーメーションは0円/空に近い解釈を弾く
    if (ticketType === 3) {
      if (amounts.some(a => !Number.isFinite(a) || a <= 0)) return false;
      if (candidate.score < 0) return false;
    }

    return true;
  }

  static _parseByTicketType(body, format, ticketType) {
    switch (ticketType) {
      case 0: // 通常
        return this._parseNormalBest(body, format, ticketType);
      case 5: // 応援馬券
        return this._parseOuen(body, format);
      case 1: // ボックス
        return this._parseBox(body, format);
      case 2: // ながし
        return this._parseNagashi(body, format);
      case 3: // フォーメーション
        return this._parseFormation(body, format);
      case 4: // クイックピック
        return this._parseNormalBest(body, format, ticketType);
      default:
        console.warn('未対応の券種:', ticketType);
        return [];
    }
  }

  static _scoreParsedBets(bets, bodyOffset, ticketType = null) {
    if (!Array.isArray(bets) || bets.length === 0) return -1000 - Math.abs(42 - bodyOffset);

    let score = bets.length * 20;
    score -= Math.abs(42 - bodyOffset) * 15;

    if (bets.length > 20) score -= 200;

    let total = 0;
    for (const bet of bets) {
      const amount = Number(bet.amount || 0);
      total += Number.isFinite(amount) ? amount : 0;
      if (Number.isFinite(amount) && amount > 0) {
        score += 12;
        if (amount >= 100 && amount <= 100000) score += 20;
        if (amount > 300000) score -= 180;
        if (amount > 100000) score -= 60;
        if (amount % 100 === 0) score += 8;
      } else {
        score -= 120;
      }

      if (typeof bet.horses === 'string' && bet.horses.length > 0) {
        score += 3;
      }
    }

    if (total > 500000) score -= 120;
    if (ticketType === 5) {
      score += this._isLikelyOuenPair(bets) ? 120 : -120;
    }

    return score;
  }

  static _parseOuen(body, format) {
    // まず通常ロジックを試す
    const primary = this._parseNormalBest(body, format, 5);
    if (this._isLikelyOuenPair(primary)) {
      return this._normalizeOuenPair(primary);
    }

    // 応援馬券は券面上「単勝+複勝」固定のため、エントリ長違いでも救済を試す
    const entrySizes = Array.from(new Set([this._getEntrySize(format), 8, 10, 12]));
    let best = primary;
    for (const size of entrySizes) {
      const parsed = this._parseNormalWithEntrySize(body, size);
      if (this._isLikelyOuenPair(parsed)) {
        return this._normalizeOuenPair(parsed);
      }
      if (parsed.length > best.length) best = parsed;
    }

    // 単勝+複勝が取れなかった場合でも、より妥当な先頭2件に寄せる
    if (best.length >= 2) {
      const tansho = best.find(b => b.betType === '単勝');
      const fukusho = best.find(b => b.betType === '複勝');
      if (tansho && fukusho && tansho.horses === fukusho.horses) {
        const amount = Math.min(tansho.amount, fukusho.amount);
        return [
          { ...tansho, amount },
          { ...fukusho, amount },
        ];
      }
    }
    return best;
  }

  /**
   * 通常券・応援馬券・QP のパース
   * フォーマット別エントリサイズ:
   *   1,2: 8桁  [式別1][馬番2][金額5]
   *   3,4: 10桁 [式別1][馬番A_2][馬番B_2][金額5]
   *   5:   12桁 [式別1][馬番A_2][馬番B_2][馬番C_2][金額5]
   */
  static _parseNormal(body, format) {
    const entrySize = this._getEntrySize(format);
    return this._parseNormalWithEntrySize(body, entrySize);
  }

  static _parseNormalBest(body, format, ticketType = 0) {
    const defaultSize = this._getEntrySize(format);
    const sizes = Array.from(new Set([defaultSize, 10, 8, 12]));
    let bestBets = [];
    let bestScore = -Infinity;

    for (const size of sizes) {
      const bets = this._parseNormalWithEntrySize(body, size);
      let score = this._scoreParsedBets(bets, 42, ticketType);
      if (size !== defaultSize) score -= 10;
      if (score > bestScore) {
        bestScore = score;
        bestBets = bets;
      }
    }
    return bestBets;
  }

  static _parseNormalWithEntrySize(body, entrySize) {
    const bets = [];
    let pos = 0;

    while (pos + entrySize <= body.length) {
      const chunk = body.substring(pos, pos + entrySize);

      // フィラー検出（式別コードが0ならデータ終了）
      const betCode = chunk[0];
      if (!this.BET_CODE_MAP[betCode]) break;

      const amount = parseInt(chunk.substring(entrySize - 5)) * 100;
      if (amount <= 0) break; // 金額0はデータ終了
      if (amount > 5000000) break; // 異常値ガード（誤オフセット時の暴走抑制）

      let horses;
      let horseList = [];
      if (entrySize === 8) {
        const h1 = parseInt(chunk.substring(1, 3));
        horseList = [h1];
        horses = `${h1}`;
      } else if (entrySize === 10) {
        const h1 = parseInt(chunk.substring(1, 3));
        const h2 = parseInt(chunk.substring(3, 5));
        horseList = [h1];
        if (h2 > 0) horseList.push(h2);
        horses = h2 > 0 ? `${h1}-${h2}` : `${h1}`;
      } else {
        const h1 = parseInt(chunk.substring(1, 3));
        const h2 = parseInt(chunk.substring(3, 5));
        const h3 = parseInt(chunk.substring(5, 7));
        horseList = [h1];
        if (h3 > 0) {
          horseList.push(h2, h3);
          horses = `${h1}-${h2}-${h3}`;
        } else if (h2 > 0) {
          horseList.push(h2);
          horses = `${h1}-${h2}`;
        } else {
          horses = `${h1}`;
        }
      }

      // 馬番の妥当性チェック（1-18のみ許可）
      if (horseList.some(h => !Number.isFinite(h) || h < 1 || h > 18)) break;
      if (!this._isHorseCountValidForBetCode(betCode, horseList.length)) break;

      bets.push({
        betType: this.BET_CODE_MAP[betCode],
        horses,
        amount,
      });

      pos += entrySize;
    }

    return bets;
  }

  static _isLikelyOuenPair(bets) {
    if (!Array.isArray(bets) || bets.length < 2) return false;
    const tansho = bets.find(b => b.betType === '単勝');
    const fukusho = bets.find(b => b.betType === '複勝');
    if (!tansho || !fukusho) return false;
    if (!tansho.horses || tansho.horses !== fukusho.horses) return false;
    if (!Number.isFinite(tansho.amount) || !Number.isFinite(fukusho.amount)) return false;
    if (tansho.amount <= 0 || fukusho.amount <= 0) return false;
    return true;
  }

  static _normalizeOuenPair(bets) {
    const tansho = bets.find(b => b.betType === '単勝');
    const fukusho = bets.find(b => b.betType === '複勝');
    if (!tansho || !fukusho) return bets;
    const amount = Math.min(tansho.amount, fukusho.amount);
    return [
      { ...tansho, amount },
      { ...fukusho, amount },
    ];
  }

  /**
   * ボックスのパース
   * フォーマット別:
   *   1: [式別1][馬番2×5][金額5]  = 16桁
   *   3: [式別1][馬番2×10][金額5] = 26桁
   *   5: [式別1][馬番2×18][金額5] = 42桁
   */
  static _parseBox(body, format) {
    // parse.dart準拠:
    // format 1 => 5頭, format 3 => 10頭, それ以外 => 18頭
    const maxHorses = format === 1 ? 5 : format === 3 ? 10 : 18;
    const entrySize = 1 + maxHorses * 2 + 5;
    const bets = [];
    let pos = 0;

    while (pos + entrySize <= body.length) {
      const chunk = body.substring(pos, pos + entrySize);
      const betCode = chunk[0];
      if (!this.BET_CODE_MAP[betCode]) break;

      // 馬番を抽出（00は除く）
      const horses = [];
      let sawZeroSlot = false;
      let invalidSlots = false;
      for (let i = 0; i < maxHorses; i++) {
        const h = parseInt(chunk.substring(1 + i * 2, 3 + i * 2), 10);
        if (!Number.isFinite(h) || h < 0 || h > 18) {
          invalidSlots = true;
          break;
        }
        if (h === 0) {
          sawZeroSlot = true;
          continue;
        }
        if (sawZeroSlot) {
          invalidSlots = true;
          break;
        }
        horses.push(h);
      }
      if (invalidSlots || horses.length === 0) break;
      if (new Set(horses).size !== horses.length) break;

      const amountPer = parseInt(chunk.substring(entrySize - 5), 10) * 100;
      if (!Number.isFinite(amountPer) || amountPer <= 0) break;
      if (amountPer > 5000000) break;

      const combCount = this._boxCombinations(betCode, horses.length);
      if (!Number.isFinite(combCount) || combCount <= 0) break;
      const totalAmount = amountPer * combCount;

      bets.push({
        betType: this.BET_CODE_MAP[betCode],
        horses: `BOX ${horses.join(',')}`,
        amount: totalAmount,
        ticketFormat: 'ボックス',
        detail: `${combCount}点×${amountPer}円`,
      });

      pos += entrySize;
    }

    return bets;
  }

  /**
   * ながしのパース
   * [式別1][パターン1][1着ビット18][2着ビット18][（3着ビット18）][金額5][マルチ1]
   */
  static _parseNagashi(body, format) {
    const bets = [];
    let pos = 0;

    const betCode = body[pos];
    if (!this.BET_CODE_MAP[betCode]) return bets;
    pos += 1;

    // parse.dart準拠: ながし種別コード(1桁)
    const wheelCode = body[pos];
    pos += 1;

    const betType = this.BET_CODE_MAP[betCode];
    let amountPer = 0;
    let multi = false;
    let horsesStr = '';
    let combCount = 0;

    if (betCode === '6' || betCode === '8') {
      // [軸1_18][軸2_18][相手_18][金額5][(任意)マルチ1]
      if (pos + 54 > body.length) return bets;
      const axis1 = this._parseBitmap(body.substring(pos, pos + 18)); pos += 18;
      const axis2 = this._parseBitmap(body.substring(pos, pos + 18)); pos += 18;
      const partners = this._parseBitmap(body.substring(pos, pos + 18)); pos += 18;

      if (pos + 5 > body.length) return bets;
      amountPer = parseInt(body.substring(pos, pos + 5), 10) * 100;
      pos += 5;
      if (amountPer <= 0) return bets;

      // 末尾にマルチフラグがあるケースに備えて読む
      if (pos < body.length) {
        multi = body[pos] === '1';
      }

      const axis = [...axis1, ...axis2];
      horsesStr = `流 ${axis.join(',')}→${partners.join(',')}`;
      combCount = partners.length;
    } else if (betCode === '9') {
      // [1着_18][2着_18][3着_18][金額5][マルチ1]
      if (pos + 60 > body.length) return bets;
      const bitmap1 = this._parseBitmap(body.substring(pos, pos + 18)); pos += 18;
      const bitmap2 = this._parseBitmap(body.substring(pos, pos + 18)); pos += 18;
      const bitmap3 = this._parseBitmap(body.substring(pos, pos + 18)); pos += 18;

      amountPer = parseInt(body.substring(pos, pos + 5), 10) * 100;
      pos += 5;
      multi = body[pos] === '1';
      pos += 1;
      if (amountPer <= 0) return bets;

      combCount = this._nagashiTripleCombinations(betCode, parseInt(wheelCode, 10), bitmap1, bitmap2, bitmap3);
      if (multi) combCount *= 6;
      horsesStr = `流 ${bitmap1.join(',')}→${bitmap2.join(',')}→${bitmap3.join(',')}`;
    } else {
      // [軸2桁][金額5][相手_18]
      if (pos + 25 > body.length) return bets;
      const axis = parseInt(body.substring(pos, pos + 2), 10);
      pos += 2;
      amountPer = parseInt(body.substring(pos, pos + 5), 10) * 100;
      pos += 5;
      const partners = this._parseBitmap(body.substring(pos, pos + 18));
      pos += 18;
      if (amountPer <= 0) return bets;

      combCount = partners.length;
      horsesStr = `流 ${axis}→${partners.join(',')}`;
    }

    const totalAmount = amountPer * Math.max(1, combCount);
    bets.push({
      betType,
      horses: horsesStr,
      amount: totalAmount,
      ticketFormat: multi ? 'ながしマルチ' : 'ながし',
      detail: `${Math.max(1, combCount)}点×${amountPer}円`,
      wheelCode,
    });
    return bets;
  }

  /**
   * フォーメーションのパース
   * [式別1][1着ビット18][2着ビット18][（3着ビット18）][金額5][マルチ1]
   */
  static _parseFormation(body, format) {
    const bets = [];
    let pos = 0;

    const betCode = body[pos];
    if (!this.BET_CODE_MAP[betCode]) return bets;
    pos += 1;

    const betType = this.BET_CODE_MAP[betCode];
    const isTriple = betCode === '8' || betCode === '9'; // 3連系

    // parse.dart準拠:
    // [式別1][デリミタ1][18bit][18bit][18bit][金額5][マルチ1]
    // 2連系フォーメでも3ブロック読むが、空ブロックは破棄される
    if (pos + 1 > body.length) return bets;
    pos += 1; // デリミタをスキップ

    const groups = [];
    for (let g = 0; g < 3; g++) {
      if (pos + 18 > body.length) return bets;
      const bitmap = this._parseBitmap(body.substring(pos, pos + 18));
      pos += 18;
      if (bitmap.length > 0) groups.push(bitmap);
    }

    if (groups.length === 0) return bets;

    const bitmap1 = groups[0] || [];
    const bitmap2 = groups[1] || [];
    const bitmap3 = groups[2] || [];

    if (pos + 6 > body.length) return bets; // 金額5 + 末尾1

    const amountPer = parseInt(body.substring(pos, pos + 5)) * 100;
    pos += 5;
    const multi = parseInt(body[pos]) === 1;
    pos += 1;

    if (amountPer <= 0) return bets;

    // 組み合わせ数計算
    let combCount;
    if (isTriple) {
      if (bitmap1.length === 0 || bitmap2.length === 0 || bitmap3.length === 0) return bets;
      combCount = this._formationTripleCombinations(betCode, bitmap1, bitmap2, bitmap3);
    } else {
      if (bitmap1.length === 0 || bitmap2.length === 0) return bets;
      combCount = this._formationDoubleCombinations(betCode, bitmap1, bitmap2);
    }
    if (multi) {
      if (betCode === '9') combCount *= 6;
      else if (betCode === '6') combCount *= 2;
      else if (betCode === '8') combCount *= 3;
    }

    const totalAmount = amountPer * combCount;

    const set1 = bitmap1.join(',');
    const set2 = bitmap2.join(',');
    const set3 = bitmap3.length > 0 ? bitmap3.join(',') : '';
    const horsesStr = set3
      ? `フォメ {${set1}}-{${set2}}-{${set3}}`
      : `フォメ {${set1}}-{${set2}}`;

    bets.push({
      betType,
      horses: horsesStr,
      amount: totalAmount,
      ticketFormat: multi ? 'フォーメーションマルチ' : 'フォーメーション',
      detail: `${combCount}点×${amountPer}円`,
    });

    return bets;
  }

  // --- ユーティリティ ---

  static _getEntrySize(format) {
    if (format <= 2) return 8;
    if (format <= 4) return 10;
    return 12;
  }

  static _parseBitmap(str18) {
    const horses = [];
    for (let i = 0; i < 18 && i < str18.length; i++) {
      if (str18[i] === '1') {
        horses.push(i + 1); // 1-indexed
      }
    }
    return horses;
  }

  static _isHorseCountValidForBetCode(betCode, count) {
    if (betCode === '1' || betCode === '2') return count === 1;
    if (betCode === '3' || betCode === '5' || betCode === '6' || betCode === '7') return count >= 1 && count <= 2;
    if (betCode === '8' || betCode === '9') return count >= 1 && count <= 3;
    return false;
  }

  static _boxCombinations(betCode, n) {
    switch (betCode) {
      case '1': case '2': return n; // 単勝/複勝
      case '3': case '5': case '7': return this._nC2(n); // 枠連/馬連/ワイド
      case '6': return n * (n - 1); // 馬単
      case '8': return this._nC3(n); // 3連複
      case '9': return n * (n - 1) * (n - 2); // 3連単
      default: return n;
    }
  }

  static _nagashiTripleCombinations(betCode, pattern, b1, b2, b3) {
    // 簡易計算（正確な計算は非常に複雑）
    // 軸-相手-相手パターンが最も一般的
    const n1 = b1.length;
    const n2 = b2.length;
    const n3 = b3.length;

    if (betCode === '9') {
      // 3連単: 各位置の組み合わせ（同一馬除外）
      // 概算: n1 * n2 * n3 から重複を引く
      let count = 0;
      for (const h1 of b1) {
        for (const h2 of b2) {
          if (h2 === h1) continue;
          for (const h3 of b3) {
            if (h3 === h1 || h3 === h2) continue;
            count++;
          }
        }
      }
      return count;
    } else {
      // 3連複: 組み合わせ（順不同）
      const seen = new Set();
      for (const h1 of b1) {
        for (const h2 of b2) {
          if (h2 === h1) continue;
          for (const h3 of b3) {
            if (h3 === h1 || h3 === h2) continue;
            const key = [h1, h2, h3].sort((a, b) => a - b).join(',');
            seen.add(key);
          }
        }
      }
      return seen.size;
    }
  }

  static _formationDoubleCombinations(betCode, b1, b2) {
    let count = 0;
    if (betCode === '6') {
      // 馬単: 順序あり
      for (const h1 of b1) {
        for (const h2 of b2) {
          if (h1 !== h2) count++;
        }
      }
    } else {
      // 馬連/ワイド/枠連: 順序なし
      const seen = new Set();
      for (const h1 of b1) {
        for (const h2 of b2) {
          if (h1 !== h2) {
            const key = [h1, h2].sort((a, b) => a - b).join(',');
            seen.add(key);
          }
        }
      }
      count = seen.size;
    }
    return count;
  }

  static _formationTripleCombinations(betCode, b1, b2, b3) {
    if (betCode === '9') {
      let count = 0;
      for (const h1 of b1) {
        for (const h2 of b2) {
          if (h2 === h1) continue;
          for (const h3 of b3) {
            if (h3 === h1 || h3 === h2) continue;
            count++;
          }
        }
      }
      return count;
    } else {
      const seen = new Set();
      for (const h1 of b1) {
        for (const h2 of b2) {
          if (h2 === h1) continue;
          for (const h3 of b3) {
            if (h3 === h1 || h3 === h2) continue;
            const key = [h1, h2, h3].sort((a, b) => a - b).join(',');
            seen.add(key);
          }
        }
      }
      return seen.size;
    }
  }

  static _nC2(n) { return n * (n - 1) / 2; }
  static _nC3(n) { return n * (n - 1) * (n - 2) / 6; }

  static _ticketTypeName(type) {
    const names = {
      0: '通常', 1: 'ボックス', 2: 'ながし',
      3: 'フォーメーション', 4: 'クイックピック', 5: '応援馬券',
    };
    return names[type] || '不明';
  }
}
