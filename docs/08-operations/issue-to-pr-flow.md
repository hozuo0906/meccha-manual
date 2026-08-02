# IssueからPRへ進める運用

Status: Accepted

## 目的

Discordで作成されたIssueを、親セッションが見落とさず、実装PRへ安全に進める。

## 状態

- `needs-triage`: まだ親セッションで整理していない。
- `status/triage`: 受付済み。優先度、危険操作、担当範囲を確認中。
- `status/ready`: 実装に入れる。
- `status/in-progress`: 実装または検証中。
- `status/review`: テスト、辛口レビュー、リファクタリングレビュー待ち。
- `status/blocked`: ユーザー判断、外部設定、権限不足などで停止中。
- `status/done`: 対応完了。

## Discord由来Issueの初期label

- `from-discord`
- `user-request`
- `needs-triage`
- `status/triage`
- `priority/P0`、`priority/P1`、`priority/P2`、`priority/P3` のいずれか

危険操作候補を含む場合は、追加で次を付ける。

- `approval-required`
- `blocked-from-discord`

## PRへ進める条件

- Issue本文を読み、要件、対象ファイル、成功条件を確認している。
- `type/*` と `priority/P*` が付いている。
- 危険操作候補の場合、ユーザー承認を受けている。
- 必要なdocs、ADR、テスト条件の更新対象が分かっている。

## PR本文

PR本文には、対応Issueを次の形式で入れる。

```text
Closes #123
```

複数Issueに対応する場合は、対象Issueをすべて列挙する。対応しないIssueを閉じる文言は入れない。

## 受付レポート

GitHub Actionsの `Issue Intake Report` を手動実行すると、open Issueから優先確認対象を日本語で出力する。

対象になりやすいIssue:

- `needs-triage` が付いている。
- `from-discord` が付いている。
- `approval-required` または `blocked-from-discord` が付いている。
- 状態labelまたは優先度labelが不足している。
- assigneeが付いていない。

## Codex automationとの関係

Codex側の `Issue intake monitor` は15分ごとにIssueを確認する。常時人間がIssue一覧を監視する必要はない。

このworkflowは、必要なタイミングでGitHub側にも証跡を残したいときに使う。
