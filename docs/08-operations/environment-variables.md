# 環境変数台帳

Status: Proposed

実装開始時にこの台帳を正本として更新します。secretはCloudflare Secretで管理し、クライアントへ出しません。

| 名前 | 分類 | 用途 | 必須 | クライアント公開 |
|---|---|---|---|---|
| `SUPABASE_URL` | server/public | Supabase接続先 | yes | public版のみ可 |
| `SUPABASE_ANON_KEY` | public | クライアントSupabase初期化 | yes | yes |
| `SUPABASE_SERVICE_ROLE_KEY` | secret | Workerの管理操作 | yes | no |
| `SUPABASE_JWKS_URL` | server | JWT検証 | yes | no |
| `STRIPE_SECRET_KEY` | secret | Stripe API | phase8 | no |
| `STRIPE_WEBHOOK_SECRET` | secret | Webhook署名検証 | phase8 | no |
| `CLOUDFLARE_ACCOUNT_ID` | server | Browser Run/API | phase3 | no |
| `BROWSER_RUN_BINDING` | binding | Browser Run binding | phase3 | no |
| `APP_BASE_URL` | server/public | 共有URL生成 | yes | public版のみ可 |
| `AI_PROVIDER_API_KEY` | secret | 将来AI API | phase9 | no |

## ルール

- 環境変数は型付き設定モジュールで起動時に検証する。
- 暗黙のデフォルトは禁止。
- secretはログ、Markdown、エラー詳細、ソースマップへ出さない。
