# クラウド開発ハーネス

Status: Accepted

## 目的

GitHubを正本にし、Codespaces、GitHub Actions、Cloudflare、Supabase、Stripeを使ってクラウド中心で開発する。

## 現在追加済み

- `.devcontainer/devcontainer.json`: Codespaces起動設定。
- `docs/08-operations/codex-cloud-environment.md`: Codex Cloud / Codex web / Codespaces作業環境。
- `docs/09-delivery/codex-cloud-task-template.md`: クラウドtask開始テンプレート。
- `.github/workflows/docs-ci.yml`: Markdown正本の最低限チェック。
- `.github/workflows/auto-pr.yml`: feature/fix/review/chore/phase branch push時のPull Request自動作成。
- `.github/pull_request_template.md`: PRごとの品質確認。
- `.github/ISSUE_TEMPLATE/*`: Epic、Task、Review finding。
- `scripts/check-docs.mjs`: 文書チェック。
- `package.json`: `npm run docs:check`。
- `wrangler.jsonc`: Cloudflare Workerの最小デプロイ設定。
- `apps/worker/src/index.ts`: 健康チェック、Phase 1認証・ワークスペースAPI、接続済みハーネス用endpointを持つWorker。
- `apps/worker/src/app-assets.ts`: 日本語ログイン、ワークスペース一覧・作成のPhase 1 UIハーネス。
- `supabase/migrations/202608010001_phase1_identity_workspaces.sql`、`202608010002_phase1_workspace_membership_hardening.sql`、`202608100001_phase1_workspace_input_hardening.sql`: Phase 1の認証・ワークスペース・RLS・入力不変条件。リポジトリへの追加は外部環境への適用済みを意味しない。
- `scripts/rls-negative-test.mjs`: dev/staging用の動的RLS negative test。外部環境と検証データを必要とする。
- `scripts/check-cloud-codex-environment.mjs`: クラウド作業環境のrepo側チェック。
- `docs/08-operations/remaining-harness-plan.md`: 本番開発前に残る外部連携ハーネスの境界と完了条件。
- `scripts/check-harness-docs.mjs`: R2、環境分離、Stripe、migration、Browser Session文書の整合性検査。

## まだ必要な外部設定

- GitHub Codespacesをリポジトリで有効化する。
- Codex CloudまたはCodex webでGitHub repository `hozuo0906/meccha-manual` を接続する。
- Branch protectionを設定し、`Docs CI` を必須にする。
- CloudflareアカウントとWorkersプロジェクトを作成する。
- Supabase東京リージョンのプロジェクトを作成する。
- Stripe test modeのPrice、Checkout Session、Webhook設定を用意する。
- GitHub SecretsまたはCloudflare Secretsへsecretを登録する。

## Cloudflare Workers Git連携の初期設定

Cloudflareの `Set up your application` 画面では次を使います。

```text
Project name: meccha-manual
Build command: npm run docs:check
Deploy command: npx wrangler deploy
```

現在のWorkerは健康チェックに加え、Supabase設定時にPhase 1のログイン、ログアウト、セッション、ワークスペース一覧・作成を扱う。Browser Run、Stripe、外部AI APIはPhase 1の対象外であり、外部設定や本番利用をこのハーネスの存在だけで有効と判断しない。

Supabaseの初期環境変数を設定した後は、次のURLで設定有無だけ確認します。キーの値そのものは返しません。

```text
https://<worker-url>/health/config
```

`SUPABASE_URL` と `SUPABASE_ANON_KEY` は公開前提の値なので、初期段階では `wrangler.jsonc` の `vars` にも定義します。`SUPABASE_SERVICE_ROLE_KEY`、DBパスワード、JWT Secret、接続文字列は絶対に `vars` やGitへ入れず、Cloudflare Secretで管理します。

## 推奨Branch運用

- `main`: 常に正本。
- `phase/01-foundation`: Phase 1の実装。
- `feature/*`: 小さな機能単位。
- `review/*`: 辛口レビューやリファクタリングレビューの修正。

## 現在のCI

`npm run check` は文書だけでなく、Workerの型検査とbundle dry-run、runtime・失敗変異、UI、workflow、migration、migration安全性、RLS手順、環境分離、品質ゲート、秘密値を検査する。Phase 1 readiness workflowは実Chromiumのfixture E2Eも実行する。外部資格情報を必要とする動的RLS testとstaging E2Eは自動的に成功扱いにしない。

Phase 1実装では次を小分けで追加する。

- lint
- RLS negative test
