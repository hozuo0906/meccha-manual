# 統一編集器の画像・継続保存・チーム書式API

Status: Accepted

根拠: ADR-0038。Accessの検証済みapplication identity、同一Origin、D1のactive workspace membership、private R2の既存境界を維持する。新規の接続先・権限・AI APIは追加しない。

## 1. 編集画像の段階保存

`PUT /api/workspaces/{workspaceId}/manuals/{manualId}/draft/assets/{operationId}`

- owner/admin/editorのみ。operation IDは16〜128文字の英数字、`_`、`-`。
- headers: `Content-Type: image/png|image/jpeg|image/webp`、`Content-Length`、`X-Asset-Byte-Length`、`X-Asset-SHA256`、`X-Draft-Revision-Id`、`X-Draft-Updated-At`
- body: Canvasで再描画したraster。10MiB以下、1辺16,384px以下、4,000万画素以下。PNGはchunk CRCと終端、JPEG/WebPはcontainerと寸法を検証する。SVG、外部URL、アニメーション、EXIF/XMP/文字metadataは拒否する。
- 同じdraft版の編集画像予約は合計100MiB以下。別actor、manual、revisionへ予約を流用しない。
- 応答: `{status:"ready", assetId, assetUrl, revisionId, expectedUpdatedAt, sha256, byteLength}`
- upload成功だけでは現在の手順画像を変更しない。既存`PATCH .../draft`の`steps[].assetId`に返却IDを指定し、`expectedUpdatedAt`のCASで確定する。
- 未添付画像はuploadしたactorと期待版に限り初回添付できる。添付後の画像は対象manual内で既存の共同編集者が維持できる。別manual／tenantへの参照はWorkerとD1 triggerで拒否する。
- 再送は同じactor/workspace/manual/operationと固定したbyte数・形式・寸法・checksum・版を再照合する。違うpayloadは409。R2応答不明は503、予約を保持し同じ操作で再試行する。旧画像は失敗時も保持する。

### 編集できる注釈と不可逆な保護

- claim／draft PATCHの`steps[].annotations`は最大100件の正規化array。種類はtext/rectangle/ellipse/arrow、idは1〜128文字、色はstrict `#RRGGBB`（小文字へ正規化）、線幅1〜16。
- 矩形／楕円／文字はx/y/width/height、矢印はx1/y1/x2/y2の正規化座標。有限numberだけを許可し、範囲外や文字列への暗黙変換を拒否する。textは1〜500 codepoint、fontSizeは10〜96。
- annotation JSONは1手順64KiB以下、全step要求は80KiB以下。未知field、外部image／URL、CSS式、重複id、画像のない手順の非空注釈を拒否する。D1 triggerもshape/type/色/座標/件数を照合する。
- cloudへ送るbase画像には黒マスクだけを不可逆に焼き込み、編集用注釈はflattenしない。原画像や除去可能なmask metadataは送らず、`manual_steps.masking`は空のままにする。
- `manual_steps.annotation`に正規化JSONを保存し、manual詳細と共有contentは`annotations`として返す。旧`{}`は空array、旧flatten済み画像も空の編集用レイヤーとして扱う。旧clientが同じassetのannotationsを省略したPATCHでは既存の注釈を保持し、明示`[]`で除去する。
- 共有発行は安全なbase assetと注釈を同じ公開revisionへ複製する。あとでdraftの注釈や画像を変更しても共有版は変更しない。共有・印刷のrendererは返されたbaseと注釈を合成する。

## 2. 端末の同じ下書きを再保存

`POST /api/onboarding/claim-intents`は従来の`{operationId,assetCount}`に加え、任意の`target:{workspaceId,manualId,revisionId,expectedUpdatedAt}`を受け付ける。

- targetなし: 従来どおり認証済みPersonal Workspaceのownerだけが新規作成する。
- targetあり: active owner/admin/editorと、そのworkspace/manualの現行draft・期待版を照合する。targetは作成後不変。operationを別targetへ使い回さない。
- upload/finalize/statusのURLと操作IDは従来どおり。target付きfinalizeは新規manualを作らず、既存draftをCASで一括更新する。旧公開版は変更しない。
- finalize成功とcompleted照会は`cloudRef:{workspaceId,manualId,revisionId,updatedAt,contentVersion}`を返す。同一payloadの再送は確定済みの同じreceiptを返し、最新編集の版へ勝手に更新しない。
- `handoff.completed`はcloudRefを受け取り、`savedFingerprint`を付与してIndexedDBの下書きと`chrome.storage.local`の独立receiptに保存する。下書きの本文・画像・注釈・選択・更新時刻は変更しない。
- 次の`handoff.prepare`はcloudRefを返す。Webはtargetへ変換し、常に同じmanualへ保存する。receiptのrevision情報不足は`CLOUD_REFERENCE_INCOMPLETE`として停止する。
- 新しい保存／共有を始める前に、同じdraftの`finalize-pending`／`completion-pending`をoutput actionや現在のfingerprintに関係なく先に回収する。編集後のfingerprintが異なっても旧結果のGET照会を妨げず、新しい本文は保持する。
- 回収URLの`action`は元のclaim actionを維持し、今回希望する保存後の移動先は別の`requestedAction=save|share`で渡す。共有希望へ切り替えても新規claimは作らず、元manualの保存結果確認後に共有設定へ進む。
- draft単位のfinalize gateは別handoffの未確定claimを拒否する。`handoff.finalize-pending`はprepareが返したcloudRef（新規ならnull）を送り、現在のreceiptと照合して`sourceCloudRef`へ固定する。古いタブが別の完了前に準備した新規claimを後から確定することはできない。
- 競合で無効になった未確定handoffはローカル状態`superseded`へ移し、新しいhandoffの再利用候補から外す。既にfinalize-pendingの操作は消さずGET回収だけを維持する。新しい操作は確定receiptをtargetにするまで許可しない。
- prepareは全IDの重複と不明参照を検証してから参照画像だけを固定順でsnapshotする。参照先stepまたはscreenshotが要確認なら、ready表示でも拒否する。削除済み／説明のみ化した手順の孤立画像は転送しない。

