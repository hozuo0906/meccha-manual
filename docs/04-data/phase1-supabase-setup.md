# Phase 1 Supabase setup

Status: Accepted

## Purpose

Phase 1では、認証済みユーザーがワークスペースを作成し、所属ワークスペースのデータだけを読める土台を作る。

この手順はSupabase DashboardのSQL Editorで実行する。`service_role key`、DBパスワード、JWT Secretは使わない。

## Migration

実行するファイル:

```text
supabase/migrations/202608010001_phase1_identity_workspaces.sql
```

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
- ワークスペース作成は直接INSERTではなく `create_workspace` RPCを使う。

## Manual setup steps

1. Supabase Dashboardを開く。
2. 左メニューの `SQL Editor` を開く。
3. `New query` を押す。
4. `supabase/migrations/202608010001_phase1_identity_workspaces.sql` の全文を貼る。
5. `Run` を押す。

## Expected result

成功すると、SQL Editorにエラーが出ず、Table Editorに以下が見える。

- `profiles`
- `workspaces`
- `workspace_members`

Authenticationで新規ユーザーを作成すると、`profiles` に同じユーザーIDの行が自動作成される。

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
