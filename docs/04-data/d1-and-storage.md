# D1データ・認可境界

Status: Accepted

### Migration compatibility floor

各D1 migrationは、直前schemaで稼働中のWorkerが読み書きできる compatibility floor を維持し、破壊的変更を単独で適用しない。migration適用後に旧Workerをrollbackする必要がある場合は、そのfloorを満たすmigrationだけを許可する。floorを満たせない場合はrollbackせず、書き込みをfail closedにして承認済みforward-fixを同じmigration履歴へ追加する。code-only rollbackはschemaを変更せず、対象migrationとの互換性を検査できる場合に限る。

## 目的

ADR-0028に基づき、Cloudflare D1を業務データとファイルメタデータの正本にする。Postgres RLSの暗黙適用を前提にせず、Worker認可とworkspace固定queryを検証可能な契約として定義する。

本書は目標設計であり、既存Supabase migrationをD1へ適用済みという意味ではない。実装・staging反映はIssue #176の後続マイルストーンで行う。

## 共通型

- ID: canonical UUIDを格納する `TEXT`
- 日時: UTCのISO 8601を格納する `TEXT`
- boolean: `0` / `1` の `INTEGER`
- 金額: 最小通貨単位の `INTEGER`
- JSON: schema検証後に格納する `TEXT`
- role/status/state: 許可値を `CHECK` で固定する
- 外部キーとunique indexを有効にし、migration検査で欠落を拒否する

## 認証主体

Access application JWTをWorkerが検証した後、検証済みissuerとsubjectの組をapplication identityへ解決する。

- emailだけをidentityの主キーにしない
- 未検証headerをidentityへ使わない
- Accessへ到達できても、D1上のactive identityまたはmembershipがなければ業務APIを拒否する
- 検証後のactorを `access_user | service_token` として明示する。人間向け業務APIは `access_user` と空でないAccess `sub` を必須にし、空の `sub`、`common_name` を持つservice-token JWT、actor種別が曖昧なJWTをapplication userへ写像しない
- service tokenはmachine専用routeだけに許可し、D1 identity/workspace/roleへ昇格させず業務データ操作を拒否する
- password、password hash、Access JWT、OTP、Access authorization cookieをD1へ保存しない
- Access subject再発行、email変更、招待照合、退会後の再登録はOQ-029で確定する

## 初期テーブル

| テーブル | 主な責務 | 境界 |
|---|---|---|
| `identities` | Access issuer/subjectとapplication userの対応 | subjectはtrim後非空、issuer + subjectをunique。statusはactive/disabled。service tokenは保存しない |
| `profiles` | 表示名、locale、timezone | application user IDと1対1。必要最小限だけ返す |
| `workspaces` | workspaceの名称、slug、状態 | 作成主体・作成日時・IDを不変にする |
| `workspace_members` | user、workspace、role、status | workspace + userをunique。owner喪失をtransactionで拒否 |
| `workspace_join_codes` | 本人同意型の短命参加 | digestだけを保存し、単回使用・期限・失効を強制 |
| `manuals` | 手順書とdraft/published pointer | workspace境界と期待versionを必須にする |
| `manual_revisions` | draft/published/superseded revision | 公開版を不変にする |
| `manual_steps` | 手順、順序、操作情報 | revision workspaceを再照合し、active上限を強制 |
| `audit_logs` | 重要操作の監査 | token、OTP、email本文、入力値、URL秘密値を保存しない |
| `assets` | private R2 objectのメタデータ | R2 keyを推測不能にし、workspace認可後だけ参照する |

既存の課金、共有、分析、Browser Run関連テーブルは、対応Phaseの移行IssueでD1 schemaを確定する。

## Provider callback replay境界

Stripe/Discord callbackは、raw bodyの署名・署名対象timestampを副作用なしで検証し、有界parse/schema・allowlist検証後に次を単一のatomic guard operationでauthoritative storeへ保存する。

