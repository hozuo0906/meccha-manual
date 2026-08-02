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

- owner/admin/editor/viewer の権限テストが通る。
- 別ワークスペースのデータを読めない。
- secretsがクライアントへ出ていない。
- P0/P1が0件。
- サブエージェント品質loopの要約がPRに残っている。

## 現在の判断

Phase 1本番開発はまだ開始しない。

このPRの目的は、着手前の確認ゲートを固定すること。ゲートmerge後、親セッションはユーザーに明示承認を求める。
