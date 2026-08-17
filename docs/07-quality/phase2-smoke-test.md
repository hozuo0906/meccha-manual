# Phase 2 smoke test

Status: Accepted

## Purpose

Phase 2 migrationをSupabaseへ適用したあと、手順書の中核DB操作がanon keyと認証済みユーザーだけで通ることを確認する。

## Command

```bash
npm run test:phase2
```

## Required environment variables

- `MECCHA_PHASE2_USER_A_EMAIL`
- `MECCHA_PHASE2_USER_A_PASSWORD`
- `MECCHA_PHASE2_USER_B_EMAIL`
- `MECCHA_PHASE2_USER_B_PASSWORD`
- `MECCHA_PHASE2_ALLOW_REMOTE_WRITE=I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED`

任意:

- `MECCHA_APP_ORIGIN`
- `MECCHA_SUPABASE_URL`
- `MECCHA_SUPABASE_ANON_KEY`

## Checks

- User Aがアプリ経由でワークスペースを作成できる。
- User Aが `create_manual` RPCで手順書と下書きrevisionを作成できる。
- User Aが下書きrevisionへ手順ステップを追加できる。
- User Aが内容versionと機密情報確認を伴う `publish_manual_revision` RPCで公開版を作成できる。
- 公開済みrevisionへ直接ステップ追加できない。
- User Aが `create_manual_draft_from_published` RPCで公開版から次の下書きを作成できる。
- User BがUser Aのワークスペースへ手順書を作成できない。
- User BがUser Aの手順書、revision、ステップをSupabase RESTから直接読めない。

## Data

このテストはリモート環境に検証用ワークスペース、手順書、revision、ステップを作成する。
実行には remote write guard を必須にし、誤実行を防ぐ。

秘密値、service role key、DB password、JWT Secret、connection stringは使わない。
