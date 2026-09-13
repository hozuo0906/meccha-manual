# Issueイベント駆動Codex自動実装

Status: Accepted

## 目的

Discordから作成されたIssueを15分ポーリングだけに頼らず、GitHub Issueイベントで即時処理する。
ただし、Issue作成だけでCodexを起動すると利用枠を無駄に消費しやすいため、自動実装は `approved-for-codex` ラベルが付いたIssueだけに限定する。

## 全体像

1. Discord Slash CommandまたはGitHub UIからIssueを作成する。
2. `.github/workflows/issue-event-triage.yml` が `issues.opened`、`issues.reopened`、`issues.edited` で起動する。
3. `scripts/issue-event-triage.mjs` が初期ラベル、優先度、危険操作候補を判定する。
4. 危険操作候補がなければ、IssueコメントとDiscord通知で受付結果を知らせる。
5. Issueを確認し、通常の実装を進めてよいものだけ `approved-for-codex` を付ける。危険操作の承認境界は別に満たす。
6. `.github/workflows/codex-issue-implement.yml` が `issues.labeled` で起動する。
7. `approved-for-codex` が付いたIssueだけ、`CODEX_ACCESS_TOKEN` を使って `codex exec` を実行する。
8. 変更があれば `feature/issue-<number>-<slug>` branchへpushし、PRを作成する。
9. Discordへ日本語で結果を通知する。
10. GitHub上でPR、checks、レビュー結果、危険操作の有無を確認してmergeする。商用リリース前はAstra high親PMが対象SHA・依存順・必要な品質ゲートを実証確認すれば通常のmergeにユーザーの都度承認を要しない。商用リリース後はmergeごとにユーザーの事前承認を得る。

## ラベル

| ラベル | 意味 |
|---|---|
| `approved-for-codex` | Codex利用枠で自動実装してよい |
| `approval-required` | 危険操作候補があり、記録された承認境界を満たすまでその危険操作を開始しない |
| `blocked-from-discord` | Discord指示だけでは実行禁止 |
| `status/triage` | 受付、整理中 |
| `status/in-progress` | Codexまたは人間が作業中 |
| `status/review` | PRまたはレビュー待ち |
| `status/blocked` | 承認、設定、外部条件待ち |

`approval-required` または `blocked-from-discord` が残っているIssueは、`approved-for-codex` が付いても自動実装全体を停止する。これは危険操作の自動開始を防ぐ既存フィルタであり、通常操作への一律ユーザー承認を意味しない。通常作業の承認判断はDEC-067に従い、自動workflowの危険ラベル停止とは区別する。通常範囲と危険範囲が混在する場合は、親セッションで切り分けてから進める。Discordボタンからの直接merge、初回商用公開、production反映、課金、secret変更、機密情報保存、破壊的操作は既存の別承認境界に従う。

## Issue実装workflowの同時実行境界

複数Issueの自動実装が同時に進まないよう、`jobs.implement` はリポジトリ内のIssue実装で共通のconcurrency groupを使い、`cancel-in-progress: false` と `queue: max` を指定する。承認条件も同じjobの `if` に置き、`approved-for-codex` 以外のラベルイベントはjob skipとしてキューを消費しない。これは親PMの通常worktree上の作業やGitHub Actionsとの競合まで排除するものではない。親PMは `approved-for-codex` を付ける前に稼働中の担当と編集範囲を照合し、重複があれば必要に応じて待機する。

`queue: max` はGitHub標準の同一concurrency group内の待機上限を最大100件まで拡張する設定であり、`cancel-in-progress: true` とは併用しない。待機開始順に処理するが、workflowのdispatch順や無制限・永続の待機は保証しないため、runが開始できたことだけを実装開始成功とは扱わない。上限超過や取消が発生した場合は、親PMが未完了Issueを回収し、必要なら再度指示する。実起動は未検証のままにせず、実行状態と成果物を実SHAで確認する。

仕様の根拠は [Workflow syntax for GitHub Actions](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax) と [Control workflow concurrency](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency) を参照する。

## Secret

