# 決定ログ

Status: Accepted

### DEC-091: Product auth first-party session foundation

- Date: 2026-10-03 / Issue #283 / ADR-0041
- Decision: GoogleとSIWCを同じfirst-party session境界へ接続し、既存`identities(issuer, subject)`とD1 Personal Workspace bootstrapを再利用する。`auth_sessions`と`oauth_transactions`はhash・期限・一回消費だけを保存し、Access service token／healthを製品cookieから分離する。Googleはverified email、SIWCはconfidential `client_secret_basic`とclient ID scoped subjectを使う。メール確認、明示的link、SIWC商用client登録・plan usage、remote migrationとsecret bindingは次unitとする。
- Evidence: `apps/worker/src/product-auth.ts`, `migrations/0008_product_auth_sessions.sql`, `tests/product-auth.test.mjs`

### DEC-094: Product auth bootstrap refusal and storage failure mapping

- Date: 2026-10-03 / Issue #283
- Decision: Product auth callback maps a disabled identity to `403 AUTH_IDENTITY_FORBIDDEN` and a suspended or deleted Personal Workspace to `403 AUTH_WORKSPACE_UNAVAILABLE`, both without issuing a session. D1 session-read and bootstrap storage failures map to `503 AUTH_STORAGE_UNAVAILABLE` with a Japanese retry instruction. `workspace.created` is emitted only when the Personal Workspace row is created and has no prior creation audit.
- Reason: Preserve fail-closed identity and workspace boundaries while giving callback and logout callers an actionable response, and keep provisioning audit logs idempotent across re-login.
- Evidence: `apps/worker/src/product-auth.ts`, `apps/worker/src/infra/d1/onboarding-repository.ts`, `tests/product-auth.test.mjs`

### DEC-096: Product auth callback referrer and storage failure boundaries

- Date: 2026-10-04 / Issue #283 / PR #284
- Decision: Product auth success redirects and callback JSON/HTML errors send `Referrer-Policy: no-referrer`. OAuth transaction and session storage `prepare`/`bind`/`run` failures map to `503 AUTH_STORAGE_UNAVAILABLE` without issuing a redirect or session; validation and replay responses remain unchanged.
- Reason: Prevent callback `code`/`state` values from entering a later same-origin `Referer` header and keep transient D1 failures retryable without leaking implementation errors.
- Evidence: `apps/worker/src/index.ts`, `apps/worker/src/product-auth.ts`, `tests/product-auth.test.mjs`, `tests/product-auth-browser.test.mjs`, `tests/office-auth-runtime-browser.test.mjs`

### DEC-097: 製品認証limiterとconsume済みcallback戻り境界

- Date: 2026-10-04 / Issue #283 / PR #284 / Codex Review 5401676113
- Decision: 製品認証開始ではlimiter結果が明示的に`success: false`の場合だけ`429 AUTH_RATE_LIMITED`へ分類する。binding欠落、limiter例外、不正または不明な結果は、OAuth transactionを作成する前に再試行可能な`503 AUTH_RATE_LIMIT_UNAVAILABLE`へ分類する。transactionを検証してconsumeした後のnonce binding失敗などcallbackエラーは、再検証済みの固定`return_path`だけを引き継ぎ、不正または外部の保存pathは破棄して表示・redirectしない。
- Reason: quota拒否とlimiter利用不能を区別し、consume済みtransactionのreplay保護を維持しながら、改変されたtransaction dataを信頼せずOffice／onboardingの再試行contextを保持するため。
- Evidence: `apps/worker/src/product-auth.ts`、`tests/product-auth.test.mjs`、`docs/05-api/api-contracts.md`

### DEC-099: 製品provider設定時の業務route認証境界

- Date: 2026-10-04 / Issue #283
- Decision: `cloud-manual-router.ts` と `share-link-router.ts` は、製品sessionが解決できず製品cookieも存在しない場合、製品provider設定済みかつAccess assertionなしならAccess検証へfallbackせず`401 SESSION_REQUIRED`を返す。自然期限切れでブラウザからcookieが消えた場合も同じ境界とする。Access assertionがある場合は従来どおりJWT、service主体、identity、D1の検証へ進める。不正・失効した製品cookieは引き続きAccessへfallbackしない。
- Reason: 製品ログインの期限切れをAccess設定不足の`503 ACCESS_CONFIG_UNAVAILABLE`へ誤分類せず、製品ログインを再開できる状態へ戻しながら、明示されたAccess認証と業務のtenant・service主体境界を維持するため。
- Evidence: `apps/worker/src/cloud-manual-router.ts`、`apps/worker/src/share-link-router.ts`、`tests/cloud-manual-c.test.mjs`、`tests/share-link-backend.test.mjs`、`docs/05-api/api-contracts.md`

### DEC-100: 製品provider設定時の業務route dispatchとD1欠落境界

- Date: 2026-10-04 / Issue #283 / PR #284 / Codex Review 5402031810
- Decision: 製品providerが設定されたmanual／share業務routeは、D1 bindingの有無から独立してdispatchする。D1が欠落した場合はmanual helperの`503 D1_UNAVAILABLE`、share helperの`503 SHARE_MIGRATION_IN_PROGRESS`へ到達させ、製品cookieの期限切れ401へ誤分類しない。request credentialの優先順、legacy password cookieのSupabase route、Accessのservice／machine／tenant境界は維持する。
- Reason: provider設定済みの製品専用環境でDB bindingが一時的または移行中に欠落しても、業務APIを404へ変換せず、既存helperが定義したstorage障害として利用者へ返すため。認証方式の選択をDB availabilityに結び付けないことで、legacy／Accessの既存境界も変えない。
- Evidence: `apps/worker/src/index.ts`、`apps/worker/src/product-auth.ts`、`tests/product-auth.test.mjs`、`docs/05-api/api-contracts.md`

### DEC-101: 製品認証providerの上流障害とtoken／JWKSエラー分類

- 日付: 2026-10-04 / Issue #283 / PR #284 / Codex Review 5402139079
- 決定: Google／SIWCのtokenまたはJWKS endpointのHTTP `429`／`5xx`、接続失敗、timeoutは再試行可能な`503 AUTH_PROVIDER_UNAVAILABLE`として保持する。実際のcode拒否など4xxだけを`401 AUTH_CODE_INVALID`へ写像する。JWTのissuer／audience／署名などの検証失敗は`401 AUTH_IDENTITY_INVALID`とし、transactionとJWTのnonce不一致など既存のnonce境界は既存の拒否分類を維持する。bounded provider fetchで既に分類した`ProductAuthError`（timeout、上流障害、応答上限超過を含む）は保持する。検証済み固定`return_path`、transactionの一度限りconsume境界、秘密値非露出は変更しない。
- 理由: providerの可用性障害やJWKSの通信／サイズ障害を利用者のcodeまたはidentity拒否へ変換せず、callbackの安全なonboarding／Office再試行先と障害分類を維持するため。
- 根拠: `apps/worker/src/product-auth.ts`、`tests/product-auth.test.mjs`、`docs/05-api/api-contracts.md`

### DEC-095: Product auth route and callback return boundaries

- Date: 2026-10-03 / Issue #283 / PR #284
- Decision: Product route selection follows the request credential: a valid legacy password cookie remains on the Supabase route while a product cookie selects D1 and is never allowed to fall back to password or Access after validation failure. Google accepts only the documented canonical HTTPS issuer and exact legacy bare issuer, storing the canonical HTTPS issuer with the same `sub`. After a state, verifier, nonce, and transaction return path are verified, browser callback failures keep their Japanese error status/message and expose a link to that fixed same-origin path so onboarding and Office handoff sessionStorage survives cancel and retry; invalid or untrusted transactions use the generic Japanese error page instead. Unexpected D1 failures use a safe retryable 503 while retaining the verified return link.
- Reason: Prevent a configured provider from hijacking legacy password sessions, avoid issuer-based duplicate identities, and preserve the user's selected Office format across a provider cancel or retry without introducing an open redirect.
- Evidence: `apps/worker/src/index.ts`, `apps/worker/src/product-auth.ts`, `tests/product-auth.test.mjs`, `tests/office-auth-runtime-browser.test.mjs`, `docs/05-api/api-contracts.md`

