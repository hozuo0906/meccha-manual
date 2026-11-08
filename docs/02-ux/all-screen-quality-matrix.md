# 全画面の品質・状態回復台帳

Status: Accepted

## 段階D: 登録後サンプル投入の追加証跡

DEC-112のcloud一覧0件／常設panel、編集詳細と「サンプル」badge、通常アーカイブを対象にする。`tests/sample-manual-import-browser.test.mjs`で1366×900／1024×900／390×900を確認し、本文なし明示POST、二重送信拒否、失敗後再試行、未保存変更保持、アーカイブ取消と再投入、横overflowなし、pageerrorなしを検証する。編集toolsのtoggleはcloudの幅分岐（760px以下「編集」、1100px以下「画像・編集」）を使う。閲覧専用サンプルの「操作案内」と区別する。`tests/sample-manual-import-ui.test.mjs`で遅延中の遷移・認証失敗・再読込失敗も確認する。実ユーザー／remote環境・人のscreen reader検証は別ゲート。

Date: 2026-11-08

PR #280の品質fixtureを、無加工画像・利用者確認（ADR-0040）と製品認証（ADR-0041）の現行契約へ適合させる。旧PRの採点・実行履歴・自動置換前提を現在の証拠として引き継がない。

| 画面 | 対象の状態・操作 | 検証source |
|---|---|---|
| popup / sidepanel | idle/recording/paused/finish_failed/reinjection_failed/cancel_failed/restore、busy・連打・44px・focus、状態/一覧/画像読込失敗、編集を開けない場合の下書き復旧 | extension-recording-quality-browser、extension-sidepanel-browser |
| 記録一覧 | 実scroll領域の末尾追従、過去手順閲覧中のanchor保持、画像読込失敗表示 | extension-recording-quality-browser、extension-sidepanel-browser |
| 端末editor | 17/20復帰、目次だけのscroll、短い画面、保存失敗・retry、下書き欠落/読込障害、原本を空データで置換しない | extension-editor-browser |
| cloud一覧 / editor | 初回loading/error/retry、再失敗後の再試行ボタンへのfocus復帰（待機中に別要素へ移動したfocusは維持）、空/検索0件、閲覧専用、画像編集・拡大・keyboard・選択rail・狭幅 | cloud-manual-ui-browser、cloud-manual-uiux-browser、cloud-manual-tools-browser、all-screen-quality-browser |
| サンプルeditor（段階A） | 認証不要・6手順／3同梱画像・サンプル明示・編集／出力禁止・API write 0回、1366/1024/390px、手順keyboard選択・画像拡大とEscape復帰 | manual-sample.test、manual-sample-browser |
| 製品認証 / 保存復帰 | provider表示、ChatGPT既定OFF、login・loading/error、handoff期限切れの原本復旧、設定利用不能の再確認 | all-screen-quality-browser、product-auth-browser、onboarding-ui-browser |
| 共有読者 | パスコード・リンク欠落・読み進める・17番復帰・選択目次・印刷・失効 | share-viewer-browser、all-screen-quality-browser |
| brand LP | ブランド画像・コピー・レスポンシブ・overflow | all-screen-quality-browser、brand:check |
| lab | 合成12画像、1440/390px、各3 fresh context、日本語/Asia-Tokyo/reduced-motion、計算済みcontrast・keyboard・実A4 PDF生成 | ui-quality-lab-browser |

検証用の画像・文字は合成データのみ。browser fixtureの成果物は`.artifacts/all-screen-quality/after/`と`test-results/recording-quality/`。候補SHA、viewport、browser、実行環境、失敗/未確認を[回収報告書](../09-delivery/ui-recovery-2026-11-08.md)へ記録する。生成PNGの枚数を合格画面数にしない。

内部採点条件は[受入レビュー](manual-editor-review-rubric.md)の各画面90/100・全軸4/5・必須状態未確認ゼロと安全条件を使う。今回の自動試験のみでこの採点の合格は宣言しない。labはfield p75/INPではなく、PDF生成は全ページの目視受入ではない。実SSO、remote D1/R2、実Office表示、人によるscreen reader確認、一般公開は別検証。merge/deploy/環境変更は今回行わない。
