# ADR-0007: Stripe webhookを課金状態の正本にする

Status: Accepted

## 決定

課金状態とentitlementの確定は、署名検証済みStripe webhookのみを正本にする。Checkout Session後の画面リダイレクトは補助表示に限定する。

## 理由

画面リダイレクトは利用者操作や通信状況に依存し、信頼できる課金確定イベントではありません。Stripe webhookは重複、遅延、順不同を前提に冪等処理します。

## 影響

- `payment_events.stripe_event_id` をuniqueにする。
- webhook処理はraw bodyで署名検証する。
- entitlement変更は一元化する。
