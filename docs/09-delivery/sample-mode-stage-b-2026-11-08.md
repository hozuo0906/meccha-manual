# 拡張なしで編集できるサンプル（段階B）実施報告

Status: Accepted

Date: 2026-11-08

## 対象と結果

branch `codex/sample-mode-stage-b-20261108`、base／着手HEAD `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`（段階A PR #291マージ後）。監督Claudeの指示で、sampleのcanEditだけをtrueへ変更する。今回は実装・検証・文書同期・ローカルcommitまで。push／PR作成／mergeは監督側が行う。既存未追跡`.artifacts/`はcommit対象外。

## 解禁・遮断とwrite境界

- 解禁: 手順書タイトル・説明、手順タイトル・手順文、画像なし手順追加（上限200件）・削除・ボタン／Alt+矢印の並べ替え、メモリ内undo／redo。sampleの文章編集直後にも履歴ボタンを更新し、狭幅での追加後はパネルを閉じて新手順の説明へfocusする。
- 読み直し: 未保存変更の破棄確認を挟み、取消なら編集・履歴を保持する。確定後はfixtureと選択・dirty・undo／redoを初期化し、openManualのサーバー読込経路へ進まない。
- 遮断: 保存はsaveManualを呼ばず登録／ログインが必要な旨と引き継ぎ不可を表示。共有作成／停止、PDF・印刷プレビュー、Word／PowerPoint、画像差し替え／追加・注釈／切り抜き、チームの見た目は引き続き不可。画像拡大は可能。
- 防御: canWrite=false／canOutput=false、共通json／workspacePathのrequireCloudWriteに加え、saveManual・共有・出力・branding・画像エディタ起動・file click／change・upload入口で拒否する。共有フォームにもcanWriteを適用し、UI disabledだけに依存しない。D1/R2へguest content・workspace・revision・assetを作らず、API readもfixture投入だけで不要。
- 文言: 一覧メタは「サンプル」、saveStateは初期・編集後とも「サンプル・保存されません」。tools注記と初期messageで編集可能・保存不可・ページ離脱時消失を明示し、toolbarのサンプル明示を維持する。通常cloudの文言・挙動、ADR-0032本文、拡張製品コード、LP、新規API／migration／依存／環境変数は変更しない。
- 資産hashは既存Worker runtime回帰と同じ7assetのNUL連結SHA-256から生成し、APP_ASSET_VERSIONへ同期する。

## 検証

確認日時: 2026-11-08T19:28:57+09:00（Asia/Tokyo）。対象は着手HEADへ今回の差分を適用した作業ツリー、asset hash `sha256-0c09a389feb49956`。Node v24.22.1、Chrome for Testing 156.0.8078.47、合成データ／mock APIまたは実Workerのローカル呼出しを使用した。

| 検査 | 実行と結果 |
|---|---|
| `npm run check` 全体 | 実行`68196`、exit 0、全段完走。Node test summary 24組の集計780/780、fail 0／skip 0／cancelled 0。最終secret／encodingまで成功 |
| sample単体 | 全体check内の4件すべて成功。静的page／画像・storage呼出し0・既存routeの認証拒否・共通API gateの全method拒否に加え、実mode権限と保存／共有作成・停止／出力／画像編集／brandingの入口を直接実行して拒否を確認 |
| sampleブラウザ最終 | 実行`47522`、2/2、fail 0／skip 0、exit 0。1366×900／1024×768／390×844で画面と内部snapshotへの文章編集反映、追加／削除／ボタンとAlt矢印の並べ替え、undo／redo（ボタン・keyboard）、画像なし追加後のfocus、200件上限、未保存文言、読み直し確認／取消・履歴初期化、通常矢印選択、画像拡大とEscape復帰、限定入口を確認。無効要素のclick／submitとfile changeのdispatchを含め、sample中のAPI read／writeとD1/R2／limiterはすべて0回、pageerror／CSP違反0 |
| 通常モード等の7ファイル直列回帰 | 実行`16037`、38件中37成功・fail 0／cancelled 1／skip 0、exit 1。cloud保存・画像編集・branding・PDF・共有正常／失敗／遅延・Word／PowerPointを含むcloud側9件はすべて成功。既存拡張editorの認証引き継ぎテストが25秒timeout |
| 既存timeoutの単独再実行 | 実行`59165`、1件中pass 0・fail 0／cancelled 1／skip 0、exit 1。元のコード・assertion・25秒上限を変えずに再現 |
| timeoutの診断（元の検証の代替ではない） | 実行`32942`、/tmpコピーの総時間上限だけを60秒へ変更しimport／fixture参照を元の絶対パスへ補正。製品コード・assertion・各待機の上限は維持。1/1・fail 0／skip 0／cancelled 0・exit 0、ケース本体49.9秒。元の25秒gateを通過したとは扱わない |
| 文書・秘密値・文字コード・diff | 11ファイルstage後の実行`63556`でdocs 156件・secret 470件・encoding 431件・cached diff checkが成功。診断結果の追記後も同じ検査を行う |
| 型検査 | 実行`87153`の`npm run worker:typecheck`成功、全体checkでも成功 |

