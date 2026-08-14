# Phase 1 RLS Live Gate

Status: Accepted

## 目的

Issue #38の最終受入条件である `npm run test:rls` を、秘密値や実ユーザー情報をリポジトリ・artifact・workflow summaryへ保存せず、暫定stagingだけに対して実行する。

## 実行境界

- workflow: `.github/workflows/phase1-rls-live.yml`
- trigger: `workflow_dispatch` のみ
- dispatch元: `main` のみ
- checkout: dispatch時の `github.sha` を固定し、`git rev-parse HEAD` と一致確認する
- GitHub Environment: `staging`
- productionでは実行しない
- `service_role key`、Database password、JWT Secretは使わない
- Supabase URLと公開anon keyは `wrangler.jsonc` の承認済みstaging設定を使用し、最初に `runtime-boundary:check` を通す
- RLS資格情報を使う前に、checkout済みdispatch SHAから `wrangler versions upload` で新しいWorker versionを作成する
- `wrangler versions upload` はversionを作成するだけでproduction trafficへdeployしない
- Wranglerが返したversioned Preview URLを取得し、`/health/config` と `npm run test:rls` の両方を同じimmutable Preview URLへ固定する
- Preview URLが取得できない、previewのSupabase境界がstagingと一致しない、Cloudflare upload credentialが不足する場合はfail closedする

Cloudflareのversioned Preview URLはWorker versionごとに生成される一意・静的URLであり、後続のproduction deploymentやbranch preview更新で別versionへ切り替わらない。したがって、境界確認とcredentialed RLSテストの間にmutable `workers.dev` URLのdeploymentが差し替わるrace conditionを避けられる。

## Cloudflare immutable preview upload

既存のCloudflare設定監査と同じ次のGitHub Secretsを使用する。値をworkflow input、Issue、PR、artifact、summary、ログへ出さない。

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

workflowは `wrangler versions upload` に `--keep-vars`、`--strict`、`--experimental-provision=false`、`--experimental-auto-create=false` を指定する。dispatch SHAをversion messageへ記録し、`WRANGLER_OUTPUT_FILE_PATH` のND-JSONから `version-upload` resultを読み、version IDとversioned Preview URLだけをworkflow outputへ渡す。

`versions upload` はproduction deploymentを作成しない。自動resource provisionも無効化するため、既存bindingと承認済みstaging設定でversionを作成できない場合は停止する。

Preview URLはcredential値ではないが、不要な公開導線を増やさないためIssue、PR、artifact、workflow summaryへ転記しない。成功summaryにはWorker version IDだけを残す。

## staging Environment secrets

次の4項目だけを `staging` Environment secretsとして登録する。値そのものをIssue、PR、Markdown、workflow input、artifact、ログへ貼らない。

```text
MECCHA_RLS_USER_A_EMAIL
MECCHA_RLS_USER_A_PASSWORD
MECCHA_RLS_USER_B_EMAIL
MECCHA_RLS_USER_B_PASSWORD
```

A/Bは異なる専用テストアカウントを使う。実利用者のアカウントや既存利用者のパスワードを流用しない。

workflowは値の存在確認時に `::add-mask::` を登録し、値を表示せず、不足しているsecret名だけをエラーとして出す。テスト本体には `MECCHA_RLS_ALLOW_REMOTE_WRITE=I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED` をworkflow側で固定し、stagingへの書き込みを明示する。

## 実行手順

1. GitHubの `staging` Environmentへ上記4つのRLS test secretを登録する。
2. `CLOUDFLARE_ACCOUNT_ID` とWorker version uploadに必要な `CLOUDFLARE_API_TOKEN` がGitHub Secretsとして利用できることを確認する。
3. Actionsから `Phase 1 RLS Live Gate` を選ぶ。
4. `main` から手動実行する。
5. `Verify immutable dispatch SHA` が成功し、実行対象SHAがdispatch時のmain SHAから変わっていないことを確認する。
6. `Verify staging runtime boundary` が成功することを確認する。
7. `Upload immutable Worker version for RLS testing` が成功し、productionへdeployせずversioned Preview URLを取得できたことを確認する。
8. `Verify immutable Worker staging boundary` が成功し、そのPreview URLが承認済みstaging Supabaseを向いていることを確認する。
9. `Run live RLS negative test against immutable Worker version` が成功し、`npm run test:rls` が `status: ok` で終了したことを確認する。
10. Issue #38へrun URL、対象40桁SHA、Worker version ID、成功結果、残存テストデータの有無だけを記録する。資格情報の値、Cloudflare token、Supabase project ref、Preview URLは記録しない。

## summaryの扱い

成功summaryは全前段と `npm run test:rls` が成功した場合だけ出力する。途中失敗したrunでは「live RLS acceptance gateは未完了であり成功証跡に使わない」とだけ記録し、tested SHAや境界検証済みという成功表現を出さない。

## 失敗時

- Cloudflare credential不足・権限不足: token値を出さずに停止し、Worker version uploadに必要なAPI token scopeを確認する。
- Worker version upload失敗: productionへdeployして回避しない。`wrangler.jsonc`、remote binding、token scopeを確認する。
- Preview URL未生成: RLS資格情報を使わず停止する。Preview URLs設定とWorkerの対応条件を確認する。
- secret不足: 値をPRコメントへ貼らず、`staging` Environment secretを修正する。
- dispatch SHA不一致: 実行を続けず、新しいmain SHAを対象に改めて手動実行する。
- immutable preview staging boundary不一致: 資格情報を使う前に停止する。作成versionの設定と `wrangler.jsonc` / ADR-0027のstaging境界を先に修復する。
- 認証失敗: 既存ユーザーのパスワード変更や `auth.users` 直接更新で回避しない。専用テストアカウントの状態を確認する。
- RLS/API失敗: 失敗した契約を修正し、通常のPR品質loopを通した最新mainで再実行する。

## 完了条件

- dispatch時の対象SHAと実際にcheckoutしたSHAが一致する。
- checkout済みSHAからproduction deploymentを伴わないWorker versionを作成できる。
- versioned Preview URLを取得し、その同一URLでstaging Supabase境界確認とRLS E2Eを実行する。
- `npm run test:rls` が `status: ok` で終了する。
- production traffic、production DB、課金、AI API、共有リンクを変更していない。
- `service_role key`、Database password、JWT Secretを使用・記録していない。
- 資格情報の値をIssue、PR、artifact、summary、ログへ保存していない。
- Issue #38へ対象SHA、Worker version ID、成功runだけを証跡として残す。
