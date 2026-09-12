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
3. `https://<app-origin>/onboarding/continue#handoff=<handoffId>` を通常タブで開く。

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
  "workspaceId": "server-authoritative-id"
}
```

既存利用者の場合も同じshapeを返す。

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

serverはclaim結果を、少なくともactor、workspace、claimIntentId、operationId、request fingerprint、manualId、statusと対応づけて保持し、成功response消失後の決定的再照合を可能にする。

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
  "assets": []
}
```

画像本体のupload方式はR2契約に従う。claim全体として、manualが確定したのにasset参照だけ消失する部分成功を許可しない。必要ならstaged upload + finalizeを使い、finalize前のobjectはauthoritative manual assetとみなさない。

### validation order

再送復旧を壊さないため、検証順序を固定する。

1. 現在のAccess actorとworkspaceを認証・認可する。
2. claimIntentIdに既存の`completed`結果があるか確認する。
3. `completed`で、同一actor + workspace + claimIntentId + operationId + request fingerprintなら、intentが消費済みまたは元TTL経過後でも保存済みの同じ`manualId`を200で返す。新しいwriteを行わない。
4. `completed`だがoperationIdまたはfingerprintが異なる場合は409で拒否する。
5. 未完了の場合だけ、intentの未期限切れ・未消費・actor/workspace bindingを検証する。
6. manual/step/input上限、禁止情報、request fingerprintを検証する。
7. staged assetとmanualをfinalizeし、成功結果をatomicに`completed`として記録する。

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
