# 認証とテナント

Status: Accepted

## 認証

Supabase Authを使います。API WorkerはSupabase JWTを検証し、ユーザーIDとワークスペース所属を確認します。

## ワークスペース

すべての業務データはワークスペースに所属します。個人単独利用は作りません。

## ロール

| ロール | 権限 |
|---|---|
| owner | ワークスペース全管理、課金、メンバー管理、削除 |
| admin | メンバー管理、設定、監査閲覧、手順書管理 |
| editor | 手順書作成、編集、公開、共有設定 |
| viewer | 手順書閲覧、許可されたコメント |

## 認可レイヤー

- UI: 操作を隠すが、セキュリティ境界にしない。
- API Worker: 業務上の拒否理由を返す。
- RLS: 最終防衛線。

## RLS補助関数

- `is_workspace_member(workspace_id, user_id)`
- `has_workspace_role(workspace_id, user_id, roles[])`
- `can_view_manual(manual_id, user_id)`
- `can_edit_manual(manual_id, user_id)`