GitHub Actions secretに `CODEX_ACCESS_TOKEN` を登録する。

このsecretはOpenAI APIキーではなく、Codex CLIをChatGPT/Codex側の利用枠で動かすためのAccess Tokenである。
GitHub Actionsログ、Issueコメント、PR本文、Markdownへ値を書かない。

## 利用枠の考え方

自動トリアージは通常のNode.jsスクリプトで行い、Codex利用枠を消費しない。
Codex利用枠を消費するのは `approved-for-codex` ラベルが付いた後の `codex exec` 実行だけにする。
GitHub Actionsの実行設定は `--model gpt-5.6-luna` と `--config model_reasoning_effort=high` を実引数で固定し、起動時にはCLI version、model、reasoning effort、sandbox、approval policyだけを証跡へ残す。secret値やIssue本文・会話全文は証跡へ複製しない。モデル設定の一致を確認できない実行は成功扱いにしない。

商用リリース状態がIssue #70で確認できない場合は、未リリースと決めつけず、親PMがread-only確認と提案を先に行う。通常のmerge、初回商用公開、production反映などの判断根拠を、未確認の状態から補わない。

Issue本文が曖昧、大きすぎる、危険操作を含む、または本番反映やDB migrationを要求する場合は、自動実装ではなく親セッションで整理する。

## 禁止事項

このハーネスでは次を自動実行しない。

- production deploy
- DB migration適用
- 課金設定変更
- AI API有効化
- 共有リンク公開
- R2 bucket作成
- secret値の表示、転記、ログ出力

## 検査

```text
npm run issue-codex:check
npm run check
```

## 運用

テストIssueを作る場合は、Issue本文に「疎通確認」「実装不要」「P3」と明記する。
実装させたい場合だけ、ownerが `approved-for-codex` ラベルを付ける。

`CODEX_ACCESS_TOKEN` が未登録の場合、自動実装workflowはIssueへ理由をコメントして失敗する。

## Codex Review修正loop

`.github/workflows/codex-review-loop.yml` は、同一repository・base `main`・許可development branchのopen PRに対して、`chatgpt-codex-connector` または `chatgpt-codex-connector[bot]` が最新headへreviewをsubmitした場合だけ起動する。GraphQL `reviewThreads` から未解決かつtop-level comment authorが同botであるP0／P1／P2だけを抽出し、人間コメントやProduct議論をrepair promptへ入れない。

処理identityはPR番号、review ID、reviewed head SHAから作るmachine-readable commentとPR単位のconcurrencyで重複を防ぐ。1 PR head lineageの自動repairは最大3 roundとし、上限後はDraft／openのまま親PM確認を要求する。trusted findingが0件ならCodex、commit、push、PR変更を一切行わない。

Codex stepは`persist-credentials: false`のexact-head checkoutを使い、`GH_TOKEN`／`GITHUB_TOKEN`を空にしてworkspace-writeだけを許可し、GitHub write credentialを渡さない。GitHub tokenを使うGraphQL取得、head再照合、fast-forward push、thread返信／resolveはCodex後のtrusted runner stepへ分離する。Codexが変更できるworkspace上のcontrollerをtoken付きstepで再利用せず、開始時にrunner tempへ保存したcontrollerを使う。push直前にremote PR headが入力SHAと一致しなければfail closedとし、force pushやmain直接pushを行わない。

変更後はtargeted test、`git diff --check`、`npm run check`を通過した場合だけ1 repair commitを同じPR branchへfast-forward pushする。push後、修正対象threadへcommit SHAを返信してresolveし、exact new SHAを含む `@codex review` commentを投稿する。`github-actions[bot]` commentがCodex GitHub Appを実際に起動するかは外部integration境界であり、初回実runで確認する。無視された場合はmachine-readable re-review-required commentを残して停止し、Latest Review Gateを緩和したりreview証跡を捏造したりしない。

本loopはdeploy、external configuration、migration適用、billing、secret変更、Chrome Web Store公開、branch protection変更、mergeを実行しない。通常のLatest Review GateとPR checklistが引き続きReady／mergeを制御する。
