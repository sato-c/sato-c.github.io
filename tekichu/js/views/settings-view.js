/**
 * SettingsView - 設定画面
 * 依存: DataService, CsvImportService, SystemUIManager, NotificationManager
 */

import { SystemUIManager, NotificationManager, Utils } from '../../strata/index.js';
import { DataService } from '../services/data-service.js';
import { CsvImportService } from '../services/csv-import-service.js';
import { formatNumber } from '../helpers.js';

export class SettingsView {
  static container = null;
  static element = null;

  static init(container) {
    this.container = container;
    this.element = document.createElement('div');
    this.element.className = 'view view--settings';
    this.element.style.display = 'none';
    container.appendChild(this.element);
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

    const title = document.createElement('h2');
    title.className = 'view-title';
    title.textContent = '設定';
    this.element.appendChild(title);

    // CSVインポート
    this.element.appendChild(this.createCsvImportSection());

    // 競馬場管理
    this.element.appendChild(this.createRacecourseSection());

    // データ管理
    this.element.appendChild(this.createDataSection());
  }

  // =========================================
  // CSVインポート
  // =========================================

  static createCsvImportSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const heading = document.createElement('h3');
    heading.textContent = 'JRA-VAN CSVインポート';
    section.appendChild(heading);

    const lastDate = DataService.getLastImportDate();
    if (lastDate) {
      const info = document.createElement('p');
      info.className = 'settings-info';
      info.textContent = `最終インポート: ${lastDate}`;
      section.appendChild(info);
    }

    const desc = document.createElement('p');
    desc.className = 'settings-desc';
    desc.textContent = 'JRA-VANの収支履歴CSVを選択してインポートします。前回インポート以降のデータのみ取り込みます。';
    section.appendChild(desc);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.csv';
    fileInput.id = 'csv-file-input';
    fileInput.style.display = 'none';
    section.appendChild(fileInput);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn--primary';
    importBtn.textContent = 'CSVファイルを選択';
    importBtn.addEventListener('click', () => fileInput.click());
    section.appendChild(importBtn);

    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      importBtn.textContent = 'インポート中...';
      importBtn.disabled = true;

