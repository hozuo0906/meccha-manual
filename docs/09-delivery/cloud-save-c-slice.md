# Cクラウド保存スライス

Status: Proposed

## 範囲

この担当の実装範囲は、owner限定stagingで拡張機能のlocal draftを認証済みWeb経由で同じPersonal Workspaceへ保存し、保存後に一覧・詳細表示とdraft編集を行うことである。共有、PDF、production反映は含めない。remote migration／deployはこの担当では実施しないが、C全体では親PMが承認したstaging実行範囲として別途管理する。ここでの文書更新だけで適用済み・deploy済みとは扱わない。

## owner限定staging配布版（manifest `0.1.2`）の導入

この手順は、親PMが用意したmanifest `0.1.2`の配布候補ZIPを、既存のowner限定stagingへ導入して確認するための利用者向け手順である。ZIPを展開し、Chromeの拡張機能管理画面でデベロッパーモードを有効にして「パッケージ化されていない拡張機能を読み込む」から展開フォルダを選ぶ。拡張機能管理画面の操作は利用者本人が行う。自動ブラウザ操作で管理画面を開く手順にはしない。

1. 拡張機能のポップアップで「操作を記録」から表示モードを選び、「記録開始」を押す。記録を終えたら「記録を終了して編集」を押す。
2. 編集画面で必要なタイトル・説明・各手順を確認し、「保存して続ける」を押す。「この手順書を登録する」で「登録画面へ進む」を選ぶ。元のlocal draftは保存成功の確認まで保持する。
3. Webの「登録を続ける」画面で、既存ownerのメール認証を使ってstaging Access認証を完了し、「保存先を準備する」を押す。本文や認証情報を拡張機能から先に送る操作ではない。
4. 「手順書を保存しました。保存した手順書を開きます。」の表示後、「保存した手順書を開く」を押す。「保存した手順書」画面の「手順書一覧」で対象を選び、本文・画像を再表示する。
5. 一覧から対象を開き、タイトル・説明と全手順のタイトル・説明を編集する。必要に応じて「手順を追加」「上へ」「下へ」「この手順を削除」を使い、「変更を保存」を押す。再表示するときは「最新の内容を読み込む」を使い、保存後の一覧と全手順を確認する。

同じ配布物を更新する場合は、最初に読み込んだ同じ導入フォルダのファイルを置き換え、拡張機能管理画面で再読み込みする。拡張機能をアンインストールするとlocal storageと下書きを失う可能性があるため、更新確認のためにアンインストールしない。

この導入操作から実stagingで保存・一覧再表示・全step編集再保存までを通す確認は未実施である。isolated Chromium／実MV3 runtimeの回帰成功はこの利用者導入の証跡とは別であり、実Chrome導入の代替にしない。メールアドレス、token、実ID、実データはこの文書やログへ記録しない。実staging反映、migration／deploy、完了を示す最終SHAは未実施であり、確認時はIssue #70とPR #256のlive stateを参照する。

## 固定契約

