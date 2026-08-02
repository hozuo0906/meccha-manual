# Issue intake labels

Status: Accepted

## 目的

Discordから作られたGitHub Issueを、Codexが定期監視しやすい状態にする。

Issue本文を毎回人間が読み続けるのではなく、labelで次の状態を判断できるようにする。

## 状態ラベル

- `needs-triage`: 親セッションの整理待ち。
- `status/triage`: 受付済み。優先度、危険操作、担当範囲を確認中。
- `status/ready`: 実装に着手できる。
- `status/in-progress`: 実装または検証中。
- `status/review`: テスト、辛口レビュー、リファクタリングレビュー待ち。
- `status/blocked`: 外部設定、ユーザー判断、権限不足で停止中。
- `status/done`: 対応完了。

## 優先度ラベル

- `priority/P0`: 即時対応が必要な重大リスク。
- `priority/P1`: 次フェーズへ進む前に解消するリスク。
- `priority/P2`: 通常優先度。
- `priority/P3`: 後回し可能な改善。

## 危険操作ラベル

- `approval-required`: ユーザー承認なしに進めない操作を含む。
- `blocked-from-discord`: Discord指示だけでは実行禁止。

対象例:

- production反映
- DB migration
- 課金、Stripe
- AI API有効化
- secret変更
- 共有リンク公開
- 実ユーザーデータ閲覧

## 同期方法

GitHub Actionsの `Issue Labels Sync` を実行する。

安全な確認:

- `dry_run=true`

実同期:

- `dry_run=false`

同期workflowは `.github/issue-labels.json` を正本にし、既存labelを作成または更新する。
不要labelの削除は自動で行わない。

## Codex monitorとの関係

`Issue intake monitor` は次を対象にする。

- `from-discord`
- `needs-triage`
- `user-request`
- `status/triage`
- `approval-required`
- `blocked-from-discord`

新しいIssueがあれば、親セッションで日本語要約、優先度、危険操作有無、必要docs/ADR、次アクションを整理する。
危険操作は自動実行しない。
