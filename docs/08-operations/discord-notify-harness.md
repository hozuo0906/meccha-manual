# Discord通知ハーネス運用メモ

Status: Accepted

## 目的

GitHub ActionsからDiscordへ通知できることを、`main` への直接pushに依存せず手動で確認する。

## 対象

- Workflow: `.github/workflows/discord-notify-test.yml`
- Script: `scripts/discord-notify.mjs`
- npm script: `npm run notify:discord`
- 実行方式: GitHub Actionsの `workflow_dispatch`

## 手動実行

1. GitHubのActions画面で `Discord Notify Test` を開く。
2. `Run workflow` から実行したいブランチと通知環境を選ぶ。
3. 実行ログで `Discord notification sent for <environment>.` を確認する。
4. Discord側に通知テストのメッセージが届いたことを確認する。

通知環境は `development`、`staging`、`production` から選ぶ。初期値は `development` とする。

## 通知内容

通知はDiscord Embedで送信し、次の項目を含める。

```text
タイトル: Discord通知テスト: 成功
環境: 開発、ステージング、または本番
リポジトリ: hozuo0906/meccha-manual
ブランチ: 実行ブランチ
実行者: GitHub Actionsのactor
イベント: workflow_dispatch
コミット: 実行コミット
```

`リポジトリ`、`ブランチ`、`実行者`、`イベント`、`コミット` はGitHub Actionsの実行コンテキストから取得する。

## Secret運用

- 開発通知は `DISCORD_WEBHOOK_URL`、`MECCHA_DISCORD_WEBHOOK_URL`、`DISCORD_DEVELOPMENT_WEBHOOK_URL` の順で利用する。
- ステージング通知は `DISCORD_STAGING_WEBHOOK_URL` を利用する。
- 本番通知は `DISCORD_PRODUCTION_WEBHOOK_URL` を利用する。
- Webhook URLの値はMarkdown、ログ、PR本文、Issue本文へ記載しない。
- Workflowは `DISCORD_NOTIFY_REQUIRED` を `true` にして実行するため、対象環境のsecretが未設定の場合は失敗する。
- 送信失敗時もWebhook URLやDiscordのレスポンス本文はログへ出さない。

## Branch運用

- このハーネスは `workflow_dispatch` のみで起動する。
- `main` への直接pushを前提にしない。
- 開発や検証は `feature/*` ブランチから実行できる。

## ローカル確認

送信せずにpayloadだけ確認する場合はdry runを使う。

```text
npm run notify:discord:dry-run
```
