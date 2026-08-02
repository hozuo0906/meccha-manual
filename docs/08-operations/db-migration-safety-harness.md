# DB migration安全ハーネス

Status: Accepted

## 目的

migrationを唯一のDB変更経路とし、適用前に構文・順序・RLS・破壊性・rollback/roll-forwardを確認する。既存の `scripts/check-migrations.mjs` はSQL内のsecret断片、作成tableのRLS有効化、Phase 1/2の必須hardeningを静的検査する。本ハーネスはそれを置き換えず、外部DB適用の手順と承認を補完する。

## 作るもの

- `npm run migrations:check` による既存の静的preflight
- PRでの対象migration、table definition、RLS方針、RLS test、API/イベント契約の同時差分レビュー
- 対象環境、migration一覧、backup/復旧点、lock/所要時間、互換性、実行者、承認者を記録する適用計画
- staging適用後のschema差分、smoke test、RLS negative test、監査証跡
- productionのGitHub Environment手動gateと、失敗時の停止・roll-forward手順

## 適用前チェック

1. ファイル名が時系列で一意で、既適用migrationを書き換えていない。
2. 新規tableはRLS enabledかつdeny-by-defaultで、anonymous、別workspace、低権限roleのnegative testがある。
3. drop/rename/type縮小、NOT NULL追加、大量更新、長時間lock、関数の `security definer`、権限grant/revokeを人手で特記する。
4. expand/contractを優先し、旧アプリとの後方互換と再実行/部分失敗時の扱いを確認する。
5. table definition、ERD/RLS方針、受入条件、migration checkを同じPRで更新する。
6. secretや実データをSQL、ログ、証跡へ含めない。

## RLS negative test方針

stagingでanon、未所属user、別workspace member、viewer/editor/admin/ownerの許可・拒否をanon keyと各ユーザーJWTで確認する。`service_role` を合格根拠に使わない。読み取りだけでなくinsert/update/delete、識別子差替え、RPC execute権限、署名URL発行の境界を対象とする。テストデータ作成を伴う既存 `npm run test:rls` はremote write guardがあるため、静的な `npm run check` から自動実行しない。

## 必要な外部設定、まだやらないこと、承認

staging/productionを分離したSupabase project、環境保護、短命なmigration credential、backup/復旧手順が後続で必要である。今回はcredential登録、link、push、実DB migration、seed、データ修正を行わない。staging適用にも対象と影響を示した承認、production適用にはstaging証跡、P0/P1 0件、backup確認、GitHub `production` required reviewerの明示承認を必須とする。main mergeだけでproduction DBへ自動適用しない。

## 完了条件

静的checkが成功し、migration差分一式と適用計画がレビュー済みであること。外部適用段階ではstagingのschema差分、smoke、RLS negative testが成功して初めてproduction承認待ちとする。
