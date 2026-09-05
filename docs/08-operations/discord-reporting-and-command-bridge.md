# Discord reporting and command bridge

Status: Accepted

## Purpose

開発報告と軽い進行確認をDiscordへ集約する。
ただし、サブエージェントの生思考や会話全文は送らず、結論、合否、リスク、次アクションだけを通知する。

## Current scope

GitHub ActionsからDiscord WebhookへCI結果を通知する。

対応済み:

- `npm run notify:discord`
- `npm run notify:discord:dry-run`
- `.github/workflows/docs-ci.yml` の完了通知
- `.github/workflows/auto-pr.yml` のPR自動作成/検出通知
- `.github/workflows/discord-notify-test.yml` の手動疎通確認
- `.github/workflows/deployment-gates.yml` のstaging/production承認ゲート入口

## Secret names

通常CIの開発報告では、次のいずれかを使う。

- `DISCORD_WEBHOOK_URL`
- `MECCHA_DISCORD_WEBHOOK_URL`
- `DISCORD_DEVELOPMENT_WEBHOOK_URL`

staging/productionの承認ゲートでは、通知先の取り違えを防ぐため環境別Secretだけを使う。

- staging: `DISCORD_STAGING_WEBHOOK_URL`
- production: `DISCORD_PRODUCTION_WEBHOOK_URL`

productionで通知Secretが未設定の場合、deployment gateはfail closedにする。

## Side task handoff

Discord通知ハーネスのサイドタスク:

- task id: `019fb8ec-ee4f-7370-ab5f-0b61fb09f931`
- repo: `https://github.com/hozuo0906/meccha-manual.git`
- branch: `feature/discord-notify-test`
- scope: `.github/workflows` と `docs/08-operations`

サイドタスクのルール:

- mainへ直接pushしない。
- `DISCORD_WEBHOOK_URL` の値を聞かない。
- Webhook URL、token、secretをログやMarkdownに書かない。
- サイド側の成果はPRで合流する。
- メインセッションのADR、decision-log、運用docsを正本にする。

## Notification policy

Discordへ送ってよいもの:

- CIの成功/失敗
- 対象branch
- commit short SHA
- GitHub Actions run URL
- PR URL
- 作業完了の要約
- Codex所感
- P0/P1レビュー結果の件数

Discordへ送らないもの:

- secret
- access token
- Supabase service role key
- DB password
- JWT Secret
- 実ユーザーの個人情報
- サブエージェントの生思考
- 長いログ全文

## Reliability

- 通常CIのDiscord通知は失敗してもCI本体を落とさない。
- `Discord Notify Test` workflowは通知成功を必須にする。
- `Deployment Gates` workflowはstaging/production通知成功を必須にする。
- 通知送信は10秒timeout、最大2回試行にする。
- Discord APIのエラー本文はログへ出さない。

## Japanese notification tone

Discord通知は日本語を基本にする。

- タイトルは「文書・品質チェック」「自動PR」「デプロイ承認ゲート」のように、日本人オフィスワーカーがすぐ判断できる文言にする。
- embed field名は `Codex所感`、`環境`、`リポジトリ`、`ブランチ`、`実行者`、`イベント`、`コミット` を使う。
- `Codex所感` には、成功/失敗だけでなく「次に何を見るべきか」を短く書く。
- secret、token、個人情報、長いログ全文は所感にも含めない。

## Discord reply intake

既存のDiscord Webhook通知は送信用であり、ユーザーの通常返信をそのまま受信してCodexを動かす用途には使わない。
Discordから稼働させる入口は次の優先順位にする。

1. Slash Command / Interaction: 推奨。Cloudflare Worker endpointで署名検証し、GitHub Issueへ変換する。
2. Button / Modal Interaction: 将来候補。PR通知に「レビュー依頼」「修正依頼」ボタンを付ける場合に使う。
3. Bot Gateway: 通常メッセージ返信を拾う場合の候補。ただし常時WebSocket接続、Bot token、権限、message content intent、再接続運用が必要になるため初期方式にしない。

つまり「Discordへの返信で動く」には、Webhookだけでは足りない。
軽く安全に始めるなら `/meccha task` のSlash Commandを使う。
自然文の通常返信を拾うBotは、必要性が固まってから別Phaseで設計する。

## Command intake

Discord Webhookは片方向のため、DiscordからCodexへ直接指示を送る用途には使えない。
指示受付は `Discord Slash Command -> Cloudflare Worker -> GitHub Issue -> Codex` にする。

対応endpoint:

```text
POST /v1/integrations/discord/interactions
```

対応command:

```text
/meccha task title:<title> body:<body> priority:<P0|P1|P2|P3>
```

Workerの処理:

