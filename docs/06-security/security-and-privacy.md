# セキュリティとプライバシー

Status: Accepted

## P0扱い

- テナント越境。
- 非公開手順書の閲覧。
- 共有リンク失効後の閲覧。
- パスワード、Cookie、Authorization、カード情報、個人番号の保存。
- SSRF。
- RLS抜け。
- 他人のStripe状態反映。
- 保存済み手順の不可逆消失。

## クラウドブラウザ

- セッションごとにCookie、Storage、キャッシュを分離する。
- セッション終了時に破棄する。
- Live View URLを保存しない。
- Session Recordingは初期OFF。障害解析用途の任意機能に限定する。
- SSRF検査は初回URLだけでなく、全redirectと全通信種別で繰り返す。DNS再解決だけでは合格にせず、検査済みIPへの接続拘束またはactual peer照合を必須にする。
- navigation、subresource、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURNのいずれかで検証済みegressを迂回できる場合、承認済みhostnameも含めBrowser Runをfail closedで無効にする。actual peer検証はapplication bytes送信前に完了させる。
- Browser close失敗時はLive View再発行を止め、破棄再試行と監査を行う。

## 共有リンク

- 生トークンを保存しない。
- 期限、パスコード、失効を持つ。
- キャッシュで権限変更が遅延しないようにする。
- `noindex` はセキュリティ境界ではない。

## AI

- 初期状態で外部AI APIを呼ばない。
- AI利用時もマスキング済み入力のみ扱う。
- 管理者ON/OFF、利用上限、利用ログ、監査ログを持つ。

## ログ

ログへ出さないもの:

- 入力値
- Cookie
- Authorization
- 共有生トークン
- Live View URL
- 個人情報を含むURLクエリ
- スクリーンショット本体
