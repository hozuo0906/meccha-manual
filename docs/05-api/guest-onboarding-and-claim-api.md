# ゲストオンボーディング・セルフサーブbootstrap・claim API

Status: Accepted

## 目的

アカウント未作成で作ったローカル下書きを、output操作時の認証後に安全かつ冪等にPersonal Workspaceへ移す境界を定義する。

## 境界

ゲスト中のmanual本文、screenshot、capture eventはChrome拡張ローカルだけに存在し、APIへ送らない。

サーバーAPIを使い始めるのは、利用者が `保存 / 共有 / PDF出力` 等を選び、Cloudflare Accessでhuman actorとして認証された後とする。

Access JWT、Access cookie、OTP等のcredentialをChrome拡張へ渡さない。business write APIは認証済みWebアプリoriginからのみ呼び出す。

## 0. Extension -> Web app handoff

### handoff開始

output gateで拡張は次を行う。

1. 256 bit相当の推測困難な `handoffId` を生成する。
2. `handoffId`、local draft ID、選択済みoutput action、有効期限を拡張ローカルへ保存する。
3. owner限定staging配布版では、`https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue#handoff=<handoffId>` を通常タブで開く。配布版のconfigとhandoff判定はこのoriginとの完全一致だけを許可し、production・preview・localhost等は拒否する。

`handoffId` はURL fragmentへ置き、HTTP request、Access log、server logへ送らない。manual本文、asset、output内容をURLへ入れない。

### 認証後の外部message

WebアプリはCloudflare Access認証後に、manifestの `externally_connectable.matches` へ明示した自社app originから対象拡張へ接続する。

- Web page -> extensionは `chrome.runtime.sendMessage(extensionId, ...)` または `chrome.runtime.connect(extensionId)` を使う。
- extension側は `runtime.onMessageExternal` / `runtime.onConnectExternal` で受ける。
- extensionは `sender.url` のoriginを正規化し、環境別allowlistの自社app originと完全一致することを確認する。
- `handoffId` がlocal storeに存在し、未期限切れ・未完了で、要求されたoutput actionと一致することを確認する。
- message type、schema、最大byte数、chunk sequenceをallowlistする。
- 未知origin、未知message type、handoff不一致、期限切れを副作用0で拒否する。

guest draft / imageは大きくなり得るため、単一の巨大JSON messageを前提にしない。metadataとbounded chunkに分け、上限を超えるhandoffは明示エラーにする。

### credential境界

- Access cookie/JWTをextensionへ送らない。
- extensionからbusiness write APIを直接呼ばない。
- Webアプリページがextensionから受け取ったguest payloadを、同一originの `/api/onboarding/*` へ通常のsame-origin requestとしてPOSTする。
- Cloudflare Accessがrequestへ付与する認証情報をページJavaScriptから読み取る、コピーする、extensionへ渡す設計にしない。
- guest payloadをDOM、localStorage、URL、Product Eventへ複製しない。

### 完了通知

server claimが成功し、Webアプリが`manualId`を受領した後だけ、Webアプリからextensionへ `handoff.completed` を送る。

extensionはsender origin、handoffId、完了対象local draftを再検証してからlocal原本を削除する。server結果が不明な間はlocal原本を削除しない。

## 1. Self-service bootstrap

### `POST /api/onboarding/bootstrap`

目的: 初回の検証済みhuman Access actorへapplication identity、profile、Personal Workspace、active owner membershipを一度だけ準備する。

### Access到達

- development/stagingは明示allowlist policyを維持する。
- production商用MVPは一般利用者向けAccess applicationでOne-time PINによるself-service本人確認を許可する。
- Access到達は業務認可ではない。
- 未登録human actorはこのbootstrap route以外の業務APIを403で拒否する。
- productionではbootstrapへserver-side rate limitを適用し、監視・停止手順を持つ。

### 認証

- Cloudflare Access application JWT必須。
- `access_user` actorだけを許可し、service tokenを拒否する。
- JWTの署名、issuer、audience、期限等はADR-0028の既存検証を使用する。
- identity keyは検証済み `issuer + subject` とする。
- email一致だけで既存identityをrelocate、merge、reviveしない。

### request

```json
{
  "operationId": "opaque-random-id"
}
```

