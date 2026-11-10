## 2026-11-10 DEC-118: Discord interactions到達不能実装の撤去

Status: Accepted

確認日時: 2026-11-10T08:18:15+09:00（Asia/Tokyo）。branch `codex/refactor-slice1-discord`、着手／ローカルHEAD `2f863864be17b928f4e7f24650a0516d33f79704`（PR #300後）、開始時clean。Issue #70はGitHub Appでread-only取得。ユーザー指定によりcommit・push・PR作成・Issue書込みは行わず、作業ツリーへ残す。成果物状態はローカル修正済み・未pushで、全体checkは不合格。今回はスライス1だけを対象とする。

- 到達不能なinteractions実処理と専用定数・型・ヘルパーを撤去。`index.ts` は750行減、撤去62シンボルの全体参照0件。503スタブ、health診断で使う2ヘルパー、通知・休眠登録・binding・env宣言、DB・認証・共有・Phase 2振り分け・assetは保持した。DEC-118、関連契約・運用・トレーサビリティを同期。
- B4はスタブ4組＋既存Access認証の5/5、Worker runtime71/71、既存mutation3/3、Worker型検査・diff確認が成功。全体check `65503` はD1 bindingでexit 1、直接 `51903` は2/3成功・Miniflare listen EPERMで1失敗。後続32 scriptの補足実行と残る6失敗、修正済みmarker検査の先行失敗を[報告書](refactor-slice1-discord-removal-2026-11-10.md)に分けて記録。全体・secret検査・実環境・CI／正式Reviewの成功扱いはしない。
- 次の1マイルストーンは監督の差分検品とGitHub保存、最新SHAのCI／正式Codex Review／thread・品質ゲート照合。Issue #70は今回の成果へ未同期。監督へ引き継いで実装実行は終了し、自律監視・終了後の継続実行は登録しない。以下のcheckpointは履歴として維持する。

## 2026-11-10 DEC-117: 第3ラウンド再開・契約同期と指定自己検証

Status: Accepted

確認日時: 2026-11-10T00:01:08+09:00（Asia/Tokyo）。branch `codex/archived-list-entry-20261109`、ローカルHEAD `9621b5bf55e01588ca65c2ee83810c1dbff5c796`を`.git`内の参照ファイル読取りで確認。Issue #70はGitHub Appでread-only取得し、書込みは行っていない。PR headは未確認。今回の実行状態は終了、成果物はローカル修正済み・未push、指定自己検証済み。ユーザーの「git操作は行わない」を適用し、指定の`git diff --check`以外のGitコマンド・commit／push／PR操作は実施していない。

- 第2ラウンドで専用RPCのmigration `202608180004_phase2_archived_manual_read.sql`とWorker／UIがローカル実装済み。第3ラウンドの途中成果でSQL negative testとManual Edit API workflow配線、checkerの両endpoint登録が存在した。今回、API両endpoint・RPC、setup・テーブル定義、UX・RLS方針、トレーサビリティ、OQ-028・DEC-117・[実施報告書](archived-list-entry-2026-11-09.md)を現状へ同期した。旧停止記録は以下の履歴として保持する。
- fixture差分は`manuals.folder_id uuid`だけ。専用一覧RPCの参照列が縮小fixtureに不足していたため必須として保持した。型・列とSQLテスト入力を静的照合した。第1ラウンドだけの旧bundle `.artifacts/dec117-handoff-20261109.bundle`は今回の指示で削除済み。再開後、既存RLS・通常一覧／詳細・Worker実装・テスト・D1・migration自体は変更していない。
- 指定`--test`は3ファイルを個別実行しすべてexit 0。環境の集計は各1ファイルのため直接実行でも30＋75＋14＝119件、fail 0／skip 0を確認した。checker、worker:typecheck、docs 162文書、encoding 440ファイル、migrations／migration:safety各13 SQL、diff checkは成功。実行IDと内訳は報告書へ記載した。全体`npm run check`、SQL実DB実行、実ブラウザ通し検証、remote適用、CI／正式Reviewは未実施。
- 次の1マイルストーンは監督によるSQL実DB実行・UI通し検証と、成果物のGitHub保存・Issue #70同期・対象SHAのCI／正式Review／ゲート確認。機能全体の受入完了ではない。D1復元・専用取得入口、物理削除・自動削除はOQ-028で未決のまま。自律監視・終了後の継続実行は登録しない。

## 2026-11-09 DEC-117: アーカイブ済み一覧の実装前停止（履歴）

Status: Accepted

確認日時: 2026-11-09T09:59:34+09:00（Asia/Tokyo）。branch `codex/archived-list-entry-20261109`、base／着手HEAD `9621b5bf55e01588ca65c2ee83810c1dbff5c796`。開始時cleanとPR #299のmerge commit一致を実取得した。Issue #70本文・最新コメントも確認済み。

- レガシー通常一覧の「アーカイブ済み」導線、専用取得、既存復元UIへの接続方針をDEC-117として記録した。OQ-028は設計決定と未実装を区別し、D1の復元・専用取得入口と物理削除・自動削除は未決として保持する。
- `manuals_select_members` RLS、revision／stepのRLS、`get_manual_edit_detail`がarchivedを除外する。Worker／app UIだけでは取得できずDB変更が必要なため、ユーザーの明示停止条件に従い製品実装を停止した。変更は4文書のみで、DB・D1・API・UI・assetは無変更。[調査報告](archived-list-entry-2026-11-09.md)に根拠と停止理由を記録した。
- 既存manual系3ファイルは実行90761で成功、個別の直接実行でも18＋64＋14＝96件成功・fail 0／skip 0。全体check49171は`test:d1-binding`でexit 1、直接切分け38816はMiniflareのlocalhost listen EPERMで2/3成功・1失敗。環境制約を成功に読み替えない。
- 元クローンの`.git`がread-onlyのため、同じ4文書を`/tmp/mm-dec117-save-20261109`でcommitした。git pushとgh PR作成はproxy接続／socket拒否、GitHub AppのPR作成・Issue #70コメントはapproval policy neverで拒否され、remote保存・PR作成・Issue #70同期は未完了。元クローンはbase HEADと文書差分を保持し、差分commitを`.artifacts/dec117-handoff-20261109.bundle`へも保全する。最終SHAは最終報告に記載する。merge・deployは行わない。
- 次の1マイルストーンはMuseによるレガシー専用取得のDB契約・migration変更範囲の判断と再指示。実装・tenant negative／UI導線回帰は未着手。保存・報告後は終了し、自律監視・継続実行は登録しない。以下は過去checkpointとして保持する。

## 2026-11-08 PR #298 通常再読込・保存後再取得の入力保持P1修正

Status: Accepted

確認日時: 2026-11-08T22:18:51+09:00（Asia/Tokyo）。branch `codex/sample-mode-stage-d-20261108`、着手HEAD／PR head `5f7e20482487fb88f19cd10a97e17f2b5559d4b6`をGitHub Appとlocal gitで照合。main統合済み。P1 `4506316594`（thread `PRRT_kwDOTpNknc61A5wP`）の実装・検証・同名branchへのcommit／pushが今回の範囲。PR本文編集・レビュー依頼・ゲート操作・mergeは監督側が行う。

- `openManual`共通で取得開始時の編集世代を記録し、既存の処理番号照合と併せて共有情報GET後・本文反映直前に再確認する。入力が進んだ場合は既存の`preserved`経路と「編集中の内容を保持しています。」で詳細・dirty・focus・選択を維持する。保存成功後は取得済み本文との照合を経た更新版・追加手順IDを引き継ぎ、手順選択を保って次の編集・保存を続ける。UX契約・traceabilityとasset hash `sha256-922bb8f3ea59f8ad`を同期した。
- 追加テストは`tests/cloud-manual-ui-browser.test.mjs`の`cloud manual reload preserves unsaved edits made while share metadata GET is pending`と`cloud manual save preserves unsaved edits made while share metadata GET is pending`。共有GET到達後にタイトル・説明を入力し、未保存状態・離脱保護・focus／文字選択と次の追加・保存を確認する。合成APIと実Chromiumの検証であり、remote環境の証跡ではない。
- 修正前の実行36554は2/2失敗・exit 1（待機中入力がサーバーのタイトルへ戻るassertion）。修正後69171は2/2成功・exit 0。最終テストを残して対象実装だけを着手HEADとbyte一致で一時復元したmutation実行44445も同じ2件が入力消失で失敗・テストexit 1、finallyで修正版への復元を確認した。最終browser56108は保存・共有・画像編集・サンプル投入を含む7ファイル14/14、fail 0／skip 0／exit 0。
- 最終全体`npm run check`62694は56 npm段階・Node summary集計839/839、fail 0／skip 0／exit 0、最終encodingまで完走。自己レビューで通常再読込の破棄確認、遅着処理番号、保存結果照合、追加手順IDと選択、サンプル側の保持条件、情報露出を確認した。新しい認可・API・DB・依存・環境変数は追加していない。sandbox内の先行browser起動は制限で停止したため製品の再現失敗として数えず、承認済みsandbox外実行で上記を確認した。
- 本記録と同時の修正commitをoriginの同名branchへ保存し、local／remote SHA一致を実取得して報告する。Issue #70は本文と最新コメントを実取得済み。次の1マイルストーンは監督側で保存済みheadの正式Review・thread返信／解決・CI・ゲートを照合すること。既存threadは未解決を維持し、今回のローカル成功を正式再レビュー完了に読み替えない。保存・報告後は終了し、自律監視・継続実行は登録しない。以下は過去checkpointとして保持する。

## 2026-11-08 登録後サンプル投入（段階D）

Status: Accepted

確認日時: 2026-11-08T21:13:14+09:00（Asia/Tokyo）。branch `codex/sample-mode-stage-d-20261108`、base／着手HEAD `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`（PR #291 merge）。未commit成果物を確認して継続。初回commit `18f4f0888a27236c381e162ff09efc197354f544`をpushしDraft PR #298へ反映済み。正式Review P1と監査の自己レビュー修正はローカル検証済み。本checkpointを含め同じbranchへcommit／pushし、最新headの正式再レビューを別取得する。今回の指示は実装・検証・文書同期・commit／push・Draft PR・正式Codex Review対応まで。merge・deploy・Issue #70書込みは行わない。Issue #70はread-onlyで実取得したが今回の段階Dは未同期のまま監督側へ引き継ぐ。

- active Personal Workspace作成者owner本人の明示POSTで固定6手順・3 PNGを通常claim経路へ正規保存する。予約prefixは公開claimから拒否。再送・同時保存・期限切れpendingを処理し、未アーカイブ既存サンプルは同一IDへ収束。通常D1アーカイブはCAS＋migration 0010のappend-only監査を同じbatchで確定し、アーカイブ後だけ次のサンプルを投入する。DEC-115、API・UX・traceability・D1 schemaを同期した。
- 空状態＋常設panelの2入口、未保存・処理中guard、二重送信防止、遅延中編集・遷移時の詳細保持、isSample badgeを実装。誤った閲覧専用toggle名の先行失敗を再現し、テストだけを既存cloud幅分岐へ修正した。引継ぎasset version不一致を全体check98397（exit 1）で検出し、実測`sha256-3978951cae4940ed`へ版定数だけ同期した。
- 対象`test:cloud-manual`は実行56869、66/66。`test:manual-sample:browser`は24671、3/3（投入テストは1366/1024/390pxを完走）。cloud UI/tools/UIUX回帰は8262、4/4。全てfail 0／skip 0／exit 0。全体check30145はexit 0、56 npm段階（本体＋55直下script）完走、Node summary集計796/796・fail 0／skip 0、最終encodingまで成功。docs 156／secret 473／encoding 401件。browserはcheck外の別証跡。[段階D報告書](sample-mode-stage-d-2026-11-08.md)に先行失敗と実環境注記を分けて記録した。
- 初回Reviewed commit `18f4f0888a`のP1 `4506141316`はGET遅延中入力の保持不足。反映直前の編集世代・処理状態再照合と3待機位置×3幅の回帰を追加した。監査のINSERT OR REPLACE欠陥も再現修正しmigration 0010へINSERT拒否triggerを追加。最終asset hashは`sha256-42104b39a3e4f956`。最終対象unit/API18662は67/67、sample browser36246は4/4、cloud／共有browser47743は8/8。最終全体check70549は56 npm段階・797/797・fail 0／skip 0／exit 0、docs156／secret473／encoding407。依存欠落による先行停止と復旧、所有者情報保持の拒否、fsync＋SQLite write probe 2連続成功は報告書に記録した。正式再レビューとthread返信／解決を別取得する。main `85b9c4b`とのhandoff先頭追加競合により通常PR CIは未実行で、main統合は行っていない。
- 次の1マイルストーンはMuseによるmainとのhandoff競合解消・最新headのCI実行・正式Review／thread／SHA再照合と利用者受入。remote SSO、D1/R2へのmigration適用、Access policy、人のscreen readerは未実施。artifactとnode_modules symlinkは保持してcommit対象外とする。保存・報告後は終了し、自律監視・終了後の継続実行は登録しない。以下の過去checkpointは保持する。
## 2026-11-08 Teamの管理責任者移管（DEC-114）

Status: Accepted

確認日時: 2026-11-08T20:47:29+09:00（Asia/Tokyo）。対象FR-003、branch `codex/owner-transfer-20261108`、base main／origin/main `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`。開始時clean・base一致を確認し、既存の指定branchを使用した。対象専用Issue／PRは今回作成しない。Issue #70はread-onlyで実取得し、ユーザー指定の「作業ツリーとcommitまで」に従い書込み・push・mergeを行わない。

- active owner本人から同じstandard workspaceのactive非ownerへの移管を実装。対象をowner、元ownerをadminにする。Personal・自己・既存owner・removed/invited・disabled・越境・旧owner再移管を拒否する。メール送信なし。
- migration 0009のpermit発行→昇格→降格→既存`member.updated`監査→permit削除を1回のD1 batchにまとめ、5段階すべての直接変更件数1件をSQL内assertionで検査する。0件・途中失敗は全体rollback。有効permitなしraw UPDATE昇格と既存last-owner保護を維持する。DEC-114（DEC-112はPR #293、DEC-113はPR #294で使用済み）、D1/API・AC・FR-003・品質台帳を同期した。
- UIは対象と自身admin降格のconfirm、取消、保存中排他、成功／競合／結果不明時の一覧照合を既存の認証世代管理へ接続した。asset hashは`sha256-0b329807fecbc143`。
- 全体`npm run check`実行69446はexit 0、56段階を最終secret／encodingまで完走。repository 48/48、HTTP 19/19、UI unit 130/130、実Miniflare D1 binding 3/3（90232）、合成product認証browser 10/10（16144）、いずれもfail 0／skip 0。資産hash契約を含むWorker runtimeとtypecheck、D1境界checker、diff確認も成功。先行sandbox失敗、checkerの旧前提、browser fixture修正は[実施報告書](owner-transfer-2026-11-08.md)へ分けて記録した。
- API・D1・契約commitは`ecfe6f6bd10fc31aa356d73e187cc62d2206e8a8`、UI／回帰／本checkpointは後続の同一commitに保存する。最終SHA・cleanはcommit後に取得して完了報告へ添える。local保存のみで、remote SHA一致・GitHub CI・正式Codex Reviewは未確認。remote D1の0009適用、実SSO、staging／production反映、商用release受入は未実施。
- 次の1マイルストーンはMuseによる最終local SHAの検品と、別途指示によるGitHub保存・最新SHAのCI／正式Review／thread照合、remote migrationの受入。実装担当は検証・commit後に終了し、自律監視・終了後の継続実行は登録しない。

---
## 2026-11-08 拡張なしの受入用サンプル（段階B）

Status: Accepted

確認日時: 2026-11-08T19:28:57+09:00（Asia/Tokyo）。監督Claudeの指示、branch `codex/sample-mode-stage-b-20261108`、base／着手HEAD `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`（段階A PR #291マージ済みをlocal gitで照合）。今回は実装・検証・文書同期・ローカルcommitまで。push／PR作成／mergeは監督側。Issue #70はread-only取得し、段階A／Bの未同期を確認した。外部書込みは行わない。

- sampleのcanEditだけをtrueへ変更し、文章編集・手順追加（上限200件）／削除／ボタン・Alt矢印の並べ替え・undo／redoをタブ内メモリで許可する。読み直しは変更破棄確認後にfixture・履歴を初期化する。保存は登録案内、共有・PDF／Office・画像編集全般・brandingは遮断を維持する。共通API gateと個別入口を併用し、偽workspace／guest永続化・D1/R2なし、初期・編集後の保存不可と離脱時消失を明示した。DEC-113、UX・API・traceability・品質台帳を同期、ADR-0032本文・拡張製品コード・LP・API／migration／依存／環境変数は無変更。
- 全体`npm run check`は実行`68196`、exit 0、Node summary 24組の集計780/780・fail 0／skip 0／cancelled 0。sample単体4件とmutation 3件、内容hash回帰を含み、asset hashは`sha256-0c09a389feb49956`。sample最終browser `47522`は2/2・fail 0／skip 0／exit 0で、1366/1024/390pxの画面・内部状態・keyboard・200件上限・fixture復元とAPI read／write／storage呼出し0を確認。
- 通常モード等の7ファイル直列回帰`16037`は37/38・fail 0／cancelled 1／skip 0／exit 1。cloud保存・画像編集・branding・PDF・共有・Office側の9件は成功。既存拡張editorの認証引き継ぎ1件が25秒timeoutで、同じ元テストの単独実行`59165`もcancelled 1。拡張製品コード・該当テスト・launcherはbaseと差分0。/tmpコピーの総時間上限だけを60秒にした診断`32942`は1/1・exit 0、本体49.9秒で元assertionが成功したが、元の25秒gateや全体回帰の成功へ読み替えない。sandbox起動制約と詳細は[段階B実施報告書](sample-mode-stage-b-2026-11-08.md)を正とする。
- 成果物状態はローカル修正済み・未push（本記録と同時にcommit保存する）。次の1マイルストーンは監督側でローカルcommitを確認してpush／PRを行い、最新SHAのCI・正式Codex Review・thread、既存25秒timeoutのtriageと編集受入を照合すること。npm ci、正式Review、実SSO／remote D1/R2／Access policy、実Office描画、人のscreen reader、deployは未実施。既存`.artifacts/`を保持してcommit対象外とし、保存・報告後は終了する。自律監視・終了後の継続実行は登録しない。ローカル画像編集は追加1〜2日規模の別段、形態Dは契約決定後の別見積もり。以下は過去checkpointとして保持する。
## 2026-11-08 受入次弾: 保存先名・状態表示の統一

Status: Accepted

全体回帰確認日時: 2026-11-08T19:29:40+09:00（Asia/Tokyo）。branch `codex/acceptance-display-fixes-20261108`、base／着手HEAD `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`。今回の範囲は指定2件の実装・検証・文書同期・自己レビュー・commit／同名branchへのpushまで。PR作成・Issue #70更新・mergeはユーザー指定により監督側担当とする。Issue #70はread-onlyで確認済み。

