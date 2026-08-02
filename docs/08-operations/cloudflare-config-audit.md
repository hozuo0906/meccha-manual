# Cloudflare設定監査

Status: Accepted

## 目的

Cloudflare DashboardへCodex実行環境がログインできない場合でも、GitHub ActionsからCloudflare設定を確認できるようにする。

この監査は、ユーザーに毎回Cloudflare画面を確認してもらう作業を減らすためのハーネスである。

## 実行方法

GitHub Actionsで `Cloudflare Config Audit` を手動実行する。

既定値:

- Worker name: `meccha-manual`
- Health URL: `https://meccha-manual.tattoo-studio-crm.workers.dev/health/config`

## 必要なGitHub Secrets

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `DISCORD_WEBHOOK_URL` または `MECCHA_DISCORD_WEBHOOK_URL` または `DISCORD_DEVELOPMENT_WEBHOOK_URL`

## 確認するもの

- `DISCORD_PUBLIC_KEY` secret名がWorkerに存在すること
- `GITHUB_ISSUE_TOKEN` secret名がWorkerに存在すること
- Discord interaction用と思われるKV namespaceが存在すること
- `/health/config` でDiscord bridge設定がそろっていること

## 出力してよいもの

- secret名
- KV namespace title
- KV namespace ID
- runtime設定の有無
- Codex所感

## 出力してはいけないもの

- secret値
- token値
- Discord Webhook URL
- 実ユーザーの入力内容
- 操作ログ全文

## 監査後の判断

監査がOKの場合:

- KV namespace IDを `wrangler.jsonc` の `kv_namespaces` bindingへ固定する。
- Discord commandを再実行し、GitHub Issue作成まで確認する。

監査がNGの場合:

- Worker secrets、KV namespace、Discord allowlist、GitHub Secretsのどれが不足しているかをActions Summaryで確認する。
- Cloudflare Dashboardまたは `wrangler.jsonc` を修正してから再監査する。

## 2026-08-02監査結果から固定した設定

`Cloudflare Config Audit` で次のKV namespaceを確認した。

- Title: `meccha-manual-discord-interactions`
- ID: `cce0d3a23f034c6b9a83d86422c73863`

このIDはsecretではないため、`wrangler.jsonc` の `DISCORD_INTERACTION_STORE` bindingへ固定する。
`GITHUB_ISSUE_REPOSITORY=hozuo0906/meccha-manual` もsecretではないため、`wrangler.jsonc` のvarsへ固定する。

引き続きCloudflare Worker runtimeへ入れる必要があるもの:

- `DISCORD_PUBLIC_KEY`
- `GITHUB_ISSUE_TOKEN`
- `DISCORD_ALLOWED_GUILD_IDS`
- `DISCORD_ALLOWED_CHANNEL_IDS`

## PR mergeとの関係

DiscordからPR内容確認やレビュー依頼はできるようにする。
ただし初期運用ではDiscordボタンだけでPR mergeは実行しない。

PR mergeの正本は、GitHubのrequired checks、owner approval、branch protection、監査ログとする。
