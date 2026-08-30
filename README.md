# めっちゃマニュアル

`めっちゃマニュアル` は、日本人オフィスワーカー向けの業務手順書作成サービスです。Tangoのように操作を記録し、スクリーンショット付きの手順書として編集、共有、分析できる体験を目指します。

## 固定済み前提

- リポジトリ名: `meccha-manual`
- 対象ユーザー: 日本人オフィスワーカー
- UI/文書/エラー文: 日本語専用
- 開発場所: GitHub Codespacesとクラウド環境を主戦場にする
- デプロイ: Cloudflare Workers（アプリWorker + ブランド用Static Assets Worker）
- ブラウザ実行: Cloudflare Browser Run + Live View
- 認証: Cloudflare Access（メールOTP・招待制）
- 業務DB: Cloudflare D1。ワークスペース所属と4ロールはD1を正本にWorkerで認可
- ファイル保存: Cloudflare R2を第一候補（Supabase Storageは第一保存先にしない）
- 課金拡張: Stripe Checkout Sessions / Link / Webhook
- AI API: 初期OFF。将来ONにできる設計のみ用意する
- Chrome拡張: 第一方式にしない
- 共有リンク: デフォルトOFF
- ロゴ: ひらがなの「め」+ 折り返した紙 + 手順番号の方向で暫定制作
- 正式URL: LPは`www.meccha-iiyatsu.com/app/meccha-manual`、アプリ本体は`meccha-manual.meccha-iiyatsu.com`

## 開発方針

設計は全部入りで持ちます。ただし実装は核となる機能から段階的に進め、各段階で `実装 -> テスト -> リファクタリングレビュー -> 辛口レビュー -> 修正` のloopを通過したものだけ次へ進めます。

最初に作るのはコードではなく、Phase 0の文書正本です。実装担当が推測で判断しないよう、要件、設計、データ、API、品質ゲート、Issue分解をMarkdownで管理します。

## 文書

- [文書マップ](docs/README.md)
- [プロジェクト憲章](docs/00-foundation/project-charter.md)
- [開発エージェントルール](AGENTS.md)
- [機能要件](docs/01-product/product-requirements.md)
- [システム概要](docs/03-architecture/system-overview.md)
- [テーブル定義](docs/04-data/table-definitions.md)
- [テスト戦略](docs/07-quality/test-strategy.md)
- [Issue分解](docs/09-delivery/issue-map.md)
- [ドメインと公開構成](docs/08-operations/domain-and-publication.md)

## 現在の状態

Supabase Auth/Postgres/RLS前提のPhase 1/2実装は移行前baselineとして存在します。Issue #176でCloudflare Access/D1へ段階移行中です。本番Custom Domain、production D1、production migration、課金、外部ユーザー公開はまだ有効化していません。
