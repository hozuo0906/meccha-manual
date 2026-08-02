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

## サービス対応表

| 区分 | staging | production | 分離・承認規則 |
|---|---|---|---|
| GitHub Environment | `staging` | `production` | secretを共有しない。productionはrequired reviewers必須 |
| Cloudflare Worker環境 | `meccha-manual-staging` | `meccha-manual-production` | route、binding、DO、secretを分離 |
| Supabase project | `meccha-manual-staging` | `meccha-manual-production` | project ref、Auth、DB、credentialを共有しない |
| R2 bucket | `*-staging` の4 bucket | `*-prod` の4 bucket | 論理bindingは同じ、物理bucketは分離 |
| Stripe | test mode | live mode | Product/Price/Payment Link/Webhook/secretを共有しない |

R2の正確な8 bucket名は [R2 Storageハーネス](r2-storage-harness.md)、Stripe設定は [Stripe課金ハーネス](stripe-billing-harness.md) を正本とする。previewはproduction credentialを利用せず、原則mockまたは明示的なpreview用設定を使う。

## `main` merge後の扱い

`main` mergeはリリース候補の確定であり、production反映の承認ではない。CIと秘密値不要のdry-runを実行し、必要に応じてstaging deployを環境gate経由で開始する。main pushをtriggerにしたproduction deploy、production migration、R2変更、Stripe live変更は有効化しない。

production deployは、対象commitを固定し、stagingのcheck/smoke/RLS negative test/rollback確認/P0・P1 0件を証跡化した後、GitHub `production` Environmentのrequired reviewerが手動承認する。承認後もDB migration、secret、bucket、Stripeはdeployと別の危険操作として対象と影響を表示し、個別承認する。

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

PR運用の正本は `docs/09-delivery/pr-workflow.md` とする。

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
