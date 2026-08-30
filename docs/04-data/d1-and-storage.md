# D1データ・認可境界

Status: Accepted

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
