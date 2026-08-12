# API契約

Status: Proposed

## 共通

- 認証はSupabase JWT。
- 業務認可はAPI Workerで判定。
- 最終防衛線はRLS。
- エラーは日本語UI向けコードと運用向け詳細を分ける。
- 外部イベントと状態変更APIは冪等性を持つ。

## API一覧

### Phase 1ハーネス

この表はADR-0010に基づくAccepted契約である。後段の将来API一覧は、各PhaseのScope CheckでAcceptedへ移すまでProposedとして扱う。

| API | 目的 | 認可・失敗境界 |
|---|---|---|
| `POST /api/auth/login` | Supabase AuthログインとHttpOnly Cookie発行 | public。同一origin + JSON必須。認証サービスの内部エラー本文は返さない |
| `POST /api/auth/refresh` | refresh tokenを交換してHttpOnly Cookieを更新 | session。同一origin + JSON必須。login/logoutと同じWeb Lock内だけで呼び、通常GET・業務APIはCookieを更新しない |
| `POST /api/auth/logout` | 現在のSupabase session失効とCookie削除 | session。失効確認失敗時もCookieを削除し、`502 LOGOUT_REVOKE_FAILED`で再試行を案内 |
| `GET /api/session` | 現在ユーザー、profile、所属workspaceを取得 | session。access token失効時はCookieを変えず`401 SESSION_REFRESH_REQUIRED`、未認証・期限切れ・接続・上流失敗を区別 |
| `GET /api/workspaces` | 所属workspace一覧 | session + RLS |
| `POST /api/workspaces` | `create_workspace` RPCによるworkspace作成 | session。同一origin + JSON必須 |
| `GET /api/workspaces/{id}/members` | workspaceメンバー一覧と現在ユーザーのroleを取得 | active member。別workspace・不明IDは同じ404 |
| `POST /api/member-join-code` | ログイン中の本人用参加コードを発行 | authenticated。同一origin + JSON必須。10分有効・単回使用 |
| `POST /api/workspaces/{id}/members` | 本人発行の参加コードを利用して追加 | owner/admin。同一origin + JSON必須。owner付与は禁止 |
| `PATCH /api/workspaces/{id}/members/{userId}` | admin/editor/viewer変更または利用停止 | owner/admin。同一origin + JSON必須。owner変更は禁止 |

`GET /api/session`と`GET /api/workspaces`のworkspace一覧は、現在ユーザーが所属する削除済み以外のworkspaceについて、`id`、`name`、`slug`、`status`、`created_at`だけを返す。PostgREST取得は`limit=1001`と`Prefer: count=exact`で打ち切り、`Content-Range`の範囲・返却件数・総数を完全照合する。1000件を超える場合は`409 WORKSPACES_LIMIT_EXCEEDED`として管理者による整理を案内し、件数にかかわらずheader欠落・形式不正・不整合は502とする。上流401はCookieを変更せず`SESSION_REFRESH_REQUIRED`へ写像し、profileとworkspaceの片方だけが401の場合も他方の失敗よりrefreshを優先する。両読取は5秒でtimeoutする。403と上流障害を区別し、不正・過大な2xx本文は空一覧として扱わない。

`POST /api/workspaces`は成功時に`{ "workspaceId": "<uuid>" }`だけを201で返し、tokenや一覧を含めない。ブラウザは送信前にuser IDとslugのロックをタブ内へ保存し、確定失敗時だけ解除する。201本文を検証できても、最新一覧で同じslugを確認するまでは再送を許可しない。保留中POSTより先に一覧で同じslugを確認した場合は、そのPOSTを確認済みとして扱い、遅れて到着した結果不明応答でロックを復活させない。名前はECMAScript `trim()`相当の前後空白を除去した後、Unicode code pointで1〜64文字、slugは小文字化・trim後に半角英数字とハイフン3〜63文字とし、Worker・DB制約・RPCで同じ契約を強制する。RPC送信後の通信切断、上流5xx、成功本文不正、またはWorkerからブラウザまでの応答切断・本文破損・非JSON応答は`WORKSPACE_CREATE_RESULT_UNKNOWN`相当とし、作成済みの可能性を案内して再送を停止する。明示的な入力不正、権限不足、実行前に拒否された429と区別する。上流4xxはPostgreSQLの既知の入力不正・競合codeだけを400へ写像し、RPC不存在やschema cache不整合など予期しない4xxは`502 WORKSPACE_CREATE_SERVICE_UNAVAILABLE`として入力不正と区別する。

