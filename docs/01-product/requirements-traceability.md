# 要件トレーサビリティ

Status: Accepted

## 2026-11-08 登録後サンプル投入（段階D）

| 要求／判断 | 実装・境界 | 検証 |
|---|---|---|
| FR-001／FR-002／FR-004／FR-005、NFR-001／NFR-004、ADR-0032、DEC-115 | Personal Workspace owner本人の本文なしPOSTで6手順・3画像をclaim保存。予約prefix分離、同梱画像取得時の資格情報非転送、冪等再送・期限切れpending・同時実行 | `tests/cloud-manual-c.test.mjs`（認証・tenant・Team・payload拒否、R2失敗／応答消失、batch rollback、同時保存、改名後の由来保持、finalize直前role変更） |
| FR-004、NFR-001、DEC-060／DEC-115 | D1通常アーカイブのCAS＋append-only監査、migration 0010、revisionとasset保持。アーカイブ後だけ再投入 | `tests/cloud-manual-c.test.mjs`（stale版・viewer・越境・監査rollback・role mutation・監査scope直接DML・INSERT OR REPLACE／更新削除拒否） |
| FR-004／FR-005、DEC-115 | 空状態＋常設panelの明示2入口、二重送信・未保存／処理中guard、遅延応答時preserveDetail、isSample badge | `tests/sample-manual-import-ui.test.mjs`、`tests/sample-manual-import-browser.test.mjs`（1366/1024/390px、POST・一覧／詳細／共有情報GET遅延中の編集保持・focus・元選択、再試行・archive取消／再投入） |

## 2026-11-08 拡張なし受入用サンプル（段階A）
## 2026-11-08 拡張なし受入用サンプル（段階B）

| 関連要件／受入条件 | 実装・契約 | 回帰 |
|---|---|---|
| FR-004／FR-005の閲覧・編集境界、NFR-001／NFR-004、ADR-0032、DEC-111／DEC-113 | `/manuals/sample`から合成6手順／3画像を通常Webエディタの編集状態へ投入。文章・手順構成・undo／redoをメモリ内編集、確認後fixture再投入。保存不可・離脱時消失を明示。保存は登録案内、共有／出力／画像編集／brandingは禁止。偽workspaceとguest永続化なし | `manual-sample.test.mjs`（静的配信・共通API gate・既存routeの認証拒否）、`manual-sample-browser.test.mjs`（文章編集・追加上限200／削除／ボタンとAlt矢印並べ替え・undo／redo・読み直し確認／取消・1366/1024/390px・keyboard・無効操作dispatchを含むread／write 0回） |
| 初回導線の限定入口 | ログインと0件一覧だけに「サンプルを見る」。LP・検索0件・既存一覧は非表示 | `manual-sample-browser.test.mjs`、`manual-editor-ui.test.mjs` |

## 2026-11-08 受入第一弾（#272／#232）

| 対象要件／受入条件 | 画面契約・実装 | 回帰 |
|---|---|---|
| FR-001／FR-002／FR-011／FR-022、MVP-AC-010／011／013 | `onboarding-assets.ts`: prepare・fingerprint照合後の保存サマリーと送信確認、取消、確認後TTL検査とsnapshot再準備・fingerprint再照合、確定結果回収の継続 | `onboarding-ui-browser.test.mjs`（11分待機後の保存・不一致時送信0・15分TTL切れの再準備0）、`onboarding-recovery-actions.test.mjs`（実拡張snapshot期限切れ後のロゴ保存・確定結果回収のprepare 0）、`onboarding-share-browser.test.mjs` |
| #272／#232、NFR-004の情報露出・日本語案内 | `onboarding-assets.ts`: 既知コードの日本語化、未知コード非表示、タイトルtextContent | `onboarding-ui.test.mjs`、`onboarding-ui-browser.test.mjs` |
| #232／232-4、FR-002の初回導線 | `onboarding-assets.ts`: 保存準備画面introの初出だけにワークスペースの説明を追加。通常画面の文言・保存確認サマリーは維持 | `onboarding-ui.test.mjs`（既定HTML1回・Office差し替え・通常asset非露出）、`onboarding-ui-browser.test.mjs`（保存・共有復旧・Word・PowerPoint表示1回） |
| FR-004／FR-011、#232の初回空状態 | `app-assets.ts`: 編集権限のある0件一覧の「手順書を作る」からタイトル入力へ移動 | `manual-editor-ui.test.mjs`、`e2e/phase2-manual-editor.spec.mjs` |

契約は`docs/02-ux/onboarding.md`、`docs/05-api/guest-onboarding-and-claim-api.md`、ADR-0032の送信確認境界に同期する。外部認証・実環境への配信と受入の合否はローカル回帰と区別する。

