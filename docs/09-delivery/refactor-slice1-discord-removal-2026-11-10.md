# リファクタ スライス1: Discord interactions到達不能実装の撤去

Status: Accepted

- 対象: `codex/refactor-slice1-discord`、base／着手HEAD `2f863864be17b928f4e7f24650a0516d33f79704`（PR #300マージ直後）。開始時の作業ツリーはclean。
- 判断: DEC-118。監査メモ（2026-11-09）とY3事前確認を読み、現行コードの到達経路と全体参照を再確認した。
- 保存範囲: ユーザー指定によりcommit・push・PR作成なし。成果物は作業ツリーへ残し、監督へ引き継ぐ。

## 削除したもの

- Workerの到達不能なinteractions実ハンドラ、Ed25519署名・timestamp検証、allowlist判定、KV replay記録、危険語検知、コマンド解析、GitHub Issue作成、PR状態取得・マージ依頼記録、Discord followup。
- 上記専用の定数・型・ヘルパー。`index.ts` は750行削減。B4は署名生成・KV／D1／Queue等のfixture、入力別の重複ケース、自己検証mutationを除去した。
- `scripts/check-worker.mjs` の撤去実装の必須文字列と、`scripts/check-issue-codex-automation.mjs` の撤去PR処理の案内文検査。他の検査対象・承認文書・通知コードは維持した。

## 残したもの

- `DISABLED_CALLBACK_PATHS` と503スタブ。Stripe／Discordのexact POSTに `503 CALLBACK_MIGRATION_IN_PROGRESS`、従来の日本語message・no-storeを返し、別methodは405。コードは変更していない。
- `/health/config` の診断とそこで使用するCSV解析・unscoped設定判定。診断は設定有無を示し、callback利用可否を示さない。
- Discord通知workflow・スクリプト、手動専用の休眠コマンド登録、KV binding・env宣言。Y3同様、実KVデータは未確認で設定撤去はスライス3へ残す。
- B4の既存Access認証ケース、別ファイルの詳細Worker runtime／mutation試験。C1再実装時の署名・atomic receipt/work・recovery契約、OQ-031・Bypass OFFも維持する。
- DB／migration／D1／RLS／共有／認証／Phase 2振り分け順。画面資産は変更しておらず、`APP_ASSET_VERSION` は再計算・変更しない。

## 検証

確認日時: 2026-11-10T08:18:15+09:00（Asia/Tokyo）。Node `v24.22.1`、既設依存、制限付きローカル環境。着手HEADからの未commit差分を検証した。`--test` の集計はこの環境ではファイル単位になるため、必要箇所は同じファイルの直接実行でケース数と失敗理由を確認した。

| 検査 | 結果・根拠 |
|---|---|
| `npm run check` | **exit 1**、実行 `65503`。先行22 scriptは成功し、23番目の `test:d1-binding` で停止。全体成功とは扱わない |
| `node --experimental-strip-types tests/d1-binding.test.mjs` | 実行 `51903`、exit 1。2/3成功、Miniflare実binding試験1件は `listen EPERM 127.0.0.1`。Wranglerログ出力もread-onlyで拒否。実D1検証の成功へ読み替えない |
| `node --experimental-transform-types --test tests/callback-migration-boundary.test.mjs` | exit 0（tool chunk `d70104`）。直接実行 `9924` もexit 0、スタブ4組＋既存Access認証1件＝5/5、fail 0／skip 0 |
| `npm run worker:typecheck`、`git diff --check` | 実行 `44962`、両方exit 0 |
| `node --experimental-strip-types tests/worker-runtime.test.mjs` | 実行 `52784`、71/71、fail 0／skip 0／exit 0。phase1 callbackの有効署名・無署名・不正body・env欠落、副作用0、405／404、大body停止境界を維持 |
| `node --experimental-strip-types tests/worker-runtime-mutation.test.mjs` | 実行 `69098`、3/3、fail 0／skip 0／exit 0。既存の通常write Origin・JSON body上限のmutation試験 |
| 撤去シンボルの全体再検索 | 撤去前に62シンボルを個別 `rg -w` 全体検索。定義・実処理内参照と既存checkerのみで、外部呼出しなし。撤去後の同じ62名称の `rg -n -w -f <撤去名一覧> . --hidden -g '!.git/**' -g '!node_modules/**' -g '!.artifacts/**'` は0件、rg exit 1。文書・テスト・checkerも検索対象 |
| 削除限定の照合 | 着手HEADの `index.ts` に削除対象区間だけを適用した期待内容と作業ツリーがbyte一致。残したヘルパー・503応答・route・health・env宣言は変更なし。`index.ts` は2706→1956行、B4は251→48行 |
| 変更checkerの代表成功／失敗 | `/tmp` の隔離fixtureで両checkerの正常形exit 0と、残すべき必須文字列の欠落によるexit 1・期待理由を確認（chunk `887de8`）。本番コードやcheckerの検査構文・対象範囲は拡張していない |

