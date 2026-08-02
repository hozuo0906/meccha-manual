# Codex Cloud task template

Status: Accepted

## 使い方

Codex Cloud、Codex web、GitHub Codespacesで作業を始める時は、このテンプレートをtask本文に貼る。

```text
Repository: hozuo0906/meccha-manual
Branch: feature/<topic>

目的:
- <何を達成するか>

対象:
- <関連Issue/PR/docs/ADR>

固定ルール:
- AGENTS.mdを最初に読む。
- mainへ直接pushしない。
- secret、共有トークン、個人情報、実ユーザー操作内容をdocs、ログ、PRへ入れない。
- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。
- Chrome拡張を第一方式にしない。
- AI APIは初期OFF。
- UI、文言、docsは日本語専用。

実行:
- npm ci
- npm run check

品質loop:
- コーディング
- UIUX
- テスト
- 辛口レビュー
- リファクタリング/コードレビュー
- ドキュメント記録

完了条件:
- npm run check成功
- P0/P1が0件
- docs/ADR/Issue/テスト条件が実装と一致
- PR作成または既存PR更新
```

## 補足

PCの電源が切れていても作業させたい場合は、ローカルCodex DesktopではなくCodex Cloud、Codex web、またはGitHub Codespaces側でtaskを開始する。
