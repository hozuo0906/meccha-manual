# ADR-0010 Worker cookie auth harness

Status: Accepted

## Context

Phase 1ではCloudflare Worker上でSupabase Auth、RLS、ワークスペース作成が実際に動くことを確認する必要がある。

Supabase anon keyは公開可能だが、access tokenとrefresh tokenをブラウザJavaScriptで直接扱うと、将来のXSS対策やBFF構成への移行時に負債になりやすい。

## Decision

Phase 1のアプリハーネスでは、Supabase Auth APIをCloudflare Workerから呼び出す。

ログイン成功後、Workerは以下のHttpOnly Cookieを発行する。

- `__Host-mm_access`
- `__Host-mm_refresh`

Cookieは `Secure`、`SameSite=Lax`、`Path=/` を必須にする。

ブラウザJavaScriptは `/api/session`、`/api/workspaces` など同一オリジンAPIだけを呼び、Supabase tokenを直接保持しない。

状態変更APIでは、Phase 1の最低対策として以下を必須にする。

- `Origin` がWorkerの同一originと一致すること。
- `Content-Type` が `application/json` であること。
- JSON bodyが小さい上限内であること。

ログアウトはブラウザCookieの削除だけで完了扱いにせず、現在のaccess tokenでSupabase Authのlocal sign-outを実行して現在セッションのrefresh tokenを失効する。認証サーバー側の失効確認に失敗した場合も端末Cookieは削除するが、成功レスポンスにはせず再ログイン後の再試行を案内する。

ブラウザがWorkerの正常応答または`LOGOUT_REVOKE_FAILED`を受信できない通信切断・中継エラーでは、Cookie削除を確認できないためログイン画面へ遷移しない。現在の画面とセッション表示を維持し、ログアウト未完了と再試行を案内する。

`/api/session` の失敗は、未認証・期限切れの401と、接続失敗・サーバー失敗をUIで区別する。Supabase Authの内部エラー本文は利用者へそのまま返さない。

同一ブラウザの別タブでログイン主体が変わった場合は`BroadcastChannel`で認証変更を通知し、旧ユーザーのshellを即座に中立な読込画面へ置換してから、進行中のsession・workspace応答を無効化し、現在Cookieのsessionを再取得する。Cookieを変更するlogin/logout要求はWeb Locksの排他lockで全タブ横断に直列化する。さらにtoken・user ID・入力値を含まない認証世代nonceだけをlocalStorageへ保持し、logout開始時のnonceをlock取得後に再照合する。先行loginでnonceが変わった場合、待機していた古いlogoutはHTTP送信前に破棄する。Web Locksまたは認証世代の保存を利用できないブラウザでは、安全側でlogin/logout要求を送信せず最新版Chromeの利用を案内する。workspace作成後は作成応答の一覧を直接描画せず、現在sessionを再取得し、作成開始時のuser IDと一致する場合だけ成功通知を表示する。作成の開始・完了時には古い一覧取得応答とその失敗表示も無効化する。作成POST成功後の一覧再取得失敗は作成失敗と表示せず、作成済みであることと一覧更新の再試行を案内する。

## Consequences

- クライアントへSupabase tokenを返さない。
- API境界をWorkerに集約できる。
- Phase 1ではOrigin検証、SameSite Cookie、JSON API強制をCSRFの最低対策とする。
- 将来、重要な状態変更APIにはCSRF tokenまたは二重送信Cookieも追加する。
- Supabase service role keyは使わない。
- Supabase Authでsign-outしたセッションの既発行access tokenは有効期限まで署名上有効になり得るため、Workerは保護APIごとにAuth serverへユーザーとセッションの有効性を確認する。
