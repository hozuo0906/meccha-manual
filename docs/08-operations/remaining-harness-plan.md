# 残ハーネス整備計画

Status: Superseded

実行禁止: ADR-0028、DEC-064、Issue #176により、本書は移行前Supabase/Postgres/RLS baselineである。新規Supabase project/user/secret、migration、remote write、live workflow、staging合格証跡の根拠にしない。後継は`cloudflare-migration-roadmap.md` のM0〜M7。

## 目的

本番開発前に必要な外部連携の境界、環境分離、安全ゲートを文書と静的検査で固定します。この計画だけでは外部リソース、Secret、課金、本番データを変更しません。

## R2 Storageハーネス

- 目的: ファイル本体の保存責務、環境別bucket、binding、認可、削除を固定する。
- 作るもの: ADR-0011/0018、R2運用手順、object contract、静的方針検査。
- 必要な外部設定: staging/production別private bucket、Worker環境別R2 binding、保持ルール。
- まだやらないこと: bucket作成、binding追加、実ファイルupload、公開ドメイン設定。
- 承認が必要な操作: 各bucket作成、production binding追加、保持・自動削除の有効化。
- 完了条件: 指定bucket名、binding名、短命URL、PII、削除順序が正本間で一致し、`npm run r2-storage:check` が成功する。

## Staging/Production分離ハーネス

- 目的: 検証用と本番のデータ、Secret、外部課金、デプロイ経路を混在させない。
- 作るもの: GitHub Environment、Worker、Supabase、R2、Stripeの対応表とproduction gate。
- 必要な外部設定: GitHub Environment、required reviewers、環境別Worker/Supabase、環境別Secret。
- まだやらないこと: production自動デプロイ、production接続、live mode有効化。
- 承認が必要な操作: production環境作成・Secret登録・migration・deploy・ドメイン切替。
- 完了条件: `main` マージ後の扱い、環境対応、承認者、rollback条件が推測不要な粒度で文書化される。

## Stripe課金ハーネス

- 目的: `BILLING_FEATURE_ENABLED=false` を維持しつつ、都度払い、パーソナル、チームを誤課金・誤権限なしで将来有効化できる境界を作る。
- 作るもの: ADR-0007/0022/0023、料金プラン、課金運用手順、環境変数台帳、checkout intent、Webhook/entitlement/利用上限テスト方針。
- 必要な外部設定: test/live別の3 Product、3 Price、Stripe Link設定、Webhook endpoint、Secret。
- まだやらないこと: Stripe商品・Price・Webhook endpoint作成、Link有効化、Secret登録、課金機能ON。
- 承認が必要な操作: test mode外部設定、Link有効化、課金機能ON、live mode設定、価格・税設定変更。
- 完了条件: 署名検証、冪等性、順不同、manual scope、席数、Browser Run/Storage上限、未払い、解約、返金の扱いと未決点が分離される。

## DB migration安全ハーネス

- 目的: migrationファイルの安全性確認と実DB適用を分離し、本番誤適用を防ぐ。
- 作るもの: 適用前チェックリスト、静的安全検査、RLS negative test方針、production承認ゲート。
- 必要な外部設定: staging/production別DB、適用履歴確認手段、backup/rollback手順、GitHub Environment承認。
- まだやらないこと: Supabase接続、DB認証情報取得、migration適用、データ修復。
- 承認が必要な操作: staging/productionへの全migration適用、production backup/restore、破壊的変更。
- 完了条件: 既存 `migrations:check` と役割が重複せず、`migration:safety:check` が秘密値なしで成功する。

## Browser Run / Browser Sessionハーネス

- 目的: Browser Run起動からLive View、操作記録、終了までを安全なセッション境界で管理する。
- 作るもの: Browser Run/Session運用文書、Durable Object責務、SSRF・入力値非保存・監査・破棄の設計。
- 必要な外部設定: Browser binding、Durable Object binding/migration、環境別上限、監視。
- まだやらないこと: Browser Run実起動、本番サイト接続、Session Recording、重いPlaywright実装。
- 承認が必要な操作: 有料リソース有効化、production binding/deploy、実サイトを使う検証、保持期間有効化。
- 完了条件: 状態遷移、URL検証、Live View短命化、スクリーンショット保存、終了・失敗時破棄が一貫する。