- bootstrapへ`workspaceName`を追加し、operationのworkspaceと既存authorized述語が固定する本人のactive Personal Workspaceからだけ現在名を取得する。改名・冪等再送、A/B分離、改竄operationの最終SELECT拒否とその認可削除mutationを検証した。HTTPの既存503／D1_UNAVAILABLEを維持し、他actorの名前を返さない。
- 保存・共有・Officeの確認サマリーへ保存先をtextContentで表示する。空・欠落・別workspace更新では隠し、結果回収にbootstrapを追加しない。manualの一覧／基本情報は「状態不明」、手順カード／プレビューは「種類不明」へ統一する。5状態・4種別の既存日本語は維持し、固定action optionと検証済みworkspace権限は変更しない。内容hashは`sha256-ba29245963f4bb59`。API・UX・DEC-112を同期し、response shape記載のないtraceabilityは指示どおり変更しない。
- 全体`npm run check`（99956）はexit 0、55個のchain script完走、Node test summary 783/783・fail 0／skip 0。対象5ファイル66/66（64725）、追加後mutation2/2（13800）、onboarding／share browser16/16（41998）、既存Phase 2 E2E28/28（32979）は成功。check外MV3 runtime（74860）は6/7・exit 1で、初回Accessの合成HTTPS遷移だけproxy tunnel接続失敗。テスト専用のproxy無効起動による同一testの再実行（19900）は1/1成功。別実行を単一の7/7成功に合算しない。実MV3 Office／製品認証Office3/3（86133）もexit 0。修正commit `7a7fa8acbeb517b1cb4fd6f67970a1934e6b21f1`を2026-11-08T19:31:56+09:00に同名originへpushし、local／remote SHA一致を取得確認した。保存確認の追記だけを後続の文書commitへ含める。追跡済み未commit差分0を確認し、合成browserの未追跡artifactは保存対象外で保持する。先行失敗の詳細は[報告書](acceptance-display-fixes-2026-11-08.md)を正とする。
- `npm ci`は監督側の実施済み依存を使うため再実行せず、PRのnpm ciチェックは未チェックのままとする。実SSO／remote D1/R2／実Office描画／人のscreen reader・利用者受入、GitHub CI・正式Codex Reviewは未実施。次の1マイルストーンは監督Museによるpush済みSHAのPR・CI・正式Review・thread／SHA照合と利用者受入。保存・報告後は終了し、自律監視・継続実行は登録しない。以下は過去checkpointとして保持する。
## 2026-11-08 Issue #248: 横スクロール記録の実MV3回帰

Status: Accepted

対象branch `codex/horizontal-scroll-248-20261108`、base `main` / `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`。ユーザー指定範囲は実MV3回帰・CI接続・報告書・commit／push・base mainのDraft PR・full head SHAを明記した`@codex review`依頼まで。mergeしない。

- 現行recorderはdeltaX／deltaYから80px閾値とdominant axisで4方向を決定し、下流の正規化・日本語操作文・local draftも左右対応済み。製品コード・挙動は変更せず、未整備だった横方向の実MV3 browser testを追加した。動的要素の初回はADR-0031／DEC-071のbaseline-only契約を維持し、既存table／panelの初回記録と別々に実測した。
- 新規試験は要素／ページの左右・上下、79px非記録／80px記録、斜め移動、動的要素、event／stepの許可形状と合成URL／入力値／本文の非混入、13手順のIndexedDB保存を検査。単独`22481`は1/1、CI相当headed Chrome／Xvfb直列`6833`は既存sidepanel含め4/4、双方fail 0／skip 0／exit 0。隔離コピーをdeltaY限定へ戻した`79209`は最初の横移動で期待どおり失敗した。
- 2026-11-08T19:28:15+09:00（Asia/Tokyo）確認: 全体`npm run check`は実行`43559`、exit 0、56段階とNode test summary集計779/779、fail 0／skip 0、最終secret／encodingまで成功。CIは既存`extension-privacy` jobの`sidepanel` stepへ接続し、3分timeout・必須outcome・Latest Review Gateを維持する。先行環境失敗の詳細は[実施報告書](horizontal-scroll-capture-2026-11-08.md)を正とする。npm ciは未実行、レビュー依存項目は未チェックを維持する。生成した合成artifactはcommit対象外。
- 次の1マイルストーンはMuseによる保存済み最新headのCI／npm ci／正式Codex Review／threadと対象SHA照合。#248の実装判断に未決事項はない。production／外部設定／自動mask・置換は変更しない。push後にlocal／origin／PR head一致とDraftを実取得し、Issue #70へ保存結果を同期する。担当は保存・報告後に終了し、自律監視・継続実行は登録しない。以下は過去checkpointとして保持する。

## 2026-11-08 拡張なしの受入用サンプル（段階A）

Status: Accepted

最終回帰確認日時: 2026-11-08T18:41:05+09:00（Asia/Tokyo）。branch `codex/sample-mode-stage-a-20261108`、base／着手HEAD `7cb76e4450105994da7dd1f7b8f3ff0f4b166555`。前任の未commit実装を確認・継続し、今回はユーザー指定により実装・検証・文書同期・ローカルcommitまで。push／PR作成は監督側が行うため未実施、Issue #70はread-onlyで実取得し書込みなし。

- `/manuals/sample`から認証・拡張不要で架空の備品貸出申請6手順／合成PNG3枚を通常エディタの編集状態へ投入する。sample modeで編集・API write・出力を遮断し、toolbar／画像拡大内でサンプルを明示。D1/R2／guest content／偽workspaceなし。入口はログインと0件空状態だけ、LP・ADR-0032本文・migration・拡張製品コードは変更しない。DEC-111・UX・API・traceability・品質台帳を同期した。
- 全体`npm run check`は実行`11821`、exit 0、56段階完走、Node test summary集計779/779・fail 0／skip 0。sample unit 3件を全体checkへ追加。10ファイル直列回帰`56504`は50/50、既存作成編集E2E`70955`は28/28、双方exit 0。1366/1024/390pxで全手順・画像・keyboard・API write 0回、既存保護routeの認証拒否を確認した。asset hash `sha256-fde69b674c613064`。先行失敗と実行環境の詳細は[実施報告書](sample-mode-stage-a-2026-11-08.md)を正とする。
- 次の1マイルストーンは監督側でローカルcommitを確認してpush／PRを行い、最新SHAのCI・正式Codex Review・threadとMuse本人の拡張なし受入を照合すること。実SSO、remote D1/R2、Access policy、deploy、人のscreen readerは未実施。既存と今回の未追跡artifactは保持し、成果物commitから除外する。保存・報告後は終了し、自律監視・継続実行は登録しない。以下は過去checkpointとして保持する。

## 2026-11-08 初回導線のワークスペース説明（#232／232-4）

Status: Accepted

検証確認日時: 2026-11-08T16:10:56+09:00（Asia/Tokyo）。branch `codex/workspace-gloss-20261108`、着手HEAD `f7b756eda7d072112d4598ed0ac09a9b46bc06d3`。今回の範囲はintro文言2箇所・回帰・文書同期・commit／push・base `main`のDraft PR作成まで。

- 保存準備画面の静的introとOffice差し替えintroだけに「ワークスペース（手順書を保存する場所です）」と説明を添える。保存確認サマリー・手順ステップ・通常画面の文言は変更していない。通常assetは版定数以外byte一致し、共通hashだけ `sha256-daea9b8e6d875f8a` へ同期した。
- onboarding unitは追加3件を含む24/24（実行 `13598`）、browserは保存・共有復旧・Word・PowerPointの説明1回とサマリー非露出を含む16/16（`27977`）。全体 `npm run check` は `86991`、exit 0、Node test summary集計776/776・fail 0／skip 0で最終secret／encodingまで完走。先行制限内checkの失敗と既定browser欠落は[報告書](workspace-gloss-2026-11-08.md)に区別した。
- UX・decision-log・要件トレーサビリティを同期し、報告書と本記録を同じcommitへ含める。既存未追跡artifactは保持し、保存対象外。push後にlocal／origin／PR headとDraft状態を照合し、Issue #70を既存状態・履歴を保って更新する。
- 次の1マイルストーンはMuseによる新headのGitHub CI・正式Codex Review・レビューthread／SHA照合と利用者受入。レビュー依頼・merge・deployは行わず、レビュー依存チェックは未チェックを維持する。npm ci・実SSO／remote D1/R2／実Office描画／人のscreen reader確認は未実施。保存・報告後は終了し、自律監視・終了後の継続実行は登録しない。以下の過去checkpointは履歴として保持する。

## 2026-11-08 受入第一弾: 保存内容確認・エラー案内・空状態CTA

Status: Accepted

最終全体回帰確認日時: 2026-11-08T14:45:20+09:00（Asia/Tokyo）。対象Issue #272／#232、branch `codex/acceptance-fixes-20261108`、着手HEAD `2cfdee4136e885482fa8c14955fe93dc8a1bf927`。今回の許可範囲は指定3点の修正・検証・報告書・commit／指定branchへのpushまで。PR作成・merge・Issue書込みは行わず、Issue #70も依頼に従って未更新とする。

- 保存先準備後にタイトル・件数・目的・新規／更新・ロゴ有無を確認し、「この内容で保存する」まで本文・画像の送信を待つ。取消はlocal原本を保持して編集タブへの復帰を案内する。待機後も元TTLでwrite検査を通し、確定結果の回収は妨げない。未知コード非表示と編集可能な空一覧の作成CTAを追加した。拡張製品コード・API・D1・外部AI・自動mask／自動置換は変更しない。
- 対象unit／browser 5ファイル45/45、CTAを含む既存作成編集E2E 1/1、実MV3・合成認証Office連携3/3はexit 0。全体`npm run check`（57849）はexit 0、56段階とNode test summary集計772/772・fail 0／skip 0で完走した。詳細・先行失敗・未実行事項・既存テスト更新理由は[修正報告書](acceptance-fixes-2026-11-08.md)を正とする。
- 次の1マイルストーンはMuseによるpush済み実SHAでのPR・CI・正式Codex Reviewと利用者受入の照合。実SSO／remote D1/R2／production・staging配信／実Office描画は未実行。保存・報告後は終了し、自律監視・継続実行は登録しない。以下の過去checkpointは履歴として保持する。

## 2026-11-08 PR #288: 一覧の再試行失敗後のフォーカス復帰

Status: Accepted

最終回帰確認日時: 2026-11-08T10:38:23+09:00（Asia/Tokyo）。監督Museの指定によるP2修正。対象branch `codex/ui-recovery-from-280-20261107`、着手HEAD `9eba894f3ac09d5cbc70ee255bc239cf05bc7d03`、review comment `4504498692`／thread `PRRT_kwDOTpNknc608kgP`を実取得した。

- 初回一覧503→Enterで再試行→再503で新ボタンのfocusが失われることを修正前の回帰で確認し、`loadManuals`に開始時focusの記録と条件付き復帰を追加した。既存popupと同じ条件でbody／元要素／未設定時だけ復帰し、待機中に検索欄へ移ったfocusと初回失敗時のfocusは維持する。Enter／Spaceによる連続再試行と別focus保持が成功した。asset内容hashは`sha256-0b149ba73aa80f8a`。
- 全体`npm run check`は`31860`でexit 0、Worker71/71・認証157/157、最終secret／encodingまで成功。関連browser14ファイル`52686`は64/67・exit 1・skip 0で、既存sidepanel poll待機1件と共有読者の次手順表示待機2件がtimeout。対象2ファイルを同じコード・assertionのまま直列再実行した`18399`は31/31・fail 0／skip 0／exit 0。別実行を一括成功へ合算しない。詳細は[修正報告書](ui-p2-fix-2026-11-08.md)。
- 契約・traceability・decision-log・本記録・報告書を同じ修正commitに含め、同名originへpushしてlocal／origin／PR head一致を照合する。未追跡`.artifacts/`等の残骸は保存対象外。Issue #70はclosed／not_plannedと他branch履歴を保持して結果を同期する。
- 次の1マイルストーンはMuseによる新headのCI／正式Codex Review／指摘threadの返信・解決とSHA照合。レビュー依存項目は未チェックのまま、Draft維持、merge・deploy・他PRコメントなし。実SSO／remote D1/R2／実Office描画／人によるscreen reader確認は未実施。担当は保存・報告後に終了し、自律監視・終了後の継続実行は登録しない。以下は履歴として保持する。

## 2026-11-08 PR #288: UI回収ブランチへのmain統合

Status: Accepted

最終回帰確認日時: 2026-11-08T10:11:39+09:00（Asia/Tokyo）。監督Museの指定範囲は開始済みmain mergeの競合解消、回帰、報告書を含むcommit／同名branchへのpushとPR検証記録更新まで。Draft維持、PR merge・deploy・他PRコメントは行わない。以下の各branchのcheckpointは履歴として保持する。

- Draft PR #288、branch `codex/ui-recovery-from-280-20261107`、base `main`。着手HEAD `5918b0f9986812fa5c4c1856de9b768705e8d4fb`とmain `9adc2c18247e29a5078afd028e2b6c77da7b0fd4`を統合する。両親の文書追加を保持し、版定数だけの競合は統合assetから`sha256-4caa5e44061a8e31`へ再計算した。
- 認証本体・migration 0008・認証回帰はmainと、拡張treeは着手UI headとbyte一致。mainの共有`shareBusy`排他・OAuth他タブ主体同期とUI回収を両立し、無加工画像＋利用者確認＋手動編集、ChatGPT既定OFFとfail-closedを維持する。自動mask経路・肯定する自動置換文言の検索は0件。
- 再起動後の最終`npm run check`全体exit 0（実行ID `96469`、先行`70276`もexit 0）、認証157/157、Worker71/71、D1 HTTP39/39、D1 binding3/3、最終secret／encodingまで成功。関連browser 15ファイルの`5806`は95/96・exit 1で、1件だけ既定browser欠落による起動前失敗。該当testのimportを既存共通launcherへ揃え、`47873`で1/1・fail 0／skip 0／exit 0を確認した。製品仕様・テスト本体・assertionは変更していない。初回制限内checkの子プロセス失敗、前任の実行ID `54269`と分けて記録する。詳細は[統合報告書](ui-merge-main-2026-11-08.md)を正とする。
- 本checkpointと報告書を同じmerge commitに含め、push後にlocal／origin／PR head一致とDraftを照合する。Issue #70はclosed／not_plannedと他branch履歴を保持し、今回の結果を同期する。未追跡の`.artifacts/`等は含めない。
- 次の1マイルストーンはMuseによる新merge headのCI・Codex Review・P0/P1・thread・SHA照合とUI受入判断。レビュー依存のチェックリストは未チェックを維持し、旧headの成功を新headへ流用しない。remote SSO／D1／R2／migration適用／実Office描画等は未実行。担当は保存・報告後に終了し、終了後の継続実行・監視を登録しない。

## 2026-11-08 マイルストーン3: PR #280のUI回収

Status: Accepted

確認日時: 2026-11-08T06:20:33+09:00（Asia/Tokyo）。今回の範囲はcommit／指定branchへの保存／認証baseのDraft PRまで。merge・deploy・remote環境変更・他PRコメントは行わない。

- base `codex/auth-port-from-284-20261107` / `cc83e1a`。新branch `codex/ui-recovery-from-280-20261107`。#280 `a44dde8..f750a3d` のUI hunkを記録UI `8150fa6`、editor/cloud/readerと関連契約・fixture `44d2387`へ回収。
- 無加工画像・利用者確認・手動編集と製品認証を維持する。APP_JS、生成editor-tools JS/HTMLはbaseとbyte一致。自動mask/aliasの処理・前提・文言を戻さない。生成物はsourceから再生成。
- localの記録品質17/17、全画面品質1/1、修正後sidepanel unit4/4、認証・Worker224/224が成功。指定UI一括は8成功後にpage crashとChrome起動SIGTRAPで25環境失敗。labはtimeout。check初回の旧fixture4失敗を修正したが、再実行はnpm write EPERMで停止。全体検証成功・release合格ではない。
- 検証途中でrepoと/tmp、Git indexへのwriteがOSに拒否されたため、31変更blobのlocal SHA一致を検証してGitHub Appで保存した。local HEADはbaseのまま、最終報告書・引き継ぎ・最新PRの正本はremote版。local差分を破棄せず、書込み可能な環境でremote headへ同期して再開する。
- 初期head7161418のfull checkはDocs CIで成功。Legacy共有読者の復帰見出しgeometry3件の実表示失敗を確認し、成功messageの高さ確定後にscroll位置を決める順序へ修正。認可は不変、最新headのCIで再検証する。旧headの成功を流用しない。
- 初回Codex ReviewのP2 2件（閲覧専用の出力消失4503789569、busy失敗後focus4503789571）を妥当と確認し、出力panel保持と元/別focus保持を追加回帰付きで修正。local Chromeはwrite拒否のため未実行で、最新CI・再レビュー・thread返信/解決を別確認する。
- a3c5e27の最新full check/Legacy成功、Privacyの追加品質は52/53でsidepanelの明示focus保持が1失敗。busy中のpollが状態文を空にしてfocus先を隠す原因を修正し、1100ms保留と実poll観測を回帰へ追加。guardのメモリunit13/13成功、最新CI/Reviewの照合を残す。
- 詳細は[UI回収報告書](ui-recovery-2026-11-08.md)。新Draftの最新head CI・Reviewは別取得し、PR本文で確認日時と結果を照合する。
- 次の1マイルストーンは最新headでfull check、品質lab、sidepanel/editor/cloudと認証・Office回帰を完走し、Review/threadとUI受入を照合すること。土台P2は次回親PMが2026-11-14までに再triage。自律監視・終了後の継続実行なし。

## 2026-11-08 PR #287: OAuth主体変更P2修正

Status: Accepted

確認日時: 2026-11-08T09:40:26+09:00（Asia/Tokyo）。監督Museの指定により、実装担当がP2の再現・修正・回帰・報告書同梱のcommit／pushを行う。Draft維持、merge・deploy・他PRコメントは行わない。

- 対象Issue #283／Draft PR #287、branch `codex/auth-port-from-284-20261107`、着手HEAD `15ca9cab0891bd9ac8bd94fdaaffa2d9f9c4e872`。review comment `4504320245`（thread `PRRT_kwDOTpNknc608JIJ`）を実取得し、旧主体のshellから新Cookie主体で作成POSTを送る二タブ回帰を修正前に再現した。
- OAuth成功302をcanonical root完了処理へ接続し、既存Web Lock・認証世代nonce更新・BroadcastChannel通知後に元操作へ復帰する。受信側は既存のshell非表示・応答世代無効化・session再取得を使う。通常読込で通知を反復せず、同期不能時は通知を試みて元操作へ進まない。完了先もno-referrer／no-store／CSPを維持する。asset hashは`sha256-60e73e0767d933e0`。
- 最終`npm run check`全体exit 0（`80379`）、認証157/157（追加4）、Worker71/71、D1 HTTP39/39。認証browser9/9・共有／画像編集7/7（`31704`）、最終Office認証2/2・fail0／skip0／exit0（`66841`）。先行browser実行のOffice参照元assertion失敗はrootのno-referrer不足を修正して解消した。詳細と実行上の未到達は[修正報告書](auth-p2-fix-2026-11-08.md)を参照する。
- 本記録・報告書と修正を同じcommitに含め同名originへpushし、local／remote／PR head一致を照合する。Issue #70はclosed／not_plannedと他branch履歴を保持して今回の結果だけ同期する。最新headの正式Codex Review／CI／thread解決完了は別確認とし、PR完成とは扱わない。
- 次の1マイルストーンはMuseによる新headのCI・Codex Reviewと当該thread返信／解決確認。remote SSO／D1／R2／migration適用／実Office描画は今回未実行。担当は保存・報告後に終了し、終了後の継続・自律監視は登録しない。以下のmain統合等は履歴として保持する。

