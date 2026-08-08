# 非機能要件

Status: Accepted

| ID | 分類 | 要件 |
|---|---|---|
| NFR-001 | セキュリティ | 全テナントデータはRLSで分離する |
| NFR-002 | セキュリティ | Supabase service role、Stripe secret、Browser権限情報をクライアントに渡さない |
| NFR-003 | セキュリティ | private IP、localhost、metadata endpoint、危険スキームを拒否し、検査済みIPへの実接続拘束を全Browser通信へ適用する |
| NFR-004 | プライバシー | 入力値、Cookie、Authorization、カード情報、個人番号を保存しない |
| NFR-005 | 可用性 | 記録中に切断しても保存済み地点を表示し、再接続できる |
| NFR-006 | 性能 | 手順100件の手順書でも閲覧とPDF出力が破綻しない |
| NFR-007 | アクセシビリティ | WCAG 2.2 AAを目標にする |
| NFR-008 | 監査 | 公開、共有、削除、権限、課金、機密設定変更を監査ログに残す |
| NFR-009 | 課金 | Stripe webhookの重複、遅延、順不同に耐える |
| NFR-010 | AI | 初期状態で外部AI APIを呼ばず、AIコストを発生させない |
| NFR-011 | 運用 | 本番同等環境でsmoke test、監視、ロールバック手順を持つ |
| NFR-012 | 地域 | Supabaseは東京リージョンを第一候補とし、Cloudflare Browser Runのグローバル処理可能性を明記する |
