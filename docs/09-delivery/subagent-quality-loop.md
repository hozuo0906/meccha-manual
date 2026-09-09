# サブエージェント品質loop

Status: Accepted

## 目的

親PMが進行管理と品質ゲートを行い、各PRを `実装 → テスト → リファクタリングレビュー → 辛口レビュー → 修正 → 回帰確認` のloopへ通す。以下の担当名は既存CI／PRテンプレート互換の観点名であり、専任6サブエージェントや6個の別taskを必須にしない。現行の独立タスク体制では、Luna high作業担当が限定範囲の実装・検証・報告を行い、Astra high親PMが対象観点を実証照合する。

起動形態の正本はDEC-066と`docs/09-delivery/decision-log.md`／`session-handoff.md`とする。本書は品質loopとmerge停止条件を定義する正本であり、起動形態の変更を理由に品質ゲートを弱めない。

## 担当

| 観点（互換名） | 主な確認 |
|---|---|
| コーディング | 要件に沿った実装、既存設計との整合、不要な変更の混入防止 |
| UIUX | 日本語UI、業務画面としての密度、状態表示、アクセシビリティ、文言 |
| テスト | Access JWT／Worker認可／D1 workspace negative・mutation test、E2E、手動確認、未実施理由。旧RLSは移行baseline変更時だけ |
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

Codex Reviewは手順8へ戻るための指摘工程であり、レビュー実行だけで完了にしない。最新head SHAを明記してレビューを依頼し、有効な指摘を修正して回帰確認し、変更後の最新SHAへ再レビューする。

## PRへ残す内容

- 変更の目的
- 変更内容
- 非対象
- 関連docs/ADR/Issue/Test
- 各観点（既存の担当名を維持）の結論、根拠、リスク、未決。専任担当を起動していない観点は、作業担当と親PMによる確認主体を明記する
- P0/P1の残件数
- 実行したテスト
- 未実施の確認と理由
- ロールバック方法
- `npm ci`、`npm run check`、個別テスト、`git diff --check`の結果
- Codex Review対象SHAとPR head SHA
- P0/P1/P2の件数、未解決review thread数

## 記録禁止

- secret、共有トークン、個人情報、実ユーザーの操作内容
- サブエージェントの生思考
- サブエージェント同士の会話全文
- 外部サービスの秘密値や認証情報

記録してよいのは、結論、根拠、採否、リスク、未決、次アクションの要約だけ。

## merge停止条件

- P0/P1が1件以上残っている。
- `npm run check` が失敗している。
- 最新head SHAに対するCodex Reviewがない、レビュー対象SHAとhead SHAが違う、または未解決review threadがある。
- 必須CIが未実行または失敗している。CI成功だけでレビュー完了とは扱わない。
- docs、ADR、Issue、テスト条件、実装の整合が取れていない。
- production反映、DB migration、課金変更、AI API有効化、共有リンク公開に明示承認がない。
- secret、個人情報、実ユーザー操作内容がPR、docs、ログに含まれている。

## Codex automationとの関係

Issue intake monitorはIssueを拾う。Quality Loop GateはPRが品質loopの入口を満たすか確認する。PR Latest Review GateはGitHub APIをページネーションして最新SHAのCodex Reviewと未解決thread 0件を確認し、API失敗や権限不足ではfail closedにする。

Codexの合格証跡は、最新head SHAに対する正式なreview、最新SHAを明記した`@codex review`依頼後の👍、またはCodex botが投稿した`Codex Review: Didn't find any major issues`と`Reviewed commit`を含むコメントのいずれかとする。コメント形式の合格証跡を受け取った場合は、そのコメントだけではworkflowが再実行されないため、続けてPRへ`/quality-gate`とコメントして信頼済みmainの再確認workflowを起動する。

PR Latest Review Gate自身の変更を初めてmainへ導入する先行PR #41では、`issue_comment`イベントがmain上の旧workflowを使うため、`/quality-gate`では新判定を検証できない。このブートストラップ時だけ、リポジトリ所有者がPR #41の本文を編集してread-onlyの`pull_request edited`を起動し、同一リポジトリにあるPR headのゲート実装で再確認する。例外条件はPR #41・所有者起動・同一リポジトリheadに限定し、#41をmainへマージした後は、すべてのPRで信頼済みmainを使って通常どおり`/quality-gate`を実行する。fork由来のPR headはこの例外の対象にしない。

実際の品質判断は、親PMが各観点の要約と実証証跡を確認して行う。作業担当はサブエージェントを使わず、次taskを自己増殖させない。観点名・文書名・CIのcheckerは既存互換のため維持する。
