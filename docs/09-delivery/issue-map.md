# Issue分解

Status: Accepted

## Product Delivery Overlay

既存EPIC番号とCloudflare移行マイルストーンは、移行履歴・安全境界として維持する。ただし、初回商用MVPの優先順位は技術レイヤーの完了数ではなく、利用者が完遂できる縦切りで判断する。

### P0 Product Foundation

- ICP / JTBD / Activationを正本化する。
- 個人利用開始時の内部workspaceを自動準備し、workspace作成・4ロール理解を初回必須にしない。
- Activation、TTFV、Share、Second Manualを計測できるようにする。

### P1 Core Value Slice

最初に次の1本を通す。

`認証 -> 操作記録 -> 下書き生成 -> 編集 -> URL共有`

この縦切りに直接必要なEPIC-02/03/04/05/06/08の一部を優先し、各EPICを丸ごと完成させてから次へ進む必要はない。

### P2 Browser Run Market Fit Gate

- Issue #86/#89等の安全実証を維持する。
- それとは別に、初期ICPが実際に使う代表Webサービス群で操作記録の実用可能性を確認する。
- bot対策、IP制限、社内DNS、端末認証等による失敗率を記録する。
- 市場適合性が低い場合、capture方式を再評価する。

### P3 Activation UX

- `docs/02-ux/onboarding.md` を正本として初回導線を実装する。
- 空の一覧、workspace選択、role設定を初回価値より先に置かない。
- 初回manual完成後に共有を促し、その後2本目作成・メンバー招待へ進める。

### P4 Monetization Validation

- 課金はActivationと継続利用の実証後に有効化する。
- 初期商品設計はFree -> Pro -> Teamを第一候補とする。
- `single_export` は技術契約を保持するが商用MVPではDeferred。
- Stripeの安全契約は弱めず、課金有効化時にDeep Gateを通す。

### Deferred

利用実績または顧客要求が出るまで、次をMVPブロッカーにしない。

- Guide Me。
- スマホ表示確認。
- タグ、お気に入り、iframe。
- コメント、通知、詳細分析。
- Markdown/HTMLを含む複数export形式の同時提供。
- 高度なTeam管理UI。
- AI拡張。

## 現在の最優先: EPIC-15 Cloudflare認証・DB統一移行

親Issue: GitHub Issue #176

正本:

- ADR-0028
- `docs/09-delivery/cloudflare-migration-roadmap.md`
- `docs/04-data/d1-and-storage.md`
- `docs/05-api/cloudflare-access-d1-api.md`

順序:

1. M0 正本移行
2. M1 Access identity spike
3. M2 D1 workspace boundary
4. M3 Phase 1移行
5. M4 Phase 2 manual移行
6. M5 staging統合実証
7. M6 Supabase退役
8. M7 production準備

外部provider callbackはM2のD1 coreから分離したC1マイルストーンで扱う。M2期間中は両exact POST pathを `503 CALLBACK_MIGRATION_IN_PROGRESS` とし、path別Access Bypassを有効化しない。C1ではOQ-031のatomic receipt/work、lease fencing、sink idempotencyまたはsingle-writer、結果不明照合、recovery testを完了してから再開可否を判断する。

EPIC-02、EPIC-03、EPIC-06のSupabase Auth/Postgres/RLS実装は移行前baselineとして保持するが、新規機能の土台やstaging合格証跡として拡張しない。Issue #92はcompleted closeされ、blanket main merge holdは解除済みである。#95の旧Supabase live gateはSupersededとし、新規Supabase資格情報は追加せず、live runはIssue #215の文書・checker整合PRとは別にownerが実行自体を明示承認した場合だけ許可する。Issue #176 M5の実immutable preview negative proofが完了するまではstaging合格、production資源作成・deploy、外部招待を禁止する。

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

Phase 1旧実装親Issue: GitHub Issue #32

この節のSupabase/RLS経路はIssue #176 M3で置換する移行前baselineである。

Phase 1実装Issue:

- GitHub Issue #33 / P1-01 認証状態: SCR-LOGIN、HttpOnly Cookie、ログイン、ログアウト、期限切れ、再ログイン、401と接続障害の分離。対象ACはAC-001、AC-003、AC-004、AC-005。
- GitHub Issue #34 / P1-02 ワークスペース: SCR-WORKSPACE、一覧、選択、`create_workspace`、空/読込/作成/失敗状態。対象ACはAC-002、AC-006、AC-012。
- GitHub Issue #35 / P1-03〜P1-04 メンバー照会・管理: SCR-MEMBERS、profiles、workspace_members、越境拒否、4ロール、last-owner保護。owner移管は専用フローの設計決定まで拒否する。対象ACはAC-007、AC-008、AC-009、AC-014。
- GitHub Issue #38 / P1-05 RLS回帰: 暫定dev/stagingへのPhase 1 hardening適用、migration履歴同期、DBセッションでのworkspace/member越境拒否、匿名RPC拒否、識別子・作成監査項目の不変条件、last-owner保護まで実検証済み。移行前baselineとして保持し、新規Supabase test userは追加せず、live runはIssue #215の文書・checker整合PRとは別にownerが実行自体を明示承認した場合だけ許可する。実アカウントE2EはIssue #176 M3/M5のAccess/D1経路へ継承する。PR #175でAccess保護immutable preview用repo-side経路をmainへ取り込み済みで、`staging` EnvironmentのAccess secretsとAccess外部設定も完了した。

