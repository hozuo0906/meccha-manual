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

- 共通: `sequence`、`type`、実在するUTC日時を表すISO 8601 `occurredAt`。sub-millisecond精度はmillisecondへ切り詰めて正規化
- click: 表示中の秘密値由来でないことを証明できないため、`targetText`は常に`対象`へ置換
- input completion: 入力値由来でないことを証明できないため、`targetText`は常に`入力欄`へ置換
- navigation: pathを含むURLに秘密値が埋め込まれ得るため、URLは保存しない
- scroll: `up`または`down`のsummaryだけ

未知field、入力値、password、カード番号、token、Cookie、Authorization、座標の生値は出力eventへ複製しない。機密候補を含むtarget labelは`入力欄`へ置換する。

## スクリーンショット個人情報境界

スクリーンショット直前のDOM個人情報候補は、表示viewportと交差する高信頼な候補だけを固定ダミーoverlayへ置換する。1回のcaptureで生成するoverlayは最大64件とし、65件目の候補を検出した場合は画像を保存せずfail closedにする。初期・再検証の候補集合、shadow root snapshot、属性変更時のcomposed-tree候補確認を含む各DOM走査は、light DOM・open shadow root・extensionが検査できるprivileged shadow rootをまたいで最大4096 DOM nodeの単一予算で数え、rootごとにリセットしない。上限を超えて走査が完了しない場合も画像を保存しない。extension自身が作成したoverlay要素はこの候補走査からidentityで除外し、ページが同じclass名を付けた要素は除外しない。これにより、PII候補を含まない64件超の子nodeに対する無関係な属性変更を許容しつつ、候補数超過と走査不完了を成功扱いにしない。

paint後のcapture前およびcapture後に候補集合、overlayの接続・幾何・不透明性、document identityを検証する。追加・除去・文字列・属性変更で個人情報が一時的に出現した場合、変更後に値が消えていても検証を失敗させる。元DOM、候補文字列、入力値はevent、ログ、handoff metadata、D1/R2へ保存しない。対象外の文字は利用者が編集画面で手動黒塗りする。

## 決定的draft生成

正規化eventは外部AI APIを使わず、日本語のmanual step候補へ変換する。

- click: `{target}をクリックします。`
- input completion: `{target}への入力を完了します。入力値は手順書に保存されません。`
- navigation: URLを含まない「次のページへ移動」の汎用step
- 連続する同方向scroll: 1件のnoteへ集約

このPRではDB保存、Browser session、Live View、Durable Object、R2を実装しない。将来の永続化は検証済みAccess identity、active D1 membership/role、workspace固定query/constraint、manual→revision lock、archive version、job期限・取消・再試行・監査を同じ縦切りで実装する。

### Access mode migration boundary

Access modeでは移行前Supabase認証へfallbackせず、WorkerのAccess境界で同じ `503 BROWSER_EGRESS_NOT_VERIFIED` と副作用0を返す。

### Access mode authorization ordering (2026-09-08)

Access modeでもcapture/mobile-previewの要求は、Browser Run egress gateより前にAccess JWT、D1 identity、same-origin、workspace roleを確認する。Access/D1で認証・認可済みのowner/admin/editorだけが`503 BROWSER_EGRESS_NOT_VERIFIED`へ到達し、未認証やviewerは認証・認可エラーで終了する。legacy Supabase sessionへfallbackしない。
