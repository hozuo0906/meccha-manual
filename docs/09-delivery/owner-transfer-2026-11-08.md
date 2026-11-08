# Teamの管理責任者移管 実施報告

Status: Accepted

## 対象と決定

2026-11-08、FR-003のstandard workspace管理責任者移管を実装する。branchは`codex/owner-transfer-20261108`、base mainは`ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`。開始時にlocal main／origin/main／HEAD一致とcleanを確認した。既に存在した指定branchも同じSHAであり、そのbranchを使用した。AGENTS、session-handoff、GitHub Issue #70をread-only確認し、DEC-045/046、D1/API契約、AC-007/008/009/014を照合した。

新決定はDEC-113（Accepted）。DEC-112は並行する復元PR #296が使用済み。DEC-045の専用移管未提供の部分だけを置換し、招待メールを送らない方針、参加コード同意、通常add/updateのowner拒否、last-owner保護を維持する。

## 変更ファイル

- `migrations/0009_d1_owner_transfer.sql`: permit tableと昇格trigger置換。
- `apps/worker/src/infra/d1/workspace-repository.ts`、`d1-errors.ts`: 専用batch、認可fence、エラー分類。
- `apps/worker/src/index.ts`: POST owner-transfer、既存owner拒否メッセージ。
- `apps/worker/src/app-assets.ts`: owner限定ボタン、対象・admin降格確認、既存排他・認証世代・一覧再照合。asset内容hash `sha256-0b329807fecbc143`へ更新。
- `tests/d1-workspace.test.mjs`、`m3-http-d1.test.mjs`、`d1-binding.test.mjs`、`app-auth.test.mjs`: 正常・権限・越境・rollback・SQL mutation・UI確認。
- `scripts/check-d1-workspace-boundary.mjs`: 新メソッドのSQL位置・workspace条件、置換後triggerのmutation対象を同期。従来の構文検査を維持し、workspace条件欠落の失敗例も検査。
- migration列挙同期: `tests/cloud-manual-c.test.mjs`、`product-auth.test.mjs`、`product-auth-browser.test.mjs`、`share-link-backend.test.mjs`、`office-auth-runtime-browser.test.mjs`（各tests配下）。
- `docs/09-delivery/decision-log.md`、本報告書、`session-handoff.md`、`docs/05-api/api-contracts.md`、`cloudflare-access-d1-api.md`、`docs/04-data/d1-workspace-schema.md`、`d1-and-storage.md`、`docs/01-product/requirements-traceability.md`、`docs/07-quality/acceptance-catalog.md`、`docs/02-ux/all-screen-quality-matrix.md`。

## 移管仕様と判断

active identityかつactive owner本人が、同じactive standard workspaceのactive identity・active membershipのadmin/editor/viewerを指定する。自己、既存owner、非メンバー、removed/invited、disabled、Personal Workspaceは拒否する。移管先をowner、元ownerをadminにする。owner以外にworkspace種別や対象状態を漏らさない。

permit発行→対象昇格→元owner降格→監査→permit削除を1回のD1 batchで行う。事前照会後にも認可と対象をSQLで再検証する。各DML直後のchanges() assertionは0件をSQL例外にし、batch確定前に全体rollbackを保証する。返却success・各DML runCount・直接件数を照合する。permitなし昇格はDB拒否、既存last-owner保護3triggerは無変更。permitはDB writerの信頼境界内に置き、HTTPへ公開しない。

監査actionは既存CHECK閉集合の`member.updated`、target_application_idは新owner、actorは元owner、metadataは既存AUDIT_METADATAを使う。table再構築やaction追加を避ける判断であり、専用actionによる移管識別は提供しない。メール・Product Event・外部API・新依存・環境変数は追加しない。

UIはDEC-046のconfirm流儀で対象と自身のadmin降格を確認する。共通メンバー変更処理による保存中排他、認証世代照合、遅着破棄を使い、成功・競合・結果不明時は一覧を再取得する。自動再送しない。

## テスト結果

