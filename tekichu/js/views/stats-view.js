/**
 * StatsView - 統計画面
 * 依存: DataService, Chart.js
 */

import { DataService } from '../services/data-service.js';
import { formatNumber } from '../helpers.js';

export class StatsView {
  static container = null;
  static element = null;
  static charts = {};
  static currentTab = 'overview';

  static init(container) {
    this.container = container;
    this.element = document.createElement('div');
    this.element.className = 'view view--stats';
    this.element.style.display = 'none';
    container.appendChild(this.element);
  }

  static show() {
    this.render();
    this.element.style.display = '';
  }

  static hide() {
    this.element.style.display = 'none';
    this.destroyCharts();
  }

  static destroyCharts() {
    Object.values(this.charts).forEach(c => c.destroy());
    this.charts = {};
  }

  static render() {
    this.element.replaceChildren();
    this.destroyCharts();

    // タブ
    this.element.appendChild(this.createTabs());

    // コンテンツ
    const content = document.createElement('div');
    content.className = 'stats-content';
    content.id = 'stats-content';
    this.element.appendChild(content);

    this.renderTab(this.currentTab, content);
  }

  static createTabs() {
    const tabs = document.createElement('div');
    tabs.className = 'stats-tabs';

    const tabDefs = [
      { id: 'overview', label: '概要' },
      { id: 'monthly', label: '月別推移' },
      { id: 'course', label: '競馬場別' },
      { id: 'bettype', label: '式別' },
      { id: 'highpayout', label: '万馬券' },
    ];

    tabDefs.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'stats-tab';
      if (t.id === this.currentTab) btn.classList.add('stats-tab--active');
      btn.textContent = t.label;
      btn.addEventListener('click', () => {
        this.currentTab = t.id;
        this.render();
      });
      tabs.appendChild(btn);
    });

    return tabs;
  }

  static renderTab(tabId, container) {
    switch (tabId) {
      case 'overview': this.renderOverview(container); break;
      case 'monthly': this.renderMonthlyTrend(container); break;
      case 'course': this.renderByRacecourse(container); break;
      case 'bettype': this.renderByBetType(container); break;
      case 'highpayout': this.renderHighPayouts(container); break;
    }
  }

  // =========================================
  // 概要
  // =========================================

  static renderOverview(container) {
    const bets = DataService.getAllBets();
    const summary = DataService.calculateSummary(bets);

    const card = document.createElement('div');
    card.className = 'stats-overview';

    const title = document.createElement('h3');
    title.textContent = '全期間サマリー';
    card.appendChild(title);

    const grid = document.createElement('div');
    grid.className = 'stats-grid';

    const items = [
      { label: '総購入額', value: `${formatNumber(summary.bet)}円` },
      { label: '総払戻額', value: `${formatNumber(summary.payout)}円` },
      { label: '総収支', value: `${formatNumber(summary.profit)}円`, cls: summary.profit >= 0 ? 'text--plus' : 'text--minus' },
      { label: '総投票数', value: `${formatNumber(summary.count)}件` },
      { label: '的中数', value: `${formatNumber(summary.hitCount)}件` },
      { label: '的中率', value: `${summary.hitRate.toFixed(1)}%` },
      { label: '回収率', value: `${summary.returnRate.toFixed(1)}%`, cls: summary.returnRate >= 100 ? 'text--plus' : 'text--minus' },
    ];

    items.forEach(item => {
      const cell = document.createElement('div');
      cell.className = 'stats-grid__cell';

      const lbl = document.createElement('div');
      lbl.className = 'stats-grid__label';
      lbl.textContent = item.label;
      cell.appendChild(lbl);

      const val = document.createElement('div');
      val.className = 'stats-grid__value';
      if (item.cls) val.classList.add(item.cls);
      val.textContent = item.value;
      cell.appendChild(val);

      grid.appendChild(cell);
    });

    card.appendChild(grid);

    // 年別サマリー
    const years = DataService.getYears();
    if (years.length > 0) {
      const yearTitle = document.createElement('h3');
      yearTitle.textContent = '年別サマリー';
      yearTitle.style.marginTop = '20px';
      card.appendChild(yearTitle);

      years.forEach(year => {
        const yearBets = bets.filter(b => b.date.startsWith(`${year}-`));
        const ys = DataService.calculateSummary(yearBets);
        const row = document.createElement('div');
        row.className = 'stats-year-row';

        const yearLabel = document.createElement('span');
        yearLabel.textContent = `${year}年`;
        row.appendChild(yearLabel);

        const yearProfit = document.createElement('span');
        yearProfit.className = ys.profit >= 0 ? 'text--plus' : 'text--minus';
        yearProfit.textContent = `${formatNumber(ys.profit)}円 (回収率${ys.returnRate.toFixed(1)}%)`;
        row.appendChild(yearProfit);

        card.appendChild(row);
      });
    }

    container.appendChild(card);
  }

  // =========================================
  // 月別推移
  // =========================================

  static renderMonthlyTrend(container) {
    const trend = DataService.getMonthlyTrend();
    if (trend.length === 0) {
      container.textContent = 'データがありません';
      return;
    }

    // 収支推移グラフ
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-monthly';
    canvas.style.maxHeight = '300px';
    container.appendChild(canvas);

    // 累計収支
    let cumulative = 0;
    const cumulativeData = trend.map(t => {
      cumulative += t.profit;
      return cumulative;
    });

    this.charts.monthly = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: trend.map(t => t.label),
        datasets: [
          {
            label: '月別収支',
            data: trend.map(t => t.profit),
            backgroundColor: trend.map(t => t.profit >= 0 ? 'rgba(46,204,113,0.6)' : 'rgba(231,76,60,0.6)'),
            order: 2,
          },
          {
            label: '累計収支',
            data: cumulativeData,
            type: 'line',
            borderColor: '#3498db',
            backgroundColor: 'transparent',
            tension: 0.3,
            order: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { display: true } },
        scales: { y: { beginAtZero: false } },
      },
    });

    // 回収率推移グラフ
    const canvas2 = document.createElement('canvas');
    canvas2.id = 'chart-monthly-return';
    canvas2.style.maxHeight = '250px';
    canvas2.style.marginTop = '20px';
    container.appendChild(canvas2);

    this.charts.monthlyReturn = new Chart(canvas2, {
      type: 'line',
      data: {
        labels: trend.map(t => t.label),
        datasets: [{
          label: '回収率(%)',
          data: trend.map(t => t.returnRate),
          borderColor: '#e67e22',
          backgroundColor: 'rgba(230,126,34,0.1)',
          fill: true,
          tension: 0.3,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          annotation: {
            annotations: {
              line100: {
                type: 'line',
                yMin: 100,
                yMax: 100,
                borderColor: 'rgba(0,0,0,0.3)',
                borderDash: [5, 5],
              },
            },
          },
        },
        scales: { y: { beginAtZero: false } },
      },
    });
  }

  // =========================================
  // 競馬場別
  // =========================================

  static renderByRacecourse(container) {
    const data = DataService.getSummaryByRacecourse();
    if (data.length === 0) {
      container.textContent = 'データがありません';
      return;
    }

    // テーブル
    const table = document.createElement('table');
    table.className = 'stats-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['競馬場', '投票数', '購入', '払戻', '収支', '回収率'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.sort((a, b) => b.profit - a.profit).forEach(d => {
      const tr = document.createElement('tr');

      const cells = [
        d.name,
        d.count,
        formatNumber(d.bet),
        formatNumber(d.payout),
        formatNumber(d.profit),
        `${d.returnRate.toFixed(1)}%`,
      ];

      cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 4) td.className = d.profit >= 0 ? 'text--plus' : 'text--minus';
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  // =========================================
  // 式別
  // =========================================

  static renderByBetType(container) {
    const data = DataService.getSummaryByBetType();
    if (data.length === 0) {
      container.textContent = 'データがありません';
      return;
    }

    // 円グラフ（投票数割合）
    const canvas = document.createElement('canvas');
    canvas.id = 'chart-bettype';
    canvas.style.maxHeight = '250px';
    container.appendChild(canvas);

    const colors = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#1abc9c', '#e67e22', '#34495e'];

    this.charts.bettype = new Chart(canvas, {
      type: 'doughnut',
      data: {
        labels: data.map(d => d.betType),
        datasets: [{
          data: data.map(d => d.count),
          backgroundColor: colors.slice(0, data.length),
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'bottom' } },
      },
    });

    // テーブル
    const table = document.createElement('table');
    table.className = 'stats-table';
    table.style.marginTop = '20px';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    ['式別', '投票数', '的中', '的中率', '回収率'].forEach(text => {
      const th = document.createElement('th');
      th.textContent = text;
      headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    data.forEach(d => {
      const tr = document.createElement('tr');

      const cells = [
        d.betType,
        d.count,
        d.hitCount,
        `${d.hitRate.toFixed(1)}%`,
        `${d.returnRate.toFixed(1)}%`,
      ];

      cells.forEach((text, i) => {
        const td = document.createElement('td');
        td.textContent = text;
        if (i === 4) td.className = d.returnRate >= 100 ? 'text--plus' : 'text--minus';
        tr.appendChild(td);
      });

      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    container.appendChild(table);
  }

  // =========================================
  // 万馬券
  // =========================================

  static renderHighPayouts(container) {
    const bets = DataService.getHighPayouts(10000);

    if (bets.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-message';
      empty.textContent = '万馬券はまだありません';
      container.appendChild(empty);
      return;
    }

    const title = document.createElement('h3');
    title.textContent = `万馬券一覧（${bets.length}件）`;
    container.appendChild(title);

    bets.forEach(bet => {
      const card = document.createElement('div');
      card.className = 'highpayout-card';

      const course = bet.racecourseId ? DataService.getRacecourse(bet.racecourseId) : null;

      const top = document.createElement('div');
      top.className = 'highpayout-card__top';
      top.textContent = `${bet.date} ${course ? course.name : ''} ${bet.raceNumber}R`;
      card.appendChild(top);

      const mid = document.createElement('div');
      mid.className = 'highpayout-card__mid';
      mid.textContent = `${bet.betType} ${bet.horses}`;
      card.appendChild(mid);

      const bottom = document.createElement('div');
      bottom.className = 'highpayout-card__bottom';
      bottom.textContent = `${formatNumber(bet.amount)}円 → ${formatNumber(bet.payout)}円（${(bet.payout / bet.amount).toFixed(1)}倍）`;
      card.appendChild(bottom);

      container.appendChild(card);
    });
  }
}
