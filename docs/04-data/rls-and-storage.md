# RLSとStorage

Status: Accepted

## RLS方針

- 全公開スキーマテーブルでRLSを有効化する。
- RLSはdeny-by-default。
- `workspace_id` によるテナント分離を基本とする。
- UIで隠すだけの権限制御は禁止。
- API認可とRLSを両方テストする。

## 補助関数

- `is_workspace_member(workspace_id, user_id)`
- `has_workspace_role(workspace_id, user_id, roles[])`
- `can_view_manual(manual_id, user_id)`
- `can_edit_manual(manual_id, user_id)`

## Storage bucket

| Bucket | 用途 | 公開 |
|---|---|---|
| `capture-assets` | 記録中スクリーンショット | private |
| `manual-assets` | 確定画像、注釈済み画像 | private |
| `exports` | PDF/HTML/Markdown出力 | private |
| `avatars` | ユーザー/ワークスペース画像 | private |

## Path規則

```text
{workspace_id}/{resource_type}/{resource_id}/{asset_id}.{ext}
```

公開手順書でもbucketを公開しません。Workerで共有トークンと権限を検証し、短期署名URLを発行します。

## service role

- Workerのみ利用可能。
- クライアントへ渡さない。
- service role利用は監査ログに残す。
- RLS bypassが必要な処理はユースケース単位で理由を書く。
