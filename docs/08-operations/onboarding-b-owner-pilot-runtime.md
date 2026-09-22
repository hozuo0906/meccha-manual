# B登録 owner pilot runtime

Status: Proposed

この手順は、B登録UIを owner 限定で実環境確認するための準備物を固定する。Cのclaim、asset転送、production公開、外部ユーザー招待、データexport、個人情報や認証内容のログ保存は対象外とする。C backendの正本は[guest claim API契約](../05-api/guest-onboarding-and-claim-api.md)とし、frontendのcloud-save C slice配布手順は別runbookへ分離する。この文書にあるmanifest `0.1.1`の導入記載とstaging Access未確認の記載はB時点の履歴であり、現行Cの判断・導入手順へ流用しない。履歴本文は書き換えず、現行Cへの適用範囲だけを限定的に失効させる。

## 対象originとWorker

| 環境 | Worker | `APP_ENV` | `APP_BASE_URL` | D1 |
|---|---|---|---|---|
| staging | `meccha-manual-staging` | `staging` | `https://meccha-manual-staging.meccha-iiyatsu.com` | staging専用D1（IDはDashboardのみ） |
| production | `meccha-manual-prod` | `production` | `https://meccha-manual.meccha-iiyatsu.com` | owner確定待ち（設定はplaceholderで停止） |

`GET /onboarding/continue` の有効化は、Workerが信頼した `APP_ENV` と `APP_BASE_URL` の組み合わせが上表に完全一致し、request originも同じ文字列である場合だけとする。host反映、wildcard、client側のフラグだけでは有効化しない。productionのAccess audience、D1 ID、rate-limit namespaceが未確定の間は、production設定をdeployしない。

Access issuer／JWKS URLは確認済みのDashboard設定をWorker varsへ登録する。staging／productionのapplication audience、application policy、登録済みhostは未確認であり、実値や推測値をMarkdownへ記録しない。audienceが揃わない場合は `ACCESS_AUDIENCE` を未設定のままにしてWorkerをfail closedにする。

上記の「staging／production … 未確認」はBのmanifest `0.1.1`履歴に限る。現行C `0.1.2`のAccess・実staging適用・完了判定は、Issue #70とPR #256のlive stateを確認して判断し、この履歴記載を現在の根拠にしない。

専用設定は `workers_dev: false` と `keep_vars: true` を固定する。Dashboardで管理するAccess runtime varsをdeployで消去しない。stagingだけ `preview_urls: true` を使って immutable candidate を検証できるが、candidate origin は allowlist外なので onboarding UI を有効化せず、Access deny-by-default と staging D1だけを前提にする。productionは `preview_urls: false` とし、正式originの設定・Access・D1が揃うまで到達経路を作らない。

## bindingとmigration stage gate

stagingだけに `DB` と `ONBOARDING_RATE_LIMITER` を binding する。rate limitは同一binding内で actor key と Cloudflare edge の source key に各10回／60秒を適用し、namespaceは staging `1001` を使う。raw IP、JWT、operation payloadをログや文書へ保存しない。

remote D1 migrationは次の順番を守る。

1. `0001_d1_identity_workspace.sql`
2. `0002_d1_personal_workspace.sql`
3. `0003_d1_onboarding_bootstrap.sql`
4. `0004_d1_cloud_manual_claim.sql`（C slice。B1〜B3のbootstrap適用後に別gateで適用）

各migrationの適用結果、D1 workspace越境拒否、未認証／unknown actor拒否、同一operation再送、失敗時rollbackを staging の検証証跡として確認する。`0004`はCのclaim／asset／manual境界とR2 bindingのgateであり、B1〜B3のbootstrap検証済みを置き換えない。migrationファイルを追加しただけ、またはdry-runだけでは適用済みと扱わない。

現行C `0.1.2`では、上記のD1／rate limiterに加えて、private R2の `MANUAL_ASSETS` bindingをstaging Workerへ接続し、`0004_d1_cloud_manual_claim.sql`でclaim／asset／manualの記録境界を適用する。拡張機能から受け取る手順書本文とマスク後のPNG画像は、このC経路のclaim／asset転送で扱う。これはB履歴の範囲を更新するものではなく、Cの別runbookで管理する。実stagingのmigration・binding・deployは現時点で未実施であり、この追記を適用済みの証跡にしない。

