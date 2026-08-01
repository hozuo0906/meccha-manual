# ADR-0011: ファイル本体はCloudflare R2を第一候補にする

Status: Accepted

## 決定

`めっちゃマニュアル` のスクリーンショット、手順書画像、PDF/HTML出力、avatarなどのファイル本体はCloudflare R2を第一候補にする。
SupabaseはAuth、Postgres、RLS、ファイルメタデータの正本にする。

## 背景

当初はSupabase Storage bucketを作る案だった。

候補bucket:

- `capture-assets`
- `manual-assets`
- `exports`
- `avatars`

ただし、操作記録スクリーンショットは増えやすく、保存容量と転送量がコスト要因になる。
比較上、Cloudflare R2は無料枠が大きく、egress無料で、Cloudflare Workerと近く扱える。

## 影響

- Supabase Storage bucketは初期作成しない。
- R2 bucketはstaging/production分離後に作成する。
- PostgresにはR2 object key、content type、byte size、checksum、作成者、workspace_id、削除状態を保存する。
- ファイル配信はWorker経由で権限確認する。
- bucket自体はpublicにしない。
- `wrangler.jsonc` のR2 bindingはbucket作成後に追加する。

## リスク

- R2はSupabase RLSを直接使えない。
- Worker側の署名URL発行と権限確認を誤ると情報漏えいになる。
- object keyとDBメタデータの不整合を掃除する仕組みが必要。

## 対策

- ファイル参照は必ずPostgresメタデータを経由する。
- WorkerはSupabase sessionとworkspace権限を確認してから配信する。
- 削除はDBメタデータを先にsoft deleteし、非同期でR2 objectを削除する。
- 監査ログにファイル作成、閲覧URL発行、削除を記録する。
