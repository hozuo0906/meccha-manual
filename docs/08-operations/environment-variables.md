# 環境変数台帳

Status: Accepted

## 方針

環境変数は用途と公開範囲を分類し、secretはCloudflare SecretまたはGitHub Secretsで管理する。
secretをクライアント、Markdown、ログ、エラー詳細、ソースマップへ出さない。

## 台帳

| 名前 | 分類 | 用途 | 必須 | クライアント公開 |
|---|---|---|---|---|
| `APP_ENV` | server/public | `local`、`preview`、`staging`、`production` の識別 | yes | public版のみ可 |
| `APP_BASE_URL` | server/public | 共有URL、callback URL、通知URL生成 | yes | public版のみ可 |
| `SUPABASE_URL` | server/public | Supabase接続先 | yes | public版のみ可 |
| `SUPABASE_ANON_KEY` | public | Supabase Auth/RESTの公開anon key | yes | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | 管理系ジョブ、将来のサーバー専用処理 | phase3以降 | no |
| `SUPABASE_JWKS_URL` | server | JWT検証 | phase1以降 | no |
| `CLOUDFLARE_ACCOUNT_ID` | server | Browser Run/API | phase3 | no |
| `BROWSER_RUN_BINDING` | binding | Browser Run binding | phase3 | no |
| `STRIPE_SECRET_KEY` | secret | Stripe API | phase8 | no |
| `STRIPE_WEBHOOK_SECRET` | secret | Stripe webhook署名検証 | phase8 | no |
| `AI_PROVIDER_API_KEY` | secret | 将来AI API | phase9 | no |
| `DISCORD_WEBHOOK_URL` | secret | 通常CIからDiscordへ開発報告を通知 | harness | no |
| `MECCHA_DISCORD_WEBHOOK_URL` | secret | 通常CI用Discord通知URLの代替名 | harness | no |
| `DISCORD_DEVELOPMENT_WEBHOOK_URL` | secret | 開発用Discord通知URL | harness | no |
| `DISCORD_STAGING_WEBHOOK_URL` | secret | staging gate用Discord通知URL | harness | no |
| `DISCORD_PRODUCTION_WEBHOOK_URL` | secret | production gate用Discord通知URL | harness | no |

## ルール

- productionとstagingでsecretを共有しない。
- `SUPABASE_ANON_KEY` は公開前提だが、service role keyと混同しない。
- GitHub Actionsで使うsecretはworkflow logへ出さない。
- Discord通知にはsecret値、実ユーザー情報、長いログ全文を含めない。
- 新しい環境変数を追加したら、この台帳と該当ADR、CI設定を同じPRで更新する。
