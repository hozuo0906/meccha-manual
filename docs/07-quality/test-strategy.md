# テスト戦略

Status: Accepted

## 品質ゲートの運用レベル

品質要件そのものは弱めず、すべての変更で同じ重い検査を実行する運用だけを見直す。

### Fast Gate

日常の小変更・ローカル反復で最初に実行する。

- typecheck / syntax。
- 変更対象のunit test。
- docs整合の最小check。
- secret / encoding / diff check。
- 変更対象に対応する軽量security contract。

Fast Gateは開発速度のための入口であり、リリース合格を意味しない。

### Core PR Gate

MVPの主要導線、Chrome拡張、guest onboarding、認証、manual、共有へ影響するPRで必須とする。

- Fast Gate一式。
- Chrome Extension Manifest / permission contract。
- guest local-only境界。
- PC / smartphone / tablet responsive mode。
- output gate -> signup -> bootstrap -> guest claimの正常系・再送・結果不明。
- 変更対象のAPI/DB negative test。
- Access JWT／Worker認可／D1 tenant境界。
- manual作成/保存/再読込。
- 主要E2E。
- アクセシビリティ回帰。
- 必要なmutation test。

### Deep / Release Gate

外部公開、staging統合実証、production候補、または高リスク機能を有効化する前に実行する。

- guest claimの途中失敗・大容量asset・recovery。
- migration / restore。
- 課金・Webhook・返金・reconciliationを有効化する場合の全検証。
- R2 lifecycle / capacity。
- 障害注入。
- 全体E2E。
- release-specific smoke / rollback。

Browser Run egress / SSRF / hard-expiry実証はBrowser Runを製品runtimeへ再導入する場合だけDeep Gateへ復帰する。Browser Runが無効な現行Chrome拡張MVPでは毎PR・商用MVPの必須Gateにしない。

Deferred機能のDeep testは、その機能が無効の間は通常開発をブロックしない。ただしfail-closedまたは無効状態をCore Gateで確認する。

## Product Quality Gate

技術的に正しいことだけでは商用MVP合格としない。初回商用公開前には次を確認する。

- アカウントなしで `Chrome拡張導入 -> 表示モード選択 -> 操作記録 -> ローカル下書き生成 -> 編集` を説明なしで完遂できる。
- `保存 / 共有 / PDF出力` で初めてsignupを要求し、signup後に同じdraftとoutput操作へ復帰できる。
- PC / smartphone / tabletの3表示モードが実Chromeで動く。
- smartphone / tabletではportrait / landscapeを選べ、終了・取消・失敗時に元window状態へ戻る。
- guest中にmanual本文／screenshotのD1/R2 writeが0回である。
- TTFV、Capture Completion、output gate、signup、guest claim、Second Manualを `product-events.md` の一貫したeventで測定できる。
- 初期ICPが利用する代表サイト群でChrome拡張captureの実用可能性を確認している。
- Deferred機能の未完成がActivation導線を塞いでいない。

## 品質ゲート

P0/P1が残る状態では対象マイルストーンを次へ進めません。

| 優先度 | 定義 | 判定 |
|---|---|---|
| P0 | 情報漏えい、権限突破、不可逆なデータ損失、重大な誤課金、主要機能全面停止 | 1件でもリリース停止 |
| P1 | コア業務が完遂できない、結果を信用できない、重大な手戻り | 0件必須 |
| P2 | 限定条件での不便、表現不統一、軽微な性能/視認性問題 | 期限と担当を持つ |

## MVP Chrome拡張必須テスト

