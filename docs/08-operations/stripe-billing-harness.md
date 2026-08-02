# Stripe課金ハーネス

Status: Accepted

## 現在の状態

初期提供は無料です。`BILLING_FEATURE_ENABLED=false` を既定とし、Stripe API呼び出し、Payment Link表示、Webhook受信処理を有効化しません。Stripe商品、Price、Payment Link、Webhook endpoint、Secretはまだ作成・登録しません。

## 想定プラン

| 項目 | 候補 |
|---|---|
| Product | `めっちゃマニュアル Pro` |
| 価格 | 3,300 JPY / monthly / tax included |
| 申込 | Stripe Payment Links |
| entitlement確定 | 署名検証済みWebhook |

Stripe側では税込みとして扱う設定を確認してからtest modeへ作成します。文書上の価格だけでStripe設定済みとは扱いません。

## 環境変数

| 名前 | 扱い | 初期値・状態 |
|---|---|---|
| `STRIPE_SECRET_KEY` | server secret | 未登録 |
| `STRIPE_WEBHOOK_SECRET` | server secret | 未登録 |
| `STRIPE_PRICE_PRO_MONTHLY` | server config | 未登録 |
| `STRIPE_PAYMENT_LINK_PRO_MONTHLY` | server config | 未登録 |
| `BILLING_FEATURE_ENABLED` | server flag | `false` |

testとliveで値を共有しません。値をMarkdown、PR本文、ログ、クライアントbundleへ出しません。

## Webhook処理

1. raw bodyと `Stripe-Signature` を使い、上限サイズと時刻許容を含めて署名を検証する。
2. 署名検証前はJSON parse、監査payload保存、状態変更をしない。
3. `payment_events.stripe_event_id` の一意制約で重複を受理済みとして終了する。
4. event type、object ID、payload digest、受信時刻、処理結果だけを保存し、生payloadを長期保存しない。
5. イベント到着順を信用せず、subscription/customer単位のreconciliation jobへ渡す。
6. 状態遷移とentitlement更新を同一transactionまたは再実行可能な処理にまとめる。
7. 失敗は再試行可能にし、重複再送でも二重付与しない。

## 課金状態の扱い

| 事象 | 既定処理 |
|---|---|
| 有効化 | 署名検証とreconciliation成功後だけ `pro_active` |
| 未払い | 直ちに削除せず `pro_grace`。猶予期間は未決 |
| 解約予約 | 支払済み期間終了までProを維持 |
| 解約成立 | Webhook確認後に無料枠へ戻す。データは削除しない |
| 返金 | entitlementと分離して記録し、自動削除しない。全額返金時の権限は未決 |
| 順不同・遅延 | event時刻だけで上書きせず、対象objectの現在状態を照合 |
| 同期不能 | 読み取り不能や削除へ倒さず、管理者へ再同期状態を表示 |

## 席数

- 購入席数候補を `subscriptions.quantity` に保持する。
- 有効なworkspace member数と照合する。
- 超過時は新規招待を止める案を優先し、ownerを自動で締め出さない。
- 無料枠、招待中メンバー、停止中メンバー、超過時の既存editorの扱いは未決事項とする。

## テスト

- 不正署名、body改変、期限外署名、body上限超過を拒否する。
- 同じeventを複数回送ってもentitlementが一度だけ変わる。
- 作成、更新、削除eventを順不同・遅延で受けても最終状態が一致する。
- 他workspaceのcustomer/subscriptionを紐付けられない。
- `BILLING_FEATURE_ENABLED=false` ではStripe APIへの外部通信が0件になる。

## 外部設定と承認

test modeのProduct/Price/Payment Link/Webhook endpoint作成も外部リソース変更として承認後に行います。live mode、価格・税設定、production Secret、課金機能ONはそれぞれproduction承認ゲートを通します。

## 完了条件

- ADR-0007/0022、API、データ定義、環境変数台帳と矛盾しない。
- Webhook negative testと順不同・重複テストが実装可能な粒度になっている。
- 外部設定未作成、Secret未登録、`BILLING_FEATURE_ENABLED=false` を維持している。
