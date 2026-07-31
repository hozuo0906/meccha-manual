# テーブル定義

Status: Accepted

## 共通ルール

- 主キーはUUID。
- テナントデータは `workspace_id uuid not null` を持つ。
- 日時は `timestamptz`。
- 業務表示は日本時間、保存はUTC。
- 金額は最小通貨単位の整数。
- 原則 `created_at`, `updated_at`, `created_by` を持つ。
- 主要更新は `audit_logs` に記録する。
- RLSを全公開スキーマテーブルで有効化する。

## テーブル一覧

| テーブル | 主要カラム | RLS/更新方針 |
|---|---|---|
| `profiles` | `id`, `display_name`, `avatar_path`, `locale`, `timezone` | 本人更新。所属メンバーの最小プロフィールのみ閲覧 |
| `workspaces` | `id`, `name`, `slug`, `status`, `settings`, `created_by` | メンバー閲覧、owner/admin更新 |
| `workspace_members` | `workspace_id`, `user_id`, `role`, `status`, `joined_at` | メンバー閲覧、owner/admin管理、自分のrole変更禁止 |
| `workspace_invitations` | `email`, `role`, `token_hash`, `expires_at`, `accepted_at` | owner/admin管理。生トークン保存禁止 |
| `folders` | `workspace_id`, `parent_id`, `name`, `position`, `created_by` | メンバー閲覧、editor以上で変更 |
| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧、editor以上で変更 |
| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | 下書きはeditor以上、公開版は不変 |
| `manual_steps` | `workspace_id`, `revision_id`, `position`, `type`, `title`, `instruction`, `action_type`, `target_text`, `url`, `asset_id`, `annotation`, `masking` | revision権限を継承、公開版更新禁止 |
| `step_targets` | `workspace_id`, `step_id`, `selector_candidates`, `frame_path`, `rect`, `confidence` | revision権限を継承 |
| `tags` | `workspace_id`, `name`, `color` | メンバー閲覧、editor以上で変更 |
| `manual_tags` | `workspace_id`, `manual_id`, `tag_id` | メンバー閲覧、editor以上で変更 |
| `favorites` | `workspace_id`, `user_id`, `manual_id`, `created_at` | 本人のみCRUD |
| `browser_sessions` | `workspace_id`, `user_id`, `state`, `do_key`, `region`, `started_at`, `expires_at`, `ended_at`, `error_code` | 所有者とadminのみ閲覧。Live View秘密情報は保存しない |
| `capture_sessions` | `workspace_id`, `browser_session_id`, `manual_id`, `state`, `started_at`, `stopped_at`, `event_count`, `error_code` | 所有者・editor以上。確定後は追記制限 |
| `capture_events` | `workspace_id`, `capture_session_id`, `sequence_no`, `event_type`, `page_url`, `payload`, `asset_id`, `captured_at` | Workerのみ追加、関連権限で閲覧 |
| `assets` | `workspace_id`, `bucket`, `object_path`, `kind`, `mime_type`, `size_bytes`, `sha256`, `width`, `height`, `status`, `deleted_at` | workspace境界。直接公開せず署名URL |
| `share_links` | `workspace_id`, `manual_id`, `token_hash`, `permission`, `expires_at`, `password_hash`, `revoked_at`, `created_by` | editor以上で管理。匿名アクセスはWorker経由 |
| `comments` | `workspace_id`, `manual_id`, `revision_id`, `step_id`, `author_id`, `body`, `resolved_at`, `resolved_by` | メンバー閲覧/投稿、本人またはeditor以上で更新 |
| `manual_views` | `workspace_id`, `manual_id`, `revision_id`, `viewer_user_id`, `share_link_id`, `session_hash`, `started_at`, `completed_at` | Worker追加。editor以上は集計閲覧 |
| `step_view_events` | `workspace_id`, `manual_view_id`, `step_id`, `event_type`, `occurred_at` | Worker追加。生データはadmin限定 |
| `notifications` | `workspace_id`, `user_id`, `type`, `payload`, `read_at` | 本人のみ閲覧・既読更新 |
| `billing_customers` | `workspace_id`, `stripe_customer_id`, `billing_email` | owner/admin閲覧、更新はStripe同期処理 |
| `subscriptions` | `workspace_id`, `stripe_subscription_id`, `plan_code`, `status`, `quantity`, `current_period_end`, `cancel_at` | owner/admin閲覧、Webhookのみ更新 |
| `payment_events` | `stripe_event_id`, `type`, `payload_digest`, `status`, `attempts`, `processed_at`, `error` | service role専用、`stripe_event_id` unique |
| `audit_logs` | `workspace_id`, `actor_id`, `action`, `resource_type`, `resource_id`, `metadata`, `ip_hash`, `created_at` | Workerのみ追加、owner/admin閲覧、更新削除禁止 |
| `outbox_events` | `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `status`, `attempts`, `available_at` | service role専用 |
| `idempotency_keys` | `scope`, `key_hash`, `request_hash`, `response_ref`, `expires_at` | service role専用 |

## Enum候補

- `workspace_role`: `owner`, `admin`, `editor`, `viewer`
- `manual_status`: `draft`, `reviewing`, `published`, `stale`, `archived`
- `revision_state`: `draft`, `published`, `superseded`
- `capture_state`: `created`, `starting`, `ready`, `recording`, `paused`, `reconnecting`, `stopping`, `completed`, `failed`, `expired`
- `asset_kind`: `screenshot`, `thumbnail`, `export_pdf`, `export_html`, `avatar`
- `share_permission`: `public_link`, `workspace_only`, `invited_only`
