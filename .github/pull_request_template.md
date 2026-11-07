# Pull request

## 目的

<!-- 何を達成するPRかを1文で書く -->

## 変更内容

-

## 非対象

-

## 関連文書

- FR/NFR:
- ADR:
- Issue:
- Test/AC:

## 確認したこと

<!-- scripts/check-quality-loop.mjsとの互換識別子: サブエージェント品質loop。担当別attestationは不要。Codexが自己レビューし、Museが設計・指示・進捗管理・検品を行う。 -->
<!-- 最新SHAのレビューは、現行Latest Review Gateが検証するCodex Review証跡を残す。監督側の検品だけでAPIの証跡確認を代替しない。 -->

- [ ] AGENTS.mdを確認した
- [ ] 自己レビューを実施した
- [ ] npm ciを実行した
- [ ] npm run checkが成功した
- [ ] git diff --checkが成功した
- [ ] 必要な個別テストが成功した
- [ ] 最新コミットに対してCodex Reviewを実行した
- [ ] P0が0件である
- [ ] P1が0件である
- [ ] P2の対応状況を確認した
- [ ] 未解決review threadが0件である
- [ ] マージ対象SHAとレビュー対象SHAが一致している
- [ ] 未実行テストと理由を記載した
- [ ] 秘密値・個人情報・本番設定を含んでいない
- [ ] production変更を含んでいない
- [ ] 関連する要件、ADR、API、テーブル、テスト文書を確認した
- [ ] 仕様変更がある場合、docs/09-delivery/decision-log.md またはADRを更新した
- [ ] DB変更がある場合、対象DBのmigration、テーブル定義、データ／認可境界、tenant越境・権限negative testを更新した
- [ ] D1変更がある場合、D1 migration/schema、Worker認可、workspace固定query、D1制約、negative/mutation testを更新した
- [ ] 移行前Supabase/Postgres baselineを変更した場合だけ、RLS方針とRLSテストを更新した
- [ ] API/イベント変更がある場合、契約文書を更新した
- [ ] 生思考や会話全文をPR、docs、ログへ記録していない
- [ ] secret、共有トークン、個人情報、実ユーザーの操作内容を含めていない
- [ ] P0/P1リスクが残っていない

## テスト

-

## ロールバック

-
