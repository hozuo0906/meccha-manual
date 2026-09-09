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

複数Issueの自動実装が同時に進まないよう、workflowはリポジトリ内のIssue実装で共通のconcurrency groupを使い、`cancel-in-progress: false`を維持する。これは親PMの通常worktree上の作業やGitHub Actionsとの競合まで排除するものではない。親PMは `approved-for-codex` を付ける前に稼働中の担当と編集範囲を照合し、重複があれば必要に応じて待機する。

GitHub標準のconcurrencyは永続FIFOキューではなく、待機中の実行が取消・置換されることがある。そのため、runが開始できたことだけを実装開始成功とは扱わない。親PMが未完了Issueを回収し、必要なら再度指示して、実行状態と成果物を実SHAで確認する。

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
