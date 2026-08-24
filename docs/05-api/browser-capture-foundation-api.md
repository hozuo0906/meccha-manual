# Browser Run操作記録基盤API

Status: Accepted

## 現在の安全境界

OQ-006／DEC-032のP0 egress検証が完了していないため、Browser Run **start**だけが次の予約state machineを通る。start routeでは認証、same-origin、workspaceのowner／admin／editor権限、tenant entitlement、request envelopeを確認した後、同じ`resourceType=browser_run`の`operationKey`に紐づく既存reservationを先にfingerprint/state照合する。同じkey・同じfingerprintのterminal retryは`200`、in-flightまたは`result_unknown` retryは`202 RESERVATION_RESULT_UNKNOWN`で同じreservation stateを返し、Cloudflare Browser Runへ通信しない。異なるfingerprintは`409 RESERVATION_REQUEST_MISMATCH`で拒否する。既存reservationに該当しない新しい開始だけはCloudflare Browser Runへ通信せず`503 BROWSER_EGRESS_NOT_VERIFIED`を返す。

### Browser Run start route

- `/api/workspaces/{workspaceId}/capture-sessions`
- `/v1/workspaces/{workspaceId}/capture-sessions`
- `/api/workspaces/{workspaceId}/mobile-preview-sessions`
- `/v1/workspaces/{workspaceId}/mobile-preview-sessions`

captureとmobile previewはどちらも`resourceType=browser_run`として扱う。予約のcanonical identityは`workspaceId + resourceType + opaque operationKey`であり、route kindは一意性の列にしない。capture-startのkeyをmobile previewへ流用せず、`requestFingerprint`はoperation keyを除くimmutableな要求比較値として保存する。同じkeyでfingerprintが一致すれば既存stateを返し、相違は409で拒否する。capture sessionまたはmobile preview sessionを指す`resourceRef`はopaqueなrepo-side参照とし、URL、secret、Cookie、Authorization、provider payloadを含めない。

### start reservationから除外するroute

- `/api/workspaces/{workspaceId}/capture-sessions/{sessionId}/live-url`および`/v1/.../live-url`
- `/api/workspaces/{workspaceId}/capture-sessions/{sessionId}/commands`および`/v1/.../commands`
- mobile previewのnavigate/reload route

live-url、capture commands、mobile preview navigate/reloadはBrowser Run start reservation state machineの対象外であり、start用の`operationKey` lookup、reservation作成、provider startを行わない。これらは既存の認証・tenant・egress/P0 fail-closed境界を維持し、URI、method、request、正常2xx shapeを定義する別契約がAcceptedになるまで外部providerへ通信しない。

allowlist、承認済みhostname、mobile preview startは例外にしない。現在のWorker型と設定にはBrowser Run bindingを追加せず、`capture.browserRun.egressVerified.enabled`を環境変数だけでtrueにできる経路も作らない。

## 保存可能な操作イベント

repo-sideの正規化境界が受理するeventは`click`、`input_complete`、`navigation`、`scroll`だけとし、1 batch 200件まで、正の一意な`sequence`で決定的に整列する。

- 共通: `sequence`、`type`、実在するUTC日時を表すISO 8601 `occurredAt`。sub-millisecond精度はmillisecondへ切り詰めて正規化
- click: 表示中の秘密値由来でないことを証明できないため、`targetText`は常に`対象`へ置換
- input completion: 入力値由来でないことを証明できないため、`targetText`は常に`入力欄`へ置換
- navigation: pathを含むURLに秘密値が埋め込まれ得るため、URLは保存しない
- scroll: `up`または`down`のsummaryだけ

未知field、入力値、password、カード番号、token、Cookie、Authorization、座標の生値は出力eventへ複製しない。機密候補を含むtarget labelは`入力欄`へ置換する。

## 決定的draft生成

正規化eventは外部AI APIを使わず、日本語のmanual step候補へ変換する。

- click: `{target}をクリックします。`
- input completion: `{target}への入力を完了します。入力値は手順書に保存されません。`
- navigation: URLを含まない「次のページへ移動」の汎用step
- 連続する同方向scroll: 1件のnoteへ集約

このPRではDB保存、Browser session、Live View、Durable Object、R2を実装しない。将来の永続化はworkspace RLS、manual→revision lock、archive version、job期限・取消・再試行・監査を同じ縦切りで実装する。