1. exact POSTとbody上限を確認する。
2. raw bodyの `x-signature-ed25519` と署名対象 `x-signature-timestamp` を副作用なしで検証し、許容時間外を拒否する。
3. 有界parse/schema検証を行い、interaction ID、command、guild/channel/user/roleを取得する。
4. `DISCORD_ALLOWED_GUILD_IDS`、`DISCORD_ALLOWED_CHANNEL_IDS`、`DISCORD_ALLOWED_USER_IDS`、`DISCORD_ALLOWED_ROLE_IDS` とcommand内容を検証する。
5. interaction ID、payload digest、receiptと再実行可能なIssue work/outboxを単一のatomic operationでauthoritative storeへ保存し、`received` にする。
6. guard commit成功後だけDiscordへ3秒以内にdeferred ephemeral responseを返す。保存失敗時は成功応答しない。
7. 保存済みoutboxからdispatcherを起動し、`GITHUB_ISSUE_TOKEN` でGitHub Issueを作成する。Issue作成結果が不明な場合は決定的correlation markerで照合するまで作成を自動再送しない。
8. receipt/workを `received`、lease付き`processing`、`retryable`、`reconcile_required`、`completed`、`dead_letter` で管理する。一時失敗・期限切れleaseは同じworkを再開し、同じID・digestの再送は新しいIssue workを作らず状態別に維持・再開・照合・冪等応答する。同じID・異なるdigestは拒否する。
9. Discord original responseをIssue URLで更新し、全副作用確認後だけ `completed` にする。retry上限到達は監査・運用アラート・明示再開対象にし、受理済みworkを黙って失わない。
10. CodexはGitHub Issueを正としてtriageする。

M2ではDiscord Interaction endpointを常時 `503 CALLBACK_MIGRATION_IN_PROGRESS` とし、署名検証、KV、GitHub Issue、Discord followupを行わない。`DISCORD_INTERACTION_STORE` KVの既存get→putはauthoritative replay guardではなく、C1のatomic guard commit後の短期応答cacheにだけ利用できる。OQ-031の方式決定、実装、schema/migration、並行再送・途中失敗・結果不明negative testは独立callbackマイルストーンC1で完了させ、完了前はpath別Access Bypassを有効化しない。C1再開時は下記の元契約と回復試験全件を再検証する。

危険操作検知:

- `production`、`deploy`、`migration`、`Stripe`、`billing`、`secret`、`AI API`、本番、課金、決済、共有リンクなどを含む依頼は危険操作候補として扱う。
- 危険操作候補のIssueには `approval-required` と `blocked-from-discord` を付ける。
- GitHub label作成に失敗した場合、labelなしIssueへfallbackしない。

Slash Command登録:

```bash
npm run discord:register-command
```

dry-run:

```bash
npm run discord:register-command:dry-run
```

登録に必要な環境変数:

- `DISCORD_APPLICATION_ID`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID` 開発中は必須。指定するとguild command。
- `DISCORD_REGISTER_GLOBAL` 任意。`true` の場合だけglobal command登録を許可する。

Workerに必要なsecret:

- `DISCORD_PUBLIC_KEY`
- `GITHUB_ISSUE_TOKEN`

移行前baseline Workerの任意cache binding:

- `DISCORD_INTERACTION_STORE`（atomic guard commit後の短期応答cache専用。authoritative replay guard不可）

authoritative receipt/work用binding名はOQ-031で方式確定後に追加し、環境変数台帳、ADR、schema/migration、testを同じPRで更新する。`DISCORD_PUBLIC_KEY` と `GITHUB_ISSUE_TOKEN` はCloudflare Worker runtimeで使うため、GitHub SecretsだけではなくCloudflare Secretにも登録する。値はチャット、Markdown、ログへ貼らない。

Workerに設定できる制限:

- `DISCORD_ALLOWED_GUILD_IDS`
- `DISCORD_ALLOWED_CHANNEL_IDS`
- `DISCORD_ALLOWED_USER_IDS`
- `DISCORD_ALLOWED_ROLE_IDS`
- `DISCORD_ALLOW_UNSCOPED_COMMANDS`
- `GITHUB_ISSUE_REPOSITORY`

## Non-approvable from Discord only

次の操作はDiscordだけでは承認済みにしない。

- production反映
- secret変更
- DB migration
- 課金設定
- 共有リンク公開
- 実ユーザーデータの閲覧
- AI API有効化
- PR merge

GitHub PR、Cloudflare Access/D1/R2/Workers側の承認ゲートを正本にする。

## Discord PR review buttons

DiscordのPR通知には、次のbuttonを付ける。

- `PRを開く`: GitHub PRを開く。
- `状態確認`: GitHub APIでPRの `state`、`draft`、`merged`、`mergeable`、combined statusを確認し、Discordへephemeral responseで返す。
- `マージ依頼`: `merge-requested` labelとPRコメントを残す。

`マージ依頼` は実際のmerge実行ではない。
実mergeはGitHub上で必須check、P0/P1、owner承認、危険操作有無を確認してから行う。
Discord buttonから直接mergeする方式は、監査、誤操作、権限漏れ、branch protection迂回のリスクがあるため、別ADRで安全条件が固まるまで採用しない。

PR通知buttonは `scripts/discord-notify.mjs` で `DISCORD_NOTIFY_COMPONENTS=pr` を指定した場合だけ付与する。
`DISCORD_BOT_TOKEN` と通知先channel IDが設定されている場合はBot送信を優先し、`状態確認` と `マージ依頼` のinteractive buttonを有効にする。
Bot送信に必要なchannel IDが未設定の場合は既存Webhook通知へfallbackし、`PRを開く` のlink buttonだけを付ける。

対応するDiscord component custom ID:

```text
meccha:pr:status:<owner>/<repo>:<number>
meccha:pr:merge_request:<owner>/<repo>:<number>
```

Workerは `DISCORD_ALLOWED_GUILD_IDS`、`DISCORD_ALLOWED_CHANNEL_IDS`、`DISCORD_ALLOWED_USER_IDS`、`DISCORD_ALLOWED_ROLE_IDS` をSlash Commandと同じように確認する。
対象repositoryは `GITHUB_ISSUE_REPOSITORY` または既定の `hozuo0906/meccha-manual` に限定する。
