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
| `billing.entitlement_changed` | Webhook Worker | プラン反映 |

## Stripe webhook

- raw bodyで署名検証する。
- `stripe_event_id` をuniqueにする。
- 重複、遅延、順不同を前提にする。
- Payment Linkの `client_reference_id` は推測不能なcheckout intentにする。
- 課金確定はWebhookのみ。画面リダイレクトは補助表示。
- 署名検証前に状態変更やpayload永続化を行わない。
- eventはsubscription/customer単位のreconciliationへ渡し、到着順だけでentitlementを上書きしない。
- `BILLING_FEATURE_ENABLED=false` の間は課金導線とStripe外部通信を無効にする。