メンバー一覧は`list_workspace_members` RPCを使い、activeメンバーの`userId`、`displayName`、`role`、`status`、`joinedAt`だけを最大1000件返す。停止済みメンバーのプロフィールは返さない。現在ユーザーのroleは`currentUserRole`として別に返し、ブラウザが受け取ったroleは表示制御だけに使う。別workspaceや存在しないworkspaceは同じ`404 WORKSPACE_MEMBERS_NOT_FOUND`とし、存在を推測できる差を返さない。editor/viewerも一覧は取得できるが変更APIは403で拒否する。

メンバー追加はメールアドレスを受け付けない。参加者本人が`POST /api/member-join-code`へ空JSON objectを送り、今回だけ表示される参加コードをowner/adminへ渡す。owner/adminは`POST /api/workspaces/{id}/members`へ`{ "joinCode": "mmj_...", "role": "viewer" }`を送る。コードは256 bit乱数、10分有効、単回使用で、DBにはSHA-256 digestだけを保存する。無効・期限切れ・失効・使用済みは`409 JOIN_CODE_UNAVAILABLE`へまとめる。activeメンバーは1workspace最大1000人とし、追加・再参加はworkspace lock中に上限を検査して`409 WORKSPACE_MEMBERS_LIMIT_EXCEEDED`で拒否する。発行または利用の応答が不明な場合、コードを再送せず、発行は再発行、利用はメンバー一覧再取得で照合する。ブラウザからWorkerまでの通信切断、非JSON応答、応答本文破損も利用結果不明として一覧を再取得する。ブラウザは発行者へBearer credentialの影響と1対1の共有先を明示し、期限到達時に平文をDOMとメモリstateから消去してコピーを止める。再発行は現在コードの即時失効を確認してから行う。発行中に認証変更通知を受けた場合、同一ユーザーでは遅延した成功・失敗を確定して発行中状態を終了し、別ユーザーでは保留状態と遅延した平文を破棄する。追加できるroleはadmin/editor/viewerだけで、owner付与は`409 OWNER_TRANSFER_REQUIRED`とする。`created_by`はcaller入力を受けずDB triggerで`auth.uid()`へ固定する。

メンバー変更はdesired roleとstatusを同時に送る冪等な更新とし、statusは`active`または`removed`だけを受け付ける。ただし、`invited`と停止済みを含む非active membershipをPATCHで`active`へ戻すことはできず、本人が新しく発行した参加コードを利用した場合だけ再参加できる。`removed`への変更応答は初回・冪等再実行ともプロフィールを参照せず、`displayName`を固定ラベル`利用停止済み`へ置換する。ownerの付与、降格、停止、削除は専用移管フローがAcceptedになるまでAPIとDB triggerの両方で拒否する。ブラウザは利用停止とadminへの昇格前に、対象者と影響を示して確認し、自分自身の利用停止を表示と処理の両方で拒否する。RPC送信後に結果を確認できない場合は`502 MEMBER_CHANGE_RESULT_UNKNOWN`を返し、ブラウザは再送結果を推測せず最新一覧を取得して確認する。保存中に別タブの認証変更通知を受けた場合は、同じユーザーであることと保留中RPCの決着を待ってから最新一覧を再取得し、別ユーザーへ変わった場合は旧ユーザーの保留状態を破棄する。

### 将来の正式API

| API | 目的 | 認可 |
|---|---|---|
| `GET /health/config` | Cloudflare Workerが必要な公開設定を読めているか確認 | public, secret値は返さない |
| `POST /v1/workspaces` | ワークスペース作成 | authenticated |
| `GET /v1/workspaces/{id}` | ワークスペース取得 | member |
| `POST /v1/workspaces/{id}/invitations` | 招待 | owner/admin + plan limit |
| `GET /v1/manuals` | 手順書一覧 | member |
| `POST /v1/manuals` | 手順書作成 | editor以上 + draft limit |
| `GET /v1/manuals/{id}` | 手順書取得 | can_view_manual |
| `PATCH /v1/manuals/{id}` | 手順書更新 | can_edit_manual |
| `POST /v1/manuals/{id}/publish` | 公開版作成 | can_edit_manual |
| `POST /v1/manuals/{id}/exports` | PDF/HTML/Markdown出力を要求 | can_view_manual + active export entitlement |
| `POST /v1/capture-sessions` | 操作記録開始 | editor以上 + Browser Run/同時記録上限 + egress P0検証済みflag |
| `POST /v1/capture-sessions/{id}/live-url` | Live View URL発行 | session owner + egress P0検証済みflag |
| `POST /v1/capture-sessions/{id}/commands` | navigate/reload等 | session owner + egress P0検証済みflag |
| `GET /v1/capture-sessions/{id}/events` | 再接続差分 | session owner |
| `DELETE /v1/capture-sessions/{id}` | セッション終了 | session owner |
| `POST /v1/share-links` | 共有リンク作成 | can_edit_manual |
| `GET /s/{token}` | 共有閲覧 | token検証 |
| `POST /v1/playback-sessions` | Guide Me風開始 | can_view_manual |
| `POST /v1/mobile-preview-sessions` | スマホ表示確認開始 | editor以上 + egress P0検証済みflag |
| `GET /v1/billing/summary` | 現在プラン、利用量、上限、購入済みmanualを取得 | member。請求詳細はowner/admin |
| `POST /v1/billing/checkout-intents` | 短命Checkout Session作成前の購入意図を作成 | single exportはeditor以上、subscriptionはowner/admin |
| `GET /v1/billing/checkout-intents/{id}` | 決済処理状況を確認 | intent作成者またはowner/admin |
| `POST /v1/webhooks/stripe` | Stripe webhook | signature verified |
| `POST /v1/integrations/discord/interactions` | Discord Slash Command受信 | Discord Ed25519 signature verified |

