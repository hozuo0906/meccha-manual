# Phase 1 Supabase setup

Status: Accepted

## Purpose

Phase 1では、認証済みユーザーがワークスペースを作成し、所属ワークスペースのデータだけを読める土台を作る。

この手順はSupabase DashboardのSQL Editorで実行する。`service_role key`、DBパスワード、JWT Secretは使わない。baselineだけが適用された中間状態を作らないため、4ファイルを個別実行せず、必ず単一transaction bundleを使う。

## Migration

実行するファイル:

```text
supabase/migrations/202608010001_phase1_identity_workspaces.sql
supabase/migrations/202608010002_phase1_workspace_membership_hardening.sql
supabase/migrations/202608100001_phase1_workspace_input_hardening.sql
supabase/migrations/202608100002_phase1_member_management.sql
```

bundle内では上記の順に実行する。membership hardening migrationは、メンバー追加時の`created_by`を`auth.uid()`へ強制し、owner/adminによる更新でもワークスペースID、メンバー対象ユーザー、作成者、作成日時を変更できないようにする。また、認証用RPCの実行権限を`authenticated`へ限定する。input hardening migrationは、旧仕様で許容された既存名を制約検証前に正規化・64文字へ補正し、拡張空白だけの値を「名称未設定」へ置換したうえで、ワークスペース名をtrim後1〜64文字へ固定し、slug形式をRPCとテーブル制約の両方で検証する。member management migrationは、一覧、本人同意型の短命参加コード発行・利用、role/status変更、append-only監査、DELETEを含むlast-owner保護を追加する。productionへの適用は別途ユーザー承認を必要とする。

bundleは次のコマンドで標準出力へ生成する。生成物には接続先やSecretを含めない。

```bash
node scripts/phase1-migration-bundle.mjs > /tmp/meccha-manual-phase1.sql
```

生成後、最初の実行文が`begin;`、末尾が`commit;`であり、4つのmigration名とSHA-256が表示されることを確認する。生成SQLをリポジトリへcommitしない。

`npm run test:phase1-migration-bundle`は、単一transaction、4ファイルの順序、SHA-256マーカーを値非表示で自動検査する。`npm run check`とPhase 1 readiness workflowの両方から実行する。

作成される主な要素:

- `profiles`
- `workspaces`
- `workspace_members`
- `workspace_join_codes`
- `audit_logs`
- `workspace_role`
- `workspace_status`
- `workspace_member_status`
- `create_workspace(workspace_name text, workspace_slug text)`
- `is_workspace_member(target_workspace_id uuid, target_user_id uuid)`
- `has_workspace_role(target_workspace_id uuid, target_user_id uuid, allowed_roles workspace_role[])`
- `list_workspace_members(target_workspace_id uuid)`
- `create_workspace_join_code()`
- `redeem_workspace_join_code(target_workspace_id uuid, join_code text, target_role workspace_role)`
- `update_workspace_member(target_workspace_id uuid, target_user_id uuid, target_role workspace_role, target_status workspace_member_status)`

## RLS baseline

- RLSは `profiles`、`workspaces`、`workspace_members` で有効化する。
- 未ログインユーザーにはテーブル権限を渡さない。
- `workspaces` は所属メンバーだけが閲覧できる。
- `workspace_members` は同じワークスペースのメンバーだけが閲覧できる。
- `owner` と `admin` だけがメンバー管理RPCを実行できる。`workspace_members`へのclient直接INSERT/UPDATE/DELETEは許可しない。
- `owner` の直接昇格、直接降格、最後のowner削除は専用フローまで禁止する。
- ワークスペースとメンバーのID、所属先、対象ユーザー、作成監査項目は更新を禁止する。
- 認証用RPC、参加コードRPC、メンバー管理RPCは匿名ユーザーに実行権限を与えない。
- ワークスペース作成は直接INSERTではなく `create_workspace` RPCを使う。

## Staging verification — 2026-08-13

対象は暫定dev/staging Supabase projectのみ。production資源は変更していない。

確認時点ではPhase 1 baselineとPhase 2 schemaが既に存在していた一方、Phase 1 hardeningの一部とmember management要素が未適用だったため、正本migrationとの差分を確認したうえで以下をstagingへ適用した。

```text
202608010002_phase1_workspace_membership_hardening.sql
202608100001_phase1_workspace_input_hardening.sql
202608100002_phase1_member_management.sql
```

