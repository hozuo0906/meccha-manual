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
| AC-055 | `BILLING_FEATURE_ENABLED=false` | 課金導線またはcheckout intent APIを操作する | Payment Linkを返さず、Stripe API通信が0件である |
| AC-060 | AI feature flagがOFF | 手順書を作る | 外部AI APIが呼ばれない |
