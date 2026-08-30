# 文書マップ

Status: Accepted

## 目的

このディレクトリは `めっちゃマニュアル` の設計正本です。実装前、レビュー前、PR作成前に該当文書を確認してください。

## 正本の優先順位

1. ADRと `docs/09-delivery/decision-log.md`
2. 要件、データ、API仕様
3. UX仕様
4. Issue分解
5. サブエージェント成果記録

矛盾がある場合は上位文書を正とし、下位文書を更新します。

## ディレクトリ

- `00-foundation`: プロジェクト憲章、用語、文書運用、コーディング規律
- `01-product`: 機能要件、非機能要件、スコープ、ペルソナ
- `02-ux`: UIUX、画面、文言、ブランド
- `03-architecture`: システム構成、Browser Run、認証、手順書モデル、ADR
- `04-data`: ERD、D1テーブル・Worker認可境界、R2、データライフサイクル
- `05-api`: API契約、イベント、Webhook
- `06-security`: セキュリティ、プライバシー、脅威モデル
- `07-quality`: テスト戦略、受入条件、レビュー基準
- `08-operations`: 環境、デリバリー、監視、Runbook
- `09-delivery`: Issue分解、決定ログ、未決事項、リスク、PR運用、セッション引き継ぎ
- `10-records`: サブエージェント成果とクラウドタスク品質監査の時点記録

## ID規則

- 機能要件: `FR-001`
- 非機能要件: `NFR-001`
- 受入条件: `AC-001`
- ADR: `ADR-0001`
- Issue/Epic: `EPIC-00`, `ISSUE-001`
- リスク: `RISK-001`
- 未決事項: `OQ-001`

## 実装開始条件

- Phase対象のFR/NFRが記載されている。
- 関連テーブル/API/画面/テストの正本が存在する。
- P0/P1扱いの未決事項がない。
- `issue-map.md` に実装単位と完了条件がある。

## 長期開発とセッション再開

- [セッション引き継ぎ運用](09-delivery/session-handoff.md)
- [毎日0時・独立セッション用プロンプト](09-delivery/daily-session-prompt.md)
- ライブな現在地: GitHub Issue #70 `META: 開発現在地・セッション引き継ぎ`

新しいセッションは過去チャットだけに依存せず、上記文書、Issue #70、対象Issue/PR、最新commit、CI、review threadを照合してから作業を開始します。

## Cloudflare統一移行

- [ADR-0028](03-architecture/adrs/ADR-0028-cloudflare-access-d1.md)
- [D1データ・認可境界](04-data/d1-and-storage.md)
- [Access / D1 API移行契約](05-api/cloudflare-access-d1-api.md)
- [Cloudflare移行ロードマップ](09-delivery/cloudflare-migration-roadmap.md)
- 移行Epic: GitHub Issue #176

## 公開構成

- [ドメインと公開構成](08-operations/domain-and-publication.md)
