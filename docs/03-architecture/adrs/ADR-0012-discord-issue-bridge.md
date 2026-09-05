# ADR-0012: Discordからの指示はGitHub Issueへ変換する

Status: Accepted

## 決定

Discordからの開発指示は、Codexを直接起動せず、Cloudflare WorkerでDiscord Interactionを受けてGitHub Issueへ変換する。
CodexはGitHub Issueを正としてtriageし、PR運用で作業する。

## 理由

- Discord Webhookは片方向通知であり、Discordからの指示受付には使えない。
- Discord Interactionは署名検証とtimestamp検証ができる。
- GitHub Issueに変換すると、履歴、レビュー、ラベル、PRとの紐付けが残る。
- production反映、DB migration、課金設定などの危険操作をDiscord単独承認にしないため。

## 実装

- Worker endpoint: `POST /v1/integrations/discord/interactions`
- Command: `/meccha task`
- Message Component: PR通知buttonの `状態確認` と `マージ依頼`
- GitHub Issue labels: `from-discord`, `needs-triage`, `user-request`
- 危険操作候補labels: `approval-required`, `blocked-from-discord`
- PRマージ依頼label: `merge-requested`
- GitHub tokenはIssues writeに限定する。
- Discordの許可guild、channel、user、roleを環境変数で制限する。
- guild/channel allowlist未設定は既定拒否にする。検証環境でだけ `DISCORD_ALLOW_UNSCOPED_COMMANDS=true` を明示できる。
- Workerはexact POSTとbody上限を確認し、raw bodyのDiscord Ed25519署名・署名対象timestampを副作用なしで検証してから有界parse/schema検証とallowlist検証を行う。
- interaction ID、payload digest、receiptと再実行可能なIssue work/outboxを単一のatomic operationでauthoritative storeへ保存する。guard commit後だけprovider successとして3秒以内のdeferred responseを返し、保存済みoutboxからdispatcherと副作用へ進める。保存失敗時は成功応答しない。
- receipt/workは `received`、lease付き`processing`、`retryable`、`reconcile_required`、`completed`、`dead_letter` で管理する。一時失敗や期限切れleaseは同じIssue workを再開し、GitHub Issue作成結果が不明な場合は決定的correlation markerで照合するまで作成を自動再送しない。
- 同じinteraction ID・同じpayload digestの再送は新しいIssue workを作らず状態別に維持・再開・照合・冪等応答し、異なるdigestは拒否する。
- `DISCORD_INTERACTION_STORE` KVの既存get→putは移行前baselineであり、単独のreplay guard正本にしない。atomic guard commit後の短期応答cacheには利用できる。OQ-031のCloudflare側実装・並行再送・途中失敗・結果不明negative test完了前はpath別Access Bypassを有効化しない。
- Slash Commandは3秒以内にdeferred ephemeral responseを返し、GitHub Issue作成後にoriginal responseを更新する。
- PR通知buttonも3秒以内にdeferred ephemeral responseを返し、状態確認またはマージ依頼記録後にoriginal responseを更新する。
- label付与に失敗した場合は、labelなしIssueへfallbackしない。
- DiscordへGitHub APIの詳細エラー本文を返さない。

## 非対象

- DiscordからCodexを直接実行すること。
- Discordの通常Webhookで指示を受けること。
- Discordだけで本番反映やsecret変更を承認すること。
- Discord buttonからGitHub PRを直接mergeすること。
