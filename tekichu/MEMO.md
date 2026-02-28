# MEMO

## 起動手順（ローカル確認用）
1. `tekichu` フォルダへ移動
2. ローカルサーバー起動

```powershell
cd d:\sato-c.github.io\tekichu
npx --yes serve . -l 4173
```

## アクセス先
- PC: `http://localhost:4173/`
- スマホ: `http://<PCのIP>:4173/`

## 注意
- `d:\sato-c.github.io` で起動すると、`/css` や `/js` が 404 になることがある。
- 必ず `tekichu` 直下で起動すること。
