# PR #287: 認証移植ブランチへのmain統合

Status: Accepted

確認日時: 2026-11-08T09:20:12+09:00（Asia/Tokyo）。実装担当: 本セッション、監督: Muse。独立担当・サブエージェント・自律監視は使用していない。

## 対象と範囲

- Issue #283 / Draft PR #287、branch `codex/auth-port-from-284-20261107`。
- 着手時HEAD: `cc83e1aeb761217f388d8fd64dee4909814ddd99`。開始済みmergeの相手はmain `3e2fe6f568fbb7c77749d915177d8ce88a86e0b5`。GitHub AppのPR base/headと`git ls-remote`のmain／同名branchを照合した。
- mainはPR #285の土台と共有・画像編集P2 `6f3b550`を含む。本作業はこのmainのmerge完了、回帰検証、報告書を含む同名branchへのcommit／pushに限定する。PRはDraftを維持し、PR merge・deploy・remote migration・provider／環境設定変更・他PRコメントは行わない。
- AGENTS.md、session-handoff、Issue #70／#283、PR #287、ADR-0041、認証移植報告、共有P2報告、FR／ACのトレーサビリティ、品質戦略と既存asset検査を確認した。新しい認証・画像仕様や依存は追加していない。

## 競合の解消方針

| ファイル | 方針と照合 |
|---|---|
| `apps/worker/src/app-assets.ts` | 競合は先頭の`APP_ASSET_VERSION`だけ。認証移植済みAPP_HTML／CSS／JSを保持し、統合済み全assetからハッシュを再計算した。最終値は`sha256-963d574fb050ea04`で、どちらの親の値もそのまま採用していない。HEADとの差分はこの定数1行のみ。 |
| `docs/09-delivery/decision-log.md` | 認証移植のDEC-098〜110等とPR #287のログイン再訪／focus記録、およびmainの2026-11-08共有排他記録を両方保持した。merge baseから両親が追加した各記録が解消後本文に残ることを照合した。 |
| `docs/09-delivery/session-handoff.md` | 認証移植・追加P2修正のcheckpointとmainの共有P2 checkpointを両方保持した。過去のbase・書込み障害・未検証記録は履歴として残し、今回のcheckpointを先頭へ追加する。 |

競合外の自動mergeも確認した。`cloud-manual-assets.ts`のHEADとの差分はmain由来の`shareBusy`入口gateだけであり、認証移植側のCSP許可済みdata URL decodeも残る。`cloud-manual-sharing-failure-browser.test.mjs`はmainとbyte一致する。共有UXとrequirements traceability、main側P2報告書も保持した。

## app-assetsの再生成方法

このrepoには`app-assets.ts`全体を生成する専用scriptはない。正規の生成scriptは共有編集bundle用の`node scripts/build-editor-tools.mjs`であり、appの内容ハッシュの正本は`tests/worker-runtime.test.mjs`の「asset内容を変更したらversion更新が必須になる」である。実在する手順と規則を使い、次を行った。

1. 競合解消後に`node scripts/build-editor-tools.mjs`を実行。`editor-tools-assets.ts`をソースから再生成し、既存の追跡内容と一致した。
2. 統合後のexportをimportし、`APP_CSS`、`APP_JS`、`CLOUD_MANUAL_CSS`、`CLOUD_MANUAL_JS`、`EDITOR_TOOLS_JS`、`ONBOARDING_CSS`、`ONBOARDING_JS`の順にNULで連結したUTF-8文字列のSHA-256を計算。hex先頭16文字へ`sha256-`を付け、`APP_ASSET_VERSION`を再生成した。
3. `node scripts/build-editor-tools.mjs --check`と、上記既存Workerのハッシュ回帰を実行し成功した。標準check内でも同じ検査を通過した。

自前の文書競合解消とハッシュ更新では、同じディレクトリの一時ファイルへ全内容を書き、`rename`／`os.replace`で差し替えた。既存ファイルへの自前scriptによる直接の全体上書きは行っていない。

## 検証結果

Node `v24.22.1`、lockfileどおりの`npm ci`、既設Playwright Chromium `chromium-1248`を使用した。ブラウザは隔離profileと合成データで実行し、個人のprofile・実ユーザー操作は使わない。新規dependency／環境変数／永続設定は追加していない。