| ID | 日付 | 決定 | 理由 |
|---|---|---|---|
| DEC-093 | 2026-10-01 | 初回Access復帰でfragment再付与後の旧document由来の遅着`hashchange`は、`event.newURL`のfragmentと現在の`location.hash`が一致しない場合に無視する。現在のfragmentと一致するhash-only遷移は従来どおりCTAを無効化して再読込し、遷移先を再検証する | `history.replaceState`後の遅着イベントがhashless画面を再読込すると、初回復帰のbootstrapではなくresume経路が選択され、保存操作が失敗し得るため。stale eventの副作用を0回にし、通常のfragment遷移の安全境界を維持する |
| DEC-090 | 2026-10-01 | DEC-091の通常Web経路は、hashlessなページ遷移だけでは`handoff.access-return`を送らず、同じtabの`sessionStorage` handoffを表示した画面で利用者が「保存を再開する」または「保存状況を確認する」を押した場合だけ、既存のsender／handoff／ready／identity／TTL検証を通してfragment再付与を要求する。初回AccessでJSが実行されないDEC-092のpayloadなしcontent script経路は自動復帰を維持する | `performance.navigation`の`navigate`だけをAccess復帰の証明にすると、同一originの通常navigationを認証後returnと誤認して同tabへfragmentを再付与するため。Webの明示意図を復帰の入口に限定し、通常navigationの自動復帰0回、期限切れ通常handoffのwrite拒否、結果回収identityのGET専用、local原本保持を維持する |
| DEC-091 | 2026-10-01 | Access認証後のhandoff復帰はURL監視に依存せず、同一originのWeb画面からの`handoff.access-return` external messageを、senderのtop-level frame・tab ID、handoff ID・launch ID・拡張ID・operation identity・action・draft fingerprint・元のexpiresAt・既存ready recordで再検証する。通常handoffは元の期限内、`finalize-pending`／`completion-pending`はGET専用の結果回収identityがある場合だけ、同じfragmentを最大3回まで再付与する。本文、画像、credential、共有token、Access URL観測権限は追加しない | Access redirectでfragmentが失われても、最小権限のまま認証後のWeb画面から対象tabを証明できるため。通常の期限切れ書き込みと別tab・通常fragment除去・完了済みhandoffの誤復帰を拒否する |
| DEC-092 | 2026-10-01 | DEC-091の初回Access復帰に限り、固定staging originの`/onboarding/continue`へ完全一致するMV3 content scriptと同originだけのhost permissionを追加する。hashlessかつ初回`navigate`のcontent scriptは識別子を送らず、service workerがsenderのtab IDに束縛された`pageReadyAt`未確認のready recordを一意照合し、保存済みmetadataから同じfragmentを最大3回まで再付与する。DEC-091の「host permissionを追加しない」はこの初回経路の範囲で失効する | Accessが初回URLを302して`ONBOARDING_JS`を一度も実行させず、hashlessで同originへ戻す場合でも、Webへhandoff capabilityやextension IDをquery／fragmentで追加露出せず同じintentを回復するため。staging以外のorigin、Access URL、tabs permission、本文・画像・credential・tokenは追加しない |
| DEC-075 | 2026-09-20 | B登録UIのhandoff metadataは同一タブの`sessionStorage`にhandoffごとの履歴として保持し、`handoffId`ごとに一意な`operationId`を再利用する。metadataは作成から15分で、期限切れtombstoneの保存に成功した場合に限り`expired`へ遷移し、期限切れの同じIDを再開・再送せず、拡張機能で新しいhandoffを発行してやり直す | A-B-Aのタブ内遷移で別handoffの操作を混同せず、期限切れ・結果不明の再送で新しいoperationを発行しない。本文・画像・下書きはsessionStorageへ移さず、正式origin／Accessが未準備の場合は登録操作を無効化して準備中を表示する。tombstoneの保存に失敗した現在ページはfail closedとし、再読込後の失効状態の耐久性は保証しない。hash-onlyのfragment遷移はCTAを即時無効化して再読込し、遷移先を再検証する。 |
| DEC-076 | 2026-09-20 | B owner pilotのruntimeは既存legacy `wrangler.jsonc`から分離した`wrangler.onboarding.jsonc`を使い、`apps/worker/src/index.ts`、環境別の完全一致`APP_ENV`／`APP_BASE_URL`、staging専用D1、10回／60秒のrate-limit bindingを固定する。productionのD1 ID、Access audience、rate-limit namespaceが未確定の間はplaceholderでfail closedにする | legacy Supabase／Discord runtimeへ影響させず、stagingの限定検証だけを可能にする。host反映やwildcardによるWeb UI有効化を拒否し、production資源作成・migration・deployやCの実装をこの準備で承認しない。 |
| DEC-077 | 2026-09-21 | owner限定staging配布版のChrome拡張は、`https://meccha-manual-staging.meccha-iiyatsu.com`だけを登録UI handoff先として固定し、production、preview、localhost、userinfo、port、path、query付きoriginを拒否する。configとhandoffは同じ固定値を参照し、配布版のmanifest versionは`0.1.1`とする | staging B登録UIへ接続できる reviewable な配布導線を用意しつつ、production公開や任意originへの接続を防ぐ。本文・画像・credentialは拡張から送信せず、Cの保存・claimは有効化しない。 |
| DEC-074 | 2026-09-20 | bootstrapの`created_identity=1`はidentity作成時刻と一致するoperationに限定し、identityごとに一意化 | `onboarding_bootstrap_operations`のD1 trigger／partial unique indexで、直接挿入・偽signup・並行再送の境界を検査する。既存identityの作成時刻を知るDB writerによる歴史的挿入までをこの境界だけで証明しない。 |
| DEC-001 | 2026-07-31 | リポジトリ名は `meccha-manual` | ユーザー指定 |
| DEC-002 | 2026-07-31 | 対象は日本人オフィスワーカー | ユーザー指定 |
| DEC-003 | 2026-07-31 | Supabaseを使う（DEC-064でSuperseded） | 当時のユーザー指定。移行前の判断記録として保持 |
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
| DEC-021 | 2026-08-02 | Discord buttonから直接PR mergeは行わず、まずはPR閲覧、レビュー依頼、修正依頼、マージ依頼の記録までにする。通常の実装・PR・mergeに一律のowner承認を求める一般承認部分だけはDEC-067で部分的にSupersededとし、商用リリース前は親セッションの実SHA・依存順・品質ゲート確認、商用リリース後は外部反映ごとのユーザー事前承認に従う | GitHub checks、監査ログ、branch protectionを正本にし、Discordボタンからの直接merge禁止と既存の別承認境界を維持するため。owner承認を含む旧条件は2026-08-02時点の記録として保持し、一般承認部分の更新日と根拠をDEC-067に記録する |
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
| DEC-043 | 2026-08-10 | 現在workspaceはuser IDと最新active所属で検証したタブ内選択として保持し、認可根拠にしない。同一ユーザーの再ログインでは選択と結果不明ロックを維持する。作成RPCまたはブラウザまでの応答消失・不正成功応答は確定失敗とせず、競合する一覧更新より結果不明ロックを優先して一覧確認を案内する。一覧が保留中POSTと同じslugを先に確認した場合は、その操作を確認済みとして遅延応答による再ロックを防ぐ（[ADR-0010](../03-architecture/adrs/ADR-0010-worker-cookie-auth-harness.md)） | 共有ブラウザでの別ユーザー選択持越しと、作成済みworkspaceの重複再作成を防ぐため |
| DEC-044 | 2026-08-10 | workspace名はECMAScript相当のtrim後にUnicode code pointで1〜64文字とし、slugとともにDB制約と`create_workspace` RPCでも強制する。forward migrationは既存名を制約検証前に正規化・補正する。所属一覧は固定field・正確な総数・最大1000件で取得する。session並行取得では5秒timeoutを設け、片方の401を他方の失敗より優先する。上流4xxは既知の入力不正・競合だけを400へ写像し、予期しない4xxはサービス障害として区別する（[ADR-0010](../03-architecture/adrs/ADR-0010-worker-cookie-auth-harness.md)） | 直RPCによる入力契約迂回と自己アカウントDoS、不完全・無上限な応答buffer、更新可能な期限切れの誤分類・無期限待機、設定障害の入力不正表示を防ぐため |
| DEC-045 | 2026-08-10 | Phase 1のメンバー追加は招待メールを送らず、メール確認済みの登録済みユーザーをメールアドレスで直接追加する。owner/adminだけがadmin/editor/viewerの追加・変更・停止を行い、owner付与・移管・停止・削除は専用移管フローがAcceptedになるまでAPIとDBで拒否する。メンバー一覧は明示操作時に最大1000件取得する | 未決の招待・メール送信境界を実装せずFR-003を成立させ、アカウント列挙、テナント越境、last-owner喪失を防ぐため |
| DEC-046 | 2026-08-11 | メンバーのadmin昇格と利用停止は対象者・影響を示す確認操作を必須とし、自己停止はUIで拒否する。保存中の認証変更は、同一ユーザーなら保留中処理の決着後に一覧を再照合し、別ユーザーなら旧状態を破棄する | 誤操作による権限昇格・利用不能と、別タブ認証変更で変更結果が不明なまま再操作されることを防ぐため |
| DEC-047 | 2026-08-11 | DEC-045のメール直接追加を廃止し、本人が発行する256 bit・10分有効・単回使用の参加コードへ置換する。発行者へBearerコードの影響と1対1共有を警告し、期限到達時は平文をDOM/stateから消去、再発行は失効確認を必須とする。発行中の認証変更は同一ユーザーなら遅延結果を確定し、別ユーザーなら平文を破棄する（[ADR-0025](../03-architecture/adrs/ADR-0025-consent-based-member-join-codes.md)） | アカウント存在判定と同意なしの強制所属、期限切れコードの誤共有、認証競合による平文越境を防ぎ、メール送信なしでも本人同意を検証するため |
| DEC-048 | 2026-08-11 | Phase 1共通シェルは反復ナビを飛ばす本文スキップ、日本語のページ内ナビ、現在のワークスペース、live region、可視フォーカス、44px操作領域、200%ズーム向け再配置を共通契約にする。本人権限はメンバー全件を暗黙取得せず、未確認状態を明示し、メンバー一覧の明示取得後に表示する。手順書と操作記録は提供開始まで操作不能な「準備中」とする | キーボード・拡大表示・支援技術の利用者が現在位置と処理状態を把握し、一覧の個人情報を必要前に取得せず、未提供機能を誤操作しないようにするため |

| DEC-049 | 2026-08-12 | 既存のIssue起点Codex runnerを維持し、Business OS専用の署名job runnerを別workflowとして並設する。Business OS runnerは`codex/*` branchとdraft PRまでを担当し、production deploy、rollback、DB migration、secret変更は既存のOwner承認工程へ引き渡す（[ADR-0026](../03-architecture/adrs/ADR-0026-business-os-cloud-runner.md)） | 既存運用を壊さず、repository・期限・予算・operation・書込pathをBusiness OSの承認単位で監査するため |
| DEC-050 | 2026-08-12 | Phase 1 readinessは最新Workers型のstrict typecheck、Wrangler bundle dry-run、重要な失敗条件のproduction code変異、fixture APIを使う実Chromium 4ロールE2Eを必須にする。外部Supabaseのmigration・資格情報・テストデータは使わず、動的RLS検証は承認対象のIssue #38へ分離する | 静的snippetだけの合格を防ぎつつ、外部環境を無承認で変更せずに認証・権限UI・アクセシビリティの実行可能性をPRごとに保証するため |
| DEC-051 | 2026-08-14 | 手順書一覧のSupabase応答上限は1000件かつ1 MiBとし、その他のSupabase JSON応答は512 KiBを維持する | title最大64 Unicode code pointがJSON制御文字として最大6 byteへ展開しても1000件一覧を取得可能にしつつ、一般応答の無制限buffer拡大を避けるため |
| DEC-052 | 2026-08-14 | 手順書詳細は200 active steps・8 MiB、draft description 10,000文字、step title 128文字、instruction 4,000文字、target 256文字、URL 2,048文字を上限とし、manual/revision/stepのwriteはSECURITY DEFINER RPCへ集約する | 201件目の件数異常判定を含め、DB有効な最大長文字列がJSON制御文字escapeで1 code pointあたり最大6 byteへ展開しても詳細APIが読める一方、bufferを8 MiBで打ち切り、複数tableの部分更新・Worker境界迂回も防ぐため |
| DEC-053 | 2026-08-14 | 手順書write body上限を64 KiBとし、step PATCHは取得時のupdatedAtをrevision lock内で照合する楽観的更新にする。使い捨てPostgreSQLでは同じupdatedAtの2更新を同時実行し、1件だけ成功することを必須検証とする | 10,000 Unicode code pointの日本語説明を正当に受理しつつ、同じ旧versionを基にした並行更新が互いの変更を黙って上書きすることを防ぐため |
| DEC-054 | 2026-08-17 | 長期AI開発のライブな現在地はGitHub Issue #70へ集約し、新しいセッションは `AGENTS.md` の正本優先順位に従ってIssue #70・対象Issue/PR・commit・CI・review threadを照合する。コードやCI等の実状態を正本へ昇格せず、正本との矛盾時は作業を停止して `open-questions.md` へ登録する | 会話上限や端末停止後もGitHubから安全に再開しつつ、実装逸脱を正本として固定化する事故を防ぐため |

DEC-014とDEC-030の単一Pro価格部分はDEC-037で更新する。課金機能を初期OFFにする安全境界は継続する。

## DEC-060: 手順書削除契約は非破壊アーカイブから開始する

- Status: Accepted
- Date: 2026-08-18
- Decision:
  - 現段階のFR-004削除導線は、`status = archived`と`archived_at`だけを更新する非破壊アーカイブとして提供する。
  - 表示中manualの`updatedAt`とrouteのworkspaceをmanual row lock内で照合し、owner/admin/editorだけが実行できる。
  - revision pointer、下書き、公開版、step、asset参照は保持し、同じtransactionで`manual.archived`を監査する。
  - 復元と物理削除はOQ-028を解決するまで実装・有効化しない。
- Reason: 完全削除の関連資源・猶予・復旧契約が未確定のため、一覧から除外する利用者目的を満たしつつ、不可逆なデータ損失と競合更新の隠蔽を防ぐため。
- Evidence: Worker/API、RPC権限・workspace・楽観lock・監査SQL、editor/viewer/結果不明Playwright。

## DEC-059: 公開と次draft作成は表示中revisionをDB lock内で照合する

- Status: Accepted
- Date: 2026-08-18
- Decision:
  - 公開APIは表示中draft revision ID、次draft作成APIは表示中published revision IDを必須入力とする。
  - RPCはmanual rowをlockして現在pointerと期待IDを照合し、公開対象の状態変更とpointer更新、または公開版からのmetadata・active steps複製とpointer更新を同一transactionで行う。
  - 期待IDを受け取らない旧公開・draft作成RPCは`authenticated`から実行できないようにする。
