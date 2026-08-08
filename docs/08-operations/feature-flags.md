# Feature Flag台帳

Status: Proposed

| Flag | 既定値 | 所有者 | 目的 | 削除条件 |
|---|---|---|---|---|
| `ai.assistiveGeneration.enabled` | false | product | 将来AI手順文生成を有効化 | AI課金/監査/マスキングが完了 |
| `capture.liveView.iframeEmbedding.enabled` | false | architecture | Live Viewアプリ内iframe表示検証 | P0検証で安全性確認 |
| `capture.browserRun.egressVerified.enabled` | false | security | 全通信を送信前peer検証済みegressへ拘束できるまでBrowser Run起動・navigateを拒否 | AC-023のstaging P0検証完了と明示承認 |
| `mobilePreview.multiDevice.enabled` | false | product | 複数端末同時表示 | Browser Run費用/UX検証完了 |
| `billing.enforcement.enabled` | false | billing | 有料プラン制限の強制。サーバー境界は `BILLING_FEATURE_ENABLED=false` を優先 | Phase8完了 |
| `sessionRecording.debug.enabled` | false | operations | 障害解析用録画 | 保存/権限/同意設計完了 |

## ルール

- Feature flagは権限管理の代用にしない。
- 追加時に所有者、有効期限、削除条件を必須にする。
- 古いコード経路を永続保存しない。