Issue #283 auth route regression は、product cookie → Access assertion → configured legacy Supabase cookie の credential precedence と、Supabase 未設定 legacy cookie の fail-closed 境界を `tests/product-auth.test.mjs` で検証する。OAuth start は`APP_BASE_URL`とrequest originの完全一致を先に確認し、別名originではlimiter／D1／cookie／redirectの副作用を発生させない。OAuth start の既存期限（10分）を超えた transaction は start 1回につき最大100件だけ cleanup し、cleanup と INSERT の atomic batch、101件目の継続 start、未期限切れ consumed 行の保持、storage failure 分類を同じテストで確認する。

Issue #283の認証状態遷移は、`GET /api/session`の`authMode: "product" | "access"`を正本とする。`manuals.status`と`members.status`は機能の移行状態を示し、認証方式判定には使わない。D1 member routeが有効な環境では`members.status: "ready"`を返す。password login成功時の製品session revoke/clear、product OAuth成功時のlegacy access／refresh cookie clear、product logoutのJSON成功応答、期限切れproduct 401の製品ログイン復帰を`tests/product-auth.test.mjs`と`tests/app-auth.test.mjs`で確認する。OAuthの同一provider並行start、callback順序、cancel、未知／不正stateはtransaction固有cookieのunit回帰で確認する。

Issue #283 / PR #287の追加回帰: 未認証・期限切れ製品利用者のHTML `/manuals` 再訪は固定ログイン先へ戻し、JSON/APIの401とstorageの503を維持する（`tests/product-auth.test.mjs`）。passwordフォームを表示済みのprovider再取得では、編集中の値とフォーカスを保持する（`tests/app-auth.test.mjs`）。

PR #287のOAuth主体変更P2（2026-11-08、FR-001／FR-002、NFR-001／NFR-004、AC-016、ADR-0041）: callback成功302をrootの完了処理へ接続し、既存Web Lock・認証世代更新・BroadcastChannel通知を経て元操作へ復帰する。`tests/app-auth.test.mjs`で共有Cookieがuser-Aからuser-Bへ変わる二タブ、旧画面からの作成防止、lock待機、同期不能、固定戻り先、通常読込の通知反復不在を検証する。`tests/product-auth.test.mjs`で成功Locationの契約、`tests/product-auth-browser.test.mjs`と`tests/office-auth-runtime-browser.test.mjs`でGoogle／ChatGPTのhandoff・Office復帰を確認する。

### Issue #283 製品認証の実装対応

| 要求 | 実装／検証 | 状態 |
|---|---|---|
| first-party Google／ChatGPT認証とD1 membership | `apps/worker/src/product-auth.ts`、既存`D1OnboardingRepository`、`migrations/0008_product_auth_sessions.sql` | 実装済み（provider外部登録・secret bindingは未完了） |
| session安全境界 | token hashのみの`auth_sessions`、期限・revocation、Secure/HttpOnly cookie、失効cookieのAccess fallback禁止、provider設定時のcookie自然消去・Access assertionなしを`401 SESSION_REQUIRED`へ固定、OAuth transactionごとのcookie分離、D1欠落時もmanual／share dispatchを維持してstorage境界へ分類、Access migration guard時のpassword provider表示抑止、legacy logoutのcredential優先 | `tests/product-auth.test.mjs`、`tests/cloud-manual-c.test.mjs`、`tests/share-link-backend.test.mjs` で確認済み |
| OIDC検証 | Google verified email、SIWC client_secret_basic、issuer/audience/signature/nonce、SIWC subject scope、callback/start失敗時の許可済み戻り先と日本語復帰、limiter拒否と不明結果の429/503分類、別名originの副作用0 | `tests/product-auth.test.mjs` のunit/API、`tests/product-auth-browser.test.mjs`、`tests/office-auth-runtime-browser.test.mjs` で確認済み |
| tenant／管理境界 | 既存D1固定workspace query、Access service token・health分離 | 既存契約を維持、回帰確認対象 |
| rootの製品ログイン／手順書導線 | product／Access sessionの中立的なアカウント表示、`/manuals` canonical link、logout後のprovider-only login。D1 member routeの正常・権限外・越境negativeを`tests/m3-http-d1.test.mjs`、shell／logout回帰を`tests/app-auth.test.mjs`で確認 | 修正済み（実Google SSO後の保存・Office出力は親のstaging／実環境検証範囲） |

## 現行MVP

Chrome拡張first、guest-first onboarding、PC/スマホ/タブレットresponsive captureの現行MVPは次を正とする。

