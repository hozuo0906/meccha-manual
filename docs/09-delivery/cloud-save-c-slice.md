# Cクラウド保存スライス

Status: Proposed

## 範囲

owner限定stagingで、拡張機能のlocal draftを認証済みWeb経由で同じPersonal Workspaceへ保存し、保存後に一覧・詳細表示とdraft編集を行う。共有、PDF、production反映、remote migration、deployは含めない。

## 固定契約

- 配布manifestは`0.1.2`。`externally_connectable.matches`はstaging Web originだけを許可し、production・preview・localhostへ接続しない。
- handoffは`handoff`、extension ID、TTL、選択actionを持つmetadataだけをWebへ渡す。Webはfragmentを読み取り後に除去し、guest本文・焼込画像は認証後のclaim APIへ送り、Access credentialは拡張機能へ渡さない。
- 外部messageは`meccha-manual/cloud-claim-v1` schemaの許可済みtypeだけを受け付け、sender origin、handoff、action、TTL、asset slot、chunk sequenceを再検証する。不正入力は副作用0で拒否する。
- claim APIは同一operationで`POST /api/onboarding/claim-intents`、slotごとの`PUT /api/onboarding/claim-intents/{claimIntentId}/assets/{assetSlot}`、`POST /api/onboarding/claims/{claimIntentId}`を実行する。retry identityは`claimIntentId + operationId + asset slot`で固定する。
- マスク処理後の画像は`OffscreenCanvas`／`createImageBitmap`でPNGへcanonicalizeし、192KiB bounded chunkへ分割する。許可形式はPNG、JPEG、WebP、1asset 10MiB、claim合計100MiB、100assetを上限とする。raw data URLは送信しない。
- draftはcanonical JSONからSHA-256 fingerprintを計算する。handoff時の`updatedAt`とfingerprintを保存し、送信直前に再計算して変更があれば停止する。成功確認前にlocal原本を削除しない。
- `/manuals`はAccess user、active identity、active personal workspace、active owner membershipをすべて満たす場合だけ表示する。service token、disabled identity、suspended workspace、inactive membershipは403とする。
- claim intent、asset取得・再送、reserve、staged遷移、finalize、status照会は、毎回active identity・workspace・owner membershipを再検証する。owner喪失後のupload、status、finalize再送はfail closedにする。
- R2 put前にD1のclaim/asset記録を予約し、R2とD1を単一transactionとはみなさない。結果不明時は同じ固定key、digest、size、metadataでstatusを再照合し、mismatchは上書きせず409で停止する。
- draft編集はtitle、description、全stepsを一括snapshotとして`expectedUpdatedAt`とCAS更新する。競合時は409を返し、編集中の入力値を失わせない。詳細stepの`assetUrl`はbackendの許可済みshapeに合わせる。

## 受入条件

- staging以外のorigin、未知message、handoff不一致、期限切れ、chunk順序飛び、上限超過、credentialを含むmessageを拒否し、local draftに副作用がない。
- mask焼き込み後のPNG bytesにraw screenshotが残らず、guest本文・画像・対象URL・秘密値をWebの保存領域、URL、ログへ保存しない。拡張機能のlocal draft原本はclaim成功確認まで保持する。
- response loss、cancel、retry、changed draftでは原本を保持し、同じoperation／fingerprintで結果を照合する。別manual、別asset、別object keyを作らない。
- Webで一覧→詳細→編集再保存ができ、version競合時にフォーム入力を保持する。
- owner membershipを無効化した後のclaim status、asset upload、finalize再送が拒否され、別workspaceのresource ID差し替えも拒否される。

## 実装境界と検証

frontendは`apps/extension`、`apps/worker/src/cloud-manual-assets.ts`、cloud manual UIとbrowser workflowを担当する。Workerのroute、D1 repository、R2 staged asset境界、migration、wrangler staging bindingを同じC契約へ接続する。`/manuals`とstatic asset routeは`index.ts`から接続し、Access D1 mode以外では公開しない。

対象検証はcloud manual C API、cloud manual UI browser、extension cloud claim unit/runtime、onboarding browser、worker runtime、runtime mutation、typecheck、encoding、diff checkとする。Windows固有のbrand checkerと`wrangler.cmd` EINVALはLinux CIで再確認し、未実行を成功扱いにしない。

## 対象外

共有リンク、PDF、production Access／D1／R2、Browser Run実接続、D／E／Fスライスは別作業単位とする。remote migration／deployはC全体の承認済み親実行範囲だが、この担当の作業対象外であり、親が実施する。
