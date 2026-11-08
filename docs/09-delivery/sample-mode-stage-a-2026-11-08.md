# 拡張なしで開けるサンプル（段階A）実施報告

Status: Accepted

Date: 2026-11-08

## 対象と結果

branch `codex/sample-mode-stage-a-20261108`、base／着手HEAD `7cb76e4450105994da7dd1f7b8f3ff0f4b166555`。前任の未commit差分6ファイルを確認して継続した。主目的はMuseによるChrome拡張なしのWebエディタ受入テスト。今回は閲覧のみを実装し、commitまでを行う。ユーザー指示に従いpush、PR作成、Issue #70書込みは行わない。

## 実装

- サンプルrouteは`/manuals/sample`。認証、拡張、Personal Workspace解決なしで通常エディタの`detailData`／`editorState`へfixtureを投入する。
- fixtureは架空の社内ツール「おためし申請」で会議用ボードを借りる6手順。画像3枚（`list.png`、`form.png`、`complete.png`）は本作業でHTML/CSSの合成画面からChromeで描画した800×480 PNG。実在画面、個人・企業情報、実ユーザー操作、外部画像を使用していない。3画像を6手順で再利用する。
- 画像は`apps/worker/brand-assets/assets/manual-sample/`の実ファイルを既存ASSETS bindingで配信。静的routeは`GET /manuals/sample/images/{name}.png`の1経路で3名前だけを許可し、data URLを埋め込まない。
- mode権限を固定し、API共通呼出し`json`と`workspacePath`でsampleを拒否する。保存・共有作成／失効・画像編集・branding・PDF・Officeの入口もmodeで止める。UIを無効化するだけに依存しない。sample表示中はAPIのreadも不要で、D1/R2／guest永続化・workspace・revisionを作らない。
- 手順選択・説明開閉・画像拡大・読み直しを許可し、タイトル／手順文・順序・削除・画像差し替え・保存・共有・PDF／Officeは不可。toolbarと画像拡大内にサンプルと明示する。ログインと手順書0件の空状態（cloud／既存app shell）にだけ控えめな入口を設ける。LPは変更しない。
- DEC-111、UX／API／traceability／品質台帳を同期。ADR-0032本文、新規API、migration、認証設定、依存、環境変数、拡張製品コードは変更しない。

## 検証

最終回帰確認日時: 2026-11-08T18:41:05+09:00（Asia/Tokyo）。

検証対象は上記baseに今回の実装差分を適用した作業ツリー（共通asset hash `sha256-fde69b674c613064`）。Node v24.22.1、Chrome for Testing 156.0.8078.47、合成データ・mock APIまたは実Workerのローカル呼出しを使用した。

- 全体`npm run check`: 実行`11821`、exit 0、56段階を完走。Node test summary集計779/779、fail 0／skip 0。追加した`manual-sample.test.mjs`の3件を`test:cloud-manual`へ組み込み、静的page／JS／CSS／3画像、storage呼出し0、共通API gateのGET／POST／PATCH／PUT／DELETE拒否、既存`/manuals`のログインredirect・業務APIの`401 SESSION_REQUIRED`、sample非GET／未知画像の404を確認した。
- sampleブラウザ単独: 実行`9485`、1/1、fail 0／skip 0、exit 0。1366×900／1024×768／390×844で6手順と画像、編集不可、サンプル明示、矢印キー・並べ替え不可、画像拡大／原寸／全体／Escapeとfocus復帰、説明・panel開閉・読み直し、無効要素へのclick／submit／inputのdispatch、ログインからのkeyboard再入場を確認。sample表示中のAPI read／writeはともに0、D1/R2／limiterの呼出しも0だった。
- 既存Phase 2作成編集E2E: 実行`70955`、28/28、exit 0。元のconfig／assertionを使い、実行ファイルだけ既設Chromeへ合わせる一時configで実施。作成、保存、公開版保持、archive、権限失効、競合、画像差し替え、狭幅・keyboard、プレビューを確認した。
- 通常エディタ等の10ファイル直列回帰: 実行`56504`、50/50、fail 0／skip 0、exit 0。上記sample操作に加えて空状態の入口と検索0件／取得失敗／既存一覧への非表示、既存cloudの保存・画像編集・branding・PDF・共有の正常／失敗／遅延、Word／PowerPoint、拡張editorの履歴・画像・競合・output gate回帰、既存app shellの0件入口を確認した。
- 最終文書更新・新規ファイルのstage後: 実行`65837`で`docs:check` 155件、`secrets:check` 469件、`encoding:check` 476件、cached diff checkがexit 0。制限内の追確認で発生した`spawnSync git EPERM`は、許可された実行経路で再検証した。
- 自己レビューでは各write経路のmode gate、read-onlyの通常モード出力維持、fixtureに秘密値・実ユーザー情報がないこと、ASSETSの固定対応、LP・migration・拡張製品コードに差分がないことを確認した。正式Codex Reviewと人の受入は別ゲート。

