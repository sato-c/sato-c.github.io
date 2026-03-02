/**
 * PurchaseQRService
 *
 * Foundation service for JRA purchase QR (single QR, 802 digits).
 * This service currently focuses on:
 * - splitting/parsing 802-digit payload
 * - grouping bet rows into "ticket slots" for future generation
 */

export class PurchaseQRService {
  static PAYLOAD_LENGTH = 802;
  static ENVELOPE_LENGTH = 42;
  static SLOT_LENGTH = 106;
  static SLOT_COUNT = 7;
  static TRAILER_LENGTH = 18;

  /**
   * Parse 802-digit purchase payload into envelope/slots/trailer.
   * Returns null on invalid input.
   */
  static parsePayload802(digits) {
    const s = typeof digits === 'string' ? digits.trim() : '';
    if (!/^\d+$/.test(s)) return null;
    if (s.length !== this.PAYLOAD_LENGTH) return null;

    const envelope = s.substring(0, this.ENVELOPE_LENGTH);
    const slots = [];
    for (let i = 0; i < this.SLOT_COUNT; i++) {
      const start = this.ENVELOPE_LENGTH + i * this.SLOT_LENGTH;
      const end = start + this.SLOT_LENGTH;
      const raw = s.substring(start, end);
      slots.push(this._parseSlot(raw, i + 1, start, end - 1));
    }
    const trailer = s.substring(this.ENVELOPE_LENGTH + this.SLOT_COUNT * this.SLOT_LENGTH);

    return {
      raw: s,
      version: s[0],
      count: parseInt(s[1], 10),
      dateYYMMDD: s.substring(2, 10),
      timeHHMMSS: s.substring(10, 16),
      envelope,
      slots,
      trailer,
    };
  }