| 検査 | 結果 |
|---|---|
| `npm run check`全体 | exit 0、実行ID `50105`。最後の秘密値・encoding検査まで完走、test集計のfail／skipは0。 |
| 認証unit（check内） | app-auth／product-auth 153/153。PKCE・state・nonce・署名・issuer・audience・一回消費・Cookie・失効・優先順位・fail-closed・logout／資格切替・email-only link拒否を含む。 |
| Worker（check内） | runtime 71/71、mutation 3/3。内容ハッシュ回帰を含む。 |
| D1／権限境界（check内） | D1 HTTP／bootstrap 39/39、bootstrap mutation 1/1、D1 binding 3/3、cloud manual 46/46、share backend 9/9。migration／safety検査も成功。 |
| 共有POST／DELETE遅延回帰 | 両方成功。応答待ち中の画像編集拒否と日本語案内、応答後の画像適用・保存・手順切替・再編集を確認。 |
| 統合browser | 11ファイル22/22、fail 0／skip 0／exit 0（実行ID `61352`）。製品認証9、Office認証復帰2、実MV3保存1、20画像Office1、cloud Office1、共有・画像編集7、native raw記録1。 |
| 共通静的確認 | `git diff --check HEAD`成功。生成bundle照合、ハッシュ回帰1/1成功。 |

再実行コマンド:

```sh
npm ci
node scripts/build-editor-tools.mjs
# 上記7 exportのNUL連結SHA-256からAPP_ASSET_VERSIONを更新する
npm run check
MECCHA_TEST_CHROME_PATH=/path/to/chrome node --experimental-transform-types --test --test-concurrency=1 tests/product-auth-browser.test.mjs tests/office-auth-runtime-browser.test.mjs tests/extension-cloud-save-runtime-browser.test.mjs tests/extension-office-export-browser.test.mjs tests/cloud-office-export-browser.test.mjs tests/cloud-manual-ui-browser.test.mjs tests/cloud-manual-sharing-ui.test.mjs tests/cloud-manual-sharing-failure-browser.test.mjs tests/cloud-manual-uiux-browser.test.mjs tests/cloud-manual-tools-browser.test.mjs tests/extension-native-recording-browser.test.mjs
```

初回の制限内`npm ci`は完了を確認できず中止し、許可されたsandbox外実行へ切替えた。その際に先行processの終了処理でnode_modulesが削除されたため、先行process終了後に単独で再実行し復元した。途中のasset生成はesbuild未検出で停止したが、復元後の正規生成・checkは成功した。package.json／lockfileに変更はない。検証logは`/tmp/mm-auth-merge-*.log`に限定し、raw log／画像は報告書やPRへ添付しない。

## 自動マスキング不在の確認

- `git diff HEAD -- apps/extension`は空。認証移植前後のChrome拡張treeを変更していない。削除済み`apps/extension/capture/screenshot.js`が存在しないことを確認した。
- `service-worker.js`の`takeScreenshot`を確認し、対象・描画タイミング検証後の`chrome.tabs.captureVisibleTab`からraw画像を返す経路を保持している。自動PII overlay／自動alias置換の呼出しを追加していない。クリック位置の四角注釈と利用者の明示操作による画像編集は既存どおりである。
- check内の`extension-record-alias-state.test.mjs`が自動mask／alias screenshot経路不在と入力値非収集を検証し成功した。検索結果に残る「自動置換は行いません」という案内、旧加工済み画像の互換処理、手動mask／明示置換を自動実行の復活と混同しない。
- raw pixel保持・手動確認境界の`extension-native-recording-browser.test.mjs`が1/1成功した。合成fixtureの元pixelが残り、入力値を収集せず、手動確認を要求する状態が記録終了後も保持されることを検証した。

## 保持した認証と引き継ぎ境界

`product-auth.ts`、`index.ts`、migration `0008_product_auth_sessions.sql`は着手時HEADとbyte一致する。OIDC開始／callback、D1 session失効、D1 triggerの直接変更件数照合、認証route優先順位・fail-closed、ChatGPT既定OFF、メール自動link禁止を維持する。CSP decodeとOffice認証リターンは関連browserで確認する。

外部Google／ChatGPT SSO、remote Access／D1／R2、migration適用、実Office描画は今回未実行。最新merge headのGitHub CI／Codex Review／thread確認はMuseの次の1マイルストーンとし、旧SHAの成功を新headへ流用しない。土台由来の既知P2保留は既存報告の担当・期限を維持し、今回の統合作業へ拡張しない。PR #287はDraftのまま、他PRを変更・コメントしない。

本報告書を同じmerge commitに含めてoriginの同名branchへpushし、local／remote／PR head一致と競合解消を確認する。Issue #70はclosed／not_plannedを確認済みで、その状態と他branchのcheckpointを保持したまま今回の結果だけを引き継ぐ。終了後の継続実行・監視は登録しない。
