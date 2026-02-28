/**
 * 定数定義 - TEKICHU 競馬収支管理
 */

// アプリ設定
export const APP_CONFIG = {
  DEFAULT_TITLE: 'TEKICHU',
  SHOW_QR_DEBUG_UI: false,
};

// ストレージキー
export const STORAGE_KEYS = {
  BETS: 'bets',
  RACECOURSES: 'racecourses',
  SETTINGS: 'settings',
};

// ナビゲーション
export const NAV_ITEMS = [
  { id: 'input', label: '入力', icon: '✏️' },
  { id: 'list', label: '一覧', icon: '📋' },
  { id: 'stats', label: '集計', icon: '📊' },
  { id: 'settings', label: '設定', icon: '⚙️' },
];

// 式別定義
export const BET_TYPES = [
  { id: 'tansho', name: '単勝', code: '1', horses: 1 },
  { id: 'fukusho', name: '複勝', code: '2', horses: 1 },
  { id: 'wakuren', name: '枠連', code: '3', horses: 2 },
  { id: 'umaren', name: '馬連', code: '5', horses: 2 },
  { id: 'umatan', name: '馬単', code: '6', horses: 2 },
  { id: 'wide', name: 'ワイド', code: '7', horses: 2 },
  { id: 'sanrenpuku', name: '3連複', code: '8', horses: 3 },
  { id: 'sanrentan', name: '3連単', code: '9', horses: 3 },
];

// 競馬場カテゴリ
export const COURSE_CATEGORIES = {
  JRA: 'jra',
  LOCAL: 'local',
  OVERSEAS: 'overseas',
};

// 初期競馬場データ
export const DEFAULT_RACECOURSES = [
  // JRA 10場
  { id: 'jra_sapporo',  name: '札幌', category: 'jra', code: '01', order: 1 },
  { id: 'jra_hakodate', name: '函館', category: 'jra', code: '02', order: 2 },
  { id: 'jra_fukushima', name: '福島', category: 'jra', code: '03', order: 3 },
  { id: 'jra_niigata',  name: '新潟', category: 'jra', code: '04', order: 4 },
  { id: 'jra_tokyo',    name: '東京', category: 'jra', code: '05', order: 5 },
  { id: 'jra_nakayama', name: '中山', category: 'jra', code: '06', order: 6 },
  { id: 'jra_chukyo',   name: '中京', category: 'jra', code: '07', order: 7 },
  { id: 'jra_kyoto',    name: '京都', category: 'jra', code: '08', order: 8 },
  { id: 'jra_hanshin',  name: '阪神', category: 'jra', code: '09', order: 9 },
  { id: 'jra_kokura',   name: '小倉', category: 'jra', code: '10', order: 10 },

  // 地方 南関東
  { id: 'local_ohi',      name: '大井',   category: 'local', order: 11 },
  { id: 'local_kawasaki', name: '川崎',   category: 'local', order: 12 },
  { id: 'local_funabashi', name: '船橋', category: 'local', order: 13 },
  { id: 'local_urawa',   name: '浦和',   category: 'local', order: 14 },

  // 地方 北海道
  { id: 'local_monbetsu', name: '門別',   category: 'local', order: 15 },
  { id: 'local_obihiro',  name: '帯広（ばんえい）', category: 'local', order: 16 },

  // 地方 東北
  { id: 'local_morioka',  name: '盛岡',   category: 'local', order: 17 },
  { id: 'local_mizusawa', name: '水沢',   category: 'local', order: 18 },

  // 地方 北陸
  { id: 'local_kanazawa', name: '金沢',   category: 'local', order: 19 },

  // 地方 東海
  { id: 'local_nagoya',   name: '名古屋', category: 'local', order: 20 },
  { id: 'local_kasamatsu', name: '笠松', category: 'local', order: 21 },

  // 地方 近畿
  { id: 'local_sonoda',   name: '園田',   category: 'local', order: 22 },
  { id: 'local_himeji',   name: '姫路',   category: 'local', order: 23 },

  // 地方 四国
  { id: 'local_kochi',    name: '高知',   category: 'local', order: 24 },

  // 地方 九州
  { id: 'local_saga',     name: '佐賀',   category: 'local', order: 25 },
];
