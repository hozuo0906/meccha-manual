# Discord Slash Command登録

Status: Accepted

## 目的

Discordから開発依頼を送る入口として `/meccha task` を登録する。
通常のDiscord返信ではなく、Discord InteractionをCloudflare Workerで受けてGitHub Issueへ変換する。

## 登録方式

GitHub Actionsの `Discord Register Command` workflowを使う。
Bot tokenをローカル端末に置かず、GitHub Secretsから登録する。

## GitHub Secrets

登録に必要なSecret:

- `DISCORD_APPLICATION_ID`
- `DISCORD_BOT_TOKEN`
- `DISCORD_GUILD_ID`

既に通知で使っているSecret:

- `DISCORD_WEBHOOK_URL`

## Discord Developer Portalで取得する値

1. Discord Developer Portalでアプリを作る。
2. General Informationの `APPLICATION ID` を `DISCORD_APPLICATION_ID` に登録する。
3. Botを作り、tokenを `DISCORD_BOT_TOKEN` に登録する。
4. 開発用Discord serverのIDを `DISCORD_GUILD_ID` に登録する。
5. Botを開発用Discord serverへ招待する。

## 最初の実行

GitHub Actionsで `Discord Register Command` を手動実行する。

推奨入力:

- `command_scope`: `guild`
- `dry_run`: `true`

dry runが成功したら、次に `dry_run=false` で実行する。
guild commandは反映が速いため、開発中はglobal commandを使わない。

## 確認方法

Discordで `/meccha task` が候補に出ることを確認する。
まだCloudflare Worker側のInteraction URLとsecretが未設定の場合、コマンド実行は失敗する可能性がある。
その場合でも、コマンド登録自体は成功している。

## 注意

Discordからの依頼はGitHub Issue化までに限定する。
本番反映、DB migration、secret変更、課金設定、AI API有効化はDiscordだけでは承認済みにしない。
