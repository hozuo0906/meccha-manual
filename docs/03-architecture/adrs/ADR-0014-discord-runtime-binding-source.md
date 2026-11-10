# ADR-0014 Discord runtime bindingをWrangler設定へ固定する

Status: Accepted

## Context

`Cloudflare Config Audit` workflowで、Cloudflare API tokenの認証とKV namespace一覧取得が通ることを確認した。
監査結果では `meccha-manual-discord-interactions` namespaceが存在し、IDは `cce0d3a23f034c6b9a83d86422c73863` だった。

一方でWorker runtimeにはDiscord bridge用のsecret、repository設定、KV binding、allowlistが不足していた。

## Decision

`DISCORD_INTERACTION_STORE` KV bindingと `GITHUB_ISSUE_REPOSITORY` はsecretではないため、`wrangler.jsonc` に固定する。

Cloudflare Worker secretとして管理するもの:

- `DISCORD_PUBLIC_KEY`
- `GITHUB_ISSUE_TOKEN`

Cloudflare Worker varsとして管理するもの:

- `DISCORD_ALLOWED_GUILD_IDS`
- `DISCORD_ALLOWED_CHANNEL_IDS`
- `DISCORD_ALLOWED_USER_IDS`
- `DISCORD_ALLOWED_ROLE_IDS`
- `DISCORD_ALLOW_UNSCOPED_COMMANDS`

## Consequences

- 次回deployでKV bindingとIssue作成先repoが落ちにくくなる。
- secret値は引き続きGit、Actionsログ、Discord通知、Markdownへ出さない。
- guild/channel allowlistは環境ごとに違う可能性があるため、現時点では値をGitへ固定しない。

## 現状（2026-11-10、DEC-118）

Discord interactionsの実処理は撤去済みで、exact POSTは無効化スタブの `503 CALLBACK_MIGRATION_IN_PROGRESS` のみを返す。binding・env宣言と `/health/config` の設定有無の診断は維持する。診断値はcallbackが利用可能であることを示さない。実KVデータは未確認で、設定撤去はスライス3のstaging実証時に判断する。

## Follow-up（C1再実装時）

Cloudflare Dashboardまたは安全なsync workflowで、`DISCORD_PUBLIC_KEY`、`GITHUB_ISSUE_TOKEN`、`DISCORD_ALLOWED_GUILD_IDS`、`DISCORD_ALLOWED_CHANNEL_IDS` をWorker runtimeへ入れる。