- Reason: 詳細取得後に別操作でpointerが切り替わっても、古い画面から意図しないrevisionを公開・複製しないため。
- Boundary: 公開URL、共有リンク、staging/production migration適用、production deployは含めない。

## DEC-058: draft metadataと作成UIを競合・遅延応答から保護する

- Status: Accepted
- Date: 2026-08-15
- Decision:
  - draft基本情報のPATCHは表示時の`updatedAt`を必須とし、manual rowとdraft rowのlock取得後に照合する。同じversionからの後続保存は409で拒否する。
  - 手順書作成の入力エラーではフォームDOMを維持し、説明等の未保存入力を破棄しない。
  - 作成成功後は一覧キャッシュを無効化し、一覧へ戻る時に再取得する。
  - 作成応答前に画面またはworkspaceが変わった場合、遅延応答で元workspaceの詳細へ遷移しない。
  - 作成結果不明は作成元workspace単位のメモリ状態として保持し、workspaceを往復しても元workspaceの再取得と重複作成防止案内を維持する。
  - 結果不明状態より前に開始した一覧取得は、後発の重複作成防止案内を上書きせず、新しい一覧取得で結果を再照合する。
  - 初回詳細取得中の権限失効・所属喪失も読込中のまま残さず、安全なエラー状態へ遷移して権限を再取得する。
  - 初回詳細取得中に一覧やworkspace画面へ移動済みでも、元workspaceの所属喪失が確定したら表示中の権限UIを安全側へ再描画して権限を再取得する。
  - Unicode code point上限超過時は入力直前の受理済み値へ戻し、途中入力によって既存末尾を削除しない。
  - 2026-09-05追記: 閲覧プレビューは詳細APIで取得した保存済みrevisionだけを表示し、下書きと公開版を区別する。開閉時は編集フォームDOMと元の`updatedAt`を保持し、未保存入力を失わない。開閉だけで保存・公開APIを呼ばず、手順書内容をbrowser storageへ保存しない。
- Evidence:
  - Worker/API/SQL/Playwrightの競合・入力保持・遅延応答・一覧再取得テスト。
  - 使い捨てPostgreSQLで同じdraft versionからの2並行更新を実行し、1件だけ成功することを確認する。
- Boundary:
  - staging/production migration適用とproduction deployは行わない。

## DEC-061: Browser Run実起動よりfail-closed基盤と非保存draft変換を先行する

- Status: Accepted
- Date: 2026-08-18
- Decision:
  - OQ-006のactual-peer P0検証が完了するまで、操作記録開始、Live View、navigate／reload、mobile previewは認証・workspace role確認後に`503 BROWSER_EGRESS_NOT_VERIFIED`で拒否する。
  - 現段階のWorkerへBrowser Run／Durable Object bindingや、環境変数だけで検証済み状態をtrueにする経路を追加しない。
  - repo-sideでは保存可能eventのallowlist正規化と、外部AIなしの決定的な日本語draft step生成を先行する。
  - 入力値、未知field、Cookie、Authorization、機密target labelを正規化eventとdraftへ複製しない。navigation URLはpathにも秘密値が埋め込まれ得るため、origin／path／query／fragmentを含むURL全体を保存しない。
- Reason:
  - #57の実Browser E2E完了条件を勝手に緩めず、SSRF P0境界を維持したまま独立検証できる操作記録コアを進めるため。
- Boundary:
  - #84をmergeしても#57はcloseしない。Browser Run実起動、Live View、Durable Object、DB永続化、R2、staging／production反映は後続とする。

## DEC-062: Browser Run session guardrailsをP0実証候補として隔離評価する

- Status: Proposed
- Date: 2026-08-19
- Decision:
  - Cloudflare公式APIの`guardrails.allowedDomains`はoutbound HTTP/S制限候補として隔離stagingで評価する。
  - 公式契約だけではWebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURN、DNS rebinding後のactual peer送信前拒否を保証したと扱わない。
  - Issue #86の全10経路が送信前拒否または起動時無効化を証明するまでOQ-006と製品側fail-closedを維持する。
- Reason:
  - hostname allowlistの存在と全通信のactual peer拘束は同義ではなく、未証明経路からのSSRFをP0として防ぐため。
- Boundary:
  - PR CIではBrowser Runを起動しない。live実証は隔離staging、明示確認、専用token、合成fixtureだけで行い、production・実顧客サイトへ接続しない。

## DEC-063: RLS用immutable previewをAccessで保護する

- Status: Accepted
- Date: 2026-08-30
- Decision:
  - Cloudflare Git integrationのnon-production branch buildは無効のまま維持する。
  - Cloudflare Git integrationのproduction branchは `main`、deploy commandは `npx wrangler versions upload` とし、push時もactive deploymentへ自動promoteしない。
  - `wrangler.jsonc` は `preview_urls: true` を明示し、Phase 1 RLS Live Gateも同じimmutable version upload経路を使う。
  - preview wildcardはCloudflare Accessでdeny-by-default保護し、Cloudflare account membersと`staging` Environmentのpreview専用service tokenだけを許可する。
  - 未認証health拒否、Access付きhealthのstaging境界一致、同一originへのRLS E2Eを順に検証し、redirect、別origin、HTTP、資格情報欠落はfail closedにする。
  - preview URL、Worker version ID、外部ID、テストデータ識別子、資格値、個人情報をログ、artifact、summary、Issue、PR、文書へ記録しない。
  - production trafficとactive deploymentは変更せず、Issue #92のbackend分離negative proofとmain merge holdは継続する。
  - 上記main merge holdのうちIssue #92由来のblanket部分は後続DEC-064で失効し、Access deny-by-default等のその他保護は維持する。
- Reason:
  - 公開previewを閉じたままではimmutable versionを必要とする正式RLS gateが成立しないため、non-production branch自動buildを停止し、`main`は非promoteのversion upload、live gateはAccess保護された明示uploadに限定する。
- Boundary:
  - Access application/policy/service token、GitHub Environment/secretsの登録、live RLS実行、production deploy、Issue #92 closeはrepo-side変更に含めない。


## DEC-064: 認証・業務DBをCloudflare Access / D1へ統一する

- Status: Accepted
- Date: 2026-08-30
- Decision:
  - Cloudflare AccessのメールOTPを初期の招待制ログインにする。
  - WorkerはAccess application JWTの署名、issuer、audience、expiration、issued-at、token typeを検証し、not-beforeはclaimが存在する場合だけ検証する。`access_user` は `type: "app"`、trim後非空 `sub`、`common_name` 不在、`service_token` は `type: "app"`、空文字 `sub`、trim後非空 `common_name` の各3条件すべてを必須にし、曖昧なactorを全routeで拒否する。
  - Cloudflare D1を業務データとファイルメタデータの正本にする。
  - workspace membershipとowner/admin/editor/viewerはD1で管理し、Workerが全業務queryで再認可する。
  - private R2、Durable Objects、Browser Runは既存Cloudflare方針を維持する。
  - アプリ独自password、password hash、refresh tokenを保持しない。
  - ADR-0001/0004/0010に加え、ADR-0003/0011/0018/0019/0024/0025/0027のSupabase/Postgres/RLS固有部分をADR-0028でSupersededにし、各ADRのCloudflare・R2・domain分離・同意・fail-closed安全原則は維持する。
- Supersedes:
  - DEC-034のSupabase project分離と、現行Supabase projectを暫定dev/stagingとする部分。環境分離原則はAccess application／D1へ置換して維持する。
  - DEC-040のSupabase Auth session失効・session再取得に依存する方式と、DEC-042のrefresh token交換・専用refresh endpoint・login/logout/refreshを旧Web Lockで直列化してアプリがCookieを発行／削除する方式。
  - DEC-050の動的RLS検証を別gateとする部分。Issue #176のD1境界gateへ置換する。
  - DEC-051のSupabase／PostgREST応答としての上限契約。
  - DEC-052のmanual／revision／step writeをSECURITY DEFINER RPCへ集約する実装方式。
  - DEC-063のIssue #92由来blanket main merge holdだけを失効させる。Access deny-by-default、non-production build停止、version upload-only、fail closed、production非変更、秘密値非記録はPreservesとして維持する。
- Preserves:
  - DEC-034のstaging／production資源分離。
  - DEC-040／042のうち、検証済みsessionの認証世代が変わった後の古い応答を破棄し、旧shellと保護データを即時に隠し、状態変更を自動再送せず、401と上流障害を区別する安全原則。Access cookie／refresh tokenをアプリから操作しない。
  - DEC-050のstrict typecheck、bundle dry-run、production code mutation、実Chromium 4ロールE2E、外部環境の無承認変更禁止。
  - DEC-051／052の件数・byte・文字数・200 step上限、応答の有界化、部分更新防止、atomic write。D1での実現方式と検証はIssue #176 M4で確定する。
  - DEC-063のAccess deny-by-default、immutable non-promote upload、fail closed、秘密値非記録、production非変更。
  - DEC-063のAccess境界と現行Accepted Phase 1 RLS Live Gate。pre-M5では `.github/workflows/phase1-rls-live.yml` とrunbook `docs/08-operations/phase1-rls-live-gate.md` の `Status: Accepted` を維持し、現行gateはIssue #215の文書・checker整合PRとは別にownerが明示承認した場合だけ登録済みの既存staging/test入力で実行できる。Issue #215のPRではworkflow dispatchとlive証跡生成を行わず、新規project、test user、資格情報、Environment、Secretを作成・登録しない。future M5ではSafety記載の5操作を同一commit/rollback unit内で完了する。
- Current gate:
  - Issue #92は2026-08-30にcompleted closeされた。DEC-063に記録した#92由来のblanket main merge holdは履歴として保持するが、DEC-064により失効した。Access deny-by-default、non-production build停止、version upload-only、fail closed、production非変更、秘密値非記録の保護はPreservesとして継続する。
  - Issue #176 M5の実immutable preview negative proofが完了するまでは、staging合格、production資源作成・migration・deploy、外部招待を禁止する。これはIssue #92の再openやblanket holdの復活を意味しない。
- Reason:
  - runtime、認証、DB、Storage、preview保護のcontrol planeをCloudflare中心へ集約し、production資源作成前に環境分離と運用を単純化するため。
- Safety:
  - Access到達許可をworkspace認可と同一視しない。
  - Postgres RLS置換はWorker認可とworkspace固定D1 queryのnegative testをP0 gateにする。
  - 旧Supabase経路へのfallback、二重書込み、production変更、実データ移行、外部ユーザー招待をこの決定だけでは行わない。
  - 旧 `phase1-rls-live.yml` はpre-M5では現行Accepted live gateとして維持する。future M5 replacement PRでは、Issue #176 M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で、(1) replacement gateと対応docsの着地、(2) 旧 `.github/workflows/phase1-rls-live.yml` の削除、(3) runbookの `Status: Superseded` 化、(4) source-of-truth checkerとworkflow checkerのcanonical存在必須からcanonical/renamed旧identity再追加拒否への反転、(5) workflow本体、`scripts/check-workflows.mjs`、`scripts/check-cloudflare-source-of-truth.mjs`、`tests/cloudflare-access-fetch.test.mjs` の同一PR scope化を同時に完了する。着地後の別変更、M6への持越し、replacement未着地のまま先行退役を禁止する。
  - service tokenはmachine専用routeだけに限定し、D1 identity/workspace/roleへ昇格させない。
  - StripeとDiscordのexact callback pathだけをpath別Access Bypassへ分離する。hostname全体やwildcard pathへBypassを適用せず、Bypassを認証・認可の代替にしない。Workerはexact method/body上限、raw body署名・署名対象timestampの副作用なし検証、有界parse/schema・allowlist検証の後、provider ID、payload digest、receiptと再実行可能なwork/outboxを単一のatomic operationで保存する。guard commit成功後だけproviderへ成功応答し、保存済みoutboxからQueue、外部API、業務D1、entitlementその他の副作用へ進める。
  - 通常アプリAPIと`GET /health/config`はAccess保護を維持し、callbackをAccess user、service token、D1 identity、workspace membershipへ写像しない。
  - receipt/workは `received/processing/retryable/reconcile_required/completed/dead_letter` の状態機械で扱う。一時失敗・期限切れleaseは同じworkを再開し、結果不明は照合前に自動再送せず、completed再送は冪等success、同じID・異なるdigestは拒否とする。通常ブラウザwrite APIだけに同一Originを必須とし、callbackでは`Origin`を認証根拠にしない。M2ではcallbackを503・副作用0で無効化し、OQ-031をC1で解決する。store/coordinator選択、atomic receipt/work、schema/migration、dispatcher、並行再送・途中失敗・結果不明negative testは独立callbackマイルストーンC1で完了させる。完了までpath別Access Bypassを有効化しない。

