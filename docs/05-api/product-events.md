# MVP Product Event契約

Status: Accepted

## 目的

Activation、Time to First Value、Capture Completion、Share、Second Manual、D7 Creator Retentionを一貫した定義で測定する。

本書をMVP Product Eventの名称、発行条件、payloadの唯一の正本とし、他文書は本書を参照する。

## 原則

- Product Eventは監査ログ、課金event、業務データの正本にしない。
- 入力値、Cookie、Authorization、スクリーンショット本文、DOM本文、対象ページのURL/queryをpayloadへ入れない。
- アカウント作成前のguest contentはanalyticsのためにクラウドへ送らない。
- guest中のProduct Eventは拡張内に一時保持できる。signup完了後にprivacy-safeなeventだけをまとめて送信してよい。
- signupせず離脱したguestについて、内容取得や匿名uploadを追加してまで正確なファネルを作らない。LP / Chrome Web Store等の集計値と分離して扱う。
- server-side Product Eventだけで算出するguest-first funnel KPIは、最終的に認証へ到達しprivacy-safeなlocal eventをflushしたcreator cohortに限定する。signupせず離脱したguestを含む全体funnelは現MVPでは完全観測できない。
- client-generated eventは推測困難な `eventId` を持ち、再送で二重カウントしない。server-generated eventは後述の決定的IDを使う。
- timestampはclient発生時刻とserver受理時刻を区別する。

## 共通payload

clientからサーバーへ送るProduct Eventは次のfieldだけをallowlistする。

- `eventId`: clientで生成する推測困難なID。必須。
- `eventName`: 本書のallowlist値。必須。
- `occurredAt`: client側発生時刻。必須。
- `captureMode`: `pc | smartphone | tablet`。capture関連eventだけ省略可で付与する。
- `orientation`: `portrait | landscape`。smartphone/tablet capture関連eventだけ省略可で付与する。
- `errorCategory`: `capture_failed` だけで許可する固定enum。その他eventでは存在してはならない。
- `manualId`: 認証後かつmanualが存在するeventだけ。guest local draft IDを送らない。
- `workspaceId`: client request fieldとして受け付けず、認証後にserverが認可済みcontextから付与する。

email、display name、URL、ページtitle、DOM text、target text、raw error message、stack traceをProduct Event payloadへ入れない。

### Server-generated event envelope

`signup_completed`等をserverが業務operationから発行する場合、client-generated `eventId`や`occurredAt`を要求・受理しない。serverはevent typeを含む固定namespaceと既存のapplication identity ID、operation IDをlength-delimitedに連結した決定的な方法で`eventId`を生成し、同じbusiness operationのretryでは同一IDにする。`signup_completed`の形式は`meccha-manual:onboarding:v1:signup_completed:<application_id_length>:<application_id>:<operation_id>`とし、`operationId`のASCII allowlistと区切り文字によって連結の曖昧性を防ぐ。`occurredAt`はidentity作成を確定したserver-side authoritative timestampとする。

`signup_completed`はapplication identityを新規作成したatomic bootstrap operationだけが生成できる。clientから同名eventを直接自己申告できず、returning login、既存identityへのbootstrap再送、claim再試行では生成しない。event記録の一意制約または同等のidempotent writeで、response lossやretryによる二重eventを防ぐ。server-generated envelopeにも本書のprivacy allowlistを適用する。

D1の`onboarding_signup_events`は、operation identityがそのapplication identityのactive Personal Workspaceとactive owner membershipに一致し、`created_identity = 1`の同一bootstrap operationに紐づく場合だけ保存する。`event_id`と`occurred_at`がそのoperationから決まる値と一致する場合だけ保存し、eventの関連先変更、挿入置換、削除を拒否する。operationの`created_at`と結果行もimmutable／append-onlyとし、同じoperationの冪等再送は既存rowを挿入しないクエリで扱い、直接insertや既存eventのenvelope updateでこの条件を迂回できない。