| 要件 | 画面/Surface | API | Data | ADR | 受入・テスト | Delivery |
|---|---|---|---|---|---|---|
| FR-001 | OUTPUT-GATE, Access認証 | Access JWT検証、`POST /api/onboarding/bootstrap` | identities, profiles | ADR-0028, ADR-0032 | MVP-AC-007, 008, 009 | Extension MVP / EPIC-02 |
| FR-002 | 認証後はPersonal Workspace自動準備 | `POST /api/onboarding/bootstrap` | workspaces, workspace_members, identities, profiles | ADR-0028, ADR-0032 | MVP-AC-008, 009 | Extension MVP / EPIC-02 |
| FR-003 | Team設定・管理責任者移管 | workspace member APIs、POST owner-transfer | workspace_members、workspace_owner_transfer_permits、audit_logs | ADR-0028, ADR-0025, DEC-114 | AC-007, AC-008, AC-009, AC-014、d1-workspace / m3-http-d1 / d1-binding / app-auth | メンバー管理・standard workspaceのowner移管をローカル実装・検証済み（[報告書](../09-delivery/owner-transfer-2026-11-08.md)）。remote D1適用・CI・正式Review未実施 / EPIC-02 |
| FR-004 | Manual editor | manual APIs | manuals, manual_revisions, manual_steps | ADR-0028, ADR-0005, ADR-0035, ADR-0036, ADR-0038 | AC-010, AC-011, AC-017、Phase2 manual tests、画像中心editor／保存状態UI、画像編集dialog回帰 | EPIC-06 |
| FR-005 | Manual editor | manual step APIs | manual_steps | ADR-0028, ADR-0005, ADR-0035, ADR-0036, ADR-0038 | manual edit/reorder tests、画像欠落時の再記録案内、注釈・mask編集回帰 | EPIC-06 |
| FR-006 | Manual editor | local deterministic suggestion | - | ADR-0009 | manual instruction template tests | EPIC-06 |
| FR-007 | Chrome Extension | extension local capture + 認証後claim API | guest local capture state, 認証後manual | ADR-0031 | MVP-AC-002, 016 | Extension MVP / EPIC-05 |
| FR-008 | Chrome Extension | local event normalization | guest local event state | ADR-0031 | MVP-AC-002, 004, 005 | Extension MVP / EPIC-05 |
| FR-009 | Chrome Extension + Manual | 認証後asset upload / Worker proxy read | local guest assets, private R2 after claim | ADR-0006, ADR-0011, ADR-0031, ADR-0032 | MVP-AC-005, 010, 011 | Extension MVP / EPIC-05 |
| FR-010 | Chrome Extension | local normalization / claim validation | - | ADR-0031 | MVP-AC-004 | Extension MVP / EPIC-05 |
| FR-011 | Chrome Extension editor | local draft generator / claim | guest local draft, manual_revisions after claim | ADR-0009, ADR-0031, ADR-0032, ADR-0035, ADR-0036, ADR-0038 | MVP-AC-005, 006, 010、`tests/extension-editor-browser.test.mjs`、`tests/extension-image-annotations.test.mjs`、`tests/extension-release-blockers.test.mjs`の終了結果不明・復元優先案内、保存成功後の編集画面／下書き一覧二重障害からの再表示案内、ブランド／保存状態／reduced-motion確認 | Extension MVP / EPIC-05/06 |
| FR-012 | Output gate / Share | `POST/GET/DELETE /api/workspaces/{workspaceId}/manuals/{manualId}/share-links` after auth+claim; explicit expiry/passcode and immutable snapshot CAS | `share_links`, `share_grants`, published `manual_revisions` | ADR-0005, ADR-0008, ADR-0028, ADR-0034 | MVP-AC-012, AC-030, AC-031, `tests/share-link-backend.test.mjs` | MVP / EPIC-08 |
| FR-013 | Public share viewer / 20手順の位置復帰・前後移動・画像拡大 | `POST /s/api/resolve`, `POST /s/api/content`, `GET /s/api/assets/{assetId}` under narrow `/s/` prefix; visibility/pageshowで再検証、再読込は元リンクから再認証 | `share_links`, `share_grants`, private R2 proxy; opaque published step UUIDと手順indexのみ端末へ保持 | ADR-0005, ADR-0006, ADR-0008, ADR-0034 | AC-030, AC-031, `tests/share-link-backend.test.mjs`, `tests/share-viewer-browser.test.mjs`（mock API、実認可とは別） | MVP / EPIC-08 |
| FR-014 | Output gate / PDF | PDF export API after auth+claim | exports / entitlements when enabled | ADR-0032, ADR-0033 | MVP-AC-007, 013, 019、PDF export tests | MVP / EPIC-08 |
| FR-015 | Guide Me | replay APIs | - | - | AC-040 | DEFERRED / EPIC-08 |
| FR-016 | Chrome Extension mode selector | local responsive window control | local capture mode only | ADR-0031 | MVP-AC-003, 015 | MVP / Extension MVP |
| FR-017 | Analytics | product/share event APIs | product events / share analytics | ADR-0030 | `docs/05-api/product-events.md`, MVP-AC-017, 018 | NEXT / EPIC-11 |
| FR-018 | Feedback | comment/report APIs | comments | - | 後続AC | DEFERRED / EPIC-09 |
| FR-019 | Billing | billing APIs, Stripe webhook | billing_customers, checkout_intents, subscriptions, payment_events | ADR-0007, ADR-0022, ADR-0023, ADR-0033 | AC-050, AC-052, AC-054, AC-055, AC-056, AC-057, AC-059, AC-062, AC-063 | NEXT / EPIC-10 |
| FR-020 | AI settings | ai settings APIs | feature flags/settings | ADR-0009 | AC-060 | DEFERRED / EPIC-14 |
| FR-021 | Billing / Usage | billing summary / entitlement APIs | entitlements, usage_counters | ADR-0023, ADR-0033 | AC-051, AC-053, AC-055, AC-058 | NEXT / EPIC-10 |
| FR-022 | Chrome Extension guest editor / Output gate | `POST /api/onboarding/bootstrap`, claim intent、authenticated staged asset PUT、guest claim | guest local IndexedDB等、`workspaces.workspace_kind`、認証後manual/private R2 | ADR-0031, ADR-0032, ADR-0035, ADR-0036, ADR-0038 | MVP-AC-005〜013、Personal Workspace uniqueness／asset retry negative tests、認証後handoff準備表示、注釈焼き込み・raw注釈非送信回帰 | MVP / Extension MVP |
| FR-023 | Markdown / HTML export | export APIs after auth+claim | exports / entitlements when enabled | ADR-0033 | 形式別export tests when enabled | NEXT / EPIC-08 |
| FR-024 | Chrome Extension editor / Office出力 | output gate → authenticated workspace claim → local `buildDocx` / `buildPptx` (`Uint8Array`) | local draft snapshot、認証済みhandoff metadata、端末download | ADR-0040、`manual-local-office-export-api` | AC-064、AC-065、`tests/extension-office-wiring.test.mjs`、`tests/extension-office-export-browser.test.mjs`、`tests/office-auth-runtime-browser.test.mjs`、Office生成器のOOXML／複数画像／長文、認証後のWord/PPT復帰 | MVP / Extension 0.1.9 |
| NFR-007 | Login, extension, editor, share | - | - | - | a11y / keyboard / focus tests | EPIC-13 |
| NFR-013 | - | Business OS cloud runner contracts | Business OS側正本 | ADR-0026 | business-os-runner checks | Business OS #10 |

