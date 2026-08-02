# ADR-0022: 無料開始とStripe課金境界を固定する

Status: Accepted

## 文脈

初期公開は無料で開始する一方、将来 `めっちゃマニュアル Pro` を追加できる構造が必要です。課金設定を先行すると、未完成のWebhookやentitlement処理で誤課金・誤権限を起こすため、外部設定より先にアプリ側の境界を固定します。

## 決定

- 初期プランは無料とし、`BILLING_FEATURE_ENABLED=false` を既定にする。
- 有料候補は `めっちゃマニュアル Pro`、月額3,300円、税込みとする。
- Stripe Price、Payment Link、Webhook endpoint、Secretはまだ作成・登録しない。
- Payment Linkは申込入口に限定し、課金状態とentitlementの正本は署名検証済みWebhookとする。
- Webhookはraw bodyで署名検証してから永続化し、`stripe_event_id` の一意制約で重複を拒否する。
- イベントの到着順を信用せず、対象subscription/customerの識別子とStripe上の現在状態を使うreconciliation処理へ集約する。
- Stripe SDK型やstatusをドメインへ直接漏らさず、内部のplan・entitlement状態へ変換する。
- 課金状態が不明な場合にデータ削除や即時ロックを行わない。安全側の読み取り許可と管理者への案内を設計してから強制する。

## entitlement状態

| 状態 | 利用 | 遷移元 |
|---|---|---|
| `free` | 無料枠 | 初期、Pro終了後 |
| `pro_active` | Pro枠 | 有効なsubscription確認後 |
| `pro_grace` | 猶予中のPro枠 | 未払い・一時的な同期失敗 |
| `read_only` | 閲覧・出力のみ | 猶予終了後。期間は未決 |

解約予約中は支払済み期間終了まで `pro_active` を維持し、期間終了を示すWebhook処理後に無料状態へ戻します。返金はデータ削除と直結させず、返金対象期間とentitlementの扱いを監査可能な処理へ分離します。

## 席数

- `subscriptions.quantity` は購入席数の候補とする。
- ワークスペースの有効メンバー数と比較し、超過時に新規招待を止める案を第一候補とする。
- ownerのアクセスを自動剥奪しない。
- 無料枠、席数の数え方、超過時の既存メンバー扱いは未決事項として分離する。

## 影響

- 課金機能を有効化するには、Webhook negative test、test mode E2E、運用Runbook、ユーザー承認が必要です。
- `STRIPE_SECRET_KEY`、`STRIPE_WEBHOOK_SECRET` はサーバーsecret、Price IDとPayment Link IDはサーバー設定として環境別に分離します。
- productionのStripe live mode設定はstagingのtest mode合格後も自動化せず、別の明示承認を必須にします。
