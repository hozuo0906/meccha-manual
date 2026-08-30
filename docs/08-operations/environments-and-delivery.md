# Staging / Production 環境分離とデリバリー

Status: Accepted

## 目的と現在地

`めっちゃマニュアル` の検証資源と本番資源を混在させず、`main` へのマージとproduction反映を別の判断にする。本書はIssue #21と、R2契約を固定したIssue #23を前提とする静的ハーネスであり、外部リソースの作成・変更・deployは行わない。

現在のSupabase projectと単一Worker設定は **暫定dev/staging** として扱う。staging R2 4 bucketはユーザーの作成完了申告があるがbinding未追加で、production Supabase project、production R2 bucket、Stripe設定、独自ドメインのCloudflare接続は未作成である。ドメイン`meccha-iiyatsu.com`と正式URLはADR-0024で確定したが、`wrangler.jsonc` にproduction route、環境別binding、Durable Object migrationをまだ追加しない。

Cloudflare Git連携のnon-production branch buildはIssue #92のP0対策として無効化している。production branchは `main` のまま、deploy commandを `npx wrangler versions upload` とし、push時にversionを作成してもactive deploymentへ自動promoteしない。Phase 1 RLS Live Gateは `main` から手動実行し、同じAccess保護されたimmutable version経路を使う。Issue #92のmain merge holdはbackend分離negative proofとlive RLS証跡が完了するまで維持する。これはproduction分離完了を意味せず、最初の外部ユーザー登録または「本番公開」判断の前に `prelaunch-shortcut-and-launch-gate.md` を全項目確認して解除する。

## 環境対応表

名称は契約上の論理名である。実ID、project ref、account ID、実接続URL、Secret値は文書やログへ記録しない。ただし、ユーザー指定の技術的サブドメイン名は移行対象を識別するため本書に限り記録する。

| 区分 | staging | production | 分離・承認ルール |
|---|---|---|---|
| GitHub Environment | `staging` | `production` + required reviewers | Secrets/Variablesを環境別に登録し、共有しない。production jobは必ず`production`を参照する |
| GitHub Actions | `.github/workflows/deploy-staging.yml` | `.github/workflows/deploy-production.yml` | 現段階は静的checkだけ。deploy stepの追加・有効化は別PRとユーザー承認が必要 |
| RLS immutable preview | `main` Git buildのversion uploadと手動live gate。Access deny-by-default | 使用しない | non-production branch buildでは生成せず、Cloudflare account membersとpreview専用service tokenだけを許可する |
| Cloudflare Worker environment | `meccha-manual-staging` / Wrangler `staging` | `meccha-manual-prod` / Wrangler `production` | Worker名、vars、Secrets、binding、routeを環境別にする |
| Supabase project | 現projectを暫定dev/stagingとして利用 | `meccha-manual-prod`を将来新規作成 | Auth、DB、project ref、migration履歴を共有しない |
| R2 capture / `CAPTURE_ASSETS` | `meccha-manual-capture-assets-staging` | `meccha-manual-capture-assets-prod` | private bucket。作成前はbindingを有効化しない |
| R2 manual / `MANUAL_ASSETS` | `meccha-manual-manual-assets-staging` | `meccha-manual-manual-assets-prod` | 同上 |
| R2 exports / `EXPORTS` | `meccha-manual-exports-staging` | `meccha-manual-exports-prod` | 同上 |
| R2 avatars / `AVATARS` | `meccha-manual-avatars-staging` | `meccha-manual-avatars-prod` | 同上 |
| Stripe | test mode。初期は未設定 | live mode。初期は未設定 | Product、Price、Webhook endpoint、Secretを共有しない。Checkout Sessionは購入試行ごとに作る |
| Discord通知 | staging専用Webhookまたはchannel | production専用Webhookまたはchannel | 通知は承認の正本ではなく、値・個人情報・操作内容を載せない |
| 公開先 | 当面はaccountの`tattoo-studio-crm.workers.dev`配下の技術的URL | ブランドは`www.meccha-iiyatsu.com`、アプリは`meccha-manual.meccha-iiyatsu.com` | `workers.dev`は恒久ブランドURLではなく、Custom Domain切替を別承認にする |

## `main` マージ後の扱い

原則として`main` マージはproduction候補のcommit SHAを確定する操作であり、production deployの承認ではない。現在のCloudflare設定では`main`マージ後にGit連携のversion uploadが動き得るが、active deploymentへ自動promoteしない。Issue #92のmain merge holdはbackend分離negative proofとlive RLS証跡が完了するまで維持する。hold解除後もPR・必須check・最新SHAレビューを通過しない変更を`main`へ入れず、以下の正式フローでproduction反映を別承認にする。

1. PR checksを通過したcommitを`main`へマージし、production候補SHAを固定する。
2. staging workflowを40桁の候補SHA付きで明示的に起動し、workflow実行SHAとの一致を確認してcheckを再実行する。将来deploy stepを有効化した後はstagingへだけ反映する。
3. stagingでmigration、RLS negative test、smoke/E2E、rollback手順、P0/P1が0件であることを確認する。
4. production workflowを`main`から同じ40桁SHA指定で起動し、workflow実行SHAと不一致なら停止する。
5. GitHub Environment `production` のrequired reviewersによる手動承認後にだけjobを開始する。
6. 現段階のproduction workflowはcheckで停止する。実deploy step追加、Secret登録、production資源作成はそれぞれ別のユーザー承認対象とする。

## 自動操作と承認必須操作

