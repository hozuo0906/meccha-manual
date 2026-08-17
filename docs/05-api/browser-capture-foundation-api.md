# Browser Run操作記録基盤API

Status: Accepted

## 現在の安全境界

OQ-006／DEC-032のP0 egress検証が完了していないため、次の`POST`は認証、same-origin、workspaceのowner／admin／editor権限を確認した後、Cloudflare Browser Runへ通信せず`503 BROWSER_EGRESS_NOT_VERIFIED`を返す。

- `/api/workspaces/{workspaceId}/capture-sessions`
- `/v1/workspaces/{workspaceId}/capture-sessions`
- `/api/workspaces/{workspaceId}/capture-sessions/{sessionId}/live-url`
- `/v1/workspaces/{workspaceId}/capture-sessions/{sessionId}/live-url`
- `/api/workspaces/{workspaceId}/capture-sessions/{sessionId}/commands`
- `/v1/workspaces/{workspaceId}/capture-sessions/{sessionId}/commands`
- `/api/workspaces/{workspaceId}/mobile-preview-sessions`
- `/v1/workspaces/{workspaceId}/mobile-preview-sessions`

allowlist、承認済みhostname、mobile previewは例外にしない。現在のWorker型と設定にはBrowser Run bindingを追加せず、`capture.browserRun.egressVerified.enabled`を環境変数だけでtrueにできる経路も作らない。

## 保存可能な操作イベント

repo-sideの正規化境界が受理するeventは`click`、`input_complete`、`navigation`、`scroll`だけとし、1 batch 200件まで、正の一意な`sequence`で決定的に整列する。

- 共通: `sequence`、`type`、`occurredAt`
- click: 最大128文字の`targetText`
- input completion: 入力値由来でないことを証明できないため、`targetText`は常に`入力欄`へ置換
- navigation: HTTP／HTTPSのoriginとpathだけ。query、fragment、URL資格情報は保存しない
- scroll: `up`または`down`のsummaryだけ

未知field、入力値、password、カード番号、token、Cookie、Authorization、座標の生値は出力eventへ複製しない。機密候補を含むtarget labelは`入力欄`へ置換する。

## 決定的draft生成

正規化eventは外部AI APIを使わず、日本語のmanual step候補へ変換する。

- click: `{target}をクリックします。`
- input completion: `{target}への入力を完了します。入力値は手順書に保存されません。`
- navigation: query／fragmentを除いたlocationへ移動
- 連続する同方向scroll: 1件のnoteへ集約

このPRではDB保存、Browser session、Live View、Durable Object、R2を実装しない。将来の永続化はworkspace RLS、manual→revision lock、archive version、job期限・取消・再試行・監査を同じ縦切りで実装する。
