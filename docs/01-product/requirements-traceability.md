# 要件トレーサビリティ

Status: Accepted

## 現行MVP

Chrome拡張first、guest-first onboarding、PC/スマホ/タブレットresponsive captureの現行MVPは次を正とする。

| 要件 | 画面/Surface | API | Data | ADR | 受入・テスト | Delivery |
|---|---|---|---|---|---|---|
| FR-001 | OUTPUT-GATE, Access認証 | Access JWT検証、`POST /api/onboarding/bootstrap` | identities, profiles | ADR-0028, ADR-0032 | MVP-AC-007, 008, 009 | Extension MVP / EPIC-02 |
| FR-002 | 認証後はPersonal Workspace自動準備 | `POST /api/onboarding/bootstrap` | workspaces, workspace_members, identities, profiles | ADR-0028, ADR-0032 | MVP-AC-008, 009 | Extension MVP / EPIC-02 |
| FR-003 | Team設定 | workspace member APIs | workspace_members | ADR-0028, ADR-0025 | AC-007, AC-008, AC-009, AC-014 | NEXT / EPIC-02 |
| FR-004 | Manual editor | manual APIs | manuals, manual_revisions, manual_steps | ADR-0028, ADR-0005 | AC-010, AC-011, AC-017、Phase2 manual tests | EPIC-06 |
| FR-005 | Manual editor | manual step APIs | manual_steps | ADR-0028, ADR-0005 | manual edit/reorder tests | EPIC-06 |
| FR-006 | Manual editor | local deterministic suggestion | - | ADR-0009 | manual instruction template tests | EPIC-06 |
| FR-007 | Chrome Extension | extension local capture + 認証後claim API | guest local capture state, 認証後manual | ADR-0031 | MVP-AC-002, 016 | Extension MVP / EPIC-05 |
| FR-008 | Chrome Extension | local event normalization | guest local event state | ADR-0031 | MVP-AC-002, 004, 005 | Extension MVP / EPIC-05 |
| FR-009 | Chrome Extension + Manual | 認証後asset upload / Worker proxy read | local guest assets, private R2 after claim | ADR-0006, ADR-0011, ADR-0031, ADR-0032 | MVP-AC-005, 010, 011 | Extension MVP / EPIC-05 |
| FR-010 | Chrome Extension | local normalization / claim validation | - | ADR-0031 | MVP-AC-004 | Extension MVP / EPIC-05 |
| FR-011 | Chrome Extension editor | local draft generator / claim | guest local draft, manual_revisions after claim | ADR-0009, ADR-0031, ADR-0032 | MVP-AC-005, 006, 010、`tests/extension-editor-browser.test.mjs` | Extension MVP / EPIC-05/06 |
| FR-012 | Output gate / Share | share APIs after auth+claim | share_links | ADR-0008, ADR-0032 | MVP-AC-012, AC-030, AC-031 | MVP / EPIC-08 |
| FR-013 | Public share viewer | share read API | share_links | ADR-0008 | AC-030, AC-031 | MVP / EPIC-08 |
| FR-014 | Output gate / PDF | PDF export API after auth+claim | exports / entitlements when enabled | ADR-0032, ADR-0033 | MVP-AC-007, 013, 019、PDF export tests | MVP / EPIC-08 |
| FR-015 | Guide Me | replay APIs | - | - | AC-040 | DEFERRED / EPIC-08 |
| FR-016 | Chrome Extension mode selector | local responsive window control | local capture mode only | ADR-0031 | MVP-AC-003, 015 | MVP / Extension MVP |
| FR-017 | Analytics | product/share event APIs | product events / share analytics | ADR-0030 | `docs/05-api/product-events.md`, MVP-AC-017, 018 | NEXT / EPIC-11 |
| FR-018 | Feedback | comment/report APIs | comments | - | 後続AC | DEFERRED / EPIC-09 |
| FR-019 | Billing | billing APIs, Stripe webhook | billing_customers, checkout_intents, subscriptions, payment_events | ADR-0007, ADR-0022, ADR-0023, ADR-0033 | AC-050, AC-052, AC-054, AC-055, AC-056, AC-057, AC-059, AC-062, AC-063 | NEXT / EPIC-10 |
| FR-020 | AI settings | ai settings APIs | feature flags/settings | ADR-0009 | AC-060 | DEFERRED / EPIC-14 |
| FR-021 | Billing / Usage | billing summary / entitlement APIs | entitlements, usage_counters | ADR-0023, ADR-0033 | AC-051, AC-053, AC-055, AC-058 | NEXT / EPIC-10 |
| FR-022 | Chrome Extension guest editor / Output gate | `POST /api/onboarding/bootstrap`, claim intent、authenticated staged asset PUT、guest claim | guest local IndexedDB等、`workspaces.workspace_kind`、認証後manual/private R2 | ADR-0031, ADR-0032 | MVP-AC-005〜013、Personal Workspace uniqueness／asset retry negative tests | MVP / Extension MVP |
| FR-023 | Markdown / HTML export | export APIs after auth+claim | exports / entitlements when enabled | ADR-0033 | 形式別export tests when enabled | NEXT / EPIC-08 |
| NFR-007 | Login, extension, editor, share | - | - | - | a11y / keyboard / focus tests | EPIC-13 |
| NFR-013 | - | Business OS cloud runner contracts | Business OS側正本 | ADR-0026 | business-os-runner checks | Business OS #10 |

