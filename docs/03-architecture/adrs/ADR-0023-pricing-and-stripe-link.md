# ADR-0023: 都度払い・パーソナル・チーム課金とStripe Linkを採用する

Status: Accepted

## 文脈

利用頻度が低い個人には月額契約だけでは導入障壁が高く、継続利用者と複数人チームには都度払いだけでは管理が煩雑になる。一方、原価は画像保存よりCloudflare Browser Runの実行時間、同時セッション、サポート工数の影響が大きい。

そのため、単発購入と2段階のサブスクリプションを用意し、Browser Run、R2保存容量、席数、同時実行数をentitlementで制御する。

## 決定

| offer code | ユーザー向け名称 | 税込価格 | 主な利用権 |
|---|---|---:|---|
| `single_export` | 都度払い（1マニュアル買い切り） | 550円 | 対象1マニュアルを購入日から30日間、PDF/HTML/Markdownで再出力可 |
| `personal_monthly` | パーソナル | 月額3,300円 | 1作成者、Browser Run月5時間、R2 5GB、同時記録1、エクスポート無制限 |
| `team_monthly` | チーム | 月額9,900円 | 5作成者、50viewer、Browser Run月20時間、R2 25GB、同時記録2、エクスポート無制限 |

- パーソナルもワークスペース所属を必須とし、有効メンバーは1人に限定する。
- チームのowner/admin/editorを作成者として数え、viewerは作成者席に含めない。
- 未契約作成枠は操作記録月60分、下書き2件、同時記録1とする。
- 上限超過による自動従量課金は行わない。新規利用を停止し、料金案内を表示する。
- 追加席、追加容量、年額、先行割引は初期提供に含めない。

## Stripe Checkout SessionsとLink

- entitlementを付与する購入では、再利用可能なPayment Link URLを返さない。サーバーが購入試行ごとにStripe Checkout Sessionを1件作成する。
- Checkout Sessionはサーバー設定のPriceだけを使い、30分で失効させる。StripeはCheckout Sessionを支払い試行ごとに新規作成することを推奨しており、Sessionの`expires_at`は作成後30分から24時間の範囲で指定できる。
- CheckoutでStripe Linkを利用可能にし、保存済み支払い情報による再決済を支援する。
- Linkを `めっちゃマニュアル` のログイン、本人確認、ワークスペース認可には使わない。
- サーバーがcheckout intentを作成し、推測不能なIDをCheckout Sessionの `client_reference_id` とmetadataへ渡す。
- checkout intentとStripe Checkout Session IDを1対1で固定する。Stripe APIにはintent IDから決定的に導出したidempotency keyを必ず渡し、タイムアウト・応答保存失敗・並行再送でもStripe上の同じSessionを返させる。
- アプリAPIも購入操作ごとの `Idempotency-Key` を必須にし、同じkey・同じrequestは保存済みintent/Sessionを返す。同じkey・異なるrequestは409にする。都度払いは同じworkspace/manual、subscriptionはofferをまたいで同じworkspaceに未期限切れintentを1件だけ許し、既存試行を返す。
- Session ID、PaymentIntent、Subscriptionのunique制約はWebhook二重付与の防御として併用するが、Stripe API呼び出し前の二重Session防止をunique制約だけに依存しない。
- Webhookでcheckout intent、Price、支払状態、workspace、必要な場合はmanualを照合してから権利を付与する。
- intent期限はWebhookの受信・処理時刻では判定しない。署名済み `checkout.session.completed` のevent時刻とStripe Sessionの完了状態から `stripe_completed_at` を一度だけ保存し、`stripe_completed_at <= expires_at` の正規決済は配信遅延後も受理する。期限後も未完了だったSessionだけを期限切れ扱いにする。
- Linkのメールアドレスとアプリのログインメールが一致するだけでは権利を付与しない。

## 都度払いの境界

- checkout intent作成時に `workspace_id` と `manual_id` を固定する。
- 決済後の権利は対象マニュアルへだけ付与し、別マニュアルへ移せない。
- 購入日から30日を再出力期限とする。期限後も手順書データは自動削除しない。
- 同じStripe event、PaymentIntent、checkout intentを再処理しても二重付与しない。
- 全額返金またはchargeback確認後は新しい再出力を止めるが、既にダウンロードされた成果物の遠隔削除は保証しない。

## サブスクリプションの境界

- パーソナルとチームのプラン判定はPrice IDをサーバー設定へ写像して行う。
- `subscriptions.quantity` だけを信頼せず、内部プランの席数上限と有効メンバー数を照合する。
- 解約予約中は支払済み期間終了まで利用可能とする。
- 未払い、返金、順不同、遅延はADR-0007とADR-0022のreconciliation方針に従う。
- `personal_monthly` は有効メンバーが1人のworkspaceだけCheckout Sessionを作成できる。ただしactive/grace/read_onlyのTeam契約が存在するworkspaceは人数に関係なく、契約置換とメンバー処理をOQ-027で決めるまで `PLAN_CHANGE_UNRESOLVED` としてStripe API呼び出し前に停止する。
- subscription用intentの作成時とWebhook reconciliation時の両方で、同じworkspaceのactive/grace/read_only subscriptionと、別subscription offerの未期限切れintentがないことを検査する。Webhookではreconciliation対象と同じ `stripe_subscription_id` を競合集合から除外し、別subscriptionだけを競合とする。競合時はentitlementを付与せず、後述の孤立subscription停止処理へ送る。
- DBへ照合可能なsubscriptionを保存できない、または期限切れ・別Session・競合契約で拒否したsubscription modeの決済は、初回請求の返金だけで終えない。Stripe subscriptionを冪等にcancelし、invoiceは状態別に処理する。`draft`は削除、`open`はvoid、`paid`は実際のPaymentIntent/Chargeをrefund queueへ一度だけ登録し、`void`/`uncollectible`は支払済みでないことを確認して終了する。cancelとinvoice処理がすべて確認できるまで運用アラートとreconciliationを継続し、権利なしの継続請求を残さない。

## 環境変数

- `STRIPE_PRICE_SINGLE_EXPORT`
- `STRIPE_PRICE_PERSONAL_MONTHLY`
- `STRIPE_PRICE_TEAM_MONTHLY`

Secret、Price、Webhook endpointはまだ作成・登録しない。`BILLING_FEATURE_ENABLED=false` を維持する。

## 却下した案

- 月額3,300円の単一Proプランだけにする案: 単発利用者と複数人チームの双方に適合しにくいため不採用。
- エクスポートするたびに550円を請求する案: 軽微な修正後の再出力で不満が出やすいため、1マニュアル30日間の再出力権にする。
- Stripe Linkの利用者情報だけで権利を付与する案: アプリの認証・workspace境界と一致する保証がないため不採用。
- 利用上限超過を自動従量課金する案: 誤計測時の誤課金リスクがあるため初期提供では不採用。

## 影響

- 課金実装にはmanual scopeのentitlement、checkout intent、利用量集計、3つのPrice設定とCheckout Session作成処理が必要になる。
- 旧 `STRIPE_PRICE_PRO_MONTHLY`、`STRIPE_PAYMENT_LINK_PRO_MONTHLY`、3プラン用の固定Payment Link IDは新規実装で使用しない。

## 参考

- Stripe公式: `https://docs.stripe.com/api/checkout/sessions`（支払い試行ごとに新しいSessionを作成）
- Stripe公式: `https://docs.stripe.com/api/checkout/sessions/create`（`expires_at`は作成後30分から24時間）
- 料金・上限を変更する場合は `docs/01-product/pricing-and-plans.md` と関連するデータ、API、テスト文書を同時更新する。
