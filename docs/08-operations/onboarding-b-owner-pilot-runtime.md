# B登録 owner pilot runtime

Status: Proposed

この手順は、B登録UIを owner 限定で実環境確認するための準備物を固定する。Cのclaim、asset転送、production公開、外部ユーザー招待、データexport、個人情報や認証内容のログ保存は対象外とする。

## 対象originとWorker

| 環境 | Worker | `APP_ENV` | `APP_BASE_URL` | D1 |
|---|---|---|---|---|
| staging | `meccha-manual-staging` | `staging` | `https://meccha-manual-staging.meccha-iiyatsu.com` | staging専用D1（IDはDashboardのみ） |
| production | `meccha-manual-prod` | `production` | `https://meccha-manual.meccha-iiyatsu.com` | owner確定待ち（設定はplaceholderで停止） |

`GET /onboarding/continue` の有効化は、Workerが信頼した `APP_ENV` と `APP_BASE_URL` の組み合わせが上表に完全一致し、request originも同じ文字列である場合だけとする。host反映、wildcard、client側のフラグだけでは有効化しない。productionのAccess audience、D1 ID、rate-limit namespaceが未確定の間は、production設定をdeployしない。

Access issuer／JWKS URLは確認済みのDashboard設定をWorker varsへ登録する。staging／productionのapplication audience、application policy、登録済みhostは未確認であり、実値や推測値をMarkdownへ記録しない。audienceが揃わない場合は `ACCESS_AUDIENCE` を未設定のままにしてWorkerをfail closedにする。

専用設定は `workers_dev: false` と `keep_vars: true` を固定する。Dashboardで管理するAccess runtime varsをdeployで消去しない。stagingだけ `preview_urls: true` を使って immutable candidate を検証できるが、candidate origin は allowlist外なので onboarding UI を有効化せず、Access deny-by-default と staging D1だけを前提にする。productionは `preview_urls: false` とし、正式originの設定・Access・D1が揃うまで到達経路を作らない。

## bindingとmigration stage gate

stagingだけに `DB` と `ONBOARDING_RATE_LIMITER` を binding する。rate limitは同一binding内で actor key と Cloudflare edge の source key に各10回／60秒を適用し、namespaceは staging `1001` を使う。raw IP、JWT、operation payloadをログや文書へ保存しない。

remote D1 migrationは次の順番を守る。

1. `0001_d1_identity_workspace.sql`
2. `0002_d1_personal_workspace.sql`
3. `0003_d1_onboarding_bootstrap.sql`

各migrationの適用結果、D1 workspace越境拒否、未認証／unknown actor拒否、同一operation再送、失敗時rollbackを staging の検証証跡として確認する。migrationファイルを追加しただけ、またはdry-runだけでは適用済みと扱わない。

### Windows checkoutの既存migrationをLFへ正規化する手順

`.gitattributes`の追加後も、既存のWindows checkoutにあるcleanなSQLは自動で書き換わらないことがある。未commitのSQLを失わないため、次のPowerShell手順をそのまま実行する。対象migrationに差分がある場合は何も書き換えず停止し、利用者が既存差分を別途保全またはcommitしてから再実行する。差分の内容をIssue、PR、ログへ記録しない。

```powershell
$repo = (Get-Location).Path
$paths = @(
  "migrations/0001_d1_identity_workspace.sql",
  "migrations/0002_d1_personal_workspace.sql",
  "migrations/0003_d1_onboarding_bootstrap.sql"
)
$dirty = @(git status --porcelain=v1 -- $paths)
if ($dirty.Count -gt 0) {
  Write-Error "migration files have uncommitted changes; preserve or commit them privately, then stop"
  exit 2
}

foreach ($path in $paths) {
  $expected = (git rev-parse ("HEAD:" + $path)).Trim()
  if ($LASTEXITCODE -ne 0) { throw "missing Git blob: $path" }
  git -c core.autocrlf=false checkout-index --force -- $path
  if ($LASTEXITCODE -ne 0) { throw "LF checkout failed: $path" }
  $actual = (git hash-object --no-filters -- $path).Trim()
  if ($actual -ne $expected) { throw "working tree differs from Git blob: $path" }
  if ([IO.File]::ReadAllBytes((Join-Path $repo $path)) -contains [byte]13) {
    throw "CRLF remains in migration: $path"
  }
}
git diff --exit-code -- migrations
if ($LASTEXITCODE -ne 0) { throw "migration diff remains after normalization" }
```

差分がある場合は、利用者が既存SQLを確認・commitまたは別途保全してから再実行する。`checkout-index --force`はcleanな対象だけに使い、未commit SQLへ自動適用しない。全対象でGit blob SHAと実ファイルSHAが一致し、CRLFがないことを確認してからremote migrationを実行する。

## owner pilot gate

immutable candidate previewでは、preview originがallowlist外でありUI／bootstrap APIが無効になること、production D1へ到達しないことを否定検証する。staging正式hostでは、staging専用Access application・issuer・JWKS URL・audienceをownerが確認した後、合成handoffを手動生成して一度だけ正常系を確認する。現行の限定配布物はproduction origin固定かつ`pending`のため、staging hostへの拡張機能からの通し試験はこの手順の対象外とし、staging originを明示した配布設定の別承認後に行う。

staging正常系の確認項目は、Access JWTの検証、unknown humanのbootstrap以外403、bootstrapのPersonal Workspace準備、同一operation再送の冪等性、429／503時のlocal原本保持、formal production originへの到達不可である。結果に本文、画像、credential、raw IP、Access tokenを含めない。issuer、JWKS URL、audienceが未確定または環境間で不一致なら、合成handoffを使った場合でもbootstrapを実行せず停止する。

productionへ進む条件は、staging gateの記録、production専用Access application／audience、production D1、rate-limit namespace、migration適用計画、rollback条件を別々に確認し、ownerが明示承認することである。この文書はproduction資源の作成・migration・deployを承認しない。
