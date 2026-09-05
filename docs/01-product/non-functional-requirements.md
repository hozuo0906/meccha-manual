# 非機能要件

Status: Accepted

| ID | 分類 | 要件 |
|---|---|---|
| NFR-001 | セキュリティ | 全tenant業務データは、検証済みAccess主体とactiveなworkspace membership／roleをWorkerで毎回照合し、workspace固定D1 query、D1制約、private R2 object認可で分離する。Access到達だけを認可根拠にしない |
| NFR-002 | セキュリティ | Access service token、Cloudflare／Stripeのsecret、Browser権限情報をクライアントへ渡さない。Access JWTをブラウザJavaScriptへ複製せず、D1／R2はWorker bindingからのみ操作する |
| NFR-003 | セキュリティ | private IP、localhost、metadata endpoint、危険スキームを拒否し、検査済みIPへの実接続拘束を全Browser通信へ適用する |
| NFR-004 | プライバシー | 入力値、Cookie、Authorization、カード情報、個人番号を保存しない |
| NFR-005 | 可用性 | 記録中に切断しても保存済み地点を表示し、再接続できる |
| NFR-006 | 性能 | 手順100件の手順書でも閲覧とPDF出力が破綻しない |
| NFR-007 | アクセシビリティ | WCAG 2.2 AAを目標にする |
| NFR-008 | 監査 | 公開、共有、削除、権限、課金、機密設定変更を監査ログに残す |
| NFR-009 | 課金 | Stripe webhookの重複、遅延、順不同に耐える |
| NFR-010 | AI | 初期状態で外部AI APIを呼ばず、AIコストを発生させない |
| NFR-011 | 運用 | 本番同等環境でsmoke test、監視、ロールバック手順を持つ |
| NFR-012 | 地域 | Cloudflare Access、D1、R2、Browser Runの処理・保存地域はOQ-012／OQ-021として公開前およびproduction D1作成前に確認し、保証できない範囲を明記する |
| NFR-013 | 運用・セキュリティ | Business OSからのcloud実行は、登録済みrepositoryとworkflow、承認済み署名job、期限、予算、operation、書込pathを検証し、main直接push、production deploy、DB migration、secret変更を許可しない |
