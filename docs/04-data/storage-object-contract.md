# Storage object contract

Status: Accepted

## 目的

R2 objectとPostgresメタデータの対応を固定し、ワークスペース越境、公開URL漏れ、削除漏れを防ぐ。

## 保存先

| binding | bucket | kind |
|---|---|---|
| `CAPTURE_ASSETS` | `meccha-manual-capture-assets-staging` / `meccha-manual-capture-assets-prod` | `capture_screenshot` |
| `MANUAL_ASSETS` | `meccha-manual-manual-assets-staging` / `meccha-manual-manual-assets-prod` | `manual_image` |
| `EXPORTS` | `meccha-manual-exports-staging` / `meccha-manual-exports-prod` | `pdf_export`, `html_export`, `markdown_export` |
| `AVATARS` | `meccha-manual-avatars-staging` / `meccha-manual-avatars-prod` | `user_avatar`, `workspace_avatar` |

R2 bucketはまだ作成しない。

## object key

```text
{workspace_id}/{resource_type}/{resource_id}/{asset_id}.{ext}
```

例:

```text
workspace-id/manuals/manual-id/asset-id.png
workspace-id/captures/capture-session-id/asset-id.webp
workspace-id/exports/manual-id/export-id.pdf
workspace-id/avatars/user-id/asset-id.webp
```

## Postgresメタデータ

Postgresメタデータに保存するもの:

- `workspace_id`
- `resource_id`
- `asset_id`
- `bucket`
- `object_key`
- `kind`
- `content_type`
- `byte_size`
- `checksum_sha256`
- `width`
- `height`
- `created_by`
- `created_at`
- `deleted_at`
- `status`
- `masking_status`

## R2 object metadata

R2 object metadataに保存してよいもの:

- `workspace_id`
- `resource_id`
- `asset_id`
- `kind`
- `content_type`
- `checksum_sha256`

secret、共有トークン、個人情報、入力値、実ユーザーの操作内容はR2 metadataへ保存しない。

## サーバー側Storage契約

- domain側のportはR2 SDK型を参照せず、`put`、`get`、`delete` を定義する。
- 保存要求は用途、object key、kind、content type、byte size、SHA-256 checksum、許可済みmetadataだけを受け付ける。checksumは形式だけでなく受信bodyから再計算して一致を確認する。
- `manual_id` と `step_id` は認可・DB連携に使うサーバー側metadataとして扱えるが、R2 custom metadataには複製しない。
- metadataは `workspace_id`、object keyの第3要素と一致する `resource_id`、`asset_id`、任意の `manual_id`、`step_id` だけを受け付け、任意キーによるsecret、入力値、個人情報の混入を拒否する。
- object keyの各要素は元ファイル名や表示名ではなく、不透明な小文字識別子に限定する。
- key全体をmetadataから再構築して完全一致を確認する。workspace、resource、assetのいずれかが異なるkeyや、余分・空のpath segmentを拒否する。
- Storage portの`get`はmemory stubとR2 adapterで同じdomain shapeを返す。R2に複製しない`manual_id`と`step_id`はread結果へ含めず、認可時はPostgres正本から取得する。

## 参照

- 認可はWorker経由で行う。
- WorkerはSupabase sessionとworkspace権限を確認する。
- 権限確認後、Worker proxyまたは短期署名URLで配信する。
- bucket自体はpublicにしない。
- 共有リンクが有効でも、R2 objectを直接公開しない。

## 削除

- DBメタデータを先にsoft deleteする。
- 非同期でR2 objectを削除する。
- 削除失敗は監査ログと再試行jobへ残す。
- `deleted_at` 済みassetのURL発行は禁止する。
