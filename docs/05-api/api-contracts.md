# API契約

Status: Proposed

## 共通

- 認証はSupabase JWT。
- 業務認可はAPI Workerで判定。
- 最終防衛線はRLS。
- エラーは日本語UI向けコードと運用向け詳細を分ける。
- 外部イベントと状態変更APIは冪等性を持つ。

## API一覧

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
| `POST /v1/capture-sessions/{id}/live-url` | Live View URL発行 | session owner |
| `POST /v1/capture-sessions/{id}/commands` | navigate/reload等 | session owner + egress P0検証済みflag |
| `GET /v1/capture-sessions/{id}/events` | 再接続差分 | session owner |
| `DELETE /v1/capture-sessions/{id}` | セッション終了 | session owner |
| `POST /v1/share-links` | 共有リンク作成 | can_edit_manual |
| `GET /s/{token}` | 共有閲覧 | token検証 |
| `POST /v1/playback-sessions` | Guide Me風開始 | can_view_manual |
| `POST /v1/mobile-preview-sessions` | スマホ表示確認開始 | editor以上 |
| `GET /v1/billing/summary` | 現在プラン、利用量、上限、購入済みmanualを取得 | member。請求詳細はowner/admin |
| `POST /v1/billing/checkout-intents` | 短命Checkout Session作成前の購入意図を作成 | single exportはeditor以上、subscriptionはowner/admin |
| `GET /v1/billing/checkout-intents/{id}` | 決済処理状況を確認 | intent作成者またはowner/admin |
| `POST /v1/webhooks/stripe` | Stripe webhook | signature verified |
| `POST /v1/integrations/discord/interactions` | Discord Slash Command受信 | Discord Ed25519 signature verified |

`capture.browserRun.egressVerified.enabled=false` の場合、capture session作成とnavigate/reload commandはBrowser Runへ通信する前に `503 BROWSER_EGRESS_NOT_VERIFIED` で拒否する。hostnameのallowlistや運営承認はこの拒否を迂回できない。

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
