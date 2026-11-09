# アーカイブ済み一覧・復元導線の実装前調査（DEC-117）

Status: Accepted

第1・第2ラウンドの記録は履歴として保持する。現在の成果物・検証・残作業は末尾の「第3ラウンドの再開・完了確認」と「未完了・引き継ぎ」を正とする。

確認日時: 2026-11-09T09:57:36+09:00（Asia/Tokyo）。branch `codex/archived-list-entry-20261109`、base／着手HEAD `9621b5bf55e01588ca65c2ee83810c1dbff5c796`。開始時clean。GitHub AppでPR #299のmergedとmerge commitの一致、Issue #70本文・最新コメントを確認した。

## 結論と停止理由

監督のDEC-117判断はdecision-logへ記録した。通常一覧からアーカイブ済みだけの一覧へ進み、既存詳細・復元UIへ接続する方針は確定している。一方、今回の指示は「新規migrationは追加しない。DB変更が必要と判断した場合は実装を止めて、その理由を報告に書くこと」と定めている。既存DBの取得境界により、Workerとapp UIだけでは実現できないため製品実装を停止した。

## 確認した根拠

- `supabase/migrations/202608020001_phase2_manual_core.sql`の`manuals_select_members`（920行以降）は、`archived_at IS NULL AND is_workspace_member(...)`だけをSELECTに許可する。専用queryへ`archived_at=not.is.null`を指定しても、既存session／RLSのままではアーカイブ済みを取得できない。
- `supabase/migrations/202608180001_phase2_manual_publication.sql`の`get_manual_edit_detail`は`SECURITY INVOKER`であり、47行の`m.archived_at IS NULL`でも除外する。通常詳細のRPCをそのまま呼んでもarchived詳細は返らない。
- `supabase/migrations/202608180002_phase2_manual_archive.sql`の`manual_revisions_select_members`と`manual_steps_select_members`も、親manualの`archived_at IS NULL`を必須とする。詳細本文を既存tableから取得する案にも同じ制約がある。
- `apps/worker/src/manual-router.ts`の`supabaseFetch`は利用者のaccess tokenとanon keyを使う。既存認可を迂回する資格情報や経路を追加する判断はしていない。
- PR #299の`202608180003_phase2_manual_restore.sql`は`restore_manual`だけを追加し、取得RPC・RLSは変更していない。復元操作の存在と通常UIからの到達可能性は別である。

## 今回の変更と未実施

DEC-117、OQ-028とsession-handoffだけを本報告と同期する。API／UI挙動・asset・D1・Supabase schema／migration／RLSを変更していないため、APP_ASSET_VERSIONの再計算は不要。新規依存・環境変数もない。

一覧・専用詳細・UI導線の追加テストは未実装。既存テストの成功を新機能の受入証跡にしない。実DB・remote環境の検証も実施していない。

## 検証結果

- `node --experimental-transform-types --test tests/manual-api.test.mjs tests/manual-edit-api.test.mjs tests/manual-editor-ui.test.mjs`（実行90761）はexit 0。この環境ではrunnerの集計がファイル単位の3/3となったため、各ファイルを`node --experimental-transform-types <対象ファイル>`でも実行し、manual-api 18/18、manual-edit-api 64/64、manual-editor-ui 14/14、計96件・fail 0／skip 0を確認した。
- `npm run check`（実行49171）はexit 1。`test:d1-binding`のMiniflare起動で停止した。同じファイルの直接実行38816は2/3成功・1失敗で、失敗理由は`listen EPERM: operation not permitted 127.0.0.1`。Wranglerログ先のread-onlyエラーも出た。権限昇格不可の環境制約であり、全体check成功とは扱わない。停止以降の検査は未実行。
- API／UIとDBの実装差分は0。テスト目的で既存の認可・DB・環境設定を変更していない。正式Codex Review・CI・ゲートは監督側へ引き継ぐ。
- 最終文書検査はdocs 162件、encoding 438件と`git diff --check`が成功。secret checkerは子processの`spawnSync git EPERM`で停止し未合格。変更4文書を目視確認し、秘密値・個人情報は追加していない。

## 保存環境の制約

