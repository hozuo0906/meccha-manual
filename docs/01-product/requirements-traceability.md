# 要件トレーサビリティ

Status: Accepted

| 要件 | 画面 | API | テーブル | ADR | テスト | Issue |
|---|---|---|---|---|---|---|
| FR-001 | SCR-LOGIN, SCR-SHELL | auth callbacks, session API | profiles | ADR-0004, ADR-0010 | AC-001, AC-003, AC-004, AC-005 | EPIC-02, EPIC-03 |
| FR-002 | SCR-WORKSPACE, SCR-SHELL | workspace APIs | workspaces, workspace_members | ADR-0004, ADR-0010 | AC-002, AC-006, AC-007 | EPIC-02, EPIC-03 |
| FR-003 | SCR-MEMBERS, SCR-SHELL | workspace member APIs | workspace_members, profiles | ADR-0004 | AC-007, AC-008, AC-009, AC-014 | EPIC-02, EPIC-03 |
| FR-004 | SCR-MANUAL-EDITOR | manual APIs | manuals, manual_revisions, manual_steps | ADR-0006 | AC-010 | EPIC-06 |
| FR-007 | SCR-CAPTURE-START | capture session APIs | browser_sessions, capture_sessions | ADR-0002 | AC-020, AC-023, AC-025 | EPIC-04 |
| FR-016 | SCR-MOBILE-PREVIEW | mobile preview session API | browser_sessions | ADR-0002 | AC-024, AC-025 | EPIC-04 |
| FR-012 | SCR-SHARE | share APIs | share_links | ADR-0008 | AC-030 | EPIC-08 |
| FR-019 | SCR-BILLING | billing APIs, webhook | billing_customers, checkout_intents, billing_purchases, subscriptions, payment_events | ADR-0007, ADR-0022, ADR-0023 | AC-050, AC-052, AC-054, AC-055, AC-056, AC-057, AC-059, AC-062, AC-063 | EPIC-10 |
| FR-020 | SCR-AI-SETTINGS | ai settings APIs | feature flags/settings | ADR-0009 | AC-060 | EPIC-14 |
| FR-021 | SCR-BILLING, SCR-USAGE | billing summary, export APIs | entitlements, usage_counters | ADR-0023 | AC-051, AC-053, AC-055, AC-058 | EPIC-10 |
| NFR-007 | SCR-LOGIN, SCR-WORKSPACE, SCR-MEMBERS, SCR-SHELL | - | - | - | AC-012, AC-013 | EPIC-03, EPIC-13 |

## Phase 1画面ID

| 画面ID | 目的 | Phase 1で扱う主な状態 |
|---|---|---|
| SCR-LOGIN | ログインと再ログイン | 読込中、送信中、認証失敗、接続失敗、期限切れ |
| SCR-WORKSPACE | 所属ワークスペースの一覧、選択、作成 | 空、読込中、作成中、作成済み、作成失敗、権限不足、接続失敗 |
| SCR-MEMBERS | メンバー一覧とowner/admin/editor/viewerの管理 | 空、読込中、保存中、保存済み、保存失敗、権限不足、last-owner拒否 |
| SCR-SHELL | ログイン後の共通ナビゲーションと状態表示 | 読込中、接続失敗、期限切れ、権限別表示 |

Phase 1の実装では、上記の各行を詳細Issueへ展開し、画面、API、RLS、受入テストを同じPRで更新する。Phase 2以降の行も、実装開始前に同じ粒度へ展開する。
