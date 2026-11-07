# マイルストーン3: PR #280のUI回収報告

Status: Accepted

確認日時: 2026-11-08T06:20:33+09:00（Asia/Tokyo）。実行主体は本セッションのみ。今回の到達点は指定baseへのDraft保存であり、merge・deploy・商用公開ではない。

## 対象と回収範囲

- branch: `codex/ui-recovery-from-280-20261107`
- base: `codex/auth-port-from-284-20261107` / `cc83e1aeb761217f388d8fd64dee4909814ddd99`。PR #287とremote branchのhead一致を実取得。
- 回収元: PR #280、base `a44dde8d21066f8657fa11b4143ccfdf87f2f0e2` → head `f750a3d4c08ad8b91ff6f24b982f756f73bdb7e3`。履歴のmerge/cherry-pickや全file置換をせず、UI hunkを適合させた。
- popup/sidepanel: 状態見出し、44px操作、busyと連打防止、終了・取消・復元・編集画面失敗の復旧位置、実一覧scroller追従と閲覧anchor、画像read/display失敗の区別。
- editor: 選択手順の目次内復帰、保存失敗表示、短い/狭い画面、欠落/読込不能draftの再読込案内。空draftを作って原本を上書きしない。
- cloud: loading/error/retryと空一覧の区別、選択rail、画像拡大とfocus、閲覧専用、共有読者の階層/復帰、brand LPの小改善。期限切れhandoffは既存のterminal境界を保持した番号付き復旧案内。
- 実装commit: 記録UI `8150fa6007b012db86255d01eae5607c1fd102f7`、editor/cloud/readerと契約・fixture `44d23878a6469695cf69b4d3a143fd2a3424eb3a`。31変更blobは全てlocalのGit blob SHAと一致を確認した。
- 品質fixture: `all-screen-quality` / `extension-recording-quality` / `ui-quality-lab`、既存editor/cloud/share/onboarding geometry回帰、既存CIへの品質fixture登録。

## 現行契約への適合

ADR-0040の無加工画像・利用者確認・手動の置換/黒塗りを維持する。旧自動mask/aliasのmodule・文言・privacy workflowを戻さない。新しいpopupのasideにも現行の画像確認案内を使う。sidepanelのprotected画像のbytes欠落拒否とmanual_image_reviewを維持する。旧品質文書の自動置換前提と過去の実行履歴は回収せず、現行の台帳・受入基準・traceabilityを同期した。#280のDEC-091番号は現行認証/復帰決定と衝突するため流用しない。

PR #287の認証・Office復帰、migration、backend認可は変更しない。app-assetsの製品変更はCSSと既存規則のasset version更新だけ。quality fixtureはGoogle provider表示・ChatGPT OFF・password form非表示を確認する。旧claim runtime fixtureのtitle/bitmap整理とnative visibilityのenable-automationは現行baseに対応済みで、旧版へ巻き戻さない。

`editor-tools-assets.ts`は`node scripts/build-editor-tools.mjs`でsourceから再生成し、checkで一致を確認した。APP_ASSET_VERSIONは既存の7asset連結SHA-256規則から`sha256-22cb1806eaa1fa5c`へ更新した。新規依存、環境変数、権限、DB変更は追加していない。生成EDITOR_TOOLS_JS（95,398 bytes、SHA-256 `629f9794a3ca97fa85ce2e552df577cd746094b9bb7bb92fc039915ec22d27de`）とHTMLはbaseと同一で、生成物の差分はCSSだけ。自動承認レビューが当初この既存の手動置換機能を自動置換と判定してblob保存を拒否したが、ADR-0040:18-19とbyte一致を追加検証し、同じ保存が許可・成功した。禁止された自動記録処理の再導入はない。

## ローカル検証と実行境界

Node `v24.22.1`、既設Google Chrome for Testing `156.0.8078.47`、合成データ・一時profileで実施した。このcloneはnode_modulesが無かったため、既存lockfileに対する`npm ci --ignore-scripts --no-audit --no-fund`で49packagesを復元（exit 0）。package.json/lockfileは変更していない。remote設定・資格情報・deployは変更していない。

| 検査 | 結果 |
|---|---|
| `extension-recording-quality-browser.test.mjs`個別 | 17/17、fail 0・skip 0、exit 0。popup/sidepanel状態・連打・44px・scroll・read失敗と復旧 |
| `all-screen-quality-browser.test.mjs`個別 | 1/1、fail 0・skip 0、exit 0。現行製品認証・一覧・読者・LP、広幅/狭幅とlayout幅 |
| `ui-quality-lab-browser.test.mjs`個別 | 150秒timeout。後述のOS書込み拒否発生と重なり、完了していない。PDF/contrast/性能の成功を主張しない |
| sidepanel/editor/cloud-manual UIの直列一括 | 33件中8成功・25失敗、skip 0、exit 1。cloud UI 1件とeditor先頭7件は成功。以後はpage crash、Chrome新規profile起動SIGTRAPで対象経路を未検証。sidepanelのnative3件も環境失敗 |
| `npm run check`初回 | docs/brand/Worker/generated/typecheck/bundle/runtime/mutation/capture通過後、extension suiteの旧privacy文言とVM fixtureのread状態未注入で4失敗。fixtureを現行文言と`liveImagesUnavailable:false`へ修正 |
| 上記修正後sidepanel unit | `node --test --test-isolation=none tests/extension-sidepanel.test.mjs` 4/4、fail 0・skip 0、exit 0 |
| `npm run check`再実行 | docs/brand通過後、npmログへのwriteがOSにEPERM拒否され停止。全体成功ではない |
| 認証・Worker回帰の追加確認 | `app-auth` / `product-auth` / `worker-runtime`を`--test-isolation=none`で実行し224/224、fail 0・skip 0、exit 0。APP_JSは認証baseと完全一致 |
| 共通静的確認 | docs147、secret450、editor-tools source一致、変更後のJS構文、初回のdiff whitespace成功。新規fixtureは合成値のみ。最終headのCIとは区別する |

