# ADR-0029: Browser Run start予約state machineをroute共通契約として固定する

Status: Accepted

Date: 2026-08-24

## Context

Cloudflare Browser Runは、開始後に実行時間と同時実行数を安全に取り戻せるとは限らない外部原価を伴う。DEC-064は、providerへdispatchする前に残り時間と同時実行数を原子的に予約し、結果不明の再送を同じ予約へ集約し、original writerがterminal/fencedになるまで解放しないことを要求している。OQ-005とOQ-006が未解決の間は、egressのP0証跡がない新規起動をfail closedにする。

Issue #131 / PR #133では、capture-session createとmobile preview session createのroute固有境界を局所文言で揃えようとしたが、2 review cycleにわたり、reservationの順序、same-key retry、mobile preview専用のidentityと状態の責務が再発した。本ADRは、API/data/runtimeの実装を追加せず、後続契約が従うBrowser Run startの共通state machineを正本として固定する。

## Decision

### 適用対象とroute境界

このstate machineに入るのは、外部providerのBrowser Run startを発生させ得る次の2種類だけとする。

| operation kind | 対象 | route固有key |
|---|---|---|
| `capture_session_start` | 操作記録の新規Browser Run start | `operationKey` |
| `mobile_preview_session_start` | mobile preview sessionの新規Browser Run start | `mobilePreviewOperationKey`（永続化時はcanonicalなopaque `operationKey`へ正規化） |

live-url発行とcapture commands（navigate/reload）はstart reservation state machineへ入れず、各routeの既存egress/P0 fail-closed境界を維持する。mobile preview navigate/reloadはURI、method、request、正常2xx shapeを定義する別契約がAcceptedになるまで未実装・fail closedとする。これらのrouteにcapture-startのreservation lookupを拡張しない。

### 正規化されたidentity

外部要求がrouteごとのkey名を持っていても、reservationの正本は次の組で一意にする。

`workspaceRef + operationKind + opaque operationKey + requestFingerprint`

- `operationKind`は上表の列挙値のいずれかで、captureとmobile previewのkeyを相互利用しない。
- `operationKey`は秘密値、URL、Cookie、Authorization、provider payloadを含まないopaque値として扱う。
- 同じworkspace、kind、keyでfingerprintが一致すれば同じreservation stateを返す。fingerprintが異なれば既存stateを変更せず409で拒否する。
- captureのfingerprint入力は`operationKind`、workspace scope、manual scope、serverが受理した`requestedSeconds`とする。mobile previewは`operationKind`、workspace scope、opaqueなpreview target scope、serverが受理した`requestedSeconds`とする。具体的なHTTP field名・resource生成規則は後続のAPI/data契約で定義し、provider URLやraw commandを入力にしない。

### resourceRefとreservation dimensions

reservationはrouteを識別できるdiscriminated `resourceRef`を持つ。kindは`capture_session`または`mobile_preview_session`のいずれかとし、valueはopaqueなrepo-side参照とする。provider URL、secret、Cookie、raw payloadをresourceRefへ保存しない。

serverはentitlementとroute契約から、boundedな`plannedSeconds`と`plannedConcurrency`を導出する。clientの未検証値をそのまま上限計算へ使わず、現在使用量・他operationのactive reservation・今回のcandidateを同じlock/transaction境界で検証する。同じkeyの既存reservationはcandidateへ二重計上しない。

### canonical transition order

新規keyと既存keyで順序を分け、disabled要求がcapacityを消費しないことを不変条件にする。