### Windows checkoutの既存migrationをLFへ正規化する手順

`.gitattributes`の追加後も、既存のWindows checkoutにあるcleanなSQLは自動で書き換わらないことがある。未commitのSQLを失わないため、リポジトリrootで次のNode手順を実行する。対象migrationに差分がある場合は何も書き換えず停止し、利用者が既存差分を別途保全またはcommitしてから再実行する。差分の内容をIssue、PR、ログへ記録しない。

```powershell
node scripts/normalize-d1-migrations.mjs
```

この手順は対象migrationのdirty状態を最初に確認し、現行のLF-normalizedな`HEAD`およびindex blobとworking treeの意味が一致することを全件確認した後、Git blob由来のLF bytesを書き戻す。HEADまたはindexにCRLF・別内容がある場合は書き換えず停止する。書き戻し後は対象4本を個別に`git add --renormalize -- <4 paths>`へ渡して属性変更後のindex状態を更新し、index blobが変わらずGit statusがcleanであることを確認する。事前に内容を固定比較し、通常のstage対象は4本に限定する。完了メッセージとCRLF検査を確認してからremote migrationを実行する。

## owner pilot gate

immutable candidate previewでは、preview originがallowlist外でありUI／bootstrap APIが無効になること、production D1へ到達しないことを否定検証する。staging正式hostでは、staging専用Access application・issuer・JWKS URL・audienceをownerが確認した後、合成handoffを手動生成して一度だけ正常系を確認する。owner限定staging配布版はstaging originを明示しているが、配布ZIPを実Chromeへ導入した通し確認は、コード回帰やWeb画面の個別境界確認とは別の証跡として記録する。

staging正常系の確認項目は、Access JWTの検証、unknown humanのbootstrap以外403、bootstrapのPersonal Workspace準備、同一operation再送の冪等性、429／503時のlocal原本保持、formal production originへの到達不可である。結果に本文、画像、credential、raw IP、Access tokenを含めない。issuer、JWKS URL、audienceが未確定または環境間で不一致なら、合成handoffを使った場合でもbootstrapを実行せず停止する。

## owner限定staging配布版の導入

このbranchの拡張機能配布版は、manifest version `0.1.1`としてstaging B登録UIだけへ接続する。導入時は配布ZIPを展開し、Chromeの拡張機能管理画面でデベロッパーモードを有効にして「パッケージ化されていない拡張機能を読み込む」から展開フォルダを選ぶ。既存版を更新する場合は同じフォルダのファイルを更新してから拡張機能管理画面の再読み込みを行い、拡張機能のlocal storageと下書きを保持する。

配布設定とunit／browser回帰ではstaging originへの接続を実装済みである。配布ZIPを実Chromeへ導入してstaging Accessからbootstrapまで通す確認は別の実行証跡であり、この文書だけでは実施済みと扱わない。production、preview、localhost、任意のuserinfo／port／path／query付きoriginへ接続する配布物は使用しない。

このB配布版はPersonal Workspaceの準備までを対象とする。手順書本文・画像のクラウド保存、guest claim、asset転送、元の保存操作の再開は、このB配布版へは未統合であり、C backend API契約とは別のfrontend cloud-save C sliceで扱う。認証取消、通信失敗、保存失敗では拡張機能のlocal原本を保持する。

この節はmanifest `0.1.1`のB履歴として保存する。現行Cのmanifest `0.1.2`、本文・マスクPNGを含むclaim、`MANUAL_ASSETS`、`0004`、一覧・編集・再保存の利用者手順は、[Cクラウド保存スライス](../09-delivery/cloud-save-c-slice.md)を参照する。B履歴の「このbranch」「0.1.1」「Access staging未確認」は、現行Cの判断へ再利用しない。

productionへ進む条件は、staging gateの記録、production専用Access application／audience、production D1、rate-limit namespace、migration適用計画、rollback条件を別々に確認し、ownerが明示承認することである。この文書はproduction資源の作成・migration・deployを承認しない。