## 共有停止時の結果不明回復

共有停止の4xxはAPIが返した案内を表示し、5xx・通信失敗は結果不明として画面に同じ共有リンクを保持する。利用者は画面を閉じず、同じ`shareLinkId`で停止を再試行できる。

FR-004／FR-005／FR-012のクラウド編集では、共有作成・停止の応答待ち中は画像編集開始を抑止し、成功応答の全体再描画による編集中dialogの破棄と保存・手順切替の停止を防ぐ。`tests/cloud-manual-sharing-failure-browser.test.mjs`の遅延POST／DELETE回帰で、パネルを閉じた後の編集開始拒否と、応答後の画像適用・保存・手順切替・再編集を確認する。画像編集中の共有開始抑止も同じ回帰で確認する（PR #285、2026-11-08追補）。

## Cクラウド保存の追跡

FR-022のC範囲は、`apps/extension/background/cloud-claim.js`のsender／handoff／schema／chunk検証、`apps/extension/editor/handoff.js`のdraft単位Web Locksとcanonical handoff選択、`apps/worker/src/onboarding-assets.ts`の認証後準備表示とsame-origin claim transport、`apps/worker/src/cloud-manual-assets.ts`の一覧・再表示・編集UIで実装する。APIのserver認可、D1/R2 staged asset、finalizeの正本は`docs/05-api/guest-onboarding-and-claim-api.md`とbackend担当のroute／migration実装を参照する。拡張editorに画像がない手順は最後の画面で補完せず、再記録を案内する。各操作と画像IDを収集するcapture側の実装は別担当の契約で同期する。