元クローンの`git add`は`.git/index.lock`のread-only拒否で失敗したため、差分を破棄せず`/tmp/mm-dec117-save-20261109`へ同じ4文書を保全してcommitした。git pushはegress proxyへの接続拒否で失敗。GitHub AppのPR作成・Issue #70コメントは「承認が必要だがapproval policyがnever」のため拒否され、ghのPR作成もproxy socketのoperation not permittedで失敗した。gh認証も無効と確認している。

remote保存・remote SHA一致・PR番号の取得・Issue #70更新は未完了であり、同期していない。一時クローンのcommitに加え、元クローンの`.artifacts/dec117-handoff-20261109.bundle`へbaseからの4文書差分commitを保全する。元クローンのHEADはbaseのまま、4文書の未commit差分を保持する。最終commit SHAとbundle検証結果は最終報告に記載する。ネットワークとGitHub書込みが可能な環境でbundleを取り込み、同名branchへpushして文書Draft PRを作成する必要がある。

## 次の1マイルストーン

監督がレガシー専用一覧・詳細取得に必要なDB変更範囲を判断し、migrationを含む実装の再指示を行うこと。通常一覧・詳細の非表示を維持した専用取得契約、認証・workspace・role境界、RLS／RPCのnegative testを同じ変更で確定する。その後にDEC-117のAPI／UI・トレーサビリティ同期と一覧から既存復元までの回帰を実装する。D1側の復元・専用取得入口と物理削除・自動削除は未決のまま維持する。

本PRは停止理由と決定の引き継ぎであり、機能完成PRではない。merge・deploy・正式Review／ゲートは監督側で行う。保存・報告後は終了し、自律監視・終了後の継続実行は登録しない。

## 第2ラウンドの実施・再開後確認（2026-11-09）

確認日時: 2026-11-09T20:45:02+09:00（Asia/Tokyo）。branch `codex/archived-list-entry-20261109`、ローカルHEADは`9621b5bf55e01588ca65c2ee83810c1dbff5c796`のまま。成果物状態はローカル修正済み・未push。第1ラウンドの文書差分とbundleは保持している。上記の停止理由・保存方針は第1ラウンドの履歴であり、以下を現在の実施内容とする。

監督は専用読み取りRPCのmigration追加を許可し、既存RLSを変更しない方式を指定した。再開後のユーザー指示は、UIテストの期待修正・asset version照合・本報告とDEC-117の追記・指定テスト再実行の4点に限定された。commit／push／PR作成は行っていない。

### 作業ツリーにある実装

- `202608180004_phase2_archived_manual_read.sql`に`list_archived_manuals`と`get_archived_manual_detail`を追加した。`SECURITY DEFINER`内部でcallerの認証、activeなworkspace所属とowner/admin/editor/viewerを照合する。対象はworkspace固定かつ`status = 'archived' AND archived_at IS NOT NULL`だけ。通常のSELECT RLSと`get_manual_edit_detail`は不変で、テーブル・列の追加はない。方式の根拠とEXECUTE制限はDEC-117に追記した。
- Workerは`GET /api/workspaces/{workspaceId}/manuals/archived`と`GET /api/workspaces/{workspaceId}/manuals/archived/{manualId}`から専用RPCを呼ぶ。既存access tokenとanon keyを使い、workspace・archived状態・応答形式を検証する。一覧は既存の件数整合・上限検査を維持する。
- app UIに通常一覧とアーカイブ済み一覧の切替、専用詳細への接続を追加した。archived詳細は既存の閲覧表示と復元確認を使い、編集操作を表示しない。復元成功時は通常一覧を再取得する。pending createの照合はactive scopeだけで行う。

### 再開後の修正と検証

- `tests/manual-editor-ui.test.mjs`の失敗1件は旧ソース形状への期待が原因だった。取得前と応答後のpending create照合をactive scopeに限定する両方の期待へ更新した。完了後の削除にもactive条件が必要なことを検証し、検査範囲を`loadManuals`関数内へ限定した。既存の入力保持・失効時拒否・競合後再取得の検証は保持した。
- 既存`tests/worker-runtime.test.mjs`と同じく、APP CSS／JS、cloud manual CSS／JS、editor tools JS、onboarding CSS／JSをNUL区切りでSHA-256計算した。旧`sha256-633f1b324e58afa1`は不一致だったため、`sha256-e023b3435ca27760`へ更新した。既存asset version照合テストの個別実行`21394`はexit 0。
- manual系3ファイルをそれぞれ`node --experimental-transform-types --test <対象ファイル>`で実行し、すべてexit 0。この環境の`--test`集計は各ファイル1件のため、同じファイルを`node --experimental-transform-types <対象ファイル>`でも個別実行し、下表のケース数を確認した。

