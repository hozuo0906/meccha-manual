# イベントとWebhook

Status: Accepted

## MVP Product Event

Activation、TTFV、Capture Completion、Share、Second Manual、D7 Creator Retentionに使用するProduct Eventは [`product-events.md`](product-events.md) を唯一の正本とする。

Chrome拡張guest期間のmanual本文、screenshot、入力値、URL本文をanalytics目的でserverへ送らない。guest期間のprivacy-safe eventはローカル保持し、signup後に同じevent IDでflushしてよい。

## 業務・監査イベント

Product Eventとは別に、認証後の業務状態・監査・通知で使う内部イベントを扱う。

| イベント | 発行者 | 用途 |
|---|---|---|
| `manual.created` | API Worker | 監査、通知 |
| `manual.published` | API Worker | 共有、分析リセット |
| `share_link.created` | API Worker | 監査 |
| `share_link.revoked` | API Worker | キャッシュ無効化 |
| `manual.view_started` | Share Worker | 閲覧分析 |
| `manual.view_completed` | Share Worker | 閲覧分析 |
| `billing.checkout_intent_created` | API Worker | 購入意図の監査、有効期限管理 |
| `billing.purchase_confirmed` | Webhook Worker | 対応offerのentitlement付与 |
| `billing.subscription_reconciled` | Webhook Worker | Pro/Team相当subscriptionのworkspace entitlement反映 |
| `billing.entitlement_changed` | Billing service | plan・購入権反映 |
| `billing.usage_limit_reached` | Usage service | 自動課金せず新規利用停止と通知 |

## Chrome拡張capture

MVPのcapture eventはChrome拡張ローカルで正規化し、guest中はserver内部イベントとして発行しない。

認証後のguest claim完了時にmanual／assetの業務状態が作成される。Product KPI用の`capture_started`等は `product-events.md` に従い、業務イベントと混同しない。

## Browser Run legacy event

過去のBrowser Run設計では次の内部eventを想定していた。

- `capture.started`
- `capture.event_recorded`
- `capture.completed`

Browser Runが製品runtimeで無効な間、これらは現行MVPの必須eventではない。Browser Run再導入時は別ADRとともに復帰可否を決める。

## Stripe webhook

M2ではStripe callback本体を有効化せず、exact POSTは `503 CALLBACK_MIGRATION_IN_PROGRESS` とする。署名済みWebhookの受信、既存課金objectの永続化、reconciliation、返金・解約反映を行う契約はC1でcallback本体を再開した後に適用する。C1有効化前に元のatomic receipt/workとrecovery条件を再検証する。

- raw bodyで署名検証する。
- `stripe_event_id` をuniqueにする。
- 重複、遅延、順不同を前提にする。
- Checkout Sessionの `client_reference_id` は推測不能なcheckout intent IDにする。
- 課金確定はWebhookのみ。画面リダイレクトは補助表示。
- 署名検証前に状態変更やpayload永続化を行わない。
- eventはpayment/subscription/customer単位のreconciliationへ渡し、到着順だけでentitlementを上書きしない。
- `BILLING_FEATURE_ENABLED=false` の間は新しい課金導線とCheckout Session作成を無効にする。既存課金objectの安全なreconciliation等は既存契約を維持する。

## Deferred single_export契約

`single_export` はADR-0033により現行MVPではDeferredだが、過去契約の安全条件は履歴として保持する。

- checkout intentと1対1のCheckout Sessionを照合する。
- Stripe上のPriceを環境別Price IDと照合する。
- emailから対象workspace/manualを決めない。
- 同じevent、PaymentIntent、checkout intentの再送で権利を二重付与しない。
- 旧契約では購入日から30日間の再出力を想定していた。
- 返金またはchargebackでmanual/R2 objectを自動削除しない。

## サブスクリプションの照合

- Price IDを有効なsubscription offerへserver側で写像する。
- subscription/customerが同じworkspaceのbilling customerへ紐付くことを確認する。
- 解約予約中は支払済み期間終了までactiveを維持する。
- 未払いは即時削除へ進めずgrace等の安全状態を利用する。
- 競合契約、結果不明、返金、cancelを冪等にreconcileする。

## Stripe Link

Stripe LinkはCheckout上の入力支援に限定する。Linkの認証済みメール、電話番号、保存済み支払い情報を、アプリのユーザーID、workspace所属、role、manual権限の根拠にしない。