受入証跡は、external-origin／unknown schema／期限切れ／oversize／chunk order／credential拒否、mask焼き込み、local failure／cancel／retry／changed-draft retention、同じdraftを2つのMV3 editorタブで保存して1つのhandoff／operationへ収束すること、同じ内容のtimestampだけが変わるprepare／asset start、completed後の新handoff、別draft分離、Web Locks／storage取得失敗時の新URL 0件、一覧→再表示→編集→version競合を対象とする。クラウド手順書画面はタイトル・説明・手順本文の編集、追加・削除・並替え、画像再表示をローカル編集状態へ保持し、明示した一回のdraft PATCHへまとめる。保存中の入力変更は応答で上書きせず、保存結果不明時はclaim状態照会を先に行う。handoff metadataには本文・画像を保存せず、`updatedAt`を除くdraft fingerprintだけを保持する。完了通知はADR-0038に従って`completion-pending`の耐久保存後に原本を保持し、確定cloudRefだけを付与する。転送中の新しい編集と選択を残し、次handoffは同じmanualの期待版をtargetに指定する。metadata／IndexedDBの技術障害は再試行可能にし、新規manualを重複作成しない。主要画面の案内語は「手順書」「操作を記録」「この端末に保存」「ワークスペースに保存」「共有リンクを作成」「キャンセル」「黒塗り」とし、入力欄の値非保存と画像への映り込みを区別して表示する。対応する実ブラウザ証跡は`tests/cloud-manual-ui-browser.test.mjs`と`tests/onboarding-ui-browser.test.mjs`、extension契約証跡は`tests/extension-cloud-claim.test.mjs`に置く。owner限定stagingの実Chrome通し確認とAPI route接続は、統合後の環境証跡として別に判定する。

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

0.1.9以降の画像保護はADR-0040を正とする。撮影時の自動alias・自動mask・自動overlayは保証せず、取得画像を端末下書きへ保持する。入力値、Cookie、Authorization、DOM本文、対応表は操作event・操作文・handoff metadataへ保存しない。画面に表示された値が画像へ含まれる場合は、利用者が画像編集で置換または黒塗りを明示適用して確認した画像だけを出力・cloud保存する。OCR、画像内文字、cross-origin iframeは対象外で、手動編集による確認を案内する。旧自動overlay詳細は0.1.8以前の履歴（Superseded by ADR-0040）として保持する。



MutationObserverの追加・除去nodeまたはcharacterDataのoldValue／変更後valueからsplit PIIを照合する際に、各履歴系列を混ぜず、有限値内のASCII local-part直後の`@`またはleading `@`直後のASCII domainを含む明らかなemail partial markerは区切り文字・後続文字に関係なく出現時点で拒否する。孤立した日本語文中の`@`は記録可能とする。128 nodeまたは1024文字の有限予算へ到達して候補を確定できない場合は、通常の長文DOM検出とは別にcaptureをfail closedとする。

numeric fragmentの履歴はcapture期間だけprivacy mutation state内に保持し、同じrendered parentで実際に隣接する可視nodeだけを連結する。変更後の可視valueはchildListとcharacterDataのrecord種別をまたいで同じ系列として照合し、oldValueは別系列に保つ。周囲の空白・句読点および有限の普通文はnumeric coreを含むnodeの判定境界としてだけ扱い、連結時の原文から無条件に除去しない。普通文を含むnodeもnumeric coreがある場合だけ候補へ加え、numeric separatorだけの可視nodeはhyphenまたは空白に限ってbounded sequenceの一部として保持し、それ以外の非numeric separatorでは連結を止める。capture中は同じparentの現在可視textも同じ128 node・1024文字の有限snapshotで確認し、初期から存在したprefixと後続追加の組み合わせを取りこぼさない。予算を超えた未知のmutationはfail closedとし、removeSensitiveMasksで履歴を解放する。

FR-007 / FR-008 / FR-010 / FR-011 / FR-016 / FR-022はADR-0031を正とする。