| 対象 | 実行ID | 結果 |
| --- | --- | --- |
| `tests/manual-api.test.mjs` | `19604` | 30/30、fail 0、skip 0 |
| `tests/manual-edit-api.test.mjs` | `5148` | 75/75、fail 0、skip 0 |
| `tests/manual-editor-ui.test.mjs` | `13572` | 14/14、fail 0、skip 0 |
| `npm run worker:typecheck` | `68005` | exit 0 |

上表は報告・DEC-117の追記後の最終再実行。文書検査`77368`もdocs 162件、encoding 439件、`git diff --check`すべてexit 0。

合計119件成功。Workerテストはmockした上流応答を使う検証であり、実DBのRPC／RLS認可や実ブラウザでの一連の到達確認を代替しない。第1ラウンドの`npm run check`はMiniflareの`listen EPERM`で失敗した履歴がある。今回の再開では全体checkを再実行せず、指定対象の直接実行と型チェックを確認した。全体check成功とは扱わない。

## 第3ラウンドの再開・完了確認（2026-11-10）

確認日時: 2026-11-10T00:01:08+09:00（Asia/Tokyo）。`.git/HEAD`とbranch refの読取りでbranch `codex/archived-list-entry-20261109`、ローカルHEAD `9621b5bf55e01588ca65c2ee83810c1dbff5c796`を確認した。Issue #70はGitHub Appでread-only取得した。PR headは未確認。接続エラーで停止した第3ラウンドの途中成果を引き継ぎ、今回の実行状態は終了、成果物状態はローカル修正済み・未push（下記指定検査は検証済み）とする。

- 再開時点で専用読み取りSQLテスト、workflowのpath登録・migration適用・SQL実行配線、checkerの両endpoint登録が存在した。契約文書とOQ／handoffには旧停止状態が残っていたため、API両endpoint・専用RPC、setup・テーブル定義の認可、UX・RLS方針、トレーサビリティ、OQ-028・DEC-117・handoffを現状へ同期した。
- `tests/sql/phase2-archived-manual-read-test.sql`は9つのDOブロックを持つ。editor／viewerの閲覧、非member・未認証・workspace越境・archive状態不整合の拒否、current draft優先／published fallback、step順序・削除済み除外、通常SELECTの非表示維持、EXECUTE権限を検査する。これはテスト内容の静的確認であり、実DB実行成功を示さない。
- fixtureは着手HEADの同一ファイルをGitHub Appで取得して比較し、変更が`manuals.folder_id uuid`の1列追加だけであることを確認した。`list_archived_manuals`のSELECTが`m.folder_id`を参照するため、従来の縮小fixtureのままでは関数定義時に列不存在となる。実製品の`202608020001_phase2_manual_core.sql`にある既存nullable uuid列への整合に必須のため保持した。RPCの戻り型（statusのtext cast、UUID pointer、timestamptz）と、SQLテストのrevision／step列・enum値もfixtureに一致することを確認した。既存fixtureのRLS・権限・assertionは変更していない。
- `.artifacts/dec117-handoff-20261109.bundle`は第1ラウンドの文書だけを含む旧保全物で、現行実装の引き継ぎ成果物ではないため、今回の明示指示に従い削除した。上記の旧保存方針は履歴であり、このbundleの使用は引き継がない。
- 再開時のhashと再照合し、Worker実装・既存テスト・Supabase migration（`202608180004`を含む）・D1 migrationに今回の変更がないことを確認した。既存RLS、通常一覧・詳細、D1側、新migration自体の修正やテストの弱体化は行っていない。commit／push／PR操作は行わず、Gitコマンドは指定の`git diff --check`だけを実行した。

### 自己検証

指定の`--test`個別実行はすべてexit 0。この環境では各ファイルを1件と集計するため、同じファイルの直接実行で内部ケース数も確認した。fail 0／skip 0、計119件成功。