- Evidence:
  - [ADR-0028](../03-architecture/adrs/ADR-0028-cloudflare-access-d1.md)
  - GitHub Issue #176
  - [Cloudflare移行ロードマップ](cloudflare-migration-roadmap.md)

## DEC-065: M1 Access identity verifierの依存とDI境界

- Status: Accepted
- Date: 2026-09-05
- Decision:
  - JWTの署名検証は`jose` v6.2.12をruntime依存としてexact pinする。RS256、設定済みissuer／audience、設定済みHTTPS JWKS、exp／iat／存在するnbf、typeを検証し、JWT内の`jku`等から鍵URLを選ばない。
  - `createAccessAuthenticator`が作る認証器内でJWKS resolverを再利用し、request間のuser dataをmodule-globalへ保存しない。
  - 検証後actorを`access_user | service_token`に固定し、issuer+subjectでのapplication identity lookupはuserだけに限定する。service tokenは明示allowlist health routeだけに許可し、identity lookupを0回にする。
  - 設定envの前後空白は既存の設定窓口と同様に除去するが、issuer／JWKS URLの末尾slash等のURL正規化は行わず、署名済みissuer／subjectは原文字列で扱う。
- Reason:
  - 暗号実装を自作せず、Workers対応の署名検証と鍵cacheを既存ライブラリへ委譲し、issuer／subjectをemailや未検証headerから分離するため。
- Boundary:
  - M1はDI spikeと検証可能なローカルfixtureに限定し、実HTTP path／UIの切替、D1 schema／migration、OTP／招待、production Access変更を含めない。

## DEC-066: 実装担当は独立タスク単位で運用しGitHubを引き継ぎ正本にする

- Status: Accepted
- Date: 2026-09-09
- Decision:
  - 親PMは`gpt-6-astra`（既定reasoning `high`）、作業担当は`gpt-5.6-luna`（既定reasoning `high`、ユーザーが明示的に変更した場合を除く）とする。task作成前に親・担当のmodel／reasoningを選択・記録し、作成後に実行設定を取得して確認する。プロンプト本文への記載だけで切替済みとは扱わない。各作業単位は新しい独立タスクとして作成し、担当はサブエージェントを使わず、次タスクを自己増殖させない。
  - 作業担当は限定範囲の実装・テスト・文書編集を行い、親は報告後にbranch／PR／head SHAと検証結果を実取得・照合する。必要な修正は新しい独立タスクへ指示し、親の直接修正はユーザー明示時に限る。
  - GitHubを別PCから復元できる作業正本とし、秘密値を除外した必要成果物を専用branchへcommit・pushしてremote SHAを確認する。未検証の途中作業はWIPとして保存し、通常はPR本文またはコメントとIssue #70の両方へrepo／branch／SHA／未完了／次マイルストーン／再現コマンドを記録する。PR未作成などの例外はIssue #70へ理由と作成条件を記録する。
- Reason:
  - 独立した作業単位と実取得による検証を分け、会話・端末・ローカルcheckoutに依存せず、安全に再開できるようにするため。
- Boundary:
  - 本判断は運用と引き継ぎの規則であり、製品コード、依存、deploy、merge、DB migrationの承認を追加しない。push失敗、未検証、設定未確認は完了扱いにしない。

## DEC-067: 商用リリース前後の開発操作承認を切り替える

- Status: Accepted
- Date: 2026-09-09
- Decision:
  - 商用リリース前は、Astra highの親PMが変更の正当性、依存順、必要な品質ゲートを実SHAで確認すれば、ユーザーへの都度確認なしに通常の作業継続、commit、push、Pull Request作成・更新、mergeを行ってよい。保護ブランチ、必須CI、review thread、その他の安全条件は迂回しない。
  - 商用リリース後は、push、Pull Request作成・更新、mergeなどの外部反映ごとにユーザーの事前承認を得る。承認待ちでは可逆的な差分・テストによる具体案の準備は可とするが、外部反映前に対象SHA／差分を提示し、未push成果物だけを残して終了しない。承認待ちが必要なら明示する。終了前push必須の規則は、作業開始前に得た具体的な承認範囲がある場合に限り適用する。
  - 商用リリースの実施時は、日時、リリース識別子、根拠をIssue #70へ記録して承認境界を切り替える。記録が不在または曖昧な場合は商用リリース状態を未確認とし、未リリースと決めつけた自動mergeを行わず、read-only確認と提案を先に行う。
  - 最初の商用公開そのもの、production反映、課金、secret変更、機密情報保存、破壊的操作などの既存の別承認境界は変更しない。古い一般的な「owner承認待ち」だけを理由に、商用リリース前の通常のpush、Pull Request作成・更新、mergeを停止しない。
- Reason:
  - 開発中の検証済み変更を不要な都度確認で滞留させず、商用公開後の変更権限をユーザー承認へ戻し、公開・課金・機密情報・破壊的操作の安全境界を維持するため。
- Boundary:
  - 本判断は開発操作の承認切替だけを対象とし、最初の商用公開、production反映、課金、機密情報保存、破壊的操作、既存の必須品質ゲート、branch protection、CI、review threadの扱いを変更しない。
- Supersedes (partial):
  - ADR-0016の2026-08-02時点の制約のうち、実装・mergeを親セッションの判断とユーザー承認に優先させる一般承認部分だけを更新する。本番deployに関する別承認境界は対象外とする。
  - DEC-021の2026-08-02時点の記録のうち、owner承認を通常の実装・PR・mergeの一般要件とする部分だけを更新する。Discordボタンからの直接merge禁止、GitHub checks・監査ログ・branch protectionを正本とする境界、その他の別承認境界は失効させない。

## DEC-068: Chrome拡張only・guest-first PLG MVPへ再編する

- Status: Accepted
- Date: 2026-09-12
- Decision:
  - MVPの操作記録はChrome Extension Manifest V3だけを使い、Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。
  - 初回利用者は認証前にPC／スマホ／タブレットのresponsive表示で操作を記録し、manual本文、screenshot、編集内容をローカルだけに保持する。guest contentをD1/R2へ書き込まない。
  - `保存 / 共有 / PDF出力` 等のoutput選択時に初めてsignup/loginを要求し、検証済みAccess `issuer + subject`を正本としてPersonal Workspaceをatomic・冪等にbootstrapする。guest draftをclaimした後、選択済みoutputへ復帰する。
  - Access credentialはChrome拡張へ渡さない。認証済み自社Web originだけを許可したhandoffを使い、claim成功確認前にlocal guest原本を削除しない。
  - 商品設計はFree / Pro / Teamを第一候補とし、Chrome拡張capture時間を利用者向け課金軸にしない。`single_export`はMVPでDeferred、旧3,300円／9,900円は再評価候補とする。
  - Product Eventは`docs/05-api/product-events.md`を唯一のpayload正本とし、入力値、URL本文、Cookie、Authorization、screenshot本文を送らない。
- Supersedes:
  - DEC-005の「Chrome拡張を第一方式にしない」決定と、DEC-032／DEC-061／DEC-062のBrowser Runを現行MVP runtime・release gateとして扱う部分。既存のSSRF、全通信egress、hard-expiry安全契約は将来再導入時のLegacy gateとして維持する。
  - DEC-008のworkspace所属をguest作成前の前提と解釈する部分。認証後の業務データをworkspaceへ固定する認可境界は維持する。
  - DEC-014／DEC-030／DEC-037およびADR-0023の固定価格・Browser Run時間・`single_export`初期offer部分。Stripe署名検証、Webhook正本、冪等性、結果不明照合の安全契約は維持する。
  - DEC-064のproduction商用MVPを招待済みhumanだけに限定し、unknown human bootstrapを常時無効にする部分。development／staging allowlist、Access JWT検証、issuer+subject正本、disabled／retired identity拒否、Worker/D1 deny-by-defaultは維持する。
- Reason:
  - アカウント作成前に利用者自身のChromeで手順書作成価値を体験できるようにし、不要なクラウドブラウザ原価と既存ログイン／VPN／IP制限との不整合をMVPから外すため。
- Evidence:
  - [ADR-0030](../03-architecture/adrs/ADR-0030-plg-mvp-product-delivery.md)
  - [ADR-0031](../03-architecture/adrs/ADR-0031-chrome-extension-first-capture.md)
  - [ADR-0032](../03-architecture/adrs/ADR-0032-value-first-guest-onboarding.md)
  - [ADR-0033](../03-architecture/adrs/ADR-0033-extension-first-pricing-simplification.md)

## DEC-069: Guest claim screenshotのMVP safety limitを固定する

- Status: Accepted
- Date: 2026-09-13
- Decision:
  - 認証済みWeb appからWorkerへのstaged screenshot uploadは1 asset = 1 bounded binary PUTとする。
  - `assetCount <= 100`、1 assetあたり10 MiB以下、claim合計100 MiB以下とし、`image/png`、`image/jpeg`、`image/webp`だけを許可する。
  - 上限超過は413、同じslotのdigest／size／fixed metadata不一致は409でfail closedにする。
- Reason:
  - JSON／base64や未上限streamによるメモリ・容量濫用を避け、通常の手順書screenshotをMVPで運べる保守的な上限を明示するため。
- Boundary:
  - pre-auth guest upload、extensionからの直接API/R2 upload、server-side multipart/chunk uploadは許可しない。実需要が上限を超えた場合だけ別設計で再評価する。

## DEC-070: Codex Review後の同一PR修正loopをGitHub Actionsへ限定する

- Status: Accepted
- Date: 2026-09-13
- Decision:
  - exact PR headへのCodex connector reviewを契機に、trusted unresolved P0／P1／P2だけをbounded promptへ入れ、同一PR branchを最大3 roundまで自動修正する。
  - Codex processへGitHub write credentialを渡さない。trusted runnerがtests、remote exact-head再照合、fast-forward push、thread返信／resolve、exact-head再Review要求を担当する。
  - clean review、duplicate review、fork／別repository、non-main base、許可外branch、stale headはno-opまたはfail closedとし、force push、main直接push、gate迂回を行わない。
- Reason:
  - Review返却後の人手による再開待ちを減らしつつ、任意コメントのprompt injection、credential漏洩、外部更新との競合、無限repair、review gateの形骸化を防ぐため。
