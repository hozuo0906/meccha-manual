# セッション引き継ぎ運用

Status: Accepted

## 目的

長期開発を特定のChatGPT/Codex会話へ依存させず、新しいセッションがGitHub上の正本と実状態・証跡を照合して安全に作業を再開できるようにする。

会話履歴は補助情報として扱い、正本の優先順位は `AGENTS.md` に従う。コード、migration、設定、commit、CI、review threadは、正本どおりに実装・検証されているかを確認するための実状態・証跡として扱う。

## 現在地の正本

プロジェクト全体のライブな現在地は、GitHub Issue #70 `META: 開発現在地・セッション引き継ぎ` に集約する。

正本の優先順位は `AGENTS.md` の文書運用に合わせ、次のとおりとする。

1. ADRと `docs/09-delivery/decision-log.md`
2. 要件、データ、API仕様
3. UX仕様
4. Issue分解・対象Issue・Pull Request
5. subagent reports、Issue #70の現在地サマリー、過去の会話や手作業の要約

実際のコード、migration、テスト、設定ファイル、commit、CI、review threadは、正本の内容が実装へ反映されているかを確認するための実状態・証跡として必ず照合する。正本と実状態が矛盾する場合は、実装側を自動的に正として扱わず作業を止め、`docs/09-delivery/open-questions.md` に登録して解消する。

Issue #70とGitHubの実状態が食い違う場合は、正本との整合を確認した上でIssue #70を更新する。古い記載を前提に実装を続けない。

## セッション開始手順

新しいセッションは、過去チャットの全文ではなく、次を順番に確認する。

1. `AGENTS.md`
2. この文書
3. GitHub Issue #70
4. 対象Epic、Issue、Pull Request
5. 対象branchの最新commit、base branch、`main`との差分
6. 最新head commitに対するCI、Codex Review、未解決review thread
7. 関連するFR、NFR、ADR、AC、API、データ、UX、テスト文書
8. `docs/09-delivery/open-questions.md` と `risk-register.md`

実装前に、次の形式で現在地を整理する。

- 完了済み
- 未完了
- 現在の問題または矛盾
- 対象Issue、branch、Pull Request、head SHA
- 次に行う1マイルストーン
- リスク
- owner承認が必要な操作

## セッション中のルール

- 原則として1セッションで1マイルストーンだけを進める。
- 日付が変わっても、未検証の変更を無理に区切って完成扱いにしない。
- 無関係な変更を同じbranchやPull Requestへ混ぜない。
- mainへ直接pushしない。
- 複数branchを並行する場合は、base/headと依存順を明記する。
- 同一head branchを異なるbaseへ向けたPull Requestがある場合は、正しいレビュー経路を先に確定する。
- 会話全文や生思考は保存せず、結論、根拠、採否、リスク、未決だけを記録する。

## セッション終了手順

作業を別セッションへ渡す前に、可能な範囲で次を実施する。

1. 差分を自己レビューする。
2. `npm ci`、`npm run check`、必要な個別テスト、`git diff --check` を実行する。
3. 未実行テストと理由を記録する。
4. 変更を意図の分かるcommitへまとめ、branchへpushする。
5. Pull Requestの本文またはコメントへ、変更内容、検証結果、既知リスクを記録する。
6. 最新head SHAと、CI・Codex Review・review threadの状態を確認する。
7. Issue #70を更新する。
8. 次の1マイルストーンを1つに絞る。

Issue #70には最低限、次を残す。

- 最終確認日時（Asia/Tokyo）
- 現在のPhase
- 完了済み
- 未完了
- 対象Issue、branch、Pull Request、head SHA
- テスト結果
- P0/P1/P2と未解決review thread
- ブロッカー
- 次の1マイルストーン
- owner承認が必要な操作

## PR #78 実行引き継ぎ（2026-08-17）

この節は、PR #78 `feature/phase2-manual-editor-ui` をowner承認後にmergeできる品質へ仕上げた実行の固定証跡である。最終head SHA、最終CI、最終Codex Review、未解決thread数は、この文書を含むcommit自身では確定できないため、PR #78とIssue #70のライブ状態を確認する。

### 確認済みの基準

- main: `807f3b240c5c476a4e01e8ad4979a12ab66ce468`
- PR: #78、base `main`、head `feature/phase2-manual-editor-ui`
- code-validation head: `f287db3f989a655715f14b01c0e8b7afcd06b1ba`
- mainからのbehind: 0（mainを2-parent merge済み）
- 一時workflow `.github/workflows/apply-pr78-final-three-fixes.yml`: 削除済み
- 一時適用script `scripts/apply-pr78-final-three-fixes.py`: 削除済み
- staging／production migration、deploy、課金、外部AI API、共有リンク、外部ユーザー招待: 未実行

