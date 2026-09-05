# 要件トレーサビリティ

Status: Accepted

| 要件 | 画面 | API | テーブル | ADR | テスト | Issue |
|---|---|---|---|---|---|---|
| FR-001 | SCR-LOGIN, SCR-SHELL | Access callback/JWT検証, session API | identities, profiles | ADR-0028 | AC-001, AC-003, AC-004, AC-005, Access JWT negative tests, `tests/access-identity.test.mjs`（M1 verifier／actor／identity DI） | #176, EPIC-02, EPIC-03 |
| FR-002 | SCR-WORKSPACE, SCR-SHELL | workspace APIs | workspaces, workspace_members | ADR-0028 | AC-002, AC-006, AC-007, D1 workspace negative tests | #176, EPIC-02, EPIC-03 |
| FR-003 | SCR-MEMBERS, SCR-SHELL | workspace member APIs | workspace_members, identities, profiles | ADR-0028 | AC-007, AC-008, AC-009, AC-014, role/status negative tests | #176, EPIC-02, EPIC-03 |
| FR-004 | SCR-MANUAL-EDITOR（保存済み内容の閲覧プレビューを含む） | `GET/POST /api/workspaces/{id}/manuals`, manual detail/draft/publish/archive APIs | manuals, manual_revisions, manual_steps, audit_logs | ADR-0028, ADR-0004, ADR-0005, DEC-058 | 移行前Supabase／Postgres baseline（D1合格証跡には使用しない）: `tests/manual-api.test.mjs`, `tests/manual-edit-api.test.mjs`, `tests/sql/phase2-manual-archive-test.sql`, `tests/e2e/phase2-manual-editor.spec.mjs`。保存済み閲覧プレビューの未保存入力保持・保存済み版表示・書込みなしを検証。Issue #176 M4のD1 gateでは、作成・編集・公開・次draft・archiveの正常系、別workspace、role/status、ID差し替え、期待version競合、再送、結果不明、batch途中失敗とatomic rollbackをAPI／repository／E2Eで検証する。AC-010の公開版revision作成まで。未ログイン公開URL、物理削除・復元はOQ-028の後続 | #176（M4、未完了）, #63, #64, #65, #74, #80, #82（移行前baseline）, EPIC-06 |
| FR-005 | SCR-MANUAL-EDITOR | manual step append/update/delete/reorder APIs | manual_steps | ADR-0028, ADR-0005 | 移行前Supabase／Postgres baseline（D1合格証跡には使用しない）: `tests/manual-edit-api.test.mjs`, step RPC/RLS/lock SQL tests, `tests/e2e/phase2-manual-editor.spec.mjs`。Issue #176 M4のD1 gateでは、追加・更新・削除・並べ替えの正常系、別workspace、role/status、version／position競合、再送、結果不明、batch途中失敗とatomic rollbackをAPI／repository／E2Eで検証する | #176（M4、未完了）, #64, #65, #74（移行前baseline）, EPIC-06 |
| FR-006 | SCR-MANUAL-EDITOR | local instruction suggestion only; external APIなし | - | ADR-0009 | `tests/manual-instruction-template.test.mjs`, `tests/manual-edit-api.test.mjs`, `tests/e2e/phase2-manual-editor.spec.mjs` | #64, #65, #74, EPIC-06 |
| FR-007 | SCR-CAPTURE-START | capture session APIs（P0 egress検証までは`BROWSER_EGRESS_NOT_VERIFIED`） | browser_sessions, capture_sessions（後続） | ADR-0002, ADR-0003 | AC-020, AC-023, AC-025, `tests/capture-foundation.test.mjs`, `tests/browser-run-egress-proof.test.mjs` | #57, #84, #86, EPIC-04 |
| FR-008 | SCR-CAPTURE-START | 保存可能event正規化 | capture_events（後続） | ADR-0003 | AC-026, `tests/capture-foundation.test.mjs` | #57, #84, EPIC-05 |
| FR-010 | SCR-CAPTURE-START | 入力値非保存境界 | capture_events（後続） | ADR-0003 | AC-021, AC-026, `tests/capture-foundation.test.mjs` | #57, #84, EPIC-05 |
| FR-011 | SCR-MANUAL-EDITOR | 決定的draft step生成（永続化は後続） | manual_revisions, manual_steps（後続RPC） | ADR-0003, ADR-0009 | AC-026, `tests/capture-foundation.test.mjs` | #57, #84, EPIC-05 |
| FR-016 | SCR-MOBILE-PREVIEW | mobile preview session API（P0 egress検証までは`BROWSER_EGRESS_NOT_VERIFIED`） | browser_sessions（後続） | ADR-0002 | AC-024, AC-025, `tests/capture-foundation.test.mjs`, `tests/browser-run-egress-proof.test.mjs` | #57, #84, #86, EPIC-04 |
| FR-012 | SCR-SHARE | share APIs | share_links | ADR-0008 | AC-030 | EPIC-08 |
| FR-019 | SCR-BILLING | billing APIs, webhook | billing_customers, checkout_intents, billing_purchases, subscriptions, payment_events | ADR-0007, ADR-0022, ADR-0023 | AC-050, AC-052, AC-054, AC-055, AC-056, AC-057, AC-059, AC-062, AC-063 | EPIC-10 |
| FR-020 | SCR-AI-SETTINGS | ai settings APIs | feature flags/settings | ADR-0009 | AC-060 | EPIC-14 |
| FR-021 | SCR-BILLING, SCR-USAGE | billing summary, export APIs | entitlements, usage_counters | ADR-0023 | AC-051, AC-053, AC-055, AC-058 | EPIC-10 |
| NFR-007 | SCR-LOGIN, SCR-WORKSPACE, SCR-MEMBERS, SCR-SHELL | - | - | - | AC-012, AC-013, `phase1:a11y:test`, `phase1:e2e:test` | EPIC-03, EPIC-13 |

