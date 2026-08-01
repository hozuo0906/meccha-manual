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
- `.github/workflows/auto-pr.yml` のPR自動作成/検出通知
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
指示受付は `Discord Slash Command -> Cloudflare Worker -> GitHub Issue -> Codex` にする。

対応endpoint:

```text
POST /v1/integrations/discord/interactions
```

対応command:

```text
/meccha task title:<title> body:<body> priority:<P0|P1|P2|P3>
```

Workerの処理:

1. `x-signature-ed25519` と `x-signature-timestamp` を検証する。
2. timestampが許容時間外なら拒否する。
3. `DISCORD_ALLOWED_GUILD_IDS`、`DISCORD_ALLOWED_CHANNEL_IDS`、`DISCORD_ALLOWED_USER_IDS`、`DISCORD_ALLOWED_ROLE_IDS` を確認する。
4. `DISCORD_INTERACTION_STORE` でinteraction IDを短期保存し、同じDiscord requestから重複Issueを作らない。
5. command内容を検証する。
6. Discordへ3秒以内にdeferred ephemeral responseを返す。
7. `GITHUB_ISSUE_TOKEN` でGitHub Issueを作成する。
8. Discord original responseをIssue URLで更新する。
9. CodexはGitHub Issueを正としてtriageする。

危険操作検知:

- `production`、`deploy`、`migration`、`Stripe`、`billing`、`secret`、`AI API`、本番、課金、決済、共有リンクなどを含む依頼は危険操作候補として扱う。
- 危険操作候補のIssueには `approval-required` と `blocked-from-discord` を付ける。
- GitHub label作成に失敗した場合、labelなしIssueへfallbackしない。

Slash Command登録:

```bash
npm run discord:register-command
```

dry-run:

```bash
npm run discord:register-command:dry-run
```

登録に必要な環境変数:

- `DISCORD_APPLICATION_ID`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID` 開発中は必須。指定するとguild command。
- `DISCORD_REGISTER_GLOBAL` 任意。`true` の場合だけglobal command登録を許可する。

Workerに必要なsecret:

- `DISCORD_PUBLIC_KEY`
- `GITHUB_ISSUE_TOKEN`

Workerに必要なbinding:

- `DISCORD_INTERACTION_STORE`

この2つはCloudflare Worker runtimeで使うため、GitHub SecretsだけではなくCloudflare Secretにも登録する。
値はチャット、Markdown、ログへ貼らない。

Workerに設定できる制限:

- `DISCORD_ALLOWED_GUILD_IDS`
- `DISCORD_ALLOWED_CHANNEL_IDS`
- `DISCORD_ALLOWED_USER_IDS`
- `DISCORD_ALLOWED_ROLE_IDS`
- `DISCORD_ALLOW_UNSCOPED_COMMANDS`
- `GITHUB_ISSUE_REPOSITORY`

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
