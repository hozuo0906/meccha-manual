# 受入フェーズ次弾: 保存先名と状態・種類の表示修正

Status: Accepted

全体回帰確認日時: 2026-11-08T19:29:40+09:00（Asia/Tokyo）。

着手確認日時: 2026-11-08T19:18:03+09:00（Asia/Tokyo）。base／着手HEAD `ec6b8db1b8d66e6df03af88ba7a745442ac8fe6b`、branch `codex/acceptance-display-fixes-20261108`。着手時の追跡済み・未追跡差分は0。AGENTS.md、session-handoff最新checkpoint、bootstrap契約、PR #289報告書、Issue #70を読み取り確認し、mainの#289／#290／#291統合をgit履歴で照合した。Issue #70の最新記録は#290であり、今回の同期はユーザー指定により監督側へ引き継ぐ。

今回の1マイルストーンは指定2件の実装・回帰・文書同期・自己レビュー・commit／同名branchへのpushまで。PR作成・Issue #70更新・mergeは実施しない。既設node_modulesを使用し、`npm ci`は再実行しない。監督側のnpm ciチェックは未チェックのままとする。

## 変更内容とAPI境界

1. `BootstrapResult`を`{ status: "ready", workspaceId, workspaceName, createdIdentity }`へ拡張した。最終SELECTで`w.id = o.workspace_id`へJOINし、既存の`o.application_id = identity(actor)`／`operation_id`／`o.workspace_id = authorized(actor)`条件をすべて維持する。名前は同じ認可済みactive Personal Workspace行からだけ読み、clientのworkspace ID／名前を入力にしない。`bootstrapOnboarding`はrepository結果をそのまま`jsonResponse`へ渡しており、index.tsの変更は不要だった。
2. 名前はoperationへ保存せず、毎回DBの現在値を返す。通常の同operation再送は同名になり、改名後の別operationと同operationも現在名になる。identity・operation・signup eventの冪等性とatomic batchは維持する。schema／migration／D1制約は変更不要な既存列の読み取り拡張である。
3. bootstrap完了後、確認サマリーを表示する前に`#save-workspace`へ`保存先：{workspaceName}`をtextContentで設定する。空・空白・欠落・非文字列は行を隠す。保存・共有・Word／PowerPointで同じ条件を使う。既存手順書の更新先がbootstrapのPersonal Workspaceと異なる場合は誤案内を避けて隠す。bootstrapを呼ばないpending再送・確定結果回収は従来どおり進め、保存名を別の情報から補完しない。
4. manualの一覧badge／基本情報は`manualStatusLabel`、手順カード／読み取りプレビューは`manualStepTypeLabel`へ統一した。辞書外は「状態不明」「種類不明」。後者は表示項目「種類」に合わせ、状態と種別を取り違えない日本語を採用した。`Object.hasOwn`で`toString`／`constructor`／`__proto__`等の継承キーも除外する。
5. 7assetの既存内容hash規約で`APP_ASSET_VERSION=sha256-ba29245963f4bb59`へ再計算した。

## 状態・種類の洗い出し

| ラベル辞書 | 値と表示文字列 | フォールバック／生成境界 | 変更有無 |
|---|---|---|---|
| manualStatusLabels | draft＝下書き、reviewing＝確認中、published＝公開済み、stale＝要更新、archived＝アーカイブ | 一覧badge・基本情報とも「状態不明」 | 解決関数へ変更。5値の表示は維持 |
| manualStepTypeLabels | action＝操作、note＝補足、decision＝判断、warning＝注意 | カード・プレビューとも「種類不明」。optionはObject.entriesの固定値のみ | 解決関数へ変更。4値の表示は維持 |
| manualActionTypeLabels | click＝クリック、input＝入力、select＝選択、navigate＝移動、wait＝待機、other＝その他 | actionTypeOptionsのObject.entriesのみ。先頭に空値「操作なし」。未知値をoption文字列へ挿入しない | 変更なし、未知値を反映しない回帰を追加 |
| workspaceRoleLabels | owner＝管理責任者、admin＝管理者、editor＝編集者、viewer＝閲覧者 | メンバーbadgeは既存「権限不明」。直接参照は固定role配列または検証済みstateのみ | 変更なし（下記根拠） |
| workspaceMemberStatusLabels | active＝利用中、invited＝招待中、removed＝停止済み | メンバーbadgeは既存「状態不明」。payloadはallowlist検証 | 変更なし |
| workspaceStatusLabels | active＝利用中、suspended＝停止中、deleted＝削除済み | workspace一覧は既存「状態不明」 | 変更なし |

manual状態の正本はPostgres baseline migration `202608020001_phase2_manual_core.sql`の`manual_status`、D1 repository／manual-router／manual-edit-routerの`ManualStatus`であり、いずれも上記5値。辞書に欠落はなく、問題は辞書外の表示解決に限られる。

