# Browser Run / Browser Sessionハーネス

Status: Accepted

## 目的

Cloudflare Browser Run + Live Viewを操作記録の核とし、起動、操作、スクリーンショット、終了を1つのDurable Objectが直列管理します。Chrome拡張は第一方式にしません。

## 責務分離

| 構成 | 責務 | 正本にしないもの |
|---|---|---|
| API Worker | 認証、workspace認可、URL一次検査、job受付 | Browser session状態 |
| Capture Session Durable Object | 状態遷移、command直列化、期限、再接続、破棄 | 業務データの永続正本 |
| Browser Run | 対象ページ実行、Live View、スクリーンショット取得 | 認可、長期状態 |
| Supabase Postgres/RLS | session・event・asset metadata、監査 | Cookie、Live View URL、入力値 |
| Cloudflare R2 | 許可済みスクリーンショット本体 | 権限判断、入力値、共有token |

## 起動フロー

1. API WorkerがSupabase session、workspace所属、editor以上、同時実行上限を検証する。
2. 入力URLを正規化し、スキーム、host、port、資格情報、DNS結果を検査する。
3. Postgresへ期限付きjobを作成し、session IDに対応するDurable Objectへ開始commandを送る。
4. Durable Objectが `created -> starting` を直列遷移し、Browser Run sessionを1件だけ起動する。
5. navigation直前と全redirectでSSRF検査を再実行する。
6. ready後、認可済みsession ownerへ用途限定・短命のLive View URLを発行する。
7. Live View URL、Browser session credential、CookieをDB・R2・ログへ保存しない。

## SSRFと危険URL拒否

- `https` を既定許可し、`http` は明示した検証条件だけに限定する。
- `file:`, `data:`, `javascript:`, `blob:`, `ftp:`、URL内資格情報を拒否する。
- localhost、loopback、private、link-local、multicast、予約済みIP、cloud metadata endpointをIPv4/IPv6とも拒否する。
- DNSの全A/AAAA結果を検査し、接続直前にも再解決する。許可IPから拒否IPへ変化した場合は停止する。
- redirectごとに回数上限と同じ検査を適用し、許可URLから内部URLへの遷移を拒否する。
- workspace allowlist/blocklistは危険IP拒否を緩和できない。

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
- SSRF、入力値非保存、Live View漏えい、session残留のnegative test項目を実装できる。
- 外部binding、Durable Object migration、Browser Run実起動を行っていない。
