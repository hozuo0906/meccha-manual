# 登録後サンプル投入（段階D）実施報告

Status: Accepted

Date: 2026-11-08

## 対象と結果

branch `codex/sample-mode-stage-d-20261108`、base／着手HEAD `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`（PR #291 merge）。監督の保全済み未commit成果物を確認して継続した。今回の保存範囲はcommit／push・Draft PRと正式Codex Reviewへの対応まで。merge・deploy・Issue #70への書込みは行わない。

## 実装

- 認証済みactive Personal Workspace作成者かつowner本人が本文なしPOSTを明示的に選んだ時だけ、合成fixtureの6手順・同梱PNG 3枚を通常のstaged asset＋finalize claim経路で保存する。資格情報を転送しないRequestでASSETS bindingから固定画像だけを読む。guest contentのサーバー保存ではなくADR-0032の認証後の正規保存である。
- サーバー専用`sample_manual_v1_`operation prefixを公開claimから拒否する。再送は既存manual IDを`alreadySeeded`で返し、改名・編集後も増殖させない。期限切れpendingをexpiredへ確定し、直前intent IDから次operationを決定する。R2途中失敗・commit応答消失・同時実行でも単一manual／3 assetへ収束する。
- 通常アーカイブAPIは`expectedUpdatedAt`のCASとmigration 0010の`manual_archive_events` INSERTを同じD1 batchに含める。scope／append-only trigger、権限再照合、監査失敗時rollbackを備え、revision／step／asset参照を保持する。アーカイブ後だけ次のサンプルを作れる。
- 空状態と常設panelの明示2入口、二重送信防止、未保存・保存／画像／共有処理中guard、遅延応答時の`preserveDetail`、一覧と詳細の`isSample`／「サンプル」badgeを含む。既存の公開閲覧専用サンプルは維持する。
- 再開時の失敗した`showTools()`を既存cloud helperと同じ`width <= 760 ? "編集" : "画像・編集"`へ修正した。visible filterとpanel-open guardを保持する。DEC-115と関連文書を同期した。後述の正式Review P1と自己レビューで再現した監査の置換欠陥も修正した。

## 検証

確認日時: 2026-11-08T21:13:14+09:00（Asia/Tokyo）。検証対象は上記base＋今回差分の作業ツリー。Node v24.22.1、Chrome for Testing 156.0.8078.4、合成データ・mock API／ローカルWorker・SQLite D1 adapterを使用する。remote実証へ換算しない。

- `npm run test:cloud-manual`: 実行56869、66/66、fail 0／skip 0／exit 0。cloud-manual-c、manual-raster、manual-sample、sample-manual-import-uiを含む。tenant／Personal owner／Team／本文／予約prefix拒否、R2途中失敗・応答消失、finalize rollback・応答消失、同時保存、期限切れpending、由来の不変性、アーカイブCAS・監査scope直接DML・append-only・監査rollback・直前role mutationを確認した。
- `npm run test:manual-sample:browser`: 実行24671、3/3、fail 0／skip 0／exit 0。既存公開サンプル2件と投入1件。投入は1366×900／1024×900／390×900すべてで空状態＋常設入口、失敗後再試行、二重送信拒否、編集可能な6手順・画像、badge、既存投入、遅延中の未保存編集保持、アーカイブ取消／確定／再投入、横overflowなし・pageerrorなしを確認した。
- 既存cloud browser回帰: 実行8262、3ファイル4/4、fail 0／skip 0／exit 0。`cloud-manual-ui-browser`、`cloud-manual-tools-browser`、`cloud-manual-uiux-browser`を直列実行し、保存・再読込・画像tools・branding・印刷・一覧再試行focus・20手順の編集と狭幅を確認した。
- 初回修正後の全体`npm run check`: 実行30145、exit 0。56 npm段階（check本体＋55直下script）を完走し、Node summary 24組の集計796/796・fail 0／skip 0。docs 156、secret 473、encoding 401件を確認し、最終encodingまで成功。browser testはこのchainに含まれず、上の別実行を証跡とする。
- asset versionは7 assetのNUL区切りSHA-256を既存回帰と同じ順序で計算し、`sha256-3978951cae4940ed`へ同期した。引継ぎ定数`sha256-63c2dfef4d2d1b29`は実内容と不一致だった。その後、Review修正でcloud JSを変更し、最終hashは`sha256-42104b39a3e4f956`へ再計算した。

先行失敗: 実行36920で対象投入browser単独を修正前に再現し、0/1・fail 1／skip 0／exit 1。1024pxのcloud編集画面で閲覧専用ラベル「操作案内」を待つ6000ms timeoutだった。cloud既存helperと実装の幅分岐に従うテスト修正で上記3幅が成功した。公開`manual-sample-browser.test.mjs`と製品コードはこの切り分けで変更していない。

全体checkの先行失敗: 実行98397はWorker runtimeの版hash回帰で70/71・fail 1／skip 0／exit 1。引継ぎ版定数の不一致を上記の実測値に修正し、全体を改めて実行して成功した。ブラウザヘルパー失敗とは別件として記録する。

ブラウザ実行環境: ローカルは全実行に`MECCHA_TEST_CHROME_PATH=$HOME/.cache/ms-playwright/chromium-1248/chrome-linux64/chrome`を指定した。未指定時のchromium-1234欠落は既知の環境条件であり、今回その起動失敗を再実行したものではない。`tests/support/test-browser.mjs`は変更していない。

