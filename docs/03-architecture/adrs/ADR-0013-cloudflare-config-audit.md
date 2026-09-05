# ADR-0013 Cloudflare設定監査をGitHub Actionsから実行する

Status: Accepted

## Context

Codex実行環境がCloudflare Dashboardへ未ログインの場合、Workerのsecret、KV binding、runtime設定を直接確認できない。
一方でGitHub Secretsには `CLOUDFLARE_ACCOUNT_ID` と `CLOUDFLARE_API_TOKEN` が登録済みであり、GitHub ActionsからCloudflare APIへアクセスできる。

## Decision

`Cloudflare Config Audit` workflowを追加し、Cloudflare APIのread-only設定診断をGitHub Actionsから実行する。

監査対象:

- Worker設定・bindingの取得可否と件数
- Worker secret一覧の取得可否と必須secret件数
- D1 database、R2 bucket、Access applicationの一覧取得可否と件数
- 401、403、404、timeout、network failureなどの安全な状態分類

診断で出してよい情報:

- 固定ラベル、状態、件数
- 許可済みbindingのNAMEと種類

出してはいけない情報:

- secret値、API token、account ID、resource ID
- email、Access policy内容、response body、実URL、生エラー
- Discord通知

## Consequences

- Cloudflare Dashboardへ毎回ユーザーが入らなくても、Actions Summaryとartifactで設定状態を確認できる。
- workflowが失敗した場合は、出力された固定状態分類を手掛かりに外部設定を確認する。

## 2026-09-05 read-only診断への改訂

Cloudflare Access / Workers / D1移行方針（ADR-0028）に合わせ、監査を実環境のread-only診断として改訂する。Cloudflare APIのhostとGET endpointをscript内で固定し、Worker設定・binding、Worker secretの取得可否と必須件数、D1/R2/Access applicationの件数を確認する。Worker inputは狭い形式に検証し、redirectを追跡せず、timeoutとresponse上限を適用する。

出力は固定ラベル、状態、件数、許可済みbindingのNAME/種類に限定する。API token、account ID、resource ID、secret値、email、policy内容、response body、実URL、生エラーはログ、summary、artifactへ出さない。Discord通知、resourceの作成・更新・削除、deploy、DB query、secret値取得、Access policy変更は行わない。診断成功は移行・staging合格・alpha完成の判定へ流用しない。

## References

- `scripts/cloudflare-config-audit.mjs`
- `.github/workflows/cloudflare-config-audit.yml`
- `docs/08-operations/cloudflare-config-audit.md`
