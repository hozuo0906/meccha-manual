# Codex Cloud task template

Status: Accepted

## 使い方

Codex Cloud、Codex web、GitHub Codespacesで作業を始める時は、このテンプレートをtask本文に貼る。

毎日0時に既存チャットの文脈を継続しない用途では、ChatGPTのStandalone scheduled taskとして、より限定された `daily-session-prompt.md` を使う。

```text
Repository: hozuo0906/meccha-manual
Branch: feature/<topic>
Issue: #<番号>
Pull Request: #<番号または未作成>

担当・モデル確認（task作成前に記入）:
- 親PM: <担当者> / model: `gpt-6-astra` / reasoning: `high`
- 作業担当: <担当者> / model: `gpt-5.6-luna` / reasoning: `high`
- 作成前の選択: model=`<実際に選択したmodel>` / reasoning=`<実際に選択したreasoning>`
- 作成後の実行設定確認: model=`<確認値または未確認>` / reasoning=`<確認値または未確認>` / 確認日時=`<ISO 8601>`
- プロンプト本文への記載だけでmodel／reasoningの切替済みとは扱わない。

目的:
- <何を達成するか>

対象:
- <関連Issue/PR/docs/ADR>

開始確認:
- AGENTS.mdを最初に読む。
- docs/09-delivery/session-handoff.mdを読む。
- GitHub Issue #70「META: 開発現在地・セッション引き継ぎ」を読む。
- Issue #70をGitHubの実状態と照合し、対象branch、base、最新head SHA、CI、review threadを確認する。
- 実装前に、完了済み、未完了、現在の問題、次の1マイルストーン、リスク、承認事項を整理する。
- task作成前にmodel／reasoningを選択し、作成後に実行設定を確認する。確認できない場合は未確認として報告する。

固定ルール:
- 過去チャットの要約だけを正本にしない。
- 原則として1セッションで1マイルストーンだけを進める。
- mainへ直接pushしない。
- secret、共有トークン、個人情報、実ユーザー操作内容をdocs、ログ、PRへ入れない。
- production反映、DB migration、課金変更、AI API有効化、共有リンク公開はユーザー承認なしに行わない。
- 商用リリース前は、Astra highの親PMが変更の正当性、依存順、必要な品質ゲートを実SHAで確認すれば、ユーザーへの都度確認なしに通常のcommit、push、Pull Request作成・更新、mergeを行ってよい。商用リリース後は外部反映ごとにユーザーの事前承認を得る。承認待ちでは可逆的な差分・テストによる具体案の準備は可とするが、外部反映前に対象SHA／差分を提示し、未push成果物だけを残して終了しない。承認待ちが必要なら明示する。商用リリースの日時・識別子・根拠はIssue #70へ記録し、状態が不在または曖昧な場合は自動mergeしない。
- Chrome拡張を第一方式にしない。
- AI APIは初期OFF。
- UI、文言、docsは日本語専用。

実行:
- npm ci
- npm run check
- 必要な個別テスト
- git diff --check

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
- 最新head SHA、テスト結果、CI、レビュー、未解決threadを確認
- PR本文またはコメントとGitHub Issue #70の両方へ完了済み、未完了、ブロッカー、次の1マイルストーンを反映する。PR未作成などの例外はIssue #70へ理由と作成条件を記録する。
```

## 補足

PCの電源が切れていても作業させたい場合は、ローカルCodex DesktopではなくCodex Cloud、Codex web、またはGitHub Codespaces側でtaskを開始する。

ローカルにだけある未push変更はクラウド側の次セッションから確認できない。引き継ぐ必要がある変更は、安全なbranchへcommit・pushしてから終了する。
