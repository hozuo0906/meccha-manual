# R2 Storageハーネス

Status: Accepted

## 目的と責務分離

操作記録スクリーンショット、手順書画像、出力、アバターのファイル本体をprivateなCloudflare R2に保存するため、実リソース作成前に契約と安全ゲートを固定する。SupabaseはAuth、Postgres、RLS、ファイルメタデータの正本、R2はファイル本体、Workerは認可と配信の境界とする。

Supabase StorageではなくR2を第一候補にする理由は、増加しやすい操作記録画像をCloudflare Worker / Browser Runと近い境界で扱え、転送コストを抑えやすいためである。R2はSupabase RLSを直接適用できないため、Postgres行を経由しないR2アクセスは禁止する。設計判断は [ADR-0011](../03-architecture/adrs/ADR-0011-cloudflare-r2-file-storage.md) と [ADR-0018](../03-architecture/adrs/ADR-0018-r2-bucket-binding-contract.md) を正本とする。

## 作るもの

| 環境 | bucket | Wrangler binding |
|---|---|---|
| staging | `meccha-manual-capture-assets-staging` | `CAPTURE_ASSETS` |
| staging | `meccha-manual-manual-assets-staging` | `MANUAL_ASSETS` |
| staging | `meccha-manual-exports-staging` | `EXPORTS` |
| staging | `meccha-manual-avatars-staging` | `AVATARS` |
| production | `meccha-manual-capture-assets-prod` | `CAPTURE_ASSETS` |
| production | `meccha-manual-manual-assets-prod` | `MANUAL_ASSETS` |
| production | `meccha-manual-exports-prod` | `EXPORTS` |
| production | `meccha-manual-avatars-prod` | `AVATARS` |

`wrangler.jsonc` にはbucket作成後、staging/production環境ごとの `r2_buckets` として追加する。同じ論理bindingを用い、bucket名を環境変数やsecretとして持たない。現時点では存在しないbindingを追加しない。

R2 bucketはまだ作成しない。

## アクセス制御とURL

1. WorkerがSupabase sessionを検証する。
2. `workspace_id` をクライアント入力だけで信用せず、assetのPostgresメタデータを取得してmembershipと権限を確認する。
3. 認可後にWorker proxy、または用途別の上限を持つ短期署名URLを発行する。URLの正確なTTLは `OQ-013` とする。
4. URL発行と削除を監査ログへ残す。署名、token、object内容は残さない。
5. bucketをpublicにせず、公開手順書や共有リンクも同じ認可境界を通す。共有リンクはデフォルトOFFとする。

object keyは `{workspace_id}/{resource_type}/{resource_id}/{asset_id}.{ext}` とする。推測可能な原本ファイル名、メールアドレス、入力値、顧客名を含めない。content type、byte size、checksum、作成者、削除状態はPostgresメタデータへ保存する。

## PII・機密情報、削除、保持

- スクリーンショットはPII・社内機密を含み得るものとしてprivate扱いし、公開前確認とマスキングを必須にする。
- R2 custom metadata、ログ、監査ログへ入力値、Cookie、Authorization header、secret、個人情報を保存しない。
- 削除要求はPostgresをsoft deleteして新規URL発行を止め、非同期ジョブで原本と派生物を削除し、成功または再試行結果を監査する。
- 保持期間は `OQ-011` の解決前に推測で固定せず、自動ライフサイクル削除を有効化しない。法務上の保持と利用者削除要求を決定後、stagingで検証する。

## 必要な外部設定と承認

必要な外部設定は、環境別Cloudflare account/Worker、8 bucket、環境別binding、最小権限のdeploy credentialである。以下はすべて明示承認を要する。

- stagingまたはproduction bucketの実作成・削除
- Wrangler binding追加後の外部環境deploy
- productionの保持・削除rule変更
- public access、custom domain、共有配信の有効化（本方針では原則不採用）

## まだやらないこと

R2 bucket作成、binding追加、外部deploy、実ファイルupload、public access、署名secret登録、Supabase Storage bucket作成は行わない。

## 完了条件

- bucket/binding/object keyがADR、データ契約、環境台帳と一致する。
- private、Postgres認可、短期URL、PII、削除・保持の方針がレビュー済みである。
- `npm run r2-storage:check` と `npm run harness:check` が成功する。
- bucket作成後はstagingでupload/read/delete、別workspace拒否、期限切れURL拒否、派生物削除を確認してからproduction承認へ進む。