ユーザー名、workspace名、roleをclientから必須入力させない。Personal Workspaceの内部名／slugはserverで決定し、初回UXへ露出しなくてよい。

S2 bootstrap実装では`operationId`を16〜128文字のASCII英数字・`_`・`-`に限定し、他fieldを拒否する。`DB`と`ONBOARDING_RATE_LIMITER` bindingが不足すると503で書込み前に停止する。owner pilotのCloudflare Rate Limiting bindingは10回／60秒とし、検証済みissuer+subjectとCloudflare edgeが付与する単一の`CF-Connecting-IP`（Pseudo IPv4で保存された場合は`CF-Connecting-IPv6`）を正規化して、それぞれ別keyへ適用する。接続元signalの欠落・不正、またはlimiterの不明な結果は503で書込み前に停止し、拒否時は429と`Retry-After: 60`を返す。raw IPと識別子はログへ保存しない。binding設定とstagingへのmigration適用は別のdeploy手順であり、API実装だけで有効化済みとは扱わない。production namespaceとD1 IDが未確定の間はplaceholderでfail closedにする。

### atomic operation

次を単一のD1 atomic operation/batchとして扱う。

1. issuer+subjectの既存identityを照合する。
2. disabled/retiredなら403で停止し、自動復活しない。
3. identityが未作成ならapplication identityを作る。
4. profileがなければ作る。
5. active Personal Workspaceがなければ作る。
6. active owner membershipがなければ作る。
7. 必要なauditを記録する。
8. operationIdの結果を確定する。

途中成功を許可しない。

### 冪等性

- 同じactor + operationIdの再送は同じ結果を返す。
- 別operationIdの並行bootstrapでも、issuer+subject単位の一意境界でPersonal Workspaceを二重作成しない。
- 応答消失時にclientは同じoperationIdで照合・再試行できる。

### response

```json
{
  "status": "ready",
  "workspaceId": "server-authoritative-id",
  "createdIdentity": true
}
```

`createdIdentity`はserver-sideのatomic bootstrap結果から決定し、そのbootstrap operationがapplication identityを新規作成した場合だけ`true`とする。同じoperationの冪等再送では元の結果を返し、別operationによる既存identityのlogin、既存Personal Workspace取得、claimだけの再試行では`false`とする。client申告で上書きできない。既存利用者の場合も同じshapeを返す。

`signup_completed`はbootstrap処理がidentityを新規作成したときだけserverがexactly-onceで記録する。responseを受けたclientからは発行せず、bootstrap再送やresponse lossで二重記録しない。serverは固定namespace、event type、actor identity、bootstrap operationIdから決定的なeventIdを生成し、identity作成を確定したserver-side timestampをoccurredAtとする。同じoperationのretryでは同じeventIdを使う。D1のoperation結果とsignup eventはappend-onlyで、挿入置換、別identity・workspace・operationへの関連先変更、削除を許可しない。冪等retryは既存rowを挿入しない形で同じ結果を返す。

`createdIdentity=true` の operation は、同じ application identity の `identities.created_at` と operation の authoritative `created_at` が一致し、identity作成を示すoperationがidentityごとに一意である場合だけ保存する。既存 identity の login／bootstrap retry は `false` のままで、異なる時刻を直接指定した偽 signup は D1 trigger で拒否する。既存identityの作成時刻にoperation時刻を合わせた直接挿入を、この単純なDB境界だけで過去の正規作成と区別することはできないため、DB writer自体を信頼境界の外へ公開しない。

## 2. Guest draft claim intent

### `POST /api/onboarding/claim-intents`

bootstrap済みactorだけが呼べる。

request:

```json
{
  "operationId": "opaque-random-id",
  "assetCount": 5
}
```

manual本文、画像、対象URLをintent作成時に送らない。

serverは短命なclaim intentを発行し、認証済みactorとworkspaceへ固定する。

response:

```json
{
  "claimIntentId": "opaque-id",
  "expiresAt": "server-time"
}
```

claim intentは新規claim開始に対して単回利用とし、生tokenをログ、analytics、URL queryへ残さない。

serverはclaim結果を、少なくともactor、workspace、claimIntentId、operationId、request fingerprint、manualId、statusと対応づけて保持し、成功response消失後の決定的再照合を可能にする。retry identityは `claimIntentId + operationId + asset slot` で固定する。

