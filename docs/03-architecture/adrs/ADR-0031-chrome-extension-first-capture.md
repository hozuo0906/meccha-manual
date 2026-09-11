# ADR-0031: Chrome拡張を操作記録の唯一のMVP方式にする

Status: Accepted

Date: 2026-09-12

## 決定

`めっちゃマニュアル` のMVP操作記録は、Chrome Extension Manifest V3だけで実現する。

Cloudflare Browser Run / Browser Session / Live ViewはMVPのruntime、料金、利用上限、品質ゲート、オンボーディングから外す。将来必要になった場合も、本ADRを更新またはSupersedeする新しいADRなしに製品runtimeへ再導入しない。

Chrome拡張は、利用者自身が開いているWebページ上で明示的に記録開始したときだけ対象タブへ一時アクセスし、クリック、入力完了、遷移等の手順イベントと必要なスクリーンショットを収集する。

## MVPの権限

- Manifest V3を使用する。
- `activeTab` と `scripting` を中心に必要最小限の権限で設計する。
- 常時すべてのサイトへアクセスする `<all_urls>` 等の広範なhost permissionを既定にしない。
- 利用者の明示操作なしに記録を開始しない。
- 記録対象を開始時の対象タブから別タブへ勝手に拡大しない。
- MVPでは `debugger` permissionを要求しない。
- password、カード番号、token、個人番号等の入力値を保存しない。
- Cookie、Authorization、ブラウザ保存済みcredential、password manager由来情報を取得・送信しない。
- 入力操作は「対象名」と「入力操作が行われた事実」を基本とし、入力内容そのものを手順データへ含めない。
- 記録停止時はcontent script側の記録状態を終了し、不要な一時データを破棄する。

## PC・スマホ・タブレット表示

スマホ／タブレット向けサイトの手順書作成をMVP必須とする。ただし、Chrome拡張を実行する端末はデスクトップ版Chromeとする。

MVPでは次の表示モードを提供する。

- `PC`
- `スマホ`
- `タブレット`

スマホ／タブレットは、デスクトップChrome上で対象ページのレスポンシブ表示幅を再現して記録する。

### 実現方針

- 記録開始時に表示モードを選択できる。
- スマホ／タブレットでは現在のChromeウィンドウの元の位置・サイズを一時保存する。
- Chrome window APIとページ側の `window.innerWidth / innerHeight` 実測を使い、指定したviewportに近づくよう調整する。
- portrait / landscapeを選択可能にする。
- 記録停止、キャンセル、失敗時には元のウィンドウ位置・サイズへ復元する。
- 既定presetの具体値はUI実装時に代表端末で検証して固定する。

これはレスポンシブviewportの再現であり、実機iOS / Androidの完全なemulationではない。MVPではUA、DPR、touch event、OS固有レンダリングの完全再現を保証しない。対象サイトがviewportだけでなくUAやtouch capabilityへ強く依存する場合は、画面上でその制約を明示する。

`debugger` / CDPによる完全なdevice emulationは、強い拡張権限を必要とするためMVPでは採用しない。実需要が確認された場合だけ別ADRで再評価する。

## アカウント未作成のゲスト記録

アカウント作成前でも、拡張導入後に1本目の手順書を作成・確認・編集できるようにする。

ゲスト状態では次を守る。

- capture event、スクリーンショット、下書き、編集内容は利用者端末の拡張ローカル領域だけに保持する。
- ゲスト本文・スクリーンショットをD1 / R2へ送信しない。
- 大きな画像を扱うため、ゲスト本文の主保存先を`chrome.storage.local`だけに依存させずIndexedDB等の拡張ローカル永続領域を利用する。
- アカウント未作成でも記録、下書き生成、タイトル修正、説明修正、step削除・並べ替え、マスキング確認まで進められる。
- `保存`、`共有`、`PDF出力`等、サーバー側に永続化または外部出力する操作を選んだ時点でアカウント作成／ログインを要求する。
- 認証完了後は同じ操作をやり直させず、ゲスト下書きを認証済み利用者のworkspaceへclaimして、押していた出力操作を再開する。
- claim成功後はローカルゲスト本文を安全に削除する。結果不明時は二重manualを作らず照合できる設計にする。
- 拡張を削除、ブラウザデータを削除した場合、未登録ゲスト下書きは復元できないことを分かりやすく案内する。

## サーバー境界

認証前のゲスト記録を理由にtenant境界を弱めない。

- 認証済みmanual、asset、shareは既存どおりWorker認可とworkspace固定D1 queryを通す。
- extension ID、client側workspace ID、ローカルdraft IDだけを認証・認可根拠にしない。
- ゲスト下書きclaimは、検証済み人間Access主体とatomicなPersonal Workspace provisioning後だけ実行する。
- claim token / operation IDは推測困難・短命・単回利用とし、URLへスクリーンショットや本文を埋め込まない。

## 理由

### 原価

Cloudflare Browser Runは無料枠を超えるとブラウザ時間等に応じた変動原価が発生する。利用者の業務操作を記録するためだけにクラウドブラウザ時間を購入することは、MVPの価値に対して不要な原価となる。

Chrome拡張では対象Webアプリ自体は利用者のChrome上で動くため、操作記録のためのクラウドブラウザ利用時間を課金軸にする必要がない。

### 互換性

利用者自身のChromeを使うことで、既存ログイン状態、社内ネットワーク、IP制限、端末認証等の環境と自然に共存しやすい。

### UX

普段使っている業務画面で `記録開始 -> 普通に操作 -> 記録停止` ができ、さらにアカウント登録前に1本目を試せるため、Time to First Valueを短縮しやすい。

## Browser Runの位置づけ

Cloudflare Browser RunはMVPおよび現行Product Roadmapのcapture方式として採用しない。

既存のBrowser Run関連文書、テスト、Issueは履歴・将来検討用の安全契約として残してよいが、featureが無効である限りChrome拡張MVPの開発・公開をブロックしない。

将来サーバー側自動処理などで再評価する場合は、費用対効果と既存egress / SSRF / hard-expiry安全契約を改めて合格させる。

## Supersedes

- ADR-0002の「Chrome拡張を第一方式にしない」決定。
- DEC-005の「Chrome拡張を第一方式にしない」部分。
- FR-016の旧Browser Run mobile preview方式。

## Preserves

- Cloudflare Workers / D1 / R2を認証後のサーバー基盤として利用する方針。
- tenant分離、private R2、入力値非保存、共有失効、production承認境界。
- Browser Runを将来再導入する場合のSSRF / egress fail-closed原則。

## MVP完了条件

- Chrome Web Store公開前または限定配布環境で、拡張インストールから初回記録開始まで説明なしで進める。
- アカウントなしで `記録開始 -> 複数操作 -> 記録停止 -> ローカル下書き生成 -> 編集` まで完了できる。
- PC / スマホ / タブレットの3表示モードで記録でき、終了時に元のwindow状態へ復元できる。
- `保存 / 共有 / PDF出力` を押した時だけ登録を要求し、認証後にゲスト下書きを失わず同じ操作へ復帰できる。
- 対象タブ以外を収集しない。
- 入力値・Cookie・Authorizationを保存しないnegative testが通る。
- 初期ICPが利用する代表Webサービスで実用可能性を確認する。
