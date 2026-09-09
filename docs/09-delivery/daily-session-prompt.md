# 毎日0時・独立セッション用プロンプト

Status: Accepted

## 推奨スケジュール

- 繰り返し: 毎日
- 時刻: 00:00
- タイムゾーン: Asia/Tokyo
- 実行方式: ChatGPTのStandalone scheduled task
- 実行コンテキスト: 各runを保存済みプロンプトから開始し、既存チャットの会話文脈を継続しない
- 既定モード: 読み取り専用の開始確認

## 登録するプロンプト

```text
Repository: hozuo0906/meccha-manual

これは、めっちゃマニュアル開発の新しい独立実行です。
過去チャットの記憶や要約を正本にせず、AGENTS.mdに定めた正本の優先順位に従って現在地を復元してください。
GitHub連携を使い、コード・migration・設定・commit・CI・review threadは正本どおりに実装・検証されているかを確認する実状態・証跡として照合してください。
正本と実状態が矛盾する場合は、実装側を自動的に正として扱わず、作業を止めて docs/09-delivery/open-questions.md へ登録すべき矛盾として報告してください。
確認できていない内容を推測で補わないでください。
AGENTS.mdの「独立タスク体制」と、docs/09-delivery/session-handoff.mdの「独立タスクの作成と引き継ぎ」を適用してください。親PMは`gpt-6-astra`、作業担当は`gpt-5.6-luna`（既定reasoning `high`）です。作成時モデルを確認できない場合は未確認としてください。
担当はサブエージェントを使わず、次の作業タスクを自己増殖させません。依頼済みを実行中、担当終了を成果物完了、親の停止を継続稼働とは扱わないでください。
引き継ぎ可能な変更は、秘密値を除外して専用branchへcommit・pushし、remote SHAを確認したものだけをGitHubの作業正本として扱ってください。未検証の途中作業はWIPと明記し、push失敗は未完了として実エラー・代替試行・再開条件を記録してください。
AGENTS.mdの「進捗報告と実行管理（恒久ルール）」と、docs/09-delivery/session-handoff.mdの「進捗報告と停止時の対応」を必ず適用してください。
担当の実行状態と成果物状態を分け、取得できない状態は「未確認（理由）」としてください。依頼済みを実行中、古いSHAの成功を最新SHAの成功、監視の提案を稼働確認済みと報告しないでください。
リモートSHAが不変でもローカル作業なしとは断定せず、ローカル差分を取得できなければ未確認としてください。

最初に次を順番に確認してください。

1. AGENTS.md
2. docs/09-delivery/session-handoff.md
3. GitHub Issue #70「META: 開発現在地・セッション引き継ぎ」
4. Issue #70に記載された対象Epic、Issue、Pull Request
5. リポジトリのopen Issueとopen Pull Request
6. 各対象Pull Requestのhead branch、base branch、最新head SHA、mainとの差分
7. 最新head SHAに対するCI、Codex Review、未解決review thread
8. 関連するFR、NFR、ADR、AC、API、データ、UX、テスト文書
9. docs/09-delivery/open-questions.md と risk-register.md

Issue #70の記載をそのまま信用せず、AGENTS.mdの正本優先順位とGitHubの実状態・証跡を照合してください。
同じhead branchを異なるbaseへ向けたPull Request、重複Pull Request、古いSHAのCIやレビュー、依存順の矛盾があれば明示してください。

確認後、次の形式で日本語の開始レポートを作成してください。

- 確認日時（Asia/Tokyo）
- 現在のPhase
- 前回記録から完了したこと
- 対象Issue、branch、Pull Request、head SHAと、実行状態／成果物状態／確認根拠
- Pull Request間の依存順と正しいレビュー経路
- CI、Codex Review、未解決review threadの状態
- レビューの新規指摘・持越し・現存確認済み欠陥・未照合事項の区別
- 前回から検証できた利用者の操作・機能、解消した欠陥、残る障害
- 自律監視の登録確認／初回稼働確認と、取得できない項目
- 現在のブロッカーまたは矛盾
- 次に行うべき1マイルストーン
- owner承認が必要な操作
- Issue #70で更新が必要な箇所

この自動実行では、現在地の確認と開始レポート作成だけを行ってください。
担当停止や失敗を検知したら報告へ明記してください。読み取り専用のため再開操作は行わず、必要な再開条件を示してください。
コード、文書、Issue、Pull Request、branch、設定を変更しないでください。
commit、push、merge、deploy、DB migration適用、課金変更、AI API有効化、共有リンク公開を行わないでください。

開始レポートの最後に、ユーザーがそのまま送れる次の一文を付けてください。

「上記の現在地を前提に、次の1マイルストーンを進めてください。AGENTS.mdの品質ゲートを守り、mainへ直接pushせず、完了前にテスト・レビュー・引き継ぎ更新まで行ってください。」
```

## ChatGPTへの登録方法

- ChatGPTの `Scheduled` から新しいStandalone taskとして登録する。
- 既存チャット内のスケジュールとして登録しない。既存チャットへ戻す方式では、前日の会話文脈を継続するため、この運用の目的と合わない。
- GitHub連携を利用できる状態で登録する。
- 最初の数回は結果を確認し、GitHubの読み取り範囲やレポート粒度が広すぎる場合はプロンプトを調整する。

## 運用上の補足

- この文書の編集だけでは登録済みタスクのプロンプトは更新されない。保存済み設定への反映と初回実行の確認を別々に行い、未反映・未確認の場合は明記する。
- 自動実行は、独立したrunで現在地を復元するところまでに留める。タスクの新規作成や自己増殖は行わない。
- 実装開始はユーザーが開始レポートを確認してから指示する。
- 前日のセッションは、終了前にIssue #70と対象Pull Requestを更新する。
- GitHubへpushされていないローカル変更は引き継げないため、必要な作業は安全なbranchへ残す。
- 対象IssueやPull Requestが変わっても、固定プロンプトを毎日書き換えず、Issue #70を更新することで追従させる。
