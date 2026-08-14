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
- GitHub Issue #38 / P1-05 RLS回帰: 暫定dev/stagingへのPhase 1 hardening適用、migration履歴同期、DBセッションでのworkspace/member越境拒否、匿名RPC拒否、識別子・作成監査項目の不変条件、last-owner保護まで実検証済み。`npm run test:rls` の実アカウントE2Eはテスト資格情報の安全な実行経路待ち。

リポジトリには認証、ワークスペース一覧・作成、メンバー一覧、本人発行の短命参加コードによる追加、role変更・停止、Phase 1 migration、RLS negative testのハーネスがある。owner移管は専用フロー設計まで拒否する。外部stagingのmigration/RLS本体は検証済みだが、Issue #38の受入条件である実アカウント `npm run test:rls` は完了済みとして扱わない。招待メールは実装せず、参加コードの平文はStorage、URL、ログへ保存しない。

## EPIC-03: アプリシェル

Phase 1実装Issue:

- GitHub Issue #36 / P1-06〜P1-09: 共通シェル、権限別UI、共通状態、日本語文言、アクセシビリティ。対象ACはAC-012、AC-013、AC-014。
- GitHub Issue #37 / P1-10: Worker実行テスト、型検査、bundle dry-run、SCR-LOGINからSCR-WORKSPACE、SCR-MEMBERS、ログアウトまでの4ロールE2E。Phase 1 readiness workflowでChromiumを導入して実行し、異origin拒否とbody上限はproduction codeを壊す変異でも契約検査が失敗することを保証する。

Issue #36ではリポジトリ内のUI実装と、重要要素を壊す変異で失敗するアクセシビリティ契約検査までを扱う。実ブラウザでの200%ズーム、フォーカス順、スクリーンリーダー相当の横断検証はIssue #37で行い、静的契約だけをE2E完了の根拠にしない。

外部設定Issue:

- GitHub Issue #39: repository visibilityはPhase 1 prelaunchでpublic維持と決定し、ADR-0027を正本とする。暫定Workerのstaging環境名、技術URL、billing OFF、staging Supabase project/anon roleはリポジトリ側quality gateで固定する。GitHub branch protection詳細、required checks、up-to-date、conversation resolution、bypass禁止、GitHub Environment required reviewers等の外部管理設定は実設定確認が残る。

## EPIC-04: Browser Run

GitHub Issue #57を費用優先ロードマップの正本とする。

- Browser Run起動
- Live View URL
- Durable Object状態機械
- 再接続
- 終了処理
- SSRF対策
- Browser Run時間と同時記録数のusage counter
- 上限不明・計測不能・100%到達時の新規開始fail closed

Browser Runのサーバー側利用上限はEPIC-10の決済実装を待たず、このEPICで外部Browser Runを有効化する前に実装する。自動従量課金は行わない。

## EPIC-05: 操作記録

GitHub Issue #57/#58を費用優先ロードマップの正本とする。

- 操作イベント収集
- スクリーンショット
- Storage
- マスキング
- 下書き生成
- R2保存容量のusage counter
- 容量上限不明・計測不能・100%到達時の新規R2書込fail closed

R2のサーバー側保存容量上限はEPIC-10の決済実装を待たず、外部R2への永続書込を有効化する前に実装する。無制限保存は許可しない。

## EPIC-06: 手順書編集

GitHub Issue #54/#55をPhase 2手順書コアの正本とする。

- 手順書一覧
- エディタ
- 手順並べ替え
- 注釈
- 版管理
- 公開/復元
- 外部AI APIを使わない日本語テンプレート生成

## EPIC-07: 検索と整理

- フォルダー
- タグ
- 検索
- お気に入り
- アーカイブ

## EPIC-08: 共有と出力

GitHub Issue #59/#60を費用優先ロードマップの正本とする。

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
- 作成者席、viewerの上限
- Browser Run時間・R2容量・同時記録数はEPIC-04/05で先行実装したusage guardを課金entitlementへ接続する
- 80%警告、100%停止、自動従量課金なし
- 未払い、解約、返金、chargeback
- 請求・利用量画面

決済導線を後段に置くことは、Browser Run/R2を無制限に利用可能にする理由にはならない。原価に直結するusage guardは各原価機能の有効化条件とする。

## EPIC-11: 分析

GitHub Issue #61を費用優先ロードマップの正本とする。

- 閲覧数
- 完了率
- 離脱ステップ
- チャネル
- 集計検証
- 手順単位コメント、古い情報の報告

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

## EPIC-14: AI拡張口 — Deferred

GitHub Issue #62を正本とし、収益が安定したとユーザーが判断して実装開始を明示承認するまで着手しない。

着手前に必要なこと:

- AIで増える利用価値と概算API費用を比較する
- 月額上限、停止条件、kill switchを設計する
- 外部送信データとマスキング境界を確認する
- ユーザーの明示承認を記録する

それまでは次を実装しない:

- AI専用feature flag
- 管理者ON/OFF
- AI adapter
- AI API key/Secret
- AI runtime call
- AI専用利用ログ・コスト計測

AIがなくても基本導線がすべて成立することを維持する。