## `capture_failed.errorCategory`

`capture_failed` では原因分析用に `errorCategory` を必須とし、次の値だけを許可する。

- `permission_denied`: 必要なChrome権限または対象タブアクセスを得られなかった。
- `restricted_page`: `chrome://`等、拡張が記録できないページだった。
- `injection_failed`: content scriptの注入・初期化に失敗した。
- `unsupported_page`: 対象DOM/iframe等の制約により安全に記録継続できなかった。
- `screenshot_failed`: screenshot取得に失敗した。
- `responsive_mode_failed`: smartphone/tablet viewport調整または復元に失敗した。
- `local_storage_failed`: guest local persistenceに失敗した。
- `connection_interrupted`: 拡張内部の必要なmessage channelが途中で切断した。
- `unknown`: 上記へ安全に分類できない。raw error本文は送らない。

client独自の文字列、HTTP error本文、URL、DOM情報をcategoryとして送らない。

## Event一覧

| event | 発行条件 |
|---|---|
| `onboarding_started` | LPから拡張導入または最初のmanual作成導線を開始した |
| `extension_install_started` | Chrome Web Store等の拡張導入導線を押した |
| `extension_installed` | アプリまたは拡張が導入済み状態を確認した |
| `capture_mode_selected` | PC / smartphone / tabletの表示モードを選んだ |
| `capture_started` | 対象タブで記録開始が成立した |
| `capture_failed` | 記録開始または記録中に継続不能になった。`errorCategory`必須 |
| `capture_completed` | 利用者が記録を終了し、保存可能なlocal captureが成立した |
| `draft_generated` | guest local draftまたは認証済みdraftの生成が完了した |
| `output_gate_opened` | guest利用者が保存・共有・PDF出力等の認証必須操作を選んだ |
| `signup_started` | output gateから新規アカウント作成を明示的に開始した（returning userのlogin開始では発火しない） |
| `signup_completed` | server-sideのatomic bootstrapでapplication identityが新規作成された場合だけ、serverが記録する |
| `guest_draft_claimed` | guest local draftのserver claimが完了した |
| `first_manual_completed` | その利用者の最初のmanualがserver側で完成扱いになった |
| `share_enabled` | manualの共有リンク発行が成功した |
| `shared_manual_viewed` | 有効な共有リンクが閲覧された |
| `second_manual_created` | 同じcreatorが2本目のmanualをserver側に作成した |
| `member_invite_started` | creatorがTeam拡張導線を開始した |
| `upgrade_started` | 有料planのCheckout導線を開始した |
| `upgrade_completed` | 署名検証済み課金状態により有料entitlementが有効になった |

## KPI定義

以下でserver-side集計可能とする値は、認証後にprivacy-safe eventをflushしたcreator cohortの診断値に限る。Full Guest Signup Conversion、Full Guest Activation Rate、Full Guest Output Gate Conversionはこの診断値から算出せず、LP／Chrome Web Store等のanonymous aggregateもapplication Product Eventとは別指標として扱う。

### Full Guest Signup Conversion

現行MVPのapplication Product Eventからは算出不可（NOT AVAILABLE）とする。認証前に`signup_started`を記録しても、認証前に離脱したguestはeventをserverへflushしないため、server-sideの`signup_started -> signup_completed`を全guestのSignup Conversionとして公開してはならない。

将来pre-authのprivacy-safe aggregationを導入する場合は、別のProduct／privacy判断を必須とし、本契約から匿名endpoint、pre-auth analytics identity、fingerprinting、pseudo-user identifierを追加しない。

### Observed Converted-Creator Signup Funnel

認証後にhistorical local eventをflushしたcreatorだけについて、`signup_started`とserver-generated `signup_completed`の対応を品質診断できる。このselection-biasedなpost-auth cohort diagnosticを全guestのSignup Conversionと呼ばない。returning userのlogin、client申告、bootstrap再送は従来どおり除外する。

