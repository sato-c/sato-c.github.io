/**
 * InputView - 馬券入力画面（QR読取対応）
 * 依存: DataService, MessageBus, NotificationManager, QRScanService, TicketParserService
 */

import { MessageBus, NotificationManager } from '../../strata/index.js';
import { DataService } from '../services/data-service.js';
import { QRScanService } from '../services/qr-scan-service.js';
import { TicketParserService } from '../services/ticket-parser-service.js';
import { BET_TYPES } from '../constants.js';

export class InputView {
  static container = null;
  static element = null;
  static editingId = null;
  static qrResult = null;

  static init(container) {
    this.container = container;
    this.element = document.createElement('div');
    this.element.className = 'view view--input';
    this.element.style.display = 'none';
    container.appendChild(this.element);
  }

  static show() {
    this.editingId = null;
    this.qrResult = null;
    this.render();
    this.element.style.display = '';
  }

  static hide() {
    this.element.style.display = 'none';
  }

  static editRecord(record) {
    this.editingId = record.id;
    this.qrResult = null;
    this.render();
    this.element.style.display = '';
    this.fillForm(record);
  }

  static render() {
    this.element.replaceChildren();

    const form = document.createElement('div');
    form.className = 'input-form';

    // タイトル
    const title = document.createElement('h2');
    title.className = 'view-title';
    title.textContent = this.editingId ? '馬券編集' : '馬券入力';
    form.appendChild(title);

    // QRスキャンボタン（新規入力時のみ）
    if (!this.editingId) {
      const qrBtn = document.createElement('button');
      qrBtn.className = 'btn btn--qr';
      qrBtn.textContent = '📷 馬券QR読取';
      qrBtn.addEventListener('click', () => this.startQRScan());
      form.appendChild(qrBtn);
    }

    // QR結果プレビュー
    if (this.qrResult) {
      form.appendChild(this._createQRPreview());
    }

    // 日付
    form.appendChild(this.createField('date', '日付', 'date'));

    // 競馬場
    form.appendChild(this.createCourseSelect());

    // レース番号
    form.appendChild(this.createField('raceNumber', 'レース', 'number', { min: 1, max: 12 }));

    // 式別
    form.appendChild(this.createBetTypeSelect());

    // 馬番
    form.appendChild(this.createField('horses', '馬番', 'text', { placeholder: '例: 4-5 / 1-3-7' }));

    // オッズ
    form.appendChild(this.createField('odds', 'オッズ', 'number', { step: '0.1', min: 0 }));

    // 購入金額
    form.appendChild(this.createField('amount', '購入金額', 'number', { step: '100', min: 0 }));

    // 払戻金額
    form.appendChild(this.createField('payout', '払戻金額', 'number', { step: '10', min: 0 }));

    // 返還
    form.appendChild(this.createField('refund', '返還', 'number', { step: '100', min: 0 }));

    // ボタン
    const btnArea = document.createElement('div');
    btnArea.className = 'input-form__buttons';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'btn btn--primary';
    saveBtn.textContent = this.editingId ? '更新' : '保存';
    saveBtn.addEventListener('click', () => this.save());
    btnArea.appendChild(saveBtn);

    if (this.editingId) {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = 'btn btn--secondary';
      cancelBtn.textContent = 'キャンセル';
      cancelBtn.addEventListener('click', () => {
        this.editingId = null;
        MessageBus.emit('navigate', { view: 'list' });
      });
      btnArea.appendChild(cancelBtn);
    }

    form.appendChild(btnArea);
    this.element.appendChild(form);

    // デフォルト日付を今日に
    if (!this.editingId) {
      const dateInput = this.element.querySelector('#input-date');
      if (dateInput) {
        dateInput.value = new Date().toISOString().split('T')[0];
      }
    }
  }

  // --- QRスキャン ---

  static startQRScan() {
    try {
      QRScanService.start((code1, code2) => {
        this._handleQRResult(code1, code2);
      });
    } catch (e) {
      NotificationManager.error(e.message);
    }
  }

  static _handleQRResult(code1, code2) {
    try {
      const combined = TicketParserService.combineQR(code1, code2);
      const result = TicketParserService.parse(combined);
      this.qrResult = result;

      if (result.bets.length === 0) {
        NotificationManager.warning('QR読取成功。馬券データの解析に失敗しました。ヘッダー情報のみ反映します。');
        this._applyHeaderToForm(result);
      } else if (result.bets.length === 1) {
        NotificationManager.success('QR読取完了！');
        this._applySingleBet(result, result.bets[0]);
      } else {
        NotificationManager.success(`QR読取完了！ ${result.bets.length}点の馬券を検出`);
        this.render();
      }
    } catch (e) {
      console.error('QR解析エラー:', e);
      NotificationManager.error('QRコードの解析に失敗しました: ' + e.message);
    }
  }

