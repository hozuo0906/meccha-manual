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
過去チャットの記憶や要約を正本にせず、GitHubの実状態を正本として現在地を復元してください。
GitHub連携を使って確認し、確認できていない内容を推測で補わないでください。

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

Issue #70の記載をそのまま信用せず、GitHubの実状態と照合してください。
同じhead branchを異なるbaseへ向けたPull Request、重複Pull Request、古いSHAのCIやレビュー、依存順の矛盾があれば明示してください。

確認後、次の形式で日本語の開始レポートを作成してください。

- 確認日時（Asia/Tokyo）
- 現在のPhase
- 前回記録から完了したこと
- 現在進行中のIssue、branch、Pull Request、head SHA
- Pull Request間の依存順と正しいレビュー経路
- CI、Codex Review、未解決review threadの状態
- 現在のブロッカーまたは矛盾
- 次に行うべき1マイルストーン
- owner承認が必要な操作
- Issue #70で更新が必要な箇所

この自動実行では、現在地の確認と開始レポート作成だけを行ってください。
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

- 自動実行は、独立したrunで現在地を復元するところまでに留める。
- 実装開始はユーザーが開始レポートを確認してから指示する。
- 前日のセッションは、終了前にIssue #70と対象Pull Requestを更新する。
- GitHubへpushされていないローカル変更は引き継げないため、必要な作業は安全なbranchへ残す。
- 対象IssueやPull Requestが変わっても、固定プロンプトを毎日書き換えず、Issue #70を更新することで追従させる。