### `PUT /api/onboarding/claim-intents/{claimIntentId}/assets/{assetSlot}`

目的: extensionからbounded chunkで受け取った1 screenshotを、認証済みWeb appがsame-origin Worker API経由でprivate R2のclaim stagingへ運ぶ。extensionはAccess JWT／Cookie／OTPを受け取らず、R2またはbusiness APIを直接呼ばない。

認可はverified Cloudflare Access human actor、bootstrap済みactive identity、claim intentに固定された同じactor／Personal Workspace、same-origin writeをすべて必須とし、service tokenを拒否する。`assetSlot`はintent作成時の`assetCount`からserverが決めた`0..assetCount-1`だけを受け付け、client指定object keyを受け付けない。

MVP safety limitは、`assetCount <= 100`、1 assetあたり10 MiB以下、claim合計100 MiB以下とする。許可Content-Typeは`image/png`、`image/jpeg`、`image/webp`だけとする。binary bodyを1 asset = 1 bounded PUTで送り、JSON／base64巨大payloadやserver-side multipart/chunk APIを前提にしない。上限超過はbody全体をauthoritative assetにせず413で拒否する。

requestは`Content-Type`、`X-Asset-Byte-Length`、lowercase hex SHA-256 digest、claim `operationId`を必須にする。Workerはstreamを上限内で読み、実byte lengthとSHA-256、PNG/JPEG/WebPのsignatureを再計算し、assetSlot、actor／workspace／intent binding、intent expiry、asset count、claim total sizeを検証する。object keyはclaimIntentIdとassetSlotから決定的なasset IDを導出して固定する。

response:

```json
{
  "assetSlot": 0,
  "sha256": "server-verified-lowercase-hex",
  "byteLength": 123456,
  "contentType": "image/jpeg",
  "status": "staged"
}
```

R2 object keyはresponseへ含めずclient contractにしない。同じactor + workspace + claimIntentId + operationId + assetSlot + digestのretryは同じstaged resultへ収束する。R2 put成功後のresponse lossでは再put前にauthoritative staging recordとR2 metadataをreconcileし、同じdigest／size／fixed metadataなら既存resultを返す。mismatchは409でfail closedにし、別object keyを生成せず、completed claimのassetを上書き・削除しない。

## 3. Guest draft claim

### `POST /api/onboarding/claims/{claimIntentId}`

目的: ローカルguest draftを認証済みworkspaceへ一度だけ取り込む。

入力は既存manual入力上限、step上限、asset上限、文字数制約をすべて適用する。

最低限のrequest envelope:

```json
{
  "operationId": "opaque-random-id",
  "manual": {
    "title": "...",
    "description": "...",
    "steps": []
  },
  "assets": [
    {
      "assetSlot": 0,
      "sha256": "server-verified-lowercase-hex"
    }
  ]
}
```

claim requestでは画像byteを再送せず、staged reference manifestだけを送る。serverは全slotのstaged存在、digest、size、actor／workspace bindingを再検証する。画像本体のupload方式はR2契約に従う。claim全体として、manualが確定したのにasset参照だけ消失する部分成功を許可しない。staged upload + finalizeを使い、finalize前のobjectはauthoritative manual assetとみなさない。R2とD1を単一transactionにできるとは扱わず、次のidempotencyとreconciliation契約で境界を閉じる。

`manual.steps`は`type`、`title`、`instruction`、`actionType`、`targetText`、`url`、`assetSlot`を含むexpanded DTOへweb側で正規化し、captureにないURLや対象文字列は`null`にする。既存手順書の編集は別のdraft PATCHで全step配列をCAS更新する。

### Asset identityとR2/D1 reconciliation