## セルフサーブbootstrap境界

FR-001 / FR-002の商用MVPは、従来の `SCR-WORKSPACE -> POST /api/workspaces` を初回利用者に要求しない。

`docs/05-api/guest-onboarding-and-claim-api.md` を正本とし、output gateで認証された検証済みhuman Access actorについて、issuer+subject単位でidentity/profile/Personal Workspace/active owner membershipをatomicかつ冪等に準備する。

既存の手動workspace作成APIはTeam/管理用途や既存動作として残してよいが、初回Activationの前提にしない。

FR-001 / FR-002 の atomic bootstrap の保存境界は、D1 migration `0003_d1_onboarding_bootstrap.sql` の `onboarding_bootstrap_operations`（application identity、operation、Personal Workspace、`created_identity`、identity作成時刻との一致、identity作成を示すoperationの一意性）と、`onboarding_signup_events`（server生成 `signup_completed`）で固定する。正常な初回作成、同一operation再送、異なるoperationの並行再送、失敗時rollbackは `tests/onboarding-bootstrap.test.mjs` と `tests/d1-binding.test.mjs` で検証する。

FR-017 は同じoperationの結果からserverが生成する `onboarding_signup_events` を対象とし、event ID・operation ID・workspace・authoritative timestampの一致、created identity以外からの直接挿入、envelope改変・削除を同migrationのD1 triggerと `tests/onboarding-bootstrap.test.mjs` で検証する。product eventの命名・payload正本は `docs/05-api/product-events.md` に従う。

## Product Event

FR-017およびProduct KPIのイベント名称、発行条件、payload、重複排除は `docs/05-api/product-events.md` を唯一の正本とする。

オンボーディング、product requirements、実装コードが別名eventを独自追加しない。

## Chrome拡張responsive capture

FR-007 / FR-008 / FR-010 / FR-011 / FR-016 / FR-022はADR-0031を正とする。

- MVP capture runtimeはChrome拡張のみ。
- PC / smartphone / tabletの3表示モードを必須とする。
- smartphone / tabletはdesktop Chrome responsive viewportで実現する。
- 終了失敗後の再試行では永続化された`finish_failed` phaseを正として、選択済みのsmartphone / tablet responsive viewportを再適用してscreenshotを生成する。
- MVPでは`debugger` permissionを要求しない。
- guest contentは認証前にD1/R2へ送らない。
- clickのevent labelは固定semantic値へ正規化し、`aria-label`、関連label、placeholder、本文をevent／local draftへ保存しない。navigationはstorage二重障害時も同一session単位のfallbackから後続のevent／draftへ一度だけmergeする。
- scroll baselineは記録開始時に既存要素の位置をseedし、動的に追加された未知要素は初回位置を推測せずseedだけ行い、次の差分から方向を記録する。