### 恒久修正

- 結果不明のmanual作成状態をworkspace単位で保持し、workspace切替や遅着list GETで警告を失わない。
- 初回detail取得中の所属・権限失効を、一覧へ戻った後も含めfail closedで再描画・再取得する。
- manual、current draft、steps、編集可否を`get_manual_edit_detail`の単一SQL／MVCC snapshotから返す。
- direct step RPCとWorkerで、userinfo、authority、IPv4／IPv6、port、punycode、underscore host、空白・制御文字、backslash、入力・serial化後長さのURL境界を一致させる。
- 最終Codex Reviewで確認されたRFC 3986 ASCII delimiter（`'`、`;`、`=`）を、Worker・direct RPCの共通URL budgetでWHATWG同様に数え、apostropheはquery内の`%27`とpath／fragmentの1文字を区別する。
- 追加・更新RPCの不正URLを`400 MANUAL_STEP_URL_INVALID`へ決定的に変換する。
- FR-004／FR-005の参照をADR-0004／ADR-0005へ修正し、AC-010の公開URLはPR #78ではなくEpic #54の後続範囲として分離する。

### code-validation headの品質証跡

- Manual API: run `32036328711` success
- Manual Edit API: run `32036328713` success（Unit/API、使い捨てPostgreSQL、RLS、RPC、共有lock、migration safety）
- Manual Step Migration: run `32036328703` success（direct RPC正常・異常境界を含む）
- Manual Editor UI: run `32036328750` success（`npm ci`、`npm run check`相当repository checks、Phase 1／2 Playwright、`git diff --check`）
- Phase 1 Readiness Gate: run `32036328706` success
- Docs CI: run `32036328709` success
- Quality Loop Gate: run `32036328700` success
- R2 Storage Policy: run `32036328719` success
- Cloud Codex Readiness: run `32036328712` success
- Business OS Codex Runner: run `32036328701` success
- code-validation head時点の未解決review thread: 0件

ローカル環境では外部npm取得が制限され、Docker／PostgreSQL／Playwright実行環境もないため、`npm ci`、`npm run check`、DB、browser E2EはGitHub Actionsの同一head証跡を採用した。ローカルでは対象Unit/API、Worker runtime、migration・契約静的検査、機密値、encoding、`git diff --check`を実行した。失敗した検査をskipして成功扱いにはしていない。

### 依存関係と次の操作

- PR #67、#68、#73、#75はopen／未mergeのまま。PR #78への包含確認後も、owner承認なしにcloseしない。
- Issue #55はADR-0004／ADR-0005、Issue #72は未merge依存関係へ訂正済み。
- この文書を含む最終headで必須CI成功、Codex Review完了、P0／P1／P2未解決0、review thread 0を再確認する。
- 次の1マイルストーンはownerによるPR #78のmerge承認とmergeである。merge後のstaging migration／deploy、旧PR整理、公開機能は別マイルストーン・別承認とする。

## PR #81 実行引き継ぎ（2026-08-18）

- 対象: Issue #80、branch `agent/phase2-manual-publication`、PR #81、base `main`
- 起点main: `6c6a2511de5830d9003936942b58ef4561d5c878`
- 実装: 表示中revision IDを必須にする公開・次draft作成API、manual row lock内で期待IDを照合するRPC、確認付き編集UI、viewer拒否、結果不明後の詳細再照合。
- DB: `202608180001_phase2_manual_publication.sql`を追加。期待IDなしの旧公開RPCはauthenticated実行不可。公開版は不変のままmetadataとactive stepsだけを次draftへ複製する。
- 範囲外: 未ログイン公開URL・共有リンク、staging／production migration適用、deploy、課金、外部AI API。
- ローカル: `npm ci`、対象Unit/API/UI 74件、Worker runtime 59件、docs、typecheck、migration ordering／safety、bundle dry-run、`git diff --check`を確認。Playwrightは配布元証明書の時刻エラーでChromiumを取得できず、DBはローカルPostgreSQL／Docker不在のためGitHub Actionsで確認する。
- GitHub Actions: 使い捨てPostgreSQLの公開・draft作成・viewer・競合・lock検査を含むManual Edit APIが成功。Phase 1／2 PlaywrightとPhase 1 Readinessを含む最新headの最終状態はPR #81で確認する。
- 最新head SHA、Codex Review、未解決thread数は、この文書を含むcommitより後に確定するためPR #81とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: 最新headで全必須CI、Codex Review、P0／P1／P2、未解決thread 0を確定し、owner承認後にPR #81をmergeする。merge、migration適用、deployは自動実行しない。