自己レビュー: 固定画像の取得元と資格情報非転送、予約prefixの入口分離、workspace固定query、通常claim再利用、認可再照合とD1 atomic監査、guest保存なし、ログ／監査に本文・資格情報を追加しないことを差分とテストで確認した。正式ReviewとMuse受入は別ゲート。

## 保存後のレビューと追加回帰

初回commit `18f4f0888a27236c381e162ff09efc197354f544`をlocal gitでpushし、origin／Draft [PR #298](https://github.com/hozuo0906/meccha-manual/pull/298) head一致を確認した。正式Review依頼`6721231912`、receipt review `5817801807`（Reviewed commit `18f4f0888a`）でP1 comment `4506141316`／thread `PRRT_kwDOTpNknc61AfR2`が出た。POST後の詳細GET中の入力消失を妥当と確認した。

- P1修正: 既存`editVersion`と未保存・保存／画像／共有状態を一覧取得後と詳細反映直前に再確認し、保持時は一覧更新だけにする。詳細と共有情報の両GETが終わるまで新しいeditor stateへ切り替えず、古い入力・focus・元選択を保持する。回帰は一覧／詳細／共有情報GETの3待機位置×1366/1024/390px。追加テスト初回64305は一覧panelを開き忘れたテスト操作で失敗し、修正した53918で詳細待機中の期待する保持assertionを再現（0/1・exit 1）、製品修正後43955で1/1・fail 0／skip 0／exit 0。
- 自己レビューの監査修正: SQLiteの通常設定`recursive_triggers = 0`ではDELETE triggerだけでINSERT OR REPLACEを防げない。追加単独テストの修正前実行（`/tmp/mm-stage-d-audit-repro.log`、0/1・exit 1）で再現し、既存idまたはmanual_idへのINSERT拒否triggerをmigration 0010へ追加した。修正後60197は1/1・fail 0／skip 0／exit 0。異なるid＋既存manualと、別manualの監査に対する既存id置換の両方を拒否し、元の2行がbyte相当で不変なことを確認する。
- 最新main `85b9c4be99858ba1cf36693596de1b85fca2972f`にはPR #292が入り、handoffの先頭checkpoint追加が競合している。read-onlyのmerge-treeで競合は`docs/09-delivery/session-handoff.md`だけと確認。通常PR CIは未実行、初回headのAuto PR jobのみskip。mergeやmain統合は行わず、監督側のゲートへ引き継ぐ。
- 追加修正後の`test:cloud-manual`18662は67/67、`test:manual-sample:browser`36246は4/4、いずれもfail 0／skip 0／exit 0。投入とGET遅延3位置の双方が1366/1024/390pxを完走。
- 追加修正後の先行check61225は実行途中で共有node_modules参照先の依存が欠落し、onboarding testのjose importで停止（exit 1）。同時期のbrowser回帰91451は4成功・3ファイルimport失敗（@playwright/test欠落）、7 test summary／fail 3／skip 0／exit 1。製品assertion失敗とは分けて記録する。
- 元のnode_modules symlinkを保持し、lockfile一致を確認した既存パッケージから空の参照先へ欠落依存をコピーしてimportを復旧した。`cp -a`の所有者情報保持はOperation not permittedでexit 1となったが、ファイル内容コピーは完了した。通常データ書込み障害とは区別し、その後のfsync＋SQLite synchronous FULLの永続書込みprobeが2回連続成功した。SQLITE_IOERR_WRITEや通常ファイルwriteの失敗は観測していない。npm ciは実行していない。
- 最終`npm run check`: 依存復旧後の70549がexit 0、56 npm段階（check本体＋55直下script）を完走。Node summary 24組の合計797/797・fail 0／skip 0。docs 156／secret 473／encoding 407件、最終encodingまで成功。初回796件とは別実行で、新しい監査回帰1件を含む。
- 最終既存cloud browser回帰: 依存復旧後47743、5ファイル8/8・fail 0／skip 0／exit 0。UI／tools／UIUXに加えて共有の正常／失敗／遅延POST・DELETEと画像編集の排他を確認した。先行91451と合算しない。
- 本報告書とhandoffを修正と同じcommitへ含めpushする。初回レビューの成功扱いはせず、最新headへの正式再レビュー、threadへの修正SHA返信→解決、CIを別取得する。最終receipt・最新headの照合結果は[PR Conversation](https://github.com/hozuo0906/meccha-manual/pull/298)とリポジトリ外受入チェックリストの段階D実施記録へ残す。

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
- `migrations/0010_d1_manual_archive_events.sql`
- `package.json`
- `tests/cloud-manual-c.test.mjs`
- `tests/sample-manual-import-browser.test.mjs`
- `tests/sample-manual-import-ui.test.mjs`

## 未実施事項と次の1マイルストーン

`npm ci`、remote SSO／D1/R2／migration適用／Access policy変更、人のscreen reader、merge、deploy、Issue #70への書込みは未実施。Draft PR #298は作成済み。最新headの正式再レビュー・thread解決・CI結果はpush後のPR Conversationと受入チェックリストで照合する。artifactとnode_modules symlinkはcommit対象外で保持する。通常ファイル／SQLiteのdurable write障害は観測していない。依存復旧時の所有者情報保持拒否と2回のprobe成功は上記に区別して記録した。

次の1マイルストーンはMuseによるmainとのhandoff競合解消・最新headのCI実行・正式Review／thread／SHA再照合と利用者受入。保存・報告後の自律監視・継続実行は登録しない。
