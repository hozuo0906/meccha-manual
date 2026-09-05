# ADR-0022: 課金機能を初期OFFにしStripe課金境界を固定する

Status: Accepted

## 文脈

料金体系を決定しても、未完成のWebhookやentitlement処理で誤課金・誤権限を起こしてはならない。Stripeの外部設定より先に、課金を無効な状態で安全に保つ境界を固定する。

料金、プラン、利用上限、Stripe Linkの正本は [ADR-0023](ADR-0023-pricing-and-stripe-link.md) と `docs/01-product/pricing-and-plans.md` とする。

## 決定

- `BILLING_FEATURE_ENABLED=false` を既定にする。このflagは新しいCheckout Session作成、購入導線、プラン制限の強制だけを停止する。
- 署名検証済みWebhookの受信、永続化、既存payment/subscription/refund/chargebackのreconciliationはflagに関係なく継続する。一度でも課金objectを作成した環境では、flagをfalseへ戻しても既存契約の後処理を停止しない。
- 課金objectが一度も存在しない初期環境ではStripe APIへ通信しない。既存課金objectがある環境でreconciliationにStripe API照会が必要な場合は、flagがfalseでも照会を許可し、失敗時はeventを再試行待ちへ残す。
- Stripe Product、Price、Webhook endpoint、Secretは実装とtest modeの承認前に作成・登録しない。
- Checkout Sessionは短命な申込入口に限定し、課金状態とentitlementの正本は署名検証済みWebhookとする。
- Webhookはexact POSTとbody上限、raw bodyの署名・署名対象timestampを副作用なしで検証してから有界parse/schema・provider固有allowlist検証を行い、`stripe_event_id`、payload digest、receiptと再実行可能なreconciliation work/outboxを単一のatomic operationで保存する。guard commit後だけproviderへ2xxを返し、保存済みoutboxからdispatcherと副作用へ進める。同じID・digestの再送は `received/processing/retryable/reconcile_required/completed/dead_letter` の状態に従って同じworkを再開・照合・冪等successとし、同じID・異なるdigestは拒否する。結果不明は照合前に副作用を自動再送しない。
- イベントの到着順を信用せず、対象payment、subscription、customerのStripe上の現在状態を使うreconciliation処理へ集約する。
- Stripe SDK型やstatusをドメインへ直接漏らさず、内部のoffer、purchase、subscription、entitlement状態へ変換する。
- 課金状態が不明な場合にデータ削除、追加請求、即時ロックを行わない。安全側の読み取り許可と管理者への案内を設計してから強制する。
- M2では上記の既存Webhook継続契約に先立ち、Stripe callback本体を一時無効化し、exact POSTへ `503 CALLBACK_MIGRATION_IN_PROGRESS` を返す。これはC1までの明示的な移行例外であり、C1有効化前に元のWebhook、reconciliation、結果不明、recovery試験全件と別リリース判断を完了する。

## entitlementの基本状態

| 状態 | 利用 | 遷移元 |
|---|---|---|
| `active` | 購入済み機能または契約枠を利用可 | 署名検証とreconciliation成功後 |
| `grace` | 未払いまたは一時的同期失敗の猶予 | 有効なサブスクリプションから遷移 |
| `read_only` | 閲覧中心。新規作成・記録を制限 | 猶予終了後。具体条件はOQ-016 |
| `expired` | 期限付き権利が終了 | 都度払い再出力期間終了、契約終了 |
| `refunded` | 返金済みとして新規利用を停止 | 返金・chargebackの確認後 |

解約予約中は支払済み期間終了まで `active` を維持し、期間終了を示すWebhookのreconciliation後にentitlementを `expired` へ遷移させる。未契約作成枠はentitlementへ `free` を保存せず、有効な有料entitlementが存在しないことからサーバー側で導出する。返金はデータ削除と直結させず、返金対象と利用権を監査可能な処理へ分離する。

## 影響

- 課金機能を有効化するには、Webhook negative test、test mode E2E、都度払いのマニュアル境界テスト、利用上限テスト、運用Runbook、ユーザー承認が必要になる。
- testとliveのSecret、Price、Webhook endpointを共有しない。
- productionのStripe live mode設定はstagingのtest mode合格後も自動化せず、別の明示承認を必須にする。
