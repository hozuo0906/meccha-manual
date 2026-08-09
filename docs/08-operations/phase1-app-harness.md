# Phase 1 app harness

Status: Accepted

## Purpose

Cloudflare Worker上で、Supabase AuthとワークスペースRLSの接続を確認するための最初の実行可能なアプリを提供する。

## Scope

リポジトリに実装済みのハーネス:

- 日本語ログイン画面
- Worker経由のSupabase Authログイン
- HttpOnly Cookieによるセッション保持
- ログアウト
- ログイン中ユーザーのセッション確認
- 所属ワークスペース一覧
- `create_workspace` RPCによるワークスペース作成
- CSPなどの最低限のセキュリティヘッダー
- 401、接続失敗、サーバー失敗を区別する認証画面状態
- Supabase現在セッションの失効を伴うログアウト
- WorkerのCookie削除レスポンスを確認できない通信切断・中継エラー時に、セッション表示を維持する再試行可能な失敗状態
- Web Locksと非機密な認証世代nonceによる複数タブのlogin/logout/refresh直列化・待機中の古いlogout/refresh取消、認証変更時に旧shellを即時非表示にする通知、workspace作成・一覧更新の古い応答・失敗を破棄する競合制御
- 異origin、壊れたCookie、認証エラー非露出、ログアウト失効、refresh競合・失敗のWorker/UI認証テスト

Phase 1で追加するもの:

- SCR-WORKSPACEの画面状態とワークスペース選択
- SCR-MEMBERSのメンバー一覧とowner/admin/editor/viewer管理
- last-owner保護を含むメンバーAPI
- SCR-SHELLの日本語ナビと権限別UI
- 画面別の空、読込、保存、失敗、権限不足、接続切断、期限切れ状態
- WCAG 2.2 AAを目標とするアクセシビリティ検査

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

ハーネスに実装済みのAPI:

- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `GET /api/session`
- `GET /api/workspaces`
- `POST /api/workspaces`

`POST /api/workspaces` はSupabase RPC `create_workspace(workspace_name, workspace_slug)` を呼ぶ。直接 `workspaces` へINSERTしない。

`POST /api/auth/logout` は現在セッションをSupabase Authで失効してからCookieを削除する。認証サーバーの失効確認に失敗した場合も端末Cookieは削除し、成功扱いにせず日本語の再試行案内を返す。

通常の保護GETと業務APIはrefresh tokenを交換せず、access token失効時に`SESSION_REFRESH_REQUIRED`を返す。ブラウザは最初の要求前に認証世代を固定し、認証Web Lockの取得後に元の要求を現在のsessionで再確認する。なおrefreshが必要な場合だけ、`POST /api/auth/refresh`とrefresh後の1回再試行を同じlock内で完結させる。認証世代が変わった状態変更要求は再送しない。refresh後のCookieを通常APIの処理結果へ同梱しないため、後続のprofile/workspace取得失敗でも回転済みtokenを失わない。

Phase 1ではメンバー一覧、追加、ロール変更、停止用APIを小分けIssueで追加する。APIはowner/admin/editor/viewerの認可を行い、RLSを最終防衛線とする。最後のactive ownerの停止、削除、降格を拒否する。owner移管は専用フローの設計がAcceptedになるまで提供しない。

## Verification

リポジトリ内の静的検査で確認するもの:

- 必須API、Cookie属性、同一origin検査が実装から失われていない。
- Phase 1 migrationとhardening migrationが順序どおり存在する。
- RLS negative testの手順と必要環境変数が文書化されている。

外部dev/staging環境で実行が必要な確認:

- `/health/config` が `configured: true` を返す。
- Supabaseで作成したテストユーザーでログインできる。
- ワークスペースを1件作成できる。
- 作成後に一覧へ表示される。
- ログアウト後に `/api/session` が401を返す。
- ログアウト送信中の通信切断・中継エラーではログイン画面へ遷移せず、未完了案内から再試行できる。
- 異なるoriginからの状態変更APIが403になる。
- 壊れたCookieが来ても500にならない。
- token期限切れ後に再ログインできる。
- 別タブのlogin/logoutとrefreshが競合しても、古いrefresh応答で新しいCookieを上書きしない。
- A社ユーザーがB社のworkspaceとworkspace_membersをAPIとDBから読めず、変更できない。
- owner/admin/editor/viewerの許可・拒否がAPIとRLSで一致する。
- 最後のactive ownerを停止、削除、降格できない。
- AC-012、AC-013、AC-014のUI状態、アクセシビリティ、権限別UIを確認できる。

## 未完了と外部環境の境界

RLS negative testスクリプトはリポジトリに存在するが、外部Supabase環境、検証用ユーザー、対象migrationの適用が必要である。リポジトリにmigrationがあることを、dev、staging、productionのいずれかへ適用済みという根拠にしてはならない。外部環境へデータを作成する動的テストと新規migration適用は、対象環境と承認を確認してから実行する。

メンバー管理API/UI、本格E2E、画面状態とアクセシビリティの自動検査は未実装であり、P1-01からP1-10のIssueで完了させる。
