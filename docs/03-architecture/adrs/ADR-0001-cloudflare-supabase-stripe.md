# ADR-0001: Cloudflare + Supabase + Stripeを採用する

Status: Accepted

## 文脈

ユーザーはローカル中心ではなく、GitHub/Codespaces/クラウド上で開発することを希望している。日本人オフィスワーカー向けSaaSとして、認証、DB、Storage、共有、課金拡張が必要。

## 決定

- Cloudflare Pages/Workers/Durable Objects/Browser Runをアプリ基盤にする。
- Supabase Auth/Postgres/RLSを認証、業務データ、認可メタデータの正本に使う。
- ファイル本体はADR-0011に従いCloudflare R2を第一候補にする。
- Stripe Payment Links/Webhookを将来課金に使う。

## 理由

- CloudflareはPages、Workers、Browser Runを同一基盤で扱える。
- SupabaseはAuth、Postgres、RLSを一体で扱える。
- R2はBrowser Runと同じCloudflare側でファイル本体を扱え、ファイル転送の責務を分離できる。
- Stripe Payment Linksは初期実装を軽くしつつ有料化へ拡張できる。

## 影響

- RLS設計が必須。
- Cloudflare Browser Runの制約を仕様に明記する。
- Stripe webhookの冪等性と順序非依存が必須。
