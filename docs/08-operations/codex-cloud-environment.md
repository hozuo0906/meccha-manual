# Codex cloud environment

Status: Accepted

## 目的

PCの電源が切れていても、GitHub上の正本repoを使ってCodex Cloud、Codex web、GitHub Codespacesで作業できる状態にする。

この利用手順は [ADR-0020 Codexクラウド作業環境](../03-architecture/adrs/ADR-0020-cloud-codex-working-environment.md) に従う。

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
7. PR作成後は、GitHub Actions、既存CI／PRテンプレートの旧来の名称「サブエージェント品質loop」に対応する品質確認、Astra high親PMによる実SHA確認を行う。現行の独立タスク体制では、親PMが要件・統合判断・品質ゲートを担い、Luna high作業担当が限定実装・検証・報告を担う。商用リリース前の通常のpush、PR作成・更新、mergeは、この確認と保護ブランチ・必須CI・review threadの条件を満たせばユーザーの都度承認を要しない。商用リリース後は操作ごとにユーザーの事前承認を得る。

### task作成前の担当・モデル確認

task本文へ担当や希望modelを記載するだけでは、実行設定の切替済みとは扱わない。作成前に選択し、作成後に実行設定を確認して記録する。

| 項目 | 作成前の選択 | 作成後の確認 |
| --- | --- | --- |
| 親PM | 担当者: `<親PM>` / model: `gpt-6-astra` / reasoning: `high` | 実行設定のmodel／reasoning、確認日時（ISO 8601） |
| 作業担当 | 担当者: `<担当>` / model: `gpt-5.6-luna` / reasoning: `high` | 実行設定のmodel／reasoning、確認日時（ISO 8601） |

確認できない項目は「未確認」と記録し、プロンプトの記載だけで完了扱いにしない。

### 商用リリース前後の開発操作承認

- 商用リリースの実施時は、日時、リリース識別子、根拠をIssue #70へ記録して承認境界を切り替える。記録が不在または曖昧な場合は商用リリース状態を未確認とし、未リリースと決めつけた自動mergeを行わず、read-only確認と提案を先に行う。
- 商用リリース後は外部反映ごとにユーザーの事前承認を得る。承認待ちでは可逆的な差分・テストによる具体案の準備は可とするが、外部反映前に対象SHA／差分を提示し、未push成果物だけを残して終了しない。承認待ちが必要なら明示する。終了前push必須の規則は、作業開始前に得た具体的な承認範囲がある場合に限り適用する。
- 最初の商用公開、production反映、課金、secret変更、機密情報保存、破壊的操作などの既存の別承認境界は変更しない。古い一般的な「owner承認待ち」だけを理由に、商用リリース前の通常のpush／PR／mergeを停止しない。

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

ADR-0019および `docs/09-delivery/phase1-entry-gate.md` の旧Phase 1 Supabase/RLS着手前ゲートは、ADR-0028でSupersededである。したがって、現行のCloudflare Access/D1移行では、旧ユーザー承認や `phase1-readiness:check` を着手条件にしない。旧checkは移行前legacy baselineの検証用途に限る。現行の品質ゲートはADR-0028、DEC-067、および親PMによる実SHA・依存順・必要な品質ゲート確認に従う。初回商用公開、production反映、課金、secret変更、機密情報保存、破壊的操作などの別承認境界は維持する。

```text
npm run phase1-readiness:check
```

## Discordとの関係

Discordは指示受付、Issue化、通知、レビュー依頼の入口として使う。実装をクラウドで進めるには、Codex Cloud、Codex web、またはCodespacesで該当Issueをtaskとして開始する。
