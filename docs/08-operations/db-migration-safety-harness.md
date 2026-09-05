# DB migration安全ハーネス

Status: Superseded

実行禁止: ADR-0028、DEC-064、Issue #176により、本書は移行前Supabase/Postgres/RLS migration baselineである。新規Supabase project/user/secret、migration、remote write、live workflow、staging合格証跡の根拠にしない。後継は`d1-and-storage.md`とIssue #176 M2/M4。既存SQLへの静的安全検査だけはM6まで維持する。

## 目的と境界

migrationファイルの静的確認、適用前判断、適用後検証を分けます。このハーネスはDBへ接続せず、Secretを読み取らず、migrationを実行しません。

既存 `npm run migrations:check` は現在のPhaseで必須のDDL、RLS、hardening statementを検査します。追加する `npm run migration:safety:check` は全migration共通の命名、危険構文、適用ゲート文書を検査し、役割を重複させません。

## 適用前チェック

1. 対象環境、project ref、現在のmigration履歴を画面上で相互確認する。値をログへ転記しない。
2. 適用対象ファイルとchecksumを確定し、適用済みファイルの書き換えがないことを確認する。
3. DDL、既存データ影響、lock時間、RLS、関数権限、rollbackまたはforward-fixをレビューする。
4. 新規テーブルはRLS有効化とdeny-by-default policyを同じPRに含める。
5. backup取得方法とrestore手順を確認する。backup実行自体は別承認とする。
6. stagingへ承認後に適用し、RLS negative test、smoke test、監査確認を実行する。
7. productionはstaging合格証跡、P0/P1 0件、rollback判断者、ユーザー承認が揃うまで適用しない。

## 静的拒否

自動検査では次を拒否します。

- migrationファイル名の重複timestamp、規則外ファイル名。
- `DROP DATABASE`、`DROP SCHEMA`、`TRUNCATE`。
- RLSの無効化。
- public/anonへの包括的な権限付与。
- production接続コマンド、DB URL、password、secretの混入。

必要な破壊的変更がある場合は検査を迂回せず、専用ADR、影響範囲、backup/restore、段階的移行、ユーザー承認を追加して検査規則を明示的に更新します。

## RLS negative test

- anon、未所属、別workspace、viewer、editor、admin、ownerの拒否/許可を対にする。
- 同一APIのアプリ認可とDB RLSを別々に検証する。
- `workspace_id`、所有者、作成監査項目、公開状態の差し替えをnegative testへ含める。
- Storage/R2ではDBメタデータ越境と短命URL発行拒否を確認する。
- 実DB testはstaging migration適用の承認後だけ行い、productionでテストデータを作らない。

## 適用後チェック

- migration履歴、対象テーブル、RLS有効化、policy、関数権限を確認する。
- smoke testとRLS negative testの結果をPRまたはリリース記録へ要約する。実データやSecretは載せない。
- 失敗時は追加変更を止め、rollbackまたはforward-fixの承認を得る。

## 承認ゲート

staging適用、production backup、production適用、rollback/restoreはそれぞれ外部変更です。production適用はGitHub Environment `production` のrequired reviewersとユーザーの明示承認を必須にし、`main` マージだけでは開始しません。

## 完了条件

- `npm run migrations:check` と `npm run migration:safety:check` が成功する。
- staging/productionの適用証跡とRLS negative test項目が定義される。
- 実DB接続、migration適用、Secret取得を行っていない。
