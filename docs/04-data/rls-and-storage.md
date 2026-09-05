# RLSとファイル保存

Status: Superseded

Superseded by [D1データ・認可境界](d1-and-storage.md) and [ADR-0028](../03-architecture/adrs/ADR-0028-cloudflare-access-d1.md)。以下はSupabase/RLS移行前の判断記録として保持する。

## 方針

SupabaseはAuth、Postgres、RLS、ファイルメタデータの正本にする。
ファイル本体はCloudflare R2を第一候補にする。

理由:

- 操作記録スクリーンショットは増えやすい。
- Cloudflare R2はWorker、Browser Runと同じCloudflare側でファイル本体を扱え、DB行と増加しやすいオブジェクトの責務を分離できる。
- Worker、Browser Run、R2をCloudflare側で近く扱える。
- Supabase RLSはDB行の権限判定に集中させる。

## RLS方針

- すべての業務テーブルでRLSを有効化する。
- RLSはdeny-by-default。
- `workspace_id` によるテナント分離を基本にする。
- UIで隠すだけの権限制御は禁止。
- API認可とRLSを両方テストする。
- `workspaces` のID・作成者・作成日時と、`workspace_members` の所属先・対象ユーザー・作成者・作成日時はowner/adminでも更新できない。
- `workspace_members` のclient直接INSERT/UPDATE/DELETEを禁止し、SECURITY DEFINER RPCだけを書込み窓口にする。insertでは`created_by`を`auth.uid()`へ強制し、作成監査主体を偽装させない。
- ownerの昇格・降格は専用フローを実装するまで許可しない。
- 最後のactive ownerはUPDATEだけでなくDELETEでもDB triggerが拒否する。
- メンバー管理RPCはactive memberだけに一覧を返し、変更はowner/adminへ限定する。メールアドレスによる直接追加は行わず、本人発行の256 bit・10分有効・単回使用の参加コードだけを利用する。平文コードはDB、Storage、URL、ログ、監査ログへ保存しない。
- membership作成・復帰、参加コード消費、監査追記を同一transactionで確定する。role/status変更も実変更がある場合だけappend-only監査へ追記する。
- メンバー変更はworkspace行を最初にlockし、並行する管理操作のlock順序を統一する。
- 認証用RPCは匿名実行を許可せず、メンバー・ロール判定RPCが照会できる対象ユーザーを`auth.uid()`に限定する。
- ファイル本体の直接公開は禁止し、DBメタデータと毎回Access/D1または有効な共有grantを再検証するWorker proxyで権限確認する。業務assetの直接署名URL発行、失効後の新規request、cache reuseによる迂回を許可しない。

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

staging 4 bucketは作成済みとのユーザー申告があるが、bindingと接続確認は未実施。production bucketはまだ作成しない。
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

## 配信境界

- WorkerがSupabase Auth sessionを検証する。
- WorkerがPostgres/RLS相当の権限確認を行う。
- 権限確認後、短期限のURLまたはWorker proxyで配信する。
- 公開手順書でもbucket自体はpublicにしない。
- 共有リンクの期限切れ、無効化、パスコード変更は即時に反映する。

## service role

- 初期段階では使わない。
- `SUPABASE_SERVICE_ROLE_KEY`、DB password、JWT Secretはまだ登録しない。
- RLS bypassが必要な処理は、用途、監査ログ、代替案をADRに残してから導入する。
