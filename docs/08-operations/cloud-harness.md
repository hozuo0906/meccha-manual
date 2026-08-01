# クラウド開発ハーネス

Status: Accepted

## 目的

GitHubを正本にし、Codespaces、GitHub Actions、Cloudflare、Supabase、Stripeを使ってクラウド中心で開発する。

## 現在追加済み

- `.devcontainer/devcontainer.json`: Codespaces起動設定。
- `.github/workflows/docs-ci.yml`: Markdown正本の最低限チェック。
- `.github/workflows/auto-pr.yml`: feature/fix/review/chore/phase branch push時のPull Request自動作成。
- `.github/pull_request_template.md`: PRごとの品質確認。
- `.github/ISSUE_TEMPLATE/*`: Epic、Task、Review finding。
- `scripts/check-docs.mjs`: 文書チェック。
- `package.json`: `npm run docs:check`。
- `wrangler.jsonc`: Cloudflare Workerの最小デプロイ設定。
- `apps/worker/src/index.ts`: 初回デプロイ確認用の健康チェックWorker。

## まだ必要な外部設定

- GitHub Codespacesをリポジトリで有効化する。
- Branch protectionを設定し、`Docs CI` を必須にする。
- CloudflareアカウントとWorkersプロジェクトを作成する。
- Supabase東京リージョンのプロジェクトを作成する。
- Stripe test modeのPayment Link/Webhook設定を用意する。
- GitHub SecretsまたはCloudflare Secretsへsecretを登録する。

## Cloudflare Workers Git連携の初期設定

Cloudflareの `Set up your application` 画面では次を使います。

```text
Project name: meccha-manual
Build command: npm run docs:check
Deploy command: npx wrangler deploy
```

この段階のWorkerは健康チェックのみを返します。Supabase、Browser Run、StripeはPhase 1以降でsecretとbindingを追加してから接続します。

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

## 最小CI

最初は文書チェックだけを必須にします。アプリ実装が始まったら、次を追加します。

- TypeScript typecheck
- lint
- unit test
- Playwright E2E
- RLS negative test
- Worker deploy dry run
