# Feature Flag台帳

Status: Proposed

| Flag | 既定値 | 所有者 | 目的 | 削除条件 |
|---|---|---|---|---|
| `capture.liveView.iframeEmbedding.enabled` | false | architecture | Live Viewアプリ内iframe表示検証 | P0検証で安全性確認 |
| `capture.browserRun.egressVerified.enabled` | false | security | 全通信を送信前peer検証済みegressへ拘束できるまでBrowser Run起動・navigateを拒否 | AC-023のstaging P0検証完了と明示承認 |
| `mobilePreview.multiDevice.enabled` | false | product | 複数端末同時表示 | Browser Run費用/UX検証完了 |
| `billing.enforcement.enabled` | false | billing | DB/管理画面で扱う論理状態。単独では設定せず、`BILLING_FEATURE_ENABLED=true`かつ課金readiness合格時だけ導出してtrueにする | Phase8完了 |
| `sessionRecording.debug.enabled` | false | operations | 障害解析用録画 | 保存/権限/同意設計完了 |

## ルール

- Feature flagは権限管理の代用にしない。
- 追加時に所有者、有効期限、削除条件を必須にする。
- 古いコード経路を永続保存しない。
- `BILLING_FEATURE_ENABLED` を課金導線の唯一の外部kill switchとする。falseは新規購入と新規制限強制を止めるが、既存課金objectの署名済みWebhookとreconciliationは止めない。
- 売上安定とowner明示承認が揃うまでAI用flagを登録しない。
