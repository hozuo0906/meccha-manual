# Stripe課金ハーネス

Status: Accepted

## 現在の状態

`BILLING_FEATURE_ENABLED=false` を既定とし、新しいCheckout Session作成、購入導線、プラン制限強制を有効化しない。Stripe商品、Price、Webhook endpoint、Secretはまだ作成・登録しない。M2ではWebhook endpointも有効化せず、exact POSTは常時 `503 CALLBACK_MIGRATION_IN_PROGRESS` とする。署名済みWebhookと既存課金objectのreconciliationを継続する契約はC1でcallback本体を再開するときに適用し、C1完了までは外部課金設定を作成しない。

本書は将来のtest mode実装に必要な境界を固定するものであり、外部課金設定を実行する手順ではない。

## 採用プラン

| offer code | 商品候補 | 価格 | 利用枠 |
|---|---|---|---|
| `single_export` | めっちゃマニュアル 都度払い | 550 JPY / one manual / tax included | 対象1マニュアルを購入日から30日間、PDF/HTML/Markdownで再出力 |
| `personal_monthly` | めっちゃマニュアル パーソナル | 3,300 JPY / monthly / tax included | 1作成者、Browser Run月5時間、R2 5GB、同時記録1、エクスポート無制限 |
| `team_monthly` | めっちゃマニュアル チーム | 9,900 JPY / monthly / tax included | 5作成者、50viewer、Browser Run月20時間、R2 25GB、同時記録2、エクスポート無制限 |

未契約作成枠は操作記録月60分、下書き2件、同時記録1とする。上限超過による自動従量課金は行わない。

Stripe側では税込みとして扱う設定を確認してからtest modeへ作成する。文書上の価格だけでStripe設定済みとは扱わない。

## Stripe Checkout SessionsとLink

- 購入試行ごとにサーバーがCheckout Sessionを1件作り、30分で失効させる。固定のPayment Link URLをentitlement付与に使わない。
- Stripe LinkをCheckout上の高速決済手段として利用できるようにする。
- Linkのメールアドレス、電話番号、保存済み決済情報をアプリの認証、workspace所属、role判定に使わない。
- アプリ側でcheckout intentを作成し、推測不能なIDだけをCheckout Sessionの `client_reference_id` として渡す。
- APIの購入操作keyとStripe APIのintent由来idempotency keyを分けて保存し、応答消失・再送・並行実行でも同じintentとSessionを返す。
- checkout intentにはworkspace、offer、必要な場合はmanualをサーバー側で保存し、URLへPIIやmanual名を含めない。
- 決済完了画面は処理中表示に利用できるが、entitlement確定には使わない。

## 環境変数

| 名前 | 扱い | 初期値・状態 |
|---|---|---|
| `STRIPE_SECRET_KEY` | server secret | 未登録 |
| `STRIPE_WEBHOOK_SECRET` | server secret | 未登録 |
| `STRIPE_PRICE_SINGLE_EXPORT` | server config | 未登録 |
| `STRIPE_PRICE_PERSONAL_MONTHLY` | server config | 未登録 |
| `STRIPE_PRICE_TEAM_MONTHLY` | server config | 未登録 |
| `BILLING_FEATURE_ENABLED` | server flag | `false` |

testとliveで値を共有しない。値をMarkdown、PR本文、ログ、クライアントbundleへ出さない。旧 `STRIPE_PRICE_PRO_MONTHLY`、`STRIPE_PAYMENT_LINK_PRO_MONTHLY`、3プラン用の固定Payment Link IDは使用しない。

## checkout intent

