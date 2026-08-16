window.CONTINUATION_CONFIG = Object.freeze({
  appName: 'この自陣、次どこ行く？',
  shortDescription: '通過したシナリオから、実際に遊ばれた継続先を理由付きで探す非公式ツールです。',
  version: '0.2-friend-test',
  dataUrl: './data.json',
  publicUrl: 'https://kanjiki.github.io/coc-player-type/continuation/',
  maxResults: 10,
  quickScenarioCount: 8,
  defaultTestMode: false,
  // GASなどの受信URLを設定すると、共有方式から自動送信方式へ切り替えられます。
  // 空欄の間は、端末の共有機能またはクリップボードで回答を返します。
  feedbackEndpoint: ''
});
