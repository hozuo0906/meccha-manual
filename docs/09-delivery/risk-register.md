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
