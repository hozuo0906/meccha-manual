# ADR-0032: 価値体験後にアカウント作成を要求する

Status: Accepted

Date: 2026-09-12

## 決定

初回利用者へサイト訪問直後のアカウント作成を要求しない。

初回導線は次を正とする。

`LP -> Chrome拡張を導入 -> 表示モードを選ぶ -> 操作を記録 -> ローカル下書きを確認・編集 -> 保存/共有/PDF出力を選ぶ -> アカウント作成/ログイン -> Personal Workspaceを自動準備 -> ゲスト下書きをclaim -> 選んだ出力を続行`

アカウント作成は「製品を触るための入口」ではなく、「作った成果物を残す・共有するための境界」に置く。

## ゲスト状態

ゲスト状態はChrome拡張内のローカル状態とする。

- manual、step、screenshot、編集内容をサーバーへ永続化しない。
- D1 / R2へguest contentを作らない。
- ゲスト状態にworkspace、role、entitlementを作らない。
- 拡張内のランダムなlocal draft IDは認証情報として扱わない。
- 入力値、Cookie、Authorization等をローカルにも保存しない。

これにより、匿名ストレージ原価、匿名upload abuse、所有者不明データ、guest tenantのcleanup jobをMVPへ持ち込まない。

## アカウント作成を要求する操作

次のいずれかを利用者が明示的に選んだとき、初めてアカウント作成または既存アカウントへのログインを要求する。

- サーバーへ保存する。
- 共有リンクを発行する。
- PDF等のサーバー側outputを生成する。
- Teamへ引き継ぐ。

登録モーダルや認証画面を閉じた場合、ローカル下書きを失わず編集へ戻れるようにする。

## セルフサーブ認証

商用MVPでは、招待済み利用者だけでなく、本人確認済みの人間ユーザーが自分で利用開始できるセルフサーブ導線を提供する。

Cloudflare Accessを継続利用する場合も、Access到達許可とアプリ内identity/workspace provisioningを分離する。

- WorkerはAccess JWTの署名、issuer、audience、期限、actor typeを既存契約どおり検証する。
- application identityの正本は検証済み `issuer + subject` とする。
- email一致だけで既存identityを移動・復活・統合しない。
- disabled / retired identityをemailだけで自動復活させない。
- 初回セルフサーブbootstrapだけを、未知だが検証済みの人間Access主体からidentity/profile/Personal Workspace/owner membershipを作成できる明示routeとして分離する。
- bootstrapは `issuer + subject` 単位で冪等にし、並行実行でもworkspaceを二重作成しない。
- identity、profile、workspace、owner membership、必要なauditを単一のatomic operation/batchで確定する。
- 結果不明時は自動で別workspaceを作らず、同じbootstrap operationを照合する。

既存の招待制Team参加、停止member、role管理はこのセルフサーブPersonal bootstrapと混同しない。

## ゲスト下書きclaim

認証とPersonal Workspace provisioningが完了した後、ローカル下書きをサーバーへ移す。

- claim operation IDは推測困難で冪等にする。
- 同じguest draftからmanualを二重生成しない。
- upload途中で失敗した場合、ローカル原本を消さない。
- manual metadataとasset参照がサーバー側で確定した後だけclaim成功とする。
- claim成功後、利用者が押していた `保存 / 共有 / PDF出力` を再開する。
- shareの場合はADR-0008の期限・パスコード・権限範囲を維持する。

## 理由

初回登録は製品価値を理解する前の摩擦である。`めっちゃマニュアル` は、操作を記録して実際の手順書ができること自体が価値なので、先に1本作らせる方が登録理由を利用者が理解しやすい。

一方で、匿名のクラウド保存まで許可すると原価、abuse、所有権、削除、tenant境界が複雑になる。そのため「触るまではlocal-only、残す瞬間に認証」を境界とする。

## 計測

最低限、次のファネルを区別する。

- LPから拡張導入へ進んだ。
- 拡張導入後に記録を開始した。
- ローカル下書きを完成した。
- output gateを開いた。
- signupを開始した。
- signupを完了した。
- guest draft claimに成功した。
- outputを完了した。

ゲスト本文、対象URL、スクリーンショットをanalytics payloadへ入れない。

## Supersedes

- 「最初にログイン／招待を完了してからmanual作成を開始する」という初回UX前提。
- FR-001/FR-002の商用MVPにおける招待制・手動workspace選択をActivation前提にする部分。

## Preserves

- Access JWT検証、Worker認可、D1 tenant境界。
- Teamの招待／role安全契約。
- disabled identityの自動復活禁止。
- private R2、共有リンク失効、入力値非保存。

## 完了条件

- アカウントなしで1本目のローカル下書きを完成できる。
- output操作時だけ登録が要求される。
- 初回セルフサーブbootstrapがatomicかつ冪等である。
- 登録後にローカル下書きを失わずサーバーへclaimできる。
- 登録前にguest manual/screenshotがD1/R2へ保存されないnegative testがある。
- signupキャンセル、通信断、claim応答消失でもローカル原本を保持し、二重manualを作らない。
