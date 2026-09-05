# ADR-0011: ファイル本体はCloudflare R2を第一候補にする

Status: Accepted

ADR-0028により、認証主体をCloudflare Access、ファイルmetadataと権限の正本をD1へ置換する。private R2、Worker経由配信、adapter境界は維持する。業務assetの直接presigned/短命URL read選択肢は部分Supersededとし、毎回Access/D1または有効な共有grantとD1状態を再検証するWorker proxyに限定する。

## 決定

`めっちゃマニュアル` のスクリーンショット、手順書画像、PDF/HTML出力、avatarなどのファイル本体はCloudflare R2を第一候補にする。
Cloudflare Accessを認証前段、D1を業務データ・ファイルメタデータ・権限の正本とし、Workerで認可する。

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
- D1にはR2 object key、content type、byte size、checksum、作成者、workspace_id、削除状態を保存する。
- ファイル配信はWorker経由で権限確認する。
- bucket自体はpublicにしない。
- `wrangler.jsonc` のR2 bindingはbucket作成後に追加する。
- bucket名とbinding契約はADR-0018を正本にする。

## リスク

- R2はD1のworkspace認可を直接適用できないため、Workerが検証済みAccess identityとactive membership/roleを毎回照合する。
- Worker proxyの毎回再検証と権限確認を誤ると情報漏えいになる。失効後の新しいrequestとcache迂回は拒否する。
- object keyとDBメタデータの不整合を掃除する仕組みが必要。

## 対策

- ファイル参照は必ずD1メタデータを経由する。
- Workerは検証済みAccess user identity、D1のactive membership/role、resource workspaceを確認してから配信する。
- 削除はDBメタデータを先にsoft deleteし、非同期でR2 objectを削除する。
- 監査ログにファイル作成、閲覧URL発行、削除を記録する。