## 2026-11-08 PR #287: main統合

Status: Accepted

確認日時: 2026-11-08T09:20:12+09:00（Asia/Tokyo）。監督Museの指定は、開始済みmain mergeの競合解消・生成物更新・回帰・報告書同梱のcommit／pushまで。Draftを維持し、PR merge・deploy・他PRコメントは行わない。以下の古いbaseとlocal書込み障害の記録は履歴として保持する。

- 対象Issue #283／Draft PR #287、branch `codex/auth-port-from-284-20261107`。着手HEAD `cc83e1aeb761217f388d8fd64dee4909814ddd99`とmain `3e2fe6f568fbb7c77749d915177d8ce88a86e0b5`を統合。両側のdecision／handoff追加記録を保持し、共有P2 `6f3b550`の`shareBusy`とPOST／DELETE回帰を維持した。
- 正規の共有editor bundleを再生成し、統合後assetから`APP_ASSET_VERSION=sha256-963d574fb050ea04`を再計算。認証本体・migration 0008・Chrome拡張は着手HEADと一致し、CSP data URL decodeも保持した。今回のGit index登録は成功し、過去の書込み失敗を現状へ流用しない。
- `npm run check`全体exit 0（実行ID `50105`）、認証153/153、Worker71/71、D1 HTTP39/39、秘密値・encodingまで成功。関連browser 11ファイル22/22、fail 0／skip 0／exit 0（実行ID `61352`）。詳細は[統合報告書](auth-merge-main-2026-11-08.md)。自動mask moduleなし、拡張差分なし、自動経路不在の既存unitとraw pixel保持のnative回帰成功を確認した。
- 本checkpointと報告書を同じmerge commitへ含め、同名origin branchへpush後にlocal／remote／PR headを照合する。Issue #70はclosed／not_plannedを保持し、#288等の他branch記録を残して今回の結果だけを同期する。
- 次の1マイルストーン: Museによる新merge headのGitHub CI／Codex Review／thread照合。旧headの成功を流用せず、今回のローカル検証だけでPR／release完了とは扱わない。実SSO・remote D1/R2・実Office描画は未実行。実装担当は保存・報告後に終了し、自律監視は登録しない。

## PR #287 追加レビュー修正とlocal書込み障害

Status: Accepted

確認日時: 2026-11-07T22:50:33+09:00（Asia/Tokyo）。

- Draft #287、base `codex/foundation-no-automask-20261107`。本体・テスト修正はgit push、以後の保存はlocal object書込み拒否を受けGitHub Appで行う。
- `e1e517f`の新規P2 2件（HTML `/manuals` 再訪のログイン導線、provider再取得時のpasswordフォーカス）を再現し修正。メモリ上のsource差替えで認証153/153成功。最新commitの通常CI／Codex Reviewは別確認する。
- local HEADは`547a495`。書込み失敗でlocal `tests/app-auth.test.mjs` が0 byte、元blobは `4f7eb0a080b48014026d24c44f7c55df983cfe64` に保全済み。復元も拒否されている。指定repo外報告書も0 byte。local差分を完成扱い・再pushせず、書込み可能な環境で最新PR headから復元する。
- 完成本文と根拠は[認証移植報告書](auth-port-2026-11-07.md)のremote版とPR本文。今回merge／deploy／環境設定変更・他PRコメントなし。
- 次の1マイルストーン候補は#280のUI hunk回収だが、この書込み制限と最新SHAゲートを先に確認する。自律監視なし。

## 2026-11-07 マイルストーン2: 製品認証の移植

Status: Accepted

確認日時: 2026-11-07T22:32:08+09:00（Asia/Tokyo）。ユーザーの指定はcommit／push／土台baseのDraft PRまでであり、merge／deploy／環境変更と他PRへのコメントは禁止。

- branch `codex/auth-port-from-284-20261107`、base `codex/foundation-no-automask-20261107` / `6f54686`。#282→#284のnet差分を本体`f3f6b2e`へ回収済み。引き継いだ画像取得・編集競合のテスト同期修正は`547a495`。
- `npm run check`全体がexit 0。製品認証unit151/151、Access identity17/17、Access fetch5/5、D1 HTTP39/39、bootstrap mutation1/1。認証・Office browserは14/14、既存Access保存runtimeは6/6成功。
- 初回Access復帰runtimeだけはproxy tunnelでnavigationが失敗し未検証。実SSO／remote D1/R2／実Office描画は未実行。メール確認コードは未実装、ChatGPT既定OFF、email-only link禁止、自動mask廃止を維持する。
- 詳細と実行境界は[認証移植検証報告書](auth-port-2026-11-07.md)。CI／最新headのCodex Review／Latest Review GateはDraft作成後の別確認であり、merge／release完了とは扱わない。Issue #70はclosed／not_plannedを確認し、今回更新しない。
- 次の1マイルストーン候補は#280のUI改善のhunk単位回収。今回は未着手、自律監視なし。

## 2026-11-08 PR #285 P2: 共有応答待ちの画像編集開始抑止

Status: Accepted

確認日時: 2026-11-08T08:38:01+09:00（Asia/Tokyo）。branch `codex/foundation-no-automask-20261107`、起点・着手時PR head `6f546862b8515d96317963226ab0b0d0a9244744`。監督Museの指示範囲はP2修正・回帰・標準check・同名branchへのpush。Draft維持、merge・deploy・他PRコメントは行わない。

- review comment `4503895303`の競合を確認し、共通画像編集入口で既存`shareBusy`を確認する1か所のgateを追加した。共有応答待ち中は画像編集を始めず、日本語で案内する。新しい状態・依存・API／認証／保存契約の変更、自動maskの再導入はない。
- 遅延POST／DELETE回帰は修正前に両方とも狙ったassertionで失敗、修正後は2/2成功。関連browser 6ファイル8/8、fail 0／skip 0／exit 0（実行ID `19194`）。画像適用・保存・手順切替・再編集と、既存共有／画像／Office回帰を確認した。
- `npm run check`はasset内容ハッシュ更新後に全体成功、exit 0（実行ID `86394`）。詳細・変更ファイルは[修正報告書](foundation-p2-fix-2026-11-08.md)。このcheckpointと報告書を修正と同じcommitへ含め、push後にremote／PR head一致を確認する。
- 次の1マイルストーン: Museによる新headのCI／Codex Reviewと指摘thread解決確認。最新CI／再レビューは未確認。実装担当は保存・報告後に終了し、監視・終了後の継続実行は登録しない。Issue #70の別branch #288のcheckpointは本修正で上書きしない。

## 2026-11-07 マイルストーン1: 自動置換なしの土台

Status: Accepted

確認日時: 2026-11-07T21:49:03+09:00（Asia/Tokyo）。今回の指示は新規Draft PRまでであり、既存のmerge／環境変更承認を適用しない。以下の過去checkpointは履歴である。

- main `3c62ca5`からbranch `codex/foundation-no-automask-20261107`を作成し、PR #279を含む#282 head `573b921`の最終treeを回収。製品appsの差分は未使用の自動mask専用`capture/screenshot.js`削除だけ。raw画像、明示確認、caption・幾何・privateValueContext、保存、手動編集、Officeを維持する。
- migrationは0006→0007を含む。0008、#280、#284は回収せず、既存PRコメント・merge・deploy・remote環境変更は行わない。
- `npm run check`と指定の個別Core検査が成功。editor browser 28/28、native raw記録1/1、sidepanel3/3、caption6/6、semantic2/2、Office／手動個人情報編集、cloud／share／onboarding全32ケースを確認した。実記録2手順・2画像のlocal Worker保存・共有・画像bytes一致・共有失効拒否も成功。
- runtime本体6/6成功。first-accessだけはproxy tunnelによるnavigation失敗で対象経路未実行。remote Access／D1／R2、実Officeアプリ、3表示モードの全native通し受入は未確認。CI／Reviewは新規Draft headで別に確認する。
- 根拠、初回失敗の切り分け、P2持越しと再triage期限は[検証報告書](foundation-2026-11-07.md)。保存先は新規Draft PRとこのbranch。次の1マイルストーン候補は#284の認証＋統合修正移植だが、今回は未着手。自律監視やセッション後の開発継続は設定しない。

## Issue #281 / Draft PR #282 最新checkpoint

Status: Accepted

確認日時: 2026-10-03T22:07:44+09:00 (Asia/Tokyo)
- source baseは `92e37627bc699acd5886b6ff27ed90203baa8080`。最新Review5400080256の新P1（raw画像の利用者確認欠落、thread PRRT_kwDOTpNknc6omG6p）を修正した今回の差分はcommit前。写真のbytesを保持し、既存manual_image_review・確認ボタンを使って保存・出力前に確認を求める。自動PII検出・黒塗り・架空値への置換は再導入しない。確認済みと未確認を区別し、protected画像のbytes欠落はstorage_failedとして復旧を案内する。
- 親が今回のnpm ci、119/119 unit・skip 0、docs141・秘密値444・diffを確認。担当の公式CFTによる実記録1/1、実editor確認2/2、実sidepanel3/3と既存Worker/D1/R2記録連携（2手順・2画像、保存/共有画像bytes一致、共有失効拒否）の結果・対象差分を回収。外部Google/ChatGPT認証やremote D1/R2の成功証跡ではない。新commitのCI・Codex Reviewは未実行で、P1 threadは検証後に解決する。
- ユーザーの追加指示はGoogle・ChatGPTログインからworkspace・保存・Office出力までの一貫実装。別checkoutの認証branch `codex/manual-product-auth-283`、base `fb5dca7fcdd8c575f940548229526aead6cbc294` で共通session/OIDC/D1認可の実装差分を実確認した。製品ログインは未稼働。ChatGPT商用websiteは公式の限定trial/client登録が必要で、IAB申請フォームの本人必須表記を質問中、申請は未送信。identityとAI利用枠の許可は別で、AI初期OFF。remote migration/deploy/Access/billing変更なし。
- 対象source HEADは `dc119d18e6548f9fb05a3bb34ec55fcb686d2b17`、branchは `codex/manual-explicit-privacy-office-019`。Office要件（Word/PPTも出力前にログイン、guestは作成・編集可、認証済みworkspace claim後に端末生成、共有は別操作）へのユーザー回答済み。closed-editor復帰receiptの実装は `af6f107` + `0510bcd`、Office snapshot browser回帰は `dc119d1` に反映済み。release検証は未完了。
- 親が実MV3のclosed-editor復帰→Word/PPT両形式ダウンロード、別形式/別launch拒否・receipt未発行、二回目consume拒否・重複downloadなしを1/1、skip 0、exit 0で確認（source `dc119d1`、今回のruntimeテスト差分）。Office関連unit37/37 pass、component browserは `dc119d1` で1/1 pass、skip 0。npm ciは親で成功。Windows `npm run check` は docs/brand/worker/editor-tools/typecheck 通過後、既存 `wrangler.cmd` の `spawnSync ... EINVAL` で停止。一方、`dc119d1` のLinux Docs CI run37113055230/job111174537678でnpm ci/fullcheck成功をログ照合済み、Privacy run37113055312のOffice stepも成功。今回の新headのCIとCodex Reviewは別途必要で、旧SHAの成功を流用しない。
- Google clientは作成済み、資格情報はrepo外でDPAPI保護保存済み。製品Google authは未実装。auth docsのremoteは `fb5dca7`。実SSOとnative Office描画は未確認。
- P2 triage（今回ソース変更なし）: handoff期限後にclaim結果をGET回収できても、期限切れhandoffはterminalで旧Office出力を再開せず、編集画面から新しい認証・形式選択へ戻す。これは古い認証・操作を黙って再利用しない意図的な安全境界で、原本・新しい編集・既存cloudRefは保持される。最低限この境界を維持し、後続で「もう一度Word/PowerPointを書き出す」と明示する再選択案内を検討する（親PM担当、2026-10-08）。
- P2 triage（今回ソース変更なし）: 外部editor更新によるstale cloudRefの409は、対象版をlatestへ自動差替えせず、元のlocal draftとcloudRefを保持してfail-closedする契約。409で上書きを拒否する境界は維持するが、同じ古い参照で再試行を繰り返すしかない導線はUX上の欠陥として保留する（影響: 外部更新後の当該下書きではOffice出力とクラウド更新を継続できない。担当: 親PM、期限: 2026-10-08）。安全な最新版確認・差分確認・明示選択の設計が必要なため、今回の自動出力修正へ混在させない。後続修正では409後に利用者が最新版を確認して明示選択した場合だけ新しいoperation/claimを作り、同じ参照を自動再利用しない。期限後結果回収とstale参照のいずれも、このmilestoneでは自動再出力・silent revision substitutionを追加しない。
- P2修正（review4173032863 / thread `PRRT_kwDOTpNknc6onN7S`）: `persistCandidate` が `draft.steps` をcloneして置換した後も、画像編集・確認ボタンのclosureが古いstepを描画し、確認済み画像が選択中パネルで要確認のまま残る経路を修正した。保存後・確認後は現行`draft.steps`の対象stepを再取得して描画する。二回目の画像編集後に明示確認し、選択パネルが即時に確認済みへ切り替わる実browser回帰を追加し、editor browser suite 28/28、`node --check`、`git diff --check`を確認済み。対象commitは親回収・保存待ち、未release、最新headに対するCI／Codex Review／thread解決は未確認である。
- 次の1マイルストーンは、最新headでMV3 runtime、CI、Codex Reviewを照合し、上記P2の再選択・明示選択導線を別bounded unitで判断すること。

# セッション引き継ぎ運用

## Issue #281 / Draft PR #282 現在checkpoint

Status: Accepted

確認時点: 2026-10-03T13:28:38+09:00（Asia/Tokyo）／source head d19065cf7fbe4259f4160b25ebc5db6c0aa56dab、branch codex/manual-explicit-privacy-office-019。既存の引き継ぎ履歴は保持する。

- User 0.1.8 ZIP（全33ファイル）は a44dde8d21066f8657fa11b4143ccfdf87f2f0e2。base Draft PR #279を保持する。
- 実装方針は、自動PIIマスク／値置換を停止し、明示した画像個人情報modeだけを扱う。同一の架空人物について氏名とカナをそろえ、Word／PPTはローカル20画像exportとする。remote API writeは行わない。
- 親のcapture関連検証は865 native 1/20 operations、ccc188 unit、dd817 Office 2 browser／20 images／XML reader（実Office描画未実施）。f6 latest worker 74／Office 13／UI390はtestpassだが、親source修正直後の再検証中である。
- CI 865にはasset hash mismatchとOfficeDL 8s timeoutが残り、修正候補を進行中である。全体成功・完成とは扱わない。
- Cloudflare管理UIの読み取り確認（2026-10-03T13:26+09:00、Asia/Tokyo）では、対象owner stagingappはCloudflare IdPのみ、OTP未登録、owner emailのallowは1件だった。設定変更、production、DB migration、deployは実施していない。OTP設定追加／対象app切替案は停止・不採用とし、CF accountを用意させない普通メール登録／ログイン、Google／ChatGPTログインを新製品authの設計条件とする。
- OpenAI公式のSIWC資料（https://developers.openai.com/siwc/quickstart、https://developers.openai.com/siwc/token-sharing-open-source）に基づくidentity／利用枠scope、commercial remoteの限定trial／waitlist、OSS localの一般対象は、auth migrationの別bounded単位で設計する。AI利用枠は初期OFFとし、未登録client／未承認commercialを完成扱いにしない。 関連するAPI／DB／auth契約移行はIssue #283の別bounded単位とする。
- PR #279 migration 0006／0007は未承認・未適用、商用公開は未確認、main mergeの自動実行は禁止する。
- 次の1マイルストーンは、最新exact full SHAに対するCI／Codex Review／UI検証、限定0.1.9 ZIPの確認である。残る未確認環境を明記し、auth migrationは別Issueのbounded設計として切り出す。

Status: Accepted

## Issue #272 / PR #278 現時点snapshot

Status: Accepted

確認時点: 2026-10-01（Asia/Tokyo）／source修正commit `fa7d1ee31cd6a44a8dcea5de75711de7e9d7386f`、source branch remote head `dd19e89e2145f28dd3cf6d73773ba758d2d6a4c9`（docs同期後）、PR #278 head `f9c49bb7de9da1a6716478abe5e19f4c97e2b6db`（source回収前snapshot）

- `fa7`の画像差し替え競合修正は、遅延bitmap decodeと同一screenshot IDを使う実ブラウザ回帰を含め、追加ケースおよび既存editor browser 18/18で確認済み。差し替え成功時は旧画像editorを閉じ、bitmap identityが異なる旧dialog保存を拒否する。
- 親のintegration `f9c49bb7de9da1a6716478abe5e19f4c97e2b6db` はsource回収前snapshotである。現在のintegration head、CI／Codex Review、対象UXの実確認、限定配布状態はIssue #70とPR #278から再取得する。owner本人による実SSO確認も未確認である。
- 次の1マイルストーンは、最新integration headで全品質ゲート（CI・Review・対象UX・限定配布境界）を確認し、Issue #70とPR #278のlive stateを同期することである。

## Issue #262 / manifest 0.1.5 離脱警告回帰（作業中）

Status: Accepted

確認時点: 2026-09-27（Asia/Tokyo）／native・unit回帰実行後

- 対象: manifest `0.1.5`候補で、通常の送信pendingと送信失敗・保存成功未確認を分離し、通常リンク／フォーム遷移では離脱警告を出さず、失敗時の再試行保護とサイト自身のbeforeunload警告を維持する。retain中の未保存batchも保護する。
- 検証済み: `extension-sidepanel-browser.test.mjs` native MV3 2/2、extension unit 110/110、cloud claim unit 12/12、通常遷移前後のclick／input／navigation／form submit保持、世代違いACK、失敗後再送、retain警告。`npm ci`成功、docs／encoding／diff check成功。
- 未確認: `npm run check`は既存brand checkの`_headers` cache rule不足で停止した。最新CI・review・配布候補の状態はIssue #70のlive stateを参照する。今回Worker、DB、productionの変更はない。

次の1マイルストーンは、本人の拡張機能更新後にIssue #262の通常遷移・保存失敗・サイト自身警告を実Chromeで確認し、Issue #70へ最新CI／review／配布証跡を同期することである。

## Issue #260 / PR #261 実記録からWorker保存・共有までの回帰（未完）

Status: Accepted

確認時点: 2026-09-27（Asia/Tokyo）／source化した回帰試験のsnapshot

