# 要件トレーサビリティ

Status: Accepted

| 要件 | 画面 | API | テーブル | ADR | テスト | Issue |
|---|---|---|---|---|---|---|
| FR-001 | SCR-LOGIN, SCR-SHELL | Access callback/JWT検証、`GET /api/session`、Access logout／再認証導線 | identities, profiles | ADR-0028 | AC-001, AC-003, AC-004, AC-005、`tests/access-identity.test.mjs`（M1 verifier／actor／identity DI）、`tests/m3-http-d1.test.mjs`（session／logout HTTP path）、`tests/app-auth.test.mjs`（Access JWT終端401の共有version通知、versionなし終端後の旧version遅着抑止と新version復帰、兄弟タブの遅着破棄・再通知抑止、403主体拒否、503一時障害、Access logout分類） | #176, EPIC-02, EPIC-03 |
| FR-002 | SCR-WORKSPACE, SCR-SHELL | `GET/POST /api/workspaces`、session API | workspaces, workspace_members | ADR-0028 | AC-002, AC-006, AC-007、`tests/m3-http-d1.test.mjs`（D1 profile／workspace、unknown／disabled／service actor拒否、作成batch直前の主体失効）、`tests/app-auth.test.mjs`（一覧更新の権限・一時障害・認証状態、workspace作成の主体失効403と通常business403のUI分離） | #176, EPIC-02, EPIC-03 |
| FR-003 | SCR-MEMBERS, SCR-SHELL | workspace member APIs（M3では旧member APIをmigration fence） | workspace_members, identities, profiles | ADR-0028 | AC-007, AC-008, AC-009, AC-014、`tests/m3-http-d1.test.mjs`（旧member APIの503停止とSupabase fallbackなし、Access主体拒否）、role/status negative tests、`tests/app-auth.test.mjs`（認証変更後の遅着PATCH／一覧応答破棄）。D1メンバー管理本体とUI有効化はM3の提供範囲外。 | #176, EPIC-02, EPIC-03 |
| FR-004 | SCR-MANUAL-EDITOR（保存済み内容の閲覧プレビューを含む） | manual API（M3ではmigration fence） | manuals, manual_revisions, manual_steps, audit_logs | ADR-0028, ADR-0004, ADR-0005, DEC-058 | M3では手順書API／UIを`503 MANUAL_MIGRATION_IN_PROGRESS`で停止する契約とUI停止を確認し、D1本体は未提供。移行前Supabase／Postgres baseline（D1合格証跡には使用しない）: `tests/manual-api.test.mjs`, `tests/manual-edit-api.test.mjs`, `tests/sql/phase2-manual-archive-test.sql`, `tests/e2e/phase2-manual-editor.spec.mjs`。保存済み閲覧プレビューの未保存入力保持・保存済み版表示・書込みなしを検証。Issue #176 M4のD1 gateでは、作成・編集・公開・次draft・archiveの正常系、別workspace、role/status、ID差し替え、期待version競合、再送、結果不明、batch途中失敗とatomic rollbackをAPI／repository／E2Eで検証する。AC-010の公開版revision作成まで。未ログイン公開URL、物理削除・復元はOQ-028の後続 | #176（M4、未完了）, #63, #64, #65, #74, #80, #82（移行前baseline）, EPIC-06 |
| FR-005 | SCR-MANUAL-EDITOR | manual step append/update/delete/reorder APIs | manual_steps | ADR-0028, ADR-0005 | 移行前Supabase／Postgres baseline（D1合格証跡には使用しない）: `tests/manual-edit-api.test.mjs`, step RPC/RLS/lock SQL tests, `tests/e2e/phase2-manual-editor.spec.mjs`。Issue #176 M4のD1 gateでは、追加・更新・削除・並べ替えの正常系、別workspace、role/status、version／position競合、再送、結果不明、batch途中失敗とatomic rollbackをAPI／repository／E2Eで検証する | #176（M4、未完了）, #64, #65, #74（移行前baseline）, EPIC-06 |
| FR-006 | SCR-MANUAL-EDITOR | local instruction suggestion only; external APIなし | - | ADR-0009 | `tests/manual-instruction-template.test.mjs`, `tests/manual-edit-api.test.mjs`, `tests/e2e/phase2-manual-editor.spec.mjs` | #64, #65, #74, EPIC-06 |
| FR-007 | SCR-CAPTURE-START | capture session APIs（P0 egress検証までは`BROWSER_EGRESS_NOT_VERIFIED`） | browser_sessions, capture_sessions（後続） | ADR-0002, ADR-0003 | AC-020, AC-023, AC-025、Access認証・D1 identity・workspace role先行認可、`tests/capture-foundation.test.mjs`、`tests/callback-migration-boundary.test.mjs` | #57, #84, #86, #176, EPIC-04 |
| FR-008 | SCR-CAPTURE-START | 保存可能event正規化 | capture_events（後続） | ADR-0003 | AC-026, `tests/capture-foundation.test.mjs` | #57, #84, EPIC-05 |
| FR-010 | SCR-CAPTURE-START | 入力値非保存境界 | capture_events（後続） | ADR-0003 | AC-021, AC-026, `tests/capture-foundation.test.mjs` | #57, #84, EPIC-05 |
| FR-011 | SCR-MANUAL-EDITOR | 決定的draft step生成（永続化は後続） | manual_revisions, manual_steps（後続RPC） | ADR-0003, ADR-0009 | AC-026, `tests/capture-foundation.test.mjs` | #57, #84, EPIC-05 |
| FR-016 | SCR-MOBILE-PREVIEW | mobile preview session API（P0 egress検証までは`BROWSER_EGRESS_NOT_VERIFIED`） | browser_sessions（後続） | ADR-0002 | AC-024, AC-025、Access認証・D1 identity・workspace role先行認可、`tests/capture-foundation.test.mjs`、`tests/callback-migration-boundary.test.mjs` | #57, #84, #86, #176, EPIC-04 |
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