- 各assetはclaim内で重複しないserver-authoritativeなasset slotとcontent digestを持つ。object keyは`{workspace_id}/manuals/{claim_intent_id}/{asset_id}.{ext}`とし、asset IDをclaim intentとslotから決定的に導出する。client指定keyやretryごとのrandom値を使わない。
- 同じactor、workspace、claimIntentId、operationId、request fingerprint、asset slotのretryは同じobject keyを使う。別keyへ再uploadしてmanualやassetを二重生成しない。
- R2 put前にD1が同じ固定identityの`reserved`行をatomicに確保し、100MiB上限を予約へ適用する。再upload前にD1のclaim/asset記録を照合する。R2 put成功後に`staged`へ遷移し、R2 putまたはHEADの結果が不明な場合は予約を保持して、同じkey／digest／固定metadataのretryでreconcileする。mismatchはfail closedにして上書きしない。
- finalize結果が不明な場合は、同じ認証主体が`GET /api/onboarding/claims/{claimIntentId}?operationId=...`で`pending`、`expired`、`completed`（completed時は同じ`manualId`）を照会できる。queryは`operationId`だけを受け付け、他workspace／actor／operationはfail closedする。
- D1のcompleted claimは確定済みmanualIdと全asset slot／digest／object keyを対応づける。completed再送はその同じmanualIdとasset集合を返し、新しいmanual、assetまたはobject keyを作らない。
- incomplete claimの予約・staged objectの自動cleanupはC sliceの対象外とする。R2 putまたはHEADの結果不明時は予約を保持し、遅延したputが容量制限を越えないようにする。

### validation order

再送復旧を壊さないため、検証順序を固定する。

1. 現在のAccess actorとworkspaceを認証・認可する。
2. claimIntentIdに既存の`completed`結果があるか確認する。
3. `completed`で、同一actor + workspace + claimIntentId + operationId + request fingerprintなら、intentが消費済みまたは元TTL経過後でも保存済みの同じ`manualId`を200で返す。新しいwriteを行わない。
4. `completed`だがoperationIdまたはfingerprintが異なる場合は409で拒否する。
5. 未完了の場合だけ、intentの未期限切れ・未消費・actor/workspace bindingを検証する。
6. manual/step/input上限、禁止情報、request fingerprintを検証する。
7. 全staged assetのidentity／digest／存在をreconcileした後、manual、asset参照、成功結果をD1 transactionで`completed`として記録する。R2 putとD1 transactionをatomicとはみなさない。

### 冪等性と結果不明

- same actor + intent + operationId + fingerprintのcompleted再送は同じmanual結果を返す。
- same intent + different operationIdまたはdifferent fingerprintは409。
- 未完了かつ期限切れのintentは410。guest原本を保持したまま新intentを作成できる。
- 応答消失時に別manualを作らない。
- claim成功が確認できるまでclientはguest local原本を削除しない。

response:

```json
{
  "status": "claimed",
  "manualId": "server-id"
}
```

## 4. Output resume

clientはoutput gateを開いた時点で、ユーザーが選んだactionをextension local handoff stateへ保持する。

- `save`
- `share`
- `export_pdf`

bootstrap + claim成功後にWebアプリ側で同じactionを再開する。認証完了後に利用者へ最初から作り直させない。

`share` はADR-0008の期限・パスコード・権限範囲を必須とする。

## エラー契約

| 状態 | HTTP | client動作 |
|---|---:|---|
| Access未認証 | 401 | 認証導線へ |
| human actorではない | 403 | 続行不可 |
| 未登録humanの非bootstrap API | 403 | bootstrapだけを許可 |
| disabled/retired identity | 403 | 自動復活せずサポート案内 |
| bootstrap rate limit | 429 | guest原本を保持し再試行時刻を案内 |
| bootstrap結果不明 | 503/結果不明 | 同operationIdで照合。別workspaceを作らない |
| completed claimの同一再送 | 200 | 保存済み同一manualIdを返し元outputを再開 |
| completed claimへの別operation/fingerprint | 409 | 再利用拒否、local原本保持 |
| 未完了claim intent期限切れ | 410 | guest原本を保持したまま新intentを作成可能 |
| handoff origin/id不正 | client拒否 | payloadを渡さず副作用0 |
| payload不正/上限超過 | 400/413 | guest原本を保持し、修正案内 |
| storage一時障害 | 503 | guest原本を保持し、同operationIdで再試行 |

## ログ禁止

- guest manual本文。
- screenshot本体。
- password、Cookie、Authorization。
- Access JWT / Access cookie / OTP。
- claim生token。
- handoff payload。
- 対象ページの機密URL/query。

## テスト

