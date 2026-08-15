# CoCプレイヤー診断

GitHub Pagesで公開するCoCプレイヤー診断です。

- フロントエンド: GitHub Pages (`index.html`)
- 回答保存・集計: Google Apps Script + Google Sheets
- 22問 / T・R・P・G / 12タイプ
- 1200×1200結果画像
- Web Share API + X Intent fallback
- 匿名ファネル計測

## 公開URL

Pages有効化後:

`https://kanjiki.github.io/coc-player-type/`

## GitHub Pages設定

GitHubのリポジトリ画面で:

1. **Settings**
2. **Pages**
3. **Build and deployment**
4. Source: **Deploy from a branch**
5. Branch: **main**
6. Folder: **/(root)**
7. Save

## GAS側

外部サイトからの保存用APIとして、既存Apps Scriptへ `doPost(e)` を追加してください。

```javascript
function doPost(e) {
  try {
    const payload = JSON.parse(e.parameter.payload || '{}');

    if (payload.action === 'saveResponse') {
      saveResponse(payload.data);
    } else if (payload.action === 'funnel') {
      logFunnelEvent(payload.data);
    } else {
      throw new Error('unknown action');
    }

    return ContentService.createTextOutput('OK');
  } catch (err) {
    console.error(err);
    return ContentService.createTextOutput('ERROR');
  }
}
```

Webアプリのアクセス権は、診断利用者がPOSTできる公開設定にしてください。

## 注意

`index.html` の `GAS_API_URL` は現在のGAS WebアプリURLを使用しています。GASを新規デプロイしてURLが変わった場合はここも変更してください。

`no-cors` POSTのため、フロントエンドはGASレスポンスを読みません。現在の「同じタイプが何%か」のリアルタイム表示は一旦外し、保存成功の確認はSheets側で行います。
