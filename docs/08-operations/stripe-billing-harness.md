# Stripe課金ハーネス

Status: Accepted

## 目的

初期無料の提供を変えず、将来のPro課金を安全に追加できるWebhook、状態遷移、運用ゲートを定義する。設計の正本は [ADR-0007](../03-architecture/adrs/ADR-0007-stripe-webhook-source-of-truth.md) と [ADR-0022](../03-architecture/adrs/ADR-0022-stripe-billing-harness.md) とする。

## 作るもの

- `BILLING_FEATURE_ENABLED=false` のfail-closedな機能flag
- `めっちゃマニュアル Pro`、月額3,300円（税込）を指す環境別Price/Payment Link identifierの受け口
- raw body署名検証を最初に行う `/v1/webhooks/stripe`
- event ID unique、処理状態、試行、受信/処理日時、payload digestを持つ冪等受信箱
- Stripe customer/subscriptionとworkspaceの対応、workspace単位entitlement、状態遷移表
- 重複、順不同、遅延、未知event、署名不正、workspace不一致のnegative test
- 再処理、照合、監査、障害時にflagをfalseへ戻すrunbook

席数はactive membershipを候補とするが、席数変更の請求タイミングや超過時挙動は未決であり、UI/APIを先行実装しない。未払い、解約、返金はADR-0022の状態方針に従い、データ削除や権限剥奪を暗黙実行しない。

## 必要な外部設定

| 設定 | test/staging | live/production |
|---|---|---|
| Product/Price/Payment Link | staging専用test mode | production専用live mode |
| Webhook endpoint/secret | staging Worker URL | production Worker URL |
| API secret | staging GitHub/Cloudflare secret | production GitHub Environment/Cloudflare secret |

identifierもtest/liveで共有しない。値はMarkdown、ログ、PRへ書かない。

## まだやらないことと承認

Stripe商品、Price、Payment Link、Webhook endpoint、secret登録は作成しない。Stripe APIを呼ばず、`BILLING_FEATURE_ENABLED` はfalseのままにする。外部オブジェクト作成/更新/削除、test購入、live mode操作、secret登録、課金導線公開、flag有効化は個別の明示承認が必要である。

## 完了条件

- 環境変数台帳、ADR、Webhook契約、環境対応表が一致する。
- flag false時にStripe APIと購入導線へ到達しないテストがある。
- 署名不正、重複、順不同、遅延、未知event、他workspace反映を拒否または安全に再処理できる。
- staging test modeで解約・未払い・返金・再送を検証し、P0/P1が0件になった後だけproduction承認へ進む。
