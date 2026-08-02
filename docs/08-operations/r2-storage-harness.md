# R2 storage harness

Status: Accepted

## 目的

R2 bucket作成前に、bucket名、binding名、公開禁止、配信経路、Postgresメタデータ方針を固定する。

## 現在の状態

R2 bucketはまだ作成しない。

理由:

- Phase 1/2の基盤開発ではファイル本体保存がまだ必須ではない。
- 存在しないbucketを `wrangler.jsonc` に書くとdeploy失敗の原因になる。
- staging/productionの分離と作成順序を先に固定する必要がある。

## 作成するbucket

| 環境 | bucket | binding |
|---|---|---|
| staging | `meccha-manual-capture-assets-staging` | `CAPTURE_ASSETS` |
| staging | `meccha-manual-manual-assets-staging` | `MANUAL_ASSETS` |
| staging | `meccha-manual-exports-staging` | `EXPORTS` |
| staging | `meccha-manual-avatars-staging` | `AVATARS` |
| production | `meccha-manual-capture-assets-prod` | `CAPTURE_ASSETS` |
| production | `meccha-manual-manual-assets-prod` | `MANUAL_ASSETS` |
| production | `meccha-manual-exports-prod` | `EXPORTS` |
| production | `meccha-manual-avatars-prod` | `AVATARS` |

## 作成順序

1. staging bucketをCloudflareで作成する。
2. `wrangler.jsonc` のstaging環境にR2 bindingを追加する。
3. staging deployを通す。
4. upload、read、delete、権限拒否のテストを通す。
5. production bucket作成の承認をユーザーに取る。
6. production bucketをCloudflareで作成する。
7. production環境にR2 bindingを追加する。

## 運用ルール

- bucket自体はpublicにしない。
- R2 objectはWorker経由、またはWorkerが発行する短期署名URLで配信する。
- 権限の正本はSupabase Auth、RLS、Postgresメタデータに置く。
- bucket名は `wrangler.jsonc` の環境別bindingにだけ置き、環境変数へ重複保持しない。
- Cloudflare R2 binding名は `CAPTURE_ASSETS`、`MANUAL_ASSETS`、`EXPORTS`、`AVATARS` に固定する。
- secret、共有トークン、個人情報、入力値、実ユーザーの操作内容をR2 metadataへ入れない。
- 短命URL自体をDBや監査ログへ保存しない。
- object keyへ元ファイル名、画面タイトル、メールアドレスなどのPII/機密情報を入れない。

## 削除と保持

- Postgresメタデータをsoft deleteし、URL発行を即時停止してからR2 objectと派生物を非同期削除する。
- 削除失敗は再試行し、監査ログへasset IDと結果コードを残す。
- 保持期間はデータ種別ごとに承認後に設定する。期間未決の状態ではR2 lifecycle ruleを作らない。

## object key

```text
{workspace_id}/{resource_type}/{resource_id}/{asset_id}.{ext}
```

## 検証

`npm run r2-storage:check` は次を確認する。

- R2方針docsが存在する。
- binding名が固定されている。
- staging/production bucket名が固定されている。
- bucket公開禁止、Worker経由、Postgresメタデータ、短期署名URL方針が文書化されている。
- 削除順序、保持期間未決時の扱い、PII/機密情報禁止が文書化されている。
- `wrangler.jsonc` にR2 bindingがある場合、許可済みbucket名とbinding名だけを使っている。
