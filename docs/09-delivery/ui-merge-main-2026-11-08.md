# PR #288: UI回収ブランチへのmain統合

Status: Accepted

実装担当: 本セッション、監督: Muse。サブエージェント・自律監視は使用していない。

最終回帰確認日時: 2026-11-08T10:11:39+09:00（Asia/Tokyo）。

ランタイム再起動後、未完了mergeの両親・index・worktreeとGitHub AppのPR／Issueを再取得して検証を再開した。前任の実行ID `54269`／`51570`はログが現環境に残っておらず、本報告の成功根拠には流用しない。以下は再開後の実取得結果である。

## 対象と保存境界

- Draft PR #288、branch `codex/ui-recovery-from-280-20261107`、base `main`。
- 着手HEAD `5918b0f9986812fa5c4c1856de9b768705e8d4fb` と、開始済みmergeの相手 `9adc2c18247e29a5078afd028e2b6c77da7b0fd4` を統合する。GitHub AppのPR metadataと`git ls-remote`で両SHAを照合した。
- AGENTS.md、session-handoff、Issue #70、PR #288、ADR-0040／0041、要件トレーサビリティ、UI回収・認証main統合・認証P2報告、品質戦略と既存asset検査を確認した。新しい製品仕様・依存・環境変数・権限は追加しない。
- 今回は競合解消、回帰検証、報告書を含むmerge commitの同名origin branchへのpush、PR本文とIssue #70の同期まで。Draftを維持し、PR merge・deploy・remote migration・provider／環境設定変更・他PRコメントは行わない。

## 競合の解消方針

| ファイル | 解消内容と照合 |
|---|---|
| `apps/worker/src/app-assets.ts` | 競合は先頭の`APP_ASSET_VERSION`だけ。自動merge済みの認証JSとUI回収CSSを保持し、統合後の7 assetからハッシュを再計算した。最終値は`sha256-4caa5e44061a8e31`。`APP_JS`はmainと、`APP_HTML`／`APP_CSS`は着手UI headとbyte一致。 |
| `docs/09-delivery/decision-log.md` | UI回収の決定とmainの共有応答待ち・画像編集排他の決定を両方残した。merge baseから両親が追加・置換した各文面が解消後にも存在することを機械照合した。 |
| `docs/09-delivery/session-handoff.md` | UI回収checkpoint、mainのOAuth主体同期P2・認証main統合checkpointを両方残した。同じ両親差分照合を行い、今回のcheckpointを先頭へ追加した。過去のbase・local書込み障害・SHA別の成功／失敗は履歴として保持する。 |

自動mergeされた箇所も確認した。`product-auth.ts`、`index.ts`、migration `0008_product_auth_sessions.sql`、認証unit／browserと共有遅延回帰はmainとbyte一致。`cloud-manual-assets.ts`の着手HEADとの差分はmainの`shareBusy`共通入口gateだけ。拡張treeは着手UI headと一致し、記録・editor・共有読者・一覧・復旧・focus保持のUI回収を保持する。

## app-assetsの扱い

`app-assets.ts`全体を生成する専用scriptは存在せず、今回内容の競合もないため、片親のfile置換や内容の再生成は行っていない。共有editor生成物は既存の正規手順`node scripts/build-editor-tools.mjs --check`でソースとの一致を確認した。

`tests/worker-runtime.test.mjs`の「asset内容を変更したらversion更新が必須になる」を正本とし、統合後の`APP_CSS`、`APP_JS`、`CLOUD_MANUAL_CSS`、`CLOUD_MANUAL_JS`、`EDITOR_TOOLS_JS`、`ONBOARDING_CSS`、`ONBOARDING_JS`をこの順序でNUL連結したUTF-8文字列のSHA-256先頭16桁へ`sha256-`を付けた。どちらの親の版定数もそのまま採用していない。

再開後は既存の競合解消内容と版定数を再検証し、文書をpatchで追記・訂正した。自前scriptによる既存ファイルの全体書き換えは行っていない。

## 検証結果

Node `v24.22.1`、既設node_modulesとPlaywright Chromium `chromium-1248`（`--version`: Google Chrome for Testing 156.0.8078.4）を使用した。今回`npm ci`は未実行、package.json／lockfileは変更していない。ブラウザは合成データと隔離profileを使い、rawログ・合成画像をcommitへ含めない。

| 検査 | 結果・実行証跡 |
|---|---|
| `npm run check`全体 | 最終exit 0、実行ID `96469`（ブラウザ起動ヘルパー統一後）。先行実行`70276`もexit 0。どちらも最後の秘密値・encodingまで完走し、全test集計のfail／skipは0。 |
| 認証unit（check内） | 157/157。OIDC／PKCE、cookie・session失効、fail-closed、ChatGPT OFF、OAuth主体変更の二タブ同期・lock・同期失敗・通常読込の通知反復不在を含む。 |
| Worker／拡張（check内） | runtime 71/71（asset内容ハッシュ回帰を含む）、mutation 3/3、capture 11/11、extension 196/196、claim 29/29。 |
| D1／共有境界（check内） | D1 HTTP／bootstrap 39/39、bootstrap mutation 1/1、Miniflare D1 binding 3/3、cloud manual 46/46、share backend 9/9。migration／safety検査も成功。 |
| 関連browser 15ファイル | 実行ID `5806`は95/96、fail 1／skip 0／exit 1。失敗1件は`onboarding-share-browser`の既定ブラウザ欠落による起動前失敗で、他の95件は成功。下記の起動ヘルパー統一後に当該1件を`47873`で再実行し、1/1・fail 0／skip 0／exit 0。別実行を単一の96/96・exit 0へ合算しない。 |