- 対象: native sidepanelがexportしたdraftの実画像bytesを、実Worker route・D1 migration／SQLite adapter・memory R2へ保存し、cloud viewerと共有viewerで復元・CSP・共有停止を確認する回帰試験。CIではsidepanel test直後に `scripts/verify-recorded-workflow.mjs` を実行し、draft pathが欠落した場合は失敗させる。
- 検証境界: 現在は合成JWT、local Worker、SQLite D1 adapter、memory R2の再現可能な証跡であり、実Access、remote D1／R2、staging deploy、owner限定本番相当データの成功を証明しない。metadata出力へ画像bytes、token、passcodeを残さず、PNG成果物はこの合成検証の画面証跡に限定する。
- 旧版の扱い: 旧拡張版は記録終了時に最後の操作へだけ画像を付けていた。保存されていない過去の画像は復元できず、必要な手順は新版で再記録する。過去の単独API smokeを実記録からの通し成功として流用しない。

次の1マイルストーンは、Issue #260／PR #261のlatest SHAへCI・review・品質ゲートを照合し、承認済み範囲で限定反映と引継ぎ記録更新を行うことである。本番成功や最終SHAはこのsnapshotでは判定しない。

## D1共有リンク引継ぎ（Issue #258 / PR #259）

Status: Accepted

確認時点: 2026-09-26（Asia/Tokyo）／PR準備時点のsnapshot

- 対象: D1 migration `0005_d1_share_links.sql`、共有linkのcrypto／router、`/s/` viewer、Access/D1 index dispatch、D契約、ADR-0034。管理APIはAccess認証済みowner/admin/editorだけが発行・停止し、匿名viewerはtokenのfragmentをWorker request headerへ移して短期grantで本文とprivate R2 assetを読む。snapshotはpublished revisionと新規step IDで固定し、draft編集は共有内容へ反映しない。
- PR準備時点の状態: Issue #258、PR #259を正本候補として扱い、`0005`はremote D1へ未適用、D Workerは未deploy、Access配下の`/s/*`は未公開だった。以降のPR head SHA、最新CI、最新Codex Review、merge、migration、deploy、公開、C owner本人による実Chrome拡張E2Eの現在値はIssue #70とPR #259のlive stateから再取得し、このsnapshotを現況の根拠にしない。
- 確認済みの範囲: localの共有backend／runtime、viewer browser（mock API）テスト、migration／契約／ADRの対応を確認する。mock APIのbrowserテストは実D1認可、実Access、実R2、remote migration、deployを証明しない。
- stagingの次の実行条件: 親PMがIssue #70とPR #259のlive stateで対象SHA、migration順序、CI／review、owner限定staging binding、Access policy、private R2、rollback条件を照合した後に限る。D1 migration適用、Worker deploy、Access `/s/*`公開、production反映、実データ操作はこの引継ぎから自動実行しない。
- 利用者確認では、実在のtoken、passcode、workspace ID、画像、Access credential、個人情報をログ、Markdown、スクリーンショットへ残さない。実行証跡は合成値または承認済みowner限定stagingの最小結果に限定し、live状態は毎回Issue #70とPR #259で再取得する。

次の1マイルストーンは、PR #259の最新headに対するCI／review／merge状態と`0005`のremote適用、D Worker deploy、owner限定stagingの`/s/` viewer通し確認を親PMが照合し、未確認項目を残したまま公開・完了判定へ進めないことである。

## 目的

### 2026-09-17 release作業の追加確認

- PR #245: 横方向scrollの保持、開始失敗直後の復旧UI、navigation時の二重保存失敗でもrecorder再注入、残存starting状態の復元を修正。拡張機能のローカル回帰テスト49件成功。最新SHAのCI/review/mergeはGitHubで再照合する。
- 二重保存障害時の再注入失敗表示は同一service worker生存中の補助状態でも保持する。保存領域の障害とworker強制終了が重なる場合の永続復旧は保証しない。
- PR #250はS2 bootstrapのみの積み上げPR。`601df7a`でoperation IDのASCII文字種・長さ・NUL拒否をDB制約へ追加し、直接DB書込みを含むHTTP/D1テスト30件成功。handoff/upload/claimと実環境検証は未完了。
- 読み取り専用Cloudflare監査run `35117878090`は失敗。CI用認証ではD1取得は認証無効、R2取得は権限不足、取得ページ内のAccess applicationは0件。専用staging Workerは未作成。既存Workerへ代替deployしない。
- 作業対象は専用開発checkout・対象GitHub repository・関連検証環境に限定する。業務フォルダ、通常の業務ブラウザ、実業務情報は検証に使わず、外部へ送信しない。

長期開発を特定のChatGPT/Codex会話へ依存させず、新しいセッションがGitHub上の正本と実状態・証跡を照合して安全に作業を再開できるようにする。

会話履歴は補助情報として扱い、正本の優先順位は `AGENTS.md` に従う。コード、migration、設定、commit、CI、review threadは、正本どおりに実装・検証されているかを確認するための実状態・証跡として扱う。

## 現在地の正本

プロジェクト全体のライブな現在地は、GitHub Issue #70 `META: 開発現在地・セッション引き継ぎ` に集約する。

正本の優先順位は `AGENTS.md` の文書運用に合わせ、次のとおりとする。

1. ADRと `docs/09-delivery/decision-log.md`
2. 要件、データ、API仕様
3. UX仕様
4. Issue分解・対象Issue・Pull Request
5. task reports、Issue #70の現在地サマリー、過去の会話や手作業の要約

実際のコード、migration、テスト、設定ファイル、commit、CI、review threadは、正本の内容が実装へ反映されているかを確認するための実状態・証跡として必ず照合する。正本と実状態が矛盾する場合は、実装側を自動的に正として扱わず作業を止め、`docs/09-delivery/open-questions.md` に登録して解消する。

Issue #70とGitHubの実状態が食い違う場合は、正本との整合を確認した上でIssue #70を更新する。古い記載を前提に実装を続けない。

## セッション開始手順

新しいセッションは、過去チャットの全文ではなく、次を順番に確認する。

1. `AGENTS.md`
2. この文書
3. GitHub Issue #70
4. 対象Epic、Issue、Pull Request
5. 対象branchの最新commit、base branch、`main`との差分
6. 最新head commitに対するCI、Codex Review、未解決review thread
7. 関連するFR、NFR、ADR、AC、API、データ、UX、テスト文書
8. `docs/09-delivery/open-questions.md` と `risk-register.md`

実装前に、次の形式で現在地を整理する。

- 完了済み
- 未完了
- 現在の問題または矛盾
- 対象Issue、branch、Pull Request、head SHA
- 次に行う1マイルストーン
- リスク
- owner承認が必要な操作

## セッション中のルール

- 原則として1セッションで1マイルストーンだけを進める。
- 日付が変わっても、未検証の変更を無理に区切って完成扱いにしない。
- 無関係な変更を同じbranchやPull Requestへ混ぜない。
- mainへ直接pushしない。
- 複数branchを並行する場合は、base/headと依存順を明記する。
- 同一head branchを異なるbaseへ向けたPull Requestがある場合は、正しいレビュー経路を先に確定する。
- 会話全文や生思考は保存せず、結論、根拠、採否、リスク、未決だけを記録する。

## 進捗報告と停止時の対応

Status: Accepted

適用日: 2026-09-09。`AGENTS.md` の「進捗報告と実行管理（恒久ルール）」を、通常作業・担当への委任・引き継ぎ・自動実行の報告に適用する。読み取り専用の実行は確認と報告に限定し、実装再開や設定変更の権限をこの手順から追加しない。

### 報告直前の確認

1. 対象の実行IDと現在の実行状態をツールで取得する。依頼成功は開始の証明ではない。過去の実行中表示や担当の発言だけでは現在の稼働を断定しない。
2. 担当checkoutの未commit差分・ローカルHEADと、GitHubのPR head SHAを照合する。差分がある場合は内容を確認する。リモートSHA不変とローカル作業なしを同一視しない。
3. テスト結果、CI、レビューの対象SHAを照合する。CI待ち・レビュー待ちは、その実行／依頼が存在し、どの状態にあるか確認する。古いSHAの成功を最新SHAの成功として報告しない。
4. 指摘をID／URLで整理し、新規・持越し・修正確認済み・解決確認待ちを区別する。未解決thread数と現存欠陥数は別々に数える。現行コードとの照合前は欠陥数を確定しない。
5. 前回から検証できた利用者の操作・機能、解消した欠陥、残る障害を示す。成果が増えていなければ、その事実と現在行っている処理を記載する。

取得できない項目は「未確認（理由）」、対象が存在しない項目は「該当なし」とする。毎回すべてのログを貼らず、以下の項目を現在地の記録へ簡潔に残す。

| 項目 | 必須の内容 |
| --- | --- |
| 確認日時・対象 | ISO 8601（Asia/Tokyo）、Issue、PR、branch、担当checkout |
| 実行状態 | 未着手／依頼済み・開始未確認／実行中／待機／停止／終了／未確認、実行IDと確認根拠 |
| 成果物状態 | 修正未確認／ローカル修正済み・未push／PR反映済み／検証済み／完了、差分の有無とローカルHEAD／PR head SHA |
| 検証・レビュー | 対象SHA、テスト／CIの結果、レビュー依頼・実行・結果、未実行と理由 |
| 指摘 | 新規数、持越し数、未解決thread数、現存確認済みの欠陥と未照合事項 |
| 利用者にとっての進展 | 検証した操作・機能、解消した欠陥、残る障害 |
| 次の行動 | 次の1マイルストーン、担当、次の確認条件、必要な承認 |
| 継続・引き継ぎ | 継続を担う確認済み実行／監視、または停止理由と再開条件、Issue #70／PRの未同期箇所 |

「検証済み」は明示した検証範囲だけを意味し、「完了」は既存の全品質ゲートと対象マイルストーンの受入条件を満たした場合に限る。実行が終了しても成果物が未push・未検証なら未完了である。

### 担当停止・停滞時の対応

1. 親セッションは担当の開始を確認し、稼働中は利用可能な完了待ち・状態確認を使って結果を回収する。依頼しただけで責任を終了しない。
2. 停止・中断・失敗を検知したら、最後の成果物、未commit差分、未push commit、実行中の処理、ロックの有無を確認する。担当の「テスト成功」は結果を照合するまで自己申告として扱う。
3. 既存差分を保全し、同じcheckoutへの重複編集やGit操作を避けて、承認済み範囲で新しい独立タスクを指示する。親による直接修正はユーザーが明示した場合に限る。状態不明のロックを推測で削除しない。
4. 再開した場合は開始を確認する。再開不能なら、確認した失敗、残作業、必要な入力・環境を通知する。「進行中」と言い換えたり、次のユーザー問い合わせまで放置したりしない。
5. 同じ原因の手戻りが繰り返されたら、次の再依頼前に原因・採用する修正方法・検証方法・担当範囲を見直し、結論を既存のPRまたは引き継ぎ記録へ残す。品質ゲートを緩めて進捗を作らない。

### 指摘を解決するまでの記録

各指摘は、既存PRで次の対応関係を維持する。別の重複管理台帳を必須にしない。

`指摘ID／URL → 妥当性と現行コードの確認 → 修正commit → 回帰テスト結果 → 最新SHAのレビュー結果 → 根拠返信と解決確認`

妥当な既知指摘を未修正のまま再レビューへ送り直さない。P2を保留する場合は既存品質ゲートの理由・影響・担当・期限を残す。outdatedや表示上の消滅だけで解決とせず、修正根拠とcommit SHAを返信してから解決する。最新レビューの新規指摘と過去からの持越しを合算して「今回の追加指摘」と呼ばない。

### 自律監視の登録・稼働確認

- 設定の提案、登録確認、稼働確認を区別する。保存された設定ID、有効状態、対象タスク／PR、スケジュール、次回実行予定を取得して登録を確認する。既存監視を調べ、重複登録を避ける。
- 初回実行のID・日時・結果を照合し、対象状態の取得と必要な対応が実行されたことを確認する。初回結果がまだなければ「登録確認済み・初回実行未確認」と報告する。
- 監視の指示には、各実行で何を確認し、停止時にどう復旧し、いつ通知・終了するかを保存する。担当停止・失敗・未完了の再開不能を、通知不要の「変化なし」に分類しない。
- 実行環境や権限の制約があれば明記する。セッション終了後の継続は確認できた実行・監視に基づいて報告し、端末・アプリの停止など未検証の条件下で常時稼働を保証しない。
- 文書更新だけで監視設定が変更されたとは扱わない。既存監視の保存済みプロンプトへ未反映の場合は、その未同期を明記する。
- 日次read-only監視は復旧操作義務の明示的な例外とする。停止・失敗・再開不能を報告するが、書込み・再開・設定変更は行わず、必要な復旧条件だけを示す。書込み・復旧権限を委任された別の監視に限り、保存された手順と承認範囲に従って復旧を試みる。

## 独立タスクの作成と引き継ぎ

Status: Accepted

適用日: 2026-09-09。親PMは`gpt-6-astra`（既定reasoning `high`）、作業担当は`gpt-5.6-luna`（既定reasoning `high`）とする。task作成前に親・担当のmodel／reasoningを選択・記録し、作成後に実行設定を取得して確認する。プロンプト本文への記載だけでmodel／reasoningの切替済みとは扱わず、確認できない場合は未確認として記録する。

- 親PMは範囲、受入条件、依存判断、証拠検証、品質ゲート、次指示を担当する。作業担当は明示された1作業単位だけを扱い、サブエージェントを使わず、次の作業タスクを自己増殖させない。
- 親は既存の担当稼働とファイル範囲を確認してから、限定作業ごとに新しい独立タスクを1つ作成する。通常は同時1タスクとし、競合しない範囲の並行だけを明示的に許可する。
- 作業担当は、目的・範囲・受入条件・検証・GitHub参照を含む短い作業契約を受け、受入条件が閉じるまとまりで通常の実装、テスト、文書編集を行う。会話全文や1行修正ごとの報告を引き継がず、成果物をGitHubへ保存した後、対象branch／PR／head SHA、変更要約、検証結果・未検証、残存リスク、次の判断を短く報告する。無変更の全テストや同一SHAレビューを反復しない。親が停止中なら、GitHubに再開点を残して作業を終了し、継続稼働を主張しない。
- 親は報告を待ってSHA、成果物、検証結果を実取得・照合する。必要な修正や次単位は新しい独立タスクへ指示し、親の直接修正はユーザーが明示した場合に限る。
- GitHubを別PCから復元できる作業正本とする。引き継ぎ・終了前に、必要なコード・MD・再開情報を秘密値除外で専用branchへcommit・pushし、remote SHAと保存先を確認する。未検証の途中作業は安全なbranchへWIPとして保存し、完了扱いにしない。
- 通常の引き継ぎでは、PR本文またはコメントとIssue #70の両方へ、リポジトリ、branch、PR、head SHA、未完了事項、次の1マイルストーン、再現コマンドを絶対ローカルパスや会話全文なしで記録する。PR未作成などの例外は、理由と作成条件をIssue #70へ明記する。push失敗は実エラーと代替試行を記録して未完了通知とする。
- 保存前の差分、未push commit、stash、worktreeを唯一の再開元にせず、remote保存確認後に今回作成した一時ファイルや不要checkoutだけを安全に整理する。cache、認証情報、秘密値はGitHubへ入れない。
- 保存前の差分・未push commitを破棄せず、他作業のファイル、commit、stash、worktreeを削除しない。終了・引き継ぎ前に必要成果物をcommit・pushし、remote SHA一致を確認できない場合は未完了とする。

## セッション終了手順

作業を別セッションへ渡す前に、可能な範囲で次を実施する。

1. 差分を自己レビューする。
2. `npm ci`、`npm run check`、必要な個別テスト、`git diff --check` を実行する。
3. 未実行テストと理由を記録する。
4. 変更を意図の分かるcommitへまとめ、branchへpushする。
5. Pull Requestの本文またはコメントへ、変更内容、検証結果、既知リスクを記録する。
6. 最新head SHAと、CI・Codex Review・review threadの状態を確認する。
7. Issue #70を更新する。
8. 次の1マイルストーンを1つに絞る。

Issue #70には最低限、次を残す。

- 最終確認日時（Asia/Tokyo）
- 現在のPhase
- 完了済み
- 未完了
- 対象Issue、branch、Pull Request、head SHA
- テスト結果
- P0/P1/P2と未解決review thread
- ブロッカー
- 次の1マイルストーン
- owner承認が必要な操作

## 商用リリース前後の開発操作承認

Status: Accepted

適用日: 2026-09-09。対象は開発継続とGitHub上のpush／Pull Request作成・更新／mergeであり、production反映、課金、機密情報保存、破壊的操作などの既存の別承認境界は変更しない。

- 商用リリース前は、Astra highの親PMが変更の正当性、依存順、必要な品質ゲートを実SHAで確認すれば、ユーザーへの都度確認なしに作業継続、commit、push、Pull Request作成・更新、mergeを行ってよい。保護ブランチ、必須CI、review thread、既存の安全条件は迂回しない。
- 商用リリース後は、push、Pull Request作成・更新、mergeなどの外部反映ごとにユーザーの事前承認を得る。承認待ちでは可逆的な差分・テストによる具体案の準備は可とするが、外部反映前に対象SHA／差分を提示し、未push成果物だけを残して終了しない。承認待ちが必要なら明示する。終了前push必須の規則は、作業開始前に得た具体的な承認範囲がある場合に限り適用する。
- 商用リリースの実施時は、日時、リリース識別子、根拠をIssue #70へ記録して承認境界を切り替える。記録が不在または曖昧な場合は商用リリース状態を未確認とし、未リリースと決めつけた自動mergeを行わず、read-only確認と提案を先に行う。
- 最初の商用公開そのもの、production反映、課金、機密情報保存、破壊的操作などの既存の別承認境界は、この開発操作承認によって拡張しない。
- 古い一般的な「owner承認待ち」だけを理由に、商用リリース前の通常のpush、Pull Request作成・更新、mergeを停止しない。商用リリース前はAstra high親PMの実SHA確認と品質ゲートを適用し、商用リリース後は操作ごとにユーザーの事前承認を得る。

## Product / Development current state (2026-09-13)

### 最新差分（2026-09-16）

追記（2026-09-17）: 追加reviewの終了時journal失敗・window close競合・closed-shadow top-layer・canvas秘匿へ対応。入力／scrollはpagehide前からcheckpoint送信し、未ACKで離脱する際はbeforeunload警告を要求する。ブラウザ強制終了や警告を無視した離脱の永続化まで保証するものではない。拡張テスト43件と、実Chromeのclosed-shadow modal／canvasマスク・復元テスト1件が成功。S2 bootstrapは専用branch `codex/s2-onboarding-bootstrap` の `2a19ffb` へ保全し、HTTP／D1回帰29件成功（まだmain未統合・staging未適用）。

最新のowner指示はChrome Extension／guest-first方針でPR #245のS1統合からS2保存・ログイン連携へ進めること。旧PR #223はmainへmerge済みであり、旧M4を先行させない。

