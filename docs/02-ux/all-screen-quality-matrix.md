# 全画面品質の状態台帳

Status: Proposed

Date: 2026-10-02

## 判定範囲

全画面は、ブランドサイト、拡張の入口・記録、端末の編集、保存後の編集、認証復帰、共有、閲覧、出力、既存のアプリ入口・ワークスペース・メンバー画面を含む。新機能の追加、production公開、DB移行、認証設定変更は対象に含めない。

基準は [独立レビュー基準](manual-editor-review-rubric.md) の2026-10-02版とする。既存の狭い画面評価やテスト件数を全画面の合格点へ換算しない。各行は実表示、主要操作、状態、幅、キーボード、失敗回復の証拠がそろうまで未確認を残す。

## 画面と状態

| 画面群 | 入口 | 必須状態・操作 | 今回の証拠入口 | 判定 |
|---|---|---|---|---|
| ブランド | `/`、`/app`、`/app/meccha-manual`、404（brand Worker） | PC/スマホ、画像読込、長文、キーボード、未公開CTA | all-screen-quality-browser | 未確認 |
| 拡張popup | popup.html | idle、準備中、記録中、停止、再開、取消失敗、対象なし、権限拒否、最近の下書き、連打 | extension-recording-quality-browser | Node確認・実表示待ち |
| 記録sidepanel | sidepanel.html | 空、記録中、追従/手動スクロール、画像状態、失敗、終了/編集失敗、復旧 | extension-recording-quality-browser、extension-sidepanel-browser | Node確認・実表示待ち |
| 端末エディタ | editor.html | 20手順/17番、初期空/不明な下書き、説明のみ、復帰、追加/削除/並替え/undo、保存中/失敗/再試行 | extension-editor-browser | 実表示待ち |
| 画像編集 | 共通inline editor | 矩形初期表示・色、矢印/文字/黒塗り/crop、縦長画像、decode、適用/取消、保存失敗、キー操作 | extension-editor-browser、cloud-manual-tools-browser | 実表示待ち |
| ローカル出力確認 | outputGate | 画像処理中、要確認、入力不正、保存失敗、修正手順への復帰、認証中断 | extension-editor-browser | 実表示待ち |
| 認証/保存継続 | `/onboarding/continue` | 初期、503/再送、欠落/期限切れ、完了/再表示、閉じたタブ、保存/共有へ戻る、スマホ | onboarding-ui-browser、onboarding-share-browser、all-screen-quality-browser | 実表示待ち・実SSO未確認 |
| クラウド一覧 | `/manuals` | 空、読込中、取得失敗/再試行、多件/長い題名、検索/結果なし | all-screen-quality-browser、cloud-manual-tools-browser | 実表示待ち |
| クラウド編集 | manual選択後 | 20手順/17番、編集/並替え/undo、保存/保存中追加入力/失敗/競合、読取専用、短い横画面 | cloud-manual-uiux-browser、cloud-manual-ui-browser | 実表示待ち |
| チームの見た目 | branding dialog | 色/ロゴ、縦横比、無効形式、処理中/保存失敗、閉じる/キー、出力への反映 | cloud-manual-tools-browser | 一部状態の追加証拠が必要 |
| 共有設定 | share drawer | 初期OFF、パスコード/期限、入力不正、作成/停止/コピー、拒否/結果不明、フォーカス | cloud-manual-sharing-failure-browser、cloud-manual-sharing-ui | 実表示待ち |
| 共有読者 | `/s/` | パスコード/不正、欠落/失効/停止、画像読込/失敗/再試行、前後/17番復帰/拡大、キー、別タブ復帰 | share-viewer-browser、all-screen-quality-browser | 実表示待ち |
| 印刷 | 印刷preview/PDF | 色/ロゴ、改ページ、長い説明/縦長画像、白紙/切断なし | cloud-manual-tools-browser | 画面待ち・PDFページ検証未実施 |
| 既存app入口 | app Worker `/` | 読込/失敗/再試行、ログイン/入力不正/再認証/ログアウト、200% | all-screen-quality-browser、phase1-flow | 実表示待ち |
| ワークスペース/メンバー | app shell | 空/有/読込失敗、権限別、長い名前、キー、登録フォーム、取消 | all-screen-quality-browser、phase1-flow | 実表示待ち |

## 幅と操作の扱い

- 各画面のPC1440px・スマホ390pxの実pixelsを最低条件にする。既存1366px証拠は補助として併記する
- 320/768/1024/1440/1920pxの横はみ出し、200%文字・400%相当reflow、短い横画面、reduced motion、可視focusを別に記録する
- popup/sidepanelは280/320/360pxと実MV3の自然な表示幅を併記する
- 日本語locale・Asia/Tokyoでnative date/file controlを検証し、ブラウザ言語の差を製品の翻訳欠陥と混同しない。日時は使用中のtimezoneと日本語previewで確認する
- 「該当なし」は理由が必要。手順書内容や権限を持たないLPへ保存失敗を要求するような無関係な状態は加えない

## 証拠と環境