- 配布manifestは`0.1.2`。`externally_connectable.matches`はstaging Web originだけを許可し、production・preview・localhostへ接続しない。
- handoffは`handoff`、extension ID、TTL、選択actionを持つmetadataだけをWebへ渡す。Webはfragmentを読み取り後に除去し、guest本文・焼込画像は認証後のclaim APIへ送り、Access credentialは拡張機能へ渡さない。
- 外部messageは`meccha-manual/cloud-claim-v1` schemaの許可済みtypeだけを受け付け、sender origin、handoff、action、TTL、asset slot、chunk sequenceを再検証する。不正入力は副作用0で拒否する。
- claim APIは同一operationで`POST /api/onboarding/claim-intents`、slotごとの`PUT /api/onboarding/claim-intents/{claimIntentId}/assets/{assetSlot}`、`POST /api/onboarding/claims/{claimIntentId}`を実行する。retry identityは`claimIntentId + operationId + asset slot`で固定する。
- 最初のbootstrap／claim-intent／asset PUTより前に、Webは外部message `handoff.begin`を拡張機能へ送り、`chrome.storage.local`でhandoffごとのoperation identityを排他的・耐久的に確定する。同じhandoffを複数タブで開始しても、全タブは返されたcanonical operationIdを使う。既存operationの再訪はread-onlyで元の`expiresAt`を返し、期限後にoperationを再発行しない。
- 拡張機能のasset slot開始はslot単位で直列化し、並行した同一slotのマスク変換・digest完了が100MiB transfer会計へ二重計上されないようにする。異なるslotのparallel chunks契約は維持する。
- マスク処理後の画像は`OffscreenCanvas`／`createImageBitmap`でPNGへcanonicalizeし、192KiB bounded chunkへ分割する。許可形式はPNG、JPEG、WebP、1asset 10MiB、claim合計100MiB、100assetを上限とする。raw data URLは送信しない。
- draftはcanonical JSONからSHA-256 fingerprintを計算する。handoff時の`updatedAt`とfingerprintを保存し、送信直前に再計算して変更があれば停止する。完了通知は`completion-pending`を先に耐久保存し、削除直前のCASで変更されたdraftや原本missingは削除せずにclaim metadataを`completed`として保存する。技術的なstorage failureは変更draftと扱わず、既存の未確定状態（`finalize-pending`または`completion-pending`）を維持して同じidentityで再試行する。通常のCAS成功時だけlocal原本を削除し、確定済みhandoffとは別の新しいhandoffを開始できる。
- `/manuals`はAccess user、active identity、active personal workspace、active owner membershipをすべて満たす場合だけ表示する。service token、disabled identity、suspended workspace、inactive membershipは403とする。
- claim intent、asset取得・再送、reserve、staged遷移、finalize、status照会は、毎回active identity・workspace・owner membershipを再検証する。owner喪失後のupload、status、finalize再送はfail closedにする。
- finalize POSTの直前に拡張機能のlocal durable metadataへ`operationId`、`claimIntentId`、draft fingerprintを`finalize-pending`として保存する。TTL後の回収は同じidentityのGET `completed`照会と同じmanualIdの完了通知だけに限定し、期限後のprepare／asset upload／新規claim intent／通常finalizeを許可しない。編集画面は同じdraft fingerprintの未確定handoffを再利用し、結果不明のまま重複handoffを作らない。
- `handoff.recovery`は`status`、同じ`operationId`／`claimIntentId`／draft fingerprint、元の`expiresAt`、completed時の`manualId`を返すread-only照会とする。Webは元の`expiresAt`を優先して期限を判定し、通信失敗・不正応答・未知statusでは新規bootstrapやclaim書込みへ進まず、`RECOVERY_NOT_FOUND`だけを元のoperationの通常flowへ戻る根拠にする。期限切れoperationのidentityは再発行しない。
- R2 put前にD1のclaim/asset記録を予約し、R2とD1を単一transactionとはみなさない。結果不明時は同じ固定key、digest、size、metadataでstatusを再照合し、mismatchは上書きせず409で停止する。
- draft編集はtitle、description、全stepsを一括snapshotとして`expectedUpdatedAt`とCAS更新する。競合時は409を返し、編集中の入力値を失わせない。詳細stepの`assetUrl`はbackendの許可済みshapeに合わせる。

## 受入条件

- staging以外のorigin、未知message、handoff不一致、期限切れ、chunk順序飛び、上限超過、credentialを含むmessageを拒否し、local draftに副作用がない。
- mask焼き込み後のPNG bytesにraw screenshotが残らず、guest本文・画像・対象URL・秘密値をWebの保存領域、URL、ログへ保存しない。拡張機能のlocal draft原本はclaim成功確認まで保持する。
- response loss、cancel、retry、changed draftでは原本を保持し、同じoperation／fingerprintで結果を照合する。claim完了後の削除CASが不一致になった場合も新しいdraftを削除せず、確定済みmetadataをdurableに`completed`として保存して次handoffを許可する。別manual、別asset、別object keyを作らない。metadata保存やIndexedDBの技術障害は編集済み扱いにせず、既存の未確定状態（`finalize-pending`または`completion-pending`）から再試行する。
- finalize完了後の応答喪失では、Web reload・service worker restart・TTL経過後も`handoff/operation/claimIntent/fingerprint`の一致を確認して同じmanualIdを回収する。`pending`、`expired`、`completed`、結果不明を区別し、`expired`／未知結果を新規書込みの成功とは扱わない。
- Webで一覧→詳細→編集再保存ができ、version競合時にフォーム入力を保持する。
- owner membershipを無効化した後のclaim status、asset upload、finalize再送が拒否され、別workspaceのresource ID差し替えも拒否される。

## 実装境界と検証

frontendは`apps/extension`、`apps/worker/src/cloud-manual-assets.ts`、cloud manual UIとbrowser workflowを担当する。Workerのroute、D1 repository、R2 staged asset境界、migration、wrangler staging bindingを同じC契約へ接続する。`/manuals`とstatic asset routeは`index.ts`から接続し、Access D1 mode以外では公開しない。

対象検証はcloud manual C API、cloud manual UI browser、extension cloud claim unit/runtime、onboarding browser、worker runtime、runtime mutation、typecheck、encoding、diff checkとする。Windows固有のbrand checkerと`wrangler.cmd` EINVALはLinux CIで再確認し、未実行を成功扱いにしない。

## 対象外

共有リンク、PDF、production Access／D1／R2、Browser Run実接続、D／E／Fスライスは別作業単位とする。remote migration／deployはC全体の承認済み親実行範囲として親が判断・実施するが、この担当の実装・導入確認には含めず、実施済みとは記録しない。