workspaceRoleLabelsの直接参照を個別に確認した。

| 箇所 | 到達する値の根拠 | 判断 |
|---|---|---|
| member role変更option | `['admin', 'editor', 'viewer']`の固定配列 | 辞書外は到達せず変更なし |
| メンバー管理の権限注記 | `loadWorkspaceMembers`が`validWorkspaceMembersPayload`のvalidRoles（4値）を通した後のstateを使用。loading／error／未選択は注記前にreturn | 辞書外は到達せず変更なし |
| 手順書shellの現在権限badge | 上記検証後の`workspaceMembersState.currentUserRole`。未取得はnullで非表示、再取得中は検証済み旧値のみ保持 | 辞書外は到達せず変更なし |
| 通常shellの現在／前回権限badge | 同じstateからworkspace一致を確認して`currentRole`を取得。未確認は別の日本語案内 | 辞書外は到達せず変更なし |

#231のapp-assets.ts分割は、今回が表示解決関数と4表示箇所・内容hashの局所変更であるため対象外。無関係な分割を受入修正の前提にしない。

## 検証

環境: Node v24.22.1、既設node_modules、SQLite in-memory D1互換binding、既設Playwright Chromium 1248。browserは既存launcherの`MECCHA_TEST_CHROME_PATH`でテスト用binaryを指定。合成actor／合成workspace名／合成画像だけを使用した。以下の独立実行を単一の合計成功へ合算しない。

| 検証 | 結果 | 実行ID |
|---|---|---|
| bootstrap／既存mutation／manual UI／onboarding unit・recovery（5ファイル） | 66/66、fail 0、skip 0、exit 0 | 64725 |
| 最終SELECTの認可削除mutationを追加後のbootstrap mutation | 2/2、fail 0、skip 0、exit 0 | 13800 |
| onboarding／share browser（2ファイル、直列） | 16/16、fail 0、skip 0、exit 0 | 41998 |
| 全体`npm run check` | 55個のchain script完走（親checkを含む実行headerは56）、Node test summary 783/783、fail 0、skip 0、exit 0 | 99956 |
| check外`test:extension-cloud-claim:runtime` | 6/7、fail 1、skip 0、exit 1（初回Accessのproxy tunnel失敗） | 74860 |
| 初回Accessだけローカルproxy無効で再実行 | 1/1、fail 0、skip 0、exit 0 | 19900 |
| check外 実MV3 Office／製品認証Office（2ファイル、直列） | 3/3、fail 0、skip 0、exit 0 | 86133 |
| check外 既存Phase 2 E2E | 28/28、fail 0、skip 0、exit 0 | 32979 |

### 認可negative・mutationと表示回帰

- 初回作成と既存workspaceへの別operation再bootstrapで本人の保存名を返す。改名後の別operationと元operationの現在名、および新operationの冪等再送一致を確認した。
- A／Bへ異なる合成名を保存し、Bの実Worker HTTP応答がB名だけを返してA名を含まないことを確認した。
- B operationをA workspaceへ変更する通常のUPDATEはD1のimmutable triggerで拒否される。そのtriggerだけをテスト内で外して故障注入し、bootstrapのbatchが正常完了した後、最終SELECTで`unavailable`となることを確認した。HTTPは既存の503／`D1_UNAVAILABLE`を維持し、workspaceName／A名を返さない。
- 最終SELECTの`o.workspace_id = authorized(actor)`を削除する変異では上記拒否assertionが失敗することを検出した。既存issuer／subject境界mutationも成功。制約の前提エラーを最終SELECTの防御成功へ取り違えない。
- browserは保存／共有／Word／PowerPointで確認前に保存名が見えること、HTMLタグ・引用符・&を含む名前から子imgが生じないこと、空／空白／欠落／nullの非表示、同じ更新先では表示・別更新先では非表示、pending回収でbootstrapを追加しないことを確認した。確認前のintent／upload 0、取消、TTL、原本保持の既存assertionも保持した。
- manual rendererを実APP_JSから実行し、5状態と4種別の従来表示、未知文字列・空・undefined・null・継承キーの安全な表示を一覧／基本情報／編集・閲覧カード／プレビューで確認した。

### 先行失敗と修正

