# ADR-0007: Stripe webhookを課金状態の正本にする

Status: Accepted

## 決定

課金状態とentitlementの確定は、署名検証済みStripe webhookのみを正本にする。Checkout Session後の画面リダイレクトは補助表示に限定する。

## 理由

画面リダイレクトは利用者操作や通信状況に依存し、信頼できる課金確定イベントではありません。Stripe webhookは重複、遅延、順不同を前提に冪等処理します。

## 影響

- webhook処理はexact POSTとbody上限、raw bodyの署名・署名対象timestampを副作用なしで検証してから有界parse/schema・provider固有allowlist検証を行う。
- `payment_events.stripe_event_id`、payload digest、receiptと再実行可能なreconciliation work/outboxを単一のatomic operationで保存する。guard commit後だけproviderへ2xxを返し、保存済みoutboxからdispatcherと副作用へ進める。
- receipt/workは `received/processing/retryable/reconcile_required/completed/dead_letter` で管理し、同じID・digestの再送は同じworkを再開・照合・冪等successとする。結果不明は照合前に自動再送しない。
- entitlement変更は一元化し、全副作用確認後だけcompletedにする。

M2ではStripe callback本体を有効化せず、exact POSTは `503 CALLBACK_MIGRATION_IN_PROGRESS` とする。上記の署名、receipt/work、reconciliation、結果不明照合の契約は削除せず、独立callbackマイルストーンC1で再開する。C1有効化前に元のrecovery試験全件と別リリース判断を完了する。
