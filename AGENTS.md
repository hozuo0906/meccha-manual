# AGENTS.md

このプロジェクトで作業するエージェントは、このファイルを最初に読んでください。

## 最重要ルール

- 実装前に関連する `FR/NFR/ADR/AC/Issue` と既存文書を確認する。
- 未決事項を推測で埋めない。必要なら `docs/09-delivery/open-questions.md` に登録する。
- 変更は小さく分ける。無関係な整形、改名、移動、リファクタリングを混ぜない。
- 新しい設計判断はコードコメントだけに残さず、ADRまたは `decision-log.md` に記録する。
- DB変更は、対象DBのmigration、テーブル定義、データ／認可境界、tenant越境・権限negative testを同じPRで更新する。
- D1変更では、D1 migration/schema、Worker認可、workspace固定query、D1制約、negative/mutation testを同じPRで更新する。移行前Supabase/Postgres baselineを変更する場合だけ、RLS方針とRLS testも同じPRで更新する。
- API、イベント、画面挙動の変更は対応する契約文書とトレーサビリティ表を同時更新する。
- 秘密値、共有トークン、個人情報、実ユーザーの操作内容をMarkdownやログへ記載しない。
- サブエージェントの生思考や会話全文は記録しない。結論、根拠、採否、リスク、未決だけを要約する。

## GitHub連携（恒久ルール）

- このリポジトリはChatGPT WorkのGitHub Appと連携済みであり、`origin`も `https://github.com/hozuo0906/meccha-manual.git` に設定済みとして扱う。
- `gh` CLIが現在のシェルで見つからない、または利用できないことだけを理由に、commit、push、Pull Request作成、レビュー対応、CI確認、マージ等のGitHub作業を停止しない。
- Pull Request、Issue、レビュー、コメント、チェック、マージ等は、利用可能なGitHub App連携を優先する。ローカル変更のcommitとpushには、既存のローカル`git`と`origin`を使用する。
- GitHub Appで対象操作が提供されない場合に限り、別の利用可能な連携手段またはローカル`git`で安全に代替できるか確認する。
- 作業をブロッカー扱いしてよいのは、実際の操作で認証失敗、権限拒否、保護ルール拒否、ネットワーク拒否等を確認し、利用可能な代替手段でも完了できない場合だけとする。
- `gh` CLIの未検出だけを根拠に、ユーザーへCLIの導入やGitHub再連携を依頼しない。

## セッション引き継ぎ（恒久ルール）

- 新しいセッションは、`docs/09-delivery/session-handoff.md` と GitHub Issue #70 `META: 開発現在地・セッション引き継ぎ` を確認してから作業する。
- 過去チャットの全文や要約だけを正本にしない。コード、文書、Issue、Pull Request、commit、CI、review threadの実状態と照合する。
- 原則として1セッションで1マイルストーンだけを進める。日付で区切る場合も、未検証の変更を完成扱いにしない。
- 実装前に、完了済み、未完了、対象Issue/branch/PR/head SHA、次の1マイルストーン、リスク、承認事項を整理する。
- セッション終了前に、可能な範囲でテスト、commit、push、Pull Request更新、Issue #70更新、次の1マイルストーンの明記まで行う。
- 毎日0時の独立セッションは `docs/09-delivery/daily-session-prompt.md` を使い、既定では読み取りと現在地整理だけを行う。

## プロダクト制約

- `めっちゃマニュアル` は日本人オフィスワーカー専用の業務手順書作成サービス。
- UI、文言、エラー、ヘルプ、テンプレートは日本語を基本とする。
- `ドキュメント` ではなく `手順書`、`キャプチャ` ではなく `操作を記録` を優先する。
- Chrome拡張を第一方式にしない。Cloudflare Browser Run + Live Viewを核にする。
- AI APIは初期OFF。初期実装で外部AI APIを呼ばない。
- 共有リンクはデフォルトOFF。公開、削除、権限変更、機密情報保存は暗黙実行しない。
- 個人利用ではなく、必ずワークスペース所属を前提にする。

## サブエージェント体制

- 親セッション: 要件、統合判断、品質ゲート、進行管理。
- コーディング担当: 実装。担当範囲を限定し、共有ファイルの同時編集を避ける。
- UIUX担当: 日本語業務UI、画面状態、アクセシビリティ、文言。
- テスト担当: 自動テスト、認証主体・tenant越境・role/status・ID差し替えnegative test、E2E、証跡。移行前Postgres baselineを変更する場合だけRLS negative testも担当する。
- 辛口レビュー担当: P0/P1リスク、セキュリティ、プライバシー、UX欠陥。
- リファクタリング/コードレビュー担当: 命名、定数、設定、責務分離、再利用性、依存方向。
- ドキュメント記録担当: 決定、採用/却下案、サブエージェント成果要約、未決事項。

## 実装loop

各Phaseは次の順序で進めます。

1. Scope Check
2. 実装
3. Automated Tests
4. リファクタリング/コードレビュー
5. Security/Privacy Review
6. Exploratory UX Review
7. Triage
8. 修正
9. Regression
10. Release Gate

P0/P1が残る状態では次Phaseへ進みません。

## Pull Request品質ゲート

- 変更後に自分で差分を読み直し、正常系・異常系・再送・途中失敗・権限境界を確認する。
- PRごとに `npm ci`、`npm run check`、必要な個別テスト、`git diff --check` を実行し、未実行テストと理由を隠さない。
- PRのマージ対象となる最新head commitに対してCodex Reviewを実行する。レビュー対象SHAとPR head SHAを照合する。
- Codex Reviewは指摘工程であり、修正完了を意味しない。指摘後は妥当性確認、修正、テスト、最新SHAへの再レビューを繰り返す。
- P0/P1が1件でも残るPR、未解決review threadが残るPR、必須CIが失敗・未実行のPRは完成扱いにしない。
- P2は原則修正し、残す場合は理由、影響、担当、期限をPRへ記録する。
- CI成功とレビュー完了を別々に確認する。古いSHAのCIやレビューを最新headの証跡へ流用しない。
- 外部環境や資格情報が必要で検証できない項目を成功扱いにせず、必要な環境、承認、暫定安全策を明記する。
- review threadは修正根拠とcommit SHAを返信してから解決し、単に表示を消す目的でresolveしない。

## コーディング規律

- 実装前に既存型、定数、類似処理を検索する。
- 新規依存、新規環境変数、新規状態、新規共通モジュールは勝手に追加しない。
- `utils.ts`、`helpers.ts`、`common.ts` へ責務不明の処理を集めない。
- 環境変数の読み取り窓口をサーバー側の1モジュールに限定する。
- booleanの増殖を避け、状態は列挙型と明示的な遷移表で扱う。
- 外部SDK型をドメイン層へ漏らさない。
- `domain` から Cloudflare、Supabase、Stripe をimportしない。
- Stripeの課金確定は署名検証済みWebhookを正とする。
- Browser Run処理は通常HTTP処理ではなく、ジョブ、期限、キャンセル、再試行、成果物、監査ログを持つ。

## 文書運用

- 文書は日本語、コード識別子は英語、日時はISO 8601で記載する。
- 文書状態は `Proposed`、`Accepted`、`Superseded` を使う。
- 正本の優先順位は `ADR/decision-log -> 要件/データ/API -> UX -> Issue -> subagent reports`。
- 正本間の矛盾を発見したら実装を止め、`open-questions.md` に登録する。