- MVP capture runtimeはChrome拡張のみ。
- PC / smartphone / tabletの3表示モードを必須とする。
- smartphone / tabletはdesktop Chrome responsive viewportで実現する。
- 終了失敗後の再試行では永続化された`finish_failed` phaseを正として、選択済みのsmartphone / tablet responsive viewportを再適用してscreenshotを生成する。
- MVPでは`debugger` permissionを要求しない。
- guest contentは認証前にD1/R2へ送らない。
- clickのevent labelは固定semantic値へ正規化し、`aria-label`、関連label、placeholder、本文をevent／local draftへ保存しない。安全な短いcaptionを採用した拡張機能内eventだけ`labelSource: "caption"`を付加し、未指定値は後方互換のsemantic fallbackとして扱う。この補助fieldはguest capture APIへ送信しない。navigationはstorage二重障害時も同一session単位のfallbackから後続のevent／draftへ一度だけmergeする。
- 新規画像はrawのまま端末に保持し、手動確認前の出力・cloud claimを拒否する。`tests/extension-native-recording-browser.test.mjs`、`tests/extension-record-alias-state.test.mjs`、`tests/extension-semantic-context-browser.test.mjs`で自動置換の非実行、caption非収集、手動確認境界を検証する。旧自動overlay試験はADR-0040により廃止した。
- scroll baselineは記録開始時に既存要素の位置をseedし、動的に追加された未知要素は初回位置を推測せずseedだけ行い、次の差分から方向を記録する。
- 通常の`capture:event`送信中は離脱警告を出さず、送信失敗が判明して保存成功を確認できないeventとretain中の未保存batchだけをbeforeunload保護対象とする。再送成功まで失敗保護を保持し、送信世代を照合して遅着ACKによる新しいeventの消去を防ぐ。
 - 記録中のサイドパネルは現在の手順番号・操作内容・画像状態を表示し、新しい手順へ追従する。過去位置の閲覧中はスクロール位置を保持し、明示的な最新移動で追従を再開する。現在地表示は保存済み下書き一覧まで含むサイドパネル全体で固定し、終了時はeditorが下書き取得と初回renderを完了した`editor:ready`を確認できた場合だけサイドパネルを閉じる。結果不明・復元待ち・editorの下書き取得／render失敗・readyタイムアウトでは復旧案内を残す（DEC-086、`tests/extension-sidepanel-browser.test.mjs`）。

capture runtimeはcloud claim契約と同じ保存ready画像100件・手順200件を上限とし、保存済みlive画像のIDB件数を画像上限の正本として判定する。通常pauseはdrain前に`paused`意図をsessionまたはrecovery journalへ保存し、両方が失敗した場合はrecorderを停止しない。停止時のpending batchはページ側でclone保持し、sessionまたはjournalへの保存確認後だけreleaseする。recorderのretain確認が欠落または失敗した場合はbatchを空配列として保存せず、releaseや再注入を行わない。release確認が欠落または失敗した場合も成功扱いにせず、保持中のbatchと再試行可能な状態を維持する。上限到達時はrecorderを停止して記録を一時停止し、終了・手順書保存へ案内する。上限到達済みの記録は保存でき、上限超過の保留イベントは追加せず終了処理を妨げない。上限超過を成功扱いにせず、`CLOUD_CLAIM_MAX_ASSETS`を正本として追跡する。

キャンセル後の一時画像削除に失敗した場合は`cancel_failed` phaseでキャンセル意図と復旧情報を保持し、画像削除とsession／journalの終了確認が完了するまで終了済みとして扱わない。既存draftは削除せず、対象ウィンドウが復元可能な場合だけ復元を再試行する。ブラウザ再起動や拡張再読み込みでsessionが失われても、local journalの有効な`cancel_failed`からcleanup専用状態を復元し、旧tab/windowを推測して操作しない。

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

### C handoff準備完了の受入境界

FR-001、FR-002、FR-022の登録／共有handoffでは、拡張機能がinactive tabを作成してからWebページの`handoff.page-ready`を受け、自動activate期限内に固定origin・`/onboarding/continue`・tab ID・launch ID・保存済みdraft fingerprintの存在・64桁hex形式・TTLを検証してpageReadyAtだけを記録し、現activeなeditorがrun／launch／tab／期限を再検証した場合だけ対象tabをactivateしてactivatedAtを保存する。tabs.update開始後のactivating中は取消・Esc・新しいhandoff開始を受け付けず、失敗時だけpreparedへ戻して再試行する。handoff作成時のdraft fingerprint照合とclaim本体のrequest fingerprint検証は別境界として追跡する。古い通知、別tab、別origin、期限切れ、保存済みdraft fingerprintの不在または形式不正、利用者が閉じたattemptは副作用0で拒否し、Accessログイン等でreadyを受信できない場合はtimeout後に自動activateせず利用者の明示操作で画面を表示する。ready観測後にauto期限を超えた場合は同じ準備済みtabでmanual継続し、回帰で確認する。実装は`apps/extension/editor/editor.js`、`apps/extension/background/service-worker.js`、`apps/worker/src/onboarding-assets.ts`、回帰は`tests/onboarding-ui.test.mjs`と`tests/extension-editor-browser.test.mjs`で追跡する。