| 対象 | 実行ID | 結果 |
| --- | --- | --- |
| `node --experimental-transform-types --test tests/manual-api.test.mjs` | `61016` | 1/1ファイル成功。補助の直接実行`23677`で30/30 |
| `node --experimental-transform-types --test tests/manual-edit-api.test.mjs` | `72562` | 1/1ファイル成功。補助の直接実行`22805`で75/75 |
| `node --experimental-transform-types --test tests/manual-editor-ui.test.mjs` | `4507` | 1/1ファイル成功。補助の直接実行`98835`で14/14 |
| `node scripts/check-phase2-manual-edit-api.mjs` | `8bf8db`（chunk） | exit 0 |
| `npm run worker:typecheck` | `87222` | exit 0 |
| `npm run docs:check` | `16181` | exit 0、162文書 |
| `npm run encoding:check` | `25298` | exit 0、440ファイル |
| `npm run migrations:check` | `35668` | exit 0、13 SQLファイル |
| `npm run migration:safety:check` | `78970` | exit 0、13 SQLファイルの静的検査。DB接続なし |
| `git diff --check` | `27382` | exit 0 |

報告書・handoffの最終編集後も文書・文字コード・diff検査を再実行し、その結果を最終報告に記載する。

### 未完了・引き継ぎ

- SQL negative testとworkflow配線は追加済み、契約同期も完了した。SQL実DB実行は今回の指示により行わず、監督へ引き継ぐ。非active所属の拒否を含む関数内認可の実DB確認と既存restore SQLのviewer復元拒否も未検証のまま。既存テストや静的検査の成功をDB境界の成功に読み替えない。
- 実ブラウザでの通常一覧→アーカイブ済み一覧→専用詳細→復元の通し検証、remote migration適用、CI、正式Codex Reviewは未実施。static／VM UIテストは実ブラウザ受入の代替ではない。
- ユーザー指示でGit操作を行わず、今回の成果はこのクローンの作業ツリーに保持する。GitHub保存・Issue #70更新・PR headとの照合は未実施で、監督側へ引き継ぐ。旧bundleは削除済み。
- 次の1マイルストーンは、監督による専用読み取りSQLの実DB実行とUI通し検証、および対象SHAの保存・CI／正式Review・品質ゲートの確認。今回の再開指示範囲は検証済みだが、機能全体の受入完了ではない。D1の復元／専用取得入口と物理削除・自動削除は引き続き未決。終了後の継続実行・自律監視は登録しない。

## 監督の実DB検証で判明したSQLテスト前提の修正（2026-11-10）

監督のローカルPostgres 16で、CI順序のfixture→migration 8本（`202608180004`を含む）→http／publication／archive／restoreのSQLテストはすべて成功したが、新しい専用読み取りテストのeditor一覧断定で失敗したとの報告を受けた。先行archiveテストはrollbackせず、fixtureの手順書`33333333-3333-4333-8333-333333333333`をworkspace Aのarchivedとして残すため、一覧がこのテストの自作1件だけであるという完全一致の前提が誤っていた。RPCの不具合ではなく、共有DBに残る既存スイートのデータを考慮していなかったテストの問題である。

`tests/sql/phase2-archived-manual-read-test.sql`のeditor／viewerの完全一致断定を、自作archived手順書`d1170001`の包含、禁止対象`d1170002`〜`d1170005`の除外、返却全行がworkspace Aかつ`status = 'archived'`かつ`archived_at IS NOT NULL`であることの合算へ置き換えた。editorの既存不変条件検査は統合し、workspace／statusのNULLも拒否する。workspace Bの`count = 1`、他のケース・詳細・特権検査、rollback構造は維持し、migrationや他の実装は変更していない。

確認日時: 2026-11-10T05:48:00+09:00（Asia/Tokyo）。ローカルHEADは`9621b5bf55e01588ca65c2ee83810c1dbff5c796`。自己検証は`git diff --check`（chunk `b7b97d`）と`npm run docs:check`（chunk `a0c386`、162文書）がともにexit 0。着手時の内容との比較（chunk `813a33`）でも変更は指定の2ファイルだけで、SQLの2箇所の一覧断定以外は不変と確認した。成果物はローカル修正済み・未push。SQL再実行は指示どおり行わず、修正後の実DB成功・CI・正式Reviewは未確認である。次の1マイルストーンは監督によるCI順序でのSQL再実行とし、既存の作業ツリー差分は保持する。
