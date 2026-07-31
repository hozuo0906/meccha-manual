# 外部連携

Status: Accepted

## Supabase

- Auth: ユーザー認証。
- Postgres: 永続データの正本。
- Storage: private bucketでスクリーンショット、出力、アバターを保存。
- RLS: 全公開スキーマテーブルで必須。

## Cloudflare

- Pages: 日本語UI。
- Workers: API、Webhook、共有閲覧、署名URL発行。
- Durable Objects: キャプチャセッション状態。
- Browser Run: システム内クラウドブラウザ。

## Stripe

- Payment Links: 有料プランへの導線。
- Webhook: 課金状態の正本。
- `stripe_event_id` の一意制約で冪等化する。
- 画面リダイレクトだけで課金確定しない。

## AI

- 初期は外部AI APIを呼ばない。
- 将来のAI adapter境界だけ作る。
- AI機能は管理者が明示的にONにした場合のみ利用可能にする。
- 利用上限、利用ログ、概算コスト、監査ログを持つ。
