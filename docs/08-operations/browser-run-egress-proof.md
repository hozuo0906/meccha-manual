# Browser Run egress P0実証

Status: Proposed

## 結論

Cloudflare Browser Runのsession作成APIは、`guardrails.allowedDomains`と`allowedDomainSets`でoutbound HTTP/Sを制限できる。ただし、公式契約だけではDNS rebinding後のactual peer、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURNまで送信前に拘束できると判断しない。

そのため、製品WorkerのBrowser bindingは追加せず、`capture.browserRun.egressVerified.enabled=false`を維持する。隔離stagingの外部fixtureで本書の全経路に合格した場合だけ、後続ADRで有効化を判断する。

## 公式仕様として確認した範囲

確認日: 2026-08-23

- `POST /accounts/{account_id}/browser-rendering/devtools/browser`はguardrails付きsessionを作成できる。
- `allowedDomains`は最大50件のhostname pattern、`allowedDomainSets`は最大4件のpresetまたはHTTPSリストを受ける。
- API説明が保証する制限対象はoutbound HTTP/Sである。
- sessionはDELETE APIで明示closeできる。
- Browser Runの`keep_alive`はidle timeoutである。session作成API referenceは10,000〜1,200,000ms、Limitsは最大10分と記載が一致しないが、後者はactiveなsessionにprovider固定の最大寿命がないことを明記している。

参照:

- https://developers.cloudflare.com/api/resources/browser_rendering/subresources/devtools/subresources/browser/methods/create
- https://developers.cloudflare.com/api/resources/browser_rendering/subresources/devtools/subresources/browser/methods/delete
- https://developers.cloudflare.com/browser-run/limits/
- https://developers.cloudflare.com/browser-run/reference/browser-close-reasons/

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

`Browser Run Egress Proof` workflowを`RUN_ISOLATED_STAGING_P0`と検証対象mainの40文字commit SHAで手動実行する。preflightは`workflow_dispatch`、`refs/heads/main`、実行SHAと入力SHAの完全一致、初回run attempt、repo-level readiness markerの完全一致だけを受理する。preflightに合格するまで`staging` Environmentを要求せず、live runnerもCloudflare資格情報を読む前に同じ条件を再検証する。再実行では外部通信せず、新しいworkflow dispatchと新しい証跡を要求する。

GitHub `staging` Environmentに専用tokenとfixture URLが揃わない場合はlive jobを実行しない。GitHubはworkflowが存在しないEnvironmentを参照した場合に保護ルールやsecretのないEnvironmentを自動作成し得るため、管理者が次の構成を完了するまではdispatchしない。

| 種別 | 名前／設定 | 必須条件 |
|---|---|---|
| Environment | `staging` | deployment branch/tagを`main`だけに限定し、利用可能ならrequired reviewerとadmin bypass禁止を設定する |
| repository variable | `MECCHA_MANUAL_BROWSER_EGRESS_STAGING_READY=v1` | 本表のEnvironment保護・専用値・fixture labを管理者が確認した最後に作る。organization／Environment levelには同名を作らない |
| Environment secret | `MECCHA_MANUAL_BROWSER_EGRESS_STAGING_ACCOUNT_ID` | 隔離検証用Cloudflare accountだけを参照する |
| Environment secret | `MECCHA_MANUAL_BROWSER_EGRESS_STAGING_API_TOKEN` | account-scopedの専用token、`Browser Rendering Write`だけを付与する |
| Environment secret | `MECCHA_MANUAL_BROWSER_EGRESS_STAGING_FIXTURE_TOKEN` | 合成probeの証跡取得だけに使い、ログやartifactへ出さない |
| Environment variable | `MECCHA_MANUAL_BROWSER_EGRESS_STAGING_FIXTURE_ORIGIN` | production・実顧客から分離したfixtureのcredential-free HTTPS origin |
| Environment variable | `MECCHA_MANUAL_BROWSER_EGRESS_STAGING_EVIDENCE_URL` | fixtureと同一originの証跡endpoint |

readiness markerはEnvironment-levelに置かない。Environment-level variableはjob開始後まで利用できず、不存在Environmentを要求する前の`if`を閉じられないためである。GitHubは同名secretがorganization／repository／Environmentにある場合に最下位levelを優先するため、Environment側の専用secretが欠けると同名のrepository／organization secretが参照され得る。共通deploy資格情報へのfallbackを避けるため、本workflowは用途固有名だけを参照する。管理者は本表のEnvironment secret／variableと同名の値をrepository／organization levelへ作らず、Environment設定変更前にmarkerを削除し、再確認後だけ`v1`を復元する。

fixtureと証跡endpointは同一HTTPS originに限定し、fixture tokenを別originへ送らない。HTTP requestを数えるだけのWorker fixtureは、DNS rebinding後のactual peerをapplication bytes送信前に独立検証できず、WebTransport/QUICとWebRTC ICE/STUN/TURNのraw transport証跡も満たさない。したがって、権威DNS／再束縛制御と接続層の受信観測、または同等の独立検証境界を持つ非production labを別途用意する。PRでは契約テストだけを実行し、Browser Runを起動しない。

GitHub Environmentの設定仕様:

- https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments
- https://docs.github.com/en/actions/security-guides/using-secrets-in-github-actions
- https://docs.github.com/en/actions/reference/security/secrets
- https://docs.github.com/en/actions/reference/workflows-and-actions/variables

live実行はCloudflare v4 APIのsuccess envelopeを検証して`result`だけを利用し、sessionを60秒keep-aliveで作成する。session作成POST／body読取、CDP接続確立、接続後context／page作成、証跡fetch／body読取は各10秒の境界を持ち、HTTP境界は期限到達時にabortする。navigation／probe完了待ちはPlaywright timeoutを使う。成功・失敗にかかわらずDELETEを呼び、`closed`または`closing`の応答を確認する。local browser closeは5秒、remote DELETEは10秒で打ち切り、後者も期限到達時にfetchをabortする。CDP接続・setup・navigation・証跡取得失敗は固定文言へ変換し、session ID、WebSocket URL、fixture URL、probe ID、tokenはログへ出さない。

## AC-064との独立性

AC-064のhard expiryは#86のegress実証とは別のsession lifecycle要件である。Cloudflare公式契約にはactiveなBrowser Run sessionのprovider固定最大寿命がなく、`keep_alive`はidle timeoutに過ぎない。上限値もsession作成API referenceの20分とLimitsの10分で一致しないため、provider設定だけでAC-064を満たしたとは扱わない。

Durable Object alarmはat-least-onceで実行され、失敗時は2秒からの指数backoffで最大6回retryされる。これは終了処理の起動・再試行には使えるが、Browser Run側の固定最大寿命にはならない。将来の製品実装ではDurable Object側の絶対deadline、alarm／command時の再検証、期限到達時のegress短命credential／kill switch・Live View失効・remote DELETE再試行を組み合わせ、外部停止失敗も監査してfail closedにする。期限後のapplication bytesが0であるstaging negative proofを別途要求し、#86合格だけでこの要件を完了扱いにしない。

参照:

- https://developers.cloudflare.com/durable-objects/api/alarms/
- https://developers.cloudflare.com/browser-run/cdp/session-management/
