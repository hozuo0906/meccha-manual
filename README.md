# めっちゃマニュアル

`めっちゃマニュアル` は、日本人の業務担当者向けの業務手順書作成サービスです。操作を記録し、スクリーンショット付きの手順書として編集、共有できる体験を中核にします。

## 固定済み前提

- リポジトリ名: `meccha-manual`
- 初期ICP: Webシステムの操作手順を繰り返し作成するバックオフィス、カスタマーサポート、業務運用、情シス担当を第一候補とする
- UI/文書/エラー文: 日本語専用
- 開発場所: GitHub Codespacesとクラウド環境を主戦場にする
- デプロイ: Cloudflare Workers（アプリWorker + ブランド用Static Assets Worker）
- ブラウザ実行: 現時点ではCloudflare Browser Run + Live Viewを第一方式とし、初期ICPの代表サイト群でProduct Discoveryを行う
- 認証: Cloudflare Access（メールOTP）
- 業務DB: Cloudflare D1。ワークスペース所属と権限はD1を正本にWorkerで認可
- ファイル保存: Cloudflare R2を第一候補（Supabase Storageは第一保存先にしない）
- 課金拡張: Stripe Checkout Sessions / Link / Webhook。初期は `BILLING_FEATURE_ENABLED=false`
- AI API: 初期OFF
- 共有リンク: デフォルトOFF
- ロゴ: ひらがなの「め」+ 折り返した紙 + 手順番号の方向で暫定制作
- 正式URL: LPは`www.meccha-iiyatsu.com/app/meccha-manual`、アプリ本体は`meccha-manual.meccha-iiyatsu.com`

## 開発方針

初回商用MVPは、`認証 -> 操作記録 -> 下書き生成 -> 編集 -> URL共有` の利用者価値の縦切りを最優先にします。

将来必要になり得る機能を一覧として保持することはできますが、価値検証前に詳細設計・UI・課金契約を先回りして固定しすぎません。未検証の将来要件は `Deferred` とし、Activation・継続利用・顧客要求が確認された段階で詳細化します。

ただし、セキュリティ、プライバシー、tenant分離、入力値非保存、SSRF、データ損失防止、production/課金の承認境界はMVP簡素化の対象外です。

設計判断の正本は [ADR-0030](docs/03-architecture/adrs/ADR-0030-plg-mvp-product-delivery.md) を参照します。DEC-009の「設計は全部入り」は本ADRでSupersededです。

## Product KPI

初回は次を計測します。

- Activation Rate
- TTFV (Time to First Value)
- Capture Completion Rate
- Share Rate
- Second Manual Rate
- D7 Creator Retention
- Invite Rate
- Free to Paid Conversion

初期North Star候補は `7日以内に2本目の手順書を作成したCreator数` です。

## 文書

- [文書マップ](docs/README.md)
- [プロジェクト憲章](docs/00-foundation/project-charter.md)
- [スコープ](docs/01-product/scope.md)
- [機能要件](docs/01-product/product-requirements.md)
- [UX原則](docs/02-ux/experience-principles.md)
- [オンボーディング](docs/02-ux/onboarding.md)
- [料金プランと利用上限](docs/01-product/pricing-and-plans.md)
- [PLG/MVP ADR](docs/03-architecture/adrs/ADR-0030-plg-mvp-product-delivery.md)
- [開発エージェントルール](AGENTS.md)
- [システム概要](docs/03-architecture/system-overview.md)
- [D1データ・認可境界](docs/04-data/d1-and-storage.md)
- [テスト戦略](docs/07-quality/test-strategy.md)
- [Issue分解](docs/09-delivery/issue-map.md)
- [ドメインと公開構成](docs/08-operations/domain-and-publication.md)

## 現在の状態

Supabase Auth/Postgres/RLS前提のPhase 1/2実装は移行前baselineとして存在します。Issue #176でCloudflare Access/D1へ段階移行中です。

本番Custom Domain、production D1、production migration、課金、外部ユーザー公開はまだ有効化していません。Cloudflare移行の技術進捗と、商用価値のProduct Discoveryは別々に合格判定します。
