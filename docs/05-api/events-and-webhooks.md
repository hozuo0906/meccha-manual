# イベントとWebhook

Status: Proposed

## 内部イベント

| イベント | 発行者 | 用途 |
|---|---|---|
| `manual.created` | API Worker | 監査、通知 |
| `manual.published` | API Worker | 共有、分析リセット |
| `capture.started` | Durable Object | 監査、利用量 |
| `capture.event_recorded` | Durable Object | 下書き生成 |
| `capture.completed` | Durable Object | 下書き生成、通知 |
| `share_link.created` | API Worker | 監査 |
| `share_link.revoked` | API Worker | キャッシュ無効化 |
| `manual.view_started` | Share Worker | 分析 |
| `manual.view_completed` | Share Worker | 分析 |
| `billing.checkout_intent_created` | API Worker | 購入意図の監査、有効期限管理 |
| `billing.purchase_confirmed` | Webhook Worker | 都度払いのmanual entitlement付与 |
| `billing.subscription_reconciled` | Webhook Worker | パーソナル/チームのworkspace entitlement反映 |
| `billing.entitlement_changed` | Billing service | プラン・購入権反映 |
| `billing.usage_limit_reached` | Usage service | 自動課金せず新規利用停止と通知 |

## Stripe webhook

- raw bodyで署名検証する。
- `stripe_event_id` をuniqueにする。
- 重複、遅延、順不同を前提にする。
- Payment Linkの `client_reference_id` は推測不能なcheckout intent IDにする。
- 課金確定はWebhookのみ。画面リダイレクトは補助表示。
- 署名検証前に状態変更やpayload永続化を行わない。
- eventはpayment/subscription/customer単位のreconciliationへ渡し、到着順だけでentitlementを上書きしない。
- `BILLING_FEATURE_ENABLED=false` の間は課金導線とStripe外部通信を無効にする。

## 都度払いの照合

- checkout intentが未期限切れ、未消費であることを確認する。
- Stripe上のPriceを `single_export` の環境別Price IDと照合する。
- checkout intentに保存したworkspaceとmanualを使用し、Webhook payloadのメールアドレスから対象を決めない。
- 支払い成功後、対象manualへ30日間のexport entitlementを一度だけ付与する。
- 同じevent、PaymentIntent、checkout intentの再送で有効期限を不正に延長しない。
- 全額返金またはchargeback確認後はentitlementを `refunded` にするが、manualやR2 objectを自動削除しない。

## サブスクリプションの照合

- Price IDを `personal_monthly` または `team_monthly` へサーバー側で写像する。
- subscription/customerが同じworkspaceのbilling customerへ紐付くことを確認する。
- 解約予約中は支払済み期間終了まで `active` を維持する。
- 未払いは即時削除へ進めず `grace` とし、猶予条件はOQ-016に従う。

## Stripe Link

Stripe LinkはCheckout上の入力支援に限定する。Linkの認証済みメール、電話番号、保存済み支払い情報を、アプリのユーザーID、workspace所属、role、manual権限の根拠にしない。
