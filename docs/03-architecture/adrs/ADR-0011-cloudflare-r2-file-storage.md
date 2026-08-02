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
Cloudflare R2はCloudflare Worker、Browser Runと同じ実行基盤側で扱え、ファイル本体の保存・配信責務をSupabase Auth/Postgres/RLSから分離できる。操作記録スクリーンショットのように増加しやすいオブジェクトを、DB行と分けて管理できる点も採用理由とする。料金条件は変更され得るため、このADRでは特定の無料枠を採用根拠にしない。

## 影響

- Supabase Storage bucketは初期作成しない。
- R2 bucketはstaging/production分離後、外部設定の承認を得て作成する。
- PostgresにはR2 object key、content type、byte size、checksum、作成者、workspace_id、削除状態を保存する。
- ファイル配信はWorker経由で権限確認する。
- bucket自体はpublicにしない。
- `wrangler.jsonc` のR2 bindingはbucket作成後に追加する。
- bucket名とbinding契約はADR-0018を正本にする。

## リスク

- R2はSupabase RLSを直接使えない。
- Worker側の署名URL発行と権限確認を誤ると情報漏えいになる。
- object keyとDBメタデータの不整合を掃除する仕組みが必要。

## 対策

- ファイル参照は必ずPostgresメタデータを経由する。
- WorkerはSupabase sessionとworkspace権限を確認してから配信する。
- 削除はDBメタデータを先にsoft deleteし、非同期でR2 objectを削除する。
- 監査ログにファイル作成、閲覧URL発行、削除を記録する。