### 全体check停止後の補足実行

全体checkで未到達だった32 scriptを別実行した（`28504` と `45635`）。25成功・7失敗。失敗のうち、今回変更した運用文書の「Workerの処理:」marker変更による `cloudflare-source-of-truth:check` 失敗は、markerを元のままに戻し、再実行exit 0（chunk `5814cb`）を確認した。初回の失敗を成功へ置換・合算しない。

残る6項目は以下のとおり。対象script／test自体は本スライスで変更していない。全体check・正式CIの成功にはならず、監督の実行環境で再確認が必要。

| 補足検査の失敗 | 切り分け結果 |
|---|---|
| `test:phase1-migration-bundle` | begin／commit／hash marker／migration包含のassertion失敗。generator単体を直接実行した別結果ではbegin 1・commit 1・hash 4・末尾commitを確認。wrapper失敗の原因は確定していない |
| `phase2:manual-core:evidence-verdict:test` | 直接実行で1/3成功・2失敗、`spawnSync /usr/bin/node EPERM` を確認 |
| `phase2:manual-core:timestamp:test` | 直接実行で1/2成功・1失敗。leap-day／UTC day-boundaryの受入assertion失敗。原因未確定 |
| `cloudflare:audit:check` | 直接の `tests/cloudflare-config-audit.test.mjs` で5/6成功・1失敗。CLIのauth不足表示が空出力となるassertion失敗。原因未確定 |
| `secrets:test` | 直接実行で0/13成功、scanner側の `spawnSync git EPERM` を確認。秘密値が検出されたことを示す結果ではなく、検査未完了 |
| `secrets:check` | `spawnSync git EPERM` により未完了。成功扱いにしない |

補足ではcloud manual／共有、D1 workspace checker、B4、workflow、migration静的検査、harness、通知・登録syntax、runtime boundary、Issue関連、品質・R2・readiness・環境分離・PR品質・encoding等は成功した。いずれも未変更機能の実環境受入を意味しない。

最終文書同梱後の検査（2026-11-10T08:19:24+09:00、実行 `49033`）はdocs 163文書、Cloudflare source-of-truth、encoding 442ファイル、`git diff --check` がすべてexit 0。最終62名称検索0件と禁止対象の差分なしも再確認した（chunk `b58204`）。これらを全体check成功へ読み替えない。

### 自己レビューと未検証

- 署名検証・allowlist・replay・副作用の撤去対象はすべて到達不能で、route側の停止境界を変更していない。削除区間以外の実行コードがbyte一致することと、既存runtime試験で異常系・再送の入口停止を確認した。
- 稼働中の通知経路、休眠登録、設定・DB・認証・共有・Phase 2振り分け、画面資産は差分なし。新規依存・環境変数・状態・DB判断はない。`APP_ASSET_VERSION` は変更なし。
- ブラウザによる新規UX検証、remote資源・実KVデータ・CI／正式Codex Reviewは未実施。画面操作の変更はない。C1有効化やスライス3の設定撤去判断は本スライスへ持ち込まない。


## 文書同期と引き継ぎ

ADR-0012は実処理が現存する前提だけをPartially Supersededにし、ADR-0014、API、外部連携、Discord運用・登録手順、環境変数台帳、テスト戦略、トレーサビリティとDEC-118を同期した。将来契約は保持し、現在の稼働機能との区別を明記した。

Issue #70はGitHub Appでread-only取得した。今回の専用Issue／PRは作成しない。外部書込みは監督の範囲でありIssue #70は今回の成果へ未同期。次の1マイルストーンは監督による差分検品、commit・push・PR作成、対象SHAのCI／正式Codex Review／thread・品質ゲート照合。staging／production反映、callback再実装・有効化は行っていない。

## 監督再検証（2026-11-10、Muse）

Codex のサンドボックスで残った補足検査の失敗6項目を、監督環境で再実行した。timestamp 2/2、cloudflare-config-audit 6/6、phase1-migration-bundle OK、B4境界 5/5、worker:typecheck 成功、`npm run check` 全体も exit 0。あわせて main のクリーンツリーでも同3項目が成功することを確認した。以上から、失敗はサンドボックスの spawn/listen EPERM 系の環境要因であり、本スライスの変更による退行ではないと判断する。
