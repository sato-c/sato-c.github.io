# AGENTS.md

このリポジトリでは、`claude.md` の方針を踏襲しつつ、Codex 実行時はこの `AGENTS.md` を優先ルールとします。

## 目的
- Webアプリ由来の実装を、再利用可能なJSライブラリとして維持する。
- 変更時は「互換性」「安全性」「可読性」を優先する。

## 技術方針
- Vanilla JavaScript（ES Modules）を使用する。
- 依存フレームワーク（React/Vue/Angular）には寄せない。
- TypeScript前提の書き換えは行わない（必要性が明確な場合のみ提案）。

## レイヤー方針
- `Manager` 層: 状態管理・オーケストレーション。
- `Adapter` 層: 外部I/O（storage/auth/sync等）の実装差し替え点。
- `Utils` 層: 副作用の少ない汎用処理。
- モジュール間連携は `MessageBus` を優先する。

## ストレージ方針
- UI/Module/Manager から `localStorage` を直接叩かない。
- 永続化は `StorageManager` 経由で扱う。
- 例外: Adapter層（例: `LocalStorageAdapter`）と Auth 実装の内部処理は許可。

## DOM操作方針
- `createElement` / `appendChild` など明示的なDOM操作を使う。
- 不要な `innerHTML` 依存は避ける（XSS・保守性の観点）。

## 設計ルール
- Manager間の直接呼び出しは可。ただし循環依存は禁止。
- 例外処理は握りつぶさず、`ErrorManager` 連携または文脈付きログを残す。
- `init()` の多重呼び出しで副作用（イベント重複登録）が起きない設計を優先する。

## 実装規約
- クラス名: `PascalCase`
- 関数/変数: `camelCase`
- 定数: `UPPER_SNAKE_CASE`
- 既存の公開API（エクスポート名・引数）を壊す変更は、互換レイヤーか移行手順を付与する。

## レビュー観点
- ライブラリ化に伴う不整合（アプリ依存パス・DOM前提・グローバル依存）を最優先で検出。
- 非同期処理の成功/失敗判定の厳密性を確認。
- 認証付き通信のキャッシュ混在や情報漏えいリスクを確認。

## ドキュメント運用
- `claude.md` は背景資料として維持する。
- Codex向けの実行ルールは本 `AGENTS.md` を正とする。
- ルール変更時は可能な範囲で `claude.md` と本ファイルの整合を保つ。
