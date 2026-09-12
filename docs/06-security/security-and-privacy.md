# セキュリティとプライバシー

Status: Accepted

## P0扱い

- テナント越境。
- 非公開手順書の閲覧。
- 共有リンク失効後の閲覧。
- パスワード、Cookie、Authorization、カード情報、個人番号の保存。
- Chrome拡張が利用者の明示操作なしに記録を開始すること。
- Chrome拡張が対象タブ以外を継続収集すること。
- guest manual本文・screenshotを認証前にD1/R2へ送信すること。
- email一致だけでdisabled/retired identityを復活・移動・統合すること。
- guest claimの再送でmanualやassetを二重生成すること。
- Worker認可、workspace固定D1 query、D1制約のいずれかの抜け。
- 他人のStripe状態反映。
- 保存済み手順の不可逆消失。

## Chrome拡張

操作記録のMVP方式はChrome Extension Manifest V3だけとする。

- `activeTab` / `scripting` を中心に最小権限で構成する。
- MVPで`debugger`と常時`<all_urls>`を必須にしない。
- 利用者の明示操作で記録を開始する。
- 記録開始した対象タブだけを記録する。
- 記録対象を別タブや別originへ自動拡大しない。
- password、カード番号、token、個人番号等の入力値を保存しない。
- Cookie、Authorization、password manager由来情報を取得・送信しない。
- DOMから取得する文字列は手順生成に必要な対象名・ラベル等へ限定する。
- screenshotの保存前にマスキング境界を適用する。
- extension ID、content scriptからの申告、local stateだけを認証・workspace認可の根拠にしない。
- 記録停止時にcontent scriptの記録状態を終了し、不要な一時データを破棄する。
- Chrome権限を追加・拡大する変更はsecurity review対象とする。

## Guest local-only境界

アカウント作成前のmanual本文、capture event、screenshot、編集内容はChrome拡張ローカルだけに保持する。

- guest状態でD1 manual/workspace、R2 asset、share linkを作成しない。
- guest contentをanalytics payloadへ含めない。
- guest本文を匿名uploadして後で所有者を割り当てる方式をMVPで採用しない。
- 大きなscreenshotはIndexedDB等のローカル永続領域を使い、入力値やsecretはそこにも保存しない。
- claim成功が確定するまでlocal原本を削除しない。
- 拡張削除・ブラウザデータ削除でguest draftが失われ得ることを必要な場面で案内する。

## Self-service bootstrap

output gate後のセルフサーブ登録ではAccess到達許可とapplication identity/workspace作成を分離する。

- WorkerがAccess JWTの署名、issuer、audience、期限、actor typeを検証する。
- application identityは検証済み `issuer + subject` を正本とする。
- email一致だけで既存identityをrelocate、merge、reviveしない。
- disabled / retired identityを自動復活させない。
- unknown valid human actorを許可するのは明示したself-service bootstrap routeだけとする。
- identity、profile、Personal Workspace、active owner membership、auditを単一のD1 atomic operation/batchで確定する。
- bootstrapの並行送信・応答消失でもPersonal Workspaceを二重作成しない。
- service tokenをself-service bootstrapへ使わない。

## Guest draft claim

- claim intentは認証済みactor/workspaceへ固定する。
- 短命・単回利用・推測困難とする。
- raw claim tokenをURL query、ログ、analyticsへ残さない。
- same operationId + same fingerprintは同じ結果を返す。
- same operationId + different fingerprintは拒否する。
- claim途中失敗やR2結果不明でlocal guest原本を消さない。
- manual確定・asset参照確定より前にclaim成功扱いしない。
- extension IDやguest local IDだけでclaimを許可しない。

## Responsive view

スマホ／タブレットはdesktop Chrome上のresponsive viewportとして提供する。

- window変更前の位置・サイズを保存し、終了・取消・例外時に復元する。
- target viewportは実際の`innerWidth / innerHeight`で確認する。
- UA、DPR、touch、OS固有描画を完全再現していない状態で「実機完全再現」と表示しない。
- `debugger` / CDPを追加する場合は別ADRとpermission reviewを必須にする。

## クラウドブラウザ

Cloudflare Browser Run / Browser Session / Live Viewは現行MVP runtimeで使用しない。将来再導入する場合だけ本節を有効な実装ゲートとして適用する。

- セッションごとにCookie、Storage、cacheを分離する。
- Live View URLを保存しない。
- SSRF検査は全redirectと全通信種別で繰り返す。
- actual peerをapplication bytes送信前に確認できない経路があればfail closedにする。
- Browser close/hard-expiry/egress安全契約を再度合格させる。

Browser Run関連P0未実証を、Browser Runが無効なChrome拡張MVPのrelease blockerにしない。

## 共有リンク

- 生トークンを保存しない。
- デフォルトOFF。
- 期限を持つ。
- パスコードを持つ。
- 権限範囲を明示する。
- 無効化できる。
- cacheで権限変更や失効を迂回させない。
- `noindex` はsecurity boundaryではない。

## AI

- 初期状態で外部AI APIを呼ばない。
- AI利用時もマスキング済み入力のみ扱う。
- 管理者ON/OFF、利用上限、利用ログ、監査ログを持つ。

## ログ・Product Eventへ出さないもの

- 入力値。
- Cookie。
- Authorization。
- 共有生トークン。
- claim生トークン。
- 個人情報を含むURL/query。
- screenshot本体。
- guest manual本文。
- member join code。

## メンバー参加

Team参加の既存安全契約はself-service Personal bootstrapと分離して維持する。

- メールアドレスによる直接membership追加を行わない。
- 認証済み本人だけが256 bit・10分有効・単回使用の参加コードを発行できる。
- DBには参加コードのSHA-256 digestだけを保存し、平文をStorage、URL、ログ、監査ログへ残さない。
- owner/adminが参加コードを利用したmembership追加・復帰とコード消費、監査追記を同一transactionで確定する。
- 無効、期限切れ、失効、使用済みcodeは状態を推測させないerrorへまとめる。
