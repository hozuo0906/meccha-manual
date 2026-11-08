# 登録後サンプル投入（段階D）実施報告

Status: Accepted

Date: 2026-11-08

## 対象と結果

branch `codex/sample-mode-stage-d-20261108`、base／着手HEAD `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`（PR #291 merge）。監督の保全済み未commit成果物を確認して継続した。今回の保存範囲はcommit／push・Draft PRと正式Codex Reviewへの対応まで。merge・deploy・Issue #70への書込みは行わない。

## 実装

- 認証済みactive Personal Workspace作成者かつowner本人が本文なしPOSTを明示的に選んだ時だけ、合成fixtureの6手順・同梱PNG 3枚を通常のstaged asset＋finalize claim経路で保存する。資格情報を転送しないRequestでASSETS bindingから固定画像だけを読む。guest contentのサーバー保存ではなくADR-0032の認証後の正規保存である。
- サーバー専用`sample_manual_v1_`operation prefixを公開claimから拒否する。再送は既存manual IDを`alreadySeeded`で返し、改名・編集後も増殖させない。期限切れpendingをexpiredへ確定し、直前intent IDから次operationを決定する。R2途中失敗・commit応答消失・同時実行でも単一manual／3 assetへ収束する。
- 通常アーカイブAPIは`expectedUpdatedAt`のCASとmigration 0009の`manual_archive_events` INSERTを同じD1 batchに含める。scope／append-only trigger、権限再照合、監査失敗時rollbackを備え、revision／step／asset参照を保持する。アーカイブ後だけ次のサンプルを作れる。
- 空状態と常設panelの明示2入口、二重送信防止、未保存・保存／画像／共有処理中guard、遅延応答時の`preserveDetail`、一覧と詳細の`isSample`／「サンプル」badgeを含む。既存の公開閲覧専用サンプルは維持する。
- 再開後はasset版定数の実測同期と、失敗した`showTools()`だけを既存cloud helperと同じ`width <= 760 ? "編集" : "画像・編集"`へ修正した。visible filterとpanel-open guardを保持する。DEC-112と関連文書を同期した。

## 検証

確認日時: 2026-11-08T21:01:28+09:00（Asia/Tokyo）。検証対象は上記base＋今回差分の作業ツリー。Node v24.22.1、Chrome for Testing 156.0.8078.4、合成データ・mock API／ローカルWorker・SQLite D1 adapterを使用する。remote実証へ換算しない。

- `npm run test:cloud-manual`: 実行56869、66/66、fail 0／skip 0／exit 0。cloud-manual-c、manual-raster、manual-sample、sample-manual-import-uiを含む。tenant／Personal owner／Team／本文／予約prefix拒否、R2途中失敗・応答消失、finalize rollback・応答消失、同時保存、期限切れpending、由来の不変性、アーカイブCAS・監査scope直接DML・append-only・監査rollback・直前role mutationを確認した。
- `npm run test:manual-sample:browser`: 実行24671、3/3、fail 0／skip 0／exit 0。既存公開サンプル2件と投入1件。投入は1366×900／1024×900／390×900すべてで空状態＋常設入口、失敗後再試行、二重送信拒否、編集可能な6手順・画像、badge、既存投入、遅延中の未保存編集保持、アーカイブ取消／確定／再投入、横overflowなし・pageerrorなしを確認した。
- 既存cloud browser回帰: 実行8262、3ファイル4/4、fail 0／skip 0／exit 0。`cloud-manual-ui-browser`、`cloud-manual-tools-browser`、`cloud-manual-uiux-browser`を直列実行し、保存・再読込・画像tools・branding・印刷・一覧再試行focus・20手順の編集と狭幅を確認した。
- 文書同期後の全体`npm run check`: 実行30145、exit 0。56 npm段階（check本体＋55直下script）を完走し、Node summary 24組の集計796/796・fail 0／skip 0。docs 156、secret 473、encoding 401件を確認し、最終encodingまで成功。browser testはこのchainに含まれず、上の別実行を証跡とする。
- asset versionは7 assetのNUL区切りSHA-256を既存回帰と同じ順序で計算し、`sha256-3978951cae4940ed`へ同期した。引継ぎ定数`sha256-63c2dfef4d2d1b29`は実内容と不一致だった。再開後はcloud JS/CSS本文を変更していない。

先行失敗: 実行36920で対象投入browser単独を修正前に再現し、0/1・fail 1／skip 0／exit 1。1024pxのcloud編集画面で閲覧専用ラベル「操作案内」を待つ6000ms timeoutだった。cloud既存helperと実装の幅分岐に従うテスト修正で上記3幅が成功した。公開`manual-sample-browser.test.mjs`と製品コードはこの切り分けで変更していない。

全体checkの先行失敗: 実行98397はWorker runtimeの版hash回帰で70/71・fail 1／skip 0／exit 1。引継ぎ版定数の不一致を上記の実測値に修正し、全体を改めて実行して成功した。ブラウザヘルパー失敗とは別件として記録する。

ブラウザ実行環境: ローカルは全実行に`MECCHA_TEST_CHROME_PATH=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`を指定した。未指定時のchromium-1234欠落は既知の環境条件であり、今回その起動失敗を再実行したものではない。`tests/support/test-browser.mjs`は変更していない。

自己レビュー: 固定画像の取得元と資格情報非転送、予約prefixの入口分離、workspace固定query、通常claim再利用、認可再照合とD1 atomic監査、guest保存なし、ログ／監査に本文・資格情報を追加しないことを差分とテストで確認した。正式ReviewとMuse受入は別ゲート。

## 変更ファイル

- `apps/worker/src/app-assets.ts`
- `apps/worker/src/cloud-manual-assets.ts`
- `apps/worker/src/cloud-manual-router.ts`
- `apps/worker/src/infra/d1/cloud-manual-repository.ts`
- `docs/01-product/requirements-traceability.md`
- `docs/02-ux/all-screen-quality-matrix.md`
- `docs/02-ux/onboarding.md`
- `docs/04-data/d1-workspace-schema.md`
- `docs/05-api/api-contracts.md`
- `docs/09-delivery/decision-log.md`
- `docs/09-delivery/sample-mode-stage-d-2026-11-08.md`
- `docs/09-delivery/session-handoff.md`
- `migrations/0009_d1_manual_archive_events.sql`
- `package.json`
- `tests/cloud-manual-c.test.mjs`
- `tests/sample-manual-import-browser.test.mjs`
- `tests/sample-manual-import-ui.test.mjs`

## 未実施事項と次の1マイルストーン

`npm ci`、remote SSO／D1/R2／migration適用／Access policy変更、人のscreen reader、merge、deploy、Issue #70への書込みは未実施。Draft PR・最新headのCodex Review・CI結果は保存後に別証跡で照合する。artifactとnode_modules symlinkはcommit対象外で保持する。書込み障害の再発はここまで観測していない。

次の1マイルストーンはMuseによる最新headの成果物検品・品質ゲートと利用者受入。保存・報告後の自律監視・継続実行は登録しない。