| 操作 | 自動 / 手動 | ゲート |
|---|---|---|
| PR上の`npm run check` | 自動 | branch protectionの必須check |
| `main`へのマージ | レビュー後の手動 | PR reviewと必須check |
| `main`マージからWorker version upload | 自動 | active deploymentへpromoteしない。Issue #92 hold中はmerge禁止。解除後もPRと公開前チェックリストを必須にする |
| Phase 1 RLS immutable preview | `main`から手動 | `staging` Environment、Access deny-by-default、Cloudflare account members + preview専用service token、production deployなし |
| staging候補check | workflow dispatch | `staging` Environment。外部deploy有効化前は静的checkのみ |
| staging deploy / migration | 将来の手動操作 | 対象SHA・接続先確認とユーザー承認 |
| production候補check | workflow dispatch | `production` Environment required reviewers |
| production deploy / migration | 将来の手動操作 | staging証跡、rollback確認、ユーザー承認、Environment approval |
| R2 bucket作成・binding追加 | 手動 | stagingとproductionを別々に承認 |
| Stripe test/live設定 | 手動 | testとliveを別々に承認。liveはproduction gate必須 |
| Discord通知 | workflow結果に応じ自動可 | 通知から危険操作を承認・実行しない |

## GitHub Actions / Environment gate

- staging用workflowとproduction用workflowは分離し、production workflowに`push`トリガーを置かない。
- production workflowは`main`以外のrefを拒否し、production候補ではないコードをEnvironment境界内で実行しない。
- production jobはリテラルの`environment: production`を指定する。Environment側でrequired reviewersを設定できるまでdeploy stepを追加しない。
- Repository SecretsではなくGitHub Environment Secrets/Variablesを優先し、同名でも環境ごとに別値を登録する。
- workflowへSecret値を直書きせず、値をecho、artifact、Discord通知へ出さない。
- reusable workflowを将来導入しても、呼び出し元production jobのEnvironment approvalを省略しない。
- `.github/workflows/deployment-gates.yml` は既存の汎用検査として維持するが、実deployの正本にはしない。
- RLS preview用 `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` は `staging` Environmentへ一組で登録し、Business OS用repository secretと共有・fallback運用しない。

## Cloudflare Worker / Wrangler

- 現在の`wrangler.jsonc`を壊さず、作成済み申告のstaging bucketも接続確認PRまで`r2_buckets`を追加しない。production bindingはproduction bucket作成・承認前に追加しない。
- Browser Run binding、Durable Object binding/migrationも、外部資源と料金・上限の承認前に有効化しない。
- 将来はWrangler `env.staging` / `env.production`に同じ論理binding名を置き、参照先ID・bucketだけを分ける。環境をまたぐfallbackは作らない。
- varsとSecretsを環境別に設定し、deploy前に`APP_ENV`、Worker名、commit SHA、対象GitHub Environmentを照合して不一致ならfail closedにする。
- `tattoo-studio-crm.workers.dev`のような既存Cloudflare accountの`workers.dev`サブドメインは当面の技術的サブドメインに限る。ADR-0024のCustom Domain設定と切替はproduction deployとは別に承認し、切替前後のrollbackを用意する。
- Cloudflare Git integrationのnon-production branch buildを再有効化しない。production branchのdeploy commandは `npx wrangler versions upload` を維持し、active deploymentへ自動promoteしない。RLS用version previewは `preview_urls: true` を正本とし、Access wildcardのdeny-by-default、Cloudflare account members + preview専用service token、未認証health拒否、service token付きhealth成功を同じlive gateで確認する。

## Supabase

- staging projectとproduction projectを物理的に分ける。現在のprojectは暫定dev/stagingであり、productionデータを保存しない。
- production projectはまだ作成しない。project ref、Auth設定、DB credential、migration履歴を環境間で共有しない。
- migration適用はstaging/productionとも承認必須とし、productionへの自動適用を行わない。
- static migration checkの後、stagingでRLS negative testを先に通す。production適用はbackup/rollback確認とstaging証跡が揃った後に別承認する。
- service role key、DB password、JWT Secret、connection stringをMarkdown、GitHub Variables、artifact、ログへ保存しない。

## R2

bindingとbucketの対応は上表およびADR-0018を正とし、同じbinding名から環境別private bucketを参照する。staging bucketは作成済み申告のみで、本監査では確認・変更せずbindingも追加しない。production bucket作成とbinding追加は行わない。

有効化順序は、(1) staging bucket作成済み状態のread-only確認、(2) private設定確認、(3) staging `r2_buckets`追加PR、(4) staging接続確認承認、(5) upload/read/delete/workspace越境拒否、(6) production bucket作成承認、(7) production binding追加承認、(8) production deploy承認とする。公開bucketやR2公開カスタムドメインは設定しない。

## Stripe

- 初期はStripe設定なし、`BILLING_FEATURE_ENABLED=false`とする。falseの間は新規Checkout Sessionを作成しないが、既存課金objectがある環境では署名済みWebhookとreconciliationを停止しない。
- stagingはtest mode、productionはlive modeとし、Secret、Product、Price、Webhook endpointを共有しない。
- live Secret登録、Webhook endpoint作成はまだ行わない。test modeの外部設定も別承認とする。
- production live有効化は署名検証、冪等性、順不同、entitlement、negative test、運用Runbookのstaging合格後に別承認する。

## Release gate

- 対象commit SHAとstaging検証SHAが一致する。
- `npm run check`、RLS negative test、smoke/E2Eが成功する。
- RLS previewの未認証requestが拒否され、Access付きrequestだけが同じimmutable originで成功する。
- P0/P1が0件で、rollback対象SHAと手順が確認済みである。
- GitHub Environment `production` required reviewersとユーザーの明示承認がある。
- production接続先、Secrets、binding、domainを環境対応表と照合する。
- Discord通知は証跡の補助に限り、承認の正本にしない。

いずれかが欠ける場合はdeployせず、未決事項は`docs/09-delivery/open-questions.md`へ登録する。