- PR #245の基準head `a9eccc88661bb171590708f3a733b4c65228f4bf` に対するreview 5205315585の3件を修正。入力欄切替とscroll container切替の未ACKイベントをfinishまで保持し、closed shadow hostのマスクをsubtree全体に効くopacityへ変更した。
- 追加review 4028320592の指摘に対し、navigation時の再注入失敗markerを保存領域の失敗時にも同一service worker内のfallbackとして保持し、finish_failedなど後続phaseの永続化に成功した時点で解除する回帰修正を行う。再注入失敗後の終了失敗からsmartphone/tablet再試行までのservice worker VM回帰を追加した。
- 追加したservice workerのVM回帰テストを含め `npm run extension:test` は52件成功。今回の `npm run check` は `docs:check` 成功後、既存のbrand `_headers` cache rule不足で停止したため、brand以降は未実施で全体成功とは扱わない。
- この記録を含む最新SHAのCI、review、unresolved thread、merge状態はPR #245で確認する。S2、staging deploy、公開URL smokeはまだ完了していない。
- 次はS1のexact-head品質ゲートを満たして統合し、Issue #228のsecure handoff／bootstrap／claimを実装する。S1を保存・共有・PDFまで完成したMVPとは扱わない。

### 2026-09-20 A: guest editor mask gesture

- PR #245の先行修正 `73b3f0655e92a89b6ad0fac4e79ed472f160072d` をbaseに、`editor.js` で画像のネイティブドラッグを無効化し、`pointercancel` 時にドラッグ開始点を破棄した。統合用commitは `9870313`。
- `tests/extension-editor-browser.test.mjs` を追加し、合成local draftをHTTP fixtureへ保存して、実ブラウザのmouse gestureによるマスク追加、IndexedDB再読込後の保持、削除後の再読込を確認する。`node --test tests/extension-editor-browser.test.mjs tests/extension-mvp.test.mjs` は23件成功した。これは旧来のextension test／mask testの証跡とは分けて扱う。
- マスク操作の実装修正・ローカル回帰は完了。A全体は最新SHAのCI、Codex Review、merge確認待ち。このセッションではB以降未着手で、次の候補はB。PR #245の最新CI、review、unresolved thread、merge状態はIssue #70とPRのライブ状態を正本として確認する。この記録だけではそれらを完了扱いにしない。

### 2026-09-20 A: capture metadata／記録完全性 review修正

- PR #245の追加review 4056043437／4056043441／4056043444に対し、clickの表示由来metadataを固定semantic labelへ正規化し、storage二重障害時のnavigationを同一session ID限定のfallbackから後続session／draftへ重複なくmergeし、記録開始時に既存scroll要素の現在位置をseedする修正を追加した。
- 動的に追加された未知scroll要素は初回位置を0と推測せずseedだけ行い、次の差分から方向を記録する。この制約とservice worker終了中の一時fallback非durabilityはADR-0031／DEC-071／requirements-traceabilityへ反映した。
- `node --test tests/extension-mvp.test.mjs tests/extension-pending-events.test.mjs tests/extension-finish-recovery.test.mjs` は40件成功。全体の`npm ci`／`npm run check`／CI／Codex Review／push後SHA一致は親PMが最新headで確認する。

### 2026-09-13のpivot基準（Historical）

以下はpivot時点の記録である。後続の個別PR節および末尾のPR #240 review節はHistoricalであり、現在地や次マイルストーンの正本として使用しない。

- PR #242はmerge済み。確認済みmainは `5697d1969bdbac629084671fe708181c55dd514f`。
- MVP capture runtimeはChrome Extension Manifest V3だけとし、Cloudflare Browser Run／Browser Session／Live ViewはLegacy／Historicalで、fallbackしない。
- backendはCloudflare Access／Workers／D1／private R2を正本とする。Supabase Auth／Postgres／RLSはmigration baseline／historical implementationであり、新規Product機能の土台として拡張しない。
- development／staging Accessは明示Emails／Groups allowlistを維持する。production商用MVPの一般利用者はOne-time PINでself-service本人確認へ到達できるが、Access到達はbusiness authorizationを意味しない。
- Personal WorkspaceのD1 discriminator／一意制約、guest onboarding、authenticated staged asset upload、idempotent claim、KPI observability correctionの契約はPR #242でmainへ統合済み。

次の1マイルストーンは、PR #234 `fix(extension): persist capture session across Manifest V3 service worker suspension` をこのmainへ追従し、Product／security contractとの差分を閉じることである。最低限、次を確認する。

- original Chrome window boundsとstateのsession persistence、maximized／fullscreenからnormalへの遷移、completion／cancel／failure／target tab close時の復元
- MV3 service worker suspension後のcapture継続
- guest editorのstep削除／並べ替え／screenshot確認／masking
- sensitive DOM／input情報の最小化
- secure extension → authenticated web app handoffとoutput gate integration boundary
- PDF MVPへの依存

secure handoff／bootstrap／claim等がPR #234のreview可能なscopeを超える場合は、Issue #228等の後続S2 sliceへ明確に分け、PR #234をMVP全体完成と報告しない。

## PR #78 実行引き継ぎ（2026-08-17）

この節は、PR #78 `feature/phase2-manual-editor-ui` をowner承認後にmergeできる品質へ仕上げた実行の固定証跡である。最終head SHA、最終CI、最終Codex Review、未解決thread数は、この文書を含むcommit自身では確定できないため、PR #78とIssue #70のライブ状態を確認する。

### 確認済みの基準

- main: `807f3b240c5c476a4e01e8ad4979a12ab66ce468`
- PR: #78、base `main`、head `feature/phase2-manual-editor-ui`
- code-validation head: `f287db3f989a655715f14b01c0e8b7afcd06b1ba`
- mainからのbehind: 0（mainを2-parent merge済み）
- 一時workflow `.github/workflows/apply-pr78-final-three-fixes.yml`: 削除済み
- 一時適用script `scripts/apply-pr78-final-three-fixes.py`: 削除済み
- staging／production migration、deploy、課金、外部AI API、共有リンク、外部ユーザー招待: 未実行

### 恒久修正

- 結果不明のmanual作成状態をworkspace単位で保持し、workspace切替や遅着list GETで警告を失わない。
- 初回detail取得中の所属・権限失効を、一覧へ戻った後も含めfail closedで再描画・再取得する。
- manual、current draft、steps、編集可否を`get_manual_edit_detail`の単一SQL／MVCC snapshotから返す。
- direct step RPCとWorkerで、userinfo、authority、IPv4／IPv6、port、punycode、underscore host、空白・制御文字、backslash、入力・serial化後長さのURL境界を一致させる。
- 最終Codex Reviewで確認されたRFC 3986 ASCII delimiter（`'`、`;`、`=`）を、Worker・direct RPCの共通URL budgetでWHATWG同様に数え、apostropheはquery内の`%27`とpath／fragmentの1文字を区別する。
- 追加・更新RPCの不正URLを`400 MANUAL_STEP_URL_INVALID`へ決定的に変換する。
- FR-004／FR-005の参照をADR-0004／ADR-0005へ修正し、AC-010の公開URLはPR #78ではなくEpic #54の後続範囲として分離する。

### code-validation headの品質証跡

- Manual API: run `32036328711` success
- Manual Edit API: run `32036328713` success（Unit/API、使い捨てPostgreSQL、RLS、RPC、共有lock、migration safety）
- Manual Step Migration: run `32036328703` success（direct RPC正常・異常境界を含む）
- Manual Editor UI: run `32036328750` success（`npm ci`、`npm run check`相当repository checks、Phase 1／2 Playwright、`git diff --check`）
- Phase 1 Readiness Gate: run `32036328706` success
- Docs CI: run `32036328709` success
- Quality Loop Gate: run `32036328700` success
- R2 Storage Policy: run `32036328719` success
- Cloud Codex Readiness: run `32036328712` success
- Business OS Codex Runner: run `32036328701` success
- code-validation head時点の未解決review thread: 0件

ローカル環境では外部npm取得が制限され、Docker／PostgreSQL／Playwright実行環境もないため、`npm ci`、`npm run check`、DB、browser E2EはGitHub Actionsの同一head証跡を採用した。ローカルでは対象Unit/API、Worker runtime、migration・契約静的検査、機密値、encoding、`git diff --check`を実行した。失敗した検査をskipして成功扱いにはしていない。

### 依存関係と次の操作

- PR #67、#68、#73、#75はopen／未mergeのまま。PR #78への包含確認後も、owner承認なしにcloseしない。
- Issue #55はADR-0004／ADR-0005、Issue #72は未merge依存関係へ訂正済み。
- この文書を含む最終headで必須CI成功、Codex Review完了、P0／P1／P2未解決0、review thread 0を再確認する。
- 次の1マイルストーンはownerによるPR #78のmerge承認とmergeである。merge後のstaging migration／deploy、旧PR整理、公開機能は別マイルストーン・別承認とする。

## PR #81 実行引き継ぎ（2026-08-18）

- 対象: Issue #80、branch `agent/phase2-manual-publication`、PR #81、base `main`
- 起点main: `6c6a2511de5830d9003936942b58ef4561d5c878`
- 実装: 表示中revision IDを必須にする公開・次draft作成API、manual row lock内で期待IDを照合するRPC、確認付き編集UI、viewer拒否、結果不明後の詳細再照合。
- DB: `202608180001_phase2_manual_publication.sql`を追加。期待IDなしの旧公開RPCはauthenticated実行不可。公開版は不変のままmetadataとactive stepsだけを次draftへ複製する。
- 範囲外: 未ログイン公開URL・共有リンク、staging／production migration適用、deploy、課金、外部AI API。
- ローカル: `npm ci`、対象Unit/API/UI 74件、Worker runtime 59件、docs、typecheck、migration ordering／safety、bundle dry-run、`git diff --check`を確認。Playwrightは配布元証明書の時刻エラーでChromiumを取得できず、DBはローカルPostgreSQL／Docker不在のためGitHub Actionsで確認する。
- GitHub Actions: 使い捨てPostgreSQLの公開・draft作成・viewer・競合・lock検査を含むManual Edit APIが成功。Phase 1／2 PlaywrightとPhase 1 Readinessを含む最新headの最終状態はPR #81で確認する。
- 最新head SHA、Codex Review、未解決thread数は、この文書を含むcommitより後に確定するためPR #81とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: 最新headで全必須CI、Codex Review、P0／P1／P2、未解決thread 0を確定し、owner承認後にPR #81をmergeする。merge、migration適用、deployは自動実行しない。

## PR #83 実行引き継ぎ（2026-08-18）

- 対象: Issue #82、branch `agent/phase2-manual-archive`、PR #83、base `main`
- 起点main: `f400c647d2da47c7df5e771cb4ff20a79b638bd3`
- code-validation head: `0bf19c91ee07a01ab6dd4ca53eaa30e7c9f7afdf`
- 実装: owner／admin／editor向けの確認付きアーカイブAPIとUI、manual row lock内でworkspace・role・期待`updated_at`を再照合する`archive_manual` RPC、結果不明時の自動再送防止、`manual.archived`監査ログ。全step mutation RPCもmanual→revision順でlockし、成功時にmanualのarchive versionを進める。
- 保持境界: `status = archived`と`archived_at`だけを更新し、draft／published revision pointer、revision、stepを保持する。通常の一覧・詳細・authenticated直接SELECTからarchived manualを除外する。
- 拒否境界: viewer、別workspace、既archived、古いversionを拒否する。未保存フォームがある状態ではアーカイブを開始しない。archived manualのrevision／step／step targetはauthenticated直接SELECTから除外し、専用lock/version経路が未実装のstep target直接DMLはrevokeする。
- 未決・範囲外: 復元、物理削除、関連資源の削除順序はOQ-028で未決。本PRでは実装しない。staging／production migration、deploy、共有リンク公開、課金、外部AI APIも未実行。
- ローカル: `npm ci`、対象Unit／API／UI 79件、Worker runtime 59件、Worker mutation 3件、App auth 87件、Phase 1 accessibility 45件、typecheck、bundle dry-run、docs、workflow、migration ordering／safety、機密値、encoding、`git diff --check`が成功。ローカルDB／Docker不在とChromium配布元の証明書時刻エラーにより、DBとPlaywrightはGitHub Actionsで確認した。
- code-validation headのGitHub Actions: Manual API、Manual Edit API（使い捨てPostgreSQLのRLS／RPC／監査／lock検査）、Manual Step Migration、Manual Editor UI（`npm ci`、repository checks、Phase 1／2 Playwright）、Phase 1 Readiness、Docs CI、Quality Loop、R2 Storage Policy、Cloud Codex Readiness、Business OS Codex Runnerが成功。
- code-validation head時点のreview thread: 0件。最終head SHA、最終Codex Review、Latest Review Gateは、この文書を含むcommitより後に確定するためPR #83とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: この文書を含む最新headで全必須CI、Codex Review、P0／P1／P2、未解決thread 0を再確定し、承認済みのPR #83をmergeする。merge後は別branch／PRでIssue #57のBrowser Run操作記録とdraft生成へ進む。

## PR #85 実行引き継ぎ（2026-08-18）

- 前マイルストーン: PR #83はsquash merge済み。main merge commitは`331e89cb8f48a67917f1e67ab023c1158c00fb27`、Issue #82はclose済み。
- 対象: Issue #84、branch `agent/browser-run-draft`、PR #85、base `main`。親Issue #57は実Browser Run E2E未完了のためopenを維持する。
- 起点main: `331e89cb8f48a67917f1e67ab023c1158c00fb27`。
- 実装: capture start、Live View、command、mobile previewのworkspace付き`/api`／`/v1` APIを、認証・same-origin・owner／admin／editor確認後に`503 BROWSER_EGRESS_NOT_VERIFIED`でfail closedにする。Worker設定・型へBrowser Run／Durable Object bindingは追加せず、Cloudflare通信は開始しない。
- 正規化: click、input completion、navigation、方向付きscrollだけを最大200件受理し、正の一意な数値sequence順へ整列する。重複sequenceは先勝ちにせず、同じsequenceを持つ全eventを除外する。click／input completionのtargetは表示値・入力値由来でないことを証明できないため常に`対象`／`入力欄`へ置換し、navigation URLもpathへ秘密値が埋め込まれ得るため保存しない。未知field、入力値、Cookie、Authorizationは出力へ複製しない。
- draft: 外部AIを使わず、日本語manual step候補を決定的に生成する。同方向の連続scrollは1件へ集約する。DB／R2への保存、manual revision RPCとの接続は後続。
- 既存回帰: archive DB検査を固定draft UUIDではなくcurrent draft pointerへ追従させた。結果不明archiveのPlaywright fixtureはChromiumの透過再試行を誘発し得る`route.abort()`を使わず、不正JSON応答で決定的に再現し、archive API呼出1回を明示検証する。archive後の一覧遷移は選択キーをworkspace実体と誤認せず、現在sessionのactive workspaceを再解決して`undefined` workspace APIを防ぐ。
- Codex指摘: input／click labelとnavigation pathへの秘密値混入（P1）、workspaceなしの古い正規API契約、重複sequenceの入力順依存と型predicate不一致、方向なしscroll、navigation URL非保存の下流データ・運用契約反映漏れ（P2）をコード・仕様・回帰テストへ反映した。実際に解決したthreadだけをresolveした。
- ローカル: `npm ci --ignore-scripts --cache /tmp/meccha-npm-cache`、capture Unit/API/privacy 11件、manual editor UI Unit 5件、Worker runtime／mutation、App auth、Phase 1 accessibility、typecheck、bundle dry-run、docs、workflow、runtime boundary、機密値、encoding、`git diff --check`を確認。ローカルChromiumはnetwork approval制約により取得できないため、Phase 1／2 Playwrightは同一headのGitHub Actionsを証跡とする。DB変更はない。
- 安全境界: OQ-006／DEC-032が要求する全Browser通信のactual peer検証は未完了。承認済みhostも例外にせず、P0実証が完了するまで実Browser Run、Live View URL、navigate、mobile previewを有効化しない。staging／production deploy、migration、課金、外部公開も未実行。
- 最新head SHA、全必須CI、最新Codex Review、未解決thread数、merge結果は、この文書を含むcommitより後に確定するためPR #85とIssue #70のライブ状態を正とする。
- 次の1マイルストーン: PR #85を承認済み条件でmerge後、Issue #57のP0 egress検証を、navigation、subresource、WebSocket、Service Worker、download、WebTransport／QUIC、WebRTC ICE／STUN／TURNを含む外部fixtureで実証する。拘束不能な経路が1つでもあればfail closedを維持し、Browser bindingを有効化しない。

## Issue #86 実行引き継ぎ（2026-08-19）

- 前マイルストーン: PR #85はmerge済み。Issue #72はPR #78への包含とmerge済み証跡に合わせて更新し、完了closeした。
- 対象: Issue #86、PR #87、公開branch `agent/browser-run-draft`（GitHub連携の新規ref作成制約により、merge済みPR #85のbranchをmain起点へ更新して再利用）。親Issue #57とOQ-006はlive実証未完了のためopenを維持する。
- 起点main: `57a2cf6f14a290970c4ba66bc3c5c2ef80a19070`。
- 公式仕様確認: Browser Run session作成APIの`guardrails.allowedDomains`／`allowedDomainSets`はoutbound HTTP/S制限を提供する。一方、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURN、DNS rebinding後のactual peer送信前拒否までの保証は公式契約から確認できない。
- repo-side実装: guardrails付きsession作成、専用隔離fixtureの全10経路証跡評価、欠落・重複・未知経路・送信後拒否をfail closedにする契約テスト、明示確認とGitHub `staging` Environmentを要求する手動workflowを追加する。PR CIではBrowser Runを起動しない。
- 安全境界: live実証が全経路で合格し、後続ADRがAcceptedになるまで、製品WorkerへBrowser Run bindingを追加せず、`capture.browserRun.egressVerified.enabled=false`と`BROWSER_EGRESS_NOT_VERIFIED`を維持する。
- live実行に必要な未確認項目: 隔離fixture／受信sink、GitHub `staging` Environment、専用Cloudflare tokenとfixture secret。production、実顧客データ、deploy、migration、課金、外部公開は対象外。
- 次の1マイルストーン: repo-side契約をPRでレビュー・CI完了後、上記の隔離環境を用意して`RUN_ISOLATED_STAGING_P0`の手動実証を行う。1経路でも不明または拘束不能ならfail closedを維持する。
- PR #87 code-validation head `291cd0389303b89170305b6e410c456a9f44bb0d`ではBrowser Run Egress Proof、対象Unit／security 23件、DB、Phase 1／2 Playwrightを含む全必須CIが成功。既知P1×4／P2×10を恒久修正し、同headへのCodex Reviewで追加P0／P1／P2なし、未解決review thread 0件、PR Latest Review Gate成功を確認した。
- Codex対応では、remote session cleanupの独立実行と全hang境界、Cloudflare v4 envelope、probe相関、0 byte矛盾拒否、run／SHA固定artifact、CDP／fixture URL・未知channelのログ非露出をコード・仕様・回帰テストへ反映した。
- 本引き継ぎ更新commit後の最終head SHAと最終Review GateはPR #87のライブ状態を正とする。live実証は隔離fixture／GitHub `staging` Environment／専用Secrets未構成のため未実行であり、OQ-006と製品fail closedを維持する。

