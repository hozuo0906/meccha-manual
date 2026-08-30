# Phase 1 app harness

Status: Superseded

実行禁止: ADR-0028、DEC-064、Issue #176により、本書は移行前Supabase/Auth/Postgres/RLS baselineである。新規資格情報、migration、remote write、live test、staging合格証跡の根拠にしない。後継はIssue #176 M1〜M3。

Superseded by [ADR-0028](../03-architecture/adrs/ADR-0028-cloudflare-access-d1.md) and [Cloudflare Access / D1 API移行契約](../05-api/cloudflare-access-d1-api.md)。以下は移行前の実装・回帰baselineとして保持する。新規Supabase test user、資格情報、migration、live testを追加せず、旧経路をstaging合格証跡へ使用しない。

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
- SCR-MEMBERSのメンバー一覧、本人発行の短命参加コードによる追加、role変更、利用停止
- owner/admin/editor/viewerのAPI/UI境界とlast-owner保護
- 反復ナビを飛ばす本文スキップ、日本語ナビ、現在のワークスペース、本人権限の未確認・確認済み表示
- キーボードで到達できるワークスペース・メンバー導線と可視フォーカス
- 44px以上の主要操作領域、200%ズームを想定した1列再配置、強制カラーモードの境界表示
- 状態通知のlive region、入力エラーの関連付け、名前付きの横スクロール表
- 未提供の手順書・操作記録を操作不能な「準備中」として表示
- CSPなどの最低限のセキュリティヘッダー
- 401、接続失敗、サーバー失敗を区別する認証画面状態
- Supabase現在セッションの失効を伴うログアウト
- WorkerのCookie削除レスポンスを確認できない通信切断・中継エラー時に、セッション表示を維持する再試行可能な失敗状態
- Web Locksと非機密な認証世代nonceによる複数タブのlogin/logout/refresh直列化・待機中の古いlogout/refresh取消、認証変更時に旧shellを即時非表示にする通知、workspace作成・一覧更新の古い応答・失敗を破棄する競合制御
- 異origin、壊れたCookie、認証エラー非露出、ログアウト失効、refresh競合・失敗のWorker/UI認証テスト

外部環境・実機確認として残るもの:

- 隔離dev/stagingでの動的RLS negative test
- 実資格情報・実RLSを使うdev/stagingでの認証・4ロール横断E2E
- 実機のブラウザ200%ズームとスクリーンリーダーによる手動確認（CIでは640 CSS pxの再配置、Tab順、アクセシブル名・状態通知まで確認済み）

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
- `POST /api/member-join-code`
- `GET /api/workspaces/{id}/members`
- `POST /api/workspaces/{id}/members`
- `PATCH /api/workspaces/{id}/members/{userId}`

`POST /api/workspaces` はSupabase RPC `create_workspace(workspace_name, workspace_slug)` を呼ぶ。直接 `workspaces` へINSERTしない。

`POST /api/auth/logout` は現在セッションをSupabase Authで失効してからCookieを削除する。認証サーバーの失効確認に失敗した場合も端末Cookieは削除し、成功扱いにせず日本語の再試行案内を返す。

通常の保護GETと業務APIはrefresh tokenを交換せず、access token失効時に`SESSION_REFRESH_REQUIRED`を返す。ブラウザは最初の要求前に認証世代を固定し、認証Web Lockの取得後に元の要求を現在のsessionで再確認する。なおrefreshが必要な場合だけ、`POST /api/auth/refresh`とrefresh後の1回再試行を同じlock内で完結させる。認証世代が変わった状態変更要求は再送しない。refresh後のCookieを通常APIの処理結果へ同梱しないため、後続のprofile/workspace取得失敗でも回転済みtokenを失わない。

メンバーAPIはowner/admin/editor/viewerの認可を行い、RLSを最終防衛線とする。追加される本人が`POST /api/member-join-code`で256 bit・10分有効・単回使用の参加コードを発行し、owner/adminがそのコードを利用する。メールアドレスは受け付けず、平文コードはStorage、URL、ログ、監査ログへ保存しない。発行画面では参加を希望するworkspaceの信頼できる管理者へ1対1でだけ共有するよう警告し、期限到達時は平文をDOMとメモリstateから消去する。再発行は現在コードの失効確認を必須とする。発行中の認証変更は、同一ユーザーでは遅延成功・失敗を確定して発行中状態を終了し、別ユーザーでは遅延した平文を破棄する。最後のactive ownerの停止、削除、降格を拒否する。owner移管は専用フローの設計がAcceptedになるまで提供しない。画面では各ロールの影響を説明し、adminへの昇格と利用停止を確認操作にし、自分自身の利用停止は行わせない。保存と別タブの認証変更が競合した場合、同一ユーザーでは保留中処理の決着後に一覧を再照合し、別ユーザーでは旧状態を破棄する。

## Verification

リポジトリ内の自動検査で確認するもの:

- 必須API、Cookie属性、同一origin検査が実装から失われていない。
- Phase 1 migrationとhardening migrationが順序どおり存在する。
- RLS negative testの手順と必要環境変数が文書化されている。
- `npm run phase1:a11y:test`が、日本語ランドマーク、本文スキップ、可視フォーカス、44px操作領域、ズーム用再配置、状態通知、権限表示、準備中表示の契約を検査し、重要要素を壊した変異で失敗する。
- `npm run worker:typecheck`が、最新Workers型に対してWorkerをstrict modeで型検査する。
- `npm run worker:bundle:check`が、外部へdeployせずWranglerのbundleを完了する。
- `npm run worker:runtime:mutation:test`が、異origin拒否とJSON body上限を壊したproduction codeを実行し、共通失敗条件契約で検出する。
- `npm run phase1:e2e:test`が、実Chromiumでowner/admin/editor/viewerのログイン、ワークスペース、メンバー権限表示、ログアウトを横断する。1280pxを200%表示した場合に相当する640 CSS pxで、本文スキップ、可視フォーカス、横方向のページoverflowがない再配置、支援技術向けの名前と状態通知も確認する。

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

メンバー管理API/UIと共通シェルのリポジトリ実装、Worker/UI回帰テスト、アクセシビリティ契約検査、fixture APIを使う実Chromium 4ロールE2Eは存在する。外部Supabaseへforward migrationを適用した動的RLS検証と、実資格情報・実RLSを含むstaging E2Eは未完了であり、対象環境のowner承認後に完了させる。