## 3. チームのテーマとロゴ

`GET /api/workspaces/{workspaceId}/branding`

応答は`{branding:{versionId,themeColor,foregroundColor,logoId,logoUrl},permissions:{canEdit}}`。未設定はversionIdとlogoがnull、テーマ`#087f7a`、前景`#ffffff`。active member全ロールが読める。

`PATCH /api/workspaces/{workspaceId}/branding`

- body: `{themeColor:"#RRGGBB",logoId:null|UUID,expectedVersionId:null|UUID}`。owner/adminのみ。
- strict hexだけを受け付け、CSS式・URL・追加フィールドを拒否する。テーマは小文字へ正規化し、前景は黒または白をサーバーで算出する。
- logoIdは同じworkspaceでreadyかつチーム設定用（source claimなし）のものだけ。期待version不一致は409。成功は新しいimmutable brandingを返す。

`PUT /api/workspaces/{workspaceId}/branding/logos/{operationId}`

- owner/adminのみ。raster headersは編集画像と共通だがdraft headersは不要。
- 1MiB、400万画素、1辺4,096px以下。クライアントはCanvasで再描画し、付加metadataを送信しない。
- 条件付きR2 put、固定identity、checksum、HEAD照合による再送境界は編集画像と同じ。
- 応答: `{status:"ready",logoId,logoUrl}`。uploadだけでは設定を変更しない。PATCHで明示適用する。
- `GET .../branding/logos/{logoId}`はactive memberだけが閲覧できる。外部URLを保存したり匿名に公開したりしない。

### ローカルの手順書固有の色・ロゴ

- ローカルの`draft.branding`は`{themeColor?,logoDataUrl?}`。未指定なら既存のチーム書式経路を維持し、指定時はテーマ既定値`#087f7a`とロゴなしを含む明示snapshotとして扱う。
- 色・ロゴ本文をdraft fingerprintへ含め、prepare時点の原本をローカルmemoryへ固定する。prepareの返却は`draft.branding:{themeColor,hasLogo}`だけ。ロゴのdata URL／元画像はprepareやfinalize JSONへ含めない。
- `handoff.logo.start`／`handoff.logo.chunk`は既存のexact-origin、handoff/action、期限、順序付き192KiB chunk境界を使う。ロゴ入力はPNG/JPEG/WebP・10MiB・4,000万画素以下。Canvas再描画で長辺2,048px・400万画素以下へ縮小し、PNG／透明性を維持するWebPで1MiB以下に再符号化する。SVG・外部URLは拒否する。
- `PUT /api/onboarding/claim-intents/{claimIntentId}/branding/logo`はraster headersと`X-Claim-Operation-Id`を要求し、`{status:"ready",logoId,logoUrl}`を返す。workspace設定PUTと同じ1MiB・400万画素・container検査・immutable R2予約を使う。activeなclaim本人のみ、新規claimはPersonal owner、既存manualへの更新claimはowner/admin/editor。別actor、別tenant、viewer、期限切れ、古いtarget版は拒否する。
- finalizeの任意`manual.branding:{themeColor,logoId:null|UUID}`はこのclaimでreadyになったロゴだけを参照できる。色とロゴの組をclaim単位のimmutable versionとして固定し、manual revisionへCAS適用する。body変更再送は409。途中失敗で未添付versionが残っても同じclaimだけで再利用し、旧manualやチームpointerは変更しない。
- D1の`source_claim_id`でlogo／versionをclaimへ固定する。チームpointerはこのversionを選択できず、別manualのrevisionも参照できない。手順書を編集できるeditorが固有書式を保存しても、チーム全体の設定権限は増えない。
- 通常のcloud draft PATCHは手順書固有snapshotを保持する。後のローカル再保存で新しい色・ロゴ（明示`logoId:null`による削除も含む）を同じmanualへ適用する。チーム全体の既定値変更は従来のowner/admin APIに限る。
- ローカル手順から初回生成するcloud titleは説明の最初の行をtrimして128 codepointへ制限し、空なら「操作の説明」。入力済みtitleや既存PATCHのtitleは自動改名しない。

## 4. 保存版・共有版・印刷の書式

- manual詳細はdraftに固定した`branding`を返す。手順書固有snapshotがない場合だけ明示的なdraft保存で現在のチーム設定を取り込み、共有発行ではいずれもその固定versionをコピーする。
- `POST /s/api/content`は公開revisionに固定した`branding`を返す。共有ビューと印刷はそのテーマ・前景・logoを使う。
- 共有の`logoUrl`は`/s/api/logos/{logoId}`。既存`X-Share-Grant`を必須とし、そのgrantの公開revisionが参照するlogoだけを返す。同じworkspace内の別ロゴも拒否する。
- 書式の取得に失敗した場合に別versionへfallbackしない。期限切れ・停止後のgrantでは本文・手順画像・ロゴを閲覧できない。

## 検証と適用

`npm run test:cloud-manual`、`npm run test:extension-cloud-claim`、`npm run test:share-links`に含む。ローカルSQLiteとR2 mockの成功を実ブラウザーやremote環境適用の成功とは扱わない。新テーブルはmigration 0006で追加し、remote適用と本番配備には別途承認を必要とする。