## 毎日0時の独立セッション

毎日0時に前日の会話文脈を継続しない実行を開始する場合は、`docs/09-delivery/daily-session-prompt.md` を使用する。

推奨設定は次のとおり。

- タイムゾーン: Asia/Tokyo
- 実行時刻: 毎日00:00
- 実行方式: ChatGPTのStandalone scheduled task
- コンテキスト: 各runを保存済みプロンプトから開始し、既存チャットの会話文脈を継続しない
- 情報源: GitHub連携を使用し、Issue #70とリポジトリを読み直す
- 既定権限: 読み取りと現在地整理を基本とする
- 許可する書き込み: 明示した場合のみIssue #70の更新
- 禁止: 自動merge、production反映、DB migration適用、課金変更、AI API有効化、共有リンク公開

ChatGPTでは、Standalone scheduled taskと、既存チャットへ戻るscheduled taskを使い分けられる。このプロジェクトでは会話上限とコンテキスト汚染を避けるため、既存チャット内ではなくStandaloneとして登録する。

ローカルcheckoutだけに存在してGitHubへpushされていない変更は、クラウド側の独立runから確認できない。セッションをまたいで必要な変更は、安全なbranchへcommit・pushしてから引き継ぐ。

## 日付で区切る際の注意

「毎日必ず新セッション」は分かりやすい運用だが、日付よりマイルストーンを優先する。

- 小さな作業: その日のセッションで完了、検証、記録まで行う。
- 大きな作業: 日付が変わる前に安全な中間commitと引き継ぎ記録を作る。
- 障害対応中: 未検証の修正を完成扱いにせず、再現条件、仮説、試したこと、次の検証を残す。

これにより、会話上限や端末停止が発生しても、次のセッションがGitHubから再開できる。


## Cloudflare Access / D1移行引き継ぎ（2026-08-30）

- Owner決定: 認証はCloudflare AccessのメールOTP・招待制、業務DBはD1、アプリ/APIはWorkers、ファイルはprivate R2へ統一する。
- 正本: ADR-0028、DEC-064、Issue #176、`cloudflare-migration-roadmap.md`。DEC-063のpreview Access保護は継続する。
- 旧Supabase Auth/Postgres/RLS実装、migration、RPC、テストは移行前baselineとして保持する。新規機能の土台、staging合格、production候補として拡張しない。
- PR #175でCloudflare Access保護とproduction自動promote停止をmainへ取り込み済み。Issue #92はcompleted closeされ、#92由来のblanket main merge holdは解除済みである。Access保護、non-production branch build停止、version upload-onlyは継続する。
- 現行live RLS gate workflow `.github/workflows/phase1-rls-live.yml` とrunbook `docs/08-operations/phase1-rls-live-gate.md` の `Status: Accepted` はpre-M5で維持する。現行gateはIssue #215の文書・checker整合PRとは別にownerが明示承認した場合だけ登録済みの既存staging/test入力で実行できる。ただし新規test user、資格情報、環境は追加せず、Issue #215のPRではworkflow dispatchとlive証跡生成、新規project、Environment、Secretの作成・登録を行わず、実行はowner承認済み既存staging/test契約に限定する。future M5 replacement PRでは、Issue #176 M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で、(1) replacement gateと対応docsの着地、(2) 旧 `.github/workflows/phase1-rls-live.yml` の削除、(3) runbookの `Status: Superseded` 化、(4) source-of-truth checkerとworkflow checkerのcanonical存在必須からcanonical/renamed旧identity再追加拒否への反転、(5) workflow本体、`scripts/check-workflows.mjs`、`scripts/check-cloudflare-source-of-truth.mjs`、`tests/cloudflare-access-fetch.test.mjs` の同一PR scope化を同時に完了する。着地後の別変更、M6への持越し、replacement未着地のまま先行退役を禁止する。
- 実immutable previewのstaging-only D1/R2・production backend非到達証明はIssue #176 M5の独立migration gateへ移管する。完了まではstaging合格、production資源作成・deploy、外部招待を禁止する。
- Issue #95のSupabase staging内部alphaはIssue #176 M5のAccess/D1/R2 staging実証へ置換し、旧経路を実行しない。
- production Access application、production D1、migration、deploy、実ユーザー招待、実データ移行は未実施。
- ローカルPC依存の作業は行わず、GitHub上のbranch/PR/CIを正本の実状態として照合する。

次の1マイルストーンはIssue #176 M0の文書PRを品質ゲートまで完了し、その後M1 Access identity spikeを別Issue・別PRで開始することである。

## Cloudflare Access / D1移行 M1 引き継ぎ（2026-09-05）

- M0: PR #180はmainへmerge済み。実main merge SHAは`d19ab714cfc09710eeb3dc624a0b7f0438bebfc5`。M1 branchはこのSHAを起点にする。
- M1実装: `apps/worker/src/access-identity.ts` に、jose v6.2.12によるRS256／issuer／audience／期限／iat／存在するnbfの検証、`access_user | service_token` actor分離、machine health allowlist、検証済みissuer+subjectのapplication identity DIを追加した。
- 設定: `ACCESS_ISSUER`、`ACCESS_AUDIENCE`、`ACCESS_JWKS_URL`は`server-config.ts`を唯一の読込窓口とし、env値の前後空白は除去する。issuer／JWKS URLのcredential・query・fragment・HTTPを拒否し、末尾slash等のURL正規化は行わない。署名済みJWTのissuer／subjectは原文字列で扱う。
- 検証: `tests/access-identity.test.mjs` はローカルRSA署名JWT／mock JWKS HTTPで正常系・negative・identity状態・service lookup 0回・秘密値非露出を確認する。`npm run worker:typecheck`と`npm run test:access-identity`は成功。
- 範囲外: 実HTTP request path／UI切替、D1 schema／migration、OTP／招待、production Access変更、旧Supabase経路の変更は行わない。
- 次の1マイルストーン: M2でD1 schema／migrationとworkspace固定repositoryを実装し、identity状態・membership・競合・途中失敗のnegative testを追加する。

## Cloudflare Access / D1移行 M2 実装（未staging）（2026-09-05）

- D1 migration／identity・workspace・member repositoryを実装中。manual coreはM4、Stripe/Discord callback本体はC1へ分離し、M2のexact POSTは503・副作用0、path別Access BypassはOFFとする。
- ローカルNode24 SQL suite、repository negative、Worker phase1/phase2 callback停止境界を確認済み。local SQL suiteはHosted Cloudflare D1 bindingやstaging資源の証明ではない。
- PR #221のmain統合後SHAは`46e7a406f2f61c72a0db509e94d4de941e88052d`。read-only Cloudflare診断run `33963225925` では対象Worker設定取得に成功したが、許可bindingはDiscord KVのみでD1 bindingなし、D1一覧401、R2一覧403、Access取得ページ0件、secret一覧はnetwork failure。資格値は記録しない。
- 2026-09-05のCloudflareブラウザ確認では対象プロジェクト用D1は未作成、staging用R2 4 bucketは存在し全て空だった。capture-assets bucketのpublic access無効を確認した。他bucketのprivate設定・binding分離はまだ個別検証していない。
- M2の実staging D1 binding、dynamic negative、backup/export/restore、production分離証跡は未実施。M3 HTTP接続と、これらのM2実staging証跡が残っている。
- 次の1マイルストーン（本節を最新の引き継ぎ正本とする）: M2実staging binding／migration・backup/restore証跡を別途完了判定し、その後M3 HTTP/UI接続へ進む。callbackのC1復帰条件は緩和しない。

## Product pivot／PR #240 review引き継ぎ（2026-09-13）

この節を現行Product開発の最新引き継ぎとする。上記M2／M3、invite-only production Access、Browser Run中心の「次のマイルストーン」は履歴であり、現行MVPの優先順位には使用しない。

- Product flow: `guest -> Chrome Extension MV3 -> PC／smartphone／tablet responsive capture -> local draft -> output gate -> signup/login -> self-service bootstrap -> Personal Workspace -> guest claim -> save/share/PDF`。
- Browser Run／Browser Session／Live ViewはLegacy／Historicalであり、現行MVP runtimeへfallbackしない。
- production商用MVPの一般利用者はOne-time PINでself-service本人確認まで到達可能とする。ただしAccess到達はbusiness authorizationではなく、unknown human actorはbootstrap以外のbusiness APIを403にする。
- Review lineage: sourceはPR #240、review対象HEADは`d9aa67b5fb2e994259608d831a02e8144c96d3f8`。本作業は同HEADへの最新Reviewで指摘されたPersonal Workspace識別、authenticated staged asset upload、Accepted API index、このsession handoffのP1／P2解消である。
- Review対応状況: Personal Workspace D1 discriminator／uniquenessはmigration・repository・local testへ反映済み、authenticated staged asset uploadはAccepted contract化済み、onboarding APIはAccepted indexへ登録済み。残作業はPRの最新HEADに対するreview／CI／merge確認である。
- 次の1マイルストーン: Product source-of-truth PRをmergeした後、PR #234 `Chrome Extension MVP implementation`を新mainへ追従させ、Product／security contractとの差分レビューを行う。PR #240とProduct正本のmerge前にPR #234を変更しない。

## C cloud save 統合 checkpoint (2026-09-23T01:20:28+09:00)

- 対象: Issue #255、PR #256、branch `codex/c-backend-completion`。owner限定stagingのC slice（guest claim、R2 staged asset、`/manuals` UI、draft編集）だけを扱う。D／E／F、production反映は対象外。remote migration／deployはC全体の承認済み親実行範囲だが、この担当では実施しない。
- 実装: PR #256へfrontendとbackendを統合し、`/manuals`はAccess user・active identity・active personal workspace・active owner membershipを必須化した。claim intent、asset status、finalizeの取得・再送経路も同じactive owner境界を再検証する。
- 契約同期: `docs/09-delivery/cloud-save-c-slice.md`、guest claim API、traceability、checkerを現行C契約へ同期する。PNG／JPEG／WebP、D1 claim/asset記録照合、`claimIntentId + operationId + asset slot`、CAS編集、結果不明時の照合を正本とする。旧B／M4の全面未実装記述はC範囲だけ失効させる。
- 検証: cloud manual C API 19件、extension claim unit 5件、Chromium UI／runtime／onboarding browser、worker runtime 71件、runtime mutation 3件、typecheck、encoding、source-of-truth、D1 boundary、diff checkを実行済み。Windowsのbrand checkerと`wrangler.cmd` EINVALはLinux CIで再確認する。
- 配布引継ぎ: manifest `0.1.2`のZIP展開・unpacked load・「操作を記録」から「保存した手順書を開く」までの利用者手順と、一覧・全手順編集・「変更を保存」の確認手順をC sliceへ追加した。Chromeの拡張機能管理画面は利用者本人が操作する範囲であり、実Chrome導入から実staging保存までの通し確認は未実施。isolated Chromium／実MV3 runtime回帰は別証跡である。
- 状態: staging実環境のmigration／deploy／最終SHA／完了判定は未確認・未実施。親によるwrangler dry-runはbinding反映なしで確認済み。最新の実状態はIssue #70とPR #256のlive stateを正本とする。
- 次の候補: Cの実staging適用と最終SHAの確認後に、親PMがDの着手を明示する。C完了後にDへ自動着手しない。D／E／Fはこのcheckpoint時点では未着手である。

### 2026-09-27 Issue #264: editor image workspace

- 対象branchは `codex/editor-image-workspace`、baseは `b125a0e5014ff7eed1a584c1b8a7de95763544ea`。ローカル統合検証時点では未commit・未pushでPR未作成だった。この時点の作業状態を成果物の最終状態とは扱わず、CI・最新Codex Review・remote保存状態はIssue #70とPRの記録で確定する。
- 全手順article、sticky目次・scrollspy、native画像編集dialog、local注釈と既存maskの共有asset焼き込み境界はADR-0036／DEC-081へ反映済み。
- ローカル統合検証はextension 114/114（`final-extension-test.log`）、annotation/cloud 17/17、MV3 runtime 4/4（`final-cloud-runtime.log`）、editor browser 11/11（`final-editor-browser.log`）、encoding 334、sensitive 369、docs 132をPASSした。目次17番のJPEG、1366x768、文字サイズ入力でEnterしてもdialogが閉じないことを実Chrome合成で確認した。強化browserはUTF-8で復旧し、後半の既存8テストはGit HEADと完全一致することを確認した。保存中の入力抑止、Escape維持、元putによる保存、reload後の文字とfont32保持を第2テスト追記後のfocused 1/1で確認した。
- Issue #265の全画面日本語リライトは次のマイルストーンであり、まだ実装していない。
- remote本人受入、CI・最新Codex Review・remote保存状態の最終確認は未確認であり、Issue #70とPRの記録で確定する。

## Issue #267 記録中入力のフォーカス回帰（2026-09-30）

- 対象: Issue #267。作業branchは `codex/recording-input-focus`、確認時刻は `2026-09-30T16:12:58+09:00`（Asia/Tokyo）。ローカルHEADは `7503f8b58451a33f56726fe157f478c564a8fb51` のままで、今回の修正は未commit・未push。PRは親担当が作成・更新する。
- 原因根拠: 実Chromeで、編集中のinputへ `visibility:hidden` を適用してpaint後に待つとfocusが外れてblur/changeが発生し、後続入力が同じ欄へ入らなかった。opacityだけのmaskではfocus、値、caret、selectionを保持した。
- 実装境界: screenshot maskはvisibility/displayを変更せずopacityだけを適用し、closed shadow内はnested open shadow、top-layerのplain text、動的追加を含めて走査・検証する。closed shadowを検査できない場合はfail closed。復元時はmaskが変更したinline styleだけを戻す。入力値は保存・ログ出力しない。
- 検証: `npm run extension:test` は114/114 PASS。実Chromeの `tests/extension-mask-browser.test.mjs` は4/4 PASS（同一dialogのmask前後・復元pixel、closed shadow、focus/selection、CDP IME確定前後）。実Chromeの `tests/extension-sidepanel-browser.test.mjs` は3/3 PASS（native MV3、画像1→2保存待ち、a→b連続入力、ab、focus維持、blur/change/submit/Enterなし、step数2）。合成fixtureと固定値のみを使い、実ユーザー内容・動画内容は記録していない。
- 検証境界と残作業: 親の `npm ci` は成功。親が確認した `npm run check` のWindows改行差分と既存audit警告は今回の変更原因ではない。stage、commit、push、PR反映、Issue #70同期、最新SHAのCI/Codex Review確認は親のrelease gateで実施する。

## [Issue #265](https://github.com/hozuo0906/meccha-manual/issues/265) / [PR #269](https://github.com/hozuo0906/meccha-manual/pull/269) 全画面日本語UI改善 checkpoint（2026-09-30T17:07:48+09:00）

- 対象: Issue #265、PR #269 draft、branch `codex/ui-japanese-rewrite`。確認時のHEADは `3d2e2693120cacaad6cae5d562a1b61a33c45509`、`origin/codex/ui-japanese-rewrite` も同一SHAであることを実取得した。機能CIは成功しているが、Codex Review・品質ゲート・merge・配布は未完了で、親PMが最終release gateを確認中である。
- 実装範囲の結論: 全画面の表示文言を自然な日本語へ揃え、端末・ワークスペース・共有の意味を混同しない表現へ整理した。利用者が作成する手順本文などのユーザー文章は対象外とし、画像の映り込みに関する注意、縦編集の導線、画像編集の既存操作を維持した。関連する要件・UX・品質文書とUIテストの期待値も同じPR範囲で同期している。
- 検証: `3d2e269` では担当実行のeditor 11/11通過を担当報告として記録する。親が取得した最新CIはDocs CI run `36687031639`（job `109795148531`、npm ci／diff／project checks成功）とExtensionPrivacy run `36687031537`（job `109795147163`、mask／editor／sidebar／verify-recorded-workflow成功）である。ReviewGateは未レビューのため失敗扱いであり、CI成功だけで完了とはしない。親の実Chrome受入では9画面をrefreshして横はみ出しなしを確認した。
- 記録境界: 秘密値・個人情報・実ユーザー文章や画像は記録していない。stage／productionへの反映、配布、merge、PR／Issueへの追記は親PMのrelease gate範囲であり、このcheckpointでは実行しない。

次の1マイルストーンは、PR #269の最終SHAから作成する限定配布版の受入確認である。ReviewGate、PR状態、配布結果を実取得できるまで、今回の日本語UI改善を完了扱いにしない。

## Office容量・privacy handoff checkpoint（2026-10-03T14:11:35+09:00）

- 現行製品sourceの正本は `88e9c2f37f7a47a1ebd5785c2abc05573a8a1494`（branch `codex/manual-explicit-privacy-office-019`）。220dd84で実装したOffice画像64 MiB累積・archive 80 MiB・ZIP32範囲検査、local/cloudの容量拒否・再試行、Heading1のOOXML配置、入力caption同期を88e9c2fで実caller回帰とAPP_ASSET_VERSION同期まで確認した。このcheckpointの変更はhandoff文書だけで、pushは親PMの保存工程で行う。
- 88e9c2fに対する確認結果は、capture actor unit 12/12、local/cloud browser 2/2、worker runtime 71/71、対象ゲート合計85/85、skip 0。P0/P1は確認されていない。旧d34のCI/fullcheck証跡は現行SHAへ流用しない。220で発生したAPP_ASSET_VERSION不一致は88で解消済みである。
- P2候補として、`bytes:string` のdecode後に容量検査するための一時メモリ増加と、XML生成前のarchive guardがある。いずれも現行の実callerおよびAPIの `Uint8Array` 契約外であり、今回の修正対象には含めない。utilityを直接呼ぶ場合の一時メモリ増加を影響として親PMが管理し、2026-10-08までにboundedな契約整理を行う。
- 検証境界は、実OfficeのWord／PowerPoint描画、remote SSO、実Chromeでの追加操作を未確認とする。local/cloudの分離ブラウザ検証を実施し、実Chromeの追加操作は禁止した。Windowsではesbuildの昇格済みdirect Node検査とwranglerのdirect CLI bundleを成功として確認したが、通常の `wrangler.cmd` 経路は `spawnSync ... EINVAL` のため未確認として区別する。
- Google project／IAB構成は作成済みだがOAuth clientは未作成で、課金accountもない。auth文書は別branchのremote SHA `87457fe` に保存済みである。

次の1マイルストーンは、この最新SHAに対するCI・Codex Review・remote／PR headの実取得と、限定0.1.9 ZIPのchecksum／内容確認である。完了までは配布・native Office描画・remote SSOを完了扱いにしない。

## Office PresentationML slide ID P1 correction checkpoint（2026-10-03T14:24:19+09:00）

- dcc90acの未配布候補に対するCodex Reviewで、`ppt/presentation.xml` の最初の `p:sldId` が255になるP1を確認した。MicrosoftのPresentationML例およびST_SlideIdの `minInclusive=256` に照合し、first255はOffice互換境界を満たさないため妥当な指摘と判定した。dcc90ac由来のZIPは配布せず、履歴として保持する。
- boundedな修正では、slide IDを `256 + index` とし、200手順で256〜455の単調増加・一意ID、presentation relationshipのrId／slide順、master/layout ID（2147483648／2147483649）、slide内shape IDと画像relationshipを回帰確認した。生成editor bundleと `APP_ASSET_VERSION` も同じ変更で同期する。
- この単位では追加のOffice native描画・remote SSO・限定ZIP配布は未確認である。次の1マイルストーンは修正後最新SHAへのCI・Codex Review・remote／PR headの実取得と、限定0.1.9 ZIPのchecksum／内容確認である。

