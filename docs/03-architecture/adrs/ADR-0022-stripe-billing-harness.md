# ADR-0022: 無料初期提供とStripe課金境界

Status: Accepted

## 文脈

初期提供は無料とする一方、将来 `めっちゃマニュアル Pro` を月額3,300円（税込）で提供できるデータ境界が必要である。Payment Linkの完了redirectは改変や中断があり、課金確定の根拠にはできない。

## 決定

- `BILLING_FEATURE_ENABLED=false` を既定とし、falseの間は購入導線、Stripe API呼び出し、課金による機能制限を動作させない。
- 商品想定は `めっちゃマニュアル Pro`、`3,300 JPY / monthly / tax included` とするが、商品・Price・Payment Linkはまだ作らない。
- 署名検証済みWebhookを課金状態とentitlementの正本とする。raw bodyを加工前に `STRIPE_WEBHOOK_SECRET` で検証する。
- `stripe_event_id` のunique制約と処理結果を保持し、重複は成功済みとして安全に応答する。イベントの順不同・遅延を前提に、Stripe objectの発生時刻と既知versionを比較し、古いイベントで状態を巻き戻さない。
- Stripe customer/subscriptionとworkspaceをサーバー側対応表で結び、クライアント指定のworkspaceへ直接反映しない。
- entitlementはworkspace単位で一元更新する。席数はactiveなworkspace membershipを基準候補とするが、課金単位と超過時挙動は `OQ-009` の解決まで実装しない。

## 状態の扱い

| 事象 | entitlement方針 |
|---|---|
| 支払済み・有効 | Proを付与 |
| 支払失敗・未払い | 猶予期間を経て制限。期間は `OQ-014` |
| 期間末解約 | 支払済み期間末まで維持し、その後無料へ移行 |
| 即時解約 | 管理者の明示操作と監査を必須にし、通常フローにしない |
| 返金 | 返金だけで無条件剥奪せず、subscription状態と返金方針を再評価。確定規則は `OQ-014` |

権限変更、データ削除、手順書非公開化を課金状態の副作用として暗黙実行しない。未払い・解約後もデータexport/保持の決定が必要である。

## 必要なserver設定

`STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` はsecret、`STRIPE_PRICE_PRO_MONTHLY`、`STRIPE_PAYMENT_LINK_PRO_MONTHLY` は環境別identifier、`BILLING_FEATURE_ENABLED` はserver flagとする。test/live間で値を共有せず、クライアントへ公開しない。

## 影響

Webhook endpoint、課金テーブル、状態遷移、再処理runbook、RLS negative testを実装してstaging test modeで検証するまでflagをtrueにできない。Stripe live商品、Payment Link、Webhook endpoint、secret登録、課金開始は別の明示承認を必要とする。
