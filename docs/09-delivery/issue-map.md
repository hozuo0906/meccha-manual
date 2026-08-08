# Issue分解

Status: Accepted

## EPIC-00: 文書正本

目的: 実装前の迷いをなくす。

成果:

- README、AGENTS、要件、設計、データ、API、品質、Issue分解。
- 未決事項の分離。
- ADR初期セット。

完了条件:

- Phase 0の合格条件を満たす。

## EPIC-01: 基盤

- Cloudflare Pages/Workers構成
- Codespaces
- 環境変数台帳
- feature flag台帳
- CI/CD

## EPIC-02: 認証とワークスペース

- Supabase Auth
- profiles
- workspaces
- workspace_members
- invitations
- RLS negative test

## EPIC-03: アプリシェル

- 日本語ナビ
- 権限別UI
- 共通エラー
- 空/読込/保存状態

## EPIC-04: Browser Run

- Browser Run起動
- Live View URL
- Durable Object状態機械
- 再接続
- 終了処理
- SSRF対策

## EPIC-05: 操作記録

- 操作イベント収集
- スクリーンショット
- Storage
- マスキング
- 下書き生成

## EPIC-06: 手順書編集

- 手順書一覧
- エディタ
- 手順並べ替え
- 注釈
- 版管理
- 公開/復元

## EPIC-07: 検索と整理

- フォルダー
- タグ
- 検索
- お気に入り
- アーカイブ

## EPIC-08: 共有と出力

- 共有リンク
- 閲覧画面
- 期限/パスコード
- iframe埋め込みビュー
- PDF/Markdown/HTML出力

## EPIC-09: 運用機能

- コメント
- 通知
- メンバー管理
- 監査ログ

## EPIC-10: 課金

- 料金画面: 都度払い550円、パーソナル3,300円/月、チーム9,900円/月
- Stripe Checkout SessionsとStripe Link
- checkout intentと `client_reference_id`
- Webhook署名検証、重複・遅延・順不同
- 都度払いのmanual scope entitlementと30日再出力
- パーソナル/チームのworkspace entitlement
- 作成者席、viewer、Browser Run、R2、同時記録のusage counter
- 80%警告、100%停止、自動従量課金なし
- 未払い、解約、返金、chargeback
- 請求・利用量画面

## EPIC-11: 分析

- 閲覧数
- 完了率
- 離脱ステップ
- チャネル
- 集計検証

## EPIC-12: セキュリティ/運用

- 秘密管理
- 削除/退会
- バックアップ
- リストア演習
- Runbook

## EPIC-13: リリース品質

- E2E
- RLS negative test
- 負荷
- 障害注入
- 可観測性
- ロールバック

## EPIC-14: AI拡張口

- AI feature flag
- AI利用OFF既定
- 管理者ON/OFF
- 利用ログ
- コスト上限