初期checkoutはPR279 head `a44dde8d21066f8657fa11b4143ccfdf87f2f0e2`。再取得したActions run `36908271236` のartifact `11184624580` はmerge `206928fa0ff0cc3e8319b8b98178ef1c7651b613` の68PNGを含むが、68画面・68状態ではない。`capture-completion/baseline/saved-editor.png` は比較対象のmain `3c62ca5fdee5f09cce620566b654ab95a882ae0c` なので現候補の評価から除外する。

本セッションのローカルChromium起動はOS socketのEPERM、cloud browserのloopback previewはERR_BLOCKED_BY_CLIENT。制限は迂回せず、承認済みの作業branch/Draft PRに対する既存Actionsの公式Chrome for Testing・隔離profileで実表示を再検証する。ローカルで未実行の41件を製品の失敗や成功に数えない。

native visibility fixtureには明示的な `--enable-automation` を追加する。これは隔離テストbrowserのcommand-line取得に必要な試験設定で、製品extension権限・認証・capture privacyは変更しない。以前の4件のsetup失敗と製品動作を分離する。

新規状態台帳の自動出力は `.artifacts/all-screen-quality/after/inventory.json`。候補SHA・幅・locale・操作・実行結果が異なる証拠を混ぜない。保存やPIIの必須境界は既存の実MV3/API試験と合わせて判定し、合成APIの表示検査を実SSO・remote D1/R2の成立へ流用しない。

## 第1候補の実行（2026-10-02）

Draft PR280、head `1480910de07c8751e638eb7d69b58434c0b8a16d`、merge `e87c874949d8b545c37857811b42eb92ea0408f7`、公式Chrome run `36978549645`。artifact `11215065820`、ZIP SHA256 `a0c2aea9bbde6550c5619364a6f8127279f452ba671293b151f13ac9d674aeba`。107PNGは107画面ではなく、比較用の旧main画像も含む。

TAPはPII33/33、alias1/1、semantic3/3、mask4/4、editor24/25、native sidepanel3/3、capture3/3、caption6/6、cloud/追加表示41/42。aggregateは正しく失敗。追加2失敗はfixtureのhash-only navigation（module再実行前提の欠落）と不正なworkspace/user UUIDであり、修正後に実表示を再実行する。ブランドLP画像の不正なfixture routingも修正し、今後は表示中の全画像のload完了をassertする。

独立pixelレビューは、保存失敗badgeの切断解消、端末17番のrail復帰、横画面headerの縮小、mobile画像操作の一列化を確認。一方、短い横画面の画像文字の縮小、reader rail復帰、popup長い下書きの横はみ出し、記録前エラーの位置、LP日本語の語尾孤立を未完として残す。第2候補で修正・再表示する。

Legacy run `36978549673` ではreader12/12を確認し、4つの古いclaim runtime fixtureが失敗。2つの旧title selector、ADR-0038最終追補より前の注釈metadata/bitmap期待、参照stepのないtransfer画像を現契約へ同期する。mask境界、隠したcanaryのJSON非露出、全mask領域の不透明pixels、元draft保持とtransfer容量検証を維持・強化し、製品guardは変更しない。

## 第2候補の実行と次の証拠

PR head `ea40c22cd39ada399bbf816687410ccae2a1488e` とCI merge `7cb7f54ab92a9f7ce5a65a690af042ea60bb9ad8` は、Gitでtree `960294958d5399888866d785ade0222d10d7a88f` が一致した。公式Chrome run `36980797422`、artifact `11214689796`（ZIP SHA256 `7c1ddb143637e1d47a1f4f6d27dbc63d0ef61861313dc6145720f3ab32d37b65`）に146PNG、一般画面の49状態/幅レコードがある。これも146画面の合格ではない。

PII33/33、alias1/1、semantic3/3、mask4/4、editor25/25、native sidepanel3/3、capture3/3、caption6/6。cloud/追加表示は46/47で、画像拡大dialogの遅延close eventが後続の共有ボタンfocusを奪う不具合が残った。Legacy run `36980797415` のclaim runtimeは7/7で、原文canary非露出・mask全領域・保存原本・容量のassertを通した。

第3候補はfocus race、mobile画像の重なり、reader復帰見出し、空一覧の矛盾、閲覧専用案内、利用不能の状態色/再確認、mobile app navigation、保存失敗・404の語尾孤立を修正する。画像・見出し・設定・footerの非重複をgeometry assertionにする。full-pageとviewportの両PNG寸法、clientWidth/scrollWidthも記録し、scrollbarによる切断と製品overflowを混同しない。

追加の `ui-quality-lab-browser` は同じ公式Chromeのheadless modeで、12画像の合成手順書、1440/390px、各3回のfresh context、local HTTP/CPU未throttle、ja-JP/Asia-Tokyo/reduced-motion条件を固定する。LCP/CLS/long taskはlab値、画像表示までの操作時間はautomation観測値であり、field p75やINPとは呼ばない。DOM/計算済みcontrast/keyboardはhuman screen reader試験と区別する。実A4 PDFを出し、全ページをrenderして別途目視する。field traffic/実SSOを要する項目は不在理由を明記し、内部UI品質の適用範囲と分離する。
