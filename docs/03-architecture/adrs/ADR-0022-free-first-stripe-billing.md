# ADR-0022: 課金機能を初期OFFにしStripe課金境界を固定する

Status: Accepted

## 文脈

料金体系を決定しても、未完成のWebhookやentitlement処理で誤課金・誤権限を起こしてはならない。Stripeの外部設定より先に、課金を無効な状態で安全に保つ境界を固定する。

料金、プラン、利用上限、Stripe Linkの正本は [ADR-0023](ADR-0023-pricing-and-stripe-link.md) と `docs/01-product/pricing-and-plans.md` とする。

## 決定

- `BILLING_FEATURE_ENABLED=false` を既定にする。
- falseの間はPayment Linkを表示せず、Stripe APIへ外部通信せず、Webhookによる権限変更も行わない。
- Stripe Product、Price、Payment Link、Webhook endpoint、Secretは実装とtest modeの承認前に作成・登録しない。
- Payment Linkは申込入口に限定し、課金状態とentitlementの正本は署名検証済みWebhookとする。
- Webhookはraw bodyで署名検証してから永続化し、`stripe_event_id` の一意制約で重複を拒否する。
- イベントの到着順を信用せず、対象payment、subscription、customerのStripe上の現在状態を使うreconciliation処理へ集約する。
- Stripe SDK型やstatusをドメインへ直接漏らさず、内部のoffer、purchase、subscription、entitlement状態へ変換する。
- 課金状態が不明な場合にデータ削除、追加請求、即時ロックを行わない。安全側の読み取り許可と管理者への案内を設計してから強制する。

## entitlementの基本状態

| 状態 | 利用 | 遷移元 |
|---|---|---|
| `active` | 購入済み機能または契約枠を利用可 | 署名検証とreconciliation成功後 |
| `grace` | 未払いまたは一時的同期失敗の猶予 | 有効なサブスクリプションから遷移 |
| `read_only` | 閲覧中心。新規作成・記録を制限 | 猶予終了後。具体条件はOQ-016 |
| `expired` | 期限付き権利が終了 | 都度払い再出力期間終了、契約終了 |
| `refunded` | 返金済みとして新規利用を停止 | 返金・chargebackの確認後 |

解約予約中は支払済み期間終了まで `active` を維持し、期間終了を示すWebhook処理後に無料状態へ戻す。返金はデータ削除と直結させず、返金対象と利用権を監査可能な処理へ分離する。

## 影響

- 課金機能を有効化するには、Webhook negative test、test mode E2E、都度払いのマニュアル境界テスト、利用上限テスト、運用Runbook、ユーザー承認が必要になる。
- testとliveのSecret、Price、Payment Linkを共有しない。
- productionのStripe live mode設定はstagingのtest mode合格後も自動化せず、別の明示承認を必須にする。
