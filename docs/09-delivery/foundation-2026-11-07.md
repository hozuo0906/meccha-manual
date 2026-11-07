# 自動置換なしの土台構築（マイルストーン1）

Status: Accepted

確認日時: 2026-11-07T21:49:03+09:00（Asia/Tokyo）。実行主体: 本セッション。独立担当・自律監視は登録していない。

## 対象と結果

- 起点: main `3c62ca5fdee5f09cce620566b654ab95a882ae0c`。remote mainも同一SHAを確認した。
- branch: `codex/foundation-no-automask-20261107`。回収元: PR #279を含むPR #282 head `573b921feee398fe4a87a5ca791df332ffb53f61`。
- 回収commit `8b3c8c7`のtreeは#282 headと同一。以後の差分は下記の旧実装除去、テスト同期、引き継ぎ・検証記録だけであり、残存する製品ファイルの挙動は#282 headと同じ。
- migration: `0006_d1_manual_editor_branding.sql` → `0007_d1_retained_save_recovery.sql`。0001〜0005を維持し、0008は含めない。localのSQLite／Miniflare検証のみでremote適用は行わない。
- PR #280／#284の回収・変更、既存PRへのコメント、merge、deploy、production／staging設定変更は実施しない。

## #282最終treeからの差分

| 対象 | 変更と理由 |
|---|---|
| `apps/extension/capture/screenshot.js` | 製品appsに呼出しがないことを検索確認し、旧自動分類・DOM overlay・HMAC割当・mask boundaryの1966行を除去 |
| `tests/extension-mask-browser.test.mjs` | 旧自動mask boundary専用259行を除去 |
| `tests/extension-pii-mask-browser.test.mjs` | 旧自動PII overlay専用2489行を除去 |
| `tests/extension-mvp.test.mjs` | 旧captureWithMaskBoundary importと4件の専用テスト（45行）を除去。手動mask編集・raw撮影回帰を維持 |
| `tests/extension-release-blockers.test.mjs` | 旧mask専用importと3件の専用テスト（105行）を除去。復旧・イベント非収集・手動mask編集を維持 |
| `tests/extension-finish-recovery.test.mjs` | 利用されない旧mask mock／分岐だけを除去 |
| `tests/extension-semantic-context-browser.test.mjs` | 自動置換pixelと旧分類器同一性のassertを廃止。raw pixel保持、manual review、caption非収集、privateValueContextの予算超過抑止へ同期 |
| `tests/extension-editor-browser.test.mjs` | seed後のIndexedDB draft初期描画完了を待つ。描画前count assertの競合を修正 |
| `tests/cloud-manual-tools-browser.test.mjs` | 390pxのツール展開・scroll後にcanvas座標を再取得し、黒塗り追加自体をassertして非送信／pixelを検証 |
| 契約・追跡文書 | ADR-0039とalias契約のSupersededを維持。旧契約の検証節を履歴と明示し、DEC-088/089、DEC-090の自動置換部分とtraceabilityの自動overlay前提をADR-0040へ失効同期 |
| 検証・引き継ぎ記録 | この報告書とsession-handoffの現在checkpointを追加 |

`record-alias-state`／`record-alias-browser`は#282時点ですでに旧boundaryを呼ばず、自動経路の不在と入力値非収集を検査するので保持した。`privacy.js`のcaption・幾何allowlist、`recorder.js`のprivateValueContextは#282とbyte単位で同一。過去加工済み画像のmetadata読取り・表示、手動黒塗りの不可逆flattenは保持した。service workerは#282と同一のraw撮影・manual_image_reviewで、alias鍵／割当session保存を導入しない。

## 検証環境

製品・editor検証対象commit: `e1d7c10`、cloud-tools修正・検証: `a662cc8`。全体check実行中の変更はbrowser試験と文書のみで、製品appsは同一。最終文書commitでもdocs／secret／encoding／diffを確認する。

Node v24.22.1、lockfileどおりの`npm ci`、既設Playwright Chromiumの隔離profileとXvfbを使用した。通常sandboxではnpm通信、git子プロセス、workerd／ブラウザの起動に制約があったため、同一コマンドのsandbox外再実行で切り分けた。外部設定変更・新依存追加はない。

実ブラウザの入力・画像はすべて合成fixture。Worker連携は合成JWT、local Worker、SQLite D1 adapter、memory R2であり、remote Access／D1／R2の成立証拠ではない。`worker:bundle:check`のWrangler dry-runはbundle検査でありdeployではない。

## テスト結果

