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
| AC-030 | 共有リンクが期限切れ | 閲覧する | 閲覧できない |
| AC-031 | 共有リンクを失効する | 直後に閲覧する | 閲覧できない |
| AC-040 | Guide Me風再生中 | 対象DOMが見つからない | 勝手に進まず停止し理由を表示する |
| AC-050 | Stripe webhookが重複送信される | 処理する | entitlementが二重反映されない |
| AC-060 | AI feature flagがOFF | 手順書を作る | 外部AI APIが呼ばれない |
