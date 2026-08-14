# Phase 2 manual core setup

Status: Accepted

## Purpose

Phase 2では、手順書サービスとして成立するためのDB土台を作る。

この手順はSupabase DashboardのSQL Editorで実行する。Codexはユーザー承認なしにライブDBへmigrationを適用しない。

## Migration

ファイル名順に実行する:

```text
supabase/migrations/202608020001_phase2_manual_core.sql
supabase/migrations/202608020002_phase2_manual_create_context_fix.sql
supabase/migrations/202608140005_phase2_manual_title_length.sql
supabase/migrations/202608140010_phase2_manual_step_mutations.sql
supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql
```

前提migration:

```text
supabase/migrations/202608010001_phase1_identity_workspaces.sql
supabase/migrations/202608010002_phase1_workspace_membership_hardening.sql
```

`202608010002_phase1_workspace_membership_hardening.sql` を適用せずにPhase 2へ進めてはならない。migrationのファイル名順でもPhase 2より先に並ぶことを静的検査する。Phase 1本体だけでは、匿名RPC権限とワークスペース識別子・作成監査項目の不変条件が不足する。

`202608140005_phase2_manual_title_length.sql` は、`manuals.title` と `manual_revisions.title` のraw長を1〜64文字へ固定し、ECMAScript `trim()`相当後に空白だけとなる値を拒否するforward migrationである。既存行を切り詰めたり正規化したりせず、互換性のない既存データがある場合はconstraint validationを失敗させて安全に停止する。

`202608140010_phase2_manual_step_mutations.sql` は、4つのstep mutation RPCを同じdraft revision lockへ統一し、authenticatedの直接step DMLを閉じる。

`202608140012_phase2_manual_edit_http_contract.sql` は、draft metadataの原子的更新RPC、本文フィールド上限、manual/revisionのauthenticated direct write revokeを追加する。既存行を加工せず、上限違反があればconstraint validationで停止する。

## Scope

作成・強化される主な要素:

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
- `update_manual_draft(manual_id, title, description)`
- `append_manual_step` / `update_manual_step` / `soft_delete_manual_step` / `reorder_manual_steps`
- `manuals.title` と `manual_revisions.title` のraw 1〜64文字・ECMAScript空白のみ拒否DB制約
- draft descriptionとstep本文フィールドの上限DB制約

これらのmigrationには共有リンク、操作記録、Browser Run、Storage asset、課金、AI拡張は含めない。

## Rules

- すべての業務テーブルは `workspace_id` を持つ。
- RLSはdeny-by-defaultを前提に有効化する。
- ワークスペース所属メンバーだけが閲覧できる。
- `owner`、`admin`、`editor` だけが作成・更新できる。
- 手順書タイトルとrevisionタイトルは、WorkerでECMAScript `trim()`後1〜64 Unicode code pointへ正規化する。DB direct writeもraw 1〜64文字かつ同じ空白集合だけの値を拒否する。
- 公開済みrevisionとsuperseded revisionは本文・タイトル・説明を変更できない。
- `published -> superseded` の状態変更だけは、古い公開版を退役させるために許可する。
- 手順ステップとDOM候補はdraft revisionに対してだけ変更できる。
- 手順書作成は `create_manual` RPCを使う。
- 公開処理は `publish_manual` RPCを使う。
- 公開後の再編集は `create_manual_draft` RPCを使う。
- 手順書の公開状態、現在の下書き、現在の公開版はRPC以外で変更しない。
- manual作成、draft metadata更新、step mutationはSECURITY DEFINER RPCだけを利用し、authenticated direct DMLを許可しない。
- 詳細APIは200 active steps、6 MiBを上限とし、本文フィールド上限をDBとWorkerで一致させる。
- `workspace_id`、作成者、所有者などの所有境界フィールドは更新しない。

## Manual setup steps