## PR #83 実行引き継ぎ（2026-08-18）

- 対象: Issue #82、branch `agent/phase2-manual-archive`、PR #83、base `main`
- 起点main: `f400c647d2da47c7df5e771cb4ff20a79b638bd3`
- code-validation head: `0bf19c91ee07a01ab6dd4ca53eaa30e7c9f7afdf`
- 実装: owner／admin／editor向けの確認付きアーカイブAPIとUI、manual row lock内でworkspace・role・期待`updated_at`を再照合する`archive_manual` RPC、結果不明時の自動再送防止、`manual.archived`監査ログ。全step mutation RPCもmanual→revision順でlockし、成功時にmanualのarchive versionを進める。
- 保持境界: `status = archived`と`archived_at`だけを更新し、draft／published revision pointer、revision、stepを保持する。通常の一覧・詳細・authenticated直接SELECTからarchived manualを除外する。
- 拒否境界: viewer、別workspace、既archived、古いversionを拒否する。未保存フォームがある状態ではアーカイブを開始しない。archived manualのrevision／step／step targetはauthenticated直接SELECTから除外し、専用lock/version経路が未実装のstep target直接DMLはrevokeする。
- 未決・範囲外: 復元、物理削除、関連資源の削除順序はOQ-028で未決。本PRでは実装しない。staging／production migration、deploy、共有リンク公開、課金、外部AI APIも未実行。
- ローカル: `npm ci`、対象Unit／API／UI 79件、Worker runtime 59件、Worker mutation 3件、App auth 87件、Phase 1 accessibility 45件、typecheck、bundle dry-run、docs、workflow、migration ordering／safety、機密値、encoding、`git diff --check`が成功。ローカルDB／Docker不在とChromium配布元の証明書時刻エラーにより、DBとPlaywrightはGitHub Actionsで確認した。
- code-validation headのGitHub Actions: Manual API、Manual Edit API（使い捨てPostgreSQLのRLS／RPC／監査／lock検査）、Manual Step Migration、Manual Editor UI（`npm ci`、repository checks、Phase 1／2 Playwright）、Phase 1 Readiness、Docs CI、Quality Loop、R2 Storage Policy、Cloud Codex Readiness、Business OS Codex Runnerが成功。
- code-validation head時点のreview thread: 0件。最終head SHA、最終Codex Review、Latest Review Gateは、この文書を含むcommitより後に確定するためPR #83とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: この文書を含む最新headで全必須CI、Codex Review、P0／P1／P2、未解決thread 0を再確定し、承認済みのPR #83をmergeする。merge後は別branch／PRでIssue #57のBrowser Run操作記録とdraft生成へ進む。

## PR #85 実行引き継ぎ（2026-08-18）