  /**
   * Group bet rows into purchase slots.
   *
   * Rule (current working hypothesis):
   * - tansho + fukusho together
   * - umaren + umatan + wide together
   * - sanrenpuku separate
   * - sanrentan separate
   * - wakuren separate (kept conservative for now)
   *
   * Different ticketFormat/style is split into a different slot.
   */
  static groupBetsForPurchase(bets) {
    if (!Array.isArray(bets) || bets.length === 0) return [];

    const groups = new Map();
    for (const bet of bets) {
      const code = this._ticketCodeFromBet(bet);
      const family = this._slotFamilyFromCode(code);
      const style = this._styleKeyFromBet(bet);
      const key = `${family}:${style}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          family,
          style,
          ticketCodes: new Set(),
          bets: [],
        });
      }
      const g = groups.get(key);
      if (code) g.ticketCodes.add(code);
      g.bets.push(bet);
    }

    const order = ['tanfuku', 'umaren-family', 'wakuren', 'sanrenpuku', 'sanrentan', 'other'];
    const arr = [...groups.values()];
    arr.sort((a, b) => {
      const ai = order.indexOf(a.family);
      const bi = order.indexOf(b.family);
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
    });
    return arr;
  }

  static _parseSlot(raw, index, start, end) {
    const header14 = raw.substring(0, 14);
    const ticketCode = raw[19] || null;
    const nonZeroRuns = [];
    let inRun = false;
    let runStart = 0;
    for (let i = 0; i < raw.length; i++) {
      const nz = raw[i] !== '0';
      if (nz && !inRun) {
        inRun = true;
        runStart = i;
      }
      if (!nz && inRun) {
        nonZeroRuns.push({ start: runStart, end: i - 1, value: raw.substring(runStart, i) });
        inRun = false;
      }
    }
    if (inRun) {
      nonZeroRuns.push({ start: runStart, end: raw.length - 1, value: raw.substring(runStart) });
    }

    const zeroCount = [...raw].filter((ch) => ch === '0').length;
    const isEmptyLike = zeroCount >= 104;
    const family = this._slotFamilyFromCode(ticketCode);
    const decodedRows = this._decodeSlotRows(raw, ticketCode, isEmptyLike);

    return {
      index,
      start,
      end,
      raw,
      header14,
      ticketCode,
      family,
      isEmptyLike,
      nonZeroRuns,
      decodedRows,
    };
  }

  static _decodeSlotRows(raw, ticketCode, isEmptyLike) {
    if (isEmptyLike) return [];

    // Common bitmap candidates (1-18 horse indices).
    const bitmapAxis = this._bitmapToHorseList(raw.substring(22, 40));
    const bitmapPartners = this._bitmapToHorseList(raw.substring(46, 64));

    const amountAt24 = this._decodeAmountWindow(raw, 24);
    const amountAt62 = this._decodeAmountWindow(raw, 62);
    const amountAt67 = this._decodeAmountWindow(raw, 67);
    const amountAt94 = this._decodeAmountWindow(raw, 94);

    const amount28 = amountAt24.value;
    const amount66 = amountAt62.value;
    const amount98 = amountAt94.value;
    const amount71 = amountAt67.value;
    const packedCode = /^[1-9]$/.test(raw[57]) ? raw[57] : null;

    const rows = [];
    const pushRow = (r) => rows.push({ ticketCode, ...r });

    // 3ren family: amount has dedicated field around index 98 in current samples.
    if (ticketCode === '8' || ticketCode === '9') {
      if (amount98 > 0) {
        pushRow({
          style: 'nagashi-or-formation',
          amount: amount98,
          amountBlock: amountAt94.block,
          amountWindow: amountAt94.window,
          axis: bitmapAxis,
          partners: bitmapPartners,
          source: 'amount@94..98',
        });
      } else {
        pushRow({
          style: 'unknown',
          amount: amount71 > 0 ? amount71 : 0,
          amountBlock: amountAt67.block,
          amountWindow: amountAt67.window,
          axis: bitmapAxis,
          partners: bitmapPartners,
          source: amount71 > 0 ? 'amount@67..71' : 'none',
        });
      }
      return rows;
    }

    // Wide BOX-like samples: amount can appear around index 71.
    if (ticketCode === '7' && amount71 > 0 && amount28 === 0) {
      pushRow({
        style: 'box-or-matrix',
        amount: amount71,
        amountBlock: amountAt67.block,
        amountWindow: amountAt67.window,
        axis: bitmapAxis,
        partners: bitmapPartners,
        source: 'amount@67..71',
      });
      return rows;
    }

    // Primary packed row.
    if (amount28 > 0) {
      rows.push({
        ticketCode,
        style: 'packed-primary',
        amount: amount28,
        amountBlock: amountAt24.block,
        amountWindow: amountAt24.window,
        key4: raw.substring(21, 25),
        source: 'amount@24..28',
      });
    }

    // Secondary packed row (observed in tanfuku/umaren-family mixed slots).
    if (amount66 > 0) {
      rows.push({
        ticketCode: packedCode || ticketCode,
        style: 'packed-secondary',
        amount: amount66,
        amountBlock: amountAt62.block,
        amountWindow: amountAt62.window,
        key4: raw.substring(59, 63),
        source: 'amount@62..66',
      });
    }

    // Fallback for sparse nagashi-like slots where amount is not yet mapped.
    if (rows.length === 0) {
      pushRow({
        style: 'unknown',
        amount: 0,
        amountBlock: null,
        axis: bitmapAxis,
        partners: bitmapPartners,
        source: 'none',
      });
    }

    return rows;
  }

  static _decodeAmountWindow(raw, start) {
    const primary = raw.substring(start, start + 5);
    const shifted = raw.substring(start + 1, start + 6);

    const primaryValue = this._decodeAmountBlock(primary);
    if (primaryValue > 0) {
      return { value: primaryValue, block: primary, window: `${start}..${start + 4}` };
    }

    const shiftedValue = this._decodeAmountBlock(shifted);
    if (shiftedValue > 0) {
      return { value: shiftedValue, block: shifted, window: `${start + 1}..${start + 5}` };
    }

    return { value: 0, block: primary, window: `${start}..${start + 4}` };
  }

  static _decodeAmountBlock(block5) {
    if (!/^[0-9]{5}$/.test(block5 || '')) return 0;
    if (block5 === '00000') return 0;

    // one-hot decimal ladder: 00001=100, 00010=1000, ..., 10000=1000000
    if (/^[01]{5}$/.test(block5)) {
      const ones = [...block5].filter((c) => c === '1').length;
      if (ones === 1) {
        const idx = block5.indexOf('1');
        return 100 * (10 ** (4 - idx));
      }
    }

    // packed variants often carry amount in the lowest digit (e.g. 50004 -> 400)
    const last = parseInt(block5[4], 10);
    if (last > 0) return last * 100;

    return 0;
  }

  static _bitmapToHorseList(bits18) {
    if (!/^[01]{18}$/.test(bits18 || '')) return [];
    const out = [];
    for (let i = 0; i < bits18.length; i++) {
      if (bits18[i] === '1') out.push(i + 1);
    }
    return out;
  }

  static _ticketCodeFromBet(bet) {
    if (!bet || typeof bet !== 'object') return null;

    const direct = [bet.ticketCode, bet.betCode, bet.code, bet.betTypeCode];
    for (const v of direct) {
      const s = typeof v === 'string' ? v.trim() : `${v ?? ''}`.trim();
      if (/^[1-9]$/.test(s)) return s;
    }

    const type = (bet.betTypeId || bet.betType || '').toString().trim().toLowerCase();
    const map = {
      tansho: '1',
      fukusho: '2',
      wakuren: '3',
      umaren: '5',
      umatan: '6',
      wide: '7',
      sanrenpuku: '8',
      sanrentan: '9',
    };
    return map[type] || null;
  }

  static _slotFamilyFromCode(code) {
    if (code === '1' || code === '2') return 'tanfuku';
    if (code === '5' || code === '6' || code === '7') return 'umaren-family';
    if (code === '3') return 'wakuren';
    if (code === '8') return 'sanrenpuku';
    if (code === '9') return 'sanrentan';
    return 'other';
  }

  static _styleKeyFromBet(bet) {
    const tf = (bet?.ticketFormat || '').toString().trim().toLowerCase();
    if (!tf) return 'normal';
    if (tf.includes('box')) return 'box';
    if (tf.includes('nagashi')) return 'nagashi';
    if (tf.includes('formation')) return 'formation';
    if (tf.includes('multi')) return 'multi';
    return tf;
  }
}

