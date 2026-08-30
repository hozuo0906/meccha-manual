# Codex cloud environment

Status: Accepted

## 目的

PCの電源が切れていても、GitHub上の正本repoを使ってCodex Cloud、Codex web、GitHub Codespacesで作業できる状態にする。

## できること

- Codex CloudまたはCodex webでGitHub repositoryを開き、クラウド側でtaskを実行する。
- GitHub Codespacesでrepoを開き、ブラウザ上のVS Codeから作業する。
- GitHub Actions、Cloudflare Access/Workers/D1/R2、Discord通知はPCの電源に依存せず動く。
- 作業結果はbranch、commit、PRとしてGitHubに残す。

## できないこと

- ローカルCodex Desktopだけが起動している状態で、PCの電源OFF中にコード編集を続けること。
- Discord Issueが作成された瞬間に、承認なしでAI実装が自動開始すること。
- GitHub Actionsだけで安全に任意のコード編集を生成してmainへ入れること。

## Codex Cloud / Codex web

1. CodexまたはCodex webを開く。
2. GitHub repository `hozuo0906/meccha-manual` を接続する。
3. 環境名を `meccha-manual` にする。
4. task本文には `docs/09-delivery/codex-cloud-task-template.md` を使う。
5. branchは `feature/*`、`fix/*`、`review/*`、`chore/*`、`phase/*` を使う。
6. mainへ直接pushしない。
7. PR作成後は、GitHub Actions、サブエージェント品質loop、ユーザー承認を通す。

## GitHub Codespaces

Codespacesは `.devcontainer/devcontainer.json` を使う。

起動時:

```text
npm ci && npm run codex-cloud:check
```

forward ports:

- `5173`: Web app
- `8787`: Cloudflare Worker

## secret

CodespacesやCodex Cloud task本文にsecret値を貼らない。

登録済みsecretの値は表示しない。必要な場合はGitHub Secrets、Cloudflare Secrets、Codex Cloudの環境設定で管理する。

初期状態で入れないもの:

- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_DB_PASSWORD`
- `SUPABASE_JWT_SECRET`
- `OPENAI_API_KEY`
- `AI_PROVIDER_API_KEY`

## 作業開始前チェック

クラウド側taskは、最初に次を実行する。

```text
npm run check
```

Phase 1本番開発へ入る場合は、追加でユーザー承認を確認する。

```text
npm run phase1-readiness:check
```

## Discordとの関係

Discordは指示受付、Issue化、通知、レビュー依頼の入口として使う。実装をクラウドで進めるには、Codex Cloud、Codex web、またはCodespacesで該当Issueをtaskとして開始する。