### Full Guest Activation Rate

現行MVPのserver-side Product Eventからは算出不可（NOT AVAILABLE）とする。`output_gate_opened`後に認証を完了せず離脱したguestをserverが観測できないため、`output_gate_opened -> first_manual_completed`をProduct全体のGuest Activation Rateとして公開してはならない。

### Observed Converted-Creator Activation

認証後にeventをflushしたguest-origin creator cohortだけについて、`output_gate_opened`後に`first_manual_completed`へ到達した割合を診断できる。returning userや既存の認証済みcreatorを含めず、この値を全guestのActivation Rateと呼ばない。

### TTFV

Primary TTFVは `capture_started` から `draft_generated` までの時間を測る。guestがlocal draftを生成して編集可能になった時点をfirst valueとし、その後signupをキャンセルしてもvalue deliveredとして扱う。

server-side集計では、後に認証してlocal eventをflushしたcreator cohortについてoriginal `occurredAt`を使う。signupしなかったguestを完全観測できるとはみなさない。

`capture_started`から`first_manual_completed`までの時間はTTFVと混同せず、Time to First Saved Manualとして別集計する。

拡張インストールを含む初回全体時間は `onboarding_started` からの別指標として保持できる。

### Capture Completion Rate

認証後にeventをflushしたcreator cohort内で、`capture_started`に対する`capture_completed`を診断できる。認証前に離脱したguestが欠落するため、unbiasedなfull-guest Capture Completion Rateではない。

### Capture Failure Rate

認証後にeventをflushしたcreator cohort内で、`capture_started`とcapture開始試行に対する`capture_failed`を`errorCategory`別に診断できる。raw error本文を分析基盤へ入れず、unbiasedなfull-guest Capture Failure Rateとは呼ばない。

### Full Guest Output Gate Conversion

現行MVPのserver-side Product Eventからは算出不可（NOT AVAILABLE）とする。認証しなかったguestの`draft_generated`と`output_gate_opened`はserverへ届かないため、Product全体のconversionとして公開してはならない。

### Observed Converted-Creator Output Gate Funnel

認証後に両eventをflushしたcreator cohort内で、`draft_generated`に対する`output_gate_opened`を診断できる。この値を全guestのOutput Gate Conversionと呼ばない。

### Share Rate

`first_manual_completed` または対象manual完成に対する `share_enabled` の割合。

### Second Manual Rate

最初の `first_manual_completed` から7日以内に `second_manual_created` へ到達したcreator割合。

### D7 Creator Retention

初回manual完成後7日目を含む定義済みwindowで、再度manual作成行動を行ったcreator割合。集計windowはanalytics実装前に固定する。

## 保存と重複

- server受理eventは `eventId` で重複排除する。
- event順序だけで業務状態を変更しない。
- server-sideのmanual/share/billing状態と矛盾するeventを業務正本にしない。
- 認証後にguest期間eventをflushする場合、同じevent IDを維持して再送する。
- `workspaceId` はserver側で付与し、client申告値を信用しない。
- `signup_completed`の新規／既存判定はserver-side identity/bootstrap resultを正とし、returning user login、既存identityへのbootstrap再送、idempotent retry、既存Personal Workspace取得、claimだけの再試行では発行しない。client申告で判定せず、identity作成を確定したbootstrap operationと同じevent IDでexactly-onceに記録する。

## テスト

- allowlist外eventを拒否する。
- allowlist外fieldを拒否する。
- `capture_failed` で`errorCategory`欠落を拒否する。
- `capture_failed` のenum外`errorCategory`を拒否する。
- `capture_failed`以外に`errorCategory`があれば拒否する。
- forbidden payload fieldを拒否する。
- 同一event ID再送を二重集計しない。
- guest local data本文がProduct Event APIへ送られない。
- clientがworkspaceIdを送っても信用せず、認証済みcontextからserverが決定する。