1. ログイン中のユーザー、workspace、role、対象manualを検証する。
2. offer codeをallowlistで検証し、金額やPrice IDをクライアントから受け取らない。
3. `single_export` はmanualを必須、subscriptionはmanualを禁止する。
4. APIの `Idempotency-Key` hashとrequest hashを照合し、同一操作の未期限切れintentを再利用する。keyが同じでrequestが違う場合は409にする。
5. 推測不能なID、有効期限、未消費状態でcheckout intentを保存する。都度払いは同じworkspace/manual、subscriptionはofferをまたいで同じworkspaceに未期限切れintentを1件だけ許可する。
6. サーバー設定から対応Priceを選び、intent ID由来の決定的idempotency keyをStripe APIへ渡してCheckout Sessionを作成する。応答保存前に失敗しても同じkeyで同じSessionを再取得し、Session IDをuniqueで保存する。`client_reference_id`へintent IDだけを付加する。
7. Checkout Sessionとintentを30分で失効させ、Webhook成功後に一度だけ消費済みにする。
   期限判定は処理時の現在時刻ではなく、署名済みcompleted eventとStripe Sessionから保存した `stripe_completed_at` を使う。期限内完了後に遅延到着したWebhookは正規決済として処理する。
8. `personal_monthly` は有効メンバーが1人の場合だけ作成する。active/grace/read_onlyのTeam契約がある場合は人数に関係なく、OQ-027が決まるまで課金前に `PLAN_CHANGE_UNRESOLVED` で停止する。
9. subscriptionはCheckout Session作成時にもWebhook時にも同じworkspaceの競合契約・別subscription intentを検査する。Webhookの競合契約判定からreconciliation対象自身の `stripe_subscription_id` を除外する。PersonalとTeamの支払い可能Sessionを同時に残さない。

## Webhook処理

この処理契約はC1でcallback本体を再開した後に適用する。M2ではbody読取、署名検証、receipt/outbox、Stripe API、reconciliation、成功ackを行わず、503と副作用0を返す。C1有効化前に元の署名・receipt・recovery試験全件と別リリース判断を完了する。

1. exact POSTとbody上限を確認する。
2. raw bodyと `Stripe-Signature` を使い、署名対象timestampの時刻許容を含めて副作用なしで検証する。署名検証前はJSON parse、監査payload保存、状態変更をしない。
3. 有界parse/schema検証を行い、event ID、event type、object IDを取得する。
4. `stripe_event_id`、payload digest、receiptと再実行可能なreconciliation work/outboxを単一のatomic operationで保存し、`received` にする。生payloadを長期保存しない。
5. guard commit成功後だけStripeへ2xxを返す。保存失敗時は非2xxを返してprovider再送を可能にする。
6. 保存済みoutboxからdispatcherを起動し、Price IDを環境別server configへ照合してoffer codeを決定する。checkout intent、payment、subscription、customerを照合し、Linkのメールだけで対象を決めない。
7. receipt/workを `received`、lease付き`processing`、`retryable`、`reconcile_required`、`completed`、`dead_letter` で管理する。既知の一時失敗・期限切れleaseは同じworkを再開し、Stripe APIの結果不明はidempotency key/object再取得で照合するまで副作用を自動再送しない。
8. 同じ `stripe_event_id`・同じpayload digestの再送は新しいworkを作らず状態別に維持・再開・照合・冪等successとする。同じID・異なるdigestは拒否して監査する。
9. イベント到着順を信用せず、payment/subscription/customer単位のreconciliationへ集約する。状態遷移とentitlement更新はatomicまたは再実行可能にし、全副作用の確認後だけ `completed` にする。
10. retry上限到達は `dead_letter` として監査・運用アラート・明示再開対象にし、受理済みeventを黙って失わない。
11. flagがfalseでも既存課金objectの署名済みeventを受け付ける。未知・期限後まで未完了・別Session・消費済みintentへの支払いは放置せず、自動返金outboxと運用アラートへ一度だけ登録する。Webhook到着時点でintent期限を過ぎているだけでは返金対象にしない。
12. subscription modeで照合不能または競合した場合はentitlementを拒否し、subscriptionを冪等にcancelする。invoiceは `draft` を削除、`open` をvoid、`paid` の実PaymentIntent/Chargeだけをrefund outboxへ登録し、`void`/`uncollectible` は未払いを確認する。全処理の確認までreconciliationを再試行し、権利なしの継続請求を残さない。

## entitlement

