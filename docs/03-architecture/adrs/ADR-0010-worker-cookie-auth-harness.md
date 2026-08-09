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
access token Cookieの`Max-Age`はSupabase応答を実行時検証し、最大1時間に制限する。不正なtoken応答ではCookieを発行しない。

ブラウザJavaScriptは `/api/session`、`/api/workspaces` など同一オリジンAPIだけを呼び、Supabase tokenを直接保持しない。

状態変更APIでは、Phase 1の最低対策として以下を必須にする。

- `Origin` がWorkerの同一originと一致すること。
- `Content-Type` が `application/json` であること。
- JSON bodyが小さい上限内であること。

ログアウトはブラウザCookieの削除だけで完了扱いにせず、現在のaccess tokenでSupabase Authのlocal sign-outを実行して現在セッションのrefresh tokenを失効する。認証サーバー側の失効確認に失敗した場合も端末Cookieは削除するが、成功レスポンスにはせず再ログイン後の再試行を案内する。

ブラウザがWorkerの正常応答または`LOGOUT_REVOKE_FAILED`を受信できない通信切断・中継エラーでは、Cookie削除を確認できないためログイン画面へ遷移しない。現在の画面とセッション表示を維持し、ログアウト未完了と再試行を案内する。

`/api/session` の失敗は、未認証・期限切れの401と、接続失敗・サーバー失敗をUIで区別する。Supabase Authの内部エラー本文は利用者へそのまま返さない。

refresh tokenの交換は通常のGETや業務API内で行わない。保護APIがaccess token失効を検出した場合はCookieを変更せず`SESSION_REFRESH_REQUIRED`を返す。ブラウザは最初の要求前に認証世代を固定し、login/logoutと同じWeb Lockの取得後に元の要求を現在のsessionで再確認する。なお`SESSION_REFRESH_REQUIRED`なら、同一originの`POST /api/auth/refresh`とrefresh後の1回再試行を同じlock内で完結させる。lock取得時、refresh前、またはrefresh後に認証世代が変わっていた場合、状態変更要求は再送せず、読取要求だけを現在のsessionで再取得する。これにより、旧ユーザーの遅いrefresh応答が新しいlogin後のCookieを巻き戻す競合、旧ユーザーの要求を新ユーザー権限で再送する越境、refresh成功後の業務API失敗で回転済みCookieを失う途中失敗を防ぐ。

壊れたCookie、拒否されたrefresh token、不正なrefresh応答など再利用不能と確定した401では両Cookieを削除する。上流の通信障害と5xxではCookieを残し、期限切れへ誤分類せず再試行を案内する。

同一ブラウザの別タブで認証状態が変わった場合は`BroadcastChannel`で通知し、旧shellを即座に中立な読込画面へ置換してから、進行中のsession・workspace応答を無効化し、現在Cookieのsessionを再取得する。通知を受けただけでは同一ユーザーの再ログインか別ユーザーへの変更か判定できないため、現在workspace選択と作成結果不明ロックは先に削除しない。再取得したuser IDが以前と異なる場合、または未認証が確定した場合にだけ破棄する。Cookieを変更するlogin/logout要求はWeb Locksの排他lockで全タブ横断に直列化する。さらにtoken・user ID・入力値を含まない認証世代nonceだけをlocalStorageへ保持し、logout開始時のnonceをlock取得後に再照合する。先行loginでnonceが変わった場合、待機していた古いlogoutはHTTP送信前に破棄する。Web Locksまたは認証世代の保存を利用できないブラウザでは、安全側でlogin/logout要求を送信せず最新版Chromeの利用を案内する。workspace作成後は作成応答の一覧を直接描画せず、現在sessionを再取得し、作成開始時のuser IDと一致する場合だけ成功通知を表示する。作成の開始・完了時には古い一覧取得応答とその失敗表示も無効化する。作成POST成功後の一覧再取得失敗は作成失敗と表示せず、作成済みであることと一覧更新の再試行を案内する。

現在のワークスペース選択はDBやCookieへ保存せず、単一の`sessionStorage`値 `{ userId, workspaceId }` とタブ内メモリへ保持する。復元時は現在sessionの同じuser IDかつ最新一覧に含まれる`active`なworkspace IDとの完全一致を必須にし、不一致・停止・未所属・ユーザー変更では破棄する。この値は表示上の選択ヒントであり認可根拠にしない。後続のworkspace指定APIは、Worker認可とRLSで毎回所属を再検証する。

`create_workspace` RPCの送信後に通信が切れた場合、上流5xxを受けた場合、または2xx応答本文を検証できない場合は、DBでcommit済みか否かを判定できない。そのため確定失敗とせず`WORKSPACE_CREATE_RESULT_UNKNOWN`を返し、重ねて作成せず一覧を更新するよう案内する。Workerが結果不明を返せず、Workerからブラウザまでの応答が切断・破損・非JSON化した場合もクライアントは同じ安全状態へ移る。クライアントは送信した名前をページ内メモリだけに保持し、POST送信前にuser IDとslugだけを`sessionStorage`へ保存して作成フォームをロックする。確定失敗時だけ解除し、201応答後も最新一覧で同じslugを確認するまで維持する。別の一覧更新要求やページ再読込と競合しても、同じ認証主体である限りロックの保存を応答順序より優先する。認証主体が変わった場合は旧主体の状態をメモリと`sessionStorage`から破棄する。RPC成功時のWorker応答は作成IDだけを返し、一覧は現在sessionから別途再取得する。

所属workspace一覧はPostgRESTへ固定field、`limit=1001`、`Prefer: count=exact`を指定し、最大1000件を技術上限とする。1001件目または`Content-Range`の総数超過を検出した場合は全件を描画せず`WORKSPACES_LIMIT_EXCEEDED`で管理者による整理を案内する。返却件数にかかわらず`Content-Range`の欠落・形式不正・範囲と件数の不整合は、不完全な一覧として失敗させる。profileとworkspaceの並行取得で一方が`SESSION_REFRESH_REQUIRED`になった場合は、他方の403・5xx・本文破損より401を優先し、安全なrefresh経路へ戻す。両GETと本文読取は5秒でabortし、片方のハングでrefresh判定を無期限に待たせない。

ワークスペース名はJavaScriptのUTF-16 code unitではなくUnicode code pointで1〜64文字と数え、ECMAScript `trim()`相当の前後空白を除去する。slug形式とあわせてWorker入力検証だけに依存せず、DBのCHECK制約と`create_workspace` RPC内でも同じ契約を検証する。認証済みユーザーがSupabase RPCを直接呼んでも、絵文字の文字数やタブ・改行・NBSP・全角空白だけの名前で入力契約を迂回できないようにする。

## Consequences

- クライアントへSupabase tokenを返さない。
- API境界をWorkerに集約できる。
- tokenを更新するレスポンスはlogin/logout/refreshの同一origin POSTに限定され、複数タブのWeb Lockで直列化される。
- Phase 1ではOrigin検証、SameSite Cookie、JSON API強制をCSRFの最低対策とする。
- 将来、重要な状態変更APIにはCSRF tokenまたは二重送信Cookieも追加する。
- Supabase service role keyは使わない。
- Supabase Authでsign-outしたセッションの既発行access tokenは有効期限まで署名上有効になり得るため、Workerは保護APIごとにAuth serverへユーザーとセッションの有効性を確認する。
