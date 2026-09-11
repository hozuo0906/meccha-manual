# ADR一覧

Status: Accepted

| ADR | 状態 | 決定 |
|---|---|---|
| ADR-0001 | Superseded | 技術スタックはCloudflare + Supabase + Stripe（ADR-0028で更新） |
| ADR-0002 | Superseded | システム内Browser Runを第一方式にする旧決定（ADR-0031でChrome拡張onlyへ更新） |
| ADR-0003 | Accepted | Durable Objectを操作記録セッション状態管理に使う旧Browser Run系決定。現行MVP captureはADR-0031を優先 |
| ADR-0004 | Superseded | Supabase Auth/Postgres/RLSを採用する（ADR-0028で更新） |
| ADR-0005 | Accepted | 公開版を不変revisionとして扱う |
| ADR-0006 | Accepted | Storage bucketはprivateを基本にする |
| ADR-0007 | Accepted | Stripe webhookを課金状態の正本にする |
| ADR-0008 | Accepted | 共有リンクはデフォルトOFF、期限・パスコード・権限範囲を持つ |
| ADR-0009 | Accepted | AI APIは初期OFFにする |
| ADR-0010 | Superseded | Supabase token前提のWorker cookie auth harness（安全原則はADR-0028へ継承） |
| ADR-0011 | Accepted | ファイル本体はCloudflare R2。認証・metadataはADR-0028でAccess/D1へ更新 |
| ADR-0012 | Accepted | Discordからの指示はGitHub Issueへ変換する |
| ADR-0013 | Accepted | Cloudflare設定監査を導入する |
| ADR-0014 | Accepted | Discord runtime bindingの正本を固定する |
| ADR-0015 | Accepted | Issue label状態機械を採用する |
| ADR-0016 | Accepted | IssueからPRへの自動化境界を固定する |
| ADR-0017 | Accepted | サブエージェント品質loopを採用する |
| ADR-0018 | Accepted | R2 bucketとbinding契約。認証・metadataはADR-0028でAccess/D1へ更新 |
| ADR-0019 | Superseded | Supabase/RLS前提のPhase 1着手前gate。Issue #176 M1〜M3へ更新 |
| ADR-0020 | Accepted | Codexクラウド作業環境 |
| ADR-0021 | Accepted | Issueイベント駆動Codex自動実装 |
| ADR-0022 | Accepted | 課金機能を初期OFFにしStripe課金境界を固定する |
| ADR-0023 | Partially Superseded | Stripe Checkout/Link/Webhook安全契約は維持。Browser Run時間をplan軸にする部分とsingle_exportの初期offer部分はADR-0033で更新 |
| ADR-0024 | Accepted | ブランドサイトと認証付きアプリを分離。認証固有手順はADR-0028でAccess/D1へ更新 |
| ADR-0025 | Accepted | 同意ベース参加コード。RPC/RLS実装はADR-0028でWorker/D1へ更新 |
| ADR-0026 | Accepted | Business OS cloud runnerを既存Issue runnerと並設する |
| ADR-0027 | Accepted | prelaunch境界。Supabase接続境界はADR-0028でAccess/D1/R2へ更新 |
| ADR-0028 | Accepted | Cloudflare Access / Workers / D1へ認証・業務データを統一する |
| ADR-0030 | Accepted | PLG型MVP、価値検証優先、Progressive Disclosure、Product KPIをProduct Delivery正本にする |
| ADR-0031 | Accepted | Chrome拡張だけをMVP capture方式にし、PC/スマホ/タブレットresponsive captureとguest local draftを提供する |
| ADR-0032 | Accepted | アカウント登録をoutput境界へ遅延し、self-service bootstrapとguest draft claimを採用する |
| ADR-0033 | Accepted | Free/Pro/Teamへ商品設計を簡素化し、Browser Run時間を料金軸から外す |