- provider種別、event/interaction ID、payload digest
- receipt state、attempt、processing lease期限、次回試行時刻
- 再実行に必要な最小workまたはdurable outbox参照
- 作成時刻、更新時刻、完了時刻、監査用error code

初期状態は `received` とし、guard commit成功後だけproviderへ成功応答する。保存済みoutboxからdispatcherを起動し、Queue、外部API、業務D1、entitlementその他の副作用へ進める。guard commitとQueue投入の間で停止してもoutboxから回収できることを必須にする。

receipt/workは `received`、lease付き`processing`、`retryable`、`reconcile_required`、`completed`、`dead_letter` の明示遷移表を持つ。一時失敗と期限切れprocessing leaseは同じreceiptを再開する。外部APIの結果不明は `reconcile_required` とし、idempotency keyまたは決定的correlation markerで照合するまで副作用を自動再送しない。上限到達は `dead_letter` として監査・運用アラート・明示再開対象にし、受理済みworkを黙って失わない。

同じprovider ID・同じpayload digestの再送は新しいreceipt/workを作らず、状態に応じて維持、再開、照合、冪等successとする。同じID・異なるdigestは拒否して監査する。既存のDiscord KV get→putはatomic compare-and-setではないため、単独のauthoritative replay guardにしない。

具体的なCloudflare-native store、atomic receipt/work、lease、dispatcher、保持する最小payloadはOQ-031をIssue #176 M2で解決する。D1を選ぶ場合はtable定義、migration、unique constraint、state CHECK、lease index、outbox、途中失敗・並行再送・結果不明negative testを同じPRへ含める。選択・実装・検証が完了するまでpath別Access Bypassを有効化しない。

### Lease fencing

`processing` の取得または再開ごとに単調増加する `lease_generation`（fencing token）を発行する。更新・完了・outbox dispatch予約は最新generationとの一致を条件にし、古いleaseのworkerはcommit・副作用を行えない。期限切れは同じworkの再取得へ戻し、lease期限だけを見た無条件更新は合格にしない。

## Query contract

- 業務repository APIは `actorId` と `workspaceId` を必須引数にする。
- resource IDだけで更新・削除する共通関数を作らない。
- readはactive membershipを照合し、mutationはrole/statusも同じ処理で照合する。
- viewer、disabled member、別workspace、存在しないresourceをnegative testで区別なく拒否する。
- owner変更、最後のactive owner、公開、archive、step reorderは、単一の条件付きSQL、`D1Database.batch()`、schema constraint/triggerを組み合わせたD1対応のatomic operationとして設計し、workspace/status/期待versionを再照合する。interactive transaction APIの存在を前提にしない。
- mutation結果不明時は自動再送せず、冪等keyまたは再読取で確認する。
- listは固定field、固定order、明示limitを必須にする。

## Migration contract

- `migrations/` 配下のD1 SQLを連番で管理する。
- migration履歴tableをstaging/productionごとに保持する。
- destructive migration、table rebuild、importはbackupとrestore rehearsalなしに実行しない。
- staging D1でschema、fixture、tenant negative test、競合、途中失敗を確認してからproduction候補にする。
- production D1作成・migrationはownerの個別承認があるまで行わない。
- 現時点では実データ移行を行わないため、SupabaseからD1へのcopy jobを作らない。

## R2

- bucketはprivateを維持する。
- object操作はWorkerのworkspace認可後だけ許可する。
- D1 metadataとR2 objectの部分失敗は状態機械と再試行で回収する。
- 共有リンクや短期URLはbucket公開の代わりに使わず、失効をWorkerで即時判定する。

## Quality gate

最低限、次の失敗を自動テストする。

- JWTなし、署名不正、issuer不一致、audience不一致、期限切れ
- Access認証済みだがapplication identityなし
- service-token JWTによる人間向け業務APIアクセスとD1 actor偽装
- disabled identity、未所属、停止member
- viewer mutation、別workspace、ID差し替え
- last-owner喪失
- version競合、batch途中失敗・全体rollback、再送
- workspace条件なしqueryの静的検出
- staging/production bindingの共有検出
