# STRATA JS Reference

このドキュメントは、`d:/strata` 配下の JavaScript 実装の役割と使い方をまとめたリファレンスです。

## 1. 全体構成

- `index.js`: SDKエントリーポイント。各クラスを再エクスポート。
- `core/`: 共通機能（イベントバス、通知、エラー、ユーティリティ、i18n）。
- `storage/`: 永続化・同期（Adapter基底 + Manager）。
- `auth/`: 認証（Adapter基底 + Manager + Google OAuth実装）。
- `ui/`: UI管理（通知/モーダル、パネル）。
- `api/`: HTTP通信（キャッシュ、リトライ、タイムアウト、認証ヘッダ）。
- `smoke/`: スモークテスト。

---

## 2. エントリーポイント

### `index.js`

公開API（抜粋）:
- Core: `Utils`, `I18n`, `MessageBus`, `NotificationManager`, `ErrorManager`
- Storage: `StorageAdapter`, `StorageManager`, `LocalStorageAdapter`
- Auth: `AuthAdapter`, `AuthManager`, `GoogleOAuthAdapter`
- UI: `SystemUIManager`, `PanelManager`
- API: `APIManager`
- Sync: `SyncAdapter`, `SyncManager`

---

## 3. Core

### `core/i18n.js` (`I18n`)

目的:
- 最小構成の多言語リソース管理。

主要メソッド:
- `I18n.setLocale(locale)`: ロケール切替（`ja`, `en`）。
- `I18n.getLocale()`: 現在ロケール取得。
- `I18n.t(key, vars?, fallback?)`: キー解決（見つからなければ `ja` にフォールバック）。

現在の主なキー:
- `ui.common.ok`, `ui.common.cancel`, `ui.common.closeSymbol`
- `ui.panel.refreshSymbol`, `ui.panel.refreshTitle`, `ui.panel.maximizeSymbol`, `ui.panel.maximizeTitle`, `ui.panel.closeTitle`
- `ui.system.confirmTitle`, `ui.system.inputTitle`, `ui.system.selectTitle`, `ui.system.noItems`

### `core/message-bus.js` (`MessageBus`)

目的:
- モジュール間イベント連携。

主要メソッド:
- `on(action, callback)`: 購読。`unsubscribe` 関数を返す。
- `off(action, callback)`: 購読解除。
- `send({ action, data })`: intent送信。
- `emit(action, data?)`: 簡易送信。
- `clear()`: 全購読解除。

### `core/notification-manager.js` (`NotificationManager`)

目的:
- 通知メッセージの組み立てと発行。

主な振る舞い:
- `show(message, type, priority)` で通知オブジェクトを作成し、`MessageBus` の `show-notification` を発火。
- `success/error/warning/info` のショートカットあり。

### `core/error-manager.js` (`ErrorManager`)

目的:
- エラーのロギングとユーザー向け通知。

主な振る舞い:
- `handle(error, context?)` でログ出力し、必要時 `NotificationManager.error(...)`。
- `AbortError` は通知抑制。

### `core/utils.js` (`Utils`)

主なユーティリティ:
- `generateId`, `deepCopy`, `debounce`, `sleep`, `escapeHTML`, `truncate`, `unique`, `formatDate`, `formatTime`, `adjustBrightness`

---

## 4. Storage

### `storage/storage-adapter.js` (`StorageAdapter`)

目的:
- 永続化実装の抽象基底。

実装必須メソッド:
- `save(key, data)`
- `load(key, defaultValue?)`
- `remove(key)`
- `getAllKeys(prefix?)`

### `storage/adapters/local-storage-adapter.js` (`LocalStorageAdapter`)

目的:
- `localStorage` 実装。

特徴:
- プレフィックス付き保存（デフォルト: `strata_`）。
- `load` は JSON パースを試行し、失敗時は生文字列を返却。

### `storage/storage-manager.js` (`StorageManager`)

目的:
- 永続化アクセスの窓口。

主要メソッド:
- `setAdapter(adapter)`, `getAdapter()`
- `init()`, `destroy()`
- `save/load/remove/getAllKeys`
- `getIsOnline()`

ポイント:
- `init()` は冪等。
- `destroy()` で online/offline リスナー解除。
- `save/remove` 成功時に `storage-changed` を `MessageBus.emit`。

### `storage/sync-adapter.js` (`SyncAdapter`)

目的:
- リモート同期実装の抽象基底。

実装必須:
- `save(data, token)`
- `load(token)`

### `storage/sync-manager.js` (`SyncManager`)

目的:
- バックアップ/復元のオーケストレーション。

主要メソッド:
- `setAdapter(adapter)`, `init()`
- `backup(data)`, `restore()`
- `getIsSyncing()`, `getLastBackup()`, `clearLocalBackup()`

