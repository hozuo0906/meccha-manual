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
- Access callback境界。Stripe/Discordのexact pathだけがpath別Access BypassでWorkerへ到達し、exact POST・body上限の確認後、raw bodyの署名・署名対象timestampを副作用なしで検証し、有界parse/schema検証後にprovider event/interaction IDをauthoritative storeへ原子的に予約する順序を確認する。別method、subpath、body超過、署名欠落・不正、期限外はparse前、payload不正・ID欠落は予約前、replayは予約時に拒否し、予約以外のQueue、外部API、業務D1、entitlementその他の副作用がないことを確認する。KV get→putだけでは原子性合格にせず、通常ブラウザwrite APIだけに同一Originを必須とする。hostname全体やwildcard pathはBypassせず、通常アプリAPIと`GET /health/config`はAccess保護を維持する。
- ワークスペース越境のAPI/DB/Storageアクセス拒否。
- 手順書の下書きと公開版の分離。
- 操作記録セッションの起動、切断、再接続、終了。
- 入力値非保存。
- SSRF、危険URL拒否。DNS検査時はpublic、実接続時はprivateを返すrebindingと、redirect/subresource/WebSocket/Service Worker/download/WebTransport/QUIC/WebRTC ICE・STUN・TURNのegress迂回を含む。application bytes送信前にpeer拒否が完了することも検証する。
- Browser Run egress実証は`docs/08-operations/browser-run-egress-proof.md`の隔離fixture契約に従い、全経路の重複・欠落・未知経路も不合格にする。
- 共有リンクの期限、失効、パスコード。
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
