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

## Consequences

- クライアントへSupabase tokenを返さない。
- API境界をWorkerに集約できる。
- Phase 1ではOrigin検証、SameSite Cookie、JSON API強制をCSRFの最低対策とする。
- 将来、重要な状態変更APIにはCSRF tokenまたは二重送信Cookieも追加する。
- Supabase service role keyは使わない。
