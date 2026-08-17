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
