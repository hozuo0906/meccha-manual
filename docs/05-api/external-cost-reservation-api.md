# 外部原価予約API契約

Status: Accepted

## 正本と境界

本書はAC-064（Browser Run時間）とAC-065（R2保存容量）の開始前予約、再送、期限、結果不明、reconciliationを実装可能なAPI契約として固定する。判断の正本はDEC-064であり、親の料金・受入条件と矛盾しない。

本書はAPIとサービス間portの契約だけを扱う。Worker、Durable Object、Browser Run、R2 provider、Postgres migration、jobの実装や外部通信の成功を意味しない。`capture.browserRun.egressVerified.enabled=false` またはP0証跡未完了の間は、既存の`503 BROWSER_EGRESS_NOT_VERIFIED` fail-closed境界を維持する。

## 共通予約識別子

すべての予約操作は、認可済みworkspaceとresource typeの組で次の識別子を持つ。

| 項目 | 契約 |
|---|---|
| `operationKey` | 最初の要求前に確保する不透明な操作キー。`workspaceId`、`resourceType`、キーの組で予約IDへ1対1に固定し、再送で新しい予約を作らない。ログや画面には生のキーを記録しない |
| `requestFingerprint` | operation keyを除く、変更不能な要求項目のcanonical JSONをSHA-256化した値。workspace、resource、予定量、対象、checksumなどを含み、秘密値・入力値・provider応答本文は含めない |
| `reservationId` | サーバーが発行するUUID。operation keyの最初の確定時にだけ作成し、同じkey・同じfingerprintの再送では同じIDを返す |
| `resourceType` | `browser_run` または `r2_write`。異なるresource typeの予約を同じ状態として扱わない |
| `resourceRef` | 予約対象を再取得するためのopaqueな内部参照。`browser_run`ではcapture session、`r2_write`ではPostgresのobject metadataを指し、provider URL、secret、実ユーザー操作内容を含めない |
| `providerOperationRef` | providerへ渡すidempotency/operation参照としてdispatch前に生成・永続化し、Browser session/provider operationまたはstorage attemptを相関するopaqueな参照。provider URL、credential、生レスポンスを保存しない |
| `expectedSizeBytes` / `expectedChecksumSha256` | `r2_write`で必須のimmutableな予定byte数とchecksum。照合対象を一意にし、`browser_run`ではnullとする |
| `deadlineAt` | サーバーが計算するUTCの絶対期限。Browser Runではproviderの絶対失効証跡に対応し、DOのclose、Workerのalarm、クライアントのtimeoutだけを期限の根拠にしない |
| `leaseGeneration` | writer/reconcilerが状態遷移で提示するcompare-and-swap世代。現在値と一致した遷移だけを受理し、受理時に単調増加させる |
| `leaseExpiresAt` | reconciliationを開始できるlease期限。期限到達だけでは未確認予約を解放しない |

同じ`operationKey`で`requestFingerprint`が異なる要求は`409 RESERVATION_REQUEST_MISMATCH`で拒否する。同じkey・同じfingerprintの再送は現在のreservation stateを決定的に返し、providerへ新しい開始・putを送らない。結果不明の要求は別keyで再試行してはならない。

## Browser Run開始・予約API

既存の`POST /v1/workspaces/{workspaceId}/capture-sessions`は、Browser Run providerへ通信する前に、次の一つのserver側予約境界を通過する。予約を作成しないprovider起動経路を設けない。

### 要求と原子的予約

要求は`manualId`、`operationKey`、`requestedSeconds`を持つ。serverはcapture sessionに対応する`resourceRef`を発行し、`requestedSeconds`はserver側のplan、残り時間、同時実行数、hard maximumで検証する。clientが渡す期限や上限を信頼しない。

予約transactionは次の順序を原子的に実行する。

1. session、workspace role、entitlement、egress gateを確認する。
2. 同じworkspaceの確定済み使用量とactive reservationをlock境界で読み、同じ`operationKey`の既存reservationを先にfingerprint/state照合する。同じkey・同じfingerprintなら既存stateを返し、`requestedSeconds`をquota candidateへ加算しない。異なるfingerprintはproviderやquota判定へ進めず拒否する。
3. 新規keyだけ、`current seconds + active reserved seconds + requested seconds`が上限を超えないことを確認する。同じkeyの既存reservationをactive reservedへ含める場合も、その既存量をcandidateとして二重計上しない。
4. 新規ならreservationを作成し、`requestedSeconds`を`plannedSeconds`と`reservedSeconds`へ固定する。reservation確定時にprovider-supported idempotency/operation参照を生成して永続化し、dispatch後も同じ参照でlookupできるようにする。
5. server計算の`deadlineAt`、`leaseGeneration`、`leaseExpiresAt`、request fingerprint、reservation ID、`resourceRef`、dispatch前に固定した`providerOperationRef`を応答へ含める。
6. reservation確定後だけprovider起動へ進む。transaction失敗、上限超過、権限不足ではproviderへ通信しない。

P0のprovider絶対失効を公式契約と隔離stagingの障害注入で実証するまでは、egress gateによりprovider起動を`503 BROWSER_EGRESS_NOT_VERIFIED`で拒否する。実証後も`deadlineAt`到達時にLive Viewを失効させ、providerの絶対失効、cancel、closeを期限付きで記録する。closeやDOが停止しても予約期限を越えてremote sessionが稼働できないことを証跡にする。

### 応答と再送

成功応答はreservationの現在状態だけを返し、Cookie、Browser credential、provider secret、Live View URLを予約APIの結果へ含めない。

