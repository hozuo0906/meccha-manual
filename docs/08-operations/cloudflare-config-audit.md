# Cloudflare設定監査

Status: Accepted

Supabase URL/anon key fingerprintの監査は移行前runtime baselineに限る。Issue #176 M3/M6以外のstaging合格証跡へ流用せず、新しい正本はAccess application/audience/policyとD1/R2/Worker binding境界である。

## 目的

Cloudflare DashboardへCodex実行環境がログインできない場合でも、GitHub ActionsからCloudflare設定を確認できるようにする。

この監査は、ユーザーに毎回Cloudflare画面を確認してもらう作業を減らすためのハーネスである。

## 実行方法

GitHub Actionsで `Cloudflare Config Audit` を手動実行する。

既定値:

- Worker name: `meccha-manual`

Worker名はworkflow inputから受け取るが、監査scriptで狭い形式に検証する。Cloudflare APIのhostとGET endpointはscript内で固定し、入力からURLを組み立てない。

使用するendpointは、Workers設定・secret一覧、D1 database一覧、R2 bucket一覧、Access application一覧の各GETに限定する。API仕様はCloudflare公式API Reference（Workers Scripts Settings、D1 Database、R2 Buckets、Zero Trust Access Applications）を基準にする。

## 必要なGitHub Secrets

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

Discord webhookは使用しない。

## 確認するもの

- Worker設定とbindingの取得可否、binding総数
- 許可済みbindingのNAMEと種類（`DB`、`DISCORD_INTERACTION_STORE`、将来のD1/R2/Browser Run/Durable Object候補）
- Worker secret一覧の取得可否と必須secretの件数（secret名・値は出さない）
- D1、R2、Access applicationの一覧取得可否と件数
- 401、403、404、timeout、network failureなどの安全な状態分類

## 出力してよいもの

- 固定ラベル、状態、件数
- 許可済みbindingのNAMEと種類
- read-only診断であることと移行判断へ流用できない注意書き

## 出力してはいけないもの

- secret値、API token、account ID、resource ID
- email、Access policy内容、response body、実URL
- 入力されたWorker名、APIの生エラー
- Discord通知

## 監査後の判断

監査が確認完了の場合でも、これはCloudflare APIのread-only取得が成功したことだけを示し、移行・staging合格・alpha完成を意味しない。資源作成、binding変更、deploy、DB query、secret値取得、Access policy変更は別承認とする。

取得失敗の場合は、出力された固定状態分類（認証無効、権限不足、対象なし、タイムアウト等）だけを手掛かりにowner/adminが外部設定を確認する。API本文や実URLを転載しない。

## 旧監査履歴

2026-08-02のWrangler監査は移行前baselineとして保持する。現在のread-only診断はresource IDやDiscord runtime値を出力せず、Cloudflare APIの取得可否・状態・件数と許可済みbindingのNAME/種類だけを扱う。

## 2026-08-13 Phase 1外部設定の確定

現在の単一Workerはproductionではなく暫定dev/stagingである。Dashboard側の既存varsに依存して環境境界が曖昧にならないよう、`wrangler.jsonc` へ次を明示する。

- `APP_ENV=staging`
- `APP_BASE_URL=https://meccha-manual.tattoo-studio-crm.workers.dev`
- `BILLING_FEATURE_ENABLED=false`

`keep_vars=true` は既存のDashboard設定を不用意に削除しないため維持する。一方、上記3項目はソース管理されたstaging境界を正とし、production URL、production Access/D1/R2/Worker、live billingへfallbackしない。

Repository visibilityはPhase 1 prelaunchでは **publicを維持する**。理由は、現リポジトリが公開前提のソース・設計文書・公開可能なanon keyのみを扱い、secret値、service role key、DB password、JWT Secret、実ユーザーPIIをコミットしない運用を既存のsecret scanとPR gateで強制しているためである。秘密値や実業務データを公開リポジトリへ置くことを許可する判断ではない。公開継続が不適切になる要件が入った場合は、visibility変更を別の明示判断として扱う。

GitHub branch protectionのrequired checks、up-to-date要求、conversation resolution、bypass禁止、GitHub Environment required reviewersはRepository/Dashboard外部設定であり、リポジトリ内の静的ハーネスだけでは設定完了とみなさない。

## PR mergeとの関係

DiscordからPR内容確認やレビュー依頼はできるようにする。
ただし初期運用ではDiscordボタンだけでPR mergeは実行しない。

PR mergeの正本は、GitHubのrequired checks、owner approval、branch protection、監査ログとする。