| NFR-013 | - | `POST /api/v1/cloud-runners/probe`, `POST /api/v1/cloud-runners/jobs/claim`, `POST /api/v1/cloud-runners/events` | Business OS側のexecution target/job/eventを正本とし、本サービスDBへ複製しない | ADR-0026 | `business-os-runner:check`, Business OS Codex Runner contract/probe/reject-path | Business OS #10 |

## Phase 1画面ID

| 画面ID | 目的 | Phase 1で扱う主な状態 |
|---|---|---|
| SCR-LOGIN | ログインと再ログイン | 読込中、送信中、認証失敗、接続失敗、期限切れ |
| SCR-WORKSPACE | 所属ワークスペースの一覧、選択、作成 | 空、読込中、作成中、作成済み、作成失敗、権限不足、接続失敗 |
| SCR-MEMBERS | メンバー一覧とowner/admin/editor/viewerの管理 | 空、読込中、保存中、保存済み、保存失敗、権限不足、last-owner拒否 |
| SCR-SHELL | ログイン後の共通ナビゲーションと状態表示 | 読込中、接続失敗、期限切れ、権限別表示 |

## Phase 2 手順書コア

- 既存のPhase 2 API契約、Postgres migration、RPC/RLS/lockテストは移行前baselineとして保持し、D1合格証跡には使用しない。
- Issue #176 M4では[Cloudflare Access / D1 API移行契約](../05-api/cloudflare-access-d1-api.md)に従い、Worker認可、workspace固定D1 query、D1対応atomic operation、migration、API契約、正常系・越境・競合・再送・結果不明・途中失敗テストを同じPRで追加する。
- 手順追加のposition採番、並べ替え、公開、次draft、archiveはD1のatomic operationとして再実装し、部分成功を許可しない。
- FR-006は将来FR-020が実装されても常にローカル決定的処理とし、外部AI APIへ切り替えない。
- Phase 2でも検証済みAccess主体、active membership/role、resource workspace、期待versionをWorkerで毎回照合し、Access到達やUI表示を認可根拠にしない。
- AC-010の公開版revision作成はIssue #176 M4、公開URL閲覧は共有機能の後続マイルストーンで扱う。

Phase 1/2の移行実装では、画面、API、Worker認可、D1 schema/query、受入テスト、トレーサビリティを同じPRで更新する。
