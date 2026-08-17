# セッション引き継ぎ運用

Status: Accepted

## 目的

長期開発を特定のChatGPT/Codex会話へ依存させず、新しいセッションがGitHubの実状態から安全に作業を再開できるようにする。

会話履歴は補助情報として扱い、コード、文書、Issue、Pull Request、commit、CI、review threadを正本とする。

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