      try {
        const result = await CsvImportService.importFromFile(file);
        NotificationManager.success(`${result.imported}件インポートしました（スキップ: ${result.skipped}件）`);
        this.render();
      } catch (error) {
        NotificationManager.error(`インポート失敗: ${error.message}`);
        console.error('[CsvImport]', error);
      } finally {
        importBtn.textContent = 'CSVファイルを選択';
        importBtn.disabled = false;
        fileInput.value = '';
      }
    });

    return section;
  }

  // =========================================
  // 競馬場管理
  // =========================================

  static createRacecourseSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const heading = document.createElement('h3');
    heading.textContent = '競馬場管理';
    section.appendChild(heading);

    // 追加ボタン
    const addBtn = document.createElement('button');
    addBtn.className = 'btn btn--secondary';
    addBtn.textContent = '+ 競馬場を追加';
    addBtn.addEventListener('click', () => this.addRacecourse());
    section.appendChild(addBtn);

    // カテゴリ別リスト
    const categories = [
      { id: 'jra', label: 'JRA' },
      { id: 'local', label: '地方' },
      { id: 'overseas', label: '海外' },
    ];

    categories.forEach(cat => {
      const courses = DataService.getRacecoursesByCategory(cat.id);
      if (courses.length === 0) return;

      const catLabel = document.createElement('h4');
      catLabel.textContent = `${cat.label}（${courses.length}場）`;
      catLabel.style.marginTop = '12px';
      section.appendChild(catLabel);

      const list = document.createElement('div');
      list.className = 'course-list';

      courses.forEach(c => {
        const item = document.createElement('div');
        item.className = 'course-item';

        const name = document.createElement('span');
        name.textContent = c.name;
        item.appendChild(name);

        // 海外のみ削除可能
        if (c.category === 'overseas') {
          const delBtn = document.createElement('button');
          delBtn.className = 'btn btn--small btn--danger';
          delBtn.textContent = '削除';
          delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const ok = await SystemUIManager.confirm(`${c.name}を削除しますか？`);
            if (ok) {
              await DataService.deleteRacecourse(c.id);
              NotificationManager.success('削除しました');
              this.render();
            }
          });
          item.appendChild(delBtn);
        }

        list.appendChild(item);
      });

      section.appendChild(list);
    });

    return section;
  }

  static async addRacecourse() {
    const name = await SystemUIManager.prompt('競馬場名を入力');
    if (!name) return;

    const category = await SystemUIManager.select('カテゴリを選択', ['地方', '海外']);
    if (!category) return;

    const catMap = { '地方': 'local', '海外': 'overseas' };

    await DataService.saveRacecourse({
      name,
      category: catMap[category] || 'overseas',
    });

    NotificationManager.success(`${name}を追加しました`);
    this.render();
  }

  // =========================================
  // データ管理
  // =========================================

  static createDataSection() {
    const section = document.createElement('div');
    section.className = 'settings-section';

    const heading = document.createElement('h3');
    heading.textContent = 'データ管理';
    section.appendChild(heading);

    // データ件数
    const bets = DataService.getAllBets();
    const info = document.createElement('p');
    info.className = 'settings-info';
    info.textContent = `登録データ: ${formatNumber(bets.length)}件`;
    section.appendChild(info);

    // エクスポート
    const exportBtn = document.createElement('button');
    exportBtn.className = 'btn btn--secondary';
    exportBtn.textContent = 'JSONエクスポート';
    exportBtn.addEventListener('click', () => this.exportJSON());
    section.appendChild(exportBtn);

    // インポート
    const importFileInput = document.createElement('input');
    importFileInput.type = 'file';
    importFileInput.accept = '.json';
    importFileInput.style.display = 'none';
    section.appendChild(importFileInput);

    const importBtn = document.createElement('button');
    importBtn.className = 'btn btn--secondary';
    importBtn.textContent = 'JSONインポート';
    importBtn.style.marginLeft = '8px';
    importBtn.addEventListener('click', () => importFileInput.click());
    section.appendChild(importBtn);

    importFileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const data = JSON.parse(text);

        const ok = await SystemUIManager.confirm(
          '既存データを上書きしてインポートしますか？\nこの操作は取り消せません。'
        );
        if (!ok) return;

        const result = await DataService.importAllData(data);
        NotificationManager.success(`インポート完了: ${result.bets}件`);
        this.render();
      } catch (error) {
        NotificationManager.error(`インポート失敗: ${error.message}`);
      }
      importFileInput.value = '';
    });

    // 全データ削除
    const dangerArea = document.createElement('div');
    dangerArea.style.marginTop = '20px';

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn btn--danger';
    deleteBtn.textContent = '全データ削除';
    deleteBtn.addEventListener('click', async () => {
      const ok = await SystemUIManager.confirm(
        '本当に全データを削除しますか？\nこの操作は取り消せません。'
      );
      if (!ok) return;

      const ok2 = await SystemUIManager.confirm('最終確認: 本当に削除しますか？');
      if (!ok2) return;

      const { StorageManager } = await import('../../strata/index.js');
      const { STORAGE_KEYS } = await import('../constants.js');
      await StorageManager.save(STORAGE_KEYS.BETS, []);
      await StorageManager.save(STORAGE_KEYS.SETTINGS, {});
      NotificationManager.success('全データを削除しました');
      this.render();
    });
    dangerArea.appendChild(deleteBtn);
    section.appendChild(dangerArea);

    return section;
  }

  static exportJSON() {
    const data = DataService.exportAllData();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `tekichu_backup_${Utils.formatDate(new Date(), 'YYYYMMDD')}.json`;
    a.click();

    URL.revokeObjectURL(url);
    NotificationManager.success('エクスポートしました');
  }
}
