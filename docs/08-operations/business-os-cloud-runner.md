# Business OS cloud runner

Status: Accepted

## 目的

Business OSの承認済みjobを、特定PCに依存せずGitHub-hosted runnerで受け取り、検査済みのdraft PRまで進める。

既存の `approved-for-codex` Issue runnerは維持する。Business OS runnerは置換ではなく、署名、予算、許可path、監査を必要とする無人automation用の別経路である。

## Workflow

標準workflowは `.github/workflows/business-os-codex.yml`、trusted clientは `scripts/cloud-runner-client.mjs` とする。

1. `probe`でBusiness OS URL、execution target、repository、workflow、runner token、Cloudflare Accessを照合する。
2. Ownerが承認したjobだけをclaimし、署名済みbase branchを固定local refへ明示fetchしてからcommit SHAへ固定する。既存publication branchがある新規retry jobでは、そのbranchの単一親commitを復元し、現在のbase branchの祖先であることを確認する。testとpublishは同じSHAをcheckoutする。
3. trusted clientが署名、repository、target、job ID、期限、`read_only|code_change`、厳格な`codex/` branch、push/PR許可、production禁止flagを検証する。
4. CodexへGitHub書込tokenを渡さず、権限の弱いOS userで実行する。
5. 許可root外、`.github`、secret-bearing path、symlink、submoduleを拒否する。
6. Codex実行前に保存したtrusted clientをartifactへ含め、test、publish、read-only report、failure reportへ引き継ぐ。Codexの出力はtrusted stepがrunner所有・mode `0600`へコピーしてからartifact化し、agent所有fileを直接後段へ渡さない。各jobはbase branchやworkspace内のclientを秘密付きで実行しない。
7. 別runnerで `npm run check` を実行する。
8. trusted publish jobだけが `codex/` branchへpushし、draft PRを作成する。既存branchのtree一致を確認してpushを再利用し、既存のopen PRがあればそのURLを返す。
9. event IDはjob・type・sequenceから決定的に生成し、同じtransitionの重複送信を冪等に返す。failed jobは終端とし、同じGitHub runのrerunは明示的に拒否する。安全な一時失敗の再試行はBusiness OSが予算・回数を再確認し、新しいjob IDの署名jobとして発行する。agent内でclaim後に失敗した場合は、localのtrusted stateからacceptedとfailure監査eventを返すため、state artifact upload失敗だけで監査を失わない。
10. event metadataはJSON serializerで生成してBusiness OSへ返す。stagingとproductionは別workflowへ引き渡す。

## GitHub設定

Variable:

- `BUSINESS_OS_URL`

Secrets:

- `BUSINESS_OS_RUNNER_TOKEN`
- `CLOUD_RUNNER_JOB_SIGNING_SECRET`
- `CF_ACCESS_CLIENT_ID`
- `CF_ACCESS_CLIENT_SECRET`

有料automationをOwnerが承認した場合だけ設定:

- `OPENAI_API_KEY`

値はIssue、PR、Markdown、Actions logへ記録しない。

## 安全境界

- mainへ直接pushしない。
- production deploy、rollback、DB migration、secret変更、課金変更を実行しない。
- 既存の `CODEX_ACCESS_TOKEN` とBusiness OS runner secretを共有しない。
- `OPENAI_API_KEY` 未設定でもprobeと拒否系testを実行できる。
- 初回有料jobはdocs-only、月次warning 3 USD、hard stop 5 USD、job単位の `maxCostUsd` 内で行う。