1. authentication、same-origin、workspace role、tenant entitlement、request envelopeを検証する。ここでは既存retryを新規開始として扱わない。
2. route kindを決定し、kind固有keyで既存reservationをlookupする。
3. 既存reservationがある場合はfingerprint/stateを照合する。同一fingerprintならegress、quota、capacityを再評価せず、terminal stateは`200`、in-flightまたは`result_unknown`は`202 RESERVATION_RESULT_UNKNOWN`で同じreservationを返す。providerへ新しいdispatchを行わない。fingerprint mismatchは`409 RESERVATION_REQUEST_MISMATCH`で拒否する。
4. 既存reservationがない新規keyだけ、egress/P0 gateを検証する。disabled、missing、期限切れ、または不十分な証跡は`503 BROWSER_EGRESS_NOT_VERIFIED`で停止し、reservationもprovider operationも作らない。
5. gateを通過した新規keyだけ、時間と同時実行数のcandidateをatomicに検証してreservationを確定する。quota/capacity超過は既存契約の拒否状態で停止し、providerへ通信しない。
6. reservation確定後、dispatch前にprovider-supported operation referenceをopaqueに生成し、reservationへdurableに固定する。provider refを固定できない場合はdispatchしない。
7. reservation、lease、provider referenceの整合を再確認してからproviderへdispatchする。dispatch後の応答消失や結果不明は同じreservationの`result_unknown`として扱い、別のkeyや新しいreservationを作らない。

### stateとfencing不変条件

- reservationの状態遷移は`reserved`、`dispatching`、`result_unknown`、`terminal`、`released`を明示し、状態をbooleanの組み合わせで表現しない。
- writer commitとreconciliationは`leaseGeneration`をCASするfencing境界を必須とする。単なる単調増加値の保存だけではcommit/releaseを成功扱いにしない。
- `result_unknown`はprovider operation referenceのlookupとreconciliationが完了するまで保持する。original writerがterminal/fencedであること、またはprovider-terminal proofがあることを確認する前に、absent object/sessionを根拠にexpired reservationを解放しない。
- terminal/fenced、またはprovider-terminal proofが確認できた場合だけ、残余reservationの確定・解放を行う。confirmed non-start/nonexistenceとresult unknownを混同しない。
- すべてのtransitionはreservation ID、operation kind、lease generation、server時刻に結び付け、遅延した古いwriterが新しいstateを上書きできないようにする。

### response mapping

| 状態・分岐 | 契約結果 | reservation/providerの扱い |
|---|---|---|
| 同一keyのterminal retry | `200`、同じreservation state | 新しいreservation、provider dispatchを作らない |
| 同一keyのin-flightまたは`result_unknown` retry | `202 RESERVATION_RESULT_UNKNOWN`、同じreservation state | reconciliationまで保持し、新しいreservation/provider dispatchを作らない |
| 同一keyのfingerprint mismatch | `409 RESERVATION_REQUEST_MISMATCH` | 既存reservationを変更・解放しない |
| 新規keyのegress disabled/P0未完了 | `503 BROWSER_EGRESS_NOT_VERIFIED` | reservation/provider operationを作らない |
| 新規keyのquota/capacity超過 | 既存のusage reservation拒否 | reservationを確定せずproviderへ通信しない |

## Consequences

- captureとmobile previewで同じ外部原価保護を使いながら、route固有keyの取り違えとsame-key二重予約を防げる。
- egress gateをreservationより前に置くため、disabled要求が時間・同時実行数を消費しない。gate通過後はprovider dispatch前のatomic reservationを必須にできる。
- mobile previewの具体的なHTTP入力、DB列、RLS、provider refの永続形は未実装のまま残る。後続のAPI/data契約は本ADRのkind、identity、transition、status mappingを変更せずに定義する。
- OQ-005/OQ-006のP0証跡がない間は、state machineを定義しても新規Browser Runを有効化しない。

## Rejected alternatives

- capture-startのkeyをmobile previewへ流用する案は、route identityとresource境界を混同するため採用しない。
- provider dispatch後にreservationする案は、外部原価と同時実行数の競合を防げないため採用しない。
- egress gate後にreservationする順序をdisabled時だけ例外扱いする案は、同じ新規keyの状態遷移を分岐させて監査不能になるため採用しない。gateを通過した新規keyだけがatomic reservationへ進む。

## Scope boundary and follow-up

このADRはdesign-onlyであり、API文書、data schema、runtime/Worker/DO、migration、checker、fixture、provider通信、staging/production設定を変更・有効化しない。後続Issue/PRでAPI/data契約と実装を別々に回収し、各PRでこのADRとの整合を検査する。

## Evidence and acceptance

本PRで確認するのはADRとdecision-logの文書整合、既存docs/harness/full check、通常CI、exact-head reviewだけである。Browser Run、preview、Cloudflare dashboard、credentials、real dataにはアクセスしない。
