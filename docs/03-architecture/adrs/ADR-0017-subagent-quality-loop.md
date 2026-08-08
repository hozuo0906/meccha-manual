# ADR-0017 サブエージェント品質loop

Status: Accepted

## 背景

めっちゃマニュアルは、親セッションを頭にして、コーディング、UIUX、テスト、辛口レビュー、リファクタリング/コードレビュー、ドキュメント記録を分けて進める。各担当の結論がPRに残らないと、AI駆動開発の速度は出ても品質判断が曖昧になる。

## 決定

- PRごとにサブエージェント品質loopを通す。
- PRテンプレートに各担当の確認項目を入れる。
- `Quality Loop Gate` workflowで、品質loopのdocs、ADR、報告テンプレート、PRテンプレートが存在することを検証する。
- サブエージェントの生思考や会話全文は記録しない。結論、根拠、採否、リスク、未決だけを要約する。
- P0/P1が残る場合はmergeせず、修正loopへ戻す。
- Codex Reviewは最新head SHAを対象にし、指摘後は修正・テスト・再レビューを必須とする。未解決thread、古いSHAのレビュー、API確認失敗がある場合はfail closedでmergeを止める。

## 理由

- 作業速度を落とさず、レビュー漏れ、テスト漏れ、定数や責務の散らばりを早期に止めるため。
- 各担当の役割をPR上で見える化し、ユーザーがDiscordやGitHubで判断しやすくするため。
- Phase 1以降の本番開発で、機能ごとの品質ゲートを同じ型で回すため。

## 影響

- PR作成時に品質loopチェックリストが表示される。
- `npm run check` は `quality-loop:check` を含む。
- 品質loopの正本は `docs/09-delivery/subagent-quality-loop.md` と `docs/09-delivery/subagent-report-template.md` とする。
