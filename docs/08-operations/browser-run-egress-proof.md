# Browser Run egress P0実証

Status: Proposed

## 結論

Cloudflare Browser Runのsession作成APIは、`guardrails.allowedDomains`と`allowedDomainSets`でoutbound HTTP/Sを制限できる。ただし、公式契約だけではDNS rebinding後のactual peer、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURNまで送信前に拘束できると判断しない。

そのため、製品WorkerのBrowser bindingは追加せず、`capture.browserRun.egressVerified.enabled=false`を維持する。隔離stagingの外部fixtureで本書の全経路に合格した場合だけ、後続ADRで有効化を判断する。

## 公式仕様として確認した範囲

- `POST /accounts/{account_id}/browser-rendering/devtools/browser`はguardrails付きsessionを作成できる。
- `allowedDomains`は最大50件のhostname pattern、`allowedDomainSets`は最大4件のpresetまたはHTTPSリストを受ける。
- API説明が保証する制限対象はoutbound HTTP/Sである。
- sessionはDELETE APIで明示closeできる。

参照:

- https://developers.cloudflare.com/api/resources/browser_rendering/subresources/devtools/subresources/browser/methods/create
- https://developers.cloudflare.com/api/resources/browser_rendering/subresources/devtools/subresources/browser/methods/delete

## 外部fixture契約

fixtureと受信sinkはproduction・実顧客サイトから分離し、合成probe ID以外を受け取らない。fixtureは次の全経路を1回ずつ試行する。

1. navigation
2. redirect
3. iframe
4. image/script等のsubresource
5. fetch
6. WebSocket
7. Service Worker
8. download
9. WebTransport/QUIC
10. WebRTC ICE/STUN/TURN

DNS rebinding fixtureは検査時public、接続時private/link-local/metadata相当へ変化させる。受信sinkは各経路について、application bytes受信数とactual peer送信前検証の証跡を集約し、要求された現在のprobe IDを応答相関値として返す。runnerは生成したprobe IDとの完全一致を検証してから合否を評価し、不一致・欠落・cache応答を拒否する。URL、header、body、Cookie、token、Live View URLは保存・返却しない。probe IDも照合後の保存artifactから除外する。

## 合格条件

- 全10経路が重複なく1件ずつ存在し、未知の経路がなく、`blocked_before_bytes`か`disabled_before_attempt`である。
- `blocked_before_bytes`はapplication bytesが0で、actual peer検証が送信前に完了した証跡を持つ。
- `disabled_before_attempt`は、試行コードが呼ばれなかったという自己申告ではなく、経路を無効化した構成をfixture外部から検証した証跡とapplication bytes 0件を持つ。
- 経路欠落、timeout、fixture障害、証跡不明、cleanup失敗はすべて不合格とする。
- 不合格時はBrowser Run起動・navigateを引き続き`BROWSER_EGRESS_NOT_VERIFIED`で拒否する。
- 合格時はURL、header、token、probe IDを含めず、経路別decision、application bytes数、actual-peer／無効化検証結果だけをcommit SHA、Actions run ID、run attemptへ固定したartifactとして90日保存する。

## 実行境界

`Browser Run Egress Proof` workflowを`RUN_ISOLATED_STAGING_P0`で手動実行する。GitHub `staging` Environmentに専用tokenとfixture URLが揃わない場合はlive jobを実行しない。fixtureと証跡endpointは同一HTTPS originに限定し、fixture tokenを別originへ送らない。PRでは契約テストだけを実行し、Browser Runを起動しない。

live実行はCloudflare v4 APIのsuccess envelopeを検証して`result`だけを利用し、sessionを60秒keep-aliveで作成する。session作成POST／body読取、CDP接続確立、接続後context／page作成、証跡fetch／body読取は各10秒の境界を持ち、HTTP境界は期限到達時にabortする。navigation／probe完了待ちはPlaywright timeoutを使う。成功・失敗にかかわらずDELETEを呼び、`closed`または`closing`の応答を確認する。local browser closeは5秒、remote DELETEは10秒で打ち切り、後者も期限到達時にfetchをabortする。CDP接続・setup・navigation・証跡取得失敗は固定文言へ変換し、session ID、WebSocket URL、fixture URL、probe ID、tokenはログへ出さない。
