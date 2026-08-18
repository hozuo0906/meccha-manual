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
| `profiles` | `id`, `display_name`, `avatar_path`, `locale`, `timezone` | 本人更新。`display_name`はUnicode code pointで0〜64文字。所属メンバーの最小プロフィールのみ閲覧 |
| `workspaces` | `id`, `name`, `slug`, `status`, `settings`, `created_by` | メンバー閲覧、owner/admin更新。`name`はECMAScript `trim()`相当の正規化後1〜64文字、`slug`は同じ前後空白除去・小文字化後に半角英数字とハイフン3〜63文字。`id`と作成監査項目は更新不可 |
| `workspace_members` | `workspace_id`, `user_id`, `role`, `status`, `joined_at`, `created_by` | active所属者によるメンバー閲覧。activeは1workspace最大1000人。client直接書込みは禁止し、owner/adminのSECURITY DEFINER RPCだけで管理する。insert時の`created_by`はcaller入力を信頼せず`auth.uid()`へ強制する。非activeからactiveへの変更は本人発行コード利用だけを許可する。所属先、対象ユーザー、作成監査項目は更新不可。owner変更と最後のactive ownerの更新・削除は専用フローまで禁止 |
| `workspace_join_codes` | `id`, `user_id`, `token_hash`, `expires_at`, `consumed_at`, `consumed_workspace_id`, `consumed_by`, `revoked_at`, `created_at` | client table access禁止。本人だけがRPCで発行し、owner/adminがRPCで利用する。256 bitコードのSHA-256 digestだけを保存し、10分で失効、1回だけ利用可能 |
| `workspace_invitations` | `email`, `role`, `token_hash`, `expires_at`, `accepted_at` | owner/admin管理。生トークン保存禁止 |
| `folders` | `workspace_id`, `parent_id`, `name`, `position`, `created_by` | メンバー閲覧、editor以上で変更 |
| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧。作成・draft metadata・公開・アーカイブ状態変更はSECURITY DEFINER RPCのみ。公開と次draft作成は表示中revision ID、アーカイブは表示中manual更新時刻をmanual row lock内で照合する。アーカイブ時もrevision pointerと内容を保持し`manual.archived`を監査する。`manuals.title`はraw 1〜64文字、ECMAScript `trim()`相当後に空でないことを`manuals_title_length` / `manuals_title_nonblank`で強制し、authenticated direct writeをrevoke |
| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | メンバー閲覧、公開版は不変。draft更新・作成・公開は期待revision ID付きRPCのみ。`manual_revisions.title`はraw 1〜64文字・空白のみ拒否を`manual_revisions_title_length` / `manual_revisions_title_nonblank`で強制し、descriptionは`manual_revisions_description_length`で10,000文字以内、authenticated direct writeをrevoke |
| `manual_steps` | `workspace_id`, `revision_id`, `position`, `type`, `title`, `instruction`, `action_type`, `target_text`, `url`, `asset_id`, `annotation`, `masking` | メンバー閲覧、公開版更新禁止。authenticated direct DMLをrevokeし、同じdraft revision lockを取る4 RPCだけで変更。追加・更新RPCは非公開`manual_step_url_is_valid`でHTTP/HTTPS URLのauthorityとportを検証。`manual_steps_title_*`、`manual_steps_instruction_length`、`manual_steps_target_text_*`、`manual_steps_url_length`、内部JSON各64 KiB、active 200件triggerで上限を強制 |
| `step_targets` | `workspace_id`, `step_id`, `selector_candidates`, `frame_path`, `rect`, `confidence` | active manualのrevision権限を継承。authenticated direct DMLはrevokeし、アーカイブ後は直接SELECTも不可。将来のBrowser Run書込はmanual→revision lockとarchive version更新を共有する専用RPCが必要 |
| `tags` | `workspace_id`, `name`, `color` | メンバー閲覧、editor以上で変更 |
| `manual_tags` | `workspace_id`, `manual_id`, `tag_id` | メンバー閲覧、editor以上で変更 |
| `favorites` | `workspace_id`, `user_id`, `manual_id`, `created_at` | 本人のみCRUD |
| `browser_sessions` | `workspace_id`, `user_id`, `state`, `do_key`, `region`, `started_at`, `expires_at`, `ended_at`, `error_code` | 所有者とadminのみ閲覧。Live View秘密情報は保存しない |
| `capture_sessions` | `workspace_id`, `browser_session_id`, `manual_id`, `state`, `started_at`, `stopped_at`, `event_count`, `error_code` | 所有者・editor以上。確定後は追記制限 |
| `capture_events` | `workspace_id`, `capture_session_id`, `sequence_no`, `event_type`, `payload`, `asset_id`, `captured_at` | Workerのみ追加、関連権限で閲覧。navigation URLはpathにも秘密値が埋め込まれ得るため列・payloadへ保存しない |
| `assets` | `workspace_id`, `bucket`, `object_path`, `kind`, `mime_type`, `size_bytes`, `sha256`, `width`, `height`, `status`, `deleted_at` | workspace境界。直接公開せず署名URL |
| `share_links` | `workspace_id`, `manual_id`, `token_hash`, `permission`, `expires_at`, `password_hash`, `revoked_at`, `created_by` | editor以上で管理。匿名アクセスはWorker経由 |
| `comments` | `workspace_id`, `manual_id`, `revision_id`, `step_id`, `author_id`, `body`, `resolved_at`, `resolved_by` | メンバー閲覧/投稿、本人またはeditor以上で更新 |
| `manual_views` | `workspace_id`, `manual_id`, `revision_id`, `viewer_user_id`, `share_link_id`, `session_hash`, `started_at`, `completed_at` | Worker追加。editor以上は集計閲覧 |
| `step_view_events` | `workspace_id`, `manual_view_id`, `step_id`, `event_type`, `occurred_at` | Worker追加。生データはadmin限定 |
| `notifications` | `workspace_id`, `user_id`, `type`, `payload`, `read_at` | 本人のみ閲覧・既読更新 |
| `billing_customers` | `workspace_id`, `stripe_customer_id`, `billing_email` | owner/admin閲覧、更新はStripe同期処理 |
| `checkout_intents` | `id`, `workspace_id`, `manual_id`, `offer_code`, `request_key_hash`, `request_hash`, `status`, `expires_at`, `stripe_completed_at`, `consumed_at`, `stripe_checkout_session_id`, `created_by` | workspace境界。作成者閲覧、状態更新は課金処理。`manual_id`は`single_export`だけ必須。購入操作keyとStripe Session IDはunique。完了時刻は署名済みevent/Stripe Sessionから一度だけ確定 |
| `billing_purchases` | `id`, `workspace_id`, `checkout_intent_id`, `stripe_payment_intent_id`, `offer_code`, `amount_jpy`, `currency`, `status`, `purchased_at`, `refunded_at` | owner/admin閲覧、Webhook/reconciliationのみ更新。Stripe IDはunique |
| `subscriptions` | `workspace_id`, `stripe_subscription_id`, `plan_code`, `status`, `quantity`, `current_period_end`, `cancel_at` | owner/admin閲覧、Webhookのみ更新 |
| `entitlements` | `workspace_id`, `scope_type`, `scope_id`, `feature_code`, `plan_code`, `state`, `seat_limit`, `viewer_limit`, `browser_run_seconds_limit`, `storage_bytes_limit`, `concurrent_session_limit`, `effective_at`, `expires_at`, `source_subscription_id`, `source_purchase_id` | owner/admin閲覧、課金同期処理のみ更新。manual scopeは同一workspaceのmanualだけを許可 |
| `usage_counters` | `workspace_id`, `period_start`, `period_end`, `browser_run_seconds`, `storage_bytes`, `active_creator_count`, `active_viewer_count`, `concurrent_session_peak`, `updated_at` | メンバーは自workspace集計を閲覧、更新は計測処理のみ。請求根拠と監査用集計を分離 |
| `payment_events` | `stripe_event_id`, `type`, `payload_digest`, `status`, `attempts`, `processed_at`, `error` | service role専用、`stripe_event_id` unique |
| `audit_logs` | `workspace_id`, `actor_id`, `action`, `resource_type`, `resource_id`, `metadata`, `ip_hash`, `created_at` | メンバー管理RPC、公開RPC（`manual.published`）、アーカイブRPC（`manual.archived`）のみ追加、owner/admin閲覧、更新削除禁止 |
| `outbox_events` | `aggregate_type`, `aggregate_id`, `event_type`, `payload`, `status`, `attempts`, `available_at` | service role専用 |
| `idempotency_keys` | `scope`, `key_hash`, `request_hash`, `response_ref`, `expires_at` | service role専用 |

