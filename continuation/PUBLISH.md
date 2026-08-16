# 公開・更新手順

## 公開URL

- 通常公開: `https://kanjiki.github.io/coc-player-type/continuation/`
- 友人テスト: `https://kanjiki.github.io/coc-player-type/continuation/?test=1`
- テスターID付き: `https://kanjiki.github.io/coc-player-type/continuation/?test=1&tester=T01`
- 管理画面: `https://kanjiki.github.io/coc-player-type/continuation/manage.html`

## 継続先データを更新する

1. 管理画面を開く
2. 元シナリオ、継続先、理由、根拠などを追加・修正する
3. `公開データをダウンロード` を押す
4. `GitHubへアップロード` を開く
5. ダウンロードした `data-gzip.js` をドラッグして上書きする
6. `Commit changes` を押す

公開URLは変わりません。

## 文面・見た目を変える

- タイトル・説明・質問: `index.html`
- 色・余白・スマートフォン表示: `styles.css`
- 検索処理: `app.js`
- バージョン・表示件数: `config.js`
- データ編集画面: `manage.html` / `manage.js`

GitHub上でファイルを開き、鉛筆アイコンから編集してコミットします。
