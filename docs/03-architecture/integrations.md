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

Cloudflareのaccount ID、API token、実際の権限構成、登録状況はリポジトリ文書へ記録しない。deploy主体ごとに必要最小権限を設定し、外部設定の監査で確認する。

staging 4 bucketは作成済みとのユーザー申告があるが、bindingと接続確認は未実施。production bucketはまだ作成しない。
bucket名とbinding名はADR-0018で確定済みとし、staging/productionの実bucket作成とbinding追加は承認後に行う。

## Discord

役割:

- GitHub Actionsから開発報告を通知する。

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

初期状態:

- `BILLING_FEATURE_ENABLED=false`
- Stripe関連Secret、Price ID、Payment Link IDは未登録
- Stripe外部API呼び出しなし

課金のアプリ境界だけを先に固定し、外部設定は後回しにする。
アプリ側の `/v1/webhooks/stripe` が未実装のため、Stripe webhook endpointはまだ作らない。

## AI

- 初期状態では外部AI APIを呼ばない。
- 将来のAI adapter境界だけ用意する。
- 管理者が明示的にONにした場合のみ利用可能にする。
- 利用上限、利用ログ、概算コスト、監査ログを持つ。
