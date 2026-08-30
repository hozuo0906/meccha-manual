# ADR-0001: Cloudflare + Supabase + Stripeを採用する

Status: Superseded

Superseded by [ADR-0028](ADR-0028-cloudflare-access-d1.md)。Cloudflare基盤、private R2、Stripe方針は継続し、Supabase Auth/Postgres/RLSを正本にする部分だけをCloudflare Access/D1へ置換する。以下は移行前の判断記録として保持する。

## 文脈

ユーザーはローカル中心ではなく、GitHub/Codespaces/クラウド上で開発することを希望している。日本人オフィスワーカー向けSaaSとして、認証、DB、Storage、共有、課金拡張が必要。

## 決定

- Cloudflare Pages/Workers/Durable Objects/Browser Runをアプリ基盤にする。
- Supabase Auth/Postgres/RLSを認証、業務データ、認可メタデータの正本に使う。
- ファイル本体はADR-0011に従いCloudflare R2を第一候補にする。
- Stripe Checkout Sessions/Link/Webhookを将来課金に使う。

## 理由

- CloudflareはPages、Workers、Browser Runを同一基盤で扱える。
- SupabaseはAuth、Postgres、RLSを一体で扱える。
- R2はBrowser Runと同じCloudflare側でファイル本体を扱え、ファイル転送の責務を分離できる。
- Stripe Checkout Sessionsは購入試行ごとに期限と識別子を固定しつつ有料化へ拡張できる。

## 影響

- RLS設計が必須。
- Cloudflare Browser Runの制約を仕様に明記する。
- Stripe webhookの冪等性と順序非依存が必須。
