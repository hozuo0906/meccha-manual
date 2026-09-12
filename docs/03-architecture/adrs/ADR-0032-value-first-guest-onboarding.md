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

認証を中断した場合、ローカル下書きを失わず編集へ戻れるようにする。

## 商用MVPのCloudflare Access policy

商用MVPのproduction一般利用者向けAccess applicationは、One-time PINをlogin methodとして使い、有効なメールアドレスを持つ人間利用者がAccess認証まではセルフサーブで到達できるpolicyを意図的に採用する。

Cloudflare Access上で「One-time PINを利用できる全メール」をAllowする設定は一般的な社内アプリでは過剰に広い。そのため本サービスでは次を同時に必須とする。

- Access到達を業務認可とみなさない。
- 未登録の検証済みhuman actorは `POST /api/onboarding/bootstrap` 以外の業務APIを403で拒否する。
- bootstrap成功後もactive identityとactive workspace membershipをWorker/D1で毎回確認する。
- email一致だけでapplication identityを移動、統合、復活させない。
- disabled / retired identityを自動復活させない。
- service tokenをセルフサーブ登録へ使わない。
- bootstrap endpointへserver-side rate limitと監視を適用する。
- guest contentをbootstrap requestへ含めないため、未登録主体が匿名R2/D1 contentを量産できないようにする。
- 1つの検証済みissuer+subjectに対して初期Personal Workspaceは1つだけとする。

環境を分離する。

- development/staging: 明示Emails/Groups allowlistを維持し、一般セルフサーブを有効化しない。
- production商用MVP: 一般利用者向けself-hosted applicationだけself-service OTP到達を許可する。
- stagingとproductionでAccess application、policy、audience、Worker、D1、R2を共有しない。
- production policy変更は既存のproduction明示承認境界に従う。

## セルフサーブbootstrap

Cloudflare Access到達許可とアプリ内identity/workspace provisioningを分離する。

- WorkerはAccess JWTの署名、issuer、audience、期限、actor typeを既存契約どおり検証する。
- application identityの正本は検証済み `issuer + subject` とする。
- 初回セルフサーブbootstrapだけを、未知だが検証済みのhuman Access主体からidentity/profile/Personal Workspace/owner membershipを作成できる明示routeとして分離する。
- bootstrapは `issuer + subject` 単位で冪等にし、並行実行でもworkspaceを二重作成しない。
- identity、profile、workspace、owner membership、必要なauditを単一のatomic operation/batchで確定する。
- 結果不明時は自動で別workspaceを作らず、同じbootstrap operationを照合する。

既存の招待制Team参加、停止member、role管理はこのセルフサーブPersonal bootstrapと混同しない。

## Chrome拡張から認証済みWebアプリへのhandoff

Access JWT、Access cookie、OTPその他のcredentialをChrome拡張へ渡さない。

ゲスト下書きの引き継ぎは、認証済みWebアプリをcredential-bearing bridgeとして使う。

1. 利用者がoutput gateを開くと、拡張は256 bit相当の推測困難な `handoffId` を生成し、guest draft、選択済みoutput、期限とともにローカルへ保存する。
2. 拡張は自社アプリの `/onboarding/continue#handoff=<handoffId>` を通常タブで開く。`handoffId` はURL fragmentに置き、HTTP request、Access log、server logへ送らない。
3. 未認証ならCloudflare AccessがOTP認証を行う。認証後もAccess JWTをページJavaScriptや拡張へ複製しない。
4. アプリページはManifest V3の `externally_connectable.matches` に列挙した自社アプリoriginから、対象拡張IDへ `chrome.runtime.sendMessage` または `chrome.runtime.connect` を使って `handoffId` を提示する。
5. 拡張は `runtime.onMessageExternal` / `runtime.onConnectExternal` で受け、`sender.url` のoriginがmanifestで許可した自社originと一致すること、`handoffId` がローカルに存在し未期限切れ・未完了であることを検証する。
6. 検証後、Webアプリが要求したguest draftデータを bounded / chunked messageで返す。拡張からWebページへ勝手にpushせず、Webページ起点のrequest/connectionへのresponseとして渡す。
7. Webアプリは受け取ったpayloadを同一originの `/api/onboarding/*` へPOSTする。Access cookie/JWTはCloudflare Access管理の通常ブラウザrequestで処理され、拡張はcredentialを受け取らない。
8. claim成功responseをWebアプリが受け取った後、同じ外部message channelで `handoff.completed` を通知する。拡張はorigin + handoffIdを再検証してからlocal guest原本を削除する。

