# 決定ログ

Status: Accepted

| ID | 日付 | 決定 | 理由 |
|---|---|---|---|
| DEC-001 | 2026-07-31 | リポジトリ名は `meccha-manual` | ユーザー指定 |
| DEC-002 | 2026-07-31 | 対象は日本人オフィスワーカー | ユーザー指定 |
| DEC-003 | 2026-07-31 | Supabaseを使う | ユーザー指定。Auth/DB/RLSを一体で扱える |
| DEC-004 | 2026-07-31 | Cloudflareを使う | ユーザー指定。Workers/Browser Run/R2を使える |
| DEC-005 | 2026-07-31 | Chrome拡張を第一方式にしない | システム内ブラウザ方式を核にする |
| DEC-006 | 2026-07-31 | AI APIは初期OFF | 従量課金と機密情報送信リスクを避ける |
| DEC-007 | 2026-07-31 | 共有リンクはデフォルトOFF | 情報漏えいリスクを下げる |
| DEC-008 | 2026-07-31 | 個人利用ではなくワークスペース所属を前提にする | 課金、権限、監査を一貫させる |
| DEC-009 | 2026-07-31 | 設計は全部入り、開発は段階的に進める | 品質ゲートを通しながら進める |
| DEC-010 | 2026-07-31 | ロゴは「め」+ 紙 + 手順番号の方向で暫定制作 | ユーザー要望とUIUX提案 |
| DEC-011 | 2026-08-02 | stagingとproductionを分離し、production反映はstaging合格後の明示承認にする | 本番データ、secret、migration、Browser Run費用を分離して事故を防ぐ |
| DEC-012 | 2026-08-02 | Discord Webhookは開発報告の片方向通知に使い、指示受付はBot/Issue bridgeとして別設計にする | WebhookだけではDiscordから指示を受信できないため |
| DEC-013 | 2026-08-02 | ファイル本体はCloudflare R2を第一候補にする | 操作記録スクショが増えやすく、R2の容量/egress条件が向いている |
| DEC-014 | 2026-08-02 | Stripeは月額3,300円税込みのProプラン想定にするが、Webhook実装まで外部設定は後回し | アプリ側 `/v1/webhooks/stripe` が未実装のため |
| DEC-015 | 2026-08-02 | `SUPABASE_SERVICE_ROLE_KEY`、DB password、JWT Secretはまだ登録しない | 不要な強権secretを早期に持たないため |
| DEC-016 | 2026-08-02 | Discordからの指示はCloudflare Workerで受け、GitHub Issueへ変換する | Discord単独承認を避け、PR/Issueの監査可能な流れへ乗せるため |
| DEC-017 | 2026-08-02 | feature/fix/review/chore/phase branch push時にPRを自動作成する | AI駆動開発でユーザーに毎回PR作成作業を戻さないため |
| DEC-018 | 2026-08-02 | Discord通知は日本語とCodex所感を基本にする | ユーザーがDiscordだけで状況と次アクションを判断できるようにするため |
| DEC-019 | 2026-08-02 | Discord Interactionは署名検証後にdeferred responseを先に返し、許可確認、重複確認、Issue作成、followup更新をbackgroundで処理する | Discordの3秒応答制限で「アプリケーションが応答しませんでした」になることを防ぐため |
| DEC-020 | 2026-08-02 | Wrangler deployでDashboard runtime variablesを消さないため `keep_vars` と必須secret宣言を使う | GitHub merge後の自動deployでDiscord runtime設定が消えることを防ぐため |
| DEC-021 | 2026-08-02 | Discord buttonから直接PR mergeは行わず、まずはPR閲覧、レビュー依頼、修正依頼、マージ依頼の記録までにする | GitHub checks、owner承認、監査ログ、branch protectionを正本にするため |
| DEC-022 | 2026-08-02 | PRごとにサブエージェント品質loopを通す | 実装、UIUX、テスト、辛口レビュー、リファクタリングレビュー、ドキュメント記録の判断を分離するため |
| DEC-023 | 2026-08-02 | R2 bucket作成前にbucket名、binding名、object key、公開禁止方針を固定する | 存在しないR2 bindingによるdeploy失敗とファイル公開事故を防ぐため |
| DEC-024 | 2026-08-02 | Phase 1本番開発へ入る前に着手前ゲートとユーザー承認を必須にする | 認証、RLS、ワークスペース境界のP0リスクと無承認着手を防ぐため |
| DEC-025 | 2026-08-02 | PCの電源に依存しない作業はCodex Cloud、Codex web、GitHub Codespacesで行う | ローカルCodex DesktopだけではPC電源OFF中に新しいコード編集を継続できないため |
| DEC-026 | 2026-08-02 | ワークスペースとメンバーの識別子・作成監査項目を更新不可とし、認証用RPCの実行権限を`authenticated`へ限定する | owner/admin更新権限を利用したテナント境界やowner対象の差し替えと、匿名ロールへの不要な関数公開を防ぐため |
| DEC-027 | 2026-08-02 | Issue作成時はGitHub Actionsで即時トリアージし、`approved-for-codex` ラベル付きIssueだけ `CODEX_ACCESS_TOKEN` でCodex自動実装する | 15分ポーリングの無駄を減らし、OpenAI API従量課金ではなくCodex/ChatGPT利用枠でクラウド実装を進めるため |
| DEC-028 | 2026-08-02 | R2 bucket名を用途ごとの `meccha-manual-*-staging` / `meccha-manual-*-prod` に固定し、同じbinding名で環境を分離する（[ADR-0018](../03-architecture/adrs/ADR-0018-r2-bucket-binding-contract.md)） | Workerコードを環境共通にしつつ、誤った環境のobjectを参照しないため |
| DEC-029 | 2026-08-02 | 正式運用では`main`マージをproduction候補の確定とし、production deployは自動開始しない。prelaunch暫定例外はDEC-035を正とする | マージと本番反映の承認を分離し、環境取り違えを防ぐため |
| DEC-030 | 2026-08-02 | 初期課金は無料、`BILLING_FEATURE_ENABLED=false` とし、Pro候補は月額3,300円税込みにする（[ADR-0022](../03-architecture/adrs/ADR-0022-free-first-stripe-billing.md)） | 外部課金設定より先にWebhook、entitlement、席数の安全境界を整えるため |
| DEC-031 | 2026-08-02 | migrationのPhase固有静的検査と共通安全検査を分け、production適用を別承認にする | 既存検査との重複を避けながら、破壊的構文と誤適用を早期に止めるため |
| DEC-032 | 2026-08-02 | Browser Run sessionはDurable Objectが直列管理し、Live View短命化、全redirect SSRF再検査、入力値非保存、終了時破棄を必須にする。DNS再解決だけでは完了とせず、application bytes送信前の実接続拘束をWebRTC/WebTransportを含む全通信種別へ適用する。1経路でも実現不能なら任意URL・承認済みhost・mobile previewを含む全Browser Run起動とnavigateをfail closedにする。検証済みflagをtrueからfalseへ戻す緊急停止では、新規拒否に先立ちegress kill switchで既存Browserの全通信を即時遮断し、Live Viewを失効して再発行を拒否し、全Durable Objectへ終了commandを送って全sessionのclose完了まで再試行・監査する | セッション残留、DNS rebindingによる内部ネットワーク到達、機密入力保存をP0として防ぐため |
| DEC-033 | 2026-08-02 | R2 Storageはdomain portとinfra adapterを分離し、manual/step識別子はサーバー側metadataに限定してR2 custom metadataへ複製しない | Cloudflare SDK型の侵入と、R2 metadataへの不要な識別情報・任意入力の保存を防ぐため |
| DEC-034 | 2026-08-02 | staging/productionでGitHub Environment、Worker、Supabase、R2、Stripe、Discord設定を分離し、現在のSupabase projectは暫定dev/stagingとして扱う | production資源を作成する前に接続先とデータ境界を固定し、環境取り違えを防ぐため |
| DEC-035 | 2026-08-02 | 正式運用ではstaging/production候補SHAを証跡で結び、productionは手動dispatchとGitHub Environment `production` required reviewersを必須にする。外部ユーザー/実データがないprelaunch期間だけはowner判断で`main`の暫定Worker自動deployを許可し、最初の登録・本番公開前に必ず解除する | 開発初期の速度と、公開後の無承認deploy防止を段階で両立するため |
| DEC-036 | 2026-08-02 | 既存accountの`tattoo-studio-crm.workers.dev`配下は当面の技術的サブドメインとし、独自ドメイン切替は別承認にする | 技術URLを恒久的な公開URLと誤認せず、route変更をproduction deployから分離するため |
| DEC-037 | 2026-08-07 | 料金体系を都度払い550円、パーソナル月額3,300円、チーム月額9,900円とする。申込方式のPayment Links部分はDEC-038でSuperseded（[ADR-0023](../03-architecture/adrs/ADR-0023-pricing-and-stripe-link.md)） | 単発利用、個人継続利用、チーム利用を分け、Browser Run・Storage・席数の原価を上限で制御するため |
| DEC-038 | 2026-08-08 | entitlement付与に固定Payment Linkを使わず、購入試行ごとの30分有効なCheckout SessionとStripe Linkを使う（[ADR-0023](../03-architecture/adrs/ADR-0023-pricing-and-stripe-link.md)） | 再利用可能URLとアプリ側intent期限のずれで、支払いだけ成立して権利が付かない状態を防ぐため |
| DEC-039 | 2026-08-09 | 最新SHAのCodex合格証跡として正式review、依頼後の👍、bot・時刻・Reviewed commitを照合した重大問題なしコメントを受理し、コメント形式では`/quality-gate`を明示実行する | Codexの応答形式差で合格済みPRが停止することを防ぎつつ、古いSHAや第三者コメントの流用を防ぐため |
| DEC-040 | 2026-08-08 | WorkerログアウトはCookie削除だけでなくSupabase Authの現在セッションを失効し、401と接続・上流障害をUIで区別する。複数タブの認証変更は通知して進行中応答を無効化し、workspace作成後は現在sessionを再取得して作成主体と照合する（[ADR-0010](../03-architecture/adrs/ADR-0010-worker-cookie-auth-harness.md)） | refresh tokenの残存、障害をログアウトと誤表示する不整合、別タブや応答順序による異なるユーザー・古いworkspace一覧の混入を防ぐため |
| DEC-041 | 2026-08-09 | `www.meccha-iiyatsu.com`はブランド/LP専用Static Assets Worker、`meccha-manual.meccha-iiyatsu.com`は認証付きアプリWorkerとして分離し、Cookie・deploy・障害範囲を共有しない（[ADR-0024](../03-architecture/adrs/ADR-0024-domain-and-publication-boundary.md)） | 今後のアプリ追加を同じURL規則で拡張し、LPのサブパス要件が認証アプリのroutingとCookie境界へ影響しないようにするため |
| DEC-042 | 2026-08-09 | refresh token交換を同一originの専用POSTへ分離し、login/logout/refreshを同じWeb Lockで直列化する（[ADR-0010](../03-architecture/adrs/ADR-0010-worker-cookie-auth-harness.md)） | 古いrefresh応答による別ユーザーCookieへの巻き戻りと、refresh後の業務API途中失敗による回転済みtoken喪失を防ぐため |

DEC-014とDEC-030の単一Pro価格部分はDEC-037で更新する。課金機能を初期OFFにする安全境界は継続する。
