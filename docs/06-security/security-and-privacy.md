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

- 売上安定をownerが確認し実装開始を明示承認するまで、AI adapter、flag、Secret、endpoint、AI固有ログを作らない。
- FR-006はローカルの決定的処理だけで完了し、外部AI APIを呼ばない。
- 承認後のデータ送信範囲、マスキング、上限、監査、停止条件は別ADRで決定する。

## ログ

ログへ出さないもの:

- 入力値
- Cookie
- Authorization
- 共有生トークン
- Live View URL
- 個人情報を含むURLクエリ
- スクリーンショット本体
- メンバー参加コード

## メンバー参加

- メールアドレスによる直接追加を行わない。
- 認証済みの本人だけが256 bit・10分有効・単回使用の参加コードを発行できる。
- DBには参加コードのSHA-256 digestだけを保存し、平文をStorage、URL、ログ、監査ログへ残さない。
- 参加コードはworkspaceに事前拘束されないBearer credentialであるため、発行画面で、受領した管理者が、その管理者の管理する任意のworkspaceへ発行者を選択したroleで1回追加できることを明示する。参加先を確認し、信頼できる管理者1人へ安全な1対1の方法でだけ渡し、グループチャットや共有チャンネルへ送らない。
- ブラウザは期限到達時に平文をDOMとメモリstateから消去し、別ユーザーへの認証切替では保留中応答に含まれる平文も表示しない。
- owner/adminが参加コードを利用したmembership追加・復帰とコード消費、監査追記を同一transactionで確定する。
- 無効、期限切れ、失効、使用済みコードは同じエラーにまとめ、コードの状態を推測させない。
