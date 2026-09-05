# テスト戦略

Status: Accepted

## 品質ゲート

P0/P1が残る状態では次Phaseへ進みません。

| 優先度 | 定義 | 判定 |
|---|---|---|
| P0 | 情報漏えい、権限突破、不可逆なデータ損失、重大な誤課金、主要機能全面停止 | 1件でもリリース停止 |
| P1 | コア業務が完遂できない、結果を信用できない、重大な手戻り | 0件必須 |
| P2 | 限定条件での不便、表現不統一、軽微な性能/視認性問題 | 期限と担当を持つ |

## 必須テスト

- Cloudflare Accessのログイン、Access session終了導線によるログアウト、期限切れ、再認証。アプリはrefresh token交換やAccess cookie削除を行わない。認証世代が変わった後の古いsession／workspace応答を破棄し、状態変更を自動再送せず、上流通信失敗とlogout結果不明を安全に案内できることを確認する。
- owner/admin/editor/viewerの権限。
- Access JWT／Worker認可／D1 tenant・role・status・ID差し替えnegative/mutation test。移行前Postgres baselineを変更する場合だけRLS negative testも実施する。
- Access callback境界。Stripe/Discordのexact pathだけがpath別Access BypassでWorkerへ到達し、exact POSTとbody上限、raw bodyの署名・署名対象timestampを副作用なしで検証、有界parse/schema・allowlist検証、provider ID・payload digest・receiptと再実行可能なwork/outboxを単一のatomic operationで保存、providerへ成功応答、保存済みoutboxからQueue・外部API・業務D1を開始、の順序をmutation testで固定する。guard commit失敗時は成功応答しない。`received/processing/retryable/reconcile_required/completed/dead_letter`、processing lease期限、一時失敗、Queue投入前停止、結果不明照合、同一ID・同一digest再送、同一ID・異なるdigest、並行再送を検証し、受理済みworkの消失・二重副作用・結果不明の盲目的再送がないことを確認する。receipt/effect由来のstable idempotency/correlation keyをoutboxのatomic保存時に確定し、lease generationをまたぐretryでも同じkeyを使う。sinkがidempotency keyを強制できる場合はsink側で重複を拒否し、強制できない場合はeffect単位のsingle-writer境界と決定的correlation markerによるoutcome reconciliationを必須にする。CAS成功後停止・lease takeover・旧worker復帰のnegative/recovery testでexpired/old generation workerをdispatcher/single-writer境界へ入れず、sink callを最大1系統にする。未知結果のまま同じeffectを自動再送せず、D1 preflight/searchだけを二重実行防止の根拠にしない。二重Issue・二重entitlement・二重課金を拒否する。KV get→putだけでは原子性合格にせず、通常ブラウザwrite APIだけに同一Originを必須とする。hostname全体やwildcard pathはBypassせず、通常アプリAPIと`GET /health/config`はAccess保護を維持する。OQ-031の方式決定・実装・schema/migration・recovery test完了前はpath別Access Bypassを有効化しない。store/coordinator選択はIssue #176 M2に残して推測しない。
- ワークスペース越境のAPI/DB/Storageアクセス拒否。
- 手順書の下書きと公開版の分離。
- 操作記録セッションの起動、切断、再接続、終了。
- 入力値非保存。
- SSRF、危険URL拒否。DNS検査時はpublic、実接続時はprivateを返すrebindingと、redirect/subresource/WebSocket/Service Worker/download/WebTransport/QUIC/WebRTC ICE・STUN・TURNのegress迂回を含む。application bytes送信前にpeer拒否が完了することも検証する。
- Browser Run egress実証は`docs/08-operations/browser-run-egress-proof.md`の隔離fixture契約に従い、全経路の重複・欠落・未知経路も不合格にする。
- 共有リンクの期限、失効、パスコード。取得済みURLまたは同じWorker URLを再requestしてもmembership/share/asset失効後は拒否され、保護応答を共有cacheへ流してcache reuseで迂回できないことを確認する。業務assetのreadは毎回Access/D1または有効な共有grantとD1状態を再検証するWorker proxyに限定し、ブラウザへR2短期署名read URLを配らない。既に受信済みbytesの回収は主張しない。
- PDF/Markdown/HTMLで日本語とぼかし維持。
- Stripe webhookの署名、重複、遅延、順不同。
- `single_export` が購入対象manualだけに30日間付与されること。
- `personal_monthly` と `team_monthly` のPrice写像、席数、Browser Run時間、保存容量、同時記録数。
- Stripe Linkの利用者情報をアプリ認証やworkspace認可に使わないこと。
- 利用上限到達時に自動課金せず、新規利用だけを安全に停止すること。
- 返金、chargeback、解約、未払いでデータを即時削除しないこと。
- `BILLING_FEATURE_ENABLED=false` で新規Checkout Session作成が0件になり、既存課金objectの署名済みWebhook、解約、返金、reconciliationは継続すること。
- checkout intentとCheckout Sessionが1対1で、期限切れ・別Session・消費済みintentの支払いを二重付与せず自動返金queueへ送ること。
- Checkout Session作成の応答消失、API再送、並行送信で、intent由来のStripe idempotency keyにより同じSessionだけが返ること。
- TeamからPersonalへの移行はOQ-027が決まるまで、active/grace/read_onlyのTeam契約があれば人数に関係なく課金前に拒否すること。
- AI初期OFFで外部APIを呼ばない。

## 課金テストデータ

- test modeのPriceと短命Checkout Sessionだけを使い、liveの識別子やSecretをfixtureへ入れない。
- checkout intentには推測不能なIDを使い、メール、workspace名、manual名を含めない。
- 同じStripe event、PaymentIntent、checkout intentを複数回送信する。
- Price違い、workspace違い、manual違い、期限切れintent、返金後再出力をnegative caseに含める。
- 月次利用量の境界値として79%、80%、99%、100%、100%超過を検証する。
- R2 100%では新規エクスポート生成を拒否し、生成済み成果物の期限内ダウンロードだけを許可する。

## 完成扱い禁止条件

- happy pathだけで主要機能を説明している。
- 共有URL、Access/D1 tenant境界、削除、復旧のnegative testがない。
- クラウドブラウザでCookieや入力値の保存範囲が不明。
- DNS再解決だけでSSRF対策完了とし、actual peerの照合または検査済みIPへの接続拘束を確認していない。
- Guide Me風機能が静的デモページでしか動かない。
- スマホ表示確認がviewport変更だけ。
- 分析値を原イベントから照合できない。
- PDF/HTML/Markdownの日本語、マスキング、改ページを目視していない。
- 課金完了リダイレクトだけでentitlementを付与している。
- Linkのメールアドレスだけでユーザーやworkspaceを紐付けている。
- 利用量計測の不整合時に自動で追加請求する。
- flaky testを再実行して緑にしている。