- 前マイルストーン: PR #83はsquash merge済み。main merge commitは`331e89cb8f48a67917f1e67ab023c1158c00fb27`、Issue #82はclose済み。
- 対象: Issue #84、branch `agent/browser-run-draft`、PR #85、base `main`。親Issue #57は実Browser Run E2E未完了のためopenを維持する。
- 起点main: `331e89cb8f48a67917f1e67ab023c1158c00fb27`。
- 実装: capture start、Live View、command、mobile previewのworkspace付き`/api`／`/v1` APIを、認証・same-origin・owner／admin／editor確認後に`503 BROWSER_EGRESS_NOT_VERIFIED`でfail closedにする。Worker設定・型へBrowser Run／Durable Object bindingは追加せず、Cloudflare通信は開始しない。
- 正規化: click、input completion、navigation、方向付きscrollだけを最大200件受理し、正の一意な数値sequence順へ整列する。重複sequenceは先勝ちにせず、同じsequenceを持つ全eventを除外する。click／input completionのtargetは表示値・入力値由来でないことを証明できないため常に`対象`／`入力欄`へ置換し、navigation URLもpathへ秘密値が埋め込まれ得るため保存しない。未知field、入力値、Cookie、Authorizationは出力へ複製しない。
- draft: 外部AIを使わず、日本語manual step候補を決定的に生成する。同方向の連続scrollは1件へ集約する。DB／R2への保存、manual revision RPCとの接続は後続。
- 既存回帰: archive DB検査を固定draft UUIDではなくcurrent draft pointerへ追従させた。結果不明archiveのPlaywright fixtureはChromiumの透過再試行を誘発し得る`route.abort()`を使わず、不正JSON応答で決定的に再現し、archive API呼出1回を明示検証する。archive後の一覧遷移は選択キーをworkspace実体と誤認せず、現在sessionのactive workspaceを再解決して`undefined` workspace APIを防ぐ。
- Codex指摘: input／click labelとnavigation pathへの秘密値混入（P1）、workspaceなしの古い正規API契約、重複sequenceの入力順依存と型predicate不一致、方向なしscroll、navigation URL非保存の下流データ・運用契約反映漏れ（P2）をコード・仕様・回帰テストへ反映した。実際に解決したthreadだけをresolveした。
- ローカル: `npm ci --ignore-scripts --cache /tmp/meccha-npm-cache`、capture Unit/API/privacy 11件、manual editor UI Unit 5件、Worker runtime／mutation、App auth、Phase 1 accessibility、typecheck、bundle dry-run、docs、workflow、runtime boundary、機密値、encoding、`git diff --check`を確認。ローカルChromiumはnetwork approval制約により取得できないため、Phase 1／2 Playwrightは同一headのGitHub Actionsを証跡とする。DB変更はない。
- 安全境界: OQ-006／DEC-032が要求する全Browser通信のactual peer検証は未完了。承認済みhostも例外にせず、P0実証が完了するまで実Browser Run、Live View URL、navigate、mobile previewを有効化しない。staging／production deploy、migration、課金、外部公開も未実行。
- 最新head SHA、全必須CI、最新Codex Review、未解決thread数、merge結果は、この文書を含むcommitより後に確定するためPR #85とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: PR #85を承認済み条件でmerge後、Issue #57のP0 egress検証を、navigation、subresource、WebSocket、Service Worker、download、WebTransport／QUIC、WebRTC ICE／STUN／TURNを含む外部fixtureで実証する。拘束不能な経路が1つでもあればfail closedを維持し、Browser bindingを有効化しない。

## Issue #86 実行引き継ぎ（2026-08-19）

- 前マイルストーン: PR #85はmerge済み。Issue #72はPR #78への包含とmerge済み証跡に合わせて更新し、完了closeした。
- 対象: Issue #86、PR #87、公開branch `agent/browser-run-draft`（GitHub連携の新規ref作成制約により、merge済みPR #85のbranchをmain起点へ更新して再利用）。親Issue #57とOQ-006はlive実証未完了のためopenを維持する。
- 起点main: `57a2cf6f14a290970c4ba66bc3c5c2ef80a19070`。
- 公式仕様確認: Browser Run session作成APIの`guardrails.allowedDomains`／`allowedDomainSets`はoutbound HTTP/S制限を提供する。一方、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURN、DNS rebinding後のactual peer送信前拒否までの保証は公式契約から確認できない。
- repo-side実装: guardrails付きsession作成、専用隔離fixtureの全10経路証跡評価、欠落・重複・未知経路・送信後拒否をfail closedにする契約テスト、明示確認とGitHub `staging` Environmentを要求する手動workflowを追加する。PR CIではBrowser Runを起動しない。
- 安全境界: live実証が全経路で合格し、後続ADRがAcceptedになるまで、製品WorkerへBrowser Run bindingを追加せず、`capture.browserRun.egressVerified.enabled=false`と`BROWSER_EGRESS_NOT_VERIFIED`を維持する。
- live実行に必要な未確認項目: 隔離fixture／受信sink、GitHub `staging` Environment、専用Cloudflare tokenとfixture secret。production、実顧客データ、deploy、migration、課金、外部公開は対象外。
- 次の1マイルストーン: repo-side契約をPRでレビュー・CI完了後、上記の隔離環境を用意して`RUN_ISOLATED_STAGING_P0`の手動実証を行う。1経路でも不明または拘束不能ならfail closedを維持する。
- PR #87 code-validation head `291cd0389303b89170305b6e410c456a9f44bb0d`ではBrowser Run Egress Proof、対象Unit／security 23件、DB、Phase 1／2 Playwrightを含む全必須CIが成功。既知P1×4／P2×10を恒久修正し、同headへのCodex Reviewで追加P0／P1／P2なし、未解決review thread 0件、PR Latest Review Gate成功を確認した。
- Codex対応では、remote session cleanupの独立実行と全hang境界、Cloudflare v4 envelope、probe相関、0 byte矛盾拒否、run／SHA固定artifact、CDP／fixture URL・未知channelのログ非露出をコード・仕様・回帰テストへ反映した。
- 本引き継ぎ更新commit後の最終head SHAと最終Review GateはPR #87のライブ状態を正とする。live実証は隔離fixture／GitHub `staging` Environment／専用Secrets未構成のため未実行であり、OQ-006と製品fail closedを維持する。

