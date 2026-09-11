# ゲストオンボーディング・セルフサーブbootstrap・claim API

Status: Accepted

## 目的

アカウント未作成で作ったローカル下書きを、output操作時の認証後に安全かつ冪等にPersonal Workspaceへ移す境界を定義する。

## 境界

ゲスト中のmanual本文、screenshot、capture eventはChrome拡張ローカルだけに存在し、APIへ送らない。

サーバーAPIを使い始めるのは、利用者が `保存 / 共有 / PDF出力` 等を選び、Cloudflare Accessで人間ユーザーとして認証された後とする。

## 1. Self-service bootstrap

### `POST /api/onboarding/bootstrap`

目的: 初回の検証済みhuman Access actorへapplication identity、profile、Personal Workspace、active owner membershipを一度だけ準備する。

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

claim intentは単回消費とし、生tokenをログ、analytics、URL queryへ残さない。

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

画像本体のupload方式はR2契約に従う。claim全体として、manualが確定したのにasset参照だけ消失する部分成功を許可しない。必要ならstaged upload + finalizeを用いるが、方式は実装Issueで既存R2契約と整合させる。

### validation

- claim intentが現在actor/workspaceへ固定されていること。
- 未期限切れ・未消費であること。
- operationIdとrequest fingerprintが一致すること。
- manual/step/inputが既存上限内であること。
- guest payloadにpassword、Cookie、Authorization等の禁止情報が含まれないこと。

### 冪等性と結果不明

- same operationId + same fingerprintは同じmanual結果を返す。
- same operationId + different fingerprintは409。
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

clientはoutput gateを開いた時点で、ユーザーが選んだactionをローカルに保持する。

例:

- `save`
- `share`
- `export_pdf`

bootstrap + claim成功後に同じactionを再開する。認証完了後に利用者へ最初から作り直させない。

`share` はADR-0008の期限・パスコード・権限範囲を必須とする。

## エラー契約

| 状態 | HTTP | client動作 |
|---|---:|---|
| Access未認証 | 401 | 認証導線へ |
| human actorではない | 403 | 続行不可 |
| disabled/retired identity | 403 | 自動復活せずサポート案内 |
| bootstrap結果不明 | 503/結果不明 | 同operationIdで照合。別workspaceを作らない |
| claim intent期限切れ | 410 | guest原本を保持したまま新intentを作成可能 |
| fingerprint競合 | 409 | 自動上書きしない |
| payload不正/上限超過 | 400/413 | guest原本を保持し、修正案内 |
| storage一時障害 | 503 | guest原本を保持し、同operationIdで再試行 |

## ログ禁止

- guest manual本文。
- screenshot本体。
- password、Cookie、Authorization。
- claim生token。
- 対象ページの機密URL/query。

## テスト

- unknown valid human actorが一度だけPersonal Workspaceへprovisionされる。
- email一致だけでdisabled identityが復活しない。
- bootstrap並行実行でworkspace/owner membershipが二重作成されない。
- guest状態ではD1/R2 writeが0回。
- claim応答消失後の同operationId再送でmanualが二重作成されない。
- claim失敗時にclient local原本が消えない。
- claim後にsave/share/exportの元操作へ復帰できる。
