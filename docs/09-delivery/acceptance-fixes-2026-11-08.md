# 受入フェーズ第一弾の修正（#272／#232）

Status: Accepted

最終全体回帰確認日時: 2026-11-08T14:45:20+09:00（Asia/Tokyo）。

着手確認日時: 2026-11-08T14:34:39+09:00（Asia/Tokyo）。base `2cfdee4136e885482fa8c14955fe93dc8a1bf927`、branch `codex/acceptance-fixes-20261108`。AGENTS.md、session-handoff、GitHub Issue #70／#272／#232を実取得して確認した。今回の1マイルストーンは保存準備の内容確認・エラー案内・初回空状態CTAの実装、検証、commit／指定branchへのpushまで。PR作成・merge・Issueへの書込みは依頼範囲外とする。

## 変更内容

1. 保存準備画面はprepareとfingerprint照合後、タイトル（空の場合の既定値含む）・手順数・画像数・目的・新規／更新・ロゴ有無を表示する。「この内容で保存する」までintent作成・画像／ロゴuploadを始めず、「やめる」で今回の送信を止めて拡張の下書きと編集タブへの復帰を案内する。表示文字列はtextContentを使う。確認待ちの二重起動を抑え、続行直前に元TTLで既存write検査を行う。completed／completion-pending／GET照合で確定する結果回収は確認待ちにしない。
2. 既存の拡張エラーガイダンスに指定8コードと内部コードを加えた共通表示辞書を設け、bootstrap側の3つの表示catchにも変換を適用した。未知の大文字スネークケースや拡張エラーを日本語案内へ変換し、既存の日本語エラー文は保持する。
3. Web手順書一覧の編集可能な0件表示に主CTA「手順書を作る」を追加し、既存フォームのタイトル入力へfocus・scrollする。閲覧者の説明を保持する。

拡張の製品コード、ハンドオフのschema、API endpoint、D1、依存、環境変数は変更していない。外部AI API呼出し、自動マスキング、自動置換は追加していない。asset versionは既存の内容hash規約に従って更新した。

## 検証

環境: Node v24.22.1、既設Playwright Chromium（合成fixture・ローカルHTTP・ローカルD1/R2）。実行IDは当セッションのexec session ID。

| 検査 | 結果 | 実行ID |
|---|---|---|
| `npm ci` | 成功、49 packages | 55692 |
| onboarding UI unit／recovery＋manual editor unit＋onboarding UI／share browser（5ファイル） | 45/45、fail 0、skip 0、exit 0 | 81567 |
| Phase 2既存「編集者は手順書作成から手順追加・手修正文保持まで完了できる」（実CTA Enter→focusを追加） | 1/1、exit 0 | 5758 |
| 実MV3・認証Office連携回帰（2ファイル、docx／pptx・合成Google／ChatGPT） | 3/3、fail 0、skip 0、exit 0 | 38879 |
| 全体 `npm run check` | 全56段階成功、Node test summary集計772/772、fail 0、skip 0、exit 0 | 57849 |
| 保存サマリーの実browser表示（1280px／390px） | 2/2表示、横overflowなし、ボタン高48〜50px、初期focusは確認ボタン | 73827 |
| 最終 `docs:check`／`secrets:check`／`encoding:check` | 文書153件・追跡461ファイルの秘密値検査・文字コード394ファイル、exit 0 | 86770 |
| `git diff --check`／`git diff --cached --check` | 成功 | — |

追加回帰はタイトルのHTML非解釈、空タイトル、新規／更新、ロゴ、保存・共有・Word・PowerPointの目的、requestedAction優先、pending再送、確認前intent／upload 0、取消後content write 0、確認待ちの重複クリック、確認後15分TTL切れ、未知拡張／内部コードとDRAFT_INVALID／CHUNK_SEQUENCE_INVALIDの画面非表示を確認する。辞書の全指定コードと内部コードは表示境界unitでも確認する。CTAはeditor／viewerの条件分岐、既存説明、focus・scrollをunitと実browserで確認する。

### 実行上の失敗と修正

- 制限内の初回`npm ci`（36668）はesbuildのspawnSync EPERMで失敗。制限外で再実行して成功した。
- 制限内Node testはファイル単位の終了しか返さなかったため、assertionを実行する制限外実行で数値を取得した。ファイル3件の表示をテスト3件の証跡にはしない。
- 最初のbrowser実行（89922）はHatch専用Chromiumの起動policy不足で失敗。既設Playwright Chromiumへ切替えた。
- 追加回帰の最初の実browser実行（38243）はfixtureの同一URL hash遷移と既存のreloadが競合し、15成功／1失敗。scenarioごとのnavigationへ修正した。追加回帰単独（97411）は未知内部コードの案内が「手順書」保持だけで、下書きと次操作の案内を欠くことを検出して失敗。未知コードの共通案内へ修正し、最終81567の45/45で解消を確認した。先行失敗を最終成功と混同しない。

## 既存テストを変更した箇所と理由

