# 外部連携

Status: Accepted

## Cloudflare

役割:

- Access: メールOTP・明示allowlistによる招待制の到達制御
- Workers: Access JWT検証、業務API認可、Webhook、共有閲覧、業務assetの毎回再検証付きWorker proxy配信（直接署名URLは発行しない）
- D1: application identity、workspace membership/role、業務データ、ファイルメタデータ、監査ログの正本
- Durable Objects: 操作記録セッション状態
- Browser Run: システム内ブラウザ
- R2: privateなスクリーンショット、手順書画像、出力ファイル、avatar

Access到達を業務認可と同一視せず、Workerが検証済みaccess user、D1のactive membership/role、resource workspaceを毎回照合する。service tokenはmachine専用routeだけに許可し、D1 userへ写像しない。

Stripe/Discord callbackはexact pathごとのpath別Access Bypassで到達だけを許可する。Bypassを認証・認可の代替にせず、Workerはexact method/body上限、raw body署名・署名対象timestampの副作用なし検証、有界parse/schema・allowlist検証の後、provider ID、payload digest、receiptと再実行可能なwork/outboxを単一のatomic operationで保存する。guard commit後だけ成功応答し、保存済みoutboxからQueue、外部API、業務D1、entitlementその他の副作用へ進める。receipt stateにより一時失敗を同じworkで再開し、結果不明は照合前に自動再送せず、completed再送は冪等successとする。既存Discord KV get→putはauthoritative guardにせず、OQ-031完了前はBypassを有効化しない。hostname全体やwildcard pathへBypassを適用せず、通常アプリAPIと`GET /health/config`はAccess保護を維持する。通常ブラウザwrite APIだけに同一Originを必須とし、callbackでは`Origin`を認証根拠にしない。

Cloudflareのaccount ID、API token、Access audience、D1 database ID、実際の権限構成、登録状況はリポジトリ文書へ記録しない。deploy主体ごとに必要最小権限を設定し、外部設定の監査で確認する。

staging 4 bucketは作成済みとのユーザー申告があるが、bindingと接続確認は未実施。production Access/D1/R2はまだ作成しない。bucket名とbinding名はADR-0018で確定済みとし、staging/productionの実binding追加は承認後に行う。

## Legacy Supabase

Supabase Auth/Postgres/RLSはIssue #176移行前のfrozen baselineである。新規project、user、secret、data、migration、remote write、live workflow、fallback、二重書込みを行わない。ただし、既存staging/test契約に対するcanonical live gateのpre-M5実行では、ownerが実行自体を明示承認した場合に限り、必要な既存staging/test data作成、remote write、live workflowを許可する。M6で残存runtimeと不要資格情報を退役する。

禁止するlegacy secret:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_JWT_SECRET`

## Discord

役割:

- GitHub Actionsから開発報告を通知する。

運用:

- Webhook URLをチャット、Markdown、ログへ貼らない。
- 通知は要約だけにする。
- Discordからの指示受付はWebhookではできないため、将来BotまたはGitHub Issue bridgeで実装する。

サイドタスク:

- task id: `019fb8ec-ee4f-7370-ab5f-0b61fb09f931`
- branch: `feature/discord-notify-test`
- mainへ直接pushしない。
- このメインセッションのdocs/ADR方針を正本にする。

## Stripe

役割:

- Checkout Sessions: 認証済みユーザーの購入試行ごとに作成する短命な申込画面
- Stripe Link: Checkout上の決済情報入力支援
- Webhook: 課金状態とentitlementの正本

将来想定:

- `single_export`: 550 JPY / one manual / tax included
- `personal_monthly`: 3,300 JPY / monthly / tax included
- `team_monthly`: 9,900 JPY / monthly / tax included
- Priceは環境別allowlistへ登録し、固定Payment Link URLはentitlement付与に使わない

初期状態:

- `BILLING_FEATURE_ENABLED=false`
- Stripe関連Secret、Price IDは未登録
- Stripe外部API呼び出しなし
- M2ではStripe/Discordのcallback本体を有効化せず、2つのexact POST pathは `503 CALLBACK_MIGRATION_IN_PROGRESS` とする。path別Access BypassはOFFを維持し、callbackの完全な実装・検証はC1へ移す。

課金のアプリ境界だけを先に固定し、外部設定は後回しにする。
アプリ側の `/v1/webhooks/stripe` とCheckout Session作成処理が未実装のため、Stripe webhook endpointや商品をまだ作らない。

## AI

- 初期状態では外部AI APIを呼ばない。
- 将来のAI adapter境界だけ用意する。
- 管理者が明示的にONにした場合のみ利用可能にする。
- 利用上限、利用ログ、概算コスト、監査ログを持つ。
