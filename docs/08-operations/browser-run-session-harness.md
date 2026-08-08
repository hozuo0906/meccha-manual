# Browser Run / Browser Sessionハーネス

Status: Accepted

## 目的

Cloudflare Browser Run + Live Viewを操作記録の核とし、起動、操作、スクリーンショット、終了を1つのDurable Objectが直列管理します。Chrome拡張は第一方式にしません。

## 責務分離

| 構成 | 責務 | 正本にしないもの |
|---|---|---|
| API Worker | 認証、workspace認可、URL一次検査、job受付 | Browser session状態、接続先IPの保証 |
| Capture Session Durable Object | 状態遷移、command直列化、期限、再接続、破棄 | 業務データの永続正本 |
| Browser Run | 対象ページ実行、Live View、スクリーンショット取得 | 認可、長期状態 |
| 検証済みegress境界 | DNS解決結果と実接続先の拘束、全通信種別の危険IP拒否 | workspace認可、セッション状態 |
| Supabase Postgres/RLS | session・event・asset metadata、監査 | Cookie、Live View URL、入力値 |
| Cloudflare R2 | 許可済みスクリーンショット本体 | 権限判断、入力値、共有token |

## 起動フロー

1. API WorkerがSupabase session、workspace所属、editor以上、同時実行上限を検証する。
2. 入力URLを正規化し、スキーム、host、port、資格情報、DNS結果を検査する。
3. Postgresへ期限付きjobを作成し、session IDに対応するDurable Objectへ開始commandを送る。
4. Durable Objectが `created -> starting` を直列遷移し、Browser Run sessionを1件だけ起動する。
5. navigation直前と全redirectでSSRF検査を再実行し、upstream socketのactual peerを危険IP検査して検査済みIPへ拘束した後にだけHTTP/TLS/application bytesを送信するegress経路を許可する。
6. ready後、認可済みsession ownerへ用途限定・短命のLive View URLを発行する。
7. Live View URL、Browser session credential、CookieをDB・R2・ログへ保存しない。

## SSRFと危険URL拒否

- `https` を既定許可し、`http` は明示した検証条件だけに限定する。
- `file:`, `data:`, `javascript:`, `blob:`, `ftp:`、URL内資格情報を拒否する。
- localhost、loopback、private、link-local、multicast、予約済みIP、cloud metadata endpointをIPv4/IPv6とも拒否する。
- DNSの全A/AAAA結果を検査する。ただし、事前解決と接続直前の再解決だけではDNS rebindingを防いだことにしない。
- 実接続は、検査済みIPへのDNS pinning、接続先IPを検証できるegress proxy、または同等にactual peerを照合できる境界を必須とする。検査後にBrowser Runが独自に再解決して直接接続する経路は禁止する。
- top-level navigation、redirect、iframe、画像・script・fetch等のsubresource、WebSocket、Service Worker、download、WebTransport/QUICを同じegress境界へ通す。WebRTCのICE/STUN/TURNを含め、同境界へ拘束できない直接通信APIはBrowser起動時のpolicyで無効化する。
- redirectごとに回数上限と同じ検査・接続拘束を適用し、許可URLから内部URLへの遷移を拒否する。
- workspace allowlist/blocklistや運営によるhostname承認は危険IP拒否を緩和できない。承認済みdestinationも同じ送信前peer検証と接続拘束を通す。
- Cloudflare Browser Runでactual peerの送信前確認または接続先拘束を実現できない通信種別が1つでもあれば、fail closed（安全側で全面拒否）とし、`capture.browserRun.egressVerified.enabled=false` のままBrowser Runの起動・navigateを拒否する。任意URLだけでなく承認済みhostnameも例外にしない。

## 実装前P0検証

- Cloudflare Browser Runが、navigation以外を含む全通信を検証済みegressへ固定できるかをstagingで確認する。
- 同じhostnameが検査時にpublic IP、接続時にprivate/link-local/metadata IPを返すDNS rebinding fixtureで、実接続前に拒否されることを確認する。
- redirect、iframe、subresource、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURNそれぞれでprivate IPへの迂回をnegative testする。
- HTTP/TLS/application bytesがpeer検証より前に1 byteも送信されないことをfixtureで確認する。
- actual peerを取得できない、または1種類でもegressを迂回できる場合は機能フラグをOFFのままにし、Browser Runの起動とnavigateを全面拒否する。
- 稼働後に迂回を発見してflagをfalseへ戻す場合は、egress kill switchで既存セッションの通信を即時遮断してから、Live View失効・再発行拒否、全Durable Objectへの終了command、Browser close再試行、監査ログ記録を行う。新規起動だけ止めて既存通信を残さない。

## 入力値と操作イベント

- 保存するのはevent種別、時刻、連番、マスキング済みselector、遷移先の安全なorigin/path情報です。
- text、password、カード、token、Cookie、Authorization、個人番号、URL query/fragmentの生値を保存しません。
- input/changeは「入力が完了した」という事実だけを記録し、値は常に破棄します。
- 監査ログ、例外、デバッグ出力にも同じ禁止規則を適用します。

## スクリーンショット

- 操作前後など必要最小限だけ取得し、PII/機密候補のマスキングを保存前に行います。
- 安全にマスキングできない場合はR2へ保存せず、手順編集画面へ「画像なし」の状態と再取得案内を残します。
- R2保存後はPostgresへasset metadataを記録し、workspace越境、削除済みasset、期限切れURLの参照を拒否します。
- Session Recordingは初期OFFで、スクリーンショットとは別の承認対象です。

## 終了・失敗・期限切れ

- 通常終了、取消、idle timeout、最大実行時間、起動失敗を明示状態で扱います。
- 終了時は未送信eventを期限内でflushし、Browser sessionをcloseし、Cookie、Storage、cache、一時ファイルを破棄します。
- close失敗は再試行jobと監査イベントを残し、Live View URLを再発行不能にします。
- Durable Objectは一時状態を保持できますが、完了後の正本はPostgresとし、Browser credentialを残しません。

## 監査ログ

`capture.requested`、`capture.started`、`live_view.issued`、`navigation.blocked`、`capture.completed`、`capture.failed`、`capture.expired`、`browser.close_failed` を記録します。workspace ID、session ID、actor ID、結果コード、時刻は記録できますが、入力値、対象URL query、Live View URL、Cookie、スクリーンショット本体は記録しません。

## 外部設定と承認

将来のbinding候補はBrowser Run `BROWSER_RUN`、Durable Object `CAPTURE_SESSION` です。環境別binding、Durable Object migration、利用上限、課金、監視を設定する操作は承認後に行います。現段階ではBrowser Runを起動せず、productionへ接続しません。

## 完了条件

- `browser-runtime.md`、ADR-0002/0003、API、security、R2 contractと責務が一致する。
- DNS検査と実接続先拘束を分け、全通信種別のSSRF、入力値非保存、Live View漏えい、session残留のnegative test項目を実装できる。
- 外部binding、Durable Object migration、Browser Run実起動を行っていない。
