# サブエージェント品質loop

Status: Accepted

## 目的

親セッションが進行管理を行い、各PRを `実装 → テスト → リファクタリングレビュー → 辛口レビュー → 修正 → 回帰確認` のloopへ通す。

## 担当

| 担当 | 主な確認 |
|---|---|
| コーディング | 要件に沿った実装、既存設計との整合、不要な変更の混入防止 |
| UIUX | 日本語UI、業務画面としての密度、状態表示、アクセシビリティ、文言 |
| テスト | 自動テスト、RLS negative test、E2E、手動確認、未実施理由 |
| 辛口レビュー | P0/P1リスク、セキュリティ、プライバシー、UX欠陥、仕様抜け |
| リファクタリング/コードレビュー | 命名、定数、設定、責務分離、再利用性、依存方向 |
| ドキュメント記録 | ADR、decision-log、Issue、テスト条件、採否理由、未決事項 |

## loop

1. Scope Check
2. 実装
3. Automated Tests
4. リファクタリング/コードレビュー
5. Security/Privacy Review
6. Exploratory UX Review
7. Triage
8. 修正
9. Regression
10. Release Gate

## PRへ残す内容

- 変更の目的
- 変更内容
- 非対象
- 関連docs/ADR/Issue/Test
- 各担当の結論
- P0/P1の残件数
- 実行したテスト
- 未実施の確認と理由
- ロールバック方法

## 記録禁止

- secret、共有トークン、個人情報、実ユーザーの操作内容
- サブエージェントの生思考
- サブエージェント同士の会話全文
- 外部サービスの秘密値や認証情報

記録してよいのは、結論、根拠、採否、リスク、未決、次アクションの要約だけ。

## merge停止条件

- P0/P1が1件以上残っている。
- `npm run check` が失敗している。
- docs、ADR、Issue、テスト条件、実装の整合が取れていない。
- production反映、DB migration、課金変更、AI API有効化、共有リンク公開に明示承認がない。
- secret、個人情報、実ユーザー操作内容がPR、docs、ログに含まれている。

## Codex automationとの関係

Issue intake monitorはIssueを拾う。Quality Loop GateはPRが品質loopの入口を満たすか確認する。

実際の品質判断は、親セッションが各担当の要約を確認して行う。