### externally_connectableの制約

- `matches` はproduction/stagingで承認済みの自社アプリoriginだけを列挙する。
- `<all_urls>`、任意domain、wildcard TLDを使わない。
- extension IDは配布環境ごとに正本化する。
- 外部messageのtype、payload schema、最大byte数をallowlistする。
- 未知message type、未知origin、期限切れhandoff、handoffId不一致を副作用0で拒否する。
- app pageから取得したguest payloadをDOM、localStorage、URL、analyticsへ複製しない。

この方式により、通常write APIのsame-origin契約と「Access credentialを拡張へ渡さない」契約を同時に維持する。

## ゲスト下書きclaim

認証とPersonal Workspace provisioningが完了した後、ローカル下書きをサーバーへ移す。

- claim operation IDは推測困難で冪等にする。
- 同じguest draftからmanualを二重生成しない。
- upload途中で失敗した場合、ローカル原本を消さない。
- manual metadataとasset参照がサーバー側で確定した後だけclaim成功とする。
- claim成功後、利用者が押していた `保存 / 共有 / PDF出力` を再開する。
- shareの場合はADR-0008の期限・パスコード・権限範囲を維持する。

完了済みclaimの再送を特別扱いする。

- 同一actor + 同一claim intent + 同一operationId + 同一request fingerprintで既に`completed`なら、intentが消費済みでも保存済みの同じmanualIdと成功結果を返す。
- 同じintentを別operationIdまたは別fingerprintで再利用する要求は409で拒否する。
- 未完了で期限切れのintentは410とし、新しいintentを作り直せる。

## 理由

初回登録は製品価値を理解する前の摩擦である。操作を記録して実際の手順書ができること自体が価値なので、先に1本作らせる方が登録理由を利用者が理解しやすい。

一方で匿名クラウド保存まで許可すると原価、abuse、所有権、削除、tenant境界が複雑になる。そのため「触るまではlocal-only、残す瞬間に認証」を境界とする。

## 計測

イベント名称・payloadは `docs/05-api/product-events.md` を唯一の正本とする。guest manual本文、対象URL、スクリーンショットをanalytics payloadへ入れない。

## Supersedes

- 「最初にログイン／招待を完了してからmanual作成を開始する」という初回UX前提。
- FR-001/FR-002の商用MVPにおける招待制・手動workspace選択をActivation前提にする部分。
- ADR-0028の「初期ログイン方式を招待制だけに限定する」部分と、「未知human identityのbootstrapを常時無効にする」部分。Access JWT検証、issuer+subject正本、tenant deny-by-default等の安全原則は維持する。

## Preserves

- Access JWT検証、Worker認可、D1 tenant境界。
- 通常write APIのsame-origin境界。
- Access credentialをbrowser JavaScriptやChrome拡張へ複製しない境界。
- Teamの招待／role安全契約。
- disabled identityの自動復活禁止。
- private R2、共有リンク失効、入力値非保存。

## 完了条件

- アカウントなしで1本目のローカル下書きを完成できる。
- output操作時だけ登録が要求される。
- productionセルフサーブAccess policyとstaging allowlist policyが分離される。
- 初回セルフサーブbootstrapがatomicかつ冪等である。
- Access credentialを拡張へ渡さず、allowlist済み自社Web originからguest draftをhandoffできる。
- 登録後にローカル下書きを失わずサーバーへclaimできる。
- completed claimの同一再送が同じmanual結果を返す。
- 登録前にguest manual/screenshotがD1/R2へ保存されないnegative testがある。
- signupキャンセル、通信断、claim応答消失でもローカル原本を保持し、二重manualを作らない。