## Shared image editor lifecycle P2 correction checkpoint（2026-10-03T14:39:47+09:00）

- 6d59ca8の未配布候補に対するCodex Reviewで、`createImageEditor` が同一dialog再利用時にも置換範囲ボタンとkeyboard helpを追加し続けるP2を確認した。disposeでlistenerは停止しても動的nodeが残り、再open時に重複操作と同一IDの説明が発生し得るため、通常UI到達の不具合として修正した。6d59ca8由来のZIPは配布対象にせず履歴保持する。
- 修正では既存の置換操作・説明nodeをquery再利用し、`aria-describedby` をそのhelp IDへ再設定する。localの同一dialogを3回開閉してbutton/help各1、ID参照、一回のlistener作用を確認し、cloudはclose後にfresh dialogを生成する現行経路を3回以上実browserで確認した。cloudの通常経路にnode累積があるとは判定していない。
- shared bundleを再生成し、`APP_ASSET_VERSION` を同期した。次の1マイルストーンは修正後最新SHAへのCI・Codex Review・remote／PR headの実取得と、限定0.1.9 ZIPのchecksum／内容確認である。


## Issue #283 製品ログイン・Office出力の現在地（2026-10-03T21:44:09+09:00）

- 対象branchは `codex/manual-product-auth-283`、認証sourceを含む `253e108900d354944f385bc12fffe944ce4d1107` のstaging接続準備docs commitは親がpush済みである。Google／ChatGPTの製品ログインsource、session、start/callback、D1 migration `0008` は実装済みで、親が11件の認証unitと2件のbrowser回帰を確認した。これは合成fixture／local Workerを含む証跡であり、実provider SSO成功、remote migration適用、secret binding、Access外周の実設定を示さない。
- Office側は、最新commit `b087abf` の編集済み画像回帰を統合済みである。親取得の実行ID `session55529` では、`tests/office-auth-runtime-browser.test.mjs` の生成editor経路をGoogle／ChatGPT × DOCX／PPTXで2/2、skip 0、exit 0として確認した。合成provider、実ブラウザ、local Worker、SQLite D1 adapter、memory R2を通り、編集中の下書きから同じ形式のdownloadまで到達した。これは実provider SSO、remote D1／R2、staging deployの証跡ではない。
- 未完了の外部境界は、実Google／ChatGPT SSO、staging remote D1 migration、Google secret binding、Access product入口／health分離の実設定である。SIWCは申請の氏名・会社名回答待ちで、商用clientは未発行のため有効化しない。これらの未確認事項をlocal testやfixture passで代替しない。
- 統合Draft PR [#284](https://github.com/hozuo0906/meccha-manual/pull/284) のremote checkpointは `fdd9e2f3d9c6c4f91fe9633149e008f7903885e5` である。旧実生成試験の復帰待ちtimeoutは、実際のcallback navigationを使うharness修正で解消し、open editorを閉じずclaim前にdownload listenerを設定する経路で再検証した。今回の成功は合成provider／local Worker／SQLite D1／memory R2に限定し、実Google／ChatGPT SSO、remote migration、secret binding、Access外周の成功とは扱わない。
- Office最新は `b087abf`（remote／PR #282一致）で、通常CI 13件成功、`78f`へのCodex comment `5968825999` はmajorなしを確認済みである。`b087`に対する最新Reviewは未確認で、未解決threadは1件残っている。製品ログイン側は親が `270` で認証unit 124件・browser 2件を再取得した。
- staging origin rootをIABで1回直接開くとCloudflare Dashboardのサインイン画面へ遷移した。これは確認tabを閉じ、設定変更・ログイン操作をしていない。Access、DNS、未設定domainのいずれが原因かは未確認であり、Accessが原因とは断定しない。challenge URLや連絡先、秘密値は記録しない。
- 次の1 milestoneは、対象SHAを固定して `wrangler.onboarding.jsonc --env staging` のversion、0006/0007/0008、secret名、Access外周をread-only照合する staging 接続案である。実stagingへのdeploy、migration apply、secret取得、Access変更、実provider SSOは別承認境界として実行しない。

## 製品ログイン・Office再試行の親検証（2026-10-03T23:36:46+09:00）

- PR #284、branch `codex/manual-auth-office-integration-283`、source SHA `7342c6512dd3c6282451be89ca679b7752955eda`。PR head一致と通常CI13件成功を取得。latest-review gate失敗、最新Codex Reviewとthread3件の解決は未完了。
- 親実行 `session41501`：Office/auth browser 2/2、skip0、exit0。実editor操作からGoogle／ChatGPT × DOCX／PPTX、キャンセルHTML戻りリンク、実bootstrapボタンから再ログイン、同形式download、return marker消費を確認。合成provider、公式CFT、local Worker、SQLite D1、memory R2の証跡。実SSO・remote設定・native Office描画は未確認。
- e82dの手動gotoによる旧成功報告は実UI証跡として不採用。7342は復元後hashの再ログイン保持と実ボタン経路を修正。credential選択、Google issuer正規化、失敗時の検証済み戻り先は9b6cd1eで修正済み。
- PR #282 source573b921は通常CI13件成功、最新Codex Review majorなし、未解決thread0を親確認済み。merge・配布・production反映は未実施。
- 次は最新headのCI／Codex Reviewとthread解決。その後staging接続案を確定する。Cloudflare運営管理ログインとSIWC申請氏名・会社名・公開URLの回答待ち。SIWC client未発行、Google資格情報は暗号化保管済み。remote secret／migration／外周未確認。文書記録を継続稼働とは扱わない。
## 認証状態遷移とstaging接続の親確認（2026-10-04T00:18:00+09:00）

- PR #284 source/head `6e3ad574c599fbacd82e5120725815d96a343d29` を親が照合。期限切れproduct cookieから明示password成功時に競合sessionを失効・cookie削除、logout JSON成功応答、session.authModeによるproduct／Access分離を修正。初担当の実行は親がinterruptし、差分保持後に回収担当へ引継いだ。
- 親の最新source認証／Access単体は142/142・skip0。公式CFT実行 `session11521` は実editor Office/auth2件とprovider／logout／期限切れbrowser4件の合計6/6・skip0・exit0。合成provider、local Worker、SQLite D1、memory R2の検証で、実SSOやnative Office描画ではない。担当worker71/71等の証跡も回収。最新文書headのCI／Codex Reviewと新3thread解決は待ち。旧3threadは074c789最新レビュー・CI・回帰根拠返信後に解決確認済み。
- 運営IABログインを確認し、staging Workerのlive version cc830546 100%、DB/R2とrate limiter1001/1002一致をread-only取得。runtime変数はAccess3項目とAPP_BASE_URL／APP_ENVの5項目で、Google／SIWC未接続。Accessはowner hostname（path空欄）とWorker全URLスコープ、/s/*別viewer bypass。D1の移行名SELECTは0001〜0005のみで0006/7/8未適用。秘密値取得、遠隔設定変更、migration、deployは実施していない。CLI未認証とIAB取得を区別する。
- 次の1マイルストーンは最新品質ゲート。その後staging専用のDB移行・Google接続・製品入口と運営health保護分離を具体案として提示。SIWCは申請氏名／会社名／公開URL回答待ち、商用client未発行のため無効。AI OFF。production・課金・一般公開未実施、監視未登録。
## OAuth privacy・ストレージ失敗の親回帰（2026-10-04T00:41:13+09:00）

- source `a259a0d0bfd4471e171cde2104b3f4d0e3b3ca11` はlocal／PR #284 head一致、cleanを親確認。callback成功とJSON／HTMLエラーにno-referrer、D1例外と保存失敗をretryable503、consume CAS競合を409として維持。DEC-096と契約／traceabilityを同期。
- 親単体145/145・skip0、公式CFT実行session46819はOffice/auth2＋provider／logout／期限切れ4の計6/6・skip0・exit0。callbackの成功復帰・エラーリンク復帰でReferer無しを確認。合成provider／local Worker／SQLite D1／memory R2であり、実SSO・remote変更・native Office描画ではない。
- 前head211f4f3はDocs111231185336のnpm ci/fullcheck、Privacy111231185305の実browser成功ログ取得。正式botレビュー5401430990の新P2二件をa259a0dで修正。旧transition3threadは解決確認済み、新2threadは最終文書headのCI／Codex Review照合後に解決する。
- 次の1マイルストーンは最終品質ゲート、次にstaging接続の具体案。SIWC申請氏名／会社名／公開URL回答待ち、商用client未発行。Google資格情報は暗号化保管済み・remote未接続。DB0006〜8未適用、Access全URLの旧保護はread-only確認済み。remote変更・merge・production・課金・一般公開未実施、監視未登録。

## 製品認証D1正本同期（2026-10-04T01:15:52+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`、検証基準source HEAD `d5ad2e54c559786fa9c29ee983b651da17078feb`。今回の変更は`docs/04-data/d1-and-storage.md`、`docs/04-data/d1-workspace-schema.md`、`docs/09-delivery/open-questions.md`、本引き継ぎの正本同期だけで、Worker、types、migration `0008`は変更していない。
- `auth_sessions`／`oauth_transactions`の列、CHECK、unique／lookup index、identity immutable trigger、hash・期限・失効・consume CAS、Google／SIWCのissuer+subject mapping、`product_user` repository actor入力、`authMode: "product" | "access"`、Access human／service actorとworkspace固定query境界を、Accepted ADR-0041および実sourceへ同期した。remote D1の0006／0007／0008適用済みとは扱わない。
- OQ-033〜036はADR-0041 Accepted後の状態へ更新した。メールprovider／remote Google binding・稼働、SIWC商用client・資格、本人による明示identity linkと旧Access identity移行・復旧は未決・未確認のまま保持する。SIWCの申請回答待ちと商用client未発行も継続する。
- 初期確認はsource HEAD、関連migration/source/types、ADR-0041、decision-log、要件、既存D1文書、OQを照合し、ソース不変を確認する。docs差分、D1 schema記載、`git diff --check`、関連文書／migration検査をこの作業単位で実行し、PR最新headのCI／Codex Reviewは親のrelease gateで再取得する。
- 2026-10-04T01:15:52+09:00（Asia/Tokyo）に`docs:check`（143 files）、`migrations:check`（11 SQL）、`migration:safety:check`（11 SQL）、`app:auth:unit`（133/133、skip 0）、`encoding:check`（377 files）、`git diff --check`を実行し、すべてexit 0を確認した。親が同source基準で行った`wrangler.onboarding.jsonc --env staging` deploy dry-runもexit 0で、remote変更なし。今回source差分は0件である。
- 追加P2修正（PR #284 Codex Review 5401643521、thread `PRRT_kwDOTpNknc6opXYj`）では、state／provider／verifier binding／期限の確認後にtransaction消費CASを先に確定し、nonce bindingとprovider tokenの署名・audience・issuer・nonce検証を消費後に行う順序を2つのD1正本へ明記した。後続検証に失敗してもtransactionは消費済みのため、ログインを最初からやり直す。OQ-036は`authMode`を「productまたはaccess」と記載してMarkdown表のセル境界を維持した。

次の1マイルストーンは、今回の文書同期を含む最新headへCI／Codex Reviewとreview thread解決を照合し、その後にstaging接続の具体案（remote migration、Google binding、製品入口と運営health保護分離）を確定することである。remote migration、secret取得・変更、Access設定、実provider SSO、production反映は未実施である。

## PR #284 Codex Review 5401676113 P2修正（2026-10-04T01:44:31+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`。limiterは明示的な`success: false`だけを`429 AUTH_RATE_LIMITED`へ写像し、binding欠落・呼出し例外・不明／不正結果は`503 AUTH_RATE_LIMIT_UNAVAILABLE`としてOAuth transaction作成前に停止する。nonce不一致を含むconsume後callback errorは、再検証した固定`return_path`だけを引き継ぎ、改変された外部pathは利用しない。
- `app:auth:unit`は136/136、`docs:check`は143 files、`worker:check`、worker typecheck、`encoding:check`は377 files、`git diff --check`をexit 0で確認した。追加回帰はlimiterの拒否／例外／malformed、nonce mismatch後のconsume済み、外部return pathのHTML不出力を含む。Office export test／workflowは変更していない。
- この時点の差分はlocal未commitであり、commit・push・PR head／CI／Codex Reviewの再取得は未確認。実provider SSO、remote migration、secret binding、production反映は未実施である。

## Office/authブラウザCI逐次実行ゲート（2026-10-04T01:50:28+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`。source基準HEADは`dce841475ee49a9b02d6a99388bf9a7c1cf5d8a6`で、今回の変更は`.github/workflows/extension-privacy.yml`、本引き継ぎ、`docs/09-delivery/decision-log.md`の現行決定DEC-097日本語同期だけである。Worker、source、tests、migrationは変更していない。
- Extension PrivacyのOffice stepで、`extension-office-export-browser.test.mjs`、`cloud-office-export-browser.test.mjs`、`extension-cloud-save-runtime-browser.test.mjs`、`office-auth-runtime-browser.test.mjs`をNodeの`--test-concurrency=1`で逐次実行する。既存の4ファイル、6分timeout、TERM／kill-after、`continue-on-error`と最終結果集約、期待値・skip条件は維持する。
- 並列実行による公式Chrome for Testingのbrowser CPU競合を避ける根拠として、独立担当`office_large_export_ci_diagnosis`の診断報告では対象単体が21.418秒、4ファイル合成は初回65.234秒・2回目20.601秒で、いずれも全5件passだった。CI job `111243391617`はdownload待ち30秒timeoutのstatus生成中であり、これだけでは恒常hangとは判定しない。timeout延長や期待値・skip緩和は行わない。
- 親の公式CFT実行`session18991`は、実Word／PowerPointの20画像case 1/1、skip 0、exit 0、test 21.715秒（全体22.213秒）の取得報告である。実provider SSO、remote migration／secret binding、native Office描画の完了証跡とは分離する。
- source基準`dce841475ee49a9b02d6a99388bf9a7c1cf5d8a6`に対する親の公式CFT実行`session90974`は、認証単体148/148、browser 6/6、skip 0、exit 0、browser 70.767秒で、Google／ChatGPTから同形式Office出力、cancel後の実bootstrap retry、logout、expired 401を確認した取得報告である。これは合成provider／local Worker等の検証であり、実provider SSO・remote変更・native Officeアプリ描画とは分離する。
- この作業単位で`check-workflows.mjs`（29 files）、`check-docs.mjs`（143 files）、`check-encoding.mjs`（377 files）、`git diff --check`を実行し、workflow／文書／encoding／差分検査はすべてexit 0を確認した。未追跡の`.artifacts/unified-editor/`は既存の検証生成物として変更・削除・commit対象にしない。
- PRゲートの`npm ci`は`node_modules/.package-lock.json`のunlinkでWindows `EPERM`となり未完了で、ロック解除のための停止・削除・強制操作は行っていない。既存依存で実行した`npm run check`はdocs／brand／worker検査を通過した後、worktree sandboxのesbuildが`../../../..`を読めず`editor-tools:check`で停止したため、全check成功とは扱わない。認証unitは`app:auth:unit` 136/136、skip 0、exit 0を確認した。

次の1マイルストーンは、この修正を含むcommitをpushし、remote／PR head SHA一致、同SHAのCI、Codex Review、未解決review threadを親がrelease gateで再取得することである。CI成功だけで完成扱いにせず、実provider SSO、remote変更、production反映は未実施のまま維持する。

## Issue #283 / PR #284 auth P2修正チェックポイント（2026-10-04T02:29:10+09:00）

- 対象branchは `codex/manual-auth-office-integration-283`、開始時source HEADは `494af4cbaa42d5d9c81cc1f559734a577f43749b`。product OAuthのlegacy cookie境界とtransaction cookie並行分離を、Worker source、unit/browser回帰、API/D1/ADR/traceability/decision-logと同期し、commit `8f9e15bde02a65b9f197e82a56a6391184b18236` としてpush済みである。
- Google/ChatGPTの成功callbackは既存の `clearSessionCookies()` で `__Host-mm_access` / `__Host-mm_refresh` を消去し、失敗・cancel・不正stateではlegacy cookieを消去しない。transaction cookieはproviderとstateのSHA-256に結び付け、callback/errorは該当transactionだけを消去する。D1 schema、migration、remote Supabase logout、provider secretは変更しない。
- unit実測は app-auth/product-auth 138/138、skip 0、exit 0で、未知・不正stateとlegacy cookie付き失敗時の保持を含む。CFT Chromium browser実測はローカルsession `86926`、5/5、skip 0、exit 0（約22.1秒）。browserではGoogle/ChatGPTの同一provider二tab、成功順 `[0,1]`／`[1,0]`、cancel順 `[0,1]`／`[1,0]`、legacy cookie付き成功、product logout後reloadを確認した。実ユーザーのcredentialやsecretは使用していない。
- 次の1マイルストーンは、実行時に取得した最新PR head・local・origin一致SHAに対するCI、Codex Review、review thread解決を親PMが確認することである。staging/production反映は未実施のまま維持する。

## 製品認証とOffice出力の親検証チェックポイント（2026-10-04T03:28:14+09:00）

- 対象はIssue #283／Draft PR #284、branch `codex/manual-auth-office-integration-283`。source修正は `1802c6fa2cf207b963c222246b509bac73091956` と `017a026ea110b0402df1a6cccd0df340c4eeaed0` でremote保存済み、親がlocal／PR head一致とcleanを取得した。180は自然期限切れでcookieが消えたmanual／share APIを401 SESSION_REQUIREDへ分類し、017はDB bindingがなくても製品routeをdispatchしてstorage障害へ到達させる。cookieがあるDB欠落は期限切れと断定せず503 AUTH_STORAGE_UNAVAILABLEを返す。DEC-099／DEC-100とAPI・traceability・ACを同期した。
- 親が017に対して関連unit（cloud-manual-c／share-link-backend／app-auth／product-auth／m3-http-d1）203/203、skip0、exit0を取得。Google／ChatGPT configured、Access設定なし、cookie有無、DB有無を実Worker.fetchで検証し、legacy password選択、Access有効／不正／service拒否、tenant・share negative/mutationを維持した。docs143／encoding377／git diff --checkも成功した。
- 180の親CFT実行session62025は7件中6件成功、1件は実editorのChatGPTログインボタン表示待ち15秒timeout。単独再実行session85667は1/1、skip0、exit0。同headのLinux Privacy job111260503524ではOffice5/5・provider5/5成功を親がログ確認した。初回失敗を全成功に書き換えず、ローカルタイミングの原因は未特定として残す。017の最新CI／レビューは別取得し、180の結果を最新headへ流用しない。
- 017の `wrangler.onboarding.jsonc --env staging` dry-runはexit0、830.52KiB。対象staging専用DB／R2／rate bindingsとentrypointを確認したローカルビルドであり、実deploy・remote migration・secret bindingの証跡ではない。実Google／ChatGPT SSO、remote D1／R2、native Word／PowerPoint描画は未確認。
- 運営IABログインとremote read-only照合は完了。Google資格情報は暗号化保管済み・remote未接続、SIWC interest formは2026-10-04T03:39:00+09:00（Asia/Tokyo）に受付済み表示をread-only確認した。商用client発行、実SIWC SSO、secret binding、remote migration、production反映は未確認・未実施で、有効化しない。D1の0006／0007／0008は未適用、製品hostname／Worker全URLのAccess保護も未変更。production、課金、AI API、mergeは実施していない。DB rollbackや旧version互換を未検証のまま保証しない。
- 次の1マイルストーンは、実行時に取得した最新local／origin／PR head一致SHAについて通常CI、正式Codex Review、既知指摘への根拠返信とfresh未解決thread0、latest-review品質ゲートを照合すること。その後、候補のstaging接続を具体化し、外部設定の実行承認と商用client発行・利用資格の確認条件を整理する。自動監視・無人継続は登録していない。
- SIWC申請受付状態の訂正（2026-10-04T03:39:00+09:00、Asia/Tokyo）: 親がログイン済みIABのOpenAI interest formをread-onlyで確認し、画面に `We’ve received your submission. We expect to expand access in early Q4...` と表示されることを確認した。SIWC申請が受付済みであることのUI表示だけを確認し、送信主体・送信内容・入力PIIは取得・記録していない。この確認は商用client発行、実SIWC SSO、secret binding、remote migration、production反映を意味しないため、これらは未確認・未実施のまま。フォーム操作・申請送信・重複申請は行っていない。以前の「氏名／会社名／公開URLの回答待ち」「申請必須情報を確認」はこの時点より前の状態として失効し、現在の申請受付状態へ訂正する。

## Issue #283 root login / D1 member route修正（2026-10-04T09:19:15+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`、source修正commit `4bb65ab12c9229f342a643ef990e239fcbd8ca30`。rootの製品ログイン後に「メールアドレス未設定」と表示され、手順書タブがメンバー権限確認で停止した原因を、sessionの`members.status`とmember API dispatchが移行状態のまま旧Supabase handlerへ進む実装、rootが旧manual入口を描画するUI不整合として確定した。logout後にpassword formへ戻る原因は、provider設定を再読込する前の共通login初期化がlegacy formを描画していたことだった。
- WorkerはD1 `GET/POST /api/workspaces/{workspaceId}/members`、`PATCH /api/workspaces/{workspaceId}/members/{userId}`へ固定repositoryを接続し、sessionの`members.status`を`ready`へ同期した。UIはproduct／Access sessionのメール欠落時に「アカウント」と表示し、手順書をcanonical `/manuals`へ案内し、product logout後はpassword formへ戻さない。guest導線、manual新規作成API、remote staging設定、秘密値、PII、実ユーザー操作の記録は変更していない。
- 合成D1／SQLiteで、workspace ownerの一覧、join codeによるviewer追加、viewerのmutation拒否、ownerのrole更新、不明workspaceの404、legacy auth routeのSupabase fallback停止を確認した。`tests/m3-http-d1.test.mjs` 13/13、`tests/app-auth.test.mjs` 115/115、`tests/worker-runtime.test.mjs` 71/71、worker typecheck exit 0。`npm exec`の依存解決はWindows npm cacheのEPERMで実行できず、直接Node実行で既存依存を使った結果を記録する。`npm ci`、`npm run check`、CI、Codex Reviewはこの修正headで親が再取得する。
- 親から共有されたstaging／IABの実Google login、D1 migration 0006–0008、Google secrets登録、Access health／preview-onlyのread-only確認、`/manuals`空一覧表示はこのsource変更のlocal検証とは分離する。実保存、Office出力、native Office描画、実ユーザーの手順操作は未確認であり、staging／productionの追加操作は行っていない。

## Cloud Office CSP画像decode修正チェックポイント（2026-10-04T10:13:47+09:00）

- 対象はIssue #283 / PR #284、branch `codex/manual-auth-office-integration-283`。Cloud manualの`renderOfficeImage`で、same-origin asset BlobをFileReaderのdata URLへ変換してから`Image.decode`する最小修正を行った。Workerの`img-src 'self' data:`は維持し、CSPを緩和していない。Office download helper、auth、asset保存、D1、staging／production設定は変更していない。
- `tests/cloud-office-export-browser.test.mjs`は実Worker CSPを全レスポンスへ適用し、合成640x360 PNGを使ってWord／PowerPoint ZIP内の画像寸法、編集済みmask pixel、画像entry数（本文だけの未保存stepに偽画像がないこと）、画像404拒否、画像予算拒否後の再試行、GET限定、secret-like URL非露出を確認する。編集途中のstepは本文を入力してから出力し、既存のsnapshot変更検知・mask焼込み境界を維持する。
- 対象テストはNode direct executableで1/1、skip 0、exit 0を確認済み。`npm ci`、全体`npm run check`、新headのCI／Codex Reviewはこの時点で未確認。native Officeアプリ描画、実provider SSO、remote D1/R2、staging／production反映は未実施。
- 親が観測したIABのWord本文「書き出しました」表示とdownload event／Downloads未確認は、CFTのdownload成功証跡と区別する。今回の修正ではdownload helperの即時revokeタイミングを変更しない。
- 次の1マイルストーンは、この修正を含む最新commitのremote／PR head SHA照合、関連CIとCodex Reviewの再取得、root認証UI担当（`app-assets.ts`／`app-auth.test.mjs`／`product-auth-browser.test.mjs`）の実SHA・検証結果の統合である。staging／productionへの反映、merge、IAB追加操作は親PMが別途判断する。

## D1 direct changes probe（2026-10-04）

- 親がstaging D1へread-only相当の実probeを行い、既存のarchived fixtureでtriggerを発火する`UPDATE manual_revisions ...`と同一batch内の`SELECT changes() AS direct_changes`を実行した。取得結果はDMLが`meta.changes=2`／`results=[]`、直後のSELECTが`meta.changes=0`／`results=[{direct_changes:1}]`で、`manual_revision_sync_draft`のtrigger副作用がD1変更件数へ加算される仕様を確認した。
- このprobeはD1の変更件数仕様確認だけであり、今回のrepository最終修正APIの保存成功、画像あり保存、Office出力、remote migration／deployの成功証跡とは扱わない。今回の修正はD1 batch内の各DML直後に同じ`SELECT changes()`を置き、直接件数を厳密照合する。
- 修正前の旧ローカル回帰43/43はSQLite `run().changes`を使っていたためこのremote専用のtrigger加算誤409を検出できなかった。今回のmockはDMLの累積変更件数を`meta.changes`へ反映し、直後SELECT結果を必須照合することで同じ欠陥を回帰対象へ含めた。

## Root ProductログインUI可視性修正（2026-10-04T10:22:45+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`。rootのProductログイン画面で、`.form { display: grid; }` がUAの`hidden`表示を上書きしprovider-onlyでもパスワードフォームが見える問題、単一providerでも不要な「または」が残る問題、隠したフォーム内のエラーが見えない問題を確認し、source commit `4cc027ddde4ba34ffacd134c19b317f2f95d379b`へ最小修正した。
- provider設定取得中はパスワードフォームを表示せず、provider-only時は利用可能なproviderだけを案内する。providerが1つならprovider名を単独表示し、2つの場合だけ「または」を使う。設定が空のときは読み込み中のままにせず利用不可の案内を出し、取得失敗時はProduct session未確認の場合に限り既存入力へ戻す。エラー表示は隠しフォームの外に置いた。UX、requirements traceability、decision logにも同じ状態遷移と境界を追記した。
- 実測は`tests/app-auth.test.mjs` 115/115、`tests/product-auth-browser.test.mjs` 5/5、`tests/worker-runtime.test.mjs` 71/71、Worker harness、`git diff --check`が成功。親が同一headの関連認証・Office・D1回帰207/207、skip 0、exit 0（session 15526）を取得している。実provider SSO、remote D1/R2、native Officeアプリ、staging／production反映はこの作業では確認・実施していない。
- `npm ci`はWindowsの`node_modules\\.package-lock.json` unlinkでEPERM、`npm run check`はworktree内でnpm shimを解決できず未完了。これらを成功扱いにせず、source回帰の既存Node直接実行結果と区別する。外部設定、deploy、mergeは行っていない。
- このhandoff追記を含むdocs-only commitを作成・pushした後、親PMが最終headに対するCI、Codex Review、review thread、staging反映判断を再取得する。
## Issue #283／PR #284 OAuth start origin・browser recovery P2修正（2026-10-04）

- 対象はIssue #283／Draft PR #284、branch `codex/manual-auth-office-integration-283`、source SHA `6313790a31e6bda41ef270ed9dc47954767a5ecb`（remote一致）。`beginProductAuth`はprovider、request URLと設定済み`APP_BASE_URL`の完全一致、許可return pathをrate limiterとD1 cleanup／INSERTより先に検証し、preview／workers.dev／その他aliasと不正returnを副作用なしで拒否する。runtime設定が未取得でも、既存allowlistの正規request originだけをブラウザ復帰先に使う。
- `/api/auth/{provider}/start`のHTML失敗は既存login CSS・security headersを使う日本語復帰画面へ分類し、失敗理由と「元の画面へ戻る」を示す。JSON clientのstatusとbody分類は維持し、aliasや未検証URL、secret、下位例外を返さない。追加ブラウザ回帰では一度429を表示した後、同じ保存handoffの`activeHandoffId`／`handoffId`と`outputAction`／`requestedAction`（いずれも`save`）を保持したままprovider再選択を成功させた。`tests/product-auth-browser.test.mjs`の`runProviderBrowser`は`save`固定のsynthetic handoffを使うため、Office開始失敗時の形式（`officeFormat`）や下書き保持は今回の追加テストでは未確認であり、通常のOffice回帰の証跡をこの失敗ケースへ転用しない。
- 検証: `node --experimental-transform-types --test tests/product-auth.test.mjs` 32/32、`node --experimental-transform-types --test tests/product-auth-browser.test.mjs` 8/8、invalid return／runtime missing／alias、API JSON、rate／D1失敗、cancel／retryを確認。`node --experimental-strip-types --check`による`index.ts`／`product-auth.ts`構文確認と`git diff --check`も成功。Windows `npm ci`の既知EPERM、Linux CI、正式Review、deploy／merge／review thread解決は未確認で親へ引き継ぐ。

## Issue #283／PR #284 provider route・retry最終追補（2026-10-04）

- 作業担当はP1のprovider-only＋legacy cookie経路を、既存server-config窓口のSupabase設定有無で分岐するよう修正した。Supabase未設定時は古い`__Host-mm_access`／`__Host-mm_refresh`だけでlegacy routeへ進まず、Product routeのsession必須応答を維持する。Supabase設定済みのpassword backend、Product cookie優先、mixed cookie fail-closed、Access／missing DB dispatchは変更していない。
- P2のprovider取得非2xx／空応答／通信失敗では、Product session確認済みの画面にエラーと再試行を表示する。成功時だけprovider導線へ戻り、入力値・return pathを保持する。render世代とprovider request世代を照合し、古い非同期応答による画面上書きを抑止した。Product session未確認時の既存password fallbackは維持した。
- `APP_ASSET_VERSION`をsourceと`tests/worker-runtime.test.mjs`の契約へ同期した。関連差分は`apps/worker/src/index.ts`、`apps/worker/src/app-assets.ts`、`tests/product-auth.test.mjs`、`tests/app-auth.test.mjs`、`tests/product-auth-browser.test.mjs`、本追補を含む契約・UX・trace・decision文書である。
- 最終commit／remote SHAと、source回帰、browser retry回帰、既存関連回帰、`npm ci`／`npm run check`のWindows制約は、この追補後に実取得して親PMへ報告する。CI／Codex Review／thread解決、deploy／merge、staging／production設定変更は親PMの回収対象であり未実施。

### 認証資格情報の優先順位とOAuthログイン一時データの整理（2026-10-04）

- 対象は Issue #283 / PR #284、branch `codex/manual-auth-office-integration-283`。P1 は request credential を Access 設定 fallback より先に評価し、product cookie → Access assertion → configured legacy Supabase cookie の順で route を選択する修正。Access assertion の issuer・audience・JWKS、human actor、active identity、workspace・role 認可と、product cookie の fail-closed 境界は維持する。
- P2 は既存10分の `oauth_transactions.expires_at` を正とし、provider／origin／return path／rate limit の拒否後だけ、解釈可能な期限切れ行を start 1回につき最大100件 cleanup する。DELETE と INSERT は D1 batch で atomic に扱い、storage failure は `503 AUTH_STORAGE_UNAVAILABLE`、未期限切れ consumed 行・auth_sessions・identity・workspaceは保持する。migration、cron、新 retention は追加しない。
- local source/tests: `apps/worker/src/index.ts`、`apps/worker/src/product-auth.ts`、`tests/product-auth.test.mjs`。product-auth unit 30/30、Worker typecheck exit 0。追加回帰でrate-limit拒否時の期限切れ行保持、101件の継続start、malformed expiry保持、cleanup後INSERT失敗時のrollbackをD1 adapterで確認した。既存のCI担当所有 `tests/product-auth-browser.test.mjs` は変更・stageしていない。
- UI担当の logout render race 修正は `b6ac28a38822e7247f7113b0200b0c6d5444bac6`（app-assets.ts / app-auth.test.mjs / product-auth-browser.test.mjs、app117/browser6/runtime71）を採用根拠として親が統合する。staging／production設定、deploy、mergeは未実施。
- 次のゲートはこの修正を含むcommitのremote保存後に、親が最新head SHAでCI／Codex Review／review thread解決を再取得すること。

## Issue #283／PR #284 mixed credential entry dispatch修正（2026-10-04）
- Access migration guard の login／refresh 503 は維持し、`/api/auth/providers` の `password:false` を Access 設定時に同期した。legacy Supabase session／logout は product cookie → Access assertion → configured legacy cookie の順で選択する。
- `/s/` viewer、token／grant API、assets は configured legacy cookie の有無に関係なく `handleShareLinkRoute` へ到達し、share 管理 API と manual 業務 route は保護 dispatch を維持する。Supabase 未設定の legacy cookie fail-closed、product invalid cookie、tenant／workspace 境界は既存回帰を維持した。
- 検証: `node --experimental-transform-types --test tests/product-auth.test.mjs tests/share-link-backend.test.mjs` 42/42、skip 0、exit 0。Windows `npm ci`／full `npm run check`、CI、正式 Review、remote SHA、deploy／merge はcommit／push前のこの担当では未確認。
- 次のゲート: この担当が差分をcommit／pushしてremote SHAを照合した後、親PMが最新SHAでCI・正式Review・review threadを再取得する。

## Issue #283／PR #284 Codex Review 5404149929 新規指摘修正（2026-10-04T12:58:03+09:00）

- 対象はIssue #283／PR #284、branch `codex/manual-auth-office-integration-283`。この追補では、P1のAccess assertion成功後に競合する`__Host-mm_access`／`__Host-mm_refresh`を削除し、invalid assertion・検証障害・結果不明では削除しない境界を`apps/worker/src/index.ts`、`tests/product-auth.test.mjs`、API／Access契約へ同期した。product cookie優先、Supabase logoutの署名検証、Access設定fallbackの既存境界は維持する。
- P2では初回表示・再読み込みを含む`productAuthSessionSeen=false`のprovider設定失敗をpassword formへfallbackさせず、日本語エラーと再試行を表示する。`password: true`を確認した再試行成功後だけpassword formを表示し、入力値・return path・focusを保持する。render世代／provider request世代の遅延応答抑止を維持し、`APP_ASSET_VERSION`を全assetの実hashへ同期した。前追補の「Product session未確認時のpassword fallback維持」は本決定で失効する。
- 検証済み: `tests/app-auth.test.mjs` 118/118、`tests/product-auth.test.mjs` 33/33、`tests/worker-runtime.test.mjs` 71/71、`tests/product-auth-browser.test.mjs` 9/9、すべてskip 0・exit 0。`docs:check` 143 files、`encoding:check` 377 files、`git diff --check`、Worker harness／typecheckを直接Nodeで実行してexit 0を確認した。初回provider失敗→再試行成功、legacy cookie付きAccess logout成功、invalid Access assertionのcookie保持を実Worker相当／CFT browser回帰で確認した。実provider SSO、remote変更、staging／production反映、CI／正式Reviewは未確認。
- `npm ci`はWindowsの既知`node_modules/.package-lock.json` unlink `EPERM`のため再試行せず、`npm run check`の全成功とは扱わない。今回の差分をcommit／push後、local／origin／PR head SHA、同SHAのCI／Codex Review／review threadを親PMが再取得する。deploy／mergeは行わない。

## 手順書のアーカイブからの復元（ADR-0042／DEC-116、2026-11-08）

- 対象は文書棚卸しA-9（OQ-028の復元部分）。branch `codex/manual-restore-20261108`、baseはmain `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`。ADR-0042をAcceptedとし、status=archivedかつarchived_atありの手順書をowner／admin／editorがCAS付きRPC `restore_manual` で復元する。復元先は最新 `manual.archived` 監査の `metadata.previousStatus`（draft／reviewing／published／stale）へ正確に戻し、監査なし・不正値・同時刻の矛盾は推測せず拒否する。物理削除・自動削除は今回も有効化せず、猶予期間・参照削除順序・監査保持は別ADRとOQ-028へ残した。
- 実装はSupabase migration `202608180003_phase2_manual_restore.sql`（SECURITY DEFINER、FOR UPDATE、role確認、CAS、`manual.restored` 監査）、Worker `POST /api/workspaces/{workspaceId}/manuals/{manualId}/restore`、archived詳細の復元UI（確認ダイアログで共有リンク再有効化を明示）、Manual Edit API workflowへのSQL回帰登録commit（workflowファイルのpushはOAuthのworkflowスコープ不足で保留し、branch `codex/manual-restore-ci-20261108` に用意）。revision・手順・asset・共有リンク自体は変更せず、失効済みリンクは失効のまま、未失効・期限内リンクはarchived_at解消で再び有効になる。
- 検証: `npm run check` 全体成功（exit 0）。個別には `tests/manual-edit-api.test.mjs` 64/64、`tests/manual-editor-ui.test.mjs` 11/11。SQL回帰 `tests/sql/phase2-manual-restore-test.sql` はローカルにPostgresがなく未実行で、Manual Edit API CIのdisposable Postgresで実行する登録のみ（archive SQLと同じ扱い）。報告書は `docs/09-delivery/manual-restore-2026-11-08.md`。
- 制約: 通常の一覧・詳細取得は `archived_at is null` でarchivedを返さないため、通常UIからアーカイブ済み手順書を開く専用取得入口は未決のままOQ-028へ残した。RPC／API／UI部品は実装済みだが、到達導線の決定は別途必要。
- 次の1マイルストーン: 本PRのCI／Codex Review確認と監督側のマージ判断。その後、文書棚卸しA-10のTeam owner移管フロー（別PR）。