1. Supabase Dashboardを開く。
2. 左メニューの `SQL Editor` を開く。
3. `New query` を押す。
4. migration履歴で `202608010002_phase1_workspace_membership_hardening.sql` の適用済みを確認する。未適用なら、ユーザー承認を得て先に同migrationを適用し、RLS negative testを実行する。旧名 `202608020003_phase1_workspace_membership_hardening.sql` が履歴にある場合は再適用せず、履歴整合を別途確認する。
5. `supabase/migrations/202608020001_phase2_manual_core.sql` の全文を貼り、`Run` を押す。
6. `supabase/migrations/202608020002_phase2_manual_create_context_fix.sql` の全文を貼り、`Run` を押す。
7. 既存の `manuals.title` と `manual_revisions.title` に65文字以上、またはECMAScript `trim()`相当後に空となる行がないことを確認する。
8. `supabase/migrations/202608140005_phase2_manual_title_length.sql` の全文を貼り、`Run` を押す。
9. `supabase/migrations/202608140010_phase2_manual_step_mutations.sql` の適用前に、step mutationを利用する全clientがRPC経由へ切替済みであることを確認する。
10. `supabase/migrations/202608140010_phase2_manual_step_mutations.sql` の全文を貼り、`Run` を押す。
11. description 10,000文字超、step title 128文字超、instruction 4,000文字超、target 256文字超、URL 2,048文字超の既存行がないことを確認する。
12. `supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql` の全文を貼り、`Run` を押す。
13. migration履歴、constraint、function権限を確認し、後述のRLS/RPC回帰テストを実行する。

## Expected result

成功すると、Table Editorに以下が見える。

- `folders`
- `manuals`
- `manual_revisions`
- `manual_steps`
- `step_targets`

さらに以下のconstraintが有効になる。

- `manuals_title_length`
- `manuals_title_nonblank`
- `manual_revisions_title_length`
- `manual_revisions_title_nonblank`
- `manual_revisions_description_length`
- `manual_steps_title_length` / `manual_steps_title_nonblank`
- `manual_steps_instruction_length`
- `manual_steps_target_text_length` / `manual_steps_target_text_nonblank`
- `manual_steps_url_length`
- `manual_steps_annotation_size` / `manual_steps_masking_size`
- `manual_steps_active_limit_guard` trigger

SQL Editorにエラーが出ないこと。constraint validationが失敗した場合は既存データを自動修正せず、対象行を確認してから再実行する。

## Verification plan

Phase 2 migration適用後に実行するテスト:

- editor以上は `create_manual` で手順書を作成できる。
- viewerは `create_manual` を実行できない。
- 同一ワークスペースのメンバーは手順書を閲覧できる。
- 別ワークスペースのユーザーは手順書を閲覧できない。
- 認証済みeditorのRLS経路で64文字のmanual/revisionタイトルを作成・更新できる。
- 認証済みeditorのRLS経路でも65文字以上、およびタブ・NBSPなどECMAScript空白だけのmanual/revisionタイトルはDB constraintで拒否される。
- `update_manual_draft`はmanual titleとcurrent draft title/descriptionを同じtransactionで更新する。
- authenticatedはmanual/revision/stepを直接変更できず、editorは承認済みRPC経由で変更できる。
- draft revisionの手順ステップは追加・更新・soft delete・並べ替えできる。
- viewer、anon、別workspaceはmutation RPCを実行できない。
- 200 active stepsと本文フィールド上限を超える入力・応答を拒否する。201件目はDB triggerで拒否し、内部annotation/maskingは各64 KiB以下とする。
- published revisionの手順ステップは変更できない。
- `publish_manual` 後、公開版が不変になる。
- `create_manual_draft` で公開版から次の下書きを作れる。

リポジトリではタイトル境界に加え、`tests/sql/phase2-manual-edit-http-fixture.sql`、`tests/sql/phase2-manual-edit-http-test.sql` と `Manual Edit API` workflowが、使い捨てPostgresへstep/draft migrationを実適用してRPC・権限・上限を検証する。

## Do not paste

以下はSQL EditorにもMarkdownにも貼らない。

- Supabase `service_role key`
- Database password
- JWT Secret
- Connection string
- 実ユーザーの個人情報

## Next step

ユーザー承認を得て全migrationとRLS回帰テストを対象環境へ適用したあと、Phase 2のAPI/画面を小さく分けて実装する。
