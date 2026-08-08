# RLS negative test

Status: Accepted

## Purpose

Phase 1の品質ゲートとして、別ユーザーが他ワークスペースのデータを読めないことに加え、匿名RPCとowner/adminによる所有境界フィールドの改変が拒否されることを確認する。

このテストはアプリ公開URLとSupabase REST APIの両方を使って実行する。Supabase `service_role key` は使わない。

## Script

```text
scripts/rls-negative-test.mjs
```

## Required environment variables

```text
MECCHA_RLS_USER_A_EMAIL
MECCHA_RLS_USER_A_PASSWORD
MECCHA_RLS_USER_B_EMAIL
MECCHA_RLS_USER_B_PASSWORD
```

リモートURLに対して実行し、テストデータ作成を許可する場合は以下も必須。

```text
MECCHA_RLS_ALLOW_REMOTE_WRITE=I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED
```

任意:

```text
MECCHA_APP_ORIGIN
MECCHA_SUPABASE_URL
MECCHA_SUPABASE_ANON_KEY
```

`MECCHA_APP_ORIGIN` 未指定の場合はCloudflare Workersの開発URLを使う。Supabase公開設定は環境変数がなければ `wrangler.jsonc` から読む。

## Checks

1. ユーザーAでアプリAPIへログインできる。
2. ユーザーBでアプリAPIへログインできる。
3. ユーザーAでSupabase Authへ直接ログインできる。
4. ユーザーBでSupabase Authへ直接ログインできる。
5. ユーザーAがワークスペースAを作成できる。
6. ユーザーBがワークスペースBを作成できる。
7. ユーザーAのアプリ一覧にはワークスペースAが表示される。
8. ユーザーBのアプリ一覧にはワークスペースBが表示される。
9. ユーザーAのアプリ一覧にはワークスペースBが表示されない。
10. ユーザーBのアプリ一覧にはワークスペースAが表示されない。
11. ユーザーAのSupabase REST tokenではワークスペースBを直接読めない。
12. ユーザーBのSupabase REST tokenではワークスペースAを直接読めない。
13. ユーザーA/BのSupabase REST tokenでは相手の `workspace_members` を直接読めない。
14. anonymousロールでは `create_workspace` と `is_workspace_member` RPCを実行できない。
15. ownerが `workspaces` と `workspace_members` の識別子・作成監査項目を変更できない。
16. ownerが追加したadminも同じ所有境界フィールドを変更できない。

別ゲートの `npm run migrations:check` では、ワークスペースとメンバーの識別子・作成監査項目を更新不能にするtrigger、認証用RPCから匿名実行権限を剥奪するstatement、メンバー判定RPCの対象を`auth.uid()`へ限定する条件が存在することを静的に確認する。動的テストは検証環境へのmigration適用承認後にだけ実行する。

## Pass condition

スクリプトが `status: ok` を出して終了コード0で終わる。

静的migration検査は `npm run migrations:check` が終了コード0になれば合格とする。`npm run check` からも同じ検査を実行する。

## Fail condition

以下のいずれかで失敗する。

- どちらかのユーザーでログインできない。
- どちらかのユーザーが自分のワークスペースを作成できない。
- どちらかのユーザーが自分のワークスペースを読めない。
- どちらかのユーザーが相手のワークスペースをアプリAPI経由で読める。
- どちらかのユーザーが相手のワークスペースをSupabase REST経由で読める。
- どちらかのユーザーが相手の `workspace_members` をSupabase REST経由で読める。
- anonymousロールでワークスペースRPCを実行できる。
- ownerまたはadminがワークスペースやメンバーの識別子・作成監査項目を変更できる。

## Command

PowerShell例:

```powershell
$env:MECCHA_RLS_USER_A_EMAIL = "<user-a-email>"
$env:MECCHA_RLS_USER_A_PASSWORD = "<user-a-password>"
$env:MECCHA_RLS_USER_B_EMAIL = "<user-b-email>"
$env:MECCHA_RLS_USER_B_PASSWORD = "<user-b-password>"
$env:MECCHA_RLS_ALLOW_REMOTE_WRITE = "I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED"
npm run test:rls
```

## Safety

- テストユーザーのメールアドレスとパスワードはGitに保存しない。
- `service_role key`、DBパスワード、JWT Secretは使わない。
- リモートURLで実行する場合は明示ガードを必須にする。
- テストはワークスペースを2件作成し、片方へ検証用admin membershipを1件追加する。現時点では削除APIがないため、作成済みデータは残る。

## Remaining risk

このテストは `workspaces` と `workspace_members` の読み取り分離、匿名RPC拒否、owner/adminによる識別子・作成監査項目の更新拒否を確認する。最後のowner保護とowner移譲専用フローは引き続き別の動的テストが必要。将来はStorage private bucket testも追加する。