`capture.browserRun.egressVerified.enabled=false` の場合、capture session、mobile preview sessionの作成とnavigate/reload commandはBrowser Runへ通信する前に `503 BROWSER_EGRESS_NOT_VERIFIED` で拒否する。hostnameのallowlistや運営承認はこの拒否を迂回できず、Browser Runを起動する新しいAPIにも同じgateを必須にする。

flagをtrueからfalseへ戻した場合は新規処理の拒否だけで終えない。egress kill switchで既存Browserの全通信を先に遮断し、全Durable Objectへ終了commandを送信し、Live View URLを即時失効して再発行を拒否し、Browser sessionのclose完了まで監査・再試行する。

## 課金API contract

`POST /v1/billing/checkout-intents` は次のofferだけを受け付ける。

- `single_export`: `manualId` 必須。対象manualのworkspace所属と編集権限を確認する。
- `personal_monthly`: `manualId` 禁止。owner/adminだけが作成できる。
- `team_monthly`: `manualId` 禁止。owner/adminだけが作成できる。

`personal_monthly` は有効メンバーが1人の場合だけ作成できる。active/grace/read_onlyのTeam契約が存在する場合は人数に関係なく、契約置換と既存メンバー処理をOQ-027で決めるまで `PLAN_CHANGE_UNRESOLVED` を返し、Stripe APIへ通信しない。

成功時は推測不能なcheckout intent IDと、そのintent専用に作成した30分有効のCheckout Session URLだけを返す。Price ID、Stripe Secret、Webhook Secret、他workspaceの識別子を返さない。

- `BILLING_FEATURE_ENABLED=false` の場合は新規intentへ `BILLING_DISABLED` を返す。ただし既存課金objectの署名済みWebhookとreconciliationは停止しない。
- `client_reference_id` にはcheckout intent IDだけを使う。
- `Idempotency-Key` headerを必須とし、key hashとrequest hashを保存する。同じkey・同じrequestは同じintent/Sessionを返し、同じkey・異なるrequestは409を返す。
- 都度払いは同じworkspace/manual、subscriptionはofferを問わず同じworkspaceに未期限切れintentがある場合は新規intentを作らない。Stripe Session作成にはintent ID由来の決定的idempotency keyを渡し、タイムアウトや並行再送でも同じSessionを取得する。
- クライアントが送った価格、金額、Price ID、Payment Linkを信頼しない。
- Stripe Linkのメールアドレスや認証状態をアプリ認証へ流用しない。
- 決済完了リダイレクト後も `processing` と表示でき、Webhook確認前に権利を付与しない。
- checkout intent、Checkout Session ID、PaymentIntentまたはSubscriptionを1対1で照合し、期限切れ・失効済みSessionからの新規決済を受け付けない。

`POST /v1/manuals/{id}/exports` は、次のいずれかをサーバー側で確認する。

1. 対象manualに有効な `single_export` entitlementがあり、30日以内である。
2. workspaceに有効な `personal_monthly` または `team_monthly` entitlementがある。

上限や権利がない場合は、既存データを削除せず、日本語の料金案内と次の操作を返す。R2使用量が100%なら新規エクスポート生成を拒否するが、生成済み成果物の期限内ダウンロードは許可する。

## Business OS cloud runner契約

Business OSからのcloud executionは、既存の利用者向けAPIとは別のmachine-to-machine契約として扱う。runnerはCloudflare Access service tokenとproject専用Bearer tokenの両方を送り、Business OSは登録済みexecution target、repository、workflowを完全一致で照合する。

