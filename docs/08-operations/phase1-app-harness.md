# Phase 1 app harness

Status: Accepted

## Purpose

Cloudflare Worker上で、Supabase AuthとワークスペースRLSの接続を確認するための最初の実行可能なアプリを提供する。

## Scope

この段階で提供するもの:

- 日本語ログイン画面
- Worker経由のSupabase Authログイン
- HttpOnly Cookieによるセッション保持
- ログアウト
- ログイン中ユーザーのセッション確認
- 所属ワークスペース一覧
- `create_workspace` RPCによるワークスペース作成
- CSPなどの最低限のセキュリティヘッダー

この段階で提供しないもの:

- 手順書CRUD
- 操作を記録
- Browser Run
- Stripe
- 外部AI API

## Session policy

ブラウザJavaScriptにはSupabase access tokenとrefresh tokenを返さない。WorkerがSupabase Auth APIを呼び、セッションは以下のCookieで保持する。

- `__Host-mm_access`
- `__Host-mm_refresh`

Cookie属性:

- `HttpOnly`
- `Secure`
- `SameSite=Lax`
- `Path=/`

この方式はPhase 1のハーネスとして採用する。将来BFF/API境界を分離する場合も、クライアントへsecretを渡さない方針は維持する。

状態変更APIは、同一originの `Origin` ヘッダーと `Content-Type: application/json` を必須にする。大きなJSON bodyは拒否する。

## API

Phase 1で実装するAPI:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/session`
- `GET /api/workspaces`
- `POST /api/workspaces`

`POST /api/workspaces` はSupabase RPC `create_workspace(workspace_name, workspace_slug)` を呼ぶ。直接 `workspaces` へINSERTしない。

## Verification

最低限の確認:

- `/health/config` が `configured: true` を返す。
- Supabaseで作成したテストユーザーでログインできる。
- ワークスペースを1件作成できる。
- 作成後に一覧へ表示される。
- ログアウト後に `/api/session` が401を返す。
- 異なるoriginからの状態変更APIが403になる。
- 壊れたCookieが来ても500にならない。

## Known limitation

Phase 1では本格的なE2EとRLS negative testはまだ自動化していない。ログインとワークスペース作成の画面確認後、Phase 1品質ゲートとして別ユーザー分離テストを追加する。
