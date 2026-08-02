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
5. ownerがIssueを確認し、実装してよいものだけ `approved-for-codex` を付ける。
6. `.github/workflows/codex-issue-implement.yml` が `issues.labeled` で起動する。
7. `approved-for-codex` が付いたIssueだけ、`CODEX_ACCESS_TOKEN` を使って `codex exec` を実行する。
8. 変更があれば `feature/issue-<number>-<slug>` branchへpushし、PRを作成する。
9. Discordへ日本語で結果を通知する。
10. ownerがPR、checks、レビュー結果を確認してmergeする。

## ラベル

| ラベル | 意味 |
|---|---|
| `approved-for-codex` | Codex利用枠で自動実装してよい |
| `approval-required` | 危険操作候補があり、owner承認なしに進めない |
| `blocked-from-discord` | Discord指示だけでは実行禁止 |
| `status/triage` | 受付、整理中 |
| `status/in-progress` | Codexまたは人間が作業中 |
| `status/review` | PRまたはレビュー待ち |
| `status/blocked` | 承認、設定、外部条件待ち |

`approval-required` または `blocked-from-discord` が残っているIssueは、`approved-for-codex` が付いても自動実装を停止する。

## Secret

GitHub Actions secretに `CODEX_ACCESS_TOKEN` を登録する。

このsecretはOpenAI APIキーではなく、Codex CLIをChatGPT/Codex側の利用枠で動かすためのAccess Tokenである。
GitHub Actionsログ、Issueコメント、PR本文、Markdownへ値を書かない。

## 利用枠の考え方

自動トリアージは通常のNode.jsスクリプトで行い、Codex利用枠を消費しない。
Codex利用枠を消費するのは `approved-for-codex` ラベルが付いた後の `codex exec` 実行だけにする。

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