- Boundary:
  - `github-actions[bot]` の `@codex review` commentがCodex integrationを起動するかは初回実runで確認する。起動しない場合は再Review要求を記録して停止し、review証跡を自動生成しない。本loopはmerge、deploy、migration適用、外部設定、billing、secret、Chrome Web Store公開を行わない。

## DEC-071: Chrome拡張captureの表示metadataと一時障害回復の契約を明確にする

- Status: Accepted
- Date: 2026-09-20
- 関係: click labelを固定semantic値へ戻す境界のうち、安全な短い操作名をguest下書きへ反映する範囲だけDEC-084で部分的にSuperseded。入力値・秘密値を保存しない境界は継続する。
- Decision:
  - click eventのlabelは固定semantic値へ正規化する。ただしDEC-084で定める安全な短い操作名の候補だけは、その決定で定める範囲に限りlocal event／draftの生成文へ反映する。placeholder、本文、入力欄の現在値は保存しない。
  - navigationのsession storageとrecovery journalが同時に失敗した場合は、同一session IDに限定した一時fallbackへ保持し、後続storage操作またはfinishでevent IDの重複排除を行って一度だけmergeする。service worker終了をまたぐメモリ状態のdurabilityは保証しない。
  - scrollは開始時の既存要素をseedし、動的に追加された未知要素は初回位置だけをseedして、その一回の方向イベントは生成しない。
- Reason:
  - 表示由来の個人情報をlocal draftへ持ち込まず、storageの一時障害でnavigationを失わず、未知scroll baselineを0と仮定した誤記録を避けるため。
- Boundary:
  - 入力値、秘密値、URL、ページ文字列はfallbackへ含めない。fallbackは現在の1セッション内に保持し、成功保存または終了で破棄する。本変更でイベント件数上限は新設せず、外部APIと追加依存は導入しない。worker終了後の完全durabilityは保証しない。

## DEC-072: Bootstrap Product Event envelopeをD1のoperation結果から決定する

- Status: Accepted
- Date: 2026-09-20
- Decision:
  - `signup_completed`の`event_id`は固定namespace、event type、既存application identity IDの長さ、application identity ID、bootstrap `operation_id`をlength-delimitedに連結した値とする。application identityはTEXTとして既存境界を維持し、operation IDのASCII allowlistと長さ区切りで連結の曖昧性を防ぐ。
  - `occurred_at`はbootstrap operationの`created_at`と同じserver-side authoritative timestampとし、D1 triggerでinsert/update時に一致を検証する。operationの`created_at`は後から変更できない。
- Reason:
  - event IDをactorの外部識別子やclient入力から生成せず、D1に確定保存したapplication identityとoperation結果から再送時も同じ値にする。DB trigger自身がenvelopeを再計算できるため、直接D1書込みでも別ID・別timestampを保存できない。
- Boundary:
  - 対象はS2 onboarding bootstrapの`onboarding_signup_events`だけであり、client-generated Product Eventの契約は変更しない。D1 migrationの追加・編集だけではremote環境への適用済みを意味しない。

## DEC-073: Bootstrap operationとsignup eventのtenant／append-only境界をD1で固定する

- Status: Accepted
- Date: 2026-09-20
- Decision:
  - `onboarding_bootstrap_operations`への保存は、application identityがworkspaceの`created_by`であり、workspaceがactiveなPersonal Workspaceで、同じidentityのactive owner membershipが存在する場合だけ許可する。独立したforeign keyだけではcross-tenant、standard workspace、owner不一致を防げないため、D1 triggerで拒否する。
  - operation結果と`onboarding_signup_events`はappend-onlyとし、削除を拒否する。signup eventのapplication／operation／workspaceは確定後に別bootstrap operationへ移動できない。
  - SQLiteの`INSERT OR REPLACE`がDELETE triggerの設定差で既存rowを置換できないよう、既存operation／event keyへのBEFORE INSERTを拒否する。Workerの同一operation再送は`WHERE NOT EXISTS`で挿入文を空振りさせ、既存結果を照合して返す。
- Reason:
  - bootstrapの確定結果を別tenantのworkspaceへ直接挿入・移動・削除して再送判定を変えられないようにし、`createdIdentity`とserver-generated eventのexactly-once結果を保持する。
- Boundary:
  - 対象はS2 onboarding bootstrapの2 tableとそれらが参照する既存identity／workspace／membershipの整合性だけである。既存のworkspace identity、workspace kind、owner保護triggerを再定義しない。remote D1へのmigration適用やproduction変更は含まない。

## DEC-078: C sliceのcloud manual保存DTOとasset再送境界を固定する

- Status: Accepted
- Date: 2026-09-22
- Decision:
  - guest claimのfinalizeと既存手順書編集は、手順の種類・見出し・本文・操作種別・対象・URL・asset参照を含むserver-side expanded DTOへ正規化する。既存手順書の更新は`PATCH /api/workspaces/{workspaceId}/manuals/{manualId}/draft`へ集約し、`expectedUpdatedAt`、全step配列、workspace／revision固定集合をD1 batchで照合して一度に保存する。409では入力中の値を破棄せず、GETで`contentVersion`を照合して再開する。
  - staged imageは1件ごとのbounded PUTとし、`X-Asset-Byte-Length`、実bodyのSHA-256、PNG/JPEG/WebP signatureを検証する。R2 keyは`{workspace_id}/manuals/{claim_intent_id}/{asset_id}.{ext}`の4要素に固定し、asset IDはclaim intentとslotから決定的に導出する。同じslotの再送は固定ID・key・5項目metadata・size・digestが一致した場合だけ同じ結果を返し、R2 PUT結果不明はhead照合なしに成功扱いしない。
  - C sliceのsessionはMANUAL_ASSETS bindingが存在する環境だけ`manuals.status: ready`とし、未設定環境は`migration`のままfail closedにする。`members.status: migration`、publish/archive/share/PDFの有効化は含めない。production D1/R2への適用や本番binding準備は含めない。
- Reason:
  - 個別step保存は途中成功後の再送で編集中の値を失うため、revision全体のCASへ集約する。R2とD1の不一致や並行PUTによるtenant越境・容量超過を固定metadata、D1制約、同一operation照合でfail closedにする。
- Boundary:
  - Claim用のassetSlotはfinalize中だけ許可し、D1保存後のAPI応答やR2 metadataへguest handoff ID、extension ID、URL本文、入力値、秘密値を含めない。共有、公開、削除、PDF、production操作は対象外とする。

### DEC-078-C: claim asset reservation before R2 PUT

- 状態: Accepted
- 日付: 2026-09-23
- claim assetはR2 PUT前にD1の`reserved`行をatomicに確保し、reserved/staged/completedを合計して100MiBを超えないようにする。PUT後は同じ固定asset ID、object key、digest、metadataを照合してstagedへ遷移する。結果不明時は予約を保持し、同じkeyの再送でreconcileする。遅延したPUTによる容量超過を避けるため、未確認の予約を自動削除しない。

### DEC-078-E: same-handoff operation identity and asset slot accounting

- Status: Accepted
- Date: 2026-09-23
- Decision:
  - Webの最初のcloud writeより前に`handoff.begin`を送り、拡張機能の`chrome.storage.local`を正本としてhandoffごとのcanonical `operationId`を排他的に確定する。同じhandoffを複数タブで開始しても、全タブは同じoperationを採用し、既存identityの再訪・期限後はread-onlyで扱う。
  - editorの保存開始は、同じextension originのdraft IDを名前にしたWeb Locks APIの排他lockを取得してから、既存handoffのlookup、handoff生成、metadata保存、登録画面タブ作成までを一つの区間で実行する。Web Locksを取得できない場合は副作用なしで停止する。
  - draft fingerprintは`updatedAt`を除く内容（id、タイトル、説明、手順、画像、mask）のSHA-256とし、同じ内容を再保存したeditor間でcanonical handoffを再利用する。削除CASのcanonical JSONと`updatedAt`比較は従来どおり保持し、実内容の編集は別fingerprintとして新handoffへ分離する。
  - 拡張機能の`handoff.asset.start`は同一handoff・slotを直列化し、並行digest完了でtransferの100MiB会計を二重計上しない。slot間のparallel chunksは維持する。
- Reason:
  - `sessionStorage`はタブごとに分離され、finalize lockだけではbootstrap、claim intent、asset PUT後の最大100MiB orphanを防げない。slot単位の会計競合も、同一slotのparallel startで既存値を同時に見失う。
- Boundary:
  - operationのserver idempotency、claim API／D1／R2の認可契約、TTL後のGET-only回収、変更draftのCASは変更しない。外部messageは既存schemaの`handoff.begin`を追加し、既存のsender／handoff／action検証を適用する。未確定の`finalize-pending`／`completion-pending`はTTL後・編集後も既存回収を優先し、`completed`は再利用しない。旧metadataは既存fingerprintを照合するread-only互換に留め、新形式へ自動移行しない。

### DEC-078-D: finalize完了後のTTL回収identity

- Status: Accepted
- Date: 2026-09-23
- Decision:
  - finalize POST直前に、拡張機能の`chrome.storage.local`へ同じhandoffの`operationId`、`claimIntentId`、draft fingerprintを`finalize-pending`として保存する。保存対象は結果回収identityだけで、期限後のprepare、asset upload、claim-intent作成、通常finalizeを許可しない。
  - Web reload・service worker restart・handoff URL再訪では、同じidentityを復元してclaim statusをGETする。`completed`だけを同じmanualIdの完了通知へ進め、`pending`、`expired`、未知結果を新規operationの作成で解消しない。編集画面は同じdraft fingerprintの未確定handoffを再利用する。
  - `handoff.recovery`は`status`、operation／intent／fingerprint、元の`expiresAt`、completed時のmanualIdを返すread-only照会とし、Webは元の期限を優先する。通信失敗・不正応答・未知statusは結果不明として同じ照会を再試行し、`RECOVERY_NOT_FOUND`でも期限切れoperationのidentityは再発行しない。
  - draft fingerprintのCASと同一manualId通知の冪等性を維持し、別operation／intent／fingerprintはfail closedにする。local原本は同じmanualIdの完了確認まで削除しない。
- Reason:
  - finalize処理と応答通知が15分TTLをまたぐと、保存済みmanualがあるのに拡張側の最初の完了通知が期限拒否され、再試行で重複handoffを作る危険がある。結果回収identityを先に永続化し、既存completed結果だけを期限後に回収することで、書込み権限を広げずにこの不整合を閉じる。
- Boundary:
  - D1/R2の新しい書込み経路、TTL延長、production反映、共有・公開・削除は含めない。`expired`または結果不明を未確認のまま新規claimとして再開しない。

### DEC-078-F: claim完了とlocal draft削除のCAS境界

- Status: Accepted
- Date: 2026-09-26
- Decision:
  - `handoff.completed`はclaimの完了identityを`completion-pending`へ先に`chrome.storage.local`へ保存し、local draft削除はその後のIndexedDB CASとして実行する。
  - 削除直前に`updatedAt`またはfingerprintが一致しない場合、または原本が既に存在しない場合は、draft削除を成功扱いにせず原本を保持したまま、確定済みclaimのmetadataを`completed`として耐久保存する。`completed`は同一manual／identityの再通知を冪等成功として扱い、編集画面は旧handoffを未確定として優先せず、同じdraft IDの新しいhandoffを開始できる。
  - `chrome.storage.local`またはIndexedDBの技術障害はdraft変更と分類せず、既存の未確定状態（`finalize-pending`または`completion-pending`）を維持して同じidentityで再試行する。TTL後のGET-only recoveryとidentity／manual一致検証は維持する。