## 毎日0時の独立セッション

毎日0時に前日の会話文脈を継続しない実行を開始する場合は、`docs/09-delivery/daily-session-prompt.md` を使用する。

推奨設定は次のとおり。

- タイムゾーン: Asia/Tokyo
- 実行時刻: 毎日00:00
- 実行方式: ChatGPTのStandalone scheduled task
- コンテキスト: 各runを保存済みプロンプトから開始し、既存チャットの会話文脈を継続しない
- 情報源: GitHub連携を使用し、Issue #70とリポジトリを読み直す
- 既定権限: 読み取りと現在地整理を基本とする
- 許可する書き込み: 明示した場合のみIssue #70の更新
- 禁止: 自動merge、production反映、DB migration適用、課金変更、AI API有効化、共有リンク公開

ChatGPTでは、Standalone scheduled taskと、既存チャットへ戻るscheduled taskを使い分けられる。このプロジェクトでは会話上限とコンテキスト汚染を避けるため、既存チャット内ではなくStandaloneとして登録する。

ローカルcheckoutだけに存在してGitHubへpushされていない変更は、クラウド側の独立runから確認できない。セッションをまたいで必要な変更は、安全なbranchへcommit・pushしてから引き継ぐ。

## 日付で区切る際の注意

「毎日必ず新セッション」は分かりやすい運用だが、日付よりマイルストーンを優先する。

- 小さな作業: その日のセッションで完了、検証、記録まで行う。
- 大きな作業: 日付が変わる前に安全な中間commitと引き継ぎ記録を作る。
- 障害対応中: 未検証の修正を完成扱いにせず、再現条件、仮説、試したこと、次の検証を残す。

これにより、会話上限や端末停止が発生しても、次のセッションがGitHubから再開できる。


## Cloudflare Access / D1移行引き継ぎ（2026-08-30）

- Owner決定: 認証はCloudflare AccessのメールOTP・招待制、業務DBはD1、アプリ/APIはWorkers、ファイルはprivate R2へ統一する。
- 正本: ADR-0028、DEC-064、Issue #176、`cloudflare-migration-roadmap.md`。DEC-063のpreview Access保護は継続する。
- 旧Supabase Auth/Postgres/RLS実装、migration、RPC、テストは移行前baselineとして保持する。新規機能の土台、staging合格、production候補として拡張しない。
- PR #175でCloudflare Access保護とproduction自動promote停止をmainへ取り込み済み。Issue #92はcompleted closeされ、#92由来のblanket main merge holdは解除済みである。Access保護、non-production branch build停止、version upload-onlyは継続する。
- 現行live RLS gate workflow `.github/workflows/phase1-rls-live.yml` とrunbook `docs/08-operations/phase1-rls-live-gate.md` の `Status: Accepted` はpre-M5で維持する。現行gateはIssue #215の文書・checker整合PRとは別にownerが明示承認した場合だけ登録済みの既存staging/test入力で実行できる。ただし新規test user、資格情報、環境は追加せず、Issue #215のPRではworkflow dispatchとlive証跡生成、新規project、Environment、Secretの作成・登録を行わず、実行はowner承認済み既存staging/test契約に限定する。future M5 replacement PRでは、Issue #176 M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で、(1) replacement gateと対応docsの着地、(2) 旧 `.github/workflows/phase1-rls-live.yml` の削除、(3) runbookの `Status: Superseded` 化、(4) source-of-truth checkerとworkflow checkerのcanonical存在必須からcanonical/renamed旧identity再追加拒否への反転、(5) workflow本体、`scripts/check-workflows.mjs`、`scripts/check-cloudflare-source-of-truth.mjs`、`tests/cloudflare-access-fetch.test.mjs` の同一PR scope化を同時に完了する。着地後の別変更、M6への持越し、replacement未着地のまま先行退役を禁止する。
- 実immutable previewのstaging-only D1/R2・production backend非到達証明はIssue #176 M5の独立migration gateへ移管する。完了まではstaging合格、production資源作成・deploy、外部招待を禁止する。
- Issue #95のSupabase staging内部alphaはIssue #176 M5のAccess/D1/R2 staging実証へ置換し、旧経路を実行しない。
- production Access application、production D1、migration、deploy、実ユーザー招待、実データ移行は未実施。
- ローカルPC依存の作業は行わず、GitHub上のbranch/PR/CIを正本の実状態として照合する。

次の1マイルストーンはIssue #176 M0の文書PRを品質ゲートまで完了し、その後M1 Access identity spikeを別Issue・別PRで開始することである。
