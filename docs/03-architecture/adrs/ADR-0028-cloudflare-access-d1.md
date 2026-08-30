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

## Authorization boundary

Postgres RLSの置換は、UI表示制御だけで完了扱いにしない。

- 全業務queryは認証主体と `workspace_id` を入力として固定する。
- repository層はworkspace境界なしの汎用更新・削除APIを公開しない。
- mutationはrole、membership status、resource workspace、期待versionを同じWorker処理で再照合する。
- 別workspace、不明resource、権限不足の応答から存在を推測できないようにする。
- D1の制約、外部キー、unique index、version列をWorker認可と併用する。
- 未招待、停止member、viewer mutation、owner喪失、ID差し替え、途中失敗、再送、競合をnegative testへ含める。
- `access_user` は空でない `sub` を必須にし、空の `sub`、service tokenを示す `common_name`、またはactor種別が曖昧なtokenをapplication userへ写像しない。D1 identityはtrim後のsubject非空制約と `UNIQUE(issuer, subject)` を持つ。
- `service_token` は明示allowlistしたmachine/health routeの到達確認だけに使用し、D1 identity、workspace membership、roleへ昇格させず、session/workspace/manual API、identity bootstrap、業務データread/mutationを403で拒否する。
- M1ではnbfなしservice-token fixtureをmachine routeで受理し、同じtokenを人間向け業務APIでは403にするactor別testを固定する。
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
- ADR-0003の永続正本をSupabase Postgresとする部分
- ADR-0011、ADR-0018のSupabase Auth/RLS/PostgresをR2認可・メタデータ正本とする部分
- ADR-0019のPhase 1 Supabase/RLS着手前gate
- ADR-0024のSupabase production設定・redirect allowlist固有手順
- ADR-0025のSECURITY DEFINER RPC/RLSによる参加コード実装方式（同意、短命、単回、digest保存の原則は維持）
- ADR-0027のSupabase project URL/anon keyをprelaunch環境境界とする部分

ADR-0003のDurable Objectと永続DBを二重正本にしない原則、ADR-0011/0018のprivate R2・Worker経由配信・環境別binding、ADR-0024のブランド/アプリ分離、ADR-0025の本人同意・短命・単回参加コード、ADR-0027のproduction非変更と環境分離は維持する。ADR-0010で定めたHttpOnly、同一origin、認証変更時の古い応答破棄、状態変更の自動再送禁止、結果不明時の再照合という安全原則も、新実装で維持する。

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
