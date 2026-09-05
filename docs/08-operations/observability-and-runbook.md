# 監視とRunbook

Status: Proposed

## 監視対象

- Worker error rate
- Browser Run session start failure
- Capture session failure
- Storage upload failure
- Cloudflare Access authentication failure rate
- Worker authorization / D1 workspace denial rate
- Stripe webhook failure
- Share link access denial
- PDF/export failure
- AI adapter calls

## ログ方針

ログに秘密値、入力値、共有生トークン、Live View URL、スクリーンショット本体を出しません。

## 障害時対応

- P0情報漏えいの疑い: 共有リンク失効、関連セッション破棄、secret rotation要否判断。
- Browser Run障害: 新規記録停止、既存セッションの保存済み地点を通知。
- Stripe障害: Webhook再送とidempotency確認。
- D1/R2/Worker障害: 読み書き停止範囲を明示し、復旧後にmetadata/object/監査の整合性を確認。
