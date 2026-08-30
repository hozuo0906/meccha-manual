# Cloudflare Access / D1 API移行契約

Status: Accepted

## 位置づけ

ADR-0028とIssue #176の目標API契約である。既存の `api-contracts.md`、Phase 1/2 API、Postgres RPC契約は移行前baselineとして保持する。新D1経路が受入条件を満たすまで、旧経路との暗黙fallbackや二重書込みを行わない。

## 共通認証

保護APIはCloudflare Accessが付与する `Cf-Access-Jwt-Assertion` をWorkerで検証する。

検証項目:

- 署名と許可されたalgorithm
- issuer
- application audience
- token type
- not-before
- expiration
- subject

email、任意header、未検証payloadだけで認証しない。ブラウザJavaScriptへJWTを複製しない。

Cloudflare Accessのidentity-based application tokenとservice-token application tokenはいずれも `type: "app"` になり得るため、検証後のactorを `access_user | service_token` として明示し、token typeだけでactorを決めない。

- 人間向け業務APIは `access_user` と空でない `sub` を必須にし、空の `sub`、service token固有の `common_name`、actor種別が曖昧なtokenを403で拒否する。D1 identityはtrim後のsubject非空制約と `UNIQUE(issuer, subject)` を持つ。
- `service_token` は `/health/config` 等の明示allowlistしたmachine専用routeだけに許可し、session/workspace/manual API、identity bootstrapを403にし、D1 application identity、workspace membership、roleへ写像しない。
- machine専用routeは業務データを返さず、状態変更を行わず、許可routeを列挙してdefault denyにする。

## Application session

`GET /api/session` は検証済みAccess identityをD1のapplication identity、profile、active workspace membershipへ解決する。

- Access JWTなし・不正・期限切れ: 401
- Access認証済みだが未招待または未登録: 403
- service-token actor、空の `sub`、`common_name` を持つtoken: 人間向け業務APIでは403
- disabled identity: 403
- active identityでworkspaceなし: 認証済み空状態
- 上流鍵取得またはD1障害: 503
- 内部JWT、subject、email、binding情報をエラーへ含めない

独自password login、refresh token交換、Supabase sign-out APIは廃止対象とする。ログアウトはAccess session終了導線を使い、アプリ側状態と進行中応答を破棄する。

## Workspace API

既存URLは可能な限り維持する。

| API | 認可 |
|---|---|
| `GET /api/workspaces` | active application identity。所属中workspaceだけ |
| `POST /api/workspaces` | active identity。同一origin、JSON、入力上限 |
| `GET /api/workspaces/{id}/members` | active workspace member |
| `POST /api/member-join-code` | active identity。短命・単回使用 |
| `POST /api/workspaces/{id}/members` | owner/admin |
| `PATCH /api/workspaces/{id}/members/{userId}` | owner/admin。owner変更は禁止 |

WorkerはD1 queryへactor IDとworkspace IDを必ず渡す。存在しないworkspace、別workspace、停止memberは存在を推測できない応答へ統一する。

## Manual API

manual、revision、stepの既存HTTP URLと日本語UIエラー契約は可能な限り維持する。Postgres SECURITY DEFINER RPCは、単一の条件付きSQL、`D1Database.batch()`、schema constraint/triggerを組み合わせたD1対応のatomic operationと用途別repository methodへ置換する。interactive transaction APIの存在を前提にしない。

- create: manualと最初のdraftを同じatomic operationで作成
- update: workspace、role、draft state、期待versionを同じatomic operationで照合
- publish: manual pointerと期待draft IDを再照合し、公開版を不変化
- next draft: 期待published IDから複製
- archive: 期待manual versionを照合し、内容を保持して非破壊化
- step mutation: draft lock、200件上限、position、URL、body上限を維持

結果不明時の自動再送禁止、古い応答破棄、同一origin、JSON body上限、response上限は維持する。

## CSRF / browser state

- 状態変更APIは同一originを必須にする。
- Access cookieがあることだけをCSRF対策にしない。
- Cookieや認証状態が変化した場合、進行中の旧session応答をUIへ反映しない。
- 状態変更の認証世代が変わった場合は再送しない。
- workspace選択は表示上のhintであり、認可根拠にしない。

## Negative contract

各protected APIで次を検証する。

- JWTなし・不正・期限切れ
- issuer/audience不一致
- service-token JWT、空の `sub`、`common_name` を人間userへ誤写像しない
- application identityなし・disabled
- 未所属・停止member
- viewer mutation
- 別workspaceとresource ID差し替え
- owner喪失
- version競合
- D1 timeout、途中失敗、response破損
- 重複送信と結果不明

## Migration gate

Supabase runtime呼出しを削除する前に、新経路が対応する正常系・異常系・競合・途中失敗テストを満たすことを同一headで確認する。M3でPhase 1をAccess/D1へ切り替えた後、Phase 2 manualのD1切替が完了するM4までは全manual read/mutation routeとUI入口をfail closedで一時停止する。APIは安定した `503 MANUAL_MIGRATION_IN_PROGRESS` を返し、Supabase Auth/PostgREST/RPC呼出し、自動再送、queued write、fallback、二重認証、二重書込みを行わない。M4のD1 schema、atomic rollback、認可negative test、API/E2Eが同一headで成功した後だけ再開する。新経路が未完成の間、productionや外部ユーザーへ公開しない。
