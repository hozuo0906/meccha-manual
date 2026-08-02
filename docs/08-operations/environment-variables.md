# 環境変数台帳

Status: Accepted

## 方針

環境変数は用途と公開範囲を分類し、secretはCloudflare SecretまたはGitHub Secretsで管理する。
secretをクライアント、Markdown、ログ、エラー詳細、ソースマップへ出さない。

## GitHub Secrets登録状況

登録済み:

- `DISCORD_WEBHOOK_URL`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

まだ登録しない:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_JWT_SECRET`

## 台帳

| 名前 | 分類 | 用途 | 必須 | クライアント公開 |
|---|---|---|---|---|
| `APP_ENV` | server/public | `local`、`preview`、`staging`、`production` の識別 | yes | public版のみ可 |
| `APP_BASE_URL` | server/public | 共有URL、callback URL、通知URL生成 | yes | public版のみ可 |
| `SUPABASE_URL` | server/public | Supabase接続先 | yes | public版のみ可 |
| `SUPABASE_ANON_KEY` | public | Supabase Auth/RESTの公開anon key | yes | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | 管理系ジョブ、将来のサーバー専用処理 | phase3以降 | no |
| `SUPABASE_JWKS_URL` | server | JWT検証 | phase1以降 | no |
| `SUPABASE_DB_PASSWORD` | secret | migration自動化、DB管理 | 未定 | no |
| `SUPABASE_JWT_SECRET` | secret | JWT関連の高度な検証、管理作業 | 未定 | no |
| `CLOUDFLARE_ACCOUNT_ID` | secret/server | Cloudflare API、Browser Run、deploy | harness | no |
| `CLOUDFLARE_API_TOKEN` | secret | Cloudflare deploy、Workers設定 | harness | no |
| `BROWSER_RUN_BINDING` | binding | Browser Run binding | phase3 | no |
| `R2_CAPTURE_ASSETS_BUCKET` | binding | 操作記録スクリーンショット | phase3 | no |
| `R2_MANUAL_ASSETS_BUCKET` | binding | 手順書画像、注釈済み画像 | phase2/3 | no |
| `R2_EXPORTS_BUCKET` | binding | PDF、HTML、Markdown出力 | phase4 | no |
| `R2_AVATARS_BUCKET` | binding | avatar画像 | phase1/2任意 | no |
| `STRIPE_SECRET_KEY` | secret | Stripe API | phase8 | no |
| `STRIPE_WEBHOOK_SECRET` | secret | Stripe webhook署名検証 | phase8 | no |
| `AI_PROVIDER_API_KEY` | secret | 将来AI API | phase9 | no |
| `DISCORD_WEBHOOK_URL` | secret | 通常CIからDiscordへ開発報告を通知 | harness | no |
| `MECCHA_DISCORD_WEBHOOK_URL` | secret | 通常CI用Discord通知URLの代替名 | harness | no |
| `DISCORD_DEVELOPMENT_WEBHOOK_URL` | secret | 開発用Discord通知URL | harness | no |
| `DISCORD_STAGING_WEBHOOK_URL` | secret | staging gate用Discord通知URL | harness | no |
| `DISCORD_PRODUCTION_WEBHOOK_URL` | secret | production gate用Discord通知URL | harness | no |
| `DISCORD_NOTIFY_TITLE` | server | Discord通知タイトル。日本語推奨 | harness | no |
| `DISCORD_NOTIFY_DESCRIPTION` | server | Discord通知の説明文またはURL | harness | no |
| `DISCORD_NOTIFY_URL` | server | Discord通知embedのリンク先 | harness | no |
| `DISCORD_NOTIFY_PR_URL` | server | PR通知buttonの対象Pull Request URL | harness | no |
| `DISCORD_NOTIFY_COMPONENTS` | server | `pr` の場合、PR通知buttonを付ける | harness | no |
| `DISCORD_NOTIFY_IMPRESSION` | server | Discord通知へ載せるCodex所感 | harness | no |
| `DISCORD_NOTIFY_CHANNEL_ID` | server | Bot送信用の既定Discord channel ID。設定時はWebhookではなくBot送信を優先 | harness | no |
| `DISCORD_DEVELOPMENT_CHANNEL_ID` | server | development通知のBot送信先Discord channel ID | harness | no |
| `DISCORD_STAGING_CHANNEL_ID` | server | staging通知のBot送信先Discord channel ID | harness | no |
| `DISCORD_PRODUCTION_CHANNEL_ID` | server | production通知のBot送信先Discord channel ID | harness | no |
| `DISCORD_PUBLIC_KEY` | secret/server | Discord Interaction署名検証 | discord-bridge | no |
| `DISCORD_ALLOWED_GUILD_IDS` | server | 許可Discord server IDのカンマ区切り | discord-bridge | no |
| `DISCORD_ALLOWED_CHANNEL_IDS` | server | 許可Discord channel IDのカンマ区切り | discord-bridge | no |
| `DISCORD_ALLOWED_USER_IDS` | server | 許可Discord user IDのカンマ区切り | discord-bridge | no |
| `DISCORD_ALLOWED_ROLE_IDS` | server | 許可Discord role IDのカンマ区切り。user allowlistと併用時はuserまたはrole一致で許可 | discord-bridge | no |
| `DISCORD_ALLOW_UNSCOPED_COMMANDS` | server | `true` の場合のみguild/channel allowlist未設定を許可。既定は禁止 | discord-bridge | no |
| `DISCORD_INTERACTION_STORE` | binding | Discord interaction IDの短期replay防止KV binding | discord-bridge | no |
| `DISCORD_APPLICATION_ID` | secret/server | Slash Command登録 | discord-bridge | no |
| `DISCORD_BOT_TOKEN` | secret | Slash Command登録用Bot token | discord-bridge | no |
| `DISCORD_GUILD_ID` | server | 開発用guild command登録 | discord-bridge | no |
| `DISCORD_REGISTER_GLOBAL` | server | `true` の場合のみglobal command登録を許可。既定は禁止 | discord-bridge | no |
| `GITHUB_ISSUE_TOKEN` | secret | Discord指示からGitHub Issueを作成 | discord-bridge | no |
| `GITHUB_ISSUE_REPOSITORY` | server | Issue作成先 `owner/repo` | discord-bridge | no |

## R2 binding方針

`wrangler.jsonc` へR2 bindingを追加するのは、R2 bucket作成後にする。
存在しないbucketをbindingへ書くとdeploy失敗の原因になるため、現時点では文書だけに留める。

想定binding名:

- `CAPTURE_ASSETS`
- `MANUAL_ASSETS`
- `EXPORTS`
- `AVATARS`

## ルール

- productionとstagingでsecretを共有しない。
- `SUPABASE_ANON_KEY` は公開前提だが、service role keyと混同しない。
- GitHub Actionsで使うsecretはworkflow logへ出さない。
- Discord通知にはsecret値、実ユーザー情報、長いログ全文を含めない。
- DiscordからのIssue作成tokenはIssues writeだけに絞る。
- Discord Interaction endpointでは `DISCORD_PUBLIC_KEY` による署名検証を必須にする。
- Worker runtimeで使うDiscord/GitHub bridge secretはCloudflare Secretにも登録する。
- Discord command受付は `DISCORD_ALLOWED_GUILD_IDS` と `DISCORD_ALLOWED_CHANNEL_IDS` を既定必須にする。未設定運用は `DISCORD_ALLOW_UNSCOPED_COMMANDS=true` を明示した検証環境だけに限定する。
- `DISCORD_INTERACTION_STORE` KV bindingを設定し、同じDiscord interaction IDから重複Issueを作らない。
- `GITHUB_ISSUE_TOKEN` はGitHub Issues writeに限定し、repo管理、Actions管理、Secrets管理の権限を付けない。PR buttonのマージ依頼もPRのIssue comment/label記録までに限定する。
- `/meccha task` の危険操作検知時は `approval-required` と `blocked-from-discord` ラベルを付け、Discord指示だけで本番反映、DB migration、課金、AI API、共有リンク公開を進めない。
- 新しい環境変数を追加したら、この台帳と該当ADR、CI設定を同じPRで更新する。
