# ADR一覧

Status: Accepted

| ADR | 状態 | 決定 |
|---|---|---|
| ADR-0001 | Superseded | 技術スタックはCloudflare + Supabase + Stripe（ADR-0028で更新） |
| ADR-0002 | Accepted | Chrome拡張ではなくシステム内ブラウザを第一方式にする |
| ADR-0003 | Accepted | Durable Objectを操作記録セッション状態管理に使う |
| ADR-0004 | Superseded | Supabase Auth/Postgres/RLSを採用する（ADR-0028で更新） |
| ADR-0005 | Accepted | 公開版を不変revisionとして扱う |
| ADR-0006 | Accepted | Storage bucketはprivateを基本にする |
| ADR-0007 | Accepted | Stripe webhookを課金状態の正本にする |
| ADR-0008 | Accepted | 共有リンクはデフォルトOFFにする |
| ADR-0009 | Accepted | AI APIは初期OFFにする |
| ADR-0010 | Superseded | Supabase token前提のWorker cookie auth harness（安全原則はADR-0028へ継承） |
| ADR-0011 | Accepted | ファイル本体はCloudflare R2を第一候補にする |
| ADR-0012 | Accepted | Discordからの指示はGitHub Issueへ変換する |
| ADR-0013 | Accepted | Cloudflare設定監査を導入する |
| ADR-0014 | Accepted | Discord runtime bindingの正本を固定する |
| ADR-0015 | Accepted | Issue label状態機械を採用する |
| ADR-0016 | Accepted | IssueからPRへの自動化境界を固定する |
| ADR-0017 | Accepted | サブエージェント品質loopを採用する |
| ADR-0018 | Accepted | R2 bucketとbinding契約 |
| ADR-0019 | Accepted | Phase 1本番開発の着手前ゲート |
| ADR-0020 | Accepted | Codexクラウド作業環境 |
| ADR-0021 | Accepted | Issueイベント駆動Codex自動実装 |
| ADR-0022 | Accepted | 課金機能を初期OFFにしStripe課金境界を固定する |
| ADR-0023 | Accepted | 都度払い・パーソナル・チーム課金とStripe Linkを採用する |
| ADR-0024 | Accepted | ブランドサイトと認証付きアプリをサブドメインで分離する |
| ADR-0025 | Accepted | 同意ベースの短命・単回使用参加コードでメンバーを追加する |
| ADR-0026 | Accepted | Business OS cloud runnerを既存Issue runnerと並設する |
| ADR-0027 | Accepted | prelaunch期間の公開リポジトリとstaging接続境界を固定する |
| ADR-0028 | Accepted | Cloudflare Access / Workers / D1へ認証・業務データを統一する |
