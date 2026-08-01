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
| `POST /v1/workspaces/{id}/invitations` | 招待 | owner/admin |
| `GET /v1/manuals` | 手順書一覧 | member |
| `POST /v1/manuals` | 手順書作成 | editor以上 |
| `GET /v1/manuals/{id}` | 手順書取得 | can_view_manual |
| `PATCH /v1/manuals/{id}` | 手順書更新 | can_edit_manual |
| `POST /v1/manuals/{id}/publish` | 公開版作成 | can_edit_manual |
| `POST /v1/capture-sessions` | 操作記録開始 | editor以上 |
| `POST /v1/capture-sessions/{id}/live-url` | Live View URL発行 | session owner |
| `POST /v1/capture-sessions/{id}/commands` | navigate/reload等 | session owner |
| `GET /v1/capture-sessions/{id}/events` | 再接続差分 | session owner |
| `DELETE /v1/capture-sessions/{id}` | セッション終了 | session owner |
| `POST /v1/share-links` | 共有リンク作成 | can_edit_manual |
| `GET /s/{token}` | 共有閲覧 | token検証 |
| `POST /v1/playback-sessions` | Guide Me風開始 | can_view_manual |
| `POST /v1/mobile-preview-sessions` | スマホ表示確認開始 | editor以上 |
| `POST /v1/webhooks/stripe` | Stripe webhook | signature verified |
| `POST /v1/integrations/discord/interactions` | Discord Slash Command受信 | Discord Ed25519 signature verified |

## Discord Interaction contract

`POST /v1/integrations/discord/interactions` は通常の同一オリジンCSRF検証を通さず、Discord公式のEd25519署名検証を正とする。

- 必須header: `x-signature-ed25519`, `x-signature-timestamp`
- timestamp許容: 5分以内
- body上限: 64KB
- replay防止: `DISCORD_INTERACTION_STORE` KVにinteraction IDを10分保存する
- 許可範囲: `DISCORD_ALLOWED_GUILD_IDS` と `DISCORD_ALLOWED_CHANNEL_IDS` を既定必須にする
- 応答: slash commandは3秒以内にdeferred ephemeral responseを返し、GitHub Issue作成後にoriginal responseを更新する
- GitHub Issue labels: `from-discord`, `needs-triage`, `user-request`
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