- production self-service OTP policyとstaging allowlist policyが分離されている。
- unknown valid human actorがbootstrap以外の業務APIで403になる。
- unknown valid human actorが一度だけPersonal Workspaceへprovisionされる。
- email一致だけでdisabled identityが復活しない。
- bootstrap並行実行でworkspace/owner membershipが二重作成されない。
- guest状態ではD1/R2 writeが0回。
- Access credentialがextensionへ渡らない。
- allowlist外originからのexternal messageでguest payloadを返さない。
- handoffId不一致・期限切れ・未知message typeで副作用0。
- claim成功response消失後の同一再送で同じmanualIdを200で返す。
- completed claimへの別operation/fingerprintを409で拒否する。
- claim失敗時にclient local原本が消えない。
- claim後にsave/share/exportの元操作へ復帰できる。

## B登録UIのclient実装境界

Bの限定配布版は、output gateから`/onboarding/continue#handoff=<handoffId>`へ遷移する画面と、認証済みWebアプリからのbootstrap呼び出しまでを対象とする。拡張機能はhandoff metadata（draft ID、選択済みaction、有効期限）をlocal領域へ保持し、本文・画像・credentialを送信しない。

Web画面はfragmentを読み取った直後にURLから除去し、`handoffId`と`operationId`のmetadataだけを同一タブの`sessionStorage`へ保持する。再読込または応答消失では保存済みの同じ`operationId`を再利用する。bootstrap成功時もguest本文は未保存であり、local原本を削除しない。

owner限定staging配布版はstaging B登録UIへ接続する。production originの配布とAccess環境が未準備の場合、clientはCTAを無効化して準備中を表示する。準備状態を推測して本番originを露出させない。Cのguest claim、asset transfer、完了通知はこのB実装の範囲外であり、claim成功までlocal原本を保持する契約を継続する。
### B handoff fragment と operation の期限境界

同一タブの `sessionStorage` は単一operationの上書き領域ではなく、`version`、`activeHandoffId`、handoffごとの不変な `operationId`／`createdAt`／状態を持つ履歴として保存する。期限切れを観測したentryは `expired` tombstoneとして残し、後続の別handoffを受理しても、同じhandoffのoperationを再発行しない。fragmentなしの再読込は `activeHandoffId` のentryだけを参照する。旧来の単一recordは検証可能な場合だけ履歴の1件へ移行し、JSON解析、重複、形式、保存のいずれかが不確かな場合は副作用0で拒否する。履歴を容量上限で削除して再発行可能にすることはしない。この保証は同一タブの `sessionStorage` が存続している範囲に限る。

Web画面がfragmentを受け取った場合、`handoff` が1つだけ存在し、256bit相当の形式に一致する場合だけ、そのページ訪問時刻を `operationId` のmetadata `createdAt` として固定する。同じhandoffの有効な保存済みmetadataを再訪・再読込で見つけた場合は、既存の `createdAt` を維持してTTLを延長しない。空、形式不正、重複のfragmentは、同一タブの新しいhandoffとして扱わず、既存の `sessionStorage` 値へフォールバックせずに副作用0で拒否する。

同じhandoffに紐づく保存済みoperationが期限切れになった場合、再送、再読込、同じfragmentでの再訪のいずれでも新しいoperationIdを発行しない。期限内の応答消失だけが同じoperationIdを再利用できる。別の有効handoffを新たに受け取った訪問は、そのhandoffに限って新しいoperationを開始できる。

### B期限切れ観測時の保存境界

クリック時に保存済みmetadataの期限切れを観測した場合も、fragmentの有無にかかわらず、検証済みの最新履歴から一致するhandoff／operationを再確認し、そのentryだけを`expired` tombstoneとして既存履歴と`activeHandoffId`を保持したまま保存する。保存に失敗した場合は当該ページの操作を停止し、保存成功を前提とした永続化済みとは扱わない。
### `GET /api/onboarding/claims/{claimIntentId}?operationId={operationId}`

finalize応答が失われた場合は、同じclaim intentの結果を照会する。request bodyは持たず、Access actor、workspace、claim intent、operationIdを照合する。`completed`なら同じ`manualId`を返し、未完了なら`pending`、期限切れなら`expired`を返す。別operationIdは409で拒否し、workspace・actorの境界はfail closedとする。