| 種別 | scope | 付与条件 | 期限 |
|---|---|---|---|
| `single_export` | manual | 対象Priceの支払い成功、checkout intent照合成功 | 購入時刻から30日 |
| `personal_monthly` | workspace | 有効subscriptionのreconciliation成功 | current periodに従う |
| `team_monthly` | workspace | 有効subscriptionのreconciliation成功 | current periodに従う |

- 都度払いは対象manualだけに適用し、別manualへ移さない。
- パーソナルは有効メンバー1人、チームはowner/admin/editor合計5人とviewer 50人を上限候補とする。
- 席数超過時は新規招待と権限昇格を止め、ownerを自動で締め出さない。TeamからPersonalへの契約置換と既存メンバー処理はOQ-027が決まるまで自動化せず、active/grace/read_onlyのTeam契約中はPersonal購入を全面拒否する。
- Browser Run、R2、同時記録の上限はサーバー側entitlementと月次usage counterで判定する。
- 80%で警告、100%で新しい操作記録、保存、エクスポート生成を停止し、自動従量課金しない。生成済み成果物の期限内ダウンロードは継続する。

## 課金状態の扱い

| 事象 | 既定処理 |
|---|---|
| 有効化 | 署名検証とreconciliation成功後だけ `active` |
| 都度払い期限切れ | 新しいエクスポートを停止し `expired`。manualや画像は削除しない |
| 未払い | 直ちに削除せず `grace`。猶予期間はOQ-016 |
| 解約予約 | 支払済み期間終了までsubscriptionを維持 |
| 解約成立 | Webhookのreconciliation後にentitlementを `expired` へ移す。未契約作成枠は有料entitlement不在から導出し、データは削除しない |
| 返金 | entitlementと分離して記録し、自動削除しない。都度払いは新規再出力を停止 |
| chargeback | 監査対象として `refunded` 相当へ移し、手動確認導線を用意する |
| 順不同・遅延 | event時刻だけで上書きせず、対象objectの現在状態を照合 |
| 同期不能 | 読み取り不能や削除へ倒さず、管理者へ再同期状態を表示 |
| 上限超過 | 自動請求せず新規利用を停止し、料金案内を表示 |

## テスト

- 不正署名、body改変、期限外署名、body上限超過を拒否する。
- 同じevent、PaymentIntent、checkout intentを複数回送ってもentitlementが一度だけ変わる。
- `single_export` は購入対象manualだけを30日間再出力できる。
- 改変した `client_reference_id`、Price不一致、他workspace/manualを拒否する。
- 作成、更新、削除eventを順不同・遅延で受けても最終状態が一致する。
- Linkのメール一致だけではユーザー、workspace、manualを紐付けない。
- 3プランの席数、Browser Run、Storage、同時実行上限の境界値を検証する。
- 80%、100%到達時に追加請求がなく、期待する警告・停止になる。
- `BILLING_FEATURE_ENABLED=false` では新規Checkout Session作成が0件になる一方、既存課金objectの署名済みWebhook、解約、返金、reconciliationが継続する。
- 期限切れ・別Session・消費済みintentの支払いを二重付与せず、自動返金queueへ送る。
- PersonalとTeamの購入を並行開始してもsubscription用の支払い可能Sessionがworkspaceごとに1件だけになる。Webhook到着前後に競合契約が生じても二重entitlementを付与しない。
- 照合不能なsubscription mode決済では、cancel、invoice void/refundがそれぞれ冪等に完了し、再送後も権利なしの継続請求が残らない。
- R2 100%では新規エクスポート生成を拒否し、生成済み成果物のダウンロードだけを許可する。

## 外部設定と承認

test modeのProduct、Price、Link有効化、Webhook endpoint作成も外部リソース変更として承認後に行う。live mode、価格・税設定、production Secret、課金機能ONはそれぞれproduction承認ゲートを通す。

## 完了条件

- ADR-0007/0022/0023、料金プラン、API、データ定義、環境変数台帳と矛盾しない。
- Webhook negative test、順不同・重複、manual scope、利用上限テストが実装可能な粒度になっている。
- 外部設定未作成、Secret未登録、`BILLING_FEATURE_ENABLED=false` を維持している。
