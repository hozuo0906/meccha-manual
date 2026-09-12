# 未決事項

Status: Accepted

重要未決はおすすめ案で暫定固定済みです。外部契約、法務、料金に関わるものは実装前または公開前に再確認します。

| ID | 質問 | 暫定決定 | ブロック対象 |
|---|---|---|---|
| OQ-001 | 初回公開に全部必須か | ADR-0030で解決済み。guest操作記録からoutput完了までの縦切りを優先し、未検証の追加機能はDeferredにする | なし |
| OQ-002 | 個人利用を許可するか | ADR-0032で解決済み。guest中はworkspaceを作らず、認証後にPersonal Workspaceを自動準備する | なし |
| OQ-003 | viewerのコメント権限 | viewerは許可された手順書にコメント可 | コメント詳細 |
| OQ-004 | 管理者による全セッション閲覧 | Live Viewは現行MVP対象外。将来再導入時も覗き見は禁止し、監査／メタデータ閲覧だけを候補とする | Browser Run再導入判断 |
| OQ-005 | Browser Run同時実行上限 | ADR-0031で現行MVP対象外。将来再導入を決める別ADRで原価・上限を再評価する | Browser Run再導入判断 |
| OQ-006 | 許可/禁止ドメインと検証済みegress方式 | Cloudflare session guardrailsのoutbound HTTP/S制限を候補にするが、全通信を送信前peer検証済みegressへ拘束できるとIssue #86でP0実証できるまでは、運営承認済みdestinationを含めBrowser Run起動・navigateを全面拒否する | Browser Run全通信 |
| OQ-007 | 自動マスキング範囲 | password、カード、トークン、個人番号、メール候補 | 操作記録 |
| OQ-008 | 共有リンク既定 | ADR-0008／ADR-0030で解決済み。デフォルトOFF、期限・パスコード・権限範囲・失効を必須にする | なし |
| OQ-009 | 料金体系 | ADR-0033で旧固定価格をSuperseded。Free / Pro / Teamを第一候補とし、価格と上限はProduct検証後に確定する | 課金公開 |
| OQ-010 | AI機能 | 初期OFF、将来管理者ON | AI拡張 |
| OQ-011 | データ保持期間 | ワークスペース設定、監査ログは長期 | データライフサイクル |
| OQ-012 | 日本国外処理 | Cloudflare Access、D1、R2、および将来Browser Runを再導入する場合の処理・保存地域を公開前に確認し、保証できない範囲を明記 | 法務 |
| OQ-013 | R2のデータ種別ごとの保持期間 | lifecycle ruleは作らず、契約・復旧・法務要件を確認後に決定 | R2自動削除 |
| OQ-014 | 短命R2 URLとLive View URLの具体的TTL | 業務assetのR2 read URL選択肢はADR-0028で失効し、毎回再検証するWorker proxyに限定する。Live Viewは現行MVP対象外で、将来再導入する場合は別ADRで必要最小のTTLを決める | R2 read／Browser Run再導入判断 |
| OQ-015 | 席数の数え方 | 旧5 creator／50 viewerはADR-0033で未確定へ戻した。Team需要の検証後、active／invited／disabledの数え方と上限を課金公開前に決める | Team／課金公開 |
| OQ-016 | 未払い猶予期間とread-only移行 | 即時削除・即時締め出しはせず、顧客通知と復旧手順を含めて決定 | 課金強制 |
| OQ-017 | 全額・一部返金時のentitlement | 返金とデータ削除を分離する。Deferred中の都度払いを将来再導入する場合の再出力停止、subscriptionの期間按分、一部返金は運用設計後に決定する | 返金自動化 |
| OQ-018 | Browser Run最大実行時間、idle timeout、同時実行数 | ADR-0031で現行MVP対象外。将来再導入を決める別ADRでhard expiry、idle timeout、同時実行数を確定する | Browser Run再導入判断 |
| OQ-019 | production GitHub Environmentのrequired reviewerを誰にするか | deploy step追加前にリポジトリownerが指名し、自己承認可否と代替承認者を決定 | production workflow有効化 |
| OQ-020 | production独自ドメイン、DNS、切替日、rollback条件 | URLとrollback方針はADR-0024で解決済み。Cloudflare zone確認、切替日、実行承認が揃うまで`workers.dev`を技術URLとして維持する | production Custom Domain切替 |
| OQ-021 | production D1の名称、location hint、作成時期、backup/restore条件 | stagingでmigrationとrestore rehearsalを完了し、データ所在地・費用・復旧要件の承認後に別databaseとして作成 | production D1作成・migration |
| OQ-022 | 未使用・重複・孤立した画像の判定条件と物理削除時期 | 公開版、下書き、過去revisionから参照中のassetは削除しない。未参照assetは削除候補にし、猶予期間と復元条件を決定してから物理削除する | R2画像削除job |
| OQ-023 | guest下書き、操作記録画像、認証後manualを何日保持するか | guest原本は拡張ローカルだけに保持しclaim成功確認後に削除する。認証後manual／assetの保持期間は復旧・法務・費用を確認して決定し、自動削除しない | データライフサイクル／課金公開 |
| OQ-024 | 月次利用量の締め時刻、再集計、上限解除、将来の追加枠をどう扱うか | 日本時間の月次表示を候補とし、自動従量課金はしない。計測不整合時は追加請求せず再集計する | usage metering |
| OQ-025 | chargeback、部分返金、誤購入時の手動復旧権限を誰が持つか | 自動データ削除を禁止し、監査ログ付きの運用者フローを課金公開前に決める | 返金/不正利用対応 |
| OQ-026 | FreeのR2保存容量上限を何GBにするか | 画像圧縮率と1手順書あたりの実測後に数値を固定する。決定までは無制限保存を許可せず、課金公開をブロックする | usage metering／課金公開 |
| OQ-027 | TeamからPersonalへ移行するとき、既存Team subscriptionをどう置換し、owner以外のメンバーをどう扱うか | 自動解約・自動削除・自動降格は行わない。決定まではactive/grace/read_onlyのTeam契約があれば人数に関係なくPersonalのCheckout Session作成を拒否し、二重契約を課金前に止める | pricing/checkout/subscription/membership |
| OQ-028 | FR-004の「削除」で、アーカイブ後の復元・物理削除をいつ誰に許可し、revision、asset、共有、分析、コメントをどう扱うか | 現段階は非破壊アーカイブだけを提供し、revision pointerと全内容を保持する。復元・物理削除・自動削除は、権限、猶予期間、参照関係、監査、再試行をADRで確定するまで有効化しない | 手順書復元／物理削除 |
| OQ-029 | Accessのsubject再発行、email変更、退会後再登録をどう扱うか | ADR-0032でproduction商用MVPのself-service bootstrapだけを有効化する。検証済みissuer+subjectをidentityの正本とし、email一致でidentityを移動・統合・復活させない。subject再発行は未知identity、退会・disabled／retired identityは自動復活不可とし、relinkは別の明示的な回復設計まで無効にする | identity回復運用 |
| OQ-030 | D1でPostgres RLS相当の防御をどこまで二重化するか | Worker用途別repositoryとworkspace固定queryを必須にし、D1制約、negative test、mutation test、静的scannerで補完する。共通汎用DMLは禁止 | D1 workspace/manual移行 |
| OQ-031 | Stripe/Discord callbackのatomic receipt/workをD1またはDurable Objectsのどちらで実現するか | raw body署名・timestampの副作用なし検証、有界parse/schema・allowlist検証後、provider ID、payload digest、receiptと再実行可能なwork/outboxを単一のatomic operationで保存する順序は固定する。`received/processing/retryable/reconcile_required/completed/dead_letter`、processing lease、dispatcher、結果不明照合、stable key、sink idempotencyまたはsingle-writer、旧lease worker fencing、並行再送・停止・recoveryの条件は保持する。M2ではcallbackを503・副作用0で無効化し、store/coordinator選択、schema/migration、callback本体、negative/recovery testを独立callbackマイルストーンC1で設計・実装する。既存Discord KV get→putだけでは合格にせず、完了までpath別Access Bypassを有効化しない | callbackのstaging/production外部到達 |
