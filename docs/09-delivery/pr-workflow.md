# PR運用

Status: Accepted

## 目的

`main` に直接pushせず、変更を小さなbranchで作り、CI、レビュー、承認を通してから取り込む。
本番事故、secret漏えい、未検証migration、レビュー漏れを防ぐための運用。

## 流れ

1. `feature/*` branchを作る。
2. 変更を実装する。
3. ローカルで `npm run check` を通す。
4. branchをGitHubへpushする。
5. `.github/workflows/auto-pr.yml` がPull Requestを自動作成または更新する。
6. GitHub Actionsの必須チェックを通す。
7. 辛口レビュー、リファクタリングレビュー、テストレビューの指摘を潰す。
8. ユーザー承認後にmergeする。
9. staging gateを通す。
10. production反映はさらに明示承認してから行う。

## 用語

| 用語 | 意味 |
|---|---|
| branch | 変更用の作業場所 |
| PR | Pull Request。変更内容をmainへ入れてよいか確認する場 |
| review | バグ、設計ミス、セキュリティ、UX、テスト不足の確認 |
| merge | PRの変更をmainへ取り込むこと |
| branch protection | mainへ入れる条件をGitHubで強制する設定 |

## branch命名

- `feature/<topic>`: 通常機能、ハーネス、docs
- `fix/<topic>`: バグ修正
- `review/<topic>`: レビュー指摘の修正
- `chore/<topic>`: 依存更新、軽微な運用変更

## mainへ入れる条件

- `npm run check` 成功
- 変更範囲に対応するsmoke test成功
- P0/P1レビュー指摘0件
- docs、ADR、decision-logの整合
- secretを含まない
- ユーザー承認済み

## サイドタスクの合流

サイドタスクはmainへ直接pushしない。
サイドタスクがbranchを持つ場合はPRを作る。
メインセッションはPR差分をレビューし、採用、修正、却下を判断する。

## Auto PR

AI駆動開発でユーザーにPR作成作業を毎回戻さないため、`feature/*`、`fix/*`、`review/*`、`chore/*`、`phase/*` のpush時にPRを自動作成する。

- workflow: `.github/workflows/auto-pr.yml`
- base branch: `main`
- 新規PRを作成した場合も、既存open PRを検出した場合もDiscordへPR URLを通知する。
- 既存open PRがある場合はPR本文を上書きしない。
- mainへの直接pushは対象外。
- production deploy、DB migration、課金、AI API有効化、共有リンク公開はauto PRだけでは承認済みにしない。
- GitHub Actions側でPR作成に失敗する場合は、repository settingsでActionsのworkflow permissionsがread/writeか確認する。

Discord通知サイドタスク:

- task id: `019fb8ec-ee4f-7370-ab5f-0b61fb09f931`
- branch: `feature/discord-notify-test`

このサイドタスクの成果は、既にメイン側へ入れたDiscord harnessと重複する可能性がある。
PR作成後に差分を見て、必要部分だけ採用する。
