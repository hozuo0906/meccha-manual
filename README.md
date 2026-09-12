# めっちゃマニュアル

`めっちゃマニュアル` は、日本人の業務担当者向けの業務手順書作成サービスです。Chrome拡張で普段のWeb操作を記録し、スクリーンショット付きの手順書として編集、保存、共有できる体験を中核にします。

## MVPの利用体験

初回利用者へアカウント登録を先に要求しません。

`LP -> Chrome拡張導入 -> PC/スマホ/タブレット表示を選択 -> guestで操作記録 -> local draft編集 -> 保存/共有/PDFを選択 -> signup -> Personal Workspace自動準備 -> guest claim -> output完了`

アカウント作成は「製品を触る入口」ではなく、「作った手順書を残す瞬間」に置きます。

## 固定済み前提

- リポジトリ名: `meccha-manual`
- 初期ICP: Webシステムの操作手順を繰り返し作成するバックオフィス、カスタマーサポート、業務運用、情シス担当を第一候補とする
- UI/文書/エラー文: 日本語専用
- 開発場所: GitHub Codespacesとクラウド環境を主戦場にする
- デプロイ: Cloudflare Workers（アプリWorker + ブランド用Static Assets Worker）
- 操作記録: Chrome Extension Manifest V3だけをMVP方式とする
- 拡張権限: `activeTab` / `scripting` を中心に最小権限。MVPで`debugger`と常時`<all_urls>`を必須にしない
- 表示モード: PC / スマホ / タブレットをMVP必須とし、スマホ/タブレットはdesktop Chromeのresponsive viewportで記録する
- Guest: アカウント作成前のmanual本文・screenshotはローカルだけに保持しD1/R2へ送らない
- 認証: output時にCloudflare Accessでセルフサーブ認証し、検証済みissuer+subjectからPersonal Workspaceを自動準備する
- 業務DB: Cloudflare D1。認証後のワークスペース所属と権限をD1正本＋Worker認可で守る
- ファイル保存: 認証後のファイル本体はprivate Cloudflare R2
- Browser Run: 現行MVPとProduct Roadmapのcapture方式では使用しない。将来再導入には別ADRが必要
- 課金: Free / Pro / Teamを第一候補とし、Chrome拡張capture時間を課金軸にしない。初期は `BILLING_FEATURE_ENABLED=false`
- `single_export`: 現行MVPではDeferred
- AI API: 初期OFF
- 共有リンク: デフォルトOFF、期限・パスコード・権限範囲・失効を維持
- 正式URL: LPは`www.meccha-iiyatsu.com/app/meccha-manual`、アプリ本体は`meccha-manual.meccha-iiyatsu.com`

## 開発方針

Product最優先は次の縦切りです。

`guest -> extension -> 3表示モード -> local draft -> output時signup -> claim -> output完了`

Cloudflare移行の完了数、保守Issue数、CI数だけをProduct進捗にしません。必要なAccess/D1/R2安全境界を利用しつつ、利用者が価値を完遂できる単位を優先します。

将来必要になり得る機能は `Deferred` とし、価値検証前に詳細設計・UI・課金契約を先回りして固定しすぎません。ただしセキュリティ、プライバシー、tenant分離、入力値非保存、データ損失防止、production/課金の承認境界はMVP簡素化の対象外です。

## Product KPI

Product Eventの正本は [`docs/05-api/product-events.md`](docs/05-api/product-events.md) です。

初回は次を重視します。

- Activation Rate
- TTFV (Time to First Value)
- Capture Completion Rate
- Output Gate Conversion
- Signup Conversion
- Claim Completion Rate
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
- [Chrome拡張only ADR](docs/03-architecture/adrs/ADR-0031-chrome-extension-first-capture.md)
- [Value-first Guest Onboarding ADR](docs/03-architecture/adrs/ADR-0032-value-first-guest-onboarding.md)
- [料金簡素化ADR](docs/03-architecture/adrs/ADR-0033-extension-first-pricing-simplification.md)
- [Guest onboarding / claim API](docs/05-api/guest-onboarding-and-claim-api.md)
- [Product Event契約](docs/05-api/product-events.md)
- [MVP受入条件](docs/07-quality/mvp-product-acceptance.md)
- [開発エージェントルール](AGENTS.md)
- [システム概要](docs/03-architecture/system-overview.md)
- [D1データ・認可境界](docs/04-data/d1-and-storage.md)
- [テスト戦略](docs/07-quality/test-strategy.md)
- [Issue分解](docs/09-delivery/issue-map.md)

## 現在の状態

Supabase Auth/Postgres/RLS前提のPhase 1/2実装は移行前baselineとして存在し、Issue #176でCloudflare Access/D1へ段階移行中です。

Product実装はIssue #227を中心にChrome拡張only MVPへ切り替えます。Browser Run前提の文書・テスト・Issueは履歴／将来安全契約として保持しますが、Browser Runが無効な間はMVPをブロックしません。

本番Custom Domain、production D1、production migration、課金、外部ユーザー公開はまだ有効化していません。