- Reason:
  - 画像転送から完了通知までの編集でCASが不一致になった場合、確定済みclaimを`finalize-pending`へ残すと、編集画面が古いhandoffを再利用して新しいdraftを保存できない永久ループになる。完了の耐久保存と削除CASを分離して、確定済みclaimと新しい編集を両立させる。
- Boundary:
  - D1/R2 claim、manual内容、asset、TTL、共有・公開・削除APIの契約は変更しない。local draftの削除だけを確定済みclaimのCAS付き後処理として扱う。

## DEC-061: D1共有リンクはimmutable snapshotと短期grantで提供する

- Status: Accepted
- Date: 2026-09-26
- Decision:
  - 共有発行は明示確認、期限、passcodeを必須にし、draft revision/content versionをCAS照合した同一D1 batchで公開snapshotとshare linkを作る。draft編集は公開内容を変更しない。
  - token/grantは256 bit乱数のdigestだけ、passcodeはsalt付きPBKDF2-HMAC-SHA-256で保存する。匿名経路は `/s/` 配下に限定し、本文・assetごとにgrant、期限、失効、workspace、manual、発行者active membershipを再検証する。
- Reason:
  - 下書き漏洩、古いgrantの再利用、R2公開URLの失効迂回、複数タブの二重発行を同時に防ぐため。
- Boundary:
  - production binding、Access policy、remote migration、deploy、PDF、課金は対象外とする。

## DEC-079: 拡張編集画面はブランド状態表示と認証後handoffを正本にする

- Status: Accepted
- Date: 2026-09-27
- Decision:
  - 拡張編集画面は採用済みのロゴ・キャラクター、淡い水色・淡い緑、墨色の本文を使い、手順画像を中心に表示する。保存状態は編集中／保存中／保存済み／保存失敗を明示し、機密マスクの保存・共有継承を案内する。
  - 保存・共有のhandoffは本文・画像をmetadataへ入れず、Access認証と同一originの保存先準備が成功した場合だけclaimへ進む。handoff先は自社UIの準備中表示を先に描画し、認証前の本文・画像送信、Cloudflare Access迂回、管理URL公開、無期限待機、偽進捗を許可しない。
  - handoff fragmentでWebへ渡してよい値は、必須の`handoff`・`extensionId`・`launchId`と、選択した`action`、結果回収時だけの`operationId`・`claimIntentId`・`draftFingerprint`に限る。本文、画像、credential、共有tokenはfragmentと`handoff.page-ready` messageへ入れず、ログにも記録しない。認証後のclaim APIへの本文・asset転送は既存のclaim契約に従う。登録画面はinactive tabで準備し、launchごとのready recordをclaim metadataから分離して保存する。`handoff.page-ready`は固定origin、top-level frame、sender tab、launch、action、保存済みdraft fingerprintの存在・64桁hex形式、TTLを検証し、Web Lock内でpageReadyAtだけを記録し、現activeなeditorがrun／launch／tab／期限を再検証した後に一度だけ対象tabをactivateしてactivatedAtを保存する。tabs.update開始後のactivating中は取消・Esc・新しいhandoff開始を受け付けず、失敗時だけpreparedへ戻して再試行する。handoff作成時のdraft fingerprint照合とclaim本体のrequest fingerprint検証は別境界として扱う。自動activateは8秒の期限内だけ許可し、期限切れ・Accessログイン待ち・cancelはmanual表示へ切り替え、late readyでフォーカスを奪わない。
  - 認証失敗、結果不明、期限切れはlocal原本を保持し、正確な再試行または結果確認を案内する。既存draftの画像が欠ける場合は最後の画面で補完せず、再記録を案内する。
- Reason:
  - 画像中心の編集と保存・共有へのhandoffで、利用者が現在の状態と次の操作を判断できるようにし、認証境界と機密情報の保存契約を維持するため。
- Boundary:
  - capture側で操作ごとの画像IDを収集する実装、Workerの静的brand asset配信、cloud manual／share viewerの画面統合は各担当の変更で本決定を参照する。外部AI、Access設定、共有リンク自動発行、PDF/HTML出力は対象外。
## Capture cleanup補足（DEC-071）

- Status: Accepted
- Date: 2026-09-20
- `cancel_failed`をキャンセル意図と一時画像削除／window復元の再試行状態として扱い、service worker再起動後もfinishへ戻さず、session・journal・IDB cleanup完了後だけidleへ遷移する。

## DEC-080: capture event送信中の離脱警告を失敗確定時へ限定する

- Status: Accepted
- Date: 2026-09-27
- Decision:
  - 通常の`capture:event`送信中はbeforeunloadを阻止しない。送信失敗が判明して保存成功を確認できないeventと、retainで保持した未保存batchだけを離脱警告・再試行保護の対象にする。再送成功を確認するまで失敗保護を保持する。
  - event IDごとの送信世代を照合し、古いACKが新しい送信の失敗保護やtracked eventを解除しない。background側の画像処理を含む通常ACK遅延は失敗確定と混同しない。
  - サイト自身のbeforeunload登録は拡張側で変更せず、通常遷移で記録を失わないためにpagehideと既存のbackground ACK経路を維持する。
- Reason:
  - 非同期ACK待ちだけで全リンク遷移に「このサイトを離れますか？」を表示すると、通常操作の導線を阻害する。一方、保存失敗とretain中のbatchは離脱前に利用者へ再試行を促す必要があるため、確定した失敗だけを保護する。
- Boundary:
  - backgroundのcapture保存、画像上限、Worker／DB／Access契約、サイト自身の警告文言は変更しない。ブラウザが警告を無視した場合の永続化は保証しない。

### DEC-081: ローカル画像注釈と共有assetの焼き込み

- Status: Accepted
- Date: 2026-09-27
- Issue: #264
- Decision: 注釈はlocal draftに限定し、既存maskと共通rendererでPNGへ焼き込んでからclaimする。空の注釈は旧canonical形状を維持し、非空の正規化注釈だけをfingerprintへ含める。本文・画像・注釈はhandoff metadataへ保存しない。編集中の空文字は許可し、保存時に空の文字要素を削除する。プレビュー枠は固定比率で画像全体をcontain表示し、近傍からdecodeする。専用画像編集画面は元画像の解像度を使う。
- Evidence: `apps/extension/editor/image-editor.js`、`tests/extension-editor-browser.test.mjs`、ADR-0036。

### DEC-082: 記録保存後の表示障害からの復旧案内

- Status: Accepted
- Date: 2026-09-30
- Issue: #265 / PR #269
- Decision: `capture:finish`が`draftId`を返した保存成功後は、popup／sidepanelで終了操作の再試行を表示しない。`restorePending`があれば復元案内を優先し、編集画面を開けず下書き一覧に保存済み項目が確認できる場合だけ一覧から開く導線を表示する。一覧が空または取得できない二重障害では、存在しない下書きを案内せず、同じ画面を開き直して確認する復旧案内を表示する。sidepanelは一覧更新が失敗しても保存成功後の記録中操作を残さない。
- Evidence: `apps/extension/popup/popup.js`、`apps/extension/sidepanel/sidepanel.js`、`tests/extension-release-blockers.test.mjs`、`docs/05-api/api-contracts.md`。

### DEC-083: 共有停止の結果不明保持と同一リンク再試行

- Status: Accepted
- Date: 2026-09-30
- Issue: #271
- Decision: 共有停止の4xxはAPIの案内を表示する。5xx、通信切断は結果不明として共有リンクと`shareLinkId`を画面に保持し、画面を閉じずに同じリンクの停止を再試行する。結果不明を新しい共有リンク作成や別の識別子の停止で解消しない。
- Reason: 停止要求がサーバーへ到達したか、停止後の応答だけが失われたかを画面から判定できない場合に、リンクを失って再発行したり、利用者が停止済みリンクを使い続けたりする誤操作を防ぐため。
- Boundary: APIの権限判定、D1の停止処理、匿名viewerのgrant再検証、production反映、deploy、共有リンク公開は変更しない。

### DEC-084: Chrome拡張の短い操作名を限定的に下書きへ反映する

- Status: Accepted
- Date: 2026-10-01
- Decision:
  - 表示用captionは表示可能な原形を保持し、機密判定は用途別のprivacy viewで行う。メール判定用sourceでは、ECMAScriptの`\s`に含まれる`Cc`（TAB／LF／VT／FF／CR）を空白へ写像し、それ以外の`Cc`（C1 controlを含む）は除去する。`Cf`は除去し、メール候補の値照合ではUnicode combining mark（`U+034F`を含む）だけを除去する。電話番号・secret判定では`Cc`、`Cf`、Unicode combining markを除いた安全viewを使い、emailのUnicode字形は表示用captionへ反映する前に変更しない。
  - `Cc`除去の記述は電話番号・secret・URL等の値判定用privacy viewとメール判定用sourceの非layout controlを指す。メールlayout判定では`\s`相当の空白を保持し、`@`の両側が空白の通常caption（`保存 @ 次へ`）は保持する。一方、片側だけlayout空白で反対側がUnicode `L`／`N`／`M`のmailbox文字なら、改行・空白で分断されたメール候補として拒否する。
  - clickの対象がbutton、link、menuitem、またはinputのbutton／submit／reset／imageで、短い操作名を安全に取り出せる場合だけ、aria-label、関連label、title、対象要素自身の可視テキスト、input button／submit／resetのHTML `value`属性、input imageの`alt`属性を候補にする。inputのvalueはこのcaption境界に限って扱い、テキスト入力の現在値は読まない。
  - 候補は空白・制御文字を正規化し、40 Unicode code pointを上限とする。メールアドレス、URL、電話番号、郵便番号、token、password、カード情報などの高信頼な機密候補は固定semantic値へ戻す。
  - privacy viewのUnicode decimal digitは固定のzero一覧を持たず、Unicode `Nd`カテゴリの連続runを最大64 code pointだけ後方探索して10進値へ写像する。Unicode data上の隣接した数学用数字を含む10桁単位のrunを対象とし、boundを超える未知のrunはfail closedで固定semantic値へ戻す。メールのlayout補助判定とdomain組成はUnicode `L`／`N`／`M`カテゴリを扱い、`@`直前隣接と改行・空白後のdomainを検査する。メール候補の照合では`M`を除いてもlayout空白を保持し、`@`後の空白だけを値照合で詰める。privacy viewからはUnicode `Cc`を除去してC1 controlを挿入したsecretや電話番号の検出を分断させない。
  - selectの選択値、テキスト入力の現在値、placeholder、対象要素外の本文は取得しない。inputのvalueはbutton／submit／resetのcaption候補としてだけ扱う。buttonやlinkの短い日本語名でも氏名・住所を完全判定できないため、曖昧な候補は利用者が手順文を確認・修正できる前提とする。
  - 安全な候補はローカルeventとguest下書きの生成文にだけ反映し、既存のサーバー側capture APIのgeneric target契約、入力値非保存、外部AI API初期OFFを変更しない。
- Reason:
  - 「参照」のような操作名を手順へ反映し、利用者が記録結果を修正しやすくする一方、表示値・入力値・機密情報を無制限に下書きへ持ち込まないため。
- Boundary:
  - 一般的な氏名・住所の完全自動判定やスクリーンショット内の静的文字列置換は本決定の対象外とし、画像の自動ダミー置換は別の小さな作業単位で高信頼DOM候補だけを扱う。
  - 入力値・DOM本文・画像原本をログ、event、handoff metadata、D1/R2へ複製しない。住所・氏名の自由記述、画像OCR、共有・公開・保存先の認可は対象外。