- `tests/onboarding-ui-browser.test.mjs`: 「completed finalize after response loss」の初回送信と「pending finalize retry」の初回／pending再送に確認クリックを追加。確定済み回収には追加しない。
- `tests/onboarding-share-browser.test.mjs`: guest共有のclaim前に確認クリックを追加。共有リンク自動作成なしのassertionを保持。
- `tests/onboarding-recovery-actions.test.mjs`: 一致するpending snapshot再送とbranding転送で確認を待ち、クリック前のwrite 0を確認するDOM fixtureへ更新。
- `tests/extension-cloud-save-runtime-browser.test.mjs`: 実MV3 coordinatorのdocx／pptx claim開始前に確認クリックを追加。
- `tests/office-auth-runtime-browser.test.mjs`: 合成Google／ChatGPT sessionでのOffice claimと、editor startRegistrationによる実handoffで確認クリックを追加。認証・出力のassertionを保持。
- `tests/e2e/phase2-manual-editor.spec.mjs`: 既存の編集者作成フローに空状態CTAとEnter後のタイトルfocus assertionを追加。

## 文書同期と設計判断

- `docs/02-ux/experience-principles.md`: 認証後の無条件自動継続を「保存内容確認→claim→元outputの自動継続」へ修正。
- `docs/02-ux/onboarding.md`: 初回導線と現行の保存確認・取消・TTL・回収・日本語エラー・一覧CTA契約を追記。
- ADR-0032: Web payload送信の前に確認を入れ、DOM複製禁止の例外をtextContentのタイトルと限定したサマリー情報だけに明記。本文・画像・識別情報の非表示は維持する。
- `docs/05-api/guest-onboarding-and-claim-api.md`: coordinatorの送信確認境界を追記。endpoint・message・認可契約の変更はない。
- `docs/07-quality/mvp-product-acceptance.md`: MVP-AC-010のtriggerを内容確認後とし、確認前送信抑止・取消・TTL・確定結果回収を明記。
- `docs/01-product/requirements-traceability.md`: FR-001／002／004／011／022、MVP-AC-010／011／013と対象実装・回帰を対応づけた。
- `docs/01-product/product-requirements.md`、`non-functional-requirements.md`、`scope.md`、`docs/07-quality/test-strategy.md`、ADR-0040を確認した。認証・workspace境界、guest原本保持、元output再開、手動画像確認、自動mask廃止の制約と今回の追加確認は両立するため、無関係な本文は変更しない。過去スライスの履歴を全面更新しない。
- `decision-log.md`に採否・根拠・範囲を記録した。#231のapp-assets分割は、今回の差分が一覧renderとイベント結線の局所に閉じるため見送り、分割を受入修正の前提にしない。

## 未実行事項と次の1マイルストーン

Phase 2 E2E全件は未実行（変更対象の既存1件を選択実行）。実providerのSSO、remote D1/R2、production／staging配信、実Officeアプリでの描画、人によるscreen reader・利用者受入は未実行。今回の許可範囲はローカル検証とbranch保存であり、remote設定・production反映の承認は含まれない。PR作成・CI確認・最新SHAの正式Codex Review・mergeは監督側が実施する。Issue #70は依頼の書込み禁止に従って更新しない。次は監督Museによるpush済みSHAのPR・CI・正式Reviewと実利用受入の照合。保存後の継続実行・自律監視は登録しない。

判断に迷った点: なし。APIが返さないワークスペース名は補完せず、pendingは再送だけを確認対象とし、確定結果の回収は従来の順序を維持した。


## 変更ファイル一覧

- 実装: `apps/worker/src/onboarding-assets.ts`、`apps/worker/src/app-assets.ts`。
- 回帰: `tests/onboarding-ui.test.mjs`、`tests/onboarding-ui-browser.test.mjs`、`tests/onboarding-recovery-actions.test.mjs`、`tests/onboarding-share-browser.test.mjs`、`tests/manual-editor-ui.test.mjs`、`tests/e2e/phase2-manual-editor.spec.mjs`、`tests/extension-cloud-save-runtime-browser.test.mjs`、`tests/office-auth-runtime-browser.test.mjs`。
- 文書: `docs/01-product/requirements-traceability.md`、`docs/02-ux/experience-principles.md`、`docs/02-ux/onboarding.md`、`docs/03-architecture/adrs/ADR-0032-value-first-guest-onboarding.md`、`docs/05-api/guest-onboarding-and-claim-api.md`、`docs/07-quality/mvp-product-acceptance.md`、`docs/09-delivery/decision-log.md`、`docs/09-delivery/session-handoff.md`、本報告書。


自己レビュー: 変更差分を再読し、通常送信・pending再送・確定結果回収・取消・TTL切れ・エラー表示・viewer境界を照合した。タイトル以外の下書き本文や画像をDOMへ追加せず、URL／storage／ログ／analyticsへの新規複製はない。API・DB・拡張の権限境界を変更していない。local検証の完了を、PRのCI・正式Review・商用受入の完了とは扱わない。

最終文書確認日時: 2026-11-08T14:46:45+09:00（Asia/Tokyo）。

表示確認: 合成タイトル・共有目的・更新・ロゴを表示したPC／狭幅のスクリーンショットを目視確認した。ブランド画像はこの一時サーバーでは404とし、既存の画像非表示fallbackを利用した。表示証跡は合成データのみの一時成果物で、配信の成功証跡にはしない。
