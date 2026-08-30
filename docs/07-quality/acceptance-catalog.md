# 受入条件カタログ

Status: Accepted

| ID | Given | When | Then |
|---|---|---|---|
| AC-001 | ログイン済みユーザー | ログアウトする | 保護画面にアクセスできない |
| AC-002 | A社ユーザー | B社のworkspace IDまたはresource IDへ一覧・取得APIから差し替える | Worker認可、workspace固定D1 query、D1制約で拒否され、B社の存在を推測できる情報を返さない |
| AC-003 | 有効な認証情報を持つユーザー | SCR-LOGINからログインする | tokenをブラウザJavaScriptへ返さずSCR-SHELLと所属ワークスペースを表示する |
| AC-004 | 未入力または無効な認証情報 | SCR-LOGINからログインする | ログインせず、何が起きたかと次の操作を日本語で表示し、エラーへフォーカスを移す |
| AC-005 | Access session/JWTが期限切れ、不正、または再認証を要求している | 保護画面または保護APIへアクセスし、その後再認証する | 接続障害と区別した期限切れ案内を表示し、JWTをブラウザJavaScriptへ露出せず、保護データを残さず、再認証後に利用を再開できる |
| AC-006 | activeなAccess user identity | D1対応workspace作成operationでワークスペースを作成する | 作成者をactiveなownerとして同じD1 atomic operation/batchで登録し、ワークスペースに属さない業務データを作らない |
| AC-007 | A社メンバー | B社のworkspace memberを一覧、追加、更新しようとする | Worker認可とworkspace固定D1 query/constraintで拒否され、B社のメンバー情報を返さない |
| AC-008 | owner、admin、editor、viewerが存在する | 参加コードの発行・期限切れ・再発行、メンバーの一覧・追加・ロール変更・停止、発行中の認証切替を行う | 発行者へBearerコードの影響と1対1共有を警告し、期限到達時は平文とコピー導線を消し、再発行は失効確認を行う。同一ユーザーの認証切替では遅延成功・失敗後に発行中状態を終了し、別ユーザーへ平文を表示しない。owner/adminの許可操作だけが成功し、editor/viewerの変更操作はWorker認可とworkspace固定D1 query/constraintで拒否され、ownerロールの付与・移管は専用の決定済みフローがない限り拒否される |
| AC-009 | activeなownerが1人だけ存在する | そのownerを停止、削除、またはowner以外へ変更する | APIとDBで拒否し、ワークスペースにactiveなownerを1人以上維持する |
| AC-010 | editorユーザー | 手動で手順書を作成して公開する | 公開URLで公開版を閲覧できる |
| AC-011 | 公開版が存在する | 下書きを編集する | 公開版の内容は変わらない |
| AC-012 | SCR-LOGIN、SCR-WORKSPACE、SCR-MEMBERS、SCR-SHELLを利用する | 読込、保存、失敗、権限不足、接続切断、期限切れが発生する | 該当する状態を区別して表示し、完了済み範囲と次の操作を日本語で案内する |
| AC-013 | キーボード、200%ズーム、スクリーンリーダー相当の検査環境 | Phase 1の主要操作を完了する | WCAG 2.2 AAを目標とする自動検査に重大違反がなく、フォーカス順、可視フォーカス、ラベル、エラー関連付け、状態通知、44px操作領域を手動確認できる |
| AC-014 | owner、admin、editor、viewerの各ユーザー | SCR-SHELLとSCR-MEMBERSを表示し、URLまたはAPIを直接指定する | UIはロールで許可された操作だけを有効表示し、非表示や無効表示に関係なくWorker認可とworkspace固定D1 query/constraintが不許可操作を拒否する |
| AC-015 | ログイン済みユーザー | Access session終了導線でログアウトを開始し、通信切断または終了結果を確認できない | 保護データとアプリ表示stateを直ちに破棄し、Access session終了を成功扱いせず、結果不明と再確認方法を日本語で案内する。Access cookieやrefresh tokenをアプリから操作しない |
| AC-016 | 同一ブラウザの複数タブでAccess再認証、Access session終了、workspace作成、一覧更新が並行する | 古い認証・session・作成・一覧応答または失敗が新しい操作より後に到着する | 検証済みsessionの認証世代が変わった時点で旧shellと保護データを即座に隠し、古いsession／workspace応答を破棄する。アプリからAccess cookieやrefresh tokenを操作せず、状態変更を自動再送しない。現在のAccess主体と最新一覧だけを表示し、別ユーザーのworkspace情報・作成前一覧・古い失敗表示で上書きしない。作成POST成功後の一覧再取得失敗は作成済みと明示する |
| AC-018 | StripeまたはDiscordの正規provider requestがAccess JWTなしでexact callback pathへ到達する | exact POSTとbody上限を確認し、raw bodyのprovider署名・署名対象timestampを副作用なしで検証し、有界parse/schema・allowlist検証後にprovider ID、payload digest、receiptと再実行可能なwork/outboxを単一のatomic operationで保存する | guard commit成功後だけproviderへ成功応答し、保存済みoutboxからQueue、外部API、業務D1、entitlementその他の副作用へ進む。Access/D1 userへ写像せず、`Origin`をcallback認証に使わない |
| AC-019 | 別method、subpath、body超過、署名欠落・不正・期限外、payload不正・provider ID欠落、allowlist不一致、同じID・異なるpayload digest、または通常アプリAPI／`GET /health/config`へのAccessなしrequest | callback境界を通過しようとする | method/path/body/署名/timestamp違反はparse前、payload/ID/allowlist違反はguard commit前、同じID・異なるdigestはatomic照合時に拒否する。receipt/work、provider成功応答、Queue、外部API、業務D1、entitlementの副作用を作らない。hostname全体やwildcard pathへBypassを適用せず、通常アプリAPIはAccess user、`GET /health/config`はservice tokenを必須にする。OQ-031の実装・recovery test完了前はpath別Access Bypassを有効化しない |
| AC-017 | owner/admin/editorが表示中の手順書を開いている | 未保存変更の有無、権限失効、別更新との競合、通信切断を含む条件でアーカイブする | 未保存変更は保護し、viewerと別workspaceは拒否し、表示時versionが一致する場合だけ非破壊アーカイブして一覧から除外する。revision pointerと内容を保持し監査ログを残し、結果不明時は自動再送せず一覧で確認する |
| AC-020 | editorユーザーかつ `capture.browserRun.egressVerified.enabled=true`、P0検証済み | 操作記録を開始する | Browser sessionが作成されLive View URLを取得できる |
| AC-021 | 記録中 | password欄へ入力する | 入力値はDB/ログ/Storageに保存されない |
| AC-022 | 記録中 | 危険URLへ遷移しようとする | SSRF防止で拒否される |
| AC-023 | DNS検査ではpublic IPを返す対象host、またはegressを迂回するWebRTC/WebTransport fixture | 承認済みhostへの実接続、subresource、直接通信を開始する | HTTP/TLS/application bytes送信前にactual peerで拒否され、1経路でも拘束不能ならBrowser Run起動・navigateが `BROWSER_EGRESS_NOT_VERIFIED` でfail closedになる |
| AC-024 | editorユーザーかつegress P0検証未完了 | mobile previewを開始する | Browser Runへ通信せず `BROWSER_EGRESS_NOT_VERIFIED` で拒否される |
| AC-025 | Browser Runセッション稼働中 | egress迂回発覚により検証済みflagをfalseへ戻す | 既存egressを即時遮断し、Live View失効・再発行拒否・全session終了を行う |
| AC-026 | click、input completion、navigation、scroll eventに入力値、秘密値を含み得るnavigation URL、未知field、機密target labelが含まれる | 保存可能eventを正規化し、日本語draft stepを生成する | sequence順の決定的なstepとなり、生入力値、秘密値、navigation URLのorigin／path／query／fragment、Cookie、Authorizationはeventにもdraftにも含まれず、外部AI APIを呼ばない |
| AC-027 | 署名済みcallbackのguard commit後にQueue投入、外部API、業務D1の一時失敗、processing lease期限、結果不明、同一ID・同一digestの並行再送が起きる | receipt/workを再開または照合する | 新しいworkを作らず、`received/processing/retryable/reconcile_required/completed/dead_letter` の状態に従って同じworkを維持・再開・照合・冪等successとする。結果不明の副作用を照合前に自動再送せず、受理済みworkを黙って失わず、二重Issue・二重entitlementを作らない |
| AC-030 | 共有リンクが期限切れ | 閲覧する | 閲覧できない |
| AC-031 | 共有リンクを失効する | 直後に閲覧する | 閲覧できない |
| AC-040 | Guide Me風再生中 | 対象DOMが見つからない | 勝手に進まず停止し理由を表示する |
| AC-050 | Stripe webhookが重複送信される | 処理する | purchaseまたはsubscription entitlementが二重反映されない |
| AC-051 | manual Aの都度払いが成功している | manual Bをエクスポートする | 権利なしとして拒否され、manual Aだけ30日間再出力できる |
| AC-052 | client_reference_idまたはPriceが改変されている | Stripe webhookを処理する | checkout intentとの照合に失敗し、権利を付与しない |
| AC-053 | パーソナルまたはチームの利用上限に達している | 新しい操作記録、招待、保存を開始する | 自動課金せず停止し、現在量と上限を日本語で表示する |
| AC-054 | Stripe Linkのメールがアプリのログインメールと一致する | workspaceに属さないユーザーが決済する | メール一致だけではworkspace権限を付与しない |
| AC-055 | `BILLING_FEATURE_ENABLED=false` | 新規購入と既存課金objectのWebhookを処理する | 新規Checkout Sessionは作らず、署名済みWebhookと既存契約の解約・返金・reconciliationは継続する |
| AC-056 | 期限後まで未完了・別Session・消費済みcheckout intentへの支払いevent | Webhookを再送する | entitlementを二重付与せず、自動返金queueと運用アラートへ一度だけ登録する。期限内完了後に遅延到着したeventは返金せず正規処理する |
| AC-057 | active/grace/read_onlyのTeam契約がある | メンバー1人または複数人でPersonalへの変更を開始する | Stripe APIへ通信せず `PLAN_CHANGE_UNRESOLVED` で停止する |
| AC-058 | R2使用量が100%で生成済みexportがある | 新規生成と既存成果物downloadを行う | 新規生成は拒否し、期限内の既存成果物downloadは成功する |
| AC-059 | 同じ購入操作のCheckout Session作成が並行実行または応答消失後に再送される | APIとStripeへ再試行する | 同じcheckout intentとStripe Sessionだけを返し、二重の支払い可能Sessionを作らない |
| AC-062 | 同じworkspaceでPersonalとTeamの購入を並行開始する | 両方のSession作成とWebhookを順不同で処理する | subscription用の支払い可能Sessionは1件だけとなり、対象自身を競合扱いせず、別契約へ二重entitlementを付与しない |
| AC-063 | DBへ照合できないsubscription modeの決済が成功する | draft/open/paid invoiceのWebhookを重複・順不同で再送する | entitlementを付与せず、subscription cancelと状態別のdelete/void/refundが冪等に完了して継続請求を残さない |
| AC-060 | AI feature flagがOFF | 手順書を作る | 外部AI APIが呼ばれない |