```json
{
  "reservationId": "<uuid>",
  "operationKey": "<opaque-operation-key>",
  "requestFingerprint": "<sha256>",
  "status": "reserved",
  "plannedSeconds": 120,
  "reservedSeconds": 120,
  "committedSeconds": 0,
  "resourceRef": "<opaque-capture-session-ref>",
  "providerOperationRef": "<opaque-provider-operation-ref>",
  "leaseGeneration": 1,
  "deadlineAt": "<absolute-utc>",
  "leaseExpiresAt": "<absolute-utc>",
  "terminalProof": null,
  "reconciliationOutcome": "pending"
}
```

| 状況 | 契約応答 | 予約の扱い |
|---|---|---|
| 新しい要求を原子的に予約できた | `201` と`status=reserved` | provider起動前のreservedを保持 |
| 同じkey・同じfingerprintの再送 | `200` と同じreservation ID・現在state | 新しい予約、session、provider起動を作らない |
| key再利用で要求が変わった | `409 RESERVATION_REQUEST_MISMATCH` | 既存予約を変更・解放しない |
| 上限または同時実行数を超えた | `409 USAGE_RESERVATION_LIMIT_EXCEEDED` | reservationを作らずproviderへ通信しない |
| provider呼出し後に応答・結果が確認できない | `202 RESERVATION_RESULT_UNKNOWN` と同じreservation ID・dispatch前に固定した`providerOperationRef` | その参照でprovider/sessionをlookupし、`result_unknown`としてlease期限後のreconciliationまで保持 |
| provider絶対失効P0未実証のため起動を止めた | `503 BROWSER_EGRESS_NOT_VERIFIED` | providerへ通信せず、confirmed non-startとして未使用予約だけ解放 |

## R2書込reservation port

R2のputは、Workerのstorage portが`r2_write`予約を確定してからだけ開始できる。providerとの実通信をこの文書やCIで行わない。

`reserve_r2_write`は`operationKey`、対象workspace/resource、opaqueな`resourceRef`、正確な`plannedBytes`、`expectedSizeBytes`、`expectedChecksumSha256`、content typeを受け取り、同じ`operationKey`の既存reservationをfingerprint/state照合してからquota candidateを計算する。同じkey・同じfingerprintなら既存stateを返して`plannedBytes`を二重加算せず、新規keyだけ`current bytes + active reserved bytes + plannedBytes`を一つのtransactionで検証する。`expectedSizeBytes`は`plannedBytes`と一致させ、bodyサイズを確定できない要求、checksum形式が不正な要求、上限超過は予約もprovider通信も行わない。reservation確定時にstorage attempt用のopaqueな`providerOperationRef`を生成・永続化し、put dispatchへ同じ参照を渡す。adapterはput前後にbyte数とchecksumを再検証する。

R2の同じoperation keyの再送はquota candidateを加算する前に同じreservationを返す。keyは同じでもplanned bytes、対象、checksumが変わる要求は`409 RESERVATION_REQUEST_MISMATCH`とし、別reservationへの付け替えや旧reservationの暗黙解放をしない。put結果が不明な場合はdispatch前に固定した`providerOperationRef`でlookupし、`202 RESERVATION_RESULT_UNKNOWN`として予約を保持し、object照合とoriginal writerのterminal/fenced証跡が揃うまで解放しない。

R2のput dispatchには`reservationId`、`resourceRef`、その時点の`leaseGeneration`、`providerOperationRef`を必ず渡し、object locatorまたはwrite-intentへ同じreservationと世代を拘束する。storage providerが世代fenceを強制できない場合は、stateのCASだけで外部putを無効化したとみなさず、original writerのprovider-terminal proofが得られるまでobject不在を`confirmed_nonexistence`に昇格させない。期限後に遅れて到着したobjectはこの相関参照でreconcileし、確認前に予約を解放しない。

## 解放とreconciliationの共通契約

- providerへ一度も到達していないことが確定した`confirmed_non_start`、またはproviderの終端証跡後にobjectが存在しないことが確定した`confirmed_nonexistence`だけを未使用予約の即時解放対象にする。
- timeout、通信切断、Worker/DO再起動、lease期限切れ、応答本文破損は`result_unknown`であり、object不在だけを根拠に解放しない。
- expired reservationの解放前に、`resourceRef`から対象session/object metadataを再取得し、original writerがterminal/fencedであることを`lease generation/fencing`または`provider-terminal proof`で確認する。確認できない間は`reconciling`へ留め、実使用量への確定や解放を行わない。
- writerとreconcilerは必ず現在の`leaseGeneration`をcompare-and-swapし、一致しない古いwriterのcommit、release、terminal証跡を拒否する。R2の外部putも`reservationId`、`resourceRef`、`leaseGeneration`へ拘束し、object locator/write-intentまたはprovider側のterminal proofで同じ世代を確認できるようにする。stateのCASだけでは外部副作用をfenceしたことにならないため、providerが世代拘束を提供しない間はterminal proofなしの不在を解放根拠にしない。成功した状態遷移だけが世代を増やすため、単なる単調な保存値をfencingの代わりにしない。
- 成功したobject/sessionは実績量を`committed`へ確定し、`reserved - committed`だけを原子的に解放する。二重再送でcommitted量を二重計上しない。
- reconciliationは`reservationId`単位で冪等に実行し、`reconciliationOutcome`、確認時刻、終端証跡のdigestを状態へ残す。providerの生レスポンス、secret、実ユーザー操作内容は保存しない。
