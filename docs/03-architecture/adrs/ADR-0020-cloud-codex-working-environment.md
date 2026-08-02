# ADR-0020 Codexクラウド作業環境

Status: Accepted

## 背景

ユーザーはPCの電源が切れていても、GitHubやクラウド上で開発が進む状態を求めている。DiscordからIssueを作成し、GitHub Actionsで通知やPR作成を行うハーネスはあるが、ローカルCodex Desktopがコード編集している限りPCの電源に依存する。

## 決定

- GitHubを正本にする。
- PCの電源に依存しない作業は、Codex Cloud、Codex web、またはGitHub Codespacesで行う。
- repo側には `.devcontainer/devcontainer.json`、`codex-cloud:check`、運用docs、task templateを置く。
- Codex Cloudの実タスクはGitHub repository `hozuo0906/meccha-manual` を接続した環境で実行する。
- ローカルCodex Desktopは、クラウド作業環境が使えない時の補助とする。

## 制約

- Discord Issue作成は作業依頼の入口であり、AI実装が自動で走ることを意味しない。
- Codex CloudまたはCodex web側でタスクを開始しない限り、PCの電源OFF中に新しいコード編集は進まない。
- mainへ直接pushしない。
- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。
- secret、共有トークン、個人情報、実ユーザー操作内容をtask本文、docs、ログへ入れない。

## 影響

- Codespaces起動時に `npm ci && npm run codex-cloud:check` を実行する。
- PRでは `Cloud Codex Readiness` workflowがクラウド作業環境のrepo側準備を確認する。
- クラウドタスクへ渡す指示は `docs/09-delivery/codex-cloud-task-template.md` を使う。
