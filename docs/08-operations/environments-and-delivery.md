# 環境とデリバリー

Status: Accepted

## 方針

`めっちゃマニュアル` は本番開発へ入る前に、stagingとproductionを分離する。
PRで小さく検証し、stagingで本番同等の確認を行い、production反映は明示承認後に実施する。

## 環境

| 環境 | 用途 | データ | 反映条件 |
|---|---|---|---|
| local | 最小確認、外部接続の原則モック | ローカル/検証用 | 任意 |
| preview | PRごとの静的チェックと軽いUI確認 | 検証用 | PR作成 |
| staging | 本番同等検証、migration、RLS、E2E、Browser Run確認 | staging専用 | PR merge前または手動承認 |
| production | 本番 | production専用 | staging合格後の明示承認 |

## Cloudflare

推奨Worker:

- staging: `meccha-manual-staging`
- production: `meccha-manual-production`

本番独自ドメインを設定するまでは、`workers.dev` URLを使う。
Cloudflareアカウントの `workers.dev` サブドメインはアカウント単位の設定であり、プロジェクト単位ではない。

## Supabase

推奨プロジェクト:

- staging: `meccha-manual-staging`
- production: `meccha-manual-production`

stagingとproductionでSupabase project ref、Auth URL、DB、Storageを分離する。
productionのservice role key、DB password、JWT Secret、connection stringはMarkdown、ログ、GitHub variablesへ保存しない。

## GitHub

推奨branch:

- `main`: production候補。直接pushせずPRを基本にする。
- `develop` または `staging`: staging反映候補。
- `feature/*`: 機能単位。
- `review/*`: 辛口レビュー、リファクタリング修正。

推奨必須チェック:

- `Validate docs`
- `npm run check`
- RLS negative test
- Phase smoke test
- UI/E2E smoke test
- `Discord Notify Test`
- `Deployment Gates`

## Release gate

production反映前に必ず確認する。

- staging migration適用済み
- staging smoke test成功
- RLS negative test成功
- P0/P1レビュー指摘0件
- rollback手順確認済み
- Discordへリリース候補通知済み
- ユーザー承認済み

CloudflareのGit連携でmain pushが自動production deployになる設定は避ける。
production deployはGitHub Environmentの `production` 承認ゲートを通す。
GitHubの `production` environmentにはrequired reviewersを設定する。

## Discord

GitHub Actionsの結果はDiscordへ通知する。
Discord通知は開発報告の補助であり、secret変更、DB migration、本番反映、課金設定、共有リンク公開の正本承認には使わない。

詳細は `docs/08-operations/discord-reporting-and-command-bridge.md` を正とする。
