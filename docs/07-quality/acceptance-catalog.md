# 受入条件カタログ

Status: Proposed

| ID | Given | When | Then |
|---|---|---|---|
| AC-001 | ログイン済みユーザー | ログアウトする | 保護画面にアクセスできない |
| AC-002 | A社ユーザー | B社のmanual IDを指定する | APIとDBで拒否される |
| AC-010 | editorユーザー | 手動で手順書を作成して公開する | 公開URLで公開版を閲覧できる |
| AC-011 | 公開版が存在する | 下書きを編集する | 公開版の内容は変わらない |
| AC-020 | editorユーザー | 操作記録を開始する | Browser sessionが作成されLive View URLを取得できる |
| AC-021 | 記録中 | password欄へ入力する | 入力値はDB/ログ/Storageに保存されない |
| AC-022 | 記録中 | 危険URLへ遷移しようとする | SSRF防止で拒否される |
| AC-023 | DNS検査ではpublic IPを返す対象host | 実接続時またはsubresourceでprivate IPへrebindする | actual peerへの接続前に拒否され、任意URL機能がfail closedになる |
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
