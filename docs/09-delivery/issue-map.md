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

Phase 1親Issue: GitHub Issue #32

Phase 1実装Issue:

- GitHub Issue #33 / P1-01 認証状態: SCR-LOGIN、HttpOnly Cookie、ログイン、ログアウト、期限切れ、再ログイン、401と接続障害の分離。対象ACはAC-001、AC-003、AC-004、AC-005。
- GitHub Issue #34 / P1-02 ワークスペース: SCR-WORKSPACE、一覧、選択、`create_workspace`、空/読込/作成/失敗状態。対象ACはAC-002、AC-006、AC-012。
- GitHub Issue #35 / P1-03〜P1-04 メンバー照会・管理: SCR-MEMBERS、profiles、workspace_members、越境拒否、4ロール、last-owner保護。owner移管は専用フローの設計決定まで拒否する。対象ACはAC-007、AC-008、AC-009、AC-014。
- GitHub Issue #38 / P1-05 RLS回帰: 匿名RPC拒否、workspace/member越境拒否、識別子と作成監査項目の不変条件、4ロールの動的negative test。外部migrationとテストデータ作成の承認待ち。

リポジトリには認証、ワークスペース一覧・作成、メンバー一覧、本人発行の短命参加コードによる追加、role変更・停止、Phase 1 migration、RLS negative testのハーネスがある。owner移管、実環境でのmigration適用と動的RLS検証は完了済みとして扱わない。招待メールは実装せず、参加コードの平文はStorage、URL、ログへ保存しない。

## EPIC-03: アプリシェル

Phase 1実装Issue:

- GitHub Issue #36 / P1-06〜P1-09: 共通シェル、権限別UI、共通状態、日本語文言、アクセシビリティ。対象ACはAC-012、AC-013、AC-014。
- GitHub Issue #37 / P1-10: Worker実行テスト、型検査、bundle dry-run、SCR-LOGINからSCR-WORKSPACE、SCR-MEMBERS、ログアウトまでの4ロールE2E。Phase 1 readiness workflowでChromiumを導入して実行し、異origin拒否とbody上限はproduction codeを壊す変異でも契約検査が失敗することを保証する。

Issue #36ではリポジトリ内のUI実装と、重要要素を壊す変異で失敗するアクセシビリティ契約検査までを扱う。実ブラウザでの200%ズーム、フォーカス順、スクリーンリーダー相当の横断検証はIssue #37で行い、静的契約だけをE2E完了の根拠にしない。

外部設定Issue:

- GitHub Issue #39: GitHub保護、repository visibility、Cloudflare dev/staging境界。外部設定変更と公開範囲の承認待ち。

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