| 検査 | 最終結果 |
|---|---|
| `npm ci` | 成功。初回sandboxのEPERM後に再実行 |
| `npm run extension:test` | 成功（Office wiring、色状態、finish recovery、caption、手動maskを含む） |
| `npm run test:extension-cloud-claim` | 成功（retained draft、annotation-redactionを含む） |
| `npm run test:onboarding-ui:unit` | 成功（recovery actionsを含む） |
| `npm run test:cloud-manual` | 成功（manual-rasterを含む） |
| `npm run test:share-links` | 成功 |
| `npm run test:d1-binding` | 成功 3/3。初回sandbox起動失敗後の再実行で確認 |
| `npm run test:office-export` | 成功 |
| `node --test tests/personal-info-replacement.test.mjs tests/personal-info-replacement-pair.test.mjs` | 成功 |
| record-alias state/browser、semantic-context unit | 成功。旧自動boundaryへの直接呼出しなし |
| `docs:check` / `worker:typecheck` / `worker:bundle:check` / `editor-tools:check` | すべて成功 |
| `migrations:check` / `migration:safety:check` / `d1:workspace:boundary:check` | すべて成功 |
| `environment-separation:check` / `runtime-boundary:check` / `encoding:check` | すべて成功 |
| `secrets:check` | 成功。初回sandboxのgit子プロセスEPERMを再実行で解消 |
| `npm run check` | 全体成功 exit 0（sandbox外）。通常sandboxではD1 bindingで停止したため成功扱いにしていない |
| extension-native-recording browser | 成功 1/1（MV3、PC、20操作、raw画像、非active記録対象の拒否） |
| extension-semantic-context browser | 成功 2/2。初回は空replacement metadataをundefinedとした期待値が誤り。保存時正規化の空配列へ修正後通過 |
| personal-info-replacement-pair browser | 成功 1/1 |
| extension-office-export browser | 成功 1/1（Word/PPT、認証済みhandoff stub、snapshot変更拒否） |
| extension-cloud-save-runtime browser | 成功 1/1（実MV3 coordinator、docx/pptx claim、閉じたeditor復帰、別形式／launch／replay拒否） |
| cloud-office-export browser | 成功 1/1 |
| extension-sidepanel browser | 成功 3/3 |
| extension-caption browser | 成功 6/6 |
| `verify-recorded-workflow.mjs` | 成功。実記録2手順・2画像、cloud画像bytes一致、cloud／share描画、branding描画、共有失効拒否 |
| editor browser | 成功 28/28、skip 0（fixture修正後の全体再実行） |
| cloud／share／onboarding browser 8ファイル | 初回30/32成功。cloud-toolsは390px座標fixture修正後1/1成功、onboarding-shareはブラウザcache指定後1/1成功。最終的に全32ケース成功を確認 |
| extension-cloud-claim runtime | runtime本体6/6成功。first-accessは起動後ERR_TUNNEL_CONNECTION_FAILEDで0/1失敗（対象の初回Access経路は未実行）。通常sandbox／ブラウザ未導入時の失敗を成功扱いにしない |
| `git diff --check` | 成功 |

editor初回全体は27/28成功、20手順の最初の描画assertで1件失敗。同じソースの単独対象実行は1/1成功し、fixtureが`page.goto`後の非同期draft描画を待っていないことを確認した。初期article表示待ちを追加した後の全体再実行は28/28成功。製品コード変更で隠した失敗ではない。

探索的確認として390pxの手動個人情報編集画面を目視し、日本語の種別／架空人物選択、適用／取消、要確認表示を確認した。独立した全面UX受入やWord／PowerPoint実アプリの描画成功を意味しない。

## 未実行・残る既知の問題

- `extension-cloud-claim-runtime-first-access`はこの環境のproxy tunnelでsynthetic staging hostへのnavigationが失敗し、本来の経路は未実行。CIなど当該fixtureのlocalhost TLS接続が成立する環境で再検証が必要。
- remote Accessログイン、remote D1／R2、実provider、migration適用、restore、実Word／PowerPointアプリの読込・描画は未実行。今回の権限範囲外であり、成功と扱わない。
- PC／スマホ／タブレットresponsive制御はextension unitで確認した。native-recordingブラウザはPC fixtureであり、3表示モードすべての実Chrome通し受入は未実行。
- 既設Chromiumで実ブラウザを動かした。公式CFTを新規ダウンロードしての同一版再実行は未実行。
- #282由来のP2持越し: 期限後Office形式の明示再選択案内、外部更新に由来するstale cloudRefの409後の復旧UX、長大Office XMLの一時メモリ。現存欠陥の再現を全て行ったものではなく、保護境界を自動緩和しない。担当: 次回親PM、再triage期限: 2026-11-14。影響は期限後の出力再選択、外部更新後の再保存・出力継続、非通常入力のメモリ増加。今回の土台へ製品仕様変更として混在させない。
- #284で扱うD1 trigger direct changesや認証統合等の後続修正は今回は回収していない。ローカルCore成功を後続機能・remote実利用の成功へ流用しない。
- CI／Codex Review／Latest Review Gateは新規Draft PRの実headに対して別に確認する。Draft作成はmerge／release合格ではない。
- 次の1マイルストーン候補は#284の製品認証と統合修正の移植（0008を含む）。今回の作業では着手しない。

追加browser切り分け: cloud-tools初回は390pxでadvanced toolsを開く前の古いcanvas座標を使い、黒塗りが追加されないまま保存していた。展開後にscroll・座標取得し、黒塗り1件を確認した上で、隠した合成文字列が送信annotationから除外され、対象pixelが黒塗りになることを1/1で確認した。製品コードは#282と同じままである。
