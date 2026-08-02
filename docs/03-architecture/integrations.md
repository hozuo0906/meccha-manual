# 外部連携

Status: Accepted

## Supabase

役割:

- Auth: ユーザー認証
- Postgres: 業務データ、ファイルメタデータ、監査ログの正本
- RLS: workspace単位のテナント分離

初期方針:

- Supabase Storageは第一保存先にしない。
- ファイル本体はCloudflare R2へ置く。
- SupabaseにはR2 object keyと権限判定に必要なメタデータを保存する。

未登録にするsecret:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_JWT_SECRET`

## Cloudflare

役割:

- Workers: API、Webhook、共有閲覧、署名URL発行
- Durable Objects: 操作記録セッション状態
- Browser Run: システム内ブラウザ
- R2: スクリーンショット、手順書画像、出力ファイル、avatar

GitHub Secrets登録済み:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Cloudflare API Tokenの権限:

- `Account / Account Settings / Read`
- `Account / Workers Builds Configuration / Edit`
- `Account / Workers Scripts / Edit`

R2 bucketはまだ作成しない。
staging/production分離後にbucket名とbinding名を確定する。

## Discord

役割:

- GitHub Actionsから開発報告を通知する。

登録済みGitHub Secret:

- `DISCORD_WEBHOOK_URL`

運用:

- Webhook URLをチャット、Markdown、ログへ貼らない。
- 通知は要約だけにする。
- Discordからの指示受付はWebhookではできないため、将来BotまたはGitHub Issue bridgeで実装する。

サイドタスク:

- task id: `019fb8ec-ee4f-7370-ab5f-0b61fb09f931`
- branch: `feature/discord-notify-test`
- mainへ直接pushしない。
- このメインセッションのdocs/ADR方針を正本にする。

## Stripe

役割:

- Payment Links: 有料プラン申込
- Webhook: 課金状態とentitlementの正本

将来想定:

- Product: `めっちゃマニュアル Pro`
- Price: `3,300 JPY / monthly / tax included`
- Payment Link

今は後回しにする。
アプリ側の `/v1/webhooks/stripe` が未実装のため、Stripe webhook endpointはまだ作らない。

## AI

- 初期状態では外部AI APIを呼ばない。
- 将来のAI adapter境界だけ用意する。
- 管理者が明示的にONにした場合のみ利用可能にする。
- 利用上限、利用ログ、概算コスト、監査ログを持つ。
