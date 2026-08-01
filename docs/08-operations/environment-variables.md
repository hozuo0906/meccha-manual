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
- 新しい環境変数を追加したら、この台帳と該当ADR、CI設定を同じPRで更新する。