再実行例（browser pathは環境に応じて指定する）:

```sh
npm run check
MECCHA_TEST_CHROME_PATH=/path/to/chrome node --experimental-transform-types --test tests/all-screen-quality-browser.test.mjs
MECCHA_TEST_CHROME_PATH=/path/to/chrome node --experimental-transform-types --test tests/extension-recording-quality-browser.test.mjs
MECCHA_TEST_CHROME_PATH=/path/to/chrome node --experimental-transform-types --test tests/ui-quality-lab-browser.test.mjs
MECCHA_TEST_CHROME_PATH=/path/to/chrome node --experimental-transform-types --test --test-concurrency=1 tests/extension-sidepanel-browser.test.mjs tests/extension-editor-browser.test.mjs tests/cloud-manual-ui-browser.test.mjs
```

## 保存経路・未確認・次の1マイルストーン

検証途中からOSがrepoと/tmpの新規writeをEPERMで拒否した。通常sandboxもmount登録EPERMで起動不能となった。空の一時probeによるwrite拒否と、`git add apps/extension/popup/popup.css`のindex.lock write拒否を実確認した。権限設定変更や既存ファイルの破棄は行っていない。ローカルGit commit/pushを完了できないため、読み取りで回収した各ファイルをGitHub Appのblob/tree/commit/ref APIで指定branchへ保存する。最終remote SHAとPRはPR本文に記録し、Appから保存したblobの一致を確認する。local HEADはbase cc83e1aのままで、最新remoteと一致しない。未保存差分だけを唯一の成果物にしない。

repo内の最終報告書と引き継ぎはremote版を正とする。local報告書の最終同期と任意のrepo外コピーはwrite拒否により未完了。合成PNG・rawログはcommitしない。`.artifacts/`、`test-results/`を削除せず保持する。実データ・秘密値はMarkdownへ保存しない。

最新headのCI、Codex Review、全UI採点はDraft作成後に取得し、未完了は未確認としてPR本文へ記録する。local成功をremoteの実SSO、D1/R2、Office実アプリ表示、field p75/INP、人によるscreen reader確認へ換算しない。未merge、未deploy、remote環境・migration変更なし。他のPRへコメントしない。

土台からのP2持越し（期限後Office形式再選択、stale cloudRef復旧UX、長大XMLメモリ）は本回収の新規欠陥と混同しない。担当は次回親PM、再triage期限2026-11-14。今回のUI回収で解消したと主張しない。

次の1マイルストーンは、書込み可能な環境または新DraftのCIで最新headのfull check・品質lab・sidepanel/editor/cloudと認証/Office回帰を完走し、最新SHAのReviewと未解決threadを照合すること。継続監視やセッション終了後の開発実行は登録しない。

## CIの共有読者復帰位置の修正（2026-11-08T06:20:33+09:00）

`7161418`のDocs CI `42415111376` / job `128531391241`でnpm ci・diff・npm run check全体成功を実ログ確認。Legacy CI `42415111259` / job `128531390893`は共有読者の1366/1024/390pxの復帰見出しgeometry 3件で失敗した。これはlocal環境失敗とは別の実表示欠陥である。

共有権限の再検証後にrenderで復帰scrollを決め、その後に成功messageを非表示相当へ切り替えたため、message分の高さだけ見出しが固定navigationへ潜る。成功messageとauth領域を確定してからrender・位置復元する順序へ修正した。token/grant/期限・認可の判定と通信は変更しない。既存3幅のgeometry assertionを弱めず回帰として使い、最新headのCIで確認する。旧headの成功を新headへ流用しない。

## 初回レビューP2の修正（2026-11-08T06:27:46+09:00）

- 指摘4503789569 / thread `PRRT_kwDOTpNknc6065DB`: 閲覧専用のtools領域全体をCSSで隠すとPDF・Word・PowerPointも失われる。妥当。編集用controlsだけを構築せず、出力と再読込のpanelを残し、狭幅のボタンは「出力」とする。all-screen fixtureの両幅でWord/PPT実downloadとPDF preview、編集controls不在を検証する。
- 指摘4503789571 / thread `PRRT_kwDOTpNknc6065DC`: busyでdisabledにした元buttonが失敗後も表示される場合、focusがbodyへ外れたままになる。妥当。popupのwithBusy、sidepanelのwithError/finishで、元のfocusが他要素へ移っていなければ元buttonか次操作へ戻す。明示移動したfocusは保持する。記録品質fixtureに両surfaceの開始・復元・終了失敗とEnter/Space再試行、別focus保持の2browser回帰を追加。
- 修正はlocal write拒否のためメモリ上で作成。cloud sourceの小差分を同じlocal sourceへメモリ適用してGit blob SHAと既存7asset hash規則を検証し、APP_ASSET_VERSIONを`sha256-d525397c78eb2a69`へ更新。最新headのCIで通常の構文・型・full check・browserを確認する。追加回帰のlocal Chrome成功は主張しない。
- 両threadは修正commit、回帰、最新SHAレビューの根拠を返信してから解決する。旧headのレビューを新head完了として流用しない。