先行実行を最終結果へ混ぜない。制限内のsampleブラウザ実行`72415`はChrome起動時の`setsockopt: Operation not permitted`／SIGTRAPで2ケースとも操作本体未実行。許可された実行経路で既設Chromeを使い、`47443`で2/2成功後、通常矢印と画像なし手順の画像追加拒否を追加して上記`47522`を最終実行した。制限内のNode `--test`実行`48832`はfile単位1件のsummaryしか返さなかったため4件成功の根拠には用いず、直接実行`87153`の4/4と全体checkの実結果で確認した。sandbox起因の未実行を製品のassertion失敗やskipへ合算しない。今回追加した検証の最終未実行はないが、下記の実環境・人の受入は別ゲート。

通常回帰の未解消項目は`tests/extension-editor-browser.test.mjs:1359`の「handoff timeout keeps the editor visible and activation is explicit and idempotent」。一括と単独で25秒上限へ達したため、通常回帰全体の成功とは扱わない。このテスト、`apps/extension/`全体、共通browser launcherはbase `ec6b8db`と差分0であり、fixtureは変更したcloud資産をserve／importしない。製品の8秒待機を2回含み、60秒上限の診断ではケース本体が約50秒で完了した。現環境では25秒の総時間枠を超えることを確認したが、遅延の内訳は未特定。拡張の製品コード・元テスト・上限を変更して通過扱いにせず、監督へ引き継ぐ。

worker-runtime-mutationの複製対象は、今回の`app-assets.ts`／`cloud-manual-assets.ts`と既存依存`manual-sample-assets.ts`／branding／printを含むことを確認し、追加変更は不要だった。全体check内のmutation 3/3と資産hash回帰が成功した。

自己レビューで各write入口と通常cloudの条件が変わらないこと、変更がsample権限分岐へ閉じること、ADR-0032・LP・拡張製品コード・migration／依存／環境変数の無変更を確認した。390px生成画面で保存不可・離脱時消失、編集欄・下部操作・横overflowなしを確認した。これは正式Codex Reviewや監督本人の受入の代替ではない。

## 文書同期

DEC-112を追加し、DEC-111の編集禁止部分のみPartially Supersededとした。onboarding、全画面品質台帳、API契約、要件トレーサビリティ、session-handoffを段階Bへ同期する。段階A報告書は履歴として保持する。

## 変更ファイル

- `apps/worker/src/cloud-manual-assets.ts`
- `apps/worker/src/app-assets.ts`（生成版定数だけ）
- `tests/manual-sample.test.mjs`
- `tests/manual-sample-browser.test.mjs`
- `docs/09-delivery/decision-log.md`
- `docs/02-ux/onboarding.md`
- `docs/02-ux/all-screen-quality-matrix.md`
- `docs/05-api/api-contracts.md`
- `docs/01-product/requirements-traceability.md`
- `docs/09-delivery/session-handoff.md`
- `docs/09-delivery/sample-mode-stage-b-2026-11-08.md`

## 未実施事項と次の1マイルストーン

npm ci、正式Codex Review、push／PR作成／GitHub CI／merge／deploy、実SSO／remote D1/R2／Access policy、実Office描画、人のscreen reader確認は未実施。Issue #70はread-only取得し、段階Aが未反映の既存記録を確認した。外部反映は監督側へ引き継ぐため本セッションで書込みは行わない。

次は監督側がcommitを確認してpush／PRを行い、最新SHAのCI・正式Codex Review・threadと、拡張なしブラウザの編集受入を照合する。併せて既存拡張editorの25秒timeoutをtriageする（一括回帰は未通過）。ローカル画像編集は既存cloud uploadからの分離、Blob寿命／容量／途中失敗回帰を要する追加1〜2実装日規模の別段。形態D（認証後引き継ぎ）は所有権・期限・復旧契約の決定後に別見積もりとする。計画用概算であり完了時刻の約束ではない。保存・報告後は終了し、自律監視・終了後の継続実行は登録しない。