- Manifest V3である。
- `activeTab` / `scripting`を中心とし、MVPで`debugger` permissionを必須にしない。
- 常時`<all_urls>`を必須にしない。
- 利用者の明示操作前にcontent collectionを開始しない。
- 開始した対象タブ以外へ記録を勝手に広げない。
- password、カード、token、個人番号、Cookie、Authorization、password manager由来情報をevent、local draft、Product Event、API request、ログへ保存しない。
- guest状態でcapture event、manual本文、screenshotがD1/R2へ送信されない。
- guest draftがブラウザ再描画や拡張service worker停止後も意図したローカル永続範囲で復元できる。
- PC / smartphone / tabletでcaptureできる。
- responsive modeは目標viewportと実際の`innerWidth / innerHeight`を照合する。
- orientation切替、記録停止、取消、例外時に元window boundsへ戻る。
- UA/touch/DPR/OSを完全再現していない状態を実機保証と表示しない。
- SPA、iframe、Shadow DOM、Canvas、Web Componentsの代表fixtureで対応範囲と失敗時挙動を確認する。

## Guest onboarding / self-service必須テスト

- LPからguest manual作成開始までアカウント作成を必須にしない。
- output gateを開くまでAccess loginやworkspace作成を要求しない。
- output gateをキャンセルした場合、guest draftを失わず編集へ戻る。
- Cloudflare Accessのログイン、Access session終了導線によるログアウト、期限切れ、再認証を確認する。アプリはrefresh token交換やAccess cookie削除を行わない。認証世代が変わった後の古い応答を破棄する。
- valid human Access actorのissuer+subjectを正本にself-service bootstrapする。
- email一致だけでdisabled / retired identityを自動復活・移動しない。
- identity/profile/Personal Workspace/active owner membership/auditをD1 atomic operationとして確定する。
- bootstrap並行実行でPersonal Workspaceを二重作成しない。
- bootstrap結果不明時は同じoperationIdで照合し、別workspaceを作らない。
- guest claimはcurrent actor/workspaceへ固定した短命intentを使用する。
- same operationId + same fingerprintは同じmanual結果、different fingerprintは409にする。
- claim応答消失やR2一時障害でlocal guest原本を削除しない。
- claim成功後だけlocal guest原本を削除し、押していたsave/share/exportへ復帰する。

## 既存サーバー安全テスト

- owner/admin/editor/viewerの権限。
- Access JWT／Worker認可／D1 tenant・role・status・ID差し替えnegative/mutation test。移行前Postgres baselineを変更する場合だけRLS negative testも実施する。
- ワークスペース越境のAPI/DB/Storageアクセス拒否。
- 手順書の下書きと公開版の分離。
- private R2 readは毎回Access/D1または有効な共有grantとD1状態を再検証するWorker proxyに限定する。
- 共有リンクの期限、失効、パスコード、権限範囲を検証する。取得済みURLまたは同じWorker URLを再requestしてもmembership/share/asset失効後は拒否する。
- Product Eventはallowlist外event、forbidden payload、同一eventId再送を安全に扱う。
- AI初期OFFで外部APIを呼ばない。

## Access callback境界

Access callback境界。Stripe/Discordのexact pathだけがpath別Access BypassでWorkerへ到達し、exact POSTとbody上限、raw bodyの署名・署名対象timestampを副作用なしで検証、有界parse/schema・allowlist検証後にprovider ID、payload digest、receiptと再実行可能なwork/outboxを単一のatomic operationで保存、providerへ成功応答、保存済みoutboxからQueue・外部API・業務D1を開始、の順序をmutation testで固定する。guard commit失敗時は成功応答しない。`received/processing/retryable/reconcile_required/completed/dead_letter`、processing lease期限、一時失敗、Queue投入前停止、結果不明照合、同一ID・同一digest再送、同一ID・異なるdigest、並行再送を検証し、受理済みworkの消失・二重副作用・結果不明の盲目的再送がないことを確認する。receipt/effect由来のstable idempotency/correlation keyをoutboxのatomic保存時に確定し、lease generationをまたぐretryでも同じkeyを使う。sinkがidempotency keyを強制できる場合はsink側で重複を拒否し、強制できない場合はeffect単位のsingle-writer境界と決定的correlation markerによるoutcome reconciliationを必須にする。CAS成功後停止・lease takeover・旧worker復帰のnegative/recovery testでexpired/old generation workerをdispatcher/single-writer境界へ入れず、sink callを最大1系統にする。未知結果のまま同じeffectを自動再送せず、D1 preflight/searchだけを二重実行防止の根拠にしない。二重Issue・二重entitlement・二重課金を拒否する。KV get→putだけでは原子性合格にせず、通常ブラウザwrite APIだけに同一Originを必須とする。hostname全体やwildcard pathはBypassせず、通常アプリAPIと`GET /health/config`はAccess保護を維持する。OQ-031の方式決定・実装・schema/migration・recovery test完了前はpath別Access Bypassを有効化しない。store/coordinator選択は独立callbackマイルストーンC1に残して推測しない。

