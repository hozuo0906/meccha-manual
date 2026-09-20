# B登録 owner pilot runtime

Status: Proposed

この手順は、B登録UIを owner 限定で実環境確認するための準備物を固定する。Cのclaim、asset転送、production公開、外部ユーザー招待、データexport、個人情報や認証内容のログ保存は対象外とする。

## 対象originとWorker

| 環境 | Worker | `APP_ENV` | `APP_BASE_URL` | D1 |
|---|---|---|---|---|
| staging | `meccha-manual-staging` | `staging` | `https://meccha-manual-staging.meccha-iiyatsu.com` | `meccha-manual-d1-staging` / `99b0c9b6-2bdf-4e65-9c43-3e336b6d3376` |
| production | `meccha-manual-prod` | `production` | `https://meccha-manual.meccha-iiyatsu.com` | owner確定待ち（設定はplaceholderで停止） |

`GET /onboarding/continue` の有効化は、Workerが信頼した `APP_ENV` と `APP_BASE_URL` の組み合わせが上表に完全一致し、request originも同じ文字列である場合だけとする。host反映、wildcard、client側のフラグだけでは有効化しない。productionのAccess audience、D1 ID、rate-limit namespaceが未確定の間は、production設定をdeployしない。

Access issuerは `https://restless-queen-0273.cloudflareaccess.com`、JWKS URLは `https://restless-queen-0273.cloudflareaccess.com/cdn-cgi/access/certs` を確認済みの候補として扱う。staging／productionのapplication audience、application policy、登録済みhostは未確認であり、placeholderや推測値を設定へ入れない。audienceが揃わない場合は `ACCESS_AUDIENCE` を未設定のままにしてWorkerをfail closedにする。

専用設定は `workers_dev: false` を固定する。stagingだけ `preview_urls: true` を使って immutable candidate を検証できるが、candidate origin は allowlist外なので onboarding UI を有効化せず、Access deny-by-default と staging D1だけを前提にする。productionは `preview_urls: false` とし、正式originの設定・Access・D1が揃うまで到達経路を作らない。

## bindingとmigration stage gate

stagingだけに `DB` と `ONBOARDING_RATE_LIMITER` を binding する。rate limitは同一binding内で actor key と Cloudflare edge の source key に各10回／60秒を適用し、namespaceは staging `1001` を使う。raw IP、JWT、operation payloadをログや文書へ保存しない。

remote D1 migrationは次の順番を守る。

1. `0001_d1_identity_workspace.sql`
2. `0002_d1_personal_workspace.sql`
3. `0003_d1_onboarding_bootstrap.sql`

各migrationの適用結果、D1 workspace越境拒否、未認証／unknown actor拒否、同一operation再送、失敗時rollbackを staging の検証証跡として確認する。migrationファイルを追加しただけ、またはdry-runだけでは適用済みと扱わない。

## owner pilot gate

immutable candidate previewでは、preview originがallowlist外でありUI／bootstrap APIが無効になること、production D1へ到達しないことを否定検証する。staging正式hostでは、staging専用Access application・issuer・JWKS URL・audienceをownerが確認した後、合成handoffを手動生成して一度だけ正常系を確認する。現行の限定配布物はproduction origin固定かつ`pending`のため、staging hostへの拡張機能からの通し試験はこの手順の対象外とし、staging originを明示した配布設定の別承認後に行う。

staging正常系の確認項目は、Access JWTの検証、unknown humanのbootstrap以外403、bootstrapのPersonal Workspace準備、同一operation再送の冪等性、429／503時のlocal原本保持、formal production originへの到達不可である。結果に本文、画像、credential、raw IP、Access tokenを含めない。issuer、JWKS URL、audienceが未確定または環境間で不一致なら、合成handoffを使った場合でもbootstrapを実行せず停止する。

productionへ進む条件は、staging gateの記録、production専用Access application／audience、production D1、rate-limit namespace、migration適用計画、rollback条件を別々に確認し、ownerが明示承認することである。この文書はproduction資源の作成・migration・deployを承認しない。
