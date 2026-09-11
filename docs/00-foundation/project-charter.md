# プロジェクト憲章

Status: Accepted

## 目的

日本人の業務担当者が、Webシステムの操作を一度実行するだけで、スクリーンショット付きの分かりやすい手順書を短時間で作成し、必要な相手へ共有できるサービスを作る。

`めっちゃマニュアル` は、最初から完成された管理SaaSを目指さない。まず個人が価値を体験し、その手順書が同僚へ共有され、必要になった段階でチーム利用へ広がるProduct-Led Growth型の導線を優先する。

## 最初のICP

初回商用検証では、対象を「日本人オフィスワーカー」全体へ広げず、次を第一候補とする。

- 月に3本以上、Webシステムの操作手順を作るバックオフィス、カスタマーサポート、業務運用、情シス担当。
- 同じ操作を複数人へ説明する機会がある。
- スクリーンショット取得、貼り付け、説明文作成に時間を使っている。
- PCだけでなくスマホ／タブレット向けレスポンシブ画面の手順を作ることがある。
- 完成した手順をURLで他者へ共有できる業務環境にいる。

ICPは仮説であり、内部alphaと初期ユーザー検証の結果で狭める・変更する。将来のTeam/Enterprise要件を理由にICPを広げない。

## Job To Be Done

主要な解決対象は次とする。

> 「また『これどうやるの？』と聞かれたとき、操作を一回見せるだけで、そのまま共有できる手順書を作りたい。」

## 解決する問題

初回MVPで優先する問題:

- マニュアル作成に時間がかかる。
- スクリーンショット、注釈、説明文が属人化する。
- 作った手順を相手へすぐ共有できない。
- PC/スマホ/タブレットで画面が変わるサイトの手順を別々に説明しづらい。
- 製品を試す前にアカウント登録を要求されると離脱しやすい。

後続で検証する問題:

- 更新された手順がPDFや社内チャットに散らばる。
- 手順が古くなったことに気づけない。
- 組織で権限、監査、利用量を管理したい。
- Guide Meや詳細分析を同じ製品で行いたい。

## 初回価値導線

初回はアカウント登録から始めない。

`LP -> Chrome拡張導入 -> PC/スマホ/タブレット表示を選ぶ -> guestで操作記録 -> local draft生成 -> 編集 -> 保存/共有/PDFを選ぶ -> signup -> Personal Workspace自動準備 -> guest claim -> output完了`

アカウント作成は製品を触るための入口ではなく、作った成果物を残す瞬間に要求する。

## Activation

Activationは単なるsignupではなく、利用者が最初の成果物をserver側に確定できた状態とする。

最低条件:

- guestでlocal draftを生成・確認している。
- output gateへ進んでいる。
- 必要な場合はsignup/bootstrap/claimを完了している。
- 最初のmanualが保存または共有可能な状態に確定している。

初回体験では、workspace、role、利用量、storage等の内部概念を価値体験より先に要求しない。

## 成功指標

### Product KPI

- Activation Rate: output gateへ到達した利用者のうち最初のmanualをserver側に確定できた割合。
- TTFV: `capture_started` から `first_manual_completed` までの時間を主指標とする。
- Capture Completion Rate: 操作記録開始からlocal draft生成まで完了した割合。
- Output Gate Conversion: local draft完成後に保存/共有/PDF等へ進んだ割合。
- Signup Conversion: output gateからsignupを完了した割合。
- Claim Completion Rate: signup後にguest draft claimを完了した割合。
- Share Rate: 最初のmanualを他者へ共有した割合。
- Second Manual Rate: 初回完成から7日以内に2本目を作成した割合。
- D7 Creator Retention: 7日後も作成行動へ戻った割合。
- Invite Rate: 個人利用からメンバー招待へ進んだ割合。
- Free to Paid Conversion: 無料利用から有料利用へ転換した割合。

初期North Star候補は「7日以内に2本目の手順書を作成したCreator数」とする。正式採用は初期検証データを見て決める。