DEC-090の通常Web経路はhashlessページ表示や通常navigationを復帰証明にせず、同じtabの保存済みhandoffで利用者が「保存を再開する」または「保存状況を確認する」を押した場合だけ`handoff.access-return`を送る。初回AccessでWeb側JSが実行されないDEC-092のpayloadなしcontent script経路は自動復帰を維持する。回帰では通常navigationの復帰0回、明示クリックによる復帰、初回native 302、期限切れ結果回収、local原本保持を確認する。

### Issue #264 editor image workspace

全手順を安定したarticleとして表示し、sticky目次の17番選択・scrollspy・入力保持を確認する。専用native dialogの文字・四角・丸・矢印・黒マスク、既存mask継承、取消・保存失敗・再open/reloadを合成fixtureで回帰し、画像差し替え成功時の対象dialogだけの破棄、別画像dialogの保持、bitmap identity不一致時の注釈・mask保存拒否、失敗時の旧内容保持と操作フォーカス復帰、local注釈をclaim assetへ焼き込んだ表示一致とraw注釈非送信を確認する。

## 2026-10-01 画像中心編集の追跡

- DEC-090の自動架空値表示はADR-0040により失効。現行はraw撮影と明示確認、caption保護、画像の理由付き状態、bounded予約、クリック矩形、選択手順中心の編集と取り消し、保存直前の画像pending gateを維持する。
- 実装: apps/extension/capture/privacy.js、content/recorder.js、background/service-worker.js、editor/editor.js、apps/worker/src/cloud-manual-assets.ts
- 検査: tests/extension-native-recording-browser.test.mjs、extension-caption-browser.test.mjs、extension-finish-recovery.test.mjs、extension-editor-browser.test.mjs、extension-cloud-claim.test.mjs、cloud-manual-uiux-browser.test.mjs
- raw captureは同じ画像bytesを端末draftへ保持し、`manual_image_review`の明示確認まで`protected`としてOffice/cloudを拒否する。確認後の同一bytes出力と未確認拒否は、`extension-finish-recovery.test.mjs`、`extension-cloud-claim.test.mjs`、`extension-capture-completion-browser.test.mjs`で追跡する。
- 実画面受入: docs/02-ux/manual-editor-review-rubric.md。各独立評価者80点以上と安全条件の両方が必要。未実行は合格扱いにしない

## 統一編集器の継続保存・チーム書式（2026-10-01）

承認済み統一編集器仕様の「保存前後の一貫性」「保存・認証の中断」「共有の正確さ」と、ユーザー指定のチームテーマ色・ロゴをADR-0038に具体化する。既存FR/ACの安全境界は緩和しない。

| 受入対象 | 契約／実装 | 回帰テスト |
|---|---|---|
| クラウド保存後も同じローカル下書き・選択を保持 | ADR-0038、unified-editor-storage-api、cloud-claim.js | extension-retained-cloud-draft、extension-cloud-claim-runtime |
| 再保存で重複manualを作らず版衝突では保持 | claim target、revision CAS、completed receipt | cloud-manual-cのrepeat local saves／failure rollback |
| 認証済みterminal expiry後の再保存／共有と変更済み原本の保持 | status GETのD1 terminal CAS、bounded handoff.expired、draft gate | cloud-manual-cのexpired create/update race・権限取消、extension-retained-cloud-draftのidentity negative、onboarding-recovery-actionsのsave/share/変更/reload |
| 編集画像の失敗で旧画像を失わない | immutable edit asset予約、条件付きR2、PATCH CAS | cloud-manual-cのedited image upload／tampering／concurrency |
| 保存済み画像A→B→undo Aの再保存 | migration 0007 first_attached_at、same-manual provenance | cloud-manual-cのsaved edited image・rollback・古い未添付／tenant／manual／role negative |
| D1 trigger副作用を含む保存成功の直接変更件数照合 | DEC-103、D1 batch内`SELECT changes()`、CAS／rollback | cloud-manual-cの画像なし・画像あり保存、stale409、途中失敗rollback、share-link-backend |
| チーム書式の権限・tenant境界と共有版固定 | branding versions、private logos、published snapshot | cloud-manual-c branding、share-link-backend published branding、manual-raster |

ブラウザーの視覚・操作確認、remote migration適用、公開配備は上表のローカル単体テストと別に検証する。

| ローカル固有の色・ロゴを保存・共有・印刷へ維持 | claim branding snapshot、safe logo chunk、source_claim_id、draft CAS | cloud-manual-c manual branding、onboarding-recovery-actions rasterized branding、share-link-backend local manual branding |