## 手順書編集制約

- `manuals.title` と `manual_revisions.title` はraw 1〜64文字で、`manuals_title_length` / `manual_revisions_title_length` が `char_length(title) between 1 and 64` を強制する。
- `manuals_title_nonblank` / `manual_revisions_title_nonblank` はECMAScript `trim()`相当後に空となるtitleを拒否する。
- `manual_revisions_description_length` と `manual_steps_*` constraintはDEC-052の本文上限を強制する。
- forward migrationは既存値を切り詰めない。互換性がない既存行ではvalidationを失敗させ、対象行を確認する。
- authenticatedのmanual/revision/step direct writeはrevokeし、SECURITY DEFINER RPCだけを利用する。

## 課金データの制約

- `checkout_intents.id` をCheckout Sessionの `client_reference_id` に使い、メールアドレス、workspace名、manual名を渡さない。
- `single_export` のcheckout intentは同一workspace内の `manual_id` に固定する。
- Webhook受信時にPrice IDからoffer codeをサーバー側で決定し、クライアント入力のoffer codeだけを信頼しない。
- 同じ `stripe_event_id`、`stripe_payment_intent_id`、`checkout_intent_id` から二重購入・二重entitlementを作らない。
- `stripe_checkout_session_id` はuniqueとし、1つのcheckout intentを複数Sessionや複数支払いへ再利用しない。
- 同じAPI `Idempotency-Key` とrequest hashは同じcheckout intentを返し、key再利用でrequestが異なる場合は拒否する。都度払いは同じworkspace/manual、subscriptionはofferをまたいで同じworkspaceの未期限切れintentを1件だけにする。この排他制約はpartial unique indexまたは同等のtransaction lockで実装する。
- subscription modeの照合不能・競合処理は、subscription cancel、invoiceのdraft delete/open void/paid PaymentIntentまたはCharge refundの各Stripe object IDと処理状態を冪等なreconciliation記録へ残す。対象自身のsubscription IDは競合から除外し、返金queueへの登録だけで完了扱いにしない。
- Stripe Checkout Session作成ではcheckout intent IDから導出した決定的idempotency keyを使い、API成功後の応答消失や並行実行でも同じStripe Sessionを再取得する。
- Stripe Linkの利用者情報は認証・RLS判定に使わない。
- 利用量上限超過時に自動請求レコードを作らない。

## Enum候補

- `workspace_role`: `owner`, `admin`, `editor`, `viewer`
- `manual_status`: `draft`, `reviewing`, `published`, `stale`, `archived`
- `revision_state`: `draft`, `published`, `superseded`
- `capture_state`: `created`, `starting`, `ready`, `recording`, `paused`, `reconnecting`, `stopping`, `completed`, `failed`, `expired`
- `asset_kind`: `capture_screenshot`, `manual_image`, `pdf_export`, `html_export`, `markdown_export`, `user_avatar`, `workspace_avatar`
- `share_permission`: `public_link`, `workspace_only`, `invited_only`
- `billing_offer_code`: `single_export`, `personal_monthly`, `team_monthly`
- `entitlement_scope_type`: `workspace`, `manual`
- `entitlement_state`: `active`, `grace`, `read_only`, `expired`, `refunded`