  static _applyHeaderToForm(result) {
    this.render();
    this._setFormHeader(result);
  }

  static _applySingleBet(result, bet) {
    this.render();
    this._setFormHeader(result);

    const betSelect = this.element.querySelector('#input-betType');
    if (betSelect) betSelect.value = bet.betType;

    const horsesInput = this.element.querySelector('#input-horses');
    if (horsesInput) horsesInput.value = bet.horses;

    const amountInput = this.element.querySelector('#input-amount');
    if (amountInput) amountInput.value = bet.amount;
  }

  static _setFormHeader(result) {
    const dateInput = this.element.querySelector('#input-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }

    const courseSelect = this.element.querySelector('#input-racecourse');
    if (courseSelect && result.racecourseId) {
      courseSelect.value = result.racecourseId;
    }

    const raceInput = this.element.querySelector('#input-raceNumber');
    if (raceInput && result.raceNumber) {
      raceInput.value = result.raceNumber;
    }
  }

  static _createQRPreview() {
    const result = this.qrResult;
    const wrap = document.createElement('div');
    wrap.className = 'qr-preview';

    const title = document.createElement('div');
    title.className = 'qr-preview__title';
    title.textContent = `読取結果: ${result.bets.length}点`;
    wrap.appendChild(title);

    const courses = DataService.getAllRacecourses();
    const course = courses.find(c => c.id === result.racecourseId);
    const info = document.createElement('div');

    const addItem = (label, value) => {
      const row = document.createElement('div');
      row.className = 'qr-preview__item';
      const lbl = document.createElement('span');
      lbl.textContent = label;
      const val = document.createElement('span');
      val.textContent = value;
      row.appendChild(lbl);
      row.appendChild(val);
      info.appendChild(row);
    };

    addItem('競馬場', course ? course.name : `コード:${result.venueCode}`);
    addItem('レース', `${result.raceNumber}R`);
    addItem('券種', result.ticketTypeName);
    wrap.appendChild(info);

    const betsArea = document.createElement('div');
    betsArea.className = 'qr-preview__bets';

    result.bets.forEach((bet) => {
      const row = document.createElement('div');
      row.className = 'qr-preview__bet';

      const betInfo = document.createElement('div');
      betInfo.textContent = `${bet.betType} ${bet.horses}`;
      row.appendChild(betInfo);

      const betAmount = document.createElement('div');
      betAmount.style.fontSize = '12px';
      betAmount.style.color = 'var(--text-muted)';
      let amountText = `${bet.amount.toLocaleString()}円`;
      if (bet.detail) amountText += ` (${bet.detail})`;
      betAmount.textContent = amountText;
      row.appendChild(betAmount);

      betsArea.appendChild(row);
    });
    wrap.appendChild(betsArea);

    const actions = document.createElement('div');
    actions.className = 'qr-preview__actions';

    const saveAllBtn = document.createElement('button');
    saveAllBtn.className = 'btn btn--primary';
    saveAllBtn.textContent = '全てまとめて保存';
    saveAllBtn.addEventListener('click', () => this._saveAllQRBets());
    actions.appendChild(saveAllBtn);

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn--secondary';
    clearBtn.textContent = 'クリア';
    clearBtn.addEventListener('click', () => {
      this.qrResult = null;
      this.render();
    });
    actions.appendChild(clearBtn);

    wrap.appendChild(actions);
    return wrap;
  }

  static async _saveAllQRBets() {
    if (!this.qrResult || this.qrResult.bets.length === 0) return;

    const result = this.qrResult;
    const date = this.element.querySelector('#input-date')?.value
                 || new Date().toISOString().split('T')[0];

    let count = 0;
    for (const bet of result.bets) {
      const record = {
        date,
        racecourseId: result.racecourseId || null,
        raceNumber: result.raceNumber || 0,
        betType: bet.betType,
        horses: bet.horses,
        odds: 0,
        amount: bet.amount,
        payout: 0,
        refund: 0,
        source: 'qr',
      };
      if (bet.ticketFormat) {
        record.ticketFormat = bet.ticketFormat;
      }
      if (bet.detail) {
        record.detail = bet.detail;
      }
      await DataService.saveBet(record);
      count++;
    }

    NotificationManager.success(`${count}件の馬券を保存しました`);
    MessageBus.emit('record-saved');
    this.qrResult = null;
    this.render();
  }

  // --- 既存のフォーム系メソッド ---

  static createField(id, label, type, attrs = {}) {
    const group = document.createElement('div');
    group.className = 'form-group';

    const lbl = document.createElement('label');
    lbl.className = 'form-label';
    lbl.textContent = label;
    lbl.htmlFor = `input-${id}`;
    group.appendChild(lbl);

    const input = document.createElement('input');
    input.type = type;
    input.id = `input-${id}`;
    input.className = 'form-input';
    Object.entries(attrs).forEach(([k, v]) => {
      input.setAttribute(k, v);
    });
    group.appendChild(input);

    return group;
  }

  static createCourseSelect() {
    const group = document.createElement('div');
    group.className = 'form-group';

    const lbl = document.createElement('label');
    lbl.className = 'form-label';
    lbl.textContent = '競馬場';
    lbl.htmlFor = 'input-racecourse';
    group.appendChild(lbl);

    const select = document.createElement('select');
    select.id = 'input-racecourse';
    select.className = 'form-select';

    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '選択してください';
    select.appendChild(emptyOpt);

    const courses = DataService.getAllRacecourses();
    let currentCategory = '';

    courses.forEach(c => {
      if (c.category !== currentCategory) {
        currentCategory = c.category;
        const optgroup = document.createElement('optgroup');
        optgroup.label = c.category === 'jra' ? 'JRA' :
                         c.category === 'local' ? '地方' : '海外';
        courses.filter(cc => cc.category === currentCategory).forEach(cc => {
          const opt = document.createElement('option');
          opt.value = cc.id;
          opt.textContent = cc.name;
          optgroup.appendChild(opt);
        });
        select.appendChild(optgroup);
      }
    });

    group.appendChild(select);
    return group;
  }

  static createBetTypeSelect() {
    const group = document.createElement('div');
    group.className = 'form-group';

    const lbl = document.createElement('label');
    lbl.className = 'form-label';
    lbl.textContent = '式別';
    lbl.htmlFor = 'input-betType';
    group.appendChild(lbl);

    const select = document.createElement('select');
    select.id = 'input-betType';
    select.className = 'form-select';

    BET_TYPES.forEach(bt => {
      const opt = document.createElement('option');
      opt.value = bt.name;
      opt.textContent = bt.name;
      select.appendChild(opt);
    });

    group.appendChild(select);
    return group;
  }

  static fillForm(record) {
    const set = (id, val) => {
      const el = this.element.querySelector(`#input-${id}`);
      if (el) el.value = val || '';
    };

    set('date', record.date);
    set('raceNumber', record.raceNumber);
    set('horses', record.horses);
    set('odds', record.odds);
    set('amount', record.amount);
    set('payout', record.payout);
    set('refund', record.refund);

    const courseSelect = this.element.querySelector('#input-racecourse');
    if (courseSelect) courseSelect.value = record.racecourseId || '';

    const betSelect = this.element.querySelector('#input-betType');
    if (betSelect) betSelect.value = record.betType || '';
  }

  static async save() {
    const get = (id) => {
      const el = this.element.querySelector(`#input-${id}`);
      return el ? el.value : '';
    };

    const date = get('date');
    if (!date) {
      NotificationManager.warning('日付を入力してください');
      return;
    }

    const bet = {
      date,
      racecourseId: get('racecourse') || null,
      raceNumber: parseInt(get('raceNumber')) || 0,
      betType: this.element.querySelector('#input-betType')?.value || '',
      horses: get('horses'),
      odds: parseFloat(get('odds')) || 0,
      amount: parseInt(get('amount')) || 0,
      payout: parseInt(get('payout')) || 0,
      refund: parseInt(get('refund')) || 0,
      source: 'manual',
    };

    if (this.editingId) {
      bet.id = this.editingId;
      const existing = DataService.getBet(this.editingId);
      if (existing) {
        bet.createdAt = existing.createdAt;
      }
    }

    await DataService.saveBet(bet);
    NotificationManager.success(this.editingId ? '更新しました' : '保存しました');
    MessageBus.emit('record-saved');

    this.editingId = null;
    this.render();
  }
}