| API | request | response・失敗境界 |
|---|---|---|
| `POST /api/v1/cloud-runners/probe` | `targetId`, `repository`, `workflowRef` | secret値を返さず接続結果だけを返す。pending targetでも実行できるが、登録済みrepository/workflowとの不一致、無効token、Access拒否は失敗する |
| `POST /api/v1/cloud-runners/jobs/claim` | `targetId`, `jobId`, `repository`, `workflowRunId` | `job`とlowercase hexの`signature`を返す。active target、承認済みjob、未失効lease、repository一致、月次予算停止値、同時実行数を満たさないclaimは拒否する |
| `POST /api/v1/cloud-runners/events` | 下記event envelope | eventを冪等に記録する。job/target/repository不一致、未知type、不正sequence、重複内容の不一致は拒否する |

claim responseの署名対象jobは次を含む。

- 識別: `id`, `organizationId`, `projectId`, `codexRunId`, `executionTargetId`, `provider`, `repoAlias`, `repository`, `workflowRef`
- 実行: `baseBranch`, `branchName`, `taskBrief`, `acceptanceCriteria`, `model`, `effort`
- 予算・期限: `tokenBudget`, `maxCostUsd`, `issuedAt`, `expiresAt`
- 権限: `permissions.operation`, `writableRoots`, `allowNetwork`, `allowPush`, `allowDraftPr`, `allowStagingDeploy`, `allowProductionDeploy`

署名はjob全体をcanonical JSON化したUTF-8 byte列に対するHMAC-SHA256で、lowercase hexadecimalとする。canonical JSONはobject keyを各階層で辞書順に並べ、array順序を保持し、scalarとnullをJSON表現にする。runnerは共有secretで再計算し、長さ確認後にtiming-safe比較する。このworkflowが受理する`permissions.operation`は`read_only`と`code_change`だけで、共通schema上の`test`、`review`や未知値はclaim時に拒否する。署名不一致、期限切れまたは解釈不能な`expiresAt`、別target・別repository、`codex/`以外のbranch、許可外path、`allowProductionDeploy !== false`は実行しない。`code_change`は`allowPush === true`かつ`allowDraftPr === true`を必須とし、どちらかがfalseなら有料Codex actionの開始前に拒否する。workflow側のpublish jobも同じ2条件を再確認する。

event envelopeは `eventId`, `jobId`, `codexRunId`, `executionTargetId`, `repository`, `workflowRunId`, 非負整数の`sequence`, `type`, 最大4000文字の`summary`, ISO 8601の`occurredAt`, objectの`metadata`を持つ。`type`は `accepted`, `started`, `progress`, `needs_input`, `test_started`, `staging_started`, `completed`, `failed` に限定する。`eventId`を冪等キーとし、同一job内のsequenceは状態遷移順を表す。通常eventは直前eventの次のsequenceだけを受理する。例外として`failed`かつ`metadata.autoSequence === true`の場合、Business OSは受信値を使用せず、保存済みeventの次のsequenceをサーバー側で割り当てる。これはworkflowの失敗位置が不定でも終端監査eventを失わないためのfailure専用契約で、他のevent typeでは使用できない。

runnerはproduction deploy、rollback、DB migration、secret変更をこの契約で表現しない。`tokenBudget`と`maxCostUsd`は署名対象であり、Business OSの月次警告・停止値と合わせてdispatch/claim時に検証する。runnerログ、event、Issue、文書へservice token、Bearer token、署名secret、OpenAI API keyを記録しない。

## Discord Interaction contract

`POST /v1/integrations/discord/interactions` は通常の同一オリジンCSRF検証を通さず、Discord公式のEd25519署名検証を正とする。

- 必須header: `x-signature-ed25519`, `x-signature-timestamp`
- timestamp許容: 5分以内
- body上限: 64KB
- replay防止: `DISCORD_INTERACTION_STORE` KVにinteraction IDを10分保存する
- 許可範囲: `DISCORD_ALLOWED_GUILD_IDS` と `DISCORD_ALLOWED_CHANNEL_IDS` を既定必須にする
- 応答: slash commandは3秒以内にdeferred ephemeral responseを返し、GitHub Issue作成後にoriginal responseを更新する
- GitHub Issue labels: `from-discord`, `needs-triage`, `user-request`, `status/triage`, `priority/P0|P1|P2|P3`
- 危険操作候補labels: `approval-required`, `blocked-from-discord`
- label作成失敗時はlabelなしIssueへfallbackしない
- DiscordへGitHub APIの詳細エラー本文を返さない

## エラー形式

```json
{
  "code": "CAPTURE_SESSION_EXPIRED",
  "message": "記録セッションの有効期限が切れました。",
  "nextAction": "もう一度、操作の記録を開始してください。",
  "requestId": "req_xxx"
}
```