M2 callback停止境界では、phase1／phase2両入口で2つのexact POST pathへ、有効署名、無署名、不正body、env未設定を送る。body read、KV get/put、外部fetch、Queue/D1呼出し、`ctx.waitUntil`が0回のまま、安定した `503 CALLBACK_MIGRATION_IN_PROGRESS` を返すことを確認する。exact pathの別methodは405、subpathは404とし、旧handlerへ到達させない。C1再開時は上記callback境界を再実行する。

## Browser Run legacy / future Gate

Browser Runは現行MVPで無効とする。既存の次の安全テストは削除せず、再導入時の必須Gateとして保持する。

- SSRF、危険URL拒否。
- DNS rebinding、redirect、subresource、WebSocket、Service Worker、download、WebTransport/QUIC、WebRTC ICE/STUN/TURNのegress迂回。
- application bytes送信前のactual peer拒否。
- `docs/08-operations/browser-run-egress-proof.md` の隔離fixture契約。
- hard expiry、Live View失効、全session終了。

Browser Runが無効な間、これらのlive P0実証未完了をChrome拡張MVPのリリースブロッカーにしない。無効状態から意図せずprovider callが発生しないことは回帰確認する。

## 課金テスト

課金機能がOFFの間は、新規Checkout Session作成が0件であることを通常Gateで確認する。

課金を有効化するPRでは次をDeep Gateへ昇格する。

- Stripe webhookの署名、重複、遅延、順不同。
- Stripe Linkの利用者情報をアプリ認証やworkspace認可に使わない。
- checkout intentとCheckout Sessionの1対1、期限切れ、別Session、消費済みintent、応答消失、並行送信。
- 利用上限到達時に自動課金しない。
- 返金、chargeback、解約、未払いでデータを即時削除しない。
- 価格／plan mapping。

`single_export` 旧契約や旧Price mappingの詳細テストはADR-0033によりDeferredであり、そのofferを再有効化するときに必須化する。

## 課金テストデータ

- test modeだけを使い、liveの識別子やSecretをfixtureへ入れない。
- checkout intentには推測不能なIDを使い、メール、workspace名、manual名を含めない。
- 同じStripe event、PaymentIntent、checkout intentを複数回送信する。
- Price違い、workspace違い、manual違い、期限切れintentをnegative caseに含める。
- R2等の内部上限で停止する場合、自動追加請求しない。

## 完成扱い禁止条件

- happy pathだけで主要機能を説明している。
- guest manual/screenshotが認証前にserverへ保存される。
- output時signup後にguest draftを失う、または二重manualを作る。
- Chrome拡張が明示操作なしにページを収集する。
- `debugger`や広範host permissionをMVPで理由なく要求する。
- PCしかcaptureできず、スマホ/タブレットresponsive modeがない。
- responsive viewport方式なのに実機iOS/Android完全再現と表示する。
- 共有URL、Access/D1 tenant境界、削除、復旧のnegative testがない。
- 分析値を `product-events.md` の原eventから照合できない。
- 課金完了リダイレクトだけでentitlementを付与する。
- Linkのメールアドレスだけでユーザーやworkspaceを紐付ける。
- 利用量計測の不整合時に自動で追加請求する。
- flaky testを再実行して緑にする。
- 技術ゲートだけ成功し、guestからoutput完了までを実利用者が完遂できるか未確認のまま商用MVP完成とする。
