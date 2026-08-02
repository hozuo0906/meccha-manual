# 要件トレーサビリティ

Status: Proposed

| 要件 | 画面 | API | テーブル | ADR | テスト | Issue |
|---|---|---|---|---|---|---|
| FR-001 | SCR-LOGIN | auth callbacks | profiles | ADR-0004 | AC-001 | EPIC-02 |
| FR-002 | SCR-WORKSPACE | workspace APIs | workspaces, workspace_members | ADR-0004 | AC-002 | EPIC-02 |
| FR-004 | SCR-MANUAL-EDITOR | manual APIs | manuals, manual_revisions, manual_steps | ADR-0006 | AC-010 | EPIC-06 |
| FR-007 | SCR-CAPTURE-START | capture session APIs | browser_sessions, capture_sessions | ADR-0002 | AC-020 | EPIC-04 |
| FR-012 | SCR-SHARE | share APIs | share_links | ADR-0008 | AC-030 | EPIC-08 |
| FR-019 | SCR-BILLING | billing APIs, webhook | billing_customers, subscriptions, payment_events | ADR-0007, ADR-0022 | AC-050 | EPIC-10 |
| FR-020 | SCR-AI-SETTINGS | ai settings APIs | feature flags/settings | ADR-0009 | AC-060 | EPIC-14 |

この表は実装開始時に各Phaseの詳細Issueへ展開します。
