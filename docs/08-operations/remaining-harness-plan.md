# 本番開発前の残ハーネス計画

Status: Accepted

## 目的

本番開発前に必要な外部サービス境界を、実リソース・secret・課金を扱わずレビュー可能にする。各ハーネスの詳細文書を正本とし、この文書は作業順序と承認境界の索引とする。

## タスク一覧

| ハーネス | 目的 | 作るもの | 必要な外部設定 | まだやらないこと | 承認が必要な操作 | 完了条件 |
|---|---|---|---|---|---|---|
| [R2 Storage](r2-storage-harness.md) | privateなファイル本体保存を安全に分離 | bucket/binding契約、認可、短期URL、削除・保持方針 | 環境別R2 bucketとbinding | bucket作成、upload、public化 | bucket作成/削除、binding deploy、公開設定 | 契約整合、静的check、staging negative test計画 |
| [Staging/Production分離](environments-and-delivery.md) | test/liveと本番データを隔離 | GitHub/Cloudflare/Supabase/R2/Stripe対応表、release gate | GitHub Environments、環境別project/account | main連動の本番自動deploy | production secret/DB/resource/deploy変更 | 対応表と手動gateがレビュー済み |
| [Stripe課金](stripe-billing-harness.md) | 初期無料を保ちつつ将来有料化 | flag、Webhook、冪等性、entitlement状態設計 | test/live Stripe設定と環境別secret | 商品、Payment Link、endpoint作成 | 外部設定、secret登録、flag有効化 | flag false、状態遷移とnegative test計画が整合 |
| [DB migration安全](db-migration-safety-harness.md) | 破壊的変更とRLS漏れを防止 | 静的preflight、差分レビュー、適用/rollback証跡 | staging/production Supabaseと承認者 | 実DBへの適用 | staging/production migration、強権credential登録 | 静的check合格、staging検証後にproduction gate |
| [Browser Run / Session](browser-session-harness.md) | 操作記録を期限・破棄・監査付きjobとして扱う | DO状態、Live View、SSRF、保存/破棄契約 | Browser binding、DO、環境別R2/Supabase | 重い実装、本番接続、実サイト操作 | binding作成、外部接続、production deploy | 危険URL/入力非保存/終了処理のテスト条件が明確 |

## 共通順序

1. ADR・要件・契約の矛盾を確認し、未決をopen questionsへ分離する。
2. secret不要の静的checkを通す。
3. 外部設定はstagingから1操作ずつ明示承認を得る。
4. negative test、監査ログ、cleanupを確認する。
5. P0/P1が0件であることを確認し、productionはGitHub Environment承認を別途得る。

この計画の追加だけでは、production deploy、DB migration、bucket作成、Stripe設定、AI API、共有リンクを有効化しない。