browser対象は`product-auth`、`extension-native-recording`、`extension-editor`、`office-auth-runtime`、`cloud-manual-ui`、`cloud-manual-sharing-ui`、`cloud-manual-sharing-failure`、`cloud-manual-uiux`、`share-viewer`、`cloud-manual-tools`、`onboarding-ui`、`onboarding-share`、`all-screen-quality`、`extension-recording-quality`、`ui-quality-lab`の各browser test。既存の`--experimental-transform-types --test --test-concurrency=1 --test-reporter=tap`で実行した。認証9件、native raw画像保持・入力値非収集、共有遅延POST／DELETEと応答後の画像適用・保存、編集器、実MV3の合成Google／ChatGPT Office復帰、読者3幅と失効境界、keyboard／contrast／A4 PDF生成のlabを含む。

再開後の初回制限内check（実行ID `38394`）はD1 bindingのtest子プロセス失敗でexit 1。同じソースを制約外で実行した上記`70276`で全体成功を確認した。制限内browser初回（`53412`）も15ファイルのtest子プロセス起動失敗でexit 1。制約外の既定browser実行（`87807`）ではPlaywrightが参照する`chromium-1234`の欠落を確認し、当該実行を中止した。既存の`MECCHA_TEST_CHROME_PATH`で既設`chromium-1248`を指定した`5806`へ切り替えた。

`onboarding-share-browser.test.mjs`だけはPlaywrightを直接importしていて実行パス指定が効かず、`5806`でも起動前に失敗した。公式Chromium-1234取得（`42610`）は配布元との接続切断で未完了のため中止した。テストのimport 1行を既存`tests/support/test-browser.mjs`へ揃え、実行パス指定が使えるようにした。当該テスト本体・assertion・timeout・製品ソースは変更せず、再実行`47873`でguest共有claim後の共有設定復帰と共有リンク自動発行0回を確認した。依存・製品設定の変更、検査条件の緩和やskipは行っていない。logは`/tmp/mm-ui-resume-*.log`に限定し、本文へraw logを転載しない。

保存前のdocs／secret／encoding／diff検査も成功。制限内の追加secret検査は内部の`git`子プロセス起動がEPERMとなったため、制約外の同じ検査で成功を確認した。Git indexのread-onlyも制約外の対象ファイル限定stageで解消し、未追跡残骸を含めていない。

## 自動マスキング不在と文言回帰

- `apps/extension/capture/screenshot.js`は存在しない。拡張treeは着手UI headとbyte一致し、`takeScreenshot`は対象・描画タイミングを検証後に`chrome.tabs.captureVisibleTab`の取得画像を保持する。クリック矩形注釈と利用者明示の画像編集は維持する。
- 製品ソースを`takeMaskedScreenshot|captureWithMaskBoundary|installSensitiveMasks|capturePrivacyAliases|privateAliasAllocations`で検索し0件。`extension-record-alias-state.test.mjs`の既存回帰で自動mask／alias経路不在と入力値非収集も確認した。
- 製品ソースを`自動.{0,12}(隠|置換|マスク|黒塗り)`で検索し、残る一致2件は既存の否定案内「自動置換は行いません」「手動追加した画像では自動置換を行っていません」だけ。追加検索`自動(?:的に|で)(?:隠す|置換する)|自動置換(?:します|する)`も0件で、肯定する「自動で隠す／置換する」「自動的に隠す／置換する」はない。旧加工画像の互換表示と手動編集を自動処理の復活と扱わない。
- 無加工pixel保持・入力値非収集・明示確認境界は既存native記録回帰で検証した。認証・共有・画像編集・UI回収の試験と併せて最終結果を上記へ記録した。

## 未実行と引き継ぎ

外部Google／ChatGPT SSO、remote Access／D1／R2、migration適用／restore、実Officeアプリ描画、field p75／INP、人によるscreen reader確認、全画面の独立受入は未実行。合成local browserやPDF生成を実環境・商用release成功へ換算しない。ChatGPT既定OFF、OIDC／PKCE、session失効、fail-closedとworkspace境界は維持する。

最新merge headへの正式Codex Review、P0／P1判定、未解決thread、レビュー対象SHA照合、辛口レビューのP0／P1はMuseの次の1マイルストーンとし、PRチェックリストを未チェックに戻す。旧`5918b0f`のCI・Review成功は新headの証跡へ流用しない。土台由来P2（期限後Office形式再選択、stale cloudRef復旧UX、長大XML）は既存の担当・再triage期限2026-11-14を維持する。

報告書とcheckpointを同じmerge commitに含め、push後にlocal／origin／PR head一致とDraft状態を照合し、PR本文へ正確なSHAを記録する。Issue #70のclosed／not_plannedと他branch履歴を保持する。`.artifacts/`、既存probe・一時ファイル等の未追跡残骸はstageせず保持する。保存・報告後に担当は終了し、終了後の継続実行・監視は登録しない。