- 2026-10-01 review補足: caption内に複数の`@`がある場合も各候補を順に検査し、先行する通常文の`@`で後続の改行・空白分断メール候補を隠さない。既存の40 code point上限と固定semantic fallbackを維持する。
- 2026-10-01 review補足: 固定semantic fallbackと、同じ文字列を持つ実caption（例: `メニュー`、`入力欄`）を下流で混同しないよう、拡張機能内のclick eventだけ任意の`labelSource: "caption"`を付与する。既存eventの未指定値はsemantic fallbackとして扱い、capture APIの汎用`対象`契約は変更しない。

### DEC-088: スクリーンショット内の高信頼DOM個人情報を一時ダミー表示へ置換する

- Status: Accepted
- Date: 2026-10-01
- Issue: #272
- Decision:
  - 既存の入力欄・canvas・iframe・shadow配下のopacity maskを維持し、追加の自動置換はメールアドレス・電話番号・郵便番号の明確な形式と、`氏名／名前／住所／電話／メール`の意味ラベルに対応する`dt/dd`・`th/td`の表示値に限定する。表示viewportと交差する候補overlayは1回のcaptureにつき64件までとし、既存の画像100件・手順200件のcapture上限とは別に、生成するoverlay数を固定する。
  - capture直前にviewport上の同じ位置へ固定ダミー値を描画する一時overlayを追加し、元DOMの文字列・入力値・イベント・ページ状態は変更しない。overlayの接続、対象要素とoverlayの幾何、document identityをcapture後に検証し、検証失敗や復元失敗は画像保存を成功扱いにしない。
  - open shadow root内の通常テキストも64件の候補上限で走査し、closed shadow rootは既存のhost全体maskで保護する。祖先`opacity: 0`、不透明描画を確認できない半透明・filter・blend・clip・maskは候補外またはfail closedとする。OCR、画像内文字、複雑なレイアウト、cross-origin iframe、外部AI、新しい権限は対象外とする。
- Reason: 実在の業務画面に含まれる代表的な連絡先や氏名を元ページの操作を壊さずcapture pixel上だけで置き換え、未検出を自動保護済みと誤認させないため。
- Boundary: 入力値・DOM本文・画像原本をログ、event、handoff metadata、D1/R2へ複製しない。住所・氏名の自由記述、画像OCR、共有・公開・保存先の認可は対象外。

### DEC-089: PII overlayの候補集合と描画境界をcapture直前まで検証する

- Status: Accepted
- Date: 2026-10-01
- Issue: #272 / PR #277
- Decision:
  - 初期候補が0件でもMutationObserverを登録し、paint後のcapture前とcapture後の両境界でopen shadow rootを含む候補集合を再走査する。初期snapshotにないshadow rootの出現、対象hostの除去、PII候補に関係する追加・除去・文字列・属性変更は、最終候補が空でもfail closedにする。同一mutation batchで追加・除去された可視text nodeがboundedなsplit PIIを形成する場合も、node除去後を含めてfail closedを維持する。observer callback時にrecord targetが空になっていても、追加・除去node自身から有限の可視候補を照合し、hidden本文は読まない。時計や無関係なclass変更など、保護候補に関係しないDOM変更は無効化しない。
  - composed treeの属性変更に伴う候補存在確認は最大4096 DOM nodeを別予算として走査し、走査が上限を超えた場合は候補の有無を確定せずfail closedにする。候補overlayの生成上限64件とは独立させ、PII候補を含まない64件超の子nodeに対する無関係なclass変更は許可する。65件目の候補、または4096 nodeを超える走査は画像を保存しない。
  - `aria-hidden`は視覚的な非表示とは扱わず、表示中の候補を保護する。祖先`opacity: 0`など実際に描画されない候補は対象外とする。
  - overlayは背景画像、`background-clip: text`、legacy `clip`、角丸、影を無効にした不透明な矩形として描画し、computed styleと対象範囲を検証する。clip解除後のpixelをcapture前後の両境界で確認できない場合は画像を保存しない。
  - 同一テキスト範囲が電話番号と郵便番号の形式に一致した場合は候補を重ねず、郵便番号として1回だけ置換する。
  - inline要素（空またはdisplay:contentsの可視inline要素を含む）で分割された表示上連続するtext nodeは同じrender boundary内に限り最大128 node・1024文字・256 text rangeの有限候補として連結する。block／br／非表示の境界は連結せず、CSSのwhite-spaceがnormal／nowrapでcollapseする空白・改行は照合用に1つの空白へ正規化して元のDOM offsetへRangeを戻す。pre-lineでは空白・タブをcollapseするが改行は保持し、pre／pre-wrapの改行は保持して連結しない。MutationObserverの一時候補も各text nodeのwhite-space規則を使って同じrender boundaryへ写像し、PIIの不確かな境界または継続が予算を超えた場合はfail closedとする。hidden nodeの本文は候補へ取り込まず、同じ表示位置に続く有限範囲の可視nodeがPIIの継続を示す場合だけfail closedにする。budget境界では次の可視nodeの`@`等の有限markerを併せて確認し、長い単一nodeの末尾からPIIが継続する場合も保存しない。PIIを含まないhidden/help/menu境界は内容を連結せず記録可能とし、単一text nodeの既存検出は維持する。
- Reason:
  - capture中のDOM追加、アクセシビリティ属性と視覚表示の混同、CSS paintによる部分露出、同一範囲の二重overlayで元の個人情報がpixelへ残る経路を閉じるため。
- Boundary:
  - 候補は高信頼なDOM文字列に限定し、OCR、画像内文字、cross-origin iframe、外部AI、新しい権限は対象外。元DOM、入力値、候補文字列はログ・event・handoff metadataへ保存しない。
MutationObserverの追加・除去nodeまたはcharacterDataのoldValue／変更後valueからsplit PIIを照合する有限予算へ到達して候補を確定できない場合は、未知の大規模mutationとしてcaptureをfail closedにする。有限値内のASCII local-part直後の`@`またはleading `@`直後のASCII domainを含む明らかなemail partial markerは、区切り文字・後続文字に関係なく出現時点で拒否し、孤立した日本語文中の`@`は記録可能とする。oldValueと変更後valueは別の有限履歴系列として扱い、これは静的な長文PII-free DOMの記録可否とは分離する。

numeric fragmentの履歴はcapture期間だけprivacy mutation state内に保持し、同じrendered parentで実際に隣接する可視nodeだけを連結する。変更後の可視valueはchildListとcharacterDataのrecord種別をまたいで同じ系列として照合し、oldValueは別系列に保つ。周囲の空白・句読点および有限の普通文はnumeric coreを含むnodeの判定境界としてだけ扱い、連結時の原文から無条件に除去しない。普通文を含むnodeもnumeric coreがある場合だけ候補へ加え、numeric separatorだけの可視nodeはhyphenまたは空白に限ってbounded sequenceの一部として保持し、それ以外の非numeric separatorでは連結を止める。capture中は同じparentの現在可視textも同じ128 node・1024文字の有限snapshotで確認し、初期から存在したprefixと後続追加の組み合わせを取りこぼさない。予算を超えた未知のmutationはfail closedとし、removeSensitiveMasksで履歴を解放する。

### DEC-086: 記録中サイドパネルの現在地表示と終了後の復旧境界

- Status: Accepted
- Date: 2026-10-01
- Issue: #272 / PR #273
- Decision: 記録中は現在の手順番号、操作内容、画像の記録状態を常に表示し、新しい手順が追加されたときは最新位置へ追従する。利用者が過去の手順を閲覧している場合はその位置を保ち、「最新の手順を見る」から明示的に追従へ戻す。記録終了に成功して編集画面を開けた場合だけサイドパネルを閉じる。編集画面を開けない、復元が必要、終了結果が不明、またはブラウザが閉鎖APIを提供しない場合は、記録確認と再試行のためサイドパネルを残す。
- Reason: 記録中の最新操作と画像保存の成否をスクロールせずに判断できるようにし、過去の手順を確認している利用者の閲覧位置を奪わないため。終了後の表示障害を保存成功や終了完了と混同させず、復旧導線を残すため。
- Boundary: 手順画像の取得・保存処理、local draftの構造、Cloudflare Access／D1／R2、production反映、サイドパネルを提供しないChromeバージョンのUI変更は対象外とする。閉鎖API非対応時は利用者へ不自然な成功表示をせず、表示中の記録確認を優先する。
- Evidence: `apps/extension/sidepanel/sidepanel.js`、`apps/extension/sidepanel/sidepanel.css`、`apps/extension/editor/editor.js`、`apps/extension/background/service-worker.js`、`tests/extension-sidepanel-browser.test.mjs`、`docs/05-api/api-contracts.md`。
- 2026-10-01 review補足: `tabs.create`の成功だけでは編集画面の表示完了とみなさず、editorの`draftStore.get`と初回render後に送る`editor:ready`をtrusted extension originのeditor pathと同じ`draftId`で照合する。取得・render失敗またはreadyタイムアウトでは保存済みlocal draftと記録確認のためサイドパネルを残す。現在地表示のsticky範囲は`liveSection`だけに限定せず、保存済み下書き一覧を含むshell全体とし、終了・一時停止・再開で変わる固定フッター高さはResizeObserverから追従処理へ渡す。

### DEC-087: 手順編集の画像追加と編集画面の操作配置

- Status: Accepted
- Date: 2026-10-01
- Issue: #272
- Decision: 手動追加した手順には、PNG、JPEG、WebP（1画像10MiB以下）の画像を選択して追加できる。追加前に形式とヘッダーの寸法を確認し、寸法を確認できないファイルはdecode前に拒否する。canvasへ再エンコードし、PNG・WebPでは透明度を保持する。PNGが上限を超える場合だけ白背景へ平坦化してJPEGへ再エンコードし、元ファイル名、EXIF、その他のファイルメタデータは下書きへ保存しない。画像の追加・差し替えに失敗した場合は既存の手順・画像・選択状態を保持し、再試行できる案内を表示する。
- Decision: 画像は縦横12,000px以下かつ4,000万画素以内、下書き全体で100件・合計100MiB以内に制限する。共有されている画像を差し替える場合は対象手順だけに新しい画像を割り当てる。画像の確認・保存中は処理中であることを表示し、制限超過や保存失敗は元の画像を残して再試行できる状態にする。
- Decision: 画像の差し替えが成功した場合は、差し替え対象の画像を開いていた編集dialogだけを閉じる。差し替え後の異なるbitmapへ、差し替え前dialogの注釈・黒塗りを保存しない。別画像の編集中dialogは保持する。差し替え失敗時は既存画像と編集状態を保持し、利用者が別のcontrolへ移動していなければ差し替え操作へフォーカスを戻す。
- Decision: 保存・共有の準備画面では、自動処理で隠せない情報が残る可能性を案内し、利用者が画像を確認して必要な箇所を黒塗りできる導線を表示する。個人情報の自動検出・置換そのものは別の決定で扱う。
- Decision: 編集画面はタイトル、説明、保存状態を上部にまとめ、手順一覧と内容を分ける。画像は元の縦横比を保って表示し、画像編集のツールと保存・キャンセルを固定した役割の領域へ配置する。注釈の保存形式、画像のclaim、handoff metadata、外部AI APIの契約は変更しない。
- Reason: 手順を追加した直後に利用者が任意の画像を迷わず添付でき、既存画像の機密情報をファイルメタデータごと持ち込まず、画像編集時も現在地と確定操作を見失わないようにするため。
- Boundary: 画像内の個人情報の自動検出・置換、記録中のスクロール、保存handoff、Worker、DB、Access、production反映はこの決定の対象外とする。
- 2026-10-01 UX補足: 画像編集dialogの読み込み中はキャンセル操作へフォーカスを置き、読み込み完了後の選択ツールへのフォーカス復帰は利用者が別操作へ移っていない場合だけ行う。クラウド編集では保存状態を保存操作の近くに表示し、未保存時は変更を反映するための保存を案内する。共有リンクの作成は引き続き明示操作と保存済み内容を前提にする。

