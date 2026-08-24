# 外部原価予約 durable state 契約

Status: Accepted

## 目的と適用範囲

AC-064/065の開始前予約を、Browser RunとR2 providerの応答順・再起動・通信切断から独立してreconcileできるdurable stateとして固定する。正本はDEC-064と`docs/05-api/external-cost-reservation-api.md`であり、実装前にDB migration、RLS、provider実通信を追加しない。Browser Runの対象はcapture session startとmobile preview session startだけで、live-url、capture commands、mobile preview navigate/reloadはこのstart reservation stateのlookup・作成・再送対象にしない。

## 正本レコード

将来のPostgres正本レコード名は`cost_reservations`とする。これは設計上のデータ契約であり、本Issueではテーブル作成、migration、job、runtimeを行わない。clientから直接公開するテーブルではなく、Workerの認可済みAPIとreconciliation serviceだけが状態を変更する。

| 項目 | 型・制約 | 意味 |
|---|---|---|
| `id` | UUID、immutable、unique | reservation ID。再送の安定した参照 |
| `workspace_id` | UUID、not null、immutable | 予約と利用上限のtenant境界 |
| `resource_type` | enum: `browser_run` / `r2_write` | 秒予約とbyte予約を混同しない識別子 |
| `operation_key` | opaque text、`workspace_id + resource_type`内でunique | 初回要求前から再送まで同じ操作を指すキー。変更要求で差し替えない |
| `request_fingerprint` | SHA-256 digest、not null、immutable | operation keyを除くcanonical requestの同一性。変更retry拒否に使う |
| `resource_ref` | opaqueな内部参照、resource typeごとに必須 | `browser_run`ではcapture sessionまたはmobile preview session、`r2_write`ではPostgres object metadataへ再取得できる参照。provider URL・secret・生操作内容は含めない |
| `provider_operation_ref` | opaque参照、not null、immutable | reservation確定時にdispatch前のidempotency/operation参照として生成・永続化し、Browser session/provider operationまたはstorage attemptを特定する。同じoperation keyの同一fingerprint retryでは同じ参照を返し、provider URLやcredentialを保存しない |
| `status` | enum: `reserved`, `in_progress`, `result_unknown`, `reconciling`, `committed`, `released` | 予約の現在状態。未確認状態を成功・解放へ暗黙変換しない |
| `lease_generation` | monotonic integer、compare-and-swap必須 | writer/reconcilerは期待世代と現在世代が一致したときだけ遷移し、成功時に世代を増やす。古いwriterの状態を上書きしないためのfence |
| `lease_expires_at` | UTC `timestamptz`、not null | reconciliation開始可能時刻。expiredだけでは解放条件を満たさない |
| `absolute_expires_at` | UTC `timestamptz`、resource typeごとに必須 | Browser Runはprovider絶対失効期限、R2はreservation上限期限。DO closeだけを根拠にしない |
| `planned_seconds` / `reserved_seconds` / `committed_seconds` | 非負整数、秒予約用 | Browser Runの要求量、上限に保持する量、実績量。committedはreservedを超えない |
| `planned_bytes` / `reserved_bytes` / `committed_bytes` | 非負整数、byte予約用 | R2の予定量、上限に保持する量、object確定量。committedはreservedを超えない |
| `expected_size_bytes` | `r2_write`でnot null、`browser_run`でnull | object照合に使うimmutableな期待byte数。`planned_bytes`と一致させる |
| `expected_checksum_sha256` | `r2_write`でnot null、`browser_run`でnull | object body照合に使うimmutableな期待checksum |
| `terminal_proof` | nullableな型付きdigest/reference | original writerがterminal/fencedである証跡。provider secretや生応答を保存しない |
| `reconciliation_outcome` | enum: `pending`, `confirmed_non_start`, `confirmed_nonexistence`, `confirmed_committed`, `held_result_unknown` | 照合結果。未確認をconfirmedへ昇格させない |
| `created_at` / `updated_at` / `terminal_at` | UTC `timestamptz` | 状態と終端証跡の監査時刻 |

`planned_*`は要求時のimmutableな見積り、`reserved_*`は現在の上限へ保持する量、`committed_*`はproviderまたはメタデータ照合で確定した実績量である。R2の予約判定は候補の`planned_bytes`を含め、確定後は同じ量を`reserved_bytes`として一度だけ数える。`expected_size_bytes`と`expected_checksum_sha256`はobject照合に必須であり、Browser Runではresource type制約によりnullとする。Browser Runも同じ関係を秒単位で適用する。

`resource_type = browser_run`のcanonical identityは`workspace_id + resource_type + operation_key`であり、この組に複数のreservationを作らない。capture session startとmobile preview session startはroute kindとして監査できるが、一意性のresource typeを分けない。`request_fingerprint`はoperation keyを除くimmutableな要求比較値であり、同じkeyで相違する要求を`409 RESERVATION_REQUEST_MISMATCH`として拒否するためにだけ使う。`resource_ref`はrouteに対応するcapture sessionまたはmobile preview sessionのopaqueな内部参照で、provider URL、secret、Cookie、Authorization、生payloadを含めない。

## 状態遷移と不変条件

```text
reserved -> in_progress -> committed
reserved -> released
in_progress -> result_unknown -> reconciling -> committed
                                      \-> released
```

