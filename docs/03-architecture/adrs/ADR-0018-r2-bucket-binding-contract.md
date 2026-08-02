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
| staging | `meccha-manual-staging-capture-assets` |
| staging | `meccha-manual-staging-manual-assets` |
| staging | `meccha-manual-staging-exports` |
| staging | `meccha-manual-staging-avatars` |
| production | `meccha-manual-production-capture-assets` |
| production | `meccha-manual-production-manual-assets` |
| production | `meccha-manual-production-exports` |
| production | `meccha-manual-production-avatars` |

## 影響

- Phase 1/2ではR2 bucket作成なしでもdeployできる。
- Phase 2以降でファイル保存を実装する前に、staging bucketを作成してから `wrangler.jsonc` にbindingを追加する。
- production bucketはproduction反映の明示承認後に作成する。
