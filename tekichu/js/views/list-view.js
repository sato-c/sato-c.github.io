/**
 * ListView - 馬券一覧画面
 * 依存: DataService, MessageBus, SystemUIManager, NotificationManager
 */

import { MessageBus, SystemUIManager, NotificationManager } from '../../strata/index.js';
import { DataService } from '../services/data-service.js';
import { formatNumber } from '../helpers.js';

export class ListView {
  static container = null;
  static element = null;
  static currentYear = null;
  static currentMonth = null;

  static init(container) {
    this.container = container;
    this.element = document.createElement('div');
    this.element.className = 'view view--list';
    this.element.style.display = 'none';
    container.appendChild(this.element);

    const now = new Date();
    this.currentYear = now.getFullYear();
    this.currentMonth = now.getMonth() + 1;
  }

  static show() {
    this.render();
    this.element.style.display = '';
  }

  static hide() {
    this.element.style.display = 'none';
  }

  static render() {
    this.element.replaceChildren();

    // 月ナビゲーション
    this.element.appendChild(this.createMonthNav());

    // 月サマリー
    const bets = DataService.getBetsByMonth(this.currentYear, this.currentMonth);
    this.element.appendChild(this.createSummary(bets));

    // 一覧
    if (bets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-message';
      empty.textContent = 'この月のデータはありません';
      this.element.appendChild(empty);
    } else {
      this.element.appendChild(this.createBetList(bets));
    }
  }

  static createMonthNav() {
    const nav = document.createElement('div');
    nav.className = 'month-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'btn btn--icon';
    prevBtn.textContent = '◀';
    prevBtn.addEventListener('click', () => this.changeMonth(-1));
    nav.appendChild(prevBtn);

    const label = document.createElement('span');
    label.className = 'month-nav__label';
    label.textContent = `${this.currentYear}年${this.currentMonth}月`;
    nav.appendChild(label);

    const nextBtn = document.createElement('button');
    nextBtn.className = 'btn btn--icon';
    nextBtn.textContent = '▶';
    nextBtn.addEventListener('click', () => this.changeMonth(1));
    nav.appendChild(nextBtn);

    return nav;
  }

  static changeMonth(delta) {
    this.currentMonth += delta;
    if (this.currentMonth > 12) {
      this.currentMonth = 1;
      this.currentYear++;
    } else if (this.currentMonth < 1) {
      this.currentMonth = 12;
      this.currentYear--;
    }
    this.render();
  }

  static createSummary(bets) {
    const summary = DataService.calculateSummary(bets);
    const div = document.createElement('div');
    div.className = 'summary-card';

    const items = [
      { label: '購入', value: formatNumber(summary.bet), unit: '円' },
      { label: '払戻', value: formatNumber(summary.payout), unit: '円' },
      { label: '収支', value: formatNumber(summary.profit), unit: '円', highlight: true },
      { label: '的中率', value: summary.hitRate.toFixed(1), unit: '%' },
      { label: '回収率', value: summary.returnRate.toFixed(1), unit: '%' },
    ];

    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'summary-card__item';
      if (item.highlight) {
        row.classList.add(summary.profit >= 0 ? 'summary--plus' : 'summary--minus');
      }

      const lbl = document.createElement('span');
      lbl.className = 'summary-card__label';
      lbl.textContent = item.label;
      row.appendChild(lbl);

      const val = document.createElement('span');
      val.className = 'summary-card__value';
      val.textContent = `${item.value}${item.unit}`;
      row.appendChild(val);

      div.appendChild(row);
    });

    return div;
  }

  static createBetList(bets) {
    // 日付ごとにグループ化
    const grouped = {};
    bets.sort((a, b) => b.date.localeCompare(a.date) || b.raceNumber - a.raceNumber);

    bets.forEach(b => {
      if (!grouped[b.date]) grouped[b.date] = [];
      grouped[b.date].push(b);
    });

    const list = document.createElement('div');
    list.className = 'bet-list';

    Object.entries(grouped).forEach(([date, dayBets]) => {
      // 日付ヘッダー
      const daySummary = DataService.calculateSummary(dayBets);
      const header = document.createElement('div');
      header.className = 'bet-list__date-header';

      const dateLabel = document.createElement('span');
      dateLabel.textContent = date;
      header.appendChild(dateLabel);

      const dayResult = document.createElement('span');
      dayResult.className = daySummary.profit >= 0 ? 'text--plus' : 'text--minus';
      dayResult.textContent = `${formatNumber(daySummary.profit)}円`;
      header.appendChild(dayResult);

      list.appendChild(header);

      // 各馬券
      dayBets.forEach(bet => {
        list.appendChild(this.createBetItem(bet));
      });
    });

    return list;
  }

  static createBetItem(bet) {
    const item = document.createElement('div');
    item.className = 'bet-item';
    if (bet.payout > 0) item.classList.add('bet-item--hit');

    const course = bet.racecourseId ? DataService.getRacecourse(bet.racecourseId) : null;

    // 上段: 競馬場 レース 式別 馬番
    const top = document.createElement('div');
    top.className = 'bet-item__top';
    top.textContent = `${course ? course.name : '?'} ${bet.raceNumber}R ${bet.betType} ${bet.horses}`;
    item.appendChild(top);

    // 下段: 金額情報
    const bottom = document.createElement('div');
    bottom.className = 'bet-item__bottom';

    const amountSpan = document.createElement('span');
    amountSpan.textContent = `${formatNumber(bet.amount)}円`;
    bottom.appendChild(amountSpan);

    if (bet.payout > 0) {
      const payoutSpan = document.createElement('span');
      payoutSpan.className = 'text--plus';
      payoutSpan.textContent = ` → ${formatNumber(bet.payout)}円`;
      bottom.appendChild(payoutSpan);
    }

    if (bet.refund > 0) {
      const refundSpan = document.createElement('span');
      refundSpan.className = 'text--refund';
      refundSpan.textContent = ` (返還${formatNumber(bet.refund)}円)`;
      bottom.appendChild(refundSpan);
    }

    item.appendChild(bottom);

    // タップで操作
    item.addEventListener('click', () => this.showBetActions(bet));

    return item;
  }

  static async showBetActions(bet) {
    const course = bet.racecourseId ? DataService.getRacecourse(bet.racecourseId) : null;
    const result = await SystemUIManager.showModal({
      title: `${course ? course.name : ''} ${bet.raceNumber}R`,
      message: `${bet.betType} ${bet.horses}\n${formatNumber(bet.amount)}円`,
      buttons: ['編集', '削除', '閉じる'],
    });

    if (result === '編集') {
      MessageBus.emit('navigate', { view: 'input', record: bet });
    } else if (result === '削除') {
      const confirm = await SystemUIManager.confirm('この馬券を削除しますか？');
      if (confirm) {
        await DataService.deleteBet(bet.id);
        NotificationManager.success('削除しました');
        MessageBus.emit('record-deleted');
        this.render();
      }
    }
  }
}