- `reserved`からprovider起動またはputへ進む前に、同一transactionで上限とworkspaceを確定する。
- `result_unknown`は`reconciling`を経ずに`released`や`committed`へ進めない。lease期限切れ、object不在、close失敗、再起動はそれぞれ解放の証明ではない。
- `confirmed_non_start`はprovider未到達が確認できた場合だけ、`confirmed_nonexistence`はprovider終端後にobject不存在が確認できた場合だけ、未使用reservedを解放できる。
- `resource_ref`から対象session/object metadataを再取得し、`expected_size_bytes`と`expected_checksum_sha256`（R2の場合）を照合する。expiredでobjectが不在でも、original writerのterminal/fencedを`lease_generation/fencing`または`provider-terminal proof`で確認するまで`reconciling`へ保持する。
- writer/reconcilerのcommit、release、terminal証跡の書込みは現在`lease_generation`とのcompare-and-swapで行う。一致しない古い世代は拒否し、受理した一つの遷移だけが世代を増やす。単に世代番号を保存するだけではfencing成立とみなさない。
- `committed_* <= reserved_* <= planned_*`をresource typeごとに維持し、解放量は`reserved - committed`だけとする。再送、reconciliation、job再実行は同じreservation IDの一度きりの状態遷移にする。
- 同じ`workspace_id`、`resource_type`、`operation_key`に複数のreservationを作らない。同じkeyでfingerprintが違う要求は拒否する。
- `current committed usage + sum(active reserved) + candidate planned`がplan上限を超えるtransactionは、どの並行要求もproviderへ進めない。
- `resource_type = r2_write`では`resource_ref`、dispatch前に固定した`provider_operation_ref`、`expected_size_bytes`、`expected_checksum_sha256`をすべて必須にし、`expected_size_bytes = planned_bytes`を検証する。R2の`planned_bytes`、`reserved_bytes`、`committed_bytes`はすべて非nullの非負値とし、秒用の`planned_seconds`、`reserved_seconds`、`committed_seconds`はすべてnullにする。`browser_run`では`resource_ref`とdispatch前に固定した`provider_operation_ref`を必須にし、`planned_seconds`、`reserved_seconds`、`committed_seconds`はすべて非nullの非負値、byte用の`planned_bytes`、`reserved_bytes`、`committed_bytes`と`expected_size_bytes`、`expected_checksum_sha256`はすべてnullにする。片側だけをnullにする組み合わせは受け付けない。
- R2のprovider write intentまたはobject locatorには`reservation_id`、`resource_ref`、`lease_generation`を拘束し、古い世代のwriterが外部objectをcommitできないことを確認する。providerが世代fenceを強制できない場合は、state CASだけで不在を確定せず、`provider_operation_ref`によるlookupとoriginal writerのprovider-terminal proofが揃うまで`held_result_unknown`として保持する。
- `r2_write`の`result_unknown`は、not nullの`provider_operation_ref`でoriginal storage attemptをlookupし、terminal proofまたは世代fenceが確認できるまで`held_result_unknown`として保持する。`confirmed_non_start`へ遷移する場合も、未使用の参照をterminal/audit相関として保持し、別のprovider operationへ再利用しない。同じoperation keyの同一fingerprint retryだけが同じimmutable参照を再利用でき、異なるfingerprintや別operation keyへ付け替えない。

## Browser Run startのresponse mapping

このdurable stateのHTTP mappingは`docs/05-api/external-cost-reservation-api.md`とADR-0029に従う。HTTPのterminal応答`200`はdurable enumの`committed`等を返すresponse mappingであり、`terminal`という新しいdurable statusを追加しない。

| 分岐 | HTTP結果 | durable state / reservation |
|---|---|---|
| 同一`workspace_id`、`resource_type=browser_run`、`operation_key`のcommitted retry | `200` | 同じreservationを返し、新規dispatch・quota candidateを作らない |
| 同一keyのin-flightまたは`result_unknown` retry | `202 RESERVATION_RESULT_UNKNOWN` | 同じreservationをreconciliationまで保持する |
| 同じkeyで`request_fingerprint`が相違 | `409 RESERVATION_REQUEST_MISMATCH` | 既存reservationを変更・解放しない |
| 新規keyのegress/P0 gate disabled・未完了 | `503 BROWSER_EGRESS_NOT_VERIFIED` | reservation/provider operationを作らない |
| 新規keyのquota/capacity超過 | usage reservation拒否 | providerへ通信せずreservationを確定しない |

live-url、capture commands、mobile preview navigate/reloadはこのmappingの対象外であり、start reservationのrowを作成・lookup・再送しない。別契約がAcceptedになるまで既存egress/P0 fail-closed境界を維持する。

## 認可・公開境界

将来Supabase/Postgresへ適用する場合も、`cost_reservations`へのclient direct DMLと匿名公開を許可しない。workspace境界のRLSを有効化し、Workerの認可済みportとreconciliation serviceに必要な最小権限だけを付与する。RLS、grant、transaction lock、lease fenceの実装とnegative testは、migrationを行う別の実装Issueで同じ縦切りとして追加する。

reservation state、fingerprint、terminal proofにはsecret、Cookie、Authorization、入力値、実ユーザー操作内容、providerの生レスポンスを保存しない。監査にはreservation ID、resource type、状態、結果コード、digest、時刻だけを残す。

## reconciliation outcome

`pending`または`held_result_unknown`の間は上限を消費したまま保持し、追加のprovider操作を別operation keyで始めない。reconciliationが終端証跡とobject/sessionを照合した後だけ、`confirmed_committed`（実績確定）または`confirmed_nonexistence`（未使用解放）へ遷移する。照合不能は再試行可能な`reconciling`として残し、推測で成功・失敗・解放を確定しない。
