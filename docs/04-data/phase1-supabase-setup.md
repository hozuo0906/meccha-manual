# Phase 1 Supabase setup

Status: Accepted

## Purpose

Phase 1では、認証済みユーザーがワークスペースを作成し、所属ワークスペースのデータだけを読める土台を作る。

この手順はSupabase DashboardのSQL Editorで実行する。`service_role key`、DBパスワード、JWT Secretは使わない。

## Migration

実行するファイル:

```text
supabase/migrations/202608010001_phase1_identity_workspaces.sql
supabase/migrations/202608020003_phase1_workspace_membership_hardening.sql
```

ファイル名順に実行する。hardening migrationは、owner/adminによる更新でもワークスペースID、メンバー対象ユーザー、作成者、作成日時を変更できないようにし、認証用RPCの実行権限を`authenticated`へ限定する。既存環境への適用はproduction反映と同様にユーザー承認後に行う。

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

1. Supabase Dashboardを開く。
2. 左メニューの `SQL Editor` を開く。
3. `New query` を押す。
4. `supabase/migrations/202608010001_phase1_identity_workspaces.sql` の全文を貼る。
5. `Run` を押す。
6. `New query` を押す。
7. `supabase/migrations/202608020003_phase1_workspace_membership_hardening.sql` の全文を貼る。
8. `Run` を押す。

## Expected result

成功すると、SQL Editorにエラーが出ず、Table Editorに以下が見える。

- `profiles`
- `workspaces`
- `workspace_members`

Authenticationで新規ユーザーを作成すると、`profiles` に同じユーザーIDの行が自動作成される。

両migrationの適用後は、`workspaces_protect_identity` triggerが存在し、認証済みユーザーがメンバー判定RPCで照会できる対象ユーザーは自分自身に限定される。実環境への適用と確認はユーザー承認後に行う。

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
