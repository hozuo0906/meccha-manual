# Phase 1 RLS Live Gate

Status: Accepted

`.github/workflows/phase1-rls-live.yml` は現行Accepted live gateである。Issue #176 M5のAccess/D1/R2置換gateと対応正本が同じrollback単位でmainへ着地するまで維持し、着地時に同じ単位で置換する。実行は既存のowner承認、staging Environment、秘密値非記録、immutable preview境界の条件に従う。M5着地後の退役と同名・改名workflowの再追加拒否は、置換gateと同じrollback単位で行う。future M5 replacement PRでは、Issue #176 M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で、(1) replacement gateと対応docsの着地、(2) 旧 `.github/workflows/phase1-rls-live.yml` の削除、(3) runbookの `Status: Superseded` 化、(4) source-of-truth checkerとworkflow checkerのcanonical存在必須からcanonical/renamed旧identity再追加拒否への反転、(5) workflow本体、`scripts/check-workflows.mjs`、`scripts/check-cloudflare-source-of-truth.mjs`、`tests/cloudflare-access-fetch.test.mjs` の同一PR scope化を同時に完了する。M6への持越し、replacement未着地のまま先行退役を禁止する。

## 目的

Issue #79がIssue #38から引き継いだ正式live RLS gateを、秘密値、preview URL、外部ID、テストデータ識別子、個人情報をリポジトリ、artifact、workflow summary、Actionsログへ保存せず、暫定stagingだけに対して実行する。

## 採用する境界

- workflowは `.github/workflows/phase1-rls-live.yml` とする。
- triggerは `workflow_dispatch`、dispatch元は `main` だけとする。
- checkoutはdispatch時の `github.sha` に固定し、`git rev-parse HEAD` と一致確認する。
- GitHub Environmentは `staging` とし、productionでは実行しない。
- Cloudflare Git integrationのnon-production branch buildはIssue #92のP0対策として無効のまま維持する。
- `wrangler.jsonc` は `preview_urls: true` を明示し、このworkflowがuploadした一時的なimmutable version previewだけをRLS gateに使用する。
- preview wildcardはCloudflare Accessでdeny-by-default保護し、Cloudflare account membersとpreview専用service tokenだけを許可する。
- RLS資格情報を使う前に、未認証の `/health/config` がAccessで拒否されることと、service token付きの同じrequestだけが成功することを確認する。
- `/health/config` と `npm run test:rls` は同じimmutable preview originへ固定する。
- production traffic、active deployment、production DB、課金、AI API、共有リンクを変更しない。

Access application、policy、service token、GitHub Environment、Environment secretsの作成・変更はowner/adminの担当であり、このrepo-side workflowは設定済み状態を検査してfail closedするだけとする。

## Cloudflare immutable preview upload

既存のWorker version upload資格情報を使い、値をworkflow input、Issue、PR、artifact、summary、ログへ出さない。

```text
CLOUDFLARE_ACCOUNT_ID
CLOUDFLARE_API_TOKEN
```

workflowは `wrangler versions upload` に `--keep-vars`、`--strict`、`--experimental-provision=false`、`--experimental-auto-create=false` を指定する。uploadはversion作成だけに限定し、productionへdeployまたはpromoteしない。

Wranglerのstdout/stderrと構造化結果はGitHub-hosted runnerの一時領域だけに保持し、生ログを表示・artifact化しない。取得したpreview originはmode `0600` の一時ファイルで後続stepへ渡し、step output、summary、Issue、PRへ保存しない。終了時は一時ファイルを削除する。

preview originはHTTPS、認証情報なし、portなし、origin-only、承認済みWorker名とaccount suffixに一致するimmutable hostnameでなければ拒否する。

## 現行実行に参照する登録済みEnvironment secrets

RLS test用4件とpreview-only Access用2件は、owner承認済み・登録済みの既存 `staging` / test値だけを確認・利用する。新規Secret、資格情報、test user、Environment、projectの作成・登録は禁止する。

```text
MECCHA_RLS_USER_A_EMAIL
MECCHA_RLS_USER_A_PASSWORD
MECCHA_RLS_USER_B_EMAIL
MECCHA_RLS_USER_B_PASSWORD
CF_ACCESS_CLIENT_ID
CF_ACCESS_CLIENT_SECRET
```

