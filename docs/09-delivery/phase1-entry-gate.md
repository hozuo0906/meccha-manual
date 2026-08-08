# Phase 1 entry gate

Status: Ready for owner approval

## 目的

Phase 1の本番開発へ入る前に、認証、ワークスペース、RLS、テスト、承認条件が揃っていることを確認する。

## 対象

Phase 1で扱うもの:

- Cloudflare Pages/Workers構成
- Supabase Auth
- ワークスペース
- メンバー
- owner/admin/editor/viewer
- RLS
- アプリシェル
- ナビ
- 基本レイアウト
- 環境変数台帳
- feature flag台帳

## 着手条件

- `npm run check` が成功している。
- `phase1-readiness:check` が成功している。
- `test:rls` の手順と必要環境変数が文書化されている。
- `SUPABASE_SERVICE_ROLE_KEY`、DB password、JWT Secretを使わない。
- R2 bucketやBrowser RunなどPhase 1の非対象は実装しない。
- production反映、DB migration新規適用、課金変更、AI API有効化、共有リンク公開をしない。
- ユーザー承認を受けてから本番開発へ入る。

## 合格条件

- FR-001、FR-002、FR-003がSCR-LOGIN、SCR-WORKSPACE、SCR-MEMBERS、SCR-SHELL、API、RLS、ACへ追跡できる。
- ログイン、ログアウト、期限切れ、再ログインを検証し、401、接続切断、サーバー失敗を同じ表示にしない。
- owner/admin/editor/viewer の権限テストが通る。
- 別ワークスペースのworkspaceとworkspace_membersをAPIとDBのどちらからも読めず、変更できない。
- activeな最後のownerを停止、削除、降格できない。
- 各Phase 1画面の空、読込、保存、失敗、権限不足、接続切断、期限切れ状態を検証する。
- キーボード、フォーカス、ラベル、状態通知、200%ズーム、44px操作領域を含むアクセシビリティ確認が完了している。
- secretsがクライアントへ出ていない。
- P0/P1が0件。
- サブエージェント品質loopの要約がPRに残っている。

## 現在の判断

Phase 1本番開発は、ユーザーの明示承認後に小分けIssueで開始する。リポジトリに存在するハーネス、migration、検査スクリプトは、外部Supabase環境へのmigration適用や動的テスト完了を意味しない。

このPRの目的は、着手前の確認ゲートを固定すること。ゲートmerge後、親セッションはユーザーに明示承認を求める。
