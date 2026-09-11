# スコープ

Status: Accepted

## 全体方針

`めっちゃマニュアル` は、将来必要になり得る機能を先回りして全部設計・実装するのではなく、現在の価値検証に必要な縦切りを優先する。

未検証の将来要件は `Deferred` とし、必要性が確認されるまで詳細設計・UI・データ構造・課金契約を固定しすぎない。セキュリティ、プライバシー、認可、データ損失防止は簡素化の対象外とする。

## 初回商用MVP

初回MVPで利用者が完遂すべき主要導線は次とする。

`LP -> Chrome拡張導入 -> PC/スマホ/タブレット表示を選択 -> 操作を記録 -> ローカル下書き生成 -> 編集 -> 保存/共有/PDFを選択 -> アカウント作成/ログイン -> guest claim -> output完了`

### Launch必須

- Chrome Extension Manifest V3による操作記録。
- `activeTab` / `scripting` 中心の最小権限。
- PC / スマホ / タブレットの3表示モード。
- スマホ／タブレットのportrait / landscape。
- アカウント未作成で1本目をローカル作成・編集できるguest mode。
- guest contentを認証前にD1/R2へ送らない境界。
- output時のセルフサーブ認証。
- 検証済みAccess human actorからPersonal Workspaceをatomic・冪等に自動準備するbootstrap。
- guest draftを認証後workspaceへ二重生成なく移すclaim。
- 認証前に選んだsave/share/export操作への自動復帰。
- 手順書一覧。
- 手順書作成、編集、アーカイブ。
- 手順追加、並べ替え、削除。
- 操作イベントからローカル下書き生成。
- 認証後のprivate R2スクリーンショット保存。
- 入力値・Cookie・Authorization・秘密情報を保存しない境界。
- 必要なマスキング。
- 明示的に有効化した手順書のURL共有。
- 共有リンクの期限、パスコード、権限範囲、失効。
- Activation、TTFV、Capture Completion、Share、Second Manualを測定するProduct Event契約。
- P0/P1を防ぐための認可、tenant分離、拡張権限、guest claim、復旧手順。

## MVPでは利用者へ見せない内部概念

- workspace ID。
- owner/admin/editor/viewerというロール名称。
- R2容量。
- revision pointer。
- entitlement内部状態。
- claim intentやoperation ID。

個人利用者には、必要になるまで「自分の手順書」「保存」「共有」「メンバーを招待」のような利用者語彙を優先する。

## Validate Next

MVPのActivationと継続利用が確認できた後に優先評価する。

- Free / Pro課金の有効化。
- PDFの正式有料価値化。
- メンバー招待。
- Team向け権限管理。
- フォルダー、検索。
- 基本的な更新・古い情報の報告。

## Deferred

- Cloudflare Browser Run / Browser Session / Live Viewを使った製品capture。
- `debugger` / CDPによる完全device emulation。
- 4ロールを前面に出した高度なメンバー管理。
- タグ、お気に入り。
- iframe埋め込み。
- Markdown/HTMLを含む複数export形式の同時提供。
- Guide Me風の操作案内。
- 詳細な閲覧分析、離脱分析。
- コメント、通知。
- 高度な監査UI。
- 都度払い。
- 年額、追加席、追加容量、従量課金。
- AI拡張。

Deferredは「不要」の意味ではなく、価値検証より先に詳細化しないという意味とする。

## スマホ・タブレット表示の範囲

スマホ／タブレット向け手順書作成はMVP必須とする。

実現方式は、デスクトップChrome上で対象windowをresponsive viewportへ一時調整して記録する方式を第一とする。

- PC / smartphone / tabletを選択できる。
- smartphone / tabletではportrait / landscapeを選べる。
- window外形だけで決めず、ページ側 `innerWidth / innerHeight` を実測して目標viewportへ調整する。
- 記録終了・取消・失敗時に元window位置・サイズへ戻す。
- 実機iOS/Android、UA、DPR、touch、OS固有描画の完全再現はMVP対象外。

## Chrome拡張 Product Fit Gate

- 初期ICPが利用する主要Webサービスを代表サンプルとして互換性検証する。
- PC / smartphone / tablet表示で主要操作を記録できることを確認する。
- SPA、iframe、Shadow DOM、Canvas、複雑なWeb Components等での記録精度を確認する。
- 対象タブ以外を継続収集しないことを検証する。
- 広範なhost permissionや`debugger`を要求せず初回価値へ到達できることを確認する。
- Chrome Web Store配布または限定配布で、インストールからlocal draft完成までの離脱を確認する。

## Browser Runの位置づけ

Cloudflare Browser RunはMVPおよび現行Product Roadmapのcapture方式にしない。

将来、利用者ブラウザを使わないサーバー側自動処理に明確な価値がある場合だけ、費用対効果と安全契約を含む別ADRで再評価する。

## 初回公開の判断

- アカウント未作成で1本目のlocal draftを完成できる。
- output gateからセルフサーブ登録、Personal Workspace bootstrap、guest claim、元output完了まで説明なしで進める。
- PC / smartphone / tabletの3表示モードが実Chromeで動く。
- TTFVと主要Product Eventを測定できる。
- 代表的な実務Webサービス群でChrome拡張captureが再現可能に動く。
- guest状態でD1/R2へのcontent writeが0である。
- セキュリティP0/P1が0件。
- URL共有までの縦切りがE2Eで通る。
- 未完成のDeferred機能がMVP導線を塞がない。

## 明示的非対象

- Chrome以外の全ブラウザの同時対応。
- 実機モバイルChrome上での拡張実行。
- ネイティブアプリ記録。
- 実機iOS/Androidの完全device emulation。
- 初期状態での外部AI API呼び出し。
- Product KPI改善との関係が説明できない管理機能の先行実装。
