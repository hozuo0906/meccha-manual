# ADR-0028: Cloudflare Access / Workers / D1へ認証・業務データを統一する

Status: Accepted

## Context

現行実装はSupabase Auth、Postgres、RLSを認証・業務データ・テナント分離の正本としている。一方、アプリ/API、preview保護、Browser Run、Durable Objects、R2はCloudflareを採用しており、環境分離、secret管理、障害切り分け、運用手順が複数control planeへ分散している。

2026-08-30 JSTにownerは、認証と業務DBもCloudflare中心へ移行する方針を承認した。外部ユーザーとproduction実データはまだ存在せず、不可逆なデータ移行は未発生である。

## Decision

目標構成を次へ変更する。

- 認証前段: Cloudflare Access self-hosted application
- 初期ログイン方式: メールOTPによる招待制
- application identity: Access application JWTの検証済みissuer、audience、subject
- アプリ/API: Cloudflare Workers
- 業務DB・ファイルメタデータ: Cloudflare D1
- ファイル本体: private Cloudflare R2
- 操作記録session: Durable Objects
- ワークスペース所属・owner/admin/editor/viewer: D1を正本とし、Workerで毎回認可する

Workerは `Cf-Access-Jwt-Assertion` の署名、issuer、audience、expiration、issued-at、token typeを検証し、not-beforeはclaimが存在する場合に検証する。未検証header、emailだけ、Access到達成功だけを業務認証として信用しない。Cloudflare Accessのidentity-based application tokenとservice-token application tokenはいずれも `type: "app"` になり得るため、検証後のactorを `access_user | service_token` として明示し、token typeだけで人間の業務主体を判定しない。正規のservice-token application tokenは `nbf` を持たない場合があるため、`nbf` の欠落だけでは拒否しない。

Accessはアプリへの到達可否を制御し、D1はアプリ内の招待、profile、workspace membership、role、statusを管理する。Accessへログインできても、activeな招待またはworkspace membershipがなければ業務APIを拒否する。

アプリ独自のpassword、password hash、refresh tokenをD1、KV、R2、Cookie、ログへ保存しない。ブラウザJavaScriptへAccess JWTを複製しない。

## External provider callback boundary

StripeとDiscordの外部providerは対話的なAccess loginやapplication JWTを送れないため、次の2 routeだけをhostname用Access applicationより具体的なpath別self-hosted Access applicationへ分離し、`Bypass / Include Everyone`を適用する。

- `POST /v1/webhooks/stripe`
- `POST /v1/integrations/discord/interactions`

より具体的なpath applicationをhostname applicationより優先させる。hostname全体、共通prefix、wildcard pathへBypassを適用しない。Bypassを認証・認可の代替にしない。

Workerのcallback処理順序を次へ固定する。

1. exact POSTとbody上限を確認する。
2. raw bodyのprovider署名・署名対象timestampを副作用なしで検証する。
3. 有界parse/schema検証とprovider固有allowlist検証を行う。
4. provider event/interaction ID、payload digest、receiptと再実行可能なwork/outboxを単一のatomic operationでauthoritative storeへ保存し、初期状態を `received` にする。このguard commitだけを業務処理前に唯一許すstate changeとする。
5. guard commit成功後だけproviderへ成功応答する。Stripeは2xx、Discordは3秒以内のdeferred responseとし、commit失敗時は成功応答しない。
6. 保存済みwork/outboxからdispatcherを起動し、Queue、外部API、業務D1、entitlementその他の副作用へ進める。

receipt/workは `received`、lease付き`processing`、`retryable`、`reconcile_required`、`completed`、`dead_letter` の明示状態機械で扱う。既知の一時失敗と期限切れprocessing leaseは同じreceiptを `retryable` として再開する。外部APIの結果不明は `reconcile_required` とし、provider idempotency keyまたは決定的correlation markerによる照合が済むまで副作用を自動再送しない。上限到達は `dead_letter` として監査・運用アラート・明示再開対象にし、受理済みworkを黙って失わない。

同じID・同じpayload digestの再送は新しいworkを作らず、`received/processing` は既存workを維持し、`retryable` または期限切れleaseは同じworkを再開し、`reconcile_required` は照合だけを進め、`completed` は冪等successを返す。同じID・異なるpayload digestは拒否して監査する。Queue投入失敗は永続outboxから再試行し、予約済みだが未処理のまま失われる隙間を作らない。

別method、subpath、body超過、署名欠落・不正、期限外はparse前、payload不正・ID欠落・provider allowlist不一致はguard commit前にfail closedで拒否する。callbackをAccess user、service token、D1 identity、workspace membershipへ写像しない。

通常のブラウザwrite APIは同一Originを必須にするが、この2 callbackでは `Origin` をcredentialや認証根拠にせずprovider署名を正とする。通常アプリAPIはAccess user用applicationで保護し、`GET /health/config` はservice-token用Access application/policyで保護する。authoritative store、atomic receipt/work、lease、dispatcherの具体方式はOQ-031をIssue #176 M2で解決し、実装・schema/migration・negative testが揃うまで環境を問わずpath別Access Bypassを有効化しない。productionでの作成・変更はM7の個別owner承認対象とする。

### Lease fencing

`processing` の取得または再開ごとに単調増加する `lease_generation`（fencing token）を発行する。receipt/workの更新、完了遷移、outbox dispatchの予約、外部副作用の開始は、保持中のgenerationがauthoritative storeの最新値と一致する場合だけ許可する。期限切れworker、再試行worker、二重dispatcherは古いgenerationのままcommit・dispatchできず、期限切れを検知したら副作用を行わず同じworkの再取得へ戻る。lease期限だけを見た無条件更新は合格にしない。

