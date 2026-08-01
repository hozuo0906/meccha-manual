# Phase 2 manual core setup

Status: Accepted

## Purpose

Phase 2では、手順書サービスとして成立するためのDB土台を作る。

この手順はSupabase DashboardのSQL Editorで実行する。Codexはユーザー承認なしにライブDBへmigrationを適用しない。

## Migration

実行するファイル:

```text
supabase/migrations/202608020001_phase2_manual_core.sql
```

前提migration:

```text
supabase/migrations/202608010001_phase1_identity_workspaces.sql
```

## Scope

作成される主な要素:

- `folders`
- `manuals`
- `manual_revisions`
- `manual_steps`
- `step_targets`
- `manual_status`
- `revision_state`
- `manual_step_type`
- `manual_action_type`
- `can_view_manual(manual_id, user_id)`
- `can_edit_manual(manual_id, user_id)`
- `is_draft_revision(revision_id)`
- `create_manual(workspace_id, folder_id, title, description)`
- `publish_manual(manual_id)`
- `create_manual_draft(manual_id)`

このmigrationには共有リンク、操作記録、Browser Run、Storage asset、課金、AI拡張は含めない。

## Rules

- すべての業務テーブルは `workspace_id` を持つ。
- RLSはdeny-by-defaultを前提に有効化する。
- ワークスペース所属メンバーだけが閲覧できる。
- `owner`、`admin`、`editor` だけが作成・更新できる。
- 公開済みrevisionとsuperseded revisionは本文・タイトル・説明を変更できない。
- `published -> superseded` の状態変更だけは、古い公開版を退役させるために許可する。
- 手順ステップとDOM候補はdraft revisionに対してだけ変更できる。
- 手順書作成は `create_manual` RPCを使う。
- 公開処理は `publish_manual` RPCを使う。
- 公開後の再編集は `create_manual_draft` RPCを使う。
- 手順書の公開状態、現在の下書き、現在の公開版はRPC以外で変更しない。
- `workspace_id`、作成者、所有者などの所有境界フィールドは更新しない。

## Manual setup steps

1. Supabase Dashboardを開く。
2. 左メニューの `SQL Editor` を開く。
3. `New query` を押す。
4. `supabase/migrations/202608020001_phase2_manual_core.sql` の全文を貼る。
5. `Run` を押す。

## Expected result

成功すると、Table Editorに以下が見える。

- `folders`
- `manuals`
- `manual_revisions`
- `manual_steps`
- `step_targets`

SQL Editorにエラーが出ないこと。

## Verification plan

Phase 2 migration適用後に追加するテスト:

- editor以上は `create_manual` で手順書を作成できる。
- viewerは `create_manual` を実行できない。
- 同一ワークスペースのメンバーは手順書を閲覧できる。
- 別ワークスペースのユーザーは手順書を閲覧できない。
- draft revisionの手順ステップは追加・更新・削除できる。
- published revisionの手順ステップは変更できない。
- `publish_manual` 後、公開版が不変になる。
- `create_manual_draft` で公開版から次の下書きを作れる。

## Do not paste

以下はSQL EditorにもMarkdownにも貼らない。

- Supabase `service_role key`
- Database password
- JWT Secret
- Connection string
- 実ユーザーの個人情報

## Next step

このmigrationをSupabaseへ適用したあと、Phase 2のAPI/画面を小さく分けて実装する。

実装前にユーザー承認を受ける。