## Browser Run legacy traceability

以下は過去のBrowser Run設計を削除せず追跡するためのLegacy行であり、現行MVPのFR-007/FR-016実装先ではない。Browser Runが無効な間はMVPリリースGateをブロックしない。

| Legacy requirement | Screen | API | Data | ADR | AC | Issue |
|---|---|---|---|---|---|---|
| FR-007 Legacy | SCR-CAPTURE-START | capture session APIs | browser_sessions, capture_sessions | ADR-0002 | AC-020, AC-023, AC-025 | #57, #84, #86, EPIC-04 |
| FR-016 Legacy | SCR-MOBILE-PREVIEW | mobile preview session API | browser_sessions | ADR-0002 | AC-024, AC-025 | #57, #84, #86, EPIC-04 |

Compatibility marker for the legacy harness checker:

`| FR-007 | SCR-CAPTURE-START | capture session APIs | browser_sessions, capture_sessions | ADR-0002 | AC-020, AC-023, AC-025 |`

`| FR-016 | SCR-MOBILE-PREVIEW | mobile preview session API | browser_sessions | ADR-0002 | AC-024, AC-025 |`

## Cloudflare Access / D1移行baseline

Issue #176のM1〜M4で実装・検証済みのAccess JWT、identity、workspace固定query、D1 atomic write、manual競合・越境テストは、Chrome拡張firstへ変更してもサーバー安全境界として継承する。

旧Supabase/Postgres Phase 1/2実装は移行前baselineであり、D1合格証跡としては使用しない。

商用MVPではCloudflare移行の完了数そのものではなく、guest captureからoutput完了までの利用者価値縦切りと必要なserver安全境界をProduct優先度とする。

## B登録UIスライスの状態

FR-001、FR-002、FR-022のB範囲（output gate、handoff metadata、同一operationIdのbootstrap retry、local原本保持）は実装対象とする。owner限定staging配布版は明示したstaging originだけへ接続し、production・preview・localhost等のoriginは拒否する。配布設定・unit／browser回帰は実装済みとして追跡するが、実Chromeへ導入したstaging通し確認の成否は別の証跡で判定する。guest本文のclaim、asset transfer、完了通知、元outputの再開はC以降の未完了範囲である。

owner pilotのruntime境界は、`wrangler.onboarding.jsonc`、`inspectAppRuntimeConfig`、`tests/onboarding-ui.test.mjs`で追跡する。`APP_ENV`と環境別完全一致originの欠落・不一致、staging originの許可、production placeholderのfail-closedを検証し、既存legacy Supabase runtimeをこのB証跡へ流用しない。
### B handoff期限の受入境界

FR-001、FR-002、FR-022のB実装では、明示された不正／空／重複fragmentの保存値フォールバック拒否、handoff訪問時刻を起点とする15分TTL、期限切れ後の追加request・operationId再発行0回を、`tests/onboarding-ui-browser.test.mjs` の実ブラウザ回帰テストで検証する。期限内の503後reloadは同一operationIdを再利用する既存テストを維持する。
### B handoff history retention

同一タブのhandoff履歴、期限切れtombstone、active pointer、旧単一record移行、保存失敗時の副作用0を `tests/onboarding-ui-browser.test.mjs` の実Chrome回帰で検証する。履歴はsessionStorage存続中だけを保証し、容量上限で既存entryを削除してoperationを再発行しない。

### B期限切れ観測時の保存境界

実ブラウザ回帰では、fragment付きページとfragmentなし再読込の両方で、TTL経過後のクリックをAPIへ送信せず、対象entryを`expired` tombstoneとして保存すること、時計を戻した同一ページ・再読込・同じhandoff再訪でも操作を再開しないことを確認する。`sessionStorage`の保存に失敗した場合は当該ページをfail closedにし、既存履歴を置換せず、永続化成功を主張しない。
