# ADR-0016 IssueからPRへ進める受付レポート

Status: Accepted

## 背景

Discord Slash CommandからGitHub Issueを作れるようになったが、Issueを人間が毎分確認する運用にはしない。親セッションとCodex automationが拾いやすいように、Issue作成時点で状態と優先度をlabelへ落とし、必要に応じてGitHub Actionsで日本語の受付レポートを作る。

## 決定

- Discord由来Issueには `from-discord`、`user-request`、`needs-triage`、`status/triage`、`priority/P*` を付与する。
- 危険操作候補には従来通り `approval-required` と `blocked-from-discord` を追加する。
- `Issue Intake Report` workflowを `workflow_dispatch` で実行できるようにする。
- レポートはopen Issueを読み、未整理、Discord由来、危険操作候補、担当なし、状態/優先度label不足を優先表示する。
- PR化するIssueは、PR本文に `Closes #番号` を入れてIssueとPRの対応を明示する。

## 理由

- Discord返信から直接実装へ入ると、要件、危険操作、承認条件が抜けやすい。
- labelを状態機械として扱うことで、Codex automation、親セッション、GitHub Actionsが同じ判断材料を見られる。
- 受付レポートをGitHub Actions artifactとstep summaryに残すことで、Discord通知だけに依存しない。

## 制約

- このハーネスは作業を自動実行しない。商用リリース前の通常の実装継続、commit、push、Pull Request作成・更新、mergeは、Astra highの親セッションが最新SHA、依存順、必要な品質ゲートを確認した上で進める。商用リリース後の外部反映はユーザーの事前承認を要する。本番deployは既存の別承認境界に従う（DEC-067）。
- `approval-required` または `blocked-from-discord` があるIssueは、通常の実装・mergeに一律の承認を要求するものではなく、Issueに記録された危険操作の承認境界を満たすまで、その危険操作を開始しない。
- Issue本文やレポートに秘密値、個人情報、実ユーザー操作内容を記録しない。

## 更新履歴

- 2026-09-09: DEC-067により、本ADRの旧制約（2026-08-02）のうち、実装・mergeを常にユーザー承認優先とする一般承認部分だけを部分的にSupersededとした。商用リリース前は親セッションの実SHA・依存順・品質ゲート確認で通常操作を進め、商用リリース後は外部反映ごとにユーザー承認を得る。Discordボタンからの直接merge禁止、本番deployを含む既存の別承認境界、秘密値・個人情報を記録しない制約は維持する。

## 影響

- Discordから作成される新規Issueは、最初から `status/triage` と `priority/P*` を持つ。
- 既存Issueに不足labelがある場合は、受付レポートで確認対象として表示される。
- 次のハーネスでは、Issueを起点にサブエージェントloopを回す運用へ接続できる。