リポジトリには移行前baselineとして、Supabase認証、ワークスペース一覧・作成、メンバー一覧、本人発行の短命参加コードによる追加、role変更・停止、Phase 1 migration、RLS negative testのハーネスがある。owner移管は専用フロー設計まで拒否する。外部stagingのmigration/RLS本体は検証済みだが、Issue #79の実アカウント `npm run test:rls` は専用RLSテストユーザー4項目とmain-only live runを完了していないため、過去経路の合格証跡にはしない。新規Supabase test userは追加せず、同じ越境拒否・last-owner・停止member要件をIssue #176 M3/M5のAccess/D1 negative testへ継承する。旧参加コード経路は移行まで平文をStorage、URL、ログへ保存しない。

## EPIC-03: アプリシェル

Phase 1実装Issue:

- GitHub Issue #36 / P1-06〜P1-09: 共通シェル、権限別UI、共通状態、日本語文言、アクセシビリティ。対象ACはAC-012、AC-013、AC-014。
- GitHub Issue #37 / P1-10: Worker実行テスト、型検査、bundle dry-run、SCR-LOGINからSCR-WORKSPACE、SCR-MEMBERS、ログアウトまでの4ロールE2E。Phase 1 readiness workflowでChromiumを導入して実行し、異origin拒否とbody上限はproduction codeを壊す変異でも契約検査が失敗することを保証する。

Issue #36ではリポジトリ内のUI実装と、重要要素を壊す変異で失敗するアクセシビリティ契約検査までを扱う。実ブラウザでの200%ズーム、フォーカス順、スクリーンリーダー相当の横断検証はIssue #37で行い、静的契約だけをE2E完了の根拠にしない。

外部設定Issue:

- GitHub Issue #39: repository visibilityはPhase 1 prelaunchでpublic維持と決定し、ADR-0027を正本とする。暫定Workerのstaging環境名、技術URL、billing OFF、staging Access application/audience/policyとstaging D1/R2/Worker bindingはIssue #176 M5のboundary gateで固定し、productionと共有しない。GitHub branch protection詳細、required checks、up-to-date、conversation resolution、bypass禁止、GitHub Environment required reviewers等の外部管理設定は実設定確認が残る。
- GitHub Issue #92: non-production branch build停止、`main`のversion upload-only、Access保護は完了し、Issueはcompleted close済みである。これらの保護を維持しつつ、Access/D1/R2移行後の実preview分離はIssue #176 M5の独立migration gateで検証する。これは#92由来のblanket main merge holdを復活させるものではない。

## EPIC-04: Browser Run

- Browser Run起動
- Live View URL
- Durable Object状態機械
- 再接続
- 終了処理
- SSRF対策

Product補足: 安全実証とは別に、初期ICPの代表サイト群で利用可否を検証する。安全でも市場で使えない場合はcapture方式を再評価する。

## EPIC-05: 操作記録

- 操作イベント収集
- スクリーンショット
- Storage
- マスキング
- 下書き生成

## EPIC-06: 手順書編集

既存Postgres RPC/RLS実装はIssue #176 M4でD1 transaction/queryへ置換する移行前baselineとする。

- 手順書一覧
- エディタ
- 手順並べ替え
- 注釈
- 版管理
- 公開/復元

Product補足: MVPでは利用者にrevision内部構造を見せず、作成・編集・共有の完遂を優先する。

## EPIC-07: 検索と整理

- フォルダー
- タグ
- 検索
- お気に入り
- アーカイブ

Product優先度: アーカイブはMVP、フォルダー/検索はNEXT、タグ/お気に入りはDeferred。

## EPIC-08: 共有と出力

- 共有リンク
- 閲覧画面
- 期限/パスコード
- iframe埋め込みビュー
- PDF/Markdown/HTML出力

Product優先度: URL共有と失効はMVP。PDFはNEXT候補。iframe、Markdown、HTMLはDeferred。

## EPIC-09: 運用機能

- コメント
- 通知
- メンバー管理
- 監査ログ

Product優先度: セキュリティ上必要な監査記録は維持する。一般利用者向けコメント/通知/高度な管理UIはDeferred。

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

Product優先度: BILLING OFFのままActivationと継続利用を検証する。Free -> Pro -> Teamを第一候補とし、single_exportは商用MVPではDeferred。価格・上限の変更は既存ADR同期手順を維持する。

## EPIC-11: 分析

- 閲覧数
- 完了率
- 離脱ステップ
- チャネル
- 集計検証

Product優先度: MVPではActivation、TTFV、Capture Completion、Share、Second Manual、D7 Creator Retentionの最小計測を先に行う。詳細閲覧分析はNEXT/Deferred。

## EPIC-12: セキュリティ/運用

- 秘密管理
- 削除/退会
- バックアップ
- リストア演習
- Runbook

セキュリティ/復旧要件はMVP簡素化の対象外。

## EPIC-13: リリース品質

- E2E
- Access JWT、Worker認可、workspace固定D1 query／制約negative・mutation test（旧RLSは移行baseline変更時だけ）
- 負荷
- 障害注入
- 可観測性
- ロールバック

品質ゲートは `docs/07-quality/test-strategy.md` のFast/Core/Deep運用レベルに従い、無関係なDeep検査で日常のMVP開発を恒常的に塞がない。

## EPIC-14: AI拡張口

- AI feature flag
- AI利用OFF既定
- 管理者ON/OFF
- 利用ログ
- コスト上限

Product優先度: Deferred。収益・利用価値が確認されるまでコア導線の依存先にしない。