## Authorization boundary

Postgres RLSの置換は、UI表示制御だけで完了扱いにしない。

- 全業務queryは認証主体と `workspace_id` を入力として固定する。
- repository層はworkspace境界なしの汎用更新・削除APIを公開しない。
- mutationはrole、membership status、resource workspace、期待versionを同じWorker処理で再照合する。
- 別workspace、不明resource、権限不足の応答から存在を推測できないようにする。
- D1の制約、外部キー、unique index、version列をWorker認可と併用する。
- 未招待、停止member、viewer mutation、owner喪失、ID差し替え、途中失敗、再送、競合をnegative testへ含める。
- `access_user` は `type: "app"`、trim後非空の `sub`、`common_name` 不在の3条件すべてを必須にする。空の `sub`、`common_name`、またはactor種別が曖昧なtokenをapplication userへ写像しない。D1 identityはtrim後のsubject非空制約と `UNIQUE(issuer, subject)` を持つ。
- `service_token` は `type: "app"`、空文字の `sub`、trim後非空の `common_name` の3条件すべてを必須にし、明示allowlistしたmachine/health routeの到達確認だけに使用する。D1 identity、workspace membership、roleへ昇格させず、session/workspace/manual API、identity bootstrap、業務データread/mutationを403で拒否する。
- M1ではnbfなしservice-token fixtureをmachine routeで受理し、同じtokenを人間向け業務APIでは403にする。空の `sub` だけ、`sub` 不在、`common_name` だけ、非空 `sub` と `common_name` 併存のfixtureは全routeで拒否するactor別testを固定する。
- Cloudflare bindingへ到達できることを認可の根拠にしない。

## Environment boundary

stagingとproductionで次を共有しない。

- Access application、policy、audience
- D1 databaseとmigration履歴
- Worker、route、vars、secrets、service bindings
- R2 bucket
- GitHub Environment

previewはstaging専用D1だけをbindingし、production D1をbindingしない。production D1作成、migration、deploy、外部ユーザー招待はそれぞれownerの明示承認を必要とする。

## Migration

移行はIssue #176で段階実施する。

1. 正本文書と品質ゲートを更新する。
2. Access JWT検証とD1 workspace認可の最小spikeを作る。
3. D1 schema、migration、backup/restore、negative testを確立する。
4. Phase 1のsession、workspace、member API/UIを移行する。
5. Phase 2のmanual、revision、step、公開、archive処理を移行する。
6. stagingでOTP、D1、R2、preview分離を実証する。
7. runtimeからSupabase依存を削除し、不要な外部資格情報を失効する。

各段階で旧Supabase経路と新D1経路の暗黙fallbackや二重書込みを禁止する。切替点を明示し、失敗時はfail closedとする。

## Superseded decisions

このADRは次をSupersededにする。

- ADR-0001の「Cloudflare + Supabase」を採用する部分
- ADR-0004 Supabase Auth/Postgres/RLS採用
- ADR-0010のSupabase token、refresh、sign-out、PostgREST/RPCに依存する認証方式
- ADR-0012の `DISCORD_INTERACTION_STORE` KVによるget→putをauthoritative replay guardとする部分
- ADR-0003の永続正本をSupabase Postgresとする部分
- ADR-0011、ADR-0018のSupabase Auth/RLS/PostgresをR2認可・メタデータ正本とする部分
- ADR-0019のPhase 1 Supabase/RLS着手前gate
- ADR-0024のSupabase production設定・redirect allowlist固有手順
- ADR-0025のSECURITY DEFINER RPC/RLSによる参加コード実装方式（同意、短命、単回、digest保存の原則は維持）
- ADR-0027のSupabase project URL/anon keyをprelaunch環境境界とする部分

ADR-0003のDurable Objectと永続DBを二重正本にしない原則、ADR-0011/0018のprivate R2・Worker経由配信・環境別binding、ADR-0012のDiscord署名検証とGitHub Issue変換境界、ADR-0024のブランド/アプリ分離、ADR-0025の本人同意・短命・単回参加コード、ADR-0027のproduction非変更と環境分離は維持する。ADR-0010で定めたHttpOnly、通常ブラウザwrite APIの同一origin、認証変更時の古い応答破棄、状態変更の自動再送禁止、結果不明時の再照合という安全原則も、新実装で維持する。

## Consequences

- Postgres SQL、SECURITY DEFINER RPC、RLS policy、Supabase Auth API、PostgREST呼出しをD1/Worker契約へ移植する必要がある。
- DB層RLSによる最終防衛線がなくなるため、Worker認可とquery ownershipのレビュー・negative testがP0 gateになる。
- メールOTPの配信、Access user lifecycle、強制再認証、退会・停止、監査の運用を定義する必要がある。
- 既存Supabase実装とテストは移行完了まで履歴・回帰仕様として保持するが、staging合格証跡には使わない。
- Issue #92のAccess保護とproduction自動promote停止は維持できるが、Supabase RLS live gateはD1境界証明へ置換する。

## Non-goals

- このADRだけでproduction D1やAccess production applicationを作成しない。
- production deploy、実データ移行、実ユーザー招待を行わない。
- 独自password認証を実装しない。
- Access到達許可をworkspace role認可の代わりにしない。