- repository（`node --experimental-strip-types tests/d1-workspace.test.mjs`）: 48/48、fail 0／skip 0。admin/editor/viewerからの実行拒否と各roleへの正常移管、正確に1人の有効owner、監査1件、permit除去、自己・既存owner・非メンバー・removed/invited・disabled・Personal・越境・旧owner再実行拒否を確認。batchの9途中位置の例外と、5段階それぞれの0件化で全体rollback。D1相当のwriter直列化で並行移管の1成功／1競合も確認。
- HTTP（`node --experimental-strip-types tests/m3-http-d1.test.mjs`）: 19/19、fail 0／skip 0。成功、エラー分類、対象の事前照会後変更、origin・service・未認証・越境拒否、下位例外の非露出。
- UI unit（`node --experimental-transform-types tests/app-auth.test.mjs`）: 130/130、fail 0／skip 0。確認・取消、owner限定、二重実行防止、結果不明時の一覧照合を含む。
- 実Miniflare D1 binding（`node --experimental-strip-types tests/d1-binding.test.mjs`、実行90232）: 3/3、fail 0／skip 0。移管、raw昇格拒否、降格0件時rollbackと既存migration／bootstrap回帰。
- 実Chromeの合成product session（`tests/product-auth-browser.test.mjs`、実行16144）: 10/10、fail 0／skip 0。既存Google/ChatGPT合成認証を含み、新規移管のconfirm取消→実POST→D1確定→一覧再取得→自身admin表示・ボタン消去を確認。外部実SSOへ換算しない。browserのD1 adapterはSELECT直接件数を返し、batchをBEGIN/COMMIT/ROLLBACK付き直列実行へ合わせた。UUID必須のメンバーAPIと一致する合成actorを使用。
- `npm run worker:typecheck`と`npm run worker:runtime:test`、`npm run d1:workspace:boundary:check`、`git diff --check`: 成功。runtimeは資産内容hash契約を含む。
- 全体`npm run check`（実行69446）: exit 0、56段階を完走。最終secret・encodingまで成功、失敗summaryなし。Worker typecheck/runtime、D1、HTTP、認証、既存cloud/share、境界mutationを含む。確認日時は2026-11-08T20:46:36+09:00（Asia/Tokyo）。

先行失敗は最終成功と区別する。sandbox内のD1 binding／初回全体checkはlocalhost待受けEPERMで失敗し、許可された環境で再実行した。全体checkの次回は既存境界checkerの旧メソッド終端・旧trigger位置の前提を検出して失敗し、今回のメソッドと0009の最終triggerへ追従する最小修正後に再実行した。UI追加テストの初回は一覧待機不足4件、移管browserの先行実行は専用Chromium起動要件と非UUID合成actorで失敗し、待機・既設通常Chrome・UUID fixtureへ修正して成功した。製品認可を弱めず、未実行を成功へ書き換えていない。最終文書追記後のsandbox内secret検査も子プロセスEPERMで失敗したため、許可された環境で最終文書・secret・encoding検査を再実行し、docs 156件・secret 471件・encoding 395件が成功した（実行83280、2026-11-08T20:48:32+09:00確認）。

## 自己レビューと検品範囲

差分を読み直し、正常・不正入力・権限・tenant・自己移管・Personal・disabled identity・移管後再送・競合・途中失敗・0件・結果不明を照合した。既存last-owner triggerと0001のaudit CHECK、Supabase/Postgres baselineは変更していない。UIは既存のpending mutation／session generationを再利用し、追加の永続状態・外部通信先を設けていない。合成product sessionを実Chromeで操作し、確認の取消と成功後の表示更新を検品した。自己レビューで未修正の欠陥は確認していないが、正式Codex Review／利用者受入の完了とは扱わない。

## 未実行事項

remote D1への0009適用、実SSO、staging/production反映、GitHub CI・正式Codex Review・PR作成は未実施。ユーザー指示によりpush・mergeは行わない。商用リリース状態は今回未確認であり、release完了を主張しない。

## ロールバック方法

未適用の開発環境では今回の機能commitをrevertする。適用後のcode rollbackは0009 schemaを残して旧Workerへ戻す手順を候補とし、旧add/updateのowner拒否と通常メンバー操作の互換性を環境で確認してから実施する。0009は既存table/actionを変更せずlast-owner制約を維持するが、remote rollback rehearsalは未実施。確定済み移管をrollbackしたcodeが自動で逆移管することはない。所有権を戻す場合も現在のownerが専用フローで明示実行する。

DB rollbackを行う必要がある場合は書込みを停止し、permit残存0件とbackup・状態を確認したうえで、承認済みforward migrationとして0001相当の全面昇格拒否triggerを復元する。適用済みmigrationを書き換えず、permit tableの削除やaudit変更は行わない。本セッションではremote操作を行わない。

## 保存と引き継ぎ

ユーザー指定に従い意味単位の2つのlocal commitへ保存する。API・D1・契約は`ecfe6f6bd10fc31aa356d73e187cc62d2206e8a8`、UI・browser／unit回帰・品質台帳・本報告書・checkpointは後続の本報告書を含むcommit。最終SHAは完了報告と`git log -2`で照合する。push・PR・Issue #70書込み・mergeは実施しない。remote SHA一致は未確認。実装担当は検証・commit後に終了し、終了後の継続実行・監視は登録しない。次の1マイルストーンはMuseによる最終local SHAの検品と、別途指示によるGitHub保存・最新SHAのCI／正式Review／thread照合、remote migration受入である。