- 準備スクリプトの最初の起動は`python`未導入でexit 127。`python3`へ切替えた。追記した編集処理を実行する際は、適用済みhunkのassertionで一度停止し、未適用部分だけを実行した。これらをテスト実行成功に数えない。
- 制限内の最初のNode実行は2ファイル単位の失敗だけを返し、assertion結果を取得できなかった（実行51d9c7）。許可された制限外実行で実際のケースを実行した。
- 最初の実ケース実行84998は37/41成功・4失敗。追加VMテスト3件は同じcontextへのconst再定義、追加HTTP negative 1件は既存エラーコードを`ONBOARDING_UNAVAILABLE`と誤って期待したことが原因。各評価に新contextを使い、実装の既存503／`D1_UNAVAILABLE`を正としてassertionを修正した。製品のエラー挙動は変更せず、最終64725で解消を確認した。
- 実MV3 runtime一括74860は6/7成功、初回Accessだけ`page.goto`の`ERR_TUNNEL_CONNECTION_FAILED`でexit 1。テストはhost-resolverで合成HTTPSサーバーへ接続するが、proxy tunnelで最初の遷移が止まった。/tmpのテスト専用起動ラッパーで同じChromiumへ`--no-proxy-server`を付け、同じテスト・assertionを19900で実行した結果1/1成功。製品・テスト・remote設定は変更せず、別実行を単一の7/7成功へ合算しない。
- 最初のPhase 2 E2E（45154）は/tmpの一時configから相対webServerコマンドを実行し、`/tmp/tests/fixtures/phase1-browser-server.mjs`不在でテスト開始前に停止した。一時configのwebServer.cwdをrepoへ固定して32979で再実行した。repoの設定・テスト本体は変更していない。

## 既存テストの変更と理由

- `tests/onboarding-bootstrap.test.mjs`: 既存の初回HTTP／repository再送完全一致を維持し、名前のassertionを追加。改名・A/B分離・故障注入negativeを追加した。応答shapeの完全一致期待値を削る変更はない。
- `tests/onboarding-bootstrap-mutation.test.mjs`: 最終認可SELECTを削除するmutationを追加し、名前取得JOINが認可境界に閉じていることを検証した。
- `tests/manual-editor-ui.test.mjs`: 実rendererの一覧／基本情報／手順カード／プレビュー、固定action optionへ3回帰を追加した。
- `tests/onboarding-ui-browser.test.mjs`: 保存確認fixtureのbootstrap応答にworkspaceId／workspaceNameを追加し、名前表示・非表示・HTML非解釈を既存確認回帰へ追加した。既存の「説明を繰り返さない」assertionと保存タイミングのassertionは維持する。

## 文書同期と自己レビュー

bootstrap responseと認可・現在名・表示条件をAPI契約へ、既存の「APIが返さないため名前を表示しない」をUXへ同期し、manual状態・種別の汎用表示をPhase 2 UI契約へ追記した。DEC-112にAPI拡張と認可、未知表示の文言と非変更箇所の根拠を記録した。requirements-traceability.mdにはbootstrap境界やeventの記載はあるがbootstrap response shapeの対応記載はないため、指示どおり変更しない。

FR-001／002／022、NFR-001／004／008、MVP-AC-008〜013、ADR-0032、test-strategyを照合した。正常系・異常系・同operation再送・改名・途中batch失敗の既存回帰・権限境界・取消とTTLを差分で自己レビューした。client入力から名前を引く経路、analytics／storage／ログへの保存名の追加、拡張へのcredential転送はない。guest本文・画像の認証前送信、自動マスキング／自動置換、外部AI APIを追加していない。新規依存・環境変数・DB schema・共通module・永続状態の追加もない。

## 変更ファイル一覧

- 実装: `apps/worker/src/infra/d1/onboarding-repository.ts`、`apps/worker/src/onboarding-assets.ts`、`apps/worker/src/app-assets.ts`。
- 回帰: `tests/onboarding-bootstrap.test.mjs`、`tests/onboarding-bootstrap-mutation.test.mjs`、`tests/onboarding-ui-browser.test.mjs`、`tests/manual-editor-ui.test.mjs`。
- 文書: `docs/05-api/guest-onboarding-and-claim-api.md`、`docs/02-ux/onboarding.md`、`docs/02-ux/phase2-manual-editor-ui.md`、`docs/09-delivery/decision-log.md`、`docs/09-delivery/session-handoff.md`、本報告書。

## 保存結果・未実行事項・次の1マイルストーン

実装・契約・回帰・本報告書・checkpointを同じ修正commitへ含め、`origin/codex/acceptance-display-fixes-20261108`へ保存する。確定commit SHAと保存確認は後続の文書commitへ記録する。

最終検証確認日時: 2026-11-08T19:30:29+09:00（Asia/Tokyo）。全体check後の文書・秘密値・encoding・diff確認も成功（65735）。新たな実装変更はない。

`npm ci`は監督側担当として未実施。実providerのSSO／実Access policy、remote D1/R2、production／staging配信、実Officeアプリ描画、人のscreen reader・利用者受入、PR作成・GitHub CI・最新SHAの正式Codex Review・Issue #70更新・mergeは未実施。ローカルの合成試験を実環境の成功へ置き換えない。

次の1マイルストーンは監督Museによるpush済みSHAのPR作成、CI・正式Codex Review・thread／SHA照合と実利用受入。ユーザー指示に従いPR・Issueは実装担当から書き込まない。保存・報告後は終了し、自律監視・終了後の継続実行は登録しない。
