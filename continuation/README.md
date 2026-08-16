# この自陣、次どこ行く？

CoC継続探索者向けシナリオ検索の、友人テスト版と正式公開版を兼ねる静的サイトです。

## URL

- 正式公開表示: `https://kanjiki.github.io/coc-player-type/continuation/`
- 友人テスト表示: `https://kanjiki.github.io/coc-player-type/continuation/?test=1`
- テスターID付き: `https://kanjiki.github.io/coc-player-type/continuation/?test=1&tester=T01`
- 管理画面: `https://kanjiki.github.io/coc-player-type/continuation/manage.html`
- 特定シナリオを開く: `?scenario=VOID`

## 同じサイトを正式公開へ育てる方法

友人テスト用アンケートはURLに `?test=1` があるときだけ表示されます。正式公開時はURLから `?test=1` を外すだけで、検索部分のみの表示になります。

## 画面からデータを編集する

`manage.html` を開くと、コードを書かずに次を編集できます。

- 元シナリオと略称
- 継続先シナリオ
- 継続形態
- 推薦／注意
- 根拠等級と根拠種別
- 理由、根拠URL、確認日

編集内容はブラウザ内に下書き保存されます。編集後に `公開データをダウンロード` を押すと `data-gzip.js` が作られます。これをGitHubの `continuation/` フォルダへ上書きアップロードすると、同じ公開URLへ反映されます。

## 編集するファイル

- `manage.html` / `manage.js`: コード不要のデータ編集画面
- `data-gzip.js`: 検索に使う公開データ
- `config.js`: バージョン、公開URL、表示件数、フィードバック送信先
- `index.html`: 見出し、説明文、画面構造
- `styles.css`: 色、余白、スマートフォン表示
- `app.js`: 検索、絞り込み、フィードバック処理

GitHub上でファイルを開き、鉛筆アイコンから直接編集してコミットすることもできます。

## アンケートの回収

現在はサーバーを使わず、`回答を送る` ボタンから端末の共有画面を開きます。PCでは回答文をクリップボードへコピーします。

将来Google Apps Scriptなどの受信URLを用意した場合は、`config.js` の `feedbackEndpoint` にURLを設定すると自動送信へ切り替えられます。

## 公開編集をGitHubで確定する理由

GitHubのログイン情報や秘密鍵を公開サイトへ埋め込まないためです。管理画面は編集とデータ生成を担当し、公開確定だけGitHubで行います。
