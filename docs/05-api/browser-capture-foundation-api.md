# Browser Run操作記録基盤API

Status: Accepted

## 現在の安全境界

OQ-006／DEC-032のP0 egress検証が完了していないため、全routeで認証、same-origin、workspaceのowner／admin／editor権限、tenant entitlement、request envelopeを確認する。capture-session createだけはcapture-startの`operationKey`で既存reservationをfingerprint/state照合し、同じkey・同じfingerprintのterminal retryは`200`、in-flightまたは`result_unknown` retryは`202 RESERVATION_RESULT_UNKNOWN`、異なるfingerprintは`409 RESERVATION_REQUEST_MISMATCH`で同じreservation stateを返す。mobile preview session createはcapture-startとは別の`mobilePreviewOperationKey`とroute固有reservationを使い、同じterminal/in-flight/`result_unknown`/fingerprint mismatch mappingを適用する。いずれも新規処理では時間・同時実行数のreservationをatomicに確定し、egress/P0 gateを通過してからproviderへdispatchする。live-url、commandsはcapture-startの`operationKey` lookupを行わず、mobile preview navigate/reloadは別契約がAcceptedになるまで未実装・fail closedとする。各create routeの新規処理はproviderへ通信する前に`503 BROWSER_EGRESS_NOT_VERIFIED`で拒否し、既存retryのstate mappingだけは同じreservationを返す。

- `/api/workspaces/{workspaceId}/capture-sessions`
- `/v1/workspaces/{workspaceId}/capture-sessions`
- `/api/workspaces/{workspaceId}/capture-sessions/{sessionId}/live-url`
- `/v1/workspaces/{workspaceId}/capture-sessions/{sessionId}/live-url`
- `/api/workspaces/{workspaceId}/capture-sessions/{sessionId}/commands`
- `/v1/workspaces/{workspaceId}/capture-sessions/{sessionId}/commands`
- `/api/workspaces/{workspaceId}/mobile-preview-sessions`
- `/v1/workspaces/{workspaceId}/mobile-preview-sessions`

allowlist、承認済みhostname、mobile previewは例外にしない。現在のWorker型と設定にはBrowser Run bindingを追加せず、`capture.browserRun.egressVerified.enabled`を環境変数だけでtrueにできる経路も作らない。

## Route別state boundary

| route | same-key reservation lookup | egress / provider boundary | quota・capacity | disabled mapping |
|---|---|---|---|---|
| capture-session create | あり。terminal=200、in-flight/`result_unknown`=202、fingerprint mismatch=409 | 既存retryは再評価せず、新規reservation確定後にgateを通過したときだけproviderへ通信 | 新規operationだけcandidateを計算 | 新規で`503 BROWSER_EGRESS_NOT_VERIFIED`、reservation/provider dispatchなし |
| capture live-url issuance | なし。session ownerと対象sessionを認可 | provider通信前に常時egress/P0 gate | reservation candidateなし | `503 BROWSER_EGRESS_NOT_VERIFIED`、capture-start retry mappingなし |
| capture commands（navigate/reload等） | なし。session ownerと対象sessionを認可 | provider通信前に常時egress/P0 gate | reservation candidateなし | `503 BROWSER_EGRESS_NOT_VERIFIED`、capture-start retry mappingなし |
| mobile preview session create | あり。editor以上とworkspace/tenantを認可。capture-startとは別の`mobilePreviewOperationKey`でterminal=200、in-flight/`result_unknown`=202、fingerprint mismatch=409 | route固有reservationをatomicに確定し、provider通信前に常時egress/P0 gate | mobile-preview専用のrequested duration・同時実行数をatomicにcandidate計算 | 新規operationはreservationまたはgate未完了なら`503 BROWSER_EGRESS_NOT_VERIFIED`、provider dispatchなし |

enabled時のlive-url、commands、mobile previewの正常2xx shapeは各routeの既存契約に委ね、この文書で新しいprovider operationやstatus codeを追加しない。mobile preview navigate/reloadのURI、method、request/2xx shapeは別契約がAcceptedになるまで未実装・fail closedとし、推測でproviderへ通信する経路を作らない。

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
