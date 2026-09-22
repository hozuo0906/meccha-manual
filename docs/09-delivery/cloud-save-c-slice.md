# Cクラウド保存スライス

Status: Proposed

## 範囲

owner限定stagingで、拡張機能のlocal draftを認証済みWeb経由で同じworkspaceへ保存し、保存後に一覧・再表示・title／description編集を行う。共有、PDF、production反映は含めない。

## 固定契約

- 拡張機能のmanifest versionは`0.1.2`。`externally_connectable.matches`は`https://meccha-manual-staging.meccha-iiyatsu.com/*`だけを許可する。
- editor発行fragmentは`handoff`と32文字の`a-p` extension IDを持つ。Webは読み取り後にfragmentを消去し、extension IDを含むmetadataだけをsessionStorageへ保存する。extension IDなしの旧handoffはcloud saveへ進めず、拡張機能更新後の再操作を案内する。
- Webの外部messageは`meccha-manual/cloud-claim-v1` schema、`handoff.prepare`、`handoff.asset.start`、`handoff.asset.chunk`、`handoff.completed`に限定する。sender URLのorigin、handoff、action、TTL、chunk sequenceを拡張側で再検証し、unknown schema／origin／message／期限切れ／不正sequenceは副作用0で拒否する。
- claim APIは同一operationで`POST /api/onboarding/claim-intents`、slotごとの`PUT /api/onboarding/claim-intents/{claimIntentId}/assets/{assetSlot}`、`POST /api/onboarding/claims/{claimIntentId}`を実行する。extension ID、handoff、Access credentialはAPIへ送らない。
- 画像は`OffscreenCanvas`と`createImageBitmap`でマスクを焼き込み、JPEGへ再エンコードしてからbounded chunkへ分割する。1asset 10MiB、合計100MiB、100assetを上限とし、1chunkは192KiBとする。raw data URLは送信しない。
- 同一operationの応答不明は同じintent／fingerprintで再試行し、別manualを作らない。claim成功確認前はlocal原本を削除しない。成功通知時もdraftの`updatedAt`がhandoff時点から変わっていれば削除を拒否する。
- `/manuals`はserver-authenticated workspaceを必須とし、一覧・詳細の表示値は`textContent`で扱う。draft title／descriptionの保存は`expectedUpdatedAt`を使い、409時は編集中の値を保持して競合を表示する。

## 受入条件

- staging以外のorigin、未知message、handoff不一致、期限切れ、chunk順序飛び、上限超過、credentialを含むmessageを拒否し、local draftに副作用がない。
- mask焼き込み後のbytesにraw screenshotが現れず、WebのlocalStorage／sessionStorage／URL／ログにguest本文・画像・対象URLを保存しない。
- local failure、cancel、response loss、retry、changed draftで原本を保持し、claim完成後だけ同じmanualIdの再送とcleanupを許可する。
- Webで一覧→再表示→編集再保存ができ、version競合時にフォーム入力を失わない。

## 実装境界

frontend担当は`apps/extension`、`apps/worker/src/onboarding-assets.ts`、`apps/worker/src/cloud-manual-assets.ts`と本書・UX／traceabilityを更新する。Worker route／D1／R2／migration／wranglerはbackend担当が接続する。`index.ts`へのasset route exportとDEC-078の最終記録は親統合で行う。
