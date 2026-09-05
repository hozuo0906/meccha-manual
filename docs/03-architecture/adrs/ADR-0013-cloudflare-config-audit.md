# ADR-0013 Cloudflare設定監査をGitHub Actionsから実行する

Status: Accepted

## Context

Codex実行環境がCloudflare Dashboardへ未ログインの場合、Workerのsecret、KV binding、runtime設定を直接確認できない。
一方でGitHub Secretsには `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` が登録済みであり、GitHub ActionsからCloudflare APIへアクセスできる。

## Decision

`Cloudflare Config Audit` workflowを追加し、Cloudflare Workerの設定監査をGitHub Actionsから実行する。

監査対象:

- Worker secret名の存在
- KV namespace一覧
- `/health/config` のDiscord bridge設定有無
- Discord通知への日本語所感

監査で出してよい情報:

- Worker名
- health URL
- secret名
- KV namespace title
- KV namespace ID
- runtime設定の有無

出してはいけない情報:

- secret値
- token値
- Discord Webhook URL
- 実ユーザーの入力内容
- 操作ログ全文

## Consequences

- Cloudflare Dashboardへ毎回ユーザーが入らなくても、Actions SummaryとDiscordで設定状態を確認できる。
- `wrangler.jsonc` にKV binding IDを固定するための材料を、secretを漏らさず取得できる。
- workflowが失敗した場合は、Worker secrets、KV namespace、Discord allowlist、GitHub Secretsのどれが不足しているかを先に確認する。

## 2026-09-05 read-only診断への改訂

Cloudflare Access / Workers / D1移行方針（ADR-0028）に合わせ、監査を実環境のread-only診断として改訂する。Cloudflare APIのhostとGET endpointをscript内で固定し、Worker設定・binding、Worker secretの取得可否と必須件数、D1/R2/Access applicationの件数を確認する。Worker inputは狭い形式に検証し、redirectを追跡せず、timeoutとresponse上限を適用する。

出力は固定ラベル、状態、件数、許可済みbindingのNAME/種類に限定する。API token、account ID、resource ID、secret値、email、policy内容、response body、実URL、生エラーはログ、summary、artifactへ出さない。Discord通知、resourceの作成・更新・削除、deploy、DB query、secret値取得、Access policy変更は行わない。診断成功は移行・staging合格・alpha完成の判定へ流用しない。

## References

- `scripts/cloudflare-config-audit.mjs`
- `.github/workflows/cloudflare-config-audit.yml`
- `docs/08-operations/cloudflare-config-audit.md`