2026-10-01追補: 記録単位の表示値alias旧契約は[ADR-0039](../03-architecture/adrs/ADR-0039-recording-value-aliases.md)と[API契約](../05-api/recording-value-alias-contract.md)へ履歴として残す。0.1.9以降の正本は[ADR-0040](../03-architecture/adrs/ADR-0040-explicit-image-privacy-and-local-office-export.md)と[端末Office出力契約](../05-api/manual-local-office-export-api.md)とし、撮影時の無加工画像保持、入力値非収集、利用者明示の置換・手動mask、認証・workspace claim後の端末Office生成を追跡する。Node lifecycleとnative two-document/export fixturesを必須回帰とする。黒塗り画像の注釈再露出を防ぐため、annotation-redaction-exportのraw payload検査とnative cloud mask pixel検査を実施する。PDFはFR-014の既存output gate、公開OFF、共有cloud認証を維持する。

Issue #283／DEC-096のcallback参照元抑止とD1失敗分類は`tests/product-auth.test.mjs`、`tests/product-auth-browser.test.mjs`、`tests/office-auth-runtime-browser.test.mjs`で検証する。prepare／bind／run拒否と消費CAS競合を区別し、callback成功・エラーリンク復帰ともReferer無しを確認する。

## ProductログインUI実表示の追跡（2026-10-04）

| 追跡対象 | 利用者に見える挙動 | 実装・回帰 | 状態 |
|---|---|---|---|
| FR-001／FR-002のoutput gate後認証 | 認証方法の取得中は入力欄を表示せず、provider-only環境では利用可能なproviderだけを案内する。providerが1つなら単独案内、2つなら必要な場合だけ「または」を表示する | `apps/worker/src/app-assets.ts`、`tests/app-auth.test.mjs`、`tests/product-auth-browser.test.mjs` | source commit `4cc027ddde4ba34ffacd134c19b317f2f95d379b`で実装、unit 115/115・browser 5/5 |
| 同上の失敗・空設定 | provider取得失敗時はProduct session未確認を含め、password supportを確認するまで既存password formへ戻さず、エラーと再試行を表示する。provider設定が空なら読み込み中のままにせず管理者への案内を表示し、隠したフォームの外にエラーを表示する | 同上 | `worker-runtime` 71/71、Worker harness OK |

この追跡はrootログイン画面の表示と状態遷移に限る。実provider SSO、remote設定、staging／production反映、native Officeアプリの表示結果はこのローカル回帰の成功には含めない。
## PR #284 最終レビュー追補（2026-10-04）

| 追跡対象 | 利用者に見える挙動 | 実装・回帰 | 状態 |
|---|---|---|---|
| Product session未確認を含むprovider取得失敗 | password supportを確認できるまでpasswordフォームへ戻らず、エラーと再試行を表示する。再試行成功時も入力値、return path、focusを保持する | `apps/worker/src/app-assets.ts`、`tests/app-auth.test.mjs`、`tests/product-auth-browser.test.mjs` | 実Worker相当のunitとCFT browser回帰で確認 |
| provider-onlyとlegacy cookieの併存 | Supabase設定がない場合、legacy cookieだけでlegacy routeへ切り替えずProduct routeを維持する。設定済みlegacy backendのpassword session選択は維持する | `apps/worker/src/index.ts`、`tests/product-auth.test.mjs` | legacy cookie 3組の実Worker回帰で401／SESSION_REQUIREDを確認 |

## 2026-11-08 UI回収の対応

FR-004/005/007、NFR-003/004/005/007、MVP-AC-002/004/007/008/009の表示・操作品質を[全画面品質台帳](../02-ux/all-screen-quality-matrix.md)に対応づける。`extension-recording-quality-browser`はpopup/sidepanelの44px・連打・状態取得失敗・復旧・scroll、`extension-editor-browser`は保存失敗・選択目次復帰・欠落下書き、`all-screen-quality-browser`はLP/製品認証/一覧/読者の表示、`ui-quality-lab-browser`は合成画像・keyboard・contrast・PDFを検査する。認証は#287とADR-0041、画像はADR-0040を維持する。native記録・Worker/API認可の既存回帰は表示fixtureで代用しない。実行結果と未実行は[回収報告書](../09-delivery/ui-recovery-2026-11-08.md)へ記録する。

2026-11-08 PR #288追補: クラウド一覧の再取得も失敗した場合、開始時に一覧内へあったフォーカスを新しい再試行ボタンへ戻す。待機中に別要素へ移動した場合はそのフォーカスを維持し、初回取得失敗ではボタンへ自動移動しない。`tests/cloud-manual-ui-browser.test.mjs`でEnter／Spaceによる連続再試行と待機中の検索欄への移動を検証する。対象指摘は`4504498692`、検証記録は[修正報告書](../09-delivery/ui-p2-fix-2026-11-08.md)を参照する。
