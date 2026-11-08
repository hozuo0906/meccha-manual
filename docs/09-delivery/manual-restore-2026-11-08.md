# 手順書のアーカイブからの復元（2026-11-08）

Status: Accepted

branch: `codex/manual-restore-20261108`。base／着手HEAD: `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`。

## 対象と決定

[ADR-0042](../03-architecture/adrs/ADR-0042-manual-restore-from-archive.md)をAccepted（2026-11-08）として追加した。status=archivedかつarchived_atありの手順書を、owner/admin/editorがCAS付きRPCで復元する。最新manual.archived監査のpreviousStatus（draft/reviewing/published/stale）へ正確に戻し、監査なし・欠落・不正・同時刻の矛盾は拒否する。削除が無効の間は無期限保持・復元期限なし。manual.restoredを監査し、revision・手順・asset・共有リンクは変更しない。失効済みリンクは失効のまま、未失効かつ期限内のリンクは再び有効になる。

物理削除・自動削除は有効化していない。破壊的操作であり、復元可能性の確保が削除設計の前提条件だったため、復元を先に受け入れた。猶予期間・参照削除順序・監査保持・再試行はOQ-028と別ADRへ残す。アーカイブ実装、RLSポリシー、D1、共有リンク実装は変更していない。

## 変更ファイル

| ファイル | 要点 |
|---|---|
| `docs/03-architecture/adrs/ADR-0042-manual-restore-from-archive.md` | 復元の対象・状態・権限・保持・CAS・参照・監査と物理削除の境界 |
| `docs/03-architecture/adrs/README.md` | ADR-0042を一覧へ登録 |
| `supabase/migrations/202608180003_phase2_manual_restore.sql` | SECURITY DEFINERのrestore_manual、認証・workspace・role・FOR UPDATE・CAS・監査検証、authenticatedだけにexecute |
| `tests/sql/phase2-manual-restore-test.sql` | 既存disposable fixtureに合わせた状態／監査／CAS／権限／tenant境界のSQL回帰 |
| `.github/workflows/manual-edit-api.yml` | migration適用とarchive回帰後のrestore SQL実行、paths登録（OAuthトークンにworkflowスコープがなくpushが拒否されたため、別branch `codex/manual-restore-ci-20261108` のcommitとして用意し、スコープ付き認証情報でのpush待ち） |
| `apps/worker/src/manual-edit-router.ts` | POST restore、入力制限、認証／same-origin、409競合／状態不明、日本語案内と結果不明／利用不可分類 |
| `apps/worker/src/app-assets.ts` | archived詳細の復元節・確認・再読込、編集禁止、busy対象。共通hash方式でAPP_ASSET_VERSIONをsha256-5a26091b9408e765へ同期 |
| `tests/manual-edit-api.test.mjs` | 14件追加。成功、RPC引数、viewer・非member・認証・Origin・method・入力・RPC拒否・結果不明／利用不可 |
| `tests/manual-editor-ui.test.mjs` | 2件追加。archived編集禁止・権限別表示、確認／取消・CAS送信・一覧再取得 |
| `docs/04-data/data-lifecycle.md` | 復元有効化、無期限保持、共有再有効化、削除の保留 |
| `docs/04-data/table-definitions.md` | schema／RLS変更なしとRPC認可・監査metadataの境界 |
| `docs/04-data/phase2-manual-core-setup.md` | 適用順序とSQL CI実行方法、local checkの対象範囲 |
| `docs/05-api/phase2-manual-edit-api.md` | restore endpoint・入力・応答・拒否・結果不明と取得経路の制約 |
| `docs/02-ux/phase2-manual-editor-ui.md` | archived表示・確認文・成功／結果不明と専用入口の制約 |
| `docs/09-delivery/open-questions.md` | OQ-028の復元を解決し、削除と専用取得入口を未解決として保持 |
| `docs/09-delivery/decision-log.md` | main統合時にDEC-116へ繰り上げて受入を記録（当初DEC-112を予定したが、DEC-112〜115は先行PRで使用済み） |
| `docs/01-product/requirements-traceability.md` | FR-004へADR-0042と復元回帰を対応づけ |
| `docs/09-delivery/session-handoff.md` | ローカル保存範囲、証跡、制約と次の1マイルストーン |
| `docs/09-delivery/manual-restore-2026-11-08.md` | 本報告書 |