- A/Bはowner承認済みの既存専用テストアカウントとし、実利用者の資格情報を流用しない。
- Access 2件は登録済みの既存一組が揃う場合だけ利用し、片方欠落時は停止する。新規登録は行わない。
- 同名のBusiness OS用service tokenやrepository secretと値を共有しない。
- GitHub Actionsからsecretのscope由来は判別できないため、owner/adminは6件が `staging` Environmentへ登録済みであることだけを確認する。
- Access policy側はCloudflare account membersとpreview専用service tokenだけを許可し、その他の未認証requestとservice tokenを拒否する。同名repository secretへのfallback運用は許可しない。
- workflowはsecret値をechoせず、不足している名前だけを報告する。

## HTTP request境界

`scripts/cloudflare-access-fetch.mjs` をAccess付きrequestの単一窓口とする。

- Access 2件が揃う場合だけ `cf-access-client-id` と `cf-access-client-secret` を設定する。
- caller由来の同名headerは破棄し、Environment secret由来の値だけを使う。
- request先は設定済みapp originとの完全一致を必須にする。
- Access資格情報をHTTPまたは別originへ送らない。
- redirectを追跡せずfail closedする。
- Cookie、Origin、Content-Type等の既存app request headerは保持する。
- Worker向けrequestだけにAccess headerを付け、Supabase Auth/RESTへの直接requestには付けない。
- errorへresponse body、email、URL、識別子、資格値を含めない。

## 現行Accepted transitional gateの実行手順

0. Issue #215の文書・checker整合PRとは別に、ownerがこのlive gate実行自体を明示承認したことを確認する。承認がない場合はdispatchしない。
1. owner/adminがpreview wildcardのAccess deny-by-defaultとCloudflare account members + preview専用service tokenだけのallowを確認する。
2. GitHub `staging` Environmentに上記6件が登録済みであることだけを確認・利用し、Business OS用値と共有していないことを確認する。
3. Worker version upload用Cloudflare資格情報が利用可能であることを値非表示で確認する。
4. Actionsから `Phase 1 RLS Live Gate` を `main` で手動実行する。
5. dispatch SHA固定、runtime boundary、Access 2件の存在確認が成功することを確認する。
6. production deployを伴わずimmutable Worker versionをuploadできることを確認する。
7. 未認証 `/health/config` がAccessで拒否されることを確認する。
8. Access付きの同じ `/health/config` が成功し、承認済みstaging Supabase境界と一致することを確認する。
9. 同じimmutable previewで `npm run test:rls` が `status: ok` になることを確認する。
10. Issue #79へ対象commit SHA、成功/失敗、残存テストデータの有無だけを記録する。run URL、preview URL、Worker version ID、資格値、外部ID、テストデータ識別子は記録しない。

## Historical success conditions（M5証跡へ流用しない）

- dispatch SHAとcheckout SHAが一致する。
- non-production branch buildを再有効化せず、明示uploadしたimmutable versionだけを使う。
- 未認証requestがAccessで拒否され、Access付きrequestだけが同じoriginで成功する。
- health/configとRLS E2Eが同じimmutable previewを対象にする。
- staging Supabase境界が一致した後だけRLS資格情報を使う。
- `npm run test:rls` が `status: ok` で終了する。
- secret値、email、response body、preview URL、外部ID、テストデータ識別子をログ・artifact・summary・文書へ保存していない。
- production trafficとactive deploymentを変更していない。

## 失敗時

- Access 2件の不足: 値を表示せず停止し、`staging` Environmentの登録状態をowner/adminが確認する。
- 未認証healthが成功: RLS資格情報を使わず停止し、Access wildcardとdeny-by-defaultを修復する。
- Access付きhealthがredirect、拒否、別originになる: 追跡・回避せず、Access application/policy/service tokenを確認する。
- upload失敗またはpreview未生成: production deployで回避せず、`preview_urls`、remote binding、token scopeを確認する。
- immutable previewのstaging境界不一致: RLS資格情報を使わず、作成versionと承認済みstaging設定を修復する。
- RLS/API失敗: 失敗した契約を通常のPR品質loopで修正し、最新mainで改めて実行する。
- raw Wrangler出力、preview URL、外部ID、資格値をIssueやコメントへ転載しない。

## 残存リスク

旧workflowはpreview/backend物理分離の成功証跡として扱わない。Issue #92はcompleted close済みでblanket main merge holdを再開しない。Access/D1/R2移行後の実preview分離はIssue #176 M5で検証し、完了まではstaging合格、production資源作成・deploy、外部招待を禁止する。