先行失敗は成功実行に混ぜない。sandbox内ではNodeの隔離子プロセスとChrome起動が制限され、meta Chromiumは起動policy不足、CFTはsocket操作拒否で起動しなかった。許可された実行経路の既設CFTへ切り替えた。最初の全体check（`70298`）はmutation用の複製treeに新規fixtureがなく2件失敗したため、複製対象へ加えて全体を再実行した。sampleブラウザの先行2回（`34274`／`76494`）は無効PDF操作後のpanel閉鎖／開いたpanelへの再クリックというテスト操作の不備で失敗し、panel状態に従う操作へ修正した。`npm ci`は実行していない。

## 変更ファイル

- `apps/worker/brand-assets/assets/manual-sample/complete.png`
- `apps/worker/brand-assets/assets/manual-sample/form.png`
- `apps/worker/brand-assets/assets/manual-sample/list.png`
- `apps/worker/src/app-assets.ts`
- `apps/worker/src/cloud-manual-assets.ts`
- `apps/worker/src/index.ts`
- `apps/worker/src/manual-branding-assets.ts`
- `apps/worker/src/manual-print-assets.ts`
- `apps/worker/src/manual-sample-assets.ts`
- `docs/01-product/requirements-traceability.md`
- `docs/02-ux/all-screen-quality-matrix.md`
- `docs/02-ux/onboarding.md`
- `docs/05-api/api-contracts.md`
- `docs/09-delivery/decision-log.md`
- `docs/09-delivery/sample-mode-stage-a-2026-11-08.md`
- `docs/09-delivery/session-handoff.md`
- `package.json`
- `tests/manual-editor-ui.test.mjs`
- `tests/manual-sample-browser.test.mjs`
- `tests/manual-sample.test.mjs`
- `tests/worker-runtime-mutation.test.mjs`

## 未実施事項と次の1マイルストーン

push／PR／GitHub CI／正式Codex Review／merge／deploy、remote SSO・D1/R2・Cloudflare Access policy、人によるscreen readerとMuse本人の受入は未実施。既存未追跡artifactは保持してcommit対象から除外する。実行終了後の監視・継続実行は登録しない。

次は監督側がcommitを確認してpush／PRを行い、最新SHAのCI・Review・threadと、拡張なしブラウザでの受入を照合する。サンプルの公開routeが上流Access policyで遮断される実環境では別途policy確認が必要だが、今回は環境設定を変更しない。

## 段階Bへ進む場合の見積もり

fixture投入経路とmode分離は再利用できる。追加範囲を「タブ内メモリだけでタイトル・説明・手順追加／並べ替え／削除を編集、API writeは引き続き禁止」に限定した場合、履歴・未保存変更・読直し確認・狭幅／keyboard・write 0回回帰の追加と文書同期で1〜2実装日を目安とする。画像差し替え／注釈をlocalで完結させる場合は、既存cloud uploadからの分離とBlob寿命／容量／途中失敗回帰でさらに1〜2日。local永続化・認証後claim／保存／出力への引き継ぎまで含めるなら、所有権・期限・復旧契約の決定後に別途見積もる。これは計画用の概算であり、段階Bの着手・完了時刻を約束しない。
