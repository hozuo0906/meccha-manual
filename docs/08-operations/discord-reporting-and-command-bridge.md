# Discord reporting and command bridge

Status: Accepted

## Purpose

開発報告と軽い進行確認をDiscordへ集約する。
ただし、サブエージェントの生思考や会話全文は送らず、結論、合否、リスク、次アクションだけを通知する。

## Current scope

GitHub ActionsからDiscord WebhookへCI結果を通知する。

対応済み:

- `npm run notify:discord`
- `npm run notify:discord:dry-run`
- `.github/workflows/docs-ci.yml` の完了通知
- `.github/workflows/discord-notify-test.yml` の手動疎通確認
- `.github/workflows/deployment-gates.yml` のstaging/production承認ゲート入口

## Secret names

通常CIの開発報告では、次のいずれかを使う。

- `DISCORD_WEBHOOK_URL`
- `MECCHA_DISCORD_WEBHOOK_URL`
- `DISCORD_DEVELOPMENT_WEBHOOK_URL`

staging/productionの承認ゲートでは、通知先の取り違えを防ぐため環境別Secretだけを使う。

- staging: `DISCORD_STAGING_WEBHOOK_URL`
- production: `DISCORD_PRODUCTION_WEBHOOK_URL`

productionで通知Secretが未設定の場合、deployment gateはfail closedにする。

## Side task handoff

Discord通知ハーネスのサイドタスク:

- task id: `019fb8ec-ee4f-7370-ab5f-0b61fb09f931`
- repo: `https://github.com/hozuo0906/meccha-manual.git`
- branch: `feature/discord-notify-test`
- scope: `.github/workflows` と `docs/08-operations`

サイドタスクのルール:

- mainへ直接pushしない。
- `DISCORD_WEBHOOK_URL` の値を聞かない。
- Webhook URL、token、secretをログやMarkdownに書かない。
- サイド側の成果はPRで合流する。
- メインセッションのADR、decision-log、運用docsを正本にする。

## Notification policy

Discordへ送ってよいもの:

- CIの成功/失敗
- 対象branch
- commit short SHA
- GitHub Actions run URL
- 作業完了の要約
- P0/P1レビュー結果の件数

Discordへ送らないもの:

- secret
- access token
- Supabase service role key
- DB password
- JWT Secret
- 実ユーザーの個人情報
- サブエージェントの生思考
- 長いログ全文

## Reliability

- 通常CIのDiscord通知は失敗してもCI本体を落とさない。
- `Discord Notify Test` workflowは通知成功を必須にする。
- `Deployment Gates` workflowはstaging/production通知成功を必須にする。
- 通知送信は10秒timeout、最大2回試行にする。
- Discord APIのエラー本文はログへ出さない。

## Command intake

Discord Webhookは片方向のため、DiscordからCodexへ直接指示を送る用途には使えない。
指示受付は次のどちらかで実装する。

Recommended:

1. Discord BotまたはInteraction endpointをCloudflare Workerに作る。
2. Discord署名検証とtimestamp検証でリプレイを防ぐ。
3. 許可Discord server、channel、role、userを検証する。
4. `/meccha task ...` のようなslash commandを受ける。
5. WorkerがGitHub Issueを作成、または既存Issueへコメントする。
6. `from-discord`、`needs-triage`、`user-request` のようなIssue labelを付ける。
7. CodexはGitHub Issue/PRコメントを正として作業する。

Alternative:

1. Discordの投稿を外部自動化でGitHub Issueへ転記する。
2. CodexはGitHub Issueだけを見る。

## Non-approvable from Discord only

次の操作はDiscordだけでは承認済みにしない。

- production反映
- secret変更
- DB migration
- 課金設定
- 共有リンク公開
- 実ユーザーデータの閲覧
- AI API有効化

GitHub PR、Cloudflare、Supabase側の承認ゲートを正本にする。