## 検証

- `npm ci`をclone作成時（mainの内容）に実行済み。その後 `npm run check` 全体が成功した（exit 0、最終leafのencoding:checkまで完走）。実行環境の断続的な書込み障害（EPERM）で一部のleafが当初失敗したが、失敗理由はすべてテスト内部のファイル書込みに対するEPERM／SQLITE_IOERR_WRITEであり、環境回復後の再実行で全leafが合格した。コード起因の失敗は観測されていない。
- 個別テスト: `node --experimental-transform-types --test tests/manual-edit-api.test.mjs` 64/64（復元の新規14件を含む）、`node --experimental-strip-types --test tests/manual-editor-ui.test.mjs` 11/11（復元の新規2件を含む）、いずれもskip 0。
- `git diff --check` 成功。
- SQL回帰は未実行（次節のとおり）。

## 未実行事項と制約

- SQL実行は未実施。ローカルにpsql／postgres／dockerがない。archive SQLと同じく`npm run check`はSQL実行を含まず、Manual Edit API CIのdisposable Postgresで実行する登録だけを行った。既存preflight/evidenceのarchive flowを復元の成功証跡へ置き換えていない。
- SQL回帰はdraft／published（実公開revisionの保持も確認）／reviewing／stale、manual.restored metadata、CAS拒否後の状態不変、viewer／非member／未認証／workspace不一致、未アーカイブ／二重復元、監査なし／不正最新監査／欠落値／同時刻矛盾、execute権限を対象にする。未実行なのでSQL成功とは扱わない。
- 通常の一覧・詳細はarchivedを返さない。RLSやアーカイブ取得境界を変えず、指定どおりarchived詳細の条件付き表示処理を追加した。通常UIから復元ボタンへ到達する専用取得入口は未決としてOQ-028へ記録した。このため通常UIでの利用完遂を確認済みとはしない。
- 対象は指定された移行前Supabase/Postgres baselineと既存app shell。D1の現行クラウド手順書UIへの移植は範囲外。
- 新しい画面の実browser操作、実共有URLの再有効化、remote DB migration、実SSO、staging／production反映は未実施。UI検証は合成データを使ったVM実行と既存asset runtime回帰。
- GitHub CI、正式Codex Review、PR head／thread照合はPR作成後に監督側のゲートで確認する。マージは行わない（監督側が検品後に行う）。
- workflowファイル（`.github/workflows/manual-edit-api.yml`）の変更は、OAuthトークンのworkflowスコープ不足でpushが拒否された（`refusing to allow an OAuth App to create or update workflow ... without workflow scope`）。変更自体はbranch `codex/manual-restore-ci-20261108` の単独commitとして用意済みで、workflowスコープ付き認証情報が使える時点でPR branchへ取り込む。それまでPR上のCIではrestore SQL回帰は実行されない。

## 判断した点

- 最新監査の選択はcreated_at DESC, id DESC。ただし同時刻でpreviousStatusが矛盾する場合は、UUIDの順序から実際の状態を推測せず拒否する。ADRとSQL回帰へ同時記録した。
- アーカイブ済み手順書の取得入口を自己判断で広げず、UI表示処理と取得経路の未決を区別した。既存の非表示・RLS維持という依頼の境界を優先した。
- SQL登録は実際にarchive SQLを実行するManual Edit API workflowへ追加した。別のpreflight evidence schemaやscannerは追加・一般化していない。

## ロールバック方法

配信前は復元の実装commitをrevertして再検証する。適用後は、復元UIとrouteを無効化し、必要なら別のforward migrationで`restore_manual(uuid, uuid, timestamptz)`のauthenticated executeをrevokeする。適用済みmigrationの書換えや監査削除は行わない。復元済みデータを一括で書き戻さず、必要な場合は既存アーカイブ操作を権限・CAS・監査付きで個別に行う。revision・手順・asset・共有リンクを削除しない。実環境でのrollbackは未実施であり、別release判断が必要。

## 保存と引き継ぎ

保存commitと次のマイルストーンは確定後に記録する。