ポイント:
- `AuthManager` のログイン状態が必要。
- ローカル保存・リモート保存の結果を厳密チェック。
- 進行イベント: `sync-start`, `sync-complete`。

---

## 5. Auth

### `auth/auth-adapter.js` (`AuthAdapter`)

目的:
- 認証方式の抽象基底。

実装必須:
- `init`, `login`, `logout`, `getToken`, `isAuthenticated`, `getUserInfo`, `handleCallback`

### `auth/adapters/google-oauth-adapter.js` (`GoogleOAuthAdapter`)

目的:
- Google OAuth 2.0（Implicit flow）実装。

ポイント:
- `login()` でGoogle認証画面へ遷移。
- `handleCallback()` で `access_token`, `expires_in`, `state` を検証。
- `expires_in` 不正時は例外。
- 状態は `localStorage` に保存/復元。

### `auth/auth-manager.js` (`AuthManager`)

目的:
- 認証の統一窓口。

主要メソッド:
- `setAdapter(adapter)`
- `init()`, `destroy()`
- `login()`, `logout()`
- `getToken()`, `isAuthenticated()`, `getUserInfo()`

ポイント:
- `init()` は冪等。
- `auth-changed` イベントを発行。

---

## 6. API

### `api/api-manager.js` (`APIManager`)

目的:
- HTTP通信の共通化。

主要メソッド:
- `init()`, `destroy()`
- `get/post/put/delete`
- `request(method, url, data, options)`
- `clearCache(pattern?)`, `isOnline()`, `getPendingRequests()`

主要オプション:
- `auth`: `true` で `Authorization` ヘッダ付与。
- `cache`, `cacheKey`, `cacheTTL`
- `timeout`, `retry`, `retryDelay`, `headers`

ポイント:
- `buildCacheKey()` で認証リクエストのキャッシュをユーザー別に分離。
- `destroy()` で online/offline リスナー解除、進行中リクエスト中断。

---

## 7. UI

### `ui/system-ui-manager.js` (`SystemUIManager`)

目的:
- 通知、モーダル、ダイアログ管理。

主要メソッド:
- `init()`, `destroy()`
- `showNotification()/hideNotification()`
- `showModal()/closeModal()`
- `showDialog()`
- `confirm()/prompt()/select()`
- `showListModal()/refreshListModal()`

ポイント:
- `show-notification` を購読（`MessageBus.on` の unsubscribe を保持）。
- 文言は一部 `I18n.t(...)` 化済み。

### `ui/panel-manager.js` (`PanelManager`)

目的:
- フローティングパネルの生成・表示・保存・操作。

主要メソッド:
- `init(options)`, `destroy()`
- `createPanel(panelConfig, savedState?)`, `closePanel(panelId)`
- `bringToFront(panelId)`, `recalculateZIndexes()`
- `loadPanelState()`, `loadAllInstances()`, `deleteInstance()`

ポイント:
- `request-save`, `request-save-immediate` を購読。
- `bringToFront()` で `.panel--active` を付け替え。
- ヘッダ文言の一部を `I18n.t(...)` 化。

---

## 8. 初期化と終了の推奨順

初期化（例）:
1. Adapter準備（Storage/Auth/Sync）
2. `StorageManager.init()`
3. `AuthManager.init()`
4. `APIManager.init()`
5. `SystemUIManager.init()`
6. `PanelManager.init()`

終了（例）:
1. `PanelManager.destroy()`
2. `SystemUIManager.destroy()`
3. `APIManager.destroy()`
4. `StorageManager.destroy()`
5. `AuthManager.destroy()`

---

## 9. MessageBusアクション（主要）

- `show-notification`: 通知表示要求
- `request-save`: パネル保存要求
- `request-save-immediate`: パネル即時保存要求
- `storage-changed`: 永続化データ更新通知
- `auth-changed`: 認証状態更新通知
- `sync-start` / `sync-complete`: 同期進行通知
- `online` / `offline`: 接続状態通知

---

## 10. テスト

### `smoke/smoke-test.mjs`

検証内容（抜粋）:
- `init()` の冪等性
- `destroy() -> init()` 再初期化
- `PanelManager` の `.panel--active` 挙動
- `APIManager` の認証キャッシュ分離
- `GoogleOAuthAdapter` の `expires_in` 検証
- `I18n` の `ja/en` 切替

実行:
```bash
node smoke/smoke-test.mjs
```

---

## 11. 今後の拡張メモ

- `core/locales/ja.js`, `core/locales/en.js` への分割
- 通知/エラー文言（`AuthManager`, `SyncManager`, `ErrorManager`）の `I18n` 移行
- ESLint/CIで「文字列直書き禁止（UI層）」を段階導入
