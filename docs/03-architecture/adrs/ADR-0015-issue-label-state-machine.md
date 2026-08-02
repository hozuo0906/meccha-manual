# ADR-0015 Issue状態管理ラベルをコードで同期する

Status: Accepted

## Context

Discordから `/meccha task` でGitHub Issueを作れるようになった。
ただし、IssueをCodexが定期監視するには、未処理、実装中、レビュー待ち、blocked、完了などの状態を機械的に判定できる必要がある。

GitHub labelを手作業で都度作る運用だと、label名の揺れ、作成漏れ、Discord Issue作成時の422エラーが起きやすい。

## Decision

Issue label定義を `.github/issue-labels.json` に置き、`Issue Labels Sync` workflowでGitHubへ同期する。

初期状態ラベル:

- `from-discord`
- `user-request`
- `needs-triage`
- `status/triage`
- `status/ready`
- `status/in-progress`
- `status/review`
- `status/blocked`
- `status/done`

優先度ラベル:

- `priority/P0`
- `priority/P1`
- `priority/P2`
- `priority/P3`

危険操作ラベル:

- `approval-required`
- `blocked-from-discord`

担当領域ラベル:

- `type/harness`
- `type/docs`
- `type/feature`
- `type/bug`
- `type/security`
- `type/test`
- `type/refactor`
- `type/uiux`

サブエージェント連携ラベル:

- `subagent/review`
- `subagent/test`
- `subagent/refactor`

## Consequences

- CodexのIssue intake monitorが状態を判定しやすくなる。
- Discordから作成されるIssueの初期ラベルを事前に用意できる。
- label定義はPRレビュー対象になる。
- 既存のGitHub labelは削除しない。削除は別途明示判断にする。

## Safety

- `Issue Labels Sync` は既定でdry-runにする。
- 実同期はworkflow_dispatchで `dry_run=false` を明示する。
- GitHub tokenはActionsの `GITHUB_TOKEN` と `issues: write` だけを使う。
- secret値やDiscord入力全文はlabel同期ログへ出さない。
