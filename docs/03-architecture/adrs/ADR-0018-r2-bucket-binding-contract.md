# ADR-0018 R2 bucketとbinding契約

Status: Accepted

## 背景

ファイル本体はCloudflare R2を第一候補にする方針は決定済み。ただしR2 bucketを作る前に `wrangler.jsonc` へbindingを書くと、存在しないbucket参照でdeployが失敗する可能性がある。

## 決定

- R2 bucketはまだ作成しない。
- bucket作成までは `wrangler.jsonc` に `r2_buckets` を追加しない。
- bucket自体はpublicにしない。
- ファイル配信はWorker経由、またはWorkerが発行する短期署名URL経由にする。
- Supabase PostgresはAuth、RLS、ファイル権限、Postgresメタデータの正本にする。
- R2はファイル本体だけを保存する。

## binding名

| binding | 用途 |
|---|---|
| `CAPTURE_ASSETS` | 操作記録スクリーンショット |
| `MANUAL_ASSETS` | 手順書画像、注釈済み画像 |
| `EXPORTS` | PDF、HTML、Markdown出力 |
| `AVATARS` | ユーザー、ワークスペース画像 |

## bucket名

| 環境 | bucket |
|---|---|
| staging | `meccha-manual-capture-assets-staging` |
| staging | `meccha-manual-manual-assets-staging` |
| staging | `meccha-manual-exports-staging` |
| staging | `meccha-manual-avatars-staging` |
| production | `meccha-manual-capture-assets-prod` |
| production | `meccha-manual-manual-assets-prod` |
| production | `meccha-manual-exports-prod` |
| production | `meccha-manual-avatars-prod` |

## 影響

- Phase 1/2ではR2 bucket作成なしでもdeployできる。
- Phase 2以降でファイル保存を実装する前に、staging bucketを作成してから `wrangler.jsonc` にbindingを追加する。
- production bucketはproduction反映の明示承認後に作成する。

## アクセスとライフサイクル

- bindingは環境ごとの `r2_buckets` に同じ論理名を置き、bucket名だけを切り替える。bucket名を環境変数やsecretとして二重管理しない。
- Workerは認証session、`workspace_id`、Postgresメタデータの権限を検証し、R2を直接公開しない。
- 閲覧はWorker proxyまたは用途別に上限を定めた短期署名URLとし、共有リンクを暗黙に有効化しない。
- スクリーンショットと入力由来画像はPII・機密情報を含み得るものとして扱い、R2 metadata、object key、ログへ入力値や個人情報を入れない。
- 削除はPostgresをsoft deleteした後に非同期削除し、失敗を再試行・監査する。保持期間の確定値は `OQ-011` の解決後に設定し、それまでは自動ライフサイクル削除を有効化しない。