Product Eventの名称・定義は `docs/05-api/product-events.md` を正本とする。

### 品質指標

- 利用者が説明なしで `guest capture -> local draft -> output signup -> claim -> 保存/共有` を完了できる。
- PC / smartphone / tabletの3表示モードで手順を作成できる。
- guest中にmanual本文・screenshotがD1/R2へ送信されない。
- 非公開情報が共有リンク、Storage、分析、ログから漏れない。
- P0/P1が0件の状態で対象マイルストーンを段階リリースできる。

品質指標の達成だけをPMFや商用成功とみなさない。

## Capture方針

MVPの操作記録方式はChrome拡張だけとする。

- 利用者自身のdesktop Chromeで普段の業務画面をそのまま操作して記録する。
- Manifest V3、`activeTab`、`scripting`を中心とする。
- MVPで`debugger`や常時`<all_urls>`を必須にしない。
- 利用者が明示的に記録開始した対象タブだけを記録する。
- password、カード番号、token、個人番号等の入力値を保存しない。
- Cookie、Authorization、password manager由来情報を取得しない。
- Cloudflare Browser Run / Browser Session / Live Viewへfallbackしない。

## スマホ・タブレット

スマホ／タブレット向けサイトの手順作成をMVP必須とする。

- desktop Chrome上でresponsive viewportを再現する。
- PC / smartphone / tabletを選択できる。
- smartphone / tabletはportrait / landscapeを選択できる。
- 記録終了・取消・失敗時は元window状態へ戻す。
- 実機iOS/Android、UA、DPR、touch、OS固有描画の完全再現はMVPで保証しない。

## Guest-first方針

アカウント未作成でも1本目をlocal-onlyで作成・編集できる。

- guest manual本文・screenshotを認証前にD1/R2へ送らない。
- output時にだけsignupを要求する。
- 検証済みAccess issuer+subjectからPersonal Workspaceをatomic・冪等に準備する。
- email一致だけでidentityを移動・復活させない。
- guest claim成功後に元outputへ自動復帰する。
- claim成功確認前にlocal原本を削除しない。

## 料金方針

初期商品構造はFree / Pro / Teamを第一候補とする。

- Chrome拡張capture時間を利用者向け課金軸にしない。
- Freeで最初の価値体験と共有まで可能にする。
- Proは継続運用価値、Teamは共同管理価値に課金する。
- `single_export`は現行MVPでDeferred。
- 課金機能はActivation・継続利用が確認されるまでOFFを維持する。

## 固定前提

- UIは日本語専用。
- セキュリティ境界はMVPでも省略しない。
- Chrome拡張だけをMVP操作記録方式とする。
- Cloudflare Access、Workers、D1、R2を認証後のサーバー基盤とする。
- 初期は外部AI APIを呼ばない。
- アプリ独自passwordを保持しない。
- production、課金、外部公開は既存の明示承認境界を維持する。

## 開発原則

- 現在の価値検証に必要な仕様だけを正本化する。
- 未検証の将来要件はDeferredとして扱い、実装前に詳細設計を固定しすぎない。
- 技術レイヤー単位ではなく、利用者が完遂できる縦切りを優先する。
- Product最優先は `guest -> extension -> 3 views -> local draft -> output signup -> claim -> output` とする。
- 新しい管理機能を追加する前に、Product KPIのどれを改善するかを明示する。
- セキュリティ、プライバシー、データ損失防止は簡素化の対象外とする。

## 非目標

- Cloudflare Browser RunをMVP captureへ戻すこと。
- Chrome以外の全ブラウザを初回MVPで同時サポートすること。
- 実機モバイルChrome上でChrome拡張を動かすこと。
- ネイティブアプリ操作の記録。
- 実機iOS/Androidの完全device emulation。
- 初回MVPでの高度なTeam/Enterprise管理機能の完成。
- 初回MVPでのGuide Me、詳細分析、コメント、複数export形式、AI機能の完成。
- Tango等のコード、文言、ロゴ、画像資産のコピー。
