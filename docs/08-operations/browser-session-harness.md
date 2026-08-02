# Browser Run / Browser Sessionハーネス

Status: Accepted

## 目的

Cloudflare Browser Run + Live Viewを操作記録の第一方式とし、通常HTTP処理ではなく期限、キャンセル、再試行、成果物、監査を持つjobとして安全境界を固定する。Chrome拡張を第一方式にしない。状態と責務の正本は [ADR-0003](../03-architecture/adrs/ADR-0003-durable-object-session-state.md) と [Browser Runtime](../03-architecture/browser-runtime.md) とする。

## 作るもの

1. 認証済みworkspace memberが記録jobを作り、Workerが対象URLを検証する起動境界。
2. sessionごとのDurable Objectが状態遷移、Browser Run session ID、単一command列、idle/absolute期限、cancel/retry、flushを管理する境界。
3. 対象sessionの利用者だけに、再利用を制限した短命Live View URLを発行する境界。URL本体を監査ログへ残さない。
4. click/navigation/scroll summary等の操作イベントとスクリーンショットを連番で関連付ける境界。入力欄は「入力した」という事実と安全な要素情報だけを扱い、入力値は保存しない。
5. スクリーンショットをprivate R2へ保存し、Postgresにworkspace、session、sequence、checksum、マスキング状態を保存する境界。
6. cancel要求を `stopping` へ遷移させ、completed/failed/expiredを含む終了時にpage/context/browserを閉じ、Live Viewを失効させ、一時credential、Cookie、Storage、cacheを破棄する終了処理。
7. actor、workspace、session、状態遷移、許可/拒否理由、成果物ID、日時を残す監査ログ。URL query、入力値、Cookie、header、Live View token、画像内容は記録しない。

## SSRFと危険URL拒否

- `http:` / `https:` 以外、資格情報付きURL、localhost、loopback、private、link-local、multicast、予約済みIP、cloud metadata endpointを拒否する。
- hostname解決結果を接続直前に検査し、IPv4/IPv6、整数・短縮・難読化表現を正規化する。
- 全redirect、subresource、WebSocket、downloadについて宛先を再検査し、DNS rebindingを前提にする。
- workspace allow/deny policyは危険URL拒否を緩和できない。禁止domainの具体値は `OQ-006` の解決後に設定する。
- file download、permission prompt、clipboard、外部protocol、拡張機能、devtools、localhost到達を既定拒否する。

## 失敗・破棄

起動と再試行にはidempotency keyを使い、同一jobから複数browserを残さない。期限・利用者cancel・起動失敗・永続化失敗の全経路で終了処理を実行し、破棄失敗は再試行queueと監査対象にする。スクリーンショット保存後にDB記録が失敗した孤児object、またはDB記録後にR2保存が失敗した欠損を照合jobで検出する。

## 必要な外部設定と承認

環境別Browser binding、Durable Object namespace/migration、Worker、R2、Supabase、実行上限、egress policyが必要である。binding/namespace作成、外部サイトへのstaging接続、実スクリーンショット保存、production deploy、上限変更は明示承認を要する。対象サイトの利用規約と操作権限も確認する。

## まだやらないこと

Browser Run/DOの重いコード、binding、namespace、外部接続、実サイト操作、スクリーンショット保存、本番deployは行わない。AI API、共有リンク、入力値保存も有効化しない。

## 完了条件

- 状態遷移、期限、cancel/retry、Live View認可、入力非保存、スクリーンショット、破棄、監査がテスト可能な条件で定義されている。
- 危険URL、redirect、DNS rebinding、別workspace Live View、期限切れURLを拒否するnegative test計画がある。
- staging実装時は終了状態ごとのresource leak検査とR2/Postgres照合が成功し、P0/P1が0件である。
