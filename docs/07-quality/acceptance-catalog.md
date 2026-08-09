# 受入条件カタログ

Status: Accepted

| ID | Given | When | Then |
|---|---|---|---|
| AC-001 | ログイン済みユーザー | ログアウトする | 保護画面にアクセスできない |
| AC-002 | A社ユーザー | B社のworkspace IDを一覧API、取得API、Supabase RESTへ指定する | APIとDBで拒否され、B社の存在を推測できる情報を返さない |
| AC-003 | 有効な認証情報を持つユーザー | SCR-LOGINからログインする | tokenをブラウザJavaScriptへ返さずSCR-SHELLと所属ワークスペースを表示する |
| AC-004 | 未入力または無効な認証情報 | SCR-LOGINからログインする | ログインせず、何が起きたかと次の操作を日本語で表示し、エラーへフォーカスを移す |
| AC-005 | access tokenとrefresh tokenが失効または破損している | 保護画面または保護APIへアクセスし、その後再ログインする | 接続障害と区別した期限切れ案内を表示し、保護データを残さず、再ログイン後に利用を再開できる |
| AC-006 | 認証済みユーザー | `create_workspace`でワークスペースを作成する | 作成者をactiveなownerとして同じtransactionで登録し、ワークスペースに属さない業務データを作らない |
| AC-007 | A社メンバー | B社のworkspace memberを一覧、追加、更新しようとする | APIとRLSの両方で拒否され、B社のメンバー情報を返さない |
| AC-008 | owner、admin、editor、viewerが存在する | メンバーの一覧、追加、ロール変更、停止を行う | owner/adminの許可操作だけが成功し、editor/viewerの変更操作はAPIとRLSで拒否され、ownerロールの付与・移管は専用の決定済みフローがない限り拒否される |
| AC-009 | activeなownerが1人だけ存在する | そのownerを停止、削除、またはowner以外へ変更する | APIとDBで拒否し、ワークスペースにactiveなownerを1人以上維持する |
| AC-010 | editorユーザー | 手動で手順書を作成して公開する | 公開URLで公開版を閲覧できる |
| AC-011 | 公開版が存在する | 下書きを編集する | 公開版の内容は変わらない |
| AC-012 | SCR-LOGIN、SCR-WORKSPACE、SCR-MEMBERS、SCR-SHELLを利用する | 読込、保存、失敗、権限不足、接続切断、期限切れが発生する | 該当する状態を区別して表示し、完了済み範囲と次の操作を日本語で案内する |
| AC-013 | キーボード、200%ズーム、スクリーンリーダー相当の検査環境 | Phase 1の主要操作を完了する | WCAG 2.2 AAを目標とする自動検査に重大違反がなく、フォーカス順、可視フォーカス、ラベル、エラー関連付け、状態通知、44px操作領域を手動確認できる |
| AC-014 | owner、admin、editor、viewerの各ユーザー | SCR-SHELLとSCR-MEMBERSを表示し、URLまたはAPIを直接指定する | UIはロールで許可された操作だけを有効表示し、非表示や無効表示に関係なくAPIとRLSが不許可操作を拒否する |
| AC-015 | ログイン済みユーザー | ログアウト要求で通信切断または中継側の非JSONエラーとなり、WorkerのCookie削除レスポンスを確認できない | ログイン画面へ遷移せず現在のセッション表示を維持し、ログアウト未完了と再試行を日本語で案内する |
| AC-016 | 同一ブラウザの複数タブでログイン主体の切替、workspace作成、一覧更新が並行する | 古いsession・作成・一覧応答または失敗が新しい応答より後に到着する | 認証変更時は旧shellを即座に隠し、現在Cookieのユーザーと最新一覧だけを表示して、別ユーザーのworkspace情報・作成前一覧・古い失敗表示で上書きしない。作成POST成功後の一覧再取得失敗は作成済みと明示する |
| AC-020 | editorユーザーかつ `capture.browserRun.egressVerified.enabled=true`、P0検証済み | 操作記録を開始する | Browser sessionが作成されLive View URLを取得できる |
| AC-021 | 記録中 | password欄へ入力する | 入力値はDB/ログ/Storageに保存されない |
| AC-022 | 記録中 | 危険URLへ遷移しようとする | SSRF防止で拒否される |
| AC-023 | DNS検査ではpublic IPを返す対象host、またはegressを迂回するWebRTC/WebTransport fixture | 承認済みhostへの実接続、subresource、直接通信を開始する | HTTP/TLS/application bytes送信前にactual peerで拒否され、1経路でも拘束不能ならBrowser Run起動・navigateが `BROWSER_EGRESS_NOT_VERIFIED` でfail closedになる |
| AC-024 | editorユーザーかつegress P0検証未完了 | mobile previewを開始する | Browser Runへ通信せず `BROWSER_EGRESS_NOT_VERIFIED` で拒否される |
| AC-025 | Browser Runセッション稼働中 | egress迂回発覚により検証済みflagをfalseへ戻す | 既存egressを即時遮断し、Live View失効・再発行拒否・全session終了を行う |
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
