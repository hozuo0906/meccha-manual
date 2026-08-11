# RLS negative test

Status: Accepted

## Purpose

Phase 1の品質ゲートとして、別ユーザーが他ワークスペースのデータを読めないことに加え、匿名RPC、owner/admin/editor/viewerの権限境界、所有境界フィールドの改変拒否、最後のowner保護を確認する。

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
14. ユーザーA/BのSupabase REST tokenでは相手の `workspaces` と `workspace_members` を更新できず、相手側から読み直しても変更されていない。
15. anonymousロールでは `create_workspace`、`is_workspace_member`、参加コードを含むメンバー管理RPCを実行できない。
16. ownerが `workspaces` と `workspace_members` の識別子・作成監査項目を変更できない。
17. ownerが追加したadminも同じ所有境界フィールドを変更できない。
18. `workspace_members`へのclient直接INSERT/UPDATEがowner/adminでも拒否され、追加時の`created_by`は参加コード利用RPCの認証済み実行者へ固定される。
19. ownerとadminのどちらからも、最後のownerを降格または停止できない。
20. editorは所属ワークスペースと自分のmembershipを読めるが、ワークスペース設定とメンバー権限を変更できない。
21. viewerは所属ワークスペースと自分のmembershipを読めるが、ワークスペース設定とメンバー権限を変更できない。
22. 別ワークスペースのメンバーAPIは、ユーザーA/Bのどちらにも同じ404を返す。
23. ユーザーBが本人用参加コードを発行し、ownerがそのコードを1回だけ利用してeditorとして追加できる。
24. 使用済み参加コードの再利用は`409 JOIN_CODE_UNAVAILABLE`となり、membershipを重複作成しない。
25. ownerは参加済みメンバーをadmin、editor、viewerへ変更し、利用停止できる。
26. adminはメンバー変更APIを利用できるが、owner変更はできない。
27. editor/viewerはactiveメンバー一覧を取得できるが、追加・変更APIは403になる。
28. 最後のownerをメンバーAPIで降格・停止しようとすると409になる。
29. メンバー一覧APIは現在ユーザーのroleと固定fieldだけを返す。
30. 参加コードを連続発行すると旧コードは`409 JOIN_CODE_UNAVAILABLE`となり、新しいコードだけを利用できる。
31. 停止済みmembershipをメンバー変更RPCで`active`へ戻せず、本人が新しく発行した参加コードでだけ再参加できる。
32. メンバー追加・role変更・停止・再参加の監査recordがactor、action、resource、old/new metadataを保持し、冪等PATCHでは重複しない。
33. owner/adminだけが同じworkspaceの監査recordを読め、editor/viewerは読めない。
34. clientから`audit_logs`へのINSERT/UPDATE/DELETEが拒否される。

admin/editor/viewerの確認は、ユーザーBが発行した短命・単回使用の参加コードでワークスペースAへ参加した後、同じmembershipを `admin -> editor -> viewer` の順に変更して行う。別ワークスペースの読み取り拒否は、ユーザーBをワークスペースAへ追加する前に確認する。参加コード平文はテスト結果やログへ出力しない。

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
- どちらかのユーザーが相手の `workspaces` または `workspace_members` を更新できる。
- anonymousロールでワークスペースRPCを実行できる。
- ownerまたはadminがワークスペースやメンバーの識別子・作成監査項目を変更できる。
- メンバー追加時の`created_by`を認証済み実行者以外へ偽装できる。
- ownerまたはadminが最後のownerを降格または停止できる。
- editorまたはviewerがワークスペース設定やメンバー権限を変更できる。
- editorまたはviewerが所属ワークスペースや自分のmembershipを読めない。
- 別ワークスペースのメンバーAPIが404以外を返す、またはメンバー情報を返す。
- 本人発行の有効な参加コードをownerが利用できない、または使用済みコードを再利用できる。
- 再発行後も旧参加コードを利用できる、停止済みmembershipを通常の変更RPCで再開できる、または新しい参加コードで再参加できない。
- owner/adminがメンバーを変更・停止できない。
- editor/viewerがメンバー変更APIを実行できる。
- メンバーAPIから最後のownerを降格または停止できる。
- メンバー操作の監査recordでactor、action、resource、old/new metadataが欠落する、冪等PATCHで重複する、または再参加が記録されない。
- editor/viewerが監査recordを読める、owner/adminが同じworkspaceの監査recordを読めない、またはclientが監査recordを追加・更新・削除できる。

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
- テストはワークスペースを2件作成し、RLS直接検査とメンバーAPI検査のため、本人発行の参加コードを使って検証用membershipを追加する。片方はviewer、もう片方はremovedで残る。物理削除APIはないため、作成済みデータは残る。参加コードは10分で失効し、平文を保存しない。

## Remaining risk

このテストは `workspaces` と `workspace_members` の読み取り分離、匿名RPC拒否、client直接membership書込み拒否、本人発行参加コードの単回利用・再発行時の旧コード失効・新コードによる再参加、通常RPCでの停止済みmembership再開拒否、監査recordの内容・閲覧境界・追記専用性、owner/adminによる識別子・作成監査項目の更新拒否、editor/viewerの管理操作拒否、メンバーAPIの越境拒否・role境界・最後のowner保護を確認する。実DBの2接続を使う並行redeem・相互admin更新と、監査recordのtransaction rollback確認はstaging migration適用後の追加検証とする。owner移譲専用フローは未実装のため、専用フロー実装時に成功側の動的テストを追加する。将来はStorage private bucket testも追加する。
