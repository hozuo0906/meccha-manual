# Phase 1 Supabase setup

Status: Accepted

## Purpose

Phase 1では、認証済みユーザーがワークスペースを作成し、所属ワークスペースのデータだけを読める土台を作る。

この手順はSupabase DashboardのSQL Editorで実行する。`service_role key`、DBパスワード、JWT Secretは使わない。baselineだけが適用された中間状態を作らないため、2ファイルを個別実行せず、必ず単一transaction bundleを使う。

## Migration

実行するファイル:

```text
supabase/migrations/202608010001_phase1_identity_workspaces.sql
supabase/migrations/202608010002_phase1_workspace_membership_hardening.sql
```

bundle内ではファイル名順に実行する。hardening migrationは、メンバー追加時の`created_by`を`auth.uid()`へ強制し、owner/adminによる更新でもワークスペースID、メンバー対象ユーザー、作成者、作成日時を変更できないようにする。また、認証用RPCの実行権限を`authenticated`へ限定する。既存環境への適用はproduction反映と同様にユーザー承認後に行う。

bundleは次のコマンドで標準出力へ生成する。生成物には接続先やSecretを含めない。

```bash
node scripts/phase1-migration-bundle.mjs > /tmp/meccha-manual-phase1.sql
```

生成後、最初の実行文が`begin;`、末尾が`commit;`であり、2つのmigration名とSHA-256が表示されることを確認する。生成SQLをリポジトリへcommitしない。

`npm run test:phase1-migration-bundle`は、単一transaction、2ファイルの順序、SHA-256マーカーを値非表示で自動検査する。`npm run check`とPhase 1 readiness workflowの両方から実行する。

作成される主な要素:

- `profiles`
- `workspaces`
- `workspace_members`
- `workspace_role`
- `workspace_status`
- `workspace_member_status`
- `create_workspace(workspace_name text, workspace_slug text)`
- `is_workspace_member(target_workspace_id uuid, target_user_id uuid)`
- `has_workspace_role(target_workspace_id uuid, target_user_id uuid, allowed_roles workspace_role[])`

## RLS baseline

- RLSは `profiles`、`workspaces`、`workspace_members` で有効化する。
- 未ログインユーザーにはテーブル権限を渡さない。
- `workspaces` は所属メンバーだけが閲覧できる。
- `workspace_members` は同じワークスペースのメンバーだけが閲覧できる。
- `owner` と `admin` だけがワークスペースとメンバーを更新できる。
- `owner` の直接昇格、直接降格、最後のowner削除は専用フローまで禁止する。
- ワークスペースとメンバーのID、所属先、対象ユーザー、作成監査項目は更新を禁止する。
- 認証用RPCは匿名ユーザーに実行権限を与えない。
- ワークスペース作成は直接INSERTではなく `create_workspace` RPCを使う。

## Manual setup steps

1. 適用対象がstaging projectであることと、現在のmigration履歴を画面上で確認する。
2. `node scripts/phase1-migration-bundle.mjs > /tmp/meccha-manual-phase1.sql` を実行する。
3. 生成物のmigration名、SHA-256、transaction境界を確認する。
4. Supabase Dashboardを開く。
5. 左メニューの `SQL Editor` を開く。
6. `New query` を押す。
7. 生成したbundle全文を1つのqueryへ貼る。
8. `Run`を1回だけ押し、途中で個別statementを再実行しない。
9. エラー時はtransaction全体がrollbackされたことを確認し、原因確認前に再実行しない。

旧名 `202608020003_phase1_workspace_membership_hardening.sql` はPhase 2より後へ並ぶため使用しない。外部DBでbaselineまたは旧名hardeningが適用済みかは未検証である。どちらか一方でも適用済みの場合はbundleを実行せず、ユーザー承認のもとmigration履歴、関数権限、trigger、既存データを確認してforward-fixを作成する。

## Expected result

成功すると、SQL Editorにエラーが出ず、Table Editorに以下が見える。

- `profiles`
- `workspaces`
- `workspace_members`

Authenticationで新規ユーザーを作成すると、`profiles` に同じユーザーIDの行が自動作成される。

両migrationの適用後は、`workspaces_protect_identity` triggerが存在し、認証済みユーザーがメンバー判定RPCで照会できる対象ユーザーは自分自身に限定される。`workspace_members`の新規行は、入力値にかかわらず`created_by = auth.uid()`になる。実環境への適用と確認はユーザー承認後に行う。

## Do not paste

以下はSQL EditorにもMarkdownにも貼らない。

- Supabase `service_role key`
- Database password
- JWT Secret
- Connection string
- 実ユーザーの個人情報

## Next quality gate

次はSupabase上でmigrationを実行したあと、アプリ側に認証画面とワークスペース作成導線を作る。

その後に以下をテストする。

- ログインできる。
- ログイン後に自分のワークスペースを作れる。
- 別ユーザーは他ワークスペースを読めない。
- `viewer` は更新できない。
- `owner` が最後のownerを失わない。