## Issue #176 M3 HTTP/D1 evidence

M3の現行API契約は[Cloudflare Access / D1 API移行契約](../05-api/cloudflare-access-d1-api.md)を正本とし、次の対応を同じheadで確認する。

- 認証・workspace・member: Access JWT検証、D1 identity解決、workspace固定query、`GET /api/session`、`GET/POST /api/workspaces`、`POST /api/auth/logout`を`tests/m3-http-d1.test.mjs`で検証する。旧member APIはM3で`503`停止し、Supabase fallbackしないことを同テストで確認する。unknown／disabled identityとservice-token actorは403、Access JWTなし／不正は401、鍵取得・D1障害は503として区別する。D1メンバー管理本体はM3の提供範囲外である。
- 画面状態: `tests/app-auth.test.mjs`でAccess JWTの401は共有認証versionを更新して兄弟タブへ通知し、旧workspace・手順書・メンバー状態を破棄してAccess再認証へ遷移し、遅着in-flight応答が復元・再通知しないことを検証する。Access actor拒否403は再認証へ混同せず旧シェルを破棄し、一時503は表示中一覧と編集中入力を保持して再試行できること、workspace作成時の主体拒否403もcurrentSessionと保護shellを破棄し通常business403とは分離することを検証する。Access logoutは開始・成功・結果不明を同じversionの再認証通知で兄弟タブに伝え、session再取得や遅着成功によるshell復活を許さず、currentSession消去後もAccess方式を保ちpassword formへ戻らないことを検証する。
- capture/mobile preview: same-origin、Access JWT、D1 identity、workspace roleの順で認可し、認証・認可エラーと`503 BROWSER_EGRESS_NOT_VERIFIED`を`tests/callback-migration-boundary.test.mjs`、`tests/capture-foundation.test.mjs`で検証する。`tests/m3-http-d1.test.mjs`はcapture実行ではなく、共通Access認証とD1主体解決の補助証跡である。

商用実証、staging成功、production migration／deployはこの差分では実施・記録していない。
