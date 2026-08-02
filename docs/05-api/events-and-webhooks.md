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
- `BILLING_FEATURE_ENABLED=false` の間はendpointを課金反映に使用せず、Stripe APIも呼ばない。
- Stripe customer/subscriptionとworkspaceの対応をサーバー側で検証し、受信payloadのworkspace指定だけでentitlementを変更しない。
- eventの受信、署名検証、処理状態、試行回数、発生/受信/処理日時、payload digestを保持し、生payloadやsecretを通常ログへ残さない。
- event ID重複は再適用せず安全に成功応答し、古いeventで新しいsubscription状態を巻き戻さない。
- 未知eventはentitlementを変更せず記録し、再送に耐える応答と監視対象を定義する。
