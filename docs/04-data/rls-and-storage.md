# RLSとファイル保存

Status: Accepted

## 方針

SupabaseはAuth、Postgres、RLS、ファイルメタデータの正本にする。
ファイル本体はCloudflare R2を第一候補にする。

理由:

- 操作記録スクリーンショットは増えやすい。
- Cloudflare R2は無料枠が大きく、egress無料のため画像配信と出力ファイルに向く。
- Worker、Browser Run、R2をCloudflare側で近く扱える。
- Supabase RLSはDB行の権限判定に集中させる。

## RLS方針

- すべての業務テーブルでRLSを有効化する。
- RLSはdeny-by-default。
- `workspace_id` によるテナント分離を基本にする。
- UIで隠すだけの権限制御は禁止。
- API認可とRLSを両方テストする。
- ファイル本体の直接公開は禁止し、DBメタデータと署名URL発行時に権限確認する。

## 補助関数

- `is_workspace_member(workspace_id, user_id)`
- `has_workspace_role(workspace_id, user_id, roles[])`
- `can_view_manual(manual_id, user_id)`
- `can_edit_manual(manual_id, user_id)`

## R2 bucket方針

| Bucket | 用途 | 公開 | 初期作成 |
|---|---|---|---|
| `capture-assets` | 操作記録中のクリック前後スクリーンショット | private | Phase 3 |
| `manual-assets` | 手順書画像、注釈済み画像 | private | Phase 2/3 |
| `exports` | PDF、HTML、Markdown出力 | private | Phase 4 |
| `avatars` | ユーザー、ワークスペース画像 | private | Phase 1/2任意 |

R2 bucketはまだ作成しない。
外部設定前にCloudflare環境分離、binding名、staging/production bucket名を確定する。

## Path規則

```text
{workspace_id}/{resource_type}/{resource_id}/{asset_id}.{ext}
```

例:

```text
workspace-id/manuals/manual-id/asset-id.png
workspace-id/captures/capture-session-id/asset-id.webp
workspace-id/exports/manual-id/export-id.pdf
```

## メタデータ

Postgresに保存するもの:

- `workspace_id`
- `asset_id`
- `bucket`
- `object_key`
- `content_type`
- `byte_size`
- `checksum`
- `created_by`
- `created_at`
- `deleted_at`
- マスキング済み/未マスキングの状態

R2に保存するもの:

- ファイル本体
- 必要に応じたオブジェクトmetadata

## 署名URL

- WorkerがSupabase Auth sessionを検証する。
- WorkerがPostgres/RLS相当の権限確認を行う。
- 権限確認後、短期限のURLまたはWorker proxyで配信する。
- 公開手順書でもbucket自体はpublicにしない。
- 共有リンクの期限切れ、無効化、パスコード変更は即時に反映する。

## service role

- 初期段階では使わない。
- `SUPABASE_SERVICE_ROLE_KEY`、DB password、JWT Secretはまだ登録しない。
- RLS bypassが必要な処理は、用途、監査ログ、代替案をADRに残してから導入する。