既に存在していた正本schemaは再適用せず、最終的なmigration履歴を次の6本へ同期した。

```text
202608010001 phase1_identity_workspaces
202608010002 phase1_workspace_membership_hardening
202608020001 phase2_manual_core
202608020002 phase2_manual_create_context_fix
202608100001 phase1_workspace_input_hardening
202608100002 phase1_member_management
```

staging DBセッションで次のnegative testを実施し、すべて期待どおり拒否されたことを確認した。

- 他ワークスペースのrow参照
- 他ワークスペースのmember row参照
- `is_workspace_member` のtarget user spoof
- `has_workspace_role` のtarget user spoof
- anonymousからの保護RPC実行
- `workspace_members`へのclient直接INSERT/UPDATE
- 最後のactive ownerの停止・削除
- workspace identity / member作成監査項目の変更

あわせて、`workspace_join_codes`、`audit_logs`、last-owner protection trigger、workspace identity protection trigger、workspace名制約、認証済みユーザー限定RPC権限が存在することを確認した。この実検証では`service_role key`、Database password、JWT Secretを取得・使用していない。

この確認により、Issue #38の「staging migration適用・migration履歴整合・DBセッションRLS negative test」部分は完了として扱える。ただし、Issue #38の受入条件に含まれる `npm run test:rls` の実アカウントE2Eは未完了である。専用テストユーザー2名の資格情報を安全にCIへ渡す経路が確立するまで、Issue #38全体を完了扱いにしない。

## Manual setup steps

新しいstaging環境または未適用環境へ正本migrationを適用するときは次の手順を使う。

1. 適用対象がstaging projectであることと、現在のmigration履歴を画面上で確認する。
2. `node scripts/phase1-migration-bundle.mjs > /tmp/meccha-manual-phase1.sql` を実行する。
3. 生成物のmigration名、SHA-256、transaction境界を確認する。
4. Supabase Dashboardを開く。
5. 左メニューの `SQL Editor` を開く。
6. `New query` を押す。
7. 生成したbundle全文を1つのqueryへ貼る。
8. `Run`を1回だけ押し、途中で個別statementを再実行しない。
9. エラー時はtransaction全体がrollbackされたことを確認し、原因確認前に再実行しない。

旧名 `202608020003_phase1_workspace_membership_hardening.sql` はPhase 2より後へ並ぶため使用しない。既存環境ではbundleを無条件に再実行せず、migration履歴、関数権限、trigger、既存データを先に確認し、正本との差分だけをforward migrationとして適用する。

## Expected result

成功すると、SQL Editorにエラーが出ず、Table Editorに以下が見える。

- `profiles`
- `workspaces`
- `workspace_members`
- `workspace_join_codes`
- `audit_logs`

Authenticationで新規ユーザーを作成すると、`profiles` に同じユーザーIDの行が自動作成される。

4 migrationの適用後は、`workspaces_protect_identity` triggerと`workspaces_name_length`制約が存在し、認証済みユーザーがメンバー判定RPCで照会できる対象ユーザーは自分自身に限定される。`workspace_members`の新規行は、入力値にかかわらず`created_by = auth.uid()`になる。`create_workspace`を直接呼んでも、名前とslugの入力契約を迂回できない。メンバー追加は本人が発行した256 bit・10分有効・単回使用の参加コードだけを受け付け、DBにはSHA-256 digestだけを保存する。メンバー管理RPCはactive memberだけに一覧を返し、変更はowner/adminへ限定し、owner変更・最後のactive ownerの停止・削除を拒否する。所属追加・復帰・role/status変更は同一transactionの`audit_logs`へ追記される。

## Do not paste

以下はSQL EditorにもMarkdownにも貼らない。

- Supabase `service_role key`
- Database password
- JWT Secret
- Connection string
- 実ユーザーの個人情報

## Next quality gate

staging migrationとDBセッションRLS negative testは2026-08-13に完了済み。次の未完了gateは、専用テストユーザー2名の資格情報を安全なCI secret経路へ登録し、実stagingに対して `npm run test:rls` を実行して `status: ok` を得ること。

そのE2Eでは少なくとも以下を確認する。

- ログインできる。
- ログイン後に自分のワークスペースを作れる。
- 別ユーザーは他ワークスペースを読めない。
- `viewer` は更新できない。
- `owner` が最後のownerを失わない。
