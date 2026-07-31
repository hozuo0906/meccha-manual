# Discord通知ハーネス運用メモ

Status: Accepted

## 目的

GitHub ActionsからDiscordへ通知できることを、`main` への直接pushに依存せず手動で確認する。

## 対象

- Workflow: `.github/workflows/discord-notify-test.yml`
- Secret: `DISCORD_WEBHOOK_URL`
- 実行方式: GitHub Actionsの `workflow_dispatch`

## 手動実行

1. GitHubのActions画面で `Discord Notify Test` を開く。
2. `Run workflow` から実行したいブランチを選ぶ。
3. 実行ログで `Discord notification test completed.` を確認する。
4. Discord側に通知テストのメッセージが届いたことを確認する。

## 通知内容

通知本文は次の項目で構成する。

```text
めっちゃマニュアル 開発通知
- 種別: 通知テスト
- リポジトリ: hozuo0906/meccha-manual
- ブランチ: 実行ブランチ
- 実行者: GitHub Actions
- 結果: OK
```

`リポジトリ` と `ブランチ` はGitHub Actionsの実行コンテキストから取得する。

## Secret運用

- `DISCORD_WEBHOOK_URL` はGitHub Secretsで管理する。
- Webhook URLの値はMarkdown、ログ、PR本文、Issue本文へ記載しない。
- Workflowはsecretが未設定の場合、Discord送信前に `Missing DISCORD_WEBHOOK_URL` として失敗する。
- 送信失敗時もWebhook URLやDiscordのレスポンス本文はログへ出さず、HTTPステータスだけを表示する。

## Branch運用

- このハーネスは `workflow_dispatch` のみで起動する。
- `main` への直接pushを前提にしない。
- 開発や検証は `feature/*` ブランチから実行できる。
