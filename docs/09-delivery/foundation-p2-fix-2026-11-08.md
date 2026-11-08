# PR #285: 共有応答待ちと画像編集の排他修正

Status: Accepted

確認日時: 2026-11-08T08:38:01+09:00（Asia/Tokyo）。実行主体: 本セッションの実装担当。監督: Muse。独立担当・サブエージェント・自律監視は使用していない。実行モデル／reasoningの外部確認は未確認。

## 対象と再現条件

- branch: `codex/foundation-no-automask-20261107`。起点: `6f546862b8515d96317963226ab0b0d0a9244744`。PR #285のheadとの一致、Draft、未mergeをGitHub Appで取得した。
- 指摘: [review comment 4503895303](https://github.com/hozuo0906/meccha-manual/pull/285#discussion_r4503895303)、thread `PRRT_kwDOTpNknc607I1p`。着手時は未解決。
- 関連するFR-004／FR-005／FR-012、AC-010／AC-011／AC-030／AC-031、ADR-0034／ADR-0038、既存UX・トレーサビリティ・品質戦略・Issue #70を確認した。
- クラウド編集画面で共有リンク作成POSTまたは停止DELETEを送信する。応答が遅れている間に共有パネルを閉じ、画像編集を開ける。共有の成功処理は`renderDetail(detailData)`を呼び、`detail.replaceChildren()`が画像編集dialogを削除する。通常のcloseを経由しないため未適用編集を失い、`activeCloudImageEditor`が解除されず、保存・手順切替・次の画像編集が拒否される。
- 修正前ソースで追加回帰を実行し、POST／DELETEの両方が「応答待ち中にdialogが存在する（実際1、期待0）」という狙った理由で失敗した。ブラウザ起動失敗を再現成功には数えていない。

## 採った方法と理由

`openCloudImageEditor`の先頭で既存`shareBusy`を確認し、共有操作中は「共有操作の完了後に画像を編集してください。」と警告してreturnする。画像読込・dialog生成・`activeCloudImageEditor`設定より前に拒否する。矢印・文字追加、切り抜き、画像追加・差し替えが通る共通入口への1か所の追加である。

共有成功時の再描画は既存どおり行い、既存のfinallyで共有処理の排他を解除する。画像編集中は共有開始ボタンが無効化され、共有発行処理にも既存の画像処理gateがある。新たな保留再描画・状態・依存を作らず、指摘の競合だけを防ぐ方法を採った。

JavaScript変更に伴い、既存runtime検査が要求する`APP_ASSET_VERSION`を内容ハッシュへ更新した。共有API、認証、保存、DB、画像の手動保護の契約は変更せず、自動マスキングを追加していない。UX契約、トレーサビリティ、decision-logを同じ差分で同期した。

## 追加したテスト

既存の`node --test`＋Playwright基盤と`tests/cloud-manual-sharing-failure-browser.test.mjs`にPOST／DELETEの2ケースを追加した。既存npm scriptと品質CIがこのファイルを実行するため、実行設定は変更していない。

1. 合成APIの共有応答を明示的なPromiseで保留し、request到達を待って共有パネルを閉じる。
2. 「矢印・文字を追加」「切り抜き」の開始を試し、dialog未生成、日本語警告、画像upload／保存なしを確認する。
3. 応答を解放し、再読込なしで画像編集を開く。編集中の共有ボタン無効化、四角の色変更・適用・draft保存を確認する。
4. 別手順へ切り替え、切り抜きを再openして取消でき、共有ボタンが復帰することとpage errorなしを確認する。

## 検証

Node v24.22.1、lockfileどおりの`npm ci`、既設Chromium（Playwright cache `chromium-1248`）の隔離profileを使用した。`MECCHA_TEST_CHROME_PATH`で既存テストhelperへbinaryを指定した。合成画像・合成APIによるlocal browser回帰であり、remote Access／D1／R2の検証ではない。

| 検査 | 結果 |
|---|---|
| 追加回帰・修正前（2ケース） | 0/2、期待したassertionで両方失敗 |
| 追加回帰・修正後（同じ2ケース） | 2/2成功、skip 0 |
| 関連browser 6ファイル | 8/8成功、fail 0、skip 0、exit 0 |
| `npm run check` | 定義どおりの全項目成功、exit 0（実行ID `86394`）。最後のsecret／encodingまで完走 |

関連browserの対象は`cloud-manual-ui-browser`、`cloud-manual-sharing-ui`、`cloud-manual-sharing-failure-browser`、`cloud-manual-uiux-browser`、`cloud-manual-tools-browser`、`cloud-office-export-browser`。共有の確定エラー・結果不明・再試行・古い応答、画像の安全なupload・手動黒塗り、3画面幅、undo・保存・再表示、Officeを含む。

初回の`npm ci`とNode test起動はsandboxの子プロセス制約で失敗し、sandbox外で再実行した。依存の要求するChromium cache版は未導入のため、既設binaryを指定した。標準check初回はasset version不一致を正しく検出し、内容ハッシュ更新後に全体を再実行した。

## 変更ファイル

- `apps/worker/src/cloud-manual-assets.ts`: 共通画像編集入口の共有処理gate。
- `apps/worker/src/app-assets.ts`: 既存規約に従うasset内容ハッシュ更新。
- `tests/cloud-manual-sharing-failure-browser.test.mjs`: 遅延POST／DELETEの回帰2件。
- `docs/02-ux/phase2-manual-editor-ui.md`: 共有応答待ちの画像編集開始抑止。
- `docs/01-product/requirements-traceability.md`: FRと回帰証跡の対応。
- `docs/09-delivery/decision-log.md`: 最小排他を採用した理由。
- `docs/09-delivery/session-handoff.md`: 本修正のcheckpointと次の作業。
- `docs/09-delivery/foundation-p2-fix-2026-11-08.md`: 本報告書。

## 引き継ぎ

本報告書を含む同じcommitをoriginの同名branchへpushする。PR #285はDraftを維持し、merge・deployは行わない。他PRへのコメントは行わない。次の1マイルストーンはMuseによる新headのCI／Codex Reviewと本指摘threadの解決確認。local回帰成功を最新headのCI／再レビュー完了とは扱わない。
