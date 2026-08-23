# リスク登録簿

Status: Accepted

| ID | リスク | 影響 | 予防策 |
|---|---|---|---|
| RISK-001 | Browser Runが対象サイトにbot扱いされる | 操作記録不可 | 対応できない条件を明記、接続テストを実装 |
| RISK-002 | 社内IP制限/社内DNSで対象サイトに入れない | 業務利用不可 | 公開HTTPSを正式サポート範囲にする |
| RISK-003 | 入力値や個人情報が保存される | P0情報漏えい | 入力値非保存、マスキング、公開前確認 |
| RISK-004 | RLS抜け | P0テナント越境 | deny-by-default、negative test |
| RISK-005 | 共有リンク失効が遅れる | P0情報漏えい | Worker検証、キャッシュ制御 |
| RISK-006 | AI APIコストが発生する | 予期せぬ請求 | 初期OFF、feature flag、利用上限 |
| RISK-007 | サブエージェントが矛盾した実装をする | 品質低下 | 文書正本、Issue分解、統合担当固定 |
| RISK-008 | 定数/設定が散らばる | 保守不能 | coding-guidelines、リファクタリングレビュー |
| RISK-009 | PDF/HTML出力でぼかしが外れる | 情報漏えい | golden test、目視確認 |
| RISK-010 | Stripe webhook重複反映 | 誤課金/誤権限 | idempotency、一意制約 |
| RISK-011 | stagingとproductionの外部設定取り違え | 本番データ変更/誤課金 | GitHub Environment対応表、target/commit再確認、production手動承認 |
| RISK-012 | R2削除失敗でobjectが残留する | 機密情報残留/費用増加 | URL即時停止、非同期削除再試行、asset単位の監査 |
| RISK-013 | Stripe webhookの順不同・遅延で古い状態へ戻る | 誤ったentitlement | object単位reconciliation、冪等処理、状態遷移テスト |
| RISK-014 | Browser session終了失敗でcredentialやCookieが残る | P0情報漏えい | Live View失効、close再試行、期限切れ、監査alarm |
| RISK-015 | 都度払いの権利を別workspaceまたは別manualへ付与する | P0越境/誤権限 | checkout intentへworkspace/manualを固定し、PriceとWebhookを照合する |
| RISK-016 | Stripe Linkのメール一致をアプリ認証と誤認する | P0アカウント誤紐付け | Linkを入力支援に限定し、Supabase sessionとcheckout intentを正本にする |
| RISK-017 | Browser RunやStorageの計測誤差で追加請求する | 誤課金/信用失墜 | 初期は自動従量課金せず、上限停止と再集計フローを採用する |
| RISK-018 | DNS検査後にBrowser Runが再解決しprivate IPへ接続する | P0内部ネットワーク到達 | 検査済みIPへの実接続拘束、全通信種別のegress negative test、実現不能時は任意URL・承認済みhost・mobile previewを含む全Browser Runをfail closed |
| RISK-019 | 並行開始・保存でBrowser Run時間またはR2容量を上限超過する | 原価超過/保存失敗 | 利用前に原子的予約し、成功時確定、失敗時解放、Browser Runはhard deadlineで終了する |