### DEC-090: 画像中心の編集と記録画像の状態を一貫させる

- Status: Accepted
- Date: 2026-10-01
- Decision: 編集は選択した一手順を中央に表示し、左を移動、右を文脈に合う道具、上部を保存先・保存状態・共有に固定する。追加は選択直後、移動・削除・取り消し後も手順IDで位置を保持する。画像追加はdecode開始から端末への確定保存まで処理中とし、その途中の保存・共有から新しい画像を黙って省かない。
- Decision: 通常のinput/textarea/selectの値は実業務DOMへ代入せず、検証済みの一時描画層で架空値に置換する。枠・ラベル・checkbox/radioの状態は残す。秘密値は読まず固定の保護表示にする。不明な欄やcanvas/iframe/closed shadowは安全な保護と要確認を区別する。カスタム編集領域・変形した入力欄等の安全な置換を証明できなければfail closedとする。DEC-088/089の候補走査、mutation、capture前後検証は緩和しない。
- Decision: 同じ記録・同じDOM対象の架空値は有限の端末内対応で保ち、原文対応表を永続保存・送信しない。現段階はnavigationをまたぐentity対応や任意の氏名検出を保証しない。一般の画像内文字を自動変換済みとは表示しない。
- Decision: 500ms以内の次の撮影は即座に捨てず、上限内で予約する。対象document・event世代・DOM・入力・scrollが変わった場合は過去の手順へ現在の画像を付けず、理由を残す。終端状態を含む各step.imageStateを端末に保存し、未処理・失敗・安全な未対応保護・意図的画像なしを区別する。
- Decision: クリック対象の矩形はtop frameの可視geometryを検証できる場合だけ注釈として追加し、色を編集できる。説明は「【参照】をクリック」のように自然な日本語にする。
- Boundary: 外部AI、追加の拡張権限、実顧客データ、remote DB migration、公開・deployを追加しない。現段階のロゴ・テーマ設定は端末プレビューに限定し、workspace設定・保存済み画像編集・共有/PDFの整合は別の実装段階で契約と試験を揃えるまで完成扱いにしない。
- Verification: [100点の独立UIレビュー基準](../02-ux/manual-editor-review-rubric.md)。各評価者80点以上と必須安全条件を別々に満たす。未実行の実Chrome検証や実SSOをNode/static検査で代用しない。

### 2026-10-01: DEC-090の架空値対応をADR-0039で更新

同一DOMに限った対応から、同一記録・種類・正確な表示値の対応へ更新する。元値はisolated worldを出ず、HMACと割当はtrusted session内だけに保持する。navigationを跨ぐ表示値の一致であり、同姓同名の人物同一性は推定しない。原文・HMAC・秘密鍵は手順書、ログ、networkへ含めない。

### 2026-10-03: 0.1.9の明示画像保護と端末Office出力

- Status: Accepted
- Decision: ADR-0039と`recording-value-alias-contract`をSupersededとし、新規記録は撮影時に画像を加工せず端末へ保持する。入力値そのものは操作文・eventへ保存せず、置換と黒塗りは利用者が画像編集で明示適用する。手動maskは継続し、Office出力は最新のannotation・replacement・maskをflattenしたedited画像だけを使う。
- Boundary: Word／PowerPointはログインなしのlocal-only downloadとする。snapshot変更、画像decode、flatten、生成失敗は古い生成物や画像欠落を成功扱いにせず日本語で再試行を案内する。PDFはFR-014の認証・claim後output gate、公開OFF、共有cloud認証を維持する。
- Evidence: `apps/extension/editor/editor.js`、`apps/extension/editor/editor.html`、`apps/extension/sidepanel/sidepanel.html`、`tests/extension-office-wiring.test.mjs`、`tests/extension-office-export-browser.test.mjs`、`tests/cloud-office-export-browser.test.mjs`、`tests/office-export.test.mjs`、`docs/05-api/manual-local-office-export-api.md`。SSOなしChromeでのlocal downloadとfixtureへのcloud POSTなしを確認し、実Word／PowerPointアプリの読込・描画は未実行と記録する。

### 2026-10-03: Office出力を認証済みhandoff後に限定

- Status: Accepted
- Decision: ユーザーの明示回答により、Word／PowerPointも既存のoutput gateを通す。guestには作成・編集を許可し、形式選択時は `outputAction=office` と `officeFormat=docx|pptx` をhandoffへ固定して、ログイン・Personal Workspace claim後に同じ形式へ戻る。認証済みsessionでは再ログインを要求しない。Office completionは既存の `finalize-pending` の operation／claim intent／draft fingerprint／cloudRef、固定staging origin・continue path・top-level tab・launch recordを照合した通知だけを受理し、一度だけlocal snapshotから生成する。料金は既存plan契約の確認に限り、Stripe／paywallは追加しない。
- Supersedes: 2026-10-03のOffice local-only no-login境界（履歴として保持）。
- Boundary: 認証前のlocal draftとキャンセル復帰、共有リンク自動OFF、画像の明示置換・黒塗り、既存PDF認証境界を維持する。暗号proofや新DB／envは追加しない。
- Evidence: `apps/extension/editor/handoff.js`、`apps/extension/editor/editor.js`、`apps/extension/background/cloud-claim.js`、`apps/extension/background/service-worker.js`、`apps/worker/src/onboarding-assets.ts`、`tests/extension-cloud-claim.test.mjs`、`tests/extension-office-wiring.test.mjs`、`docs/05-api/manual-local-office-export-api.md`、`docs/05-api/guest-onboarding-and-claim-api.md`、`docs/09-delivery/open-questions.md`。

## DEC-098: 製品OAuthのtransaction cookieを並行開始ごとに分離する

- Status: Accepted
- Date: 2026-10-04
- Issue: #283 / PR #284
- Decision:
  - Google／ChatGPTの各startは、providerとboundedなstateのSHA-256から導出したtransaction固有のSecure・HttpOnly・SameSite=Lax cookie名へPKCE verifier／nonceをbindする。同じproviderの二つのpending startがあっても、callbackはstateに対応するcookieだけを読む。
  - callback／errorは、そのstateから導出できるtransaction cookieだけを消去する。形式不正・未知stateでは別pending transactionのcookieを消去せず、既存のstate hash、PKCE verifier／nonce hash、consume CAS、期限、provider token検証の境界を維持する。
  - product OAuth成功時は競合するlegacy Supabase access／refresh cookieを端末から消去する。Supabase remote logoutは追加せず、成功後のproduct logoutはD1 product sessionの失効とproduct cookieの消去を既存契約どおり行う。callback失敗ではlegacy cookieを消去しない。
- Reason: 固定provider cookieの上書きで別tabのpending loginを壊したり、先行callbackのerror cleanupで後続loginを壊したりする経路を閉じる。product logout後のreloadで旧legacy accountへ戻らない状態遷移を、provider remote状態に依存せず端末cookie境界で保証する。
- Boundary: D1 schema／migration、provider登録、remote Supabase／Google／ChatGPT logout、production secret binding、実provider SSOは変更しない。state／verifier／nonce／legacy credentialのraw valueはログやD1へ保存せず、文書にも記録しない。
- Evidence: `apps/worker/src/product-auth.ts`、`apps/worker/src/index.ts`、`tests/product-auth.test.mjs`、`docs/05-api/api-contracts.md`、`docs/04-data/d1-and-storage.md`、`docs/04-data/d1-workspace-schema.md`、`docs/03-architecture/adrs/ADR-0041-product-auth-and-administrator-access.md`。

## DEC-102: D1 member routeと製品ログインroot導線を現行契約へ同期する

- Status: Accepted
- Date: 2026-10-04
- Issue: #283 / PR #284
- Decision:
  - D1 application routeのmember一覧・追加・更新は、Access／product actor、workspace固定query、active membership、owner/admin mutation境界を同じD1 repositoryで検証し、旧Supabase member handlerへfallbackしない。`GET /api/session`の`members.status`は有効化後に`ready`を返す。
  - product／Access sessionにメールがないroot shellは「アカウント」と表示し、手順書リンクをcanonical `/manuals`へ固定する。旧rootのSupabase作成入口を製品ログイン後の導線に残さず、手順書POST 405をUIから誘発しない。
  - provider passwordが無効な製品環境では、logout後もprovider-only loginを維持し、架空のメールやpassword formを表示しない。
- Reason: 実Google SSO後のrootでメール未設定表示とメンバー権限loadingが停止し、logout後にpassword formへ戻る不整合を、D1現行契約の状態・認可・canonical manual surfaceへ最小修正するため。
- Boundary: guest導線、manual新規作成API、外部staging設定、remote migration、実ユーザー操作データ、秘密値、production反映は変更しない。
- Evidence: `apps/worker/src/index.ts`、`apps/worker/src/app-assets.ts`、`tests/m3-http-d1.test.mjs`、`tests/app-auth.test.mjs`、`docs/05-api/cloudflare-access-d1-api.md`。

## DEC-104: Cloud Office画像はWorker CSP許可済みのdata URLでdecodeする

- Status: Accepted
- Date: 2026-10-04
- Issue: #283 / PR #284
- Decision: Cloud manualの画像取得は、既存のsame-origin asset fetchで得たBlobを`FileReader.readAsDataURL`でdata URLへ変換してから`Image.decode`へ渡す。Workerの`img-src 'self' data:`は維持し、`blob:`をCSPへ追加しない。Office生成は既存どおりブラウザ内で行い、asset URLへ秘密値を付加しない。
- Reason: 実Worker CSPではBlob URLが画像decodeで拒否される一方、CSPで許可済みのdata URLはdecodeできるため。data URL化は既存の画像importと同じFileReader経路で、認可・tenant境界・画像寸法・画像予算・編集済み画像のflattenを変更しない。
- Boundary: Office download helper、auth、asset保存、staging／production設定、native Officeアプリ描画はこの決定の対象外。IABのdownload event未取得は生成成功とは扱わず、CFTのdownload証跡と分離する。
- Evidence: `apps/worker/src/cloud-manual-assets.ts`、`tests/cloud-office-export-browser.test.mjs`

## DEC-103: D1 trigger加算を含むmanual保存の直接変更件数照合

- Status: Accepted
- Date: 2026-10-04
- Issue: #283 / PR #284
- Decision:
  - manual draft PATCH、claim finalize、既存manual更新claim、share snapshot作成のD1 batchでは、各DML直後に同じbatch内で`SELECT changes()`を実行し、その直接変更件数を期待値と照合する。
  - D1 `meta.changes`はtriggerによる副作用を含むため、CASの成否判定には使用しない。transaction、workspace／actor認可、再送時のcompleted receipt、途中失敗rollbackは既存契約を維持する。
- Reason: `manual_revision_sync_draft`などのtriggerがmanual rowを更新すると、remote D1の累積変更件数だけが増え、保存済みなのに409へ写像されるため。
- Boundary: migration、trigger定義、R2、Office出力、staging／production設定は変更しない。D1 batchの直接変更件数照合とそのSQLite回帰mockだけを更新する。
- Evidence: `apps/worker/src/infra/d1/d1-types.ts`、`apps/worker/src/infra/d1/cloud-manual-repository.ts`、`apps/worker/src/share-link-router.ts`、`tests/cloud-manual-c.test.mjs`、`tests/share-link-backend.test.mjs`。
