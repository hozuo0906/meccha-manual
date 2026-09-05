# Cloudflare Access / D1移行ロードマップ

Status: Accepted

## 目的

Issue #176とADR-0028に基づき、Supabase Auth/Postgres/RLS前提の実装をCloudflare Access/Workers/D1へ段階移行する。各マイルストーンは独立PRとし、前段のP0/P1、CI、review threadが解消するまで次へ進まない。

## 現在地

- Cloudflare Workers、preview Access保護、R2方針、Browser Run fail-closed基盤は継続利用する。
- Supabase Auth、Postgres migration、RLS、RPC、PostgRESTを使うPhase 1/2実装は移行前baselineとして存在する。
- production D1、production Access application、実データ、外部ユーザーは未作成・未移行である。
- Issue #92は2026-08-30にcompleted closeされ、#92由来のblanket main merge holdは解除済みである。
- PR #175でmainへ取り込まれたnon-production branch build停止、version upload-only、Access deny-by-defaultは移行中も維持する。
- 現行AcceptedのSupabase RLS live gate workflowは、Issue #176 M5のAccess/D1/R2置換gateと正本が同じrollback単位でmainへ着地するまで維持する。新規Supabase test user、資格情報は追加せず、live runはIssue #215の文書・checker整合PRとは別にownerが実行自体を明示承認した場合だけ許可する。

## Migration safety gate

M0〜M4のPull Requestは、それぞれの通常品質ゲートを満たせばmainへ統合できる。Issue #92を再openせず、blanket main merge holdも復活させない。

ただし、M5でreview済みcandidate SHAから作成した実immutable previewについて、staging専用D1/R2だけをbindingし、production backendを参照・継承・到達できないnegative proofが成功するまでは、次を禁止する。

- staging合格または内部alpha合格として扱うこと
- production Access application、D1、R2の作成
- production migration、deploy、promote
- 外部ユーザー招待、実業務データ保存

## M0: 正本移行

成果:

- ADR-0028
- FR、データ、API、運用、リスク、Issue mapの整合
- Supabase前提文書のSuperseded表示（現行Accepted transitional gate文書を除く）
- 旧Supabase live workflowはM5置換gate着地まで維持し、M5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で退役と再追加防止checkの反転を完了する。M6へ持ち越さない
- Issue #92/#95/#176/#70の依存関係更新

完了条件:

- 文書CI成功
- 最新head reviewでP0/P1/P2なし
- 未解決review thread 0
- production変更なし

## M1: Access identity spike

成果:

- Access JWT verifier
- issuer/audience/署名/期限/token typeのnegative test
- identity-based user JWTとservice-token JWTのactor分離。空の `sub`／`common_name` を人間userへ写像しないnegative test
- 検証済みsubjectからapplication identityを解決する最小contract
- 未招待・disabled identityの拒否
- email、JWT、OTPをログへ出さない検査

禁止:

- 独自password
- 未検証headerの信用
- production Access変更
- 旧Supabase経路へのfallback

実装状況（M1）:

- `apps/worker/src/access-identity.ts` にAccess JWT検証、actor分離、machine route allowlist、application identity DIを追加した。
- `ACCESS_ISSUER`、`ACCESS_AUDIENCE`、`ACCESS_JWKS_URL`は`server-config.ts`を唯一の設定窓口とし、issuer／JWKSは安全性検証済みHTTPS設定だけを使う。
- 実HTTP request path、UI、D1 schema、migration、外部ログインはM3／M2以降の範囲として変更していない。
- `tests/access-identity.test.mjs` はローカルRSA署名JWTとmock JWKS HTTPを使い、正常系、actor shape、期限、署名、鍵取得障害、identity状態、秘密値非露出を検証する。

## M2: D1 workspace boundary

成果:

- staging用D1 schema/migration（[D1 workspace schema](../04-data/d1-workspace-schema.md)）
- identities、profiles、workspaces、workspace_members、join codes、audit logs
- Worker認可、D1制約、workspace固定repository、identity/workspace/memberのcoreを先に実装する。manual coreはM4で扱い、callback本体はM2では有効化しない。
- M2の2つのexact POST callback pathはbody読取、Origin／署名処理、KV／Queue／D1、外部fetch、`waitUntil`、成功ackより前に、安定した `503 CALLBACK_MIGRATION_IN_PROGRESS` を返す。path別Access BypassはOFFを維持する。OQ-031のcallback安全条件は削除・緩和せず、独立callbackマイルストーンC1へ移す
- workspace固定repository API
- 別workspace、viewer、disabled、last-owner、ID差し替えnegative test
- backup/export/restore rehearsal（local SQLだけを完了扱いにせず、実staging D1 bindingの確認は未実証）
- staging/production binding分離scanner
- callbackのguard commit失敗、commit直後・Queue投入前停止、processing lease期限、一時失敗、結果不明、同一ID・同一digest並行再送、同一ID・異なるdigest、completed再送、CAS成功後停止→lease takeover→旧worker復帰のnegative/recovery testはC1で実施する。M2ではcallback停止境界の503・副作用0だけを確認し、D1 coreの実staging binding検証とは混同しない

完了条件:

- Worker認可とD1制約の両方を破壊するmutation testが失敗する
- workspace条件なしqueryを静的検出する
- stagingだけで動的negative testが成功する
- callback停止中の両入口503・副作用0が確認できる。これはcallback本体のstaging成功やC1完了を意味しない。
- backup/export/restore rehearsal、実staging D1 binding smoke、production分離の実環境証跡は未実証であり、local SQL suiteの成功だけではM2完了・staging合格としない。

M2のscanner、repository negative test、staging D1 testはM5の実preview証跡に向けた準備であり、staging合格やproduction準備開始の根拠にはしない。

## C1: 外部provider callback復帰

M2から独立したマイルストーンとして、Stripe/Discord callbackのstore/coordinator選択、実装、schema/migration、path別Access Bypassの再判断を行う。OQ-031を解決するため、raw body署名・timestampの副作用なし検証、有界parse/schema・allowlist検証、provider ID・payload digest・receiptと再実行可能なwork/outboxの単一atomic保存、`received/processing/retryable/reconcile_required/completed/dead_letter`、processing lease期限、dispatcher、結果不明照合を実装する。既存Discord KV get→putを単独のreplay guard正本にしない。receipt/effect由来のstable idempotency/correlation key、sink側idempotencyまたはeffect単位single-writer、旧lease worker fencing、並行再送、CAS成功後停止→lease takeover→旧worker復帰、sink call最大1系統のrecovery negative testを完了するまで、callbackは503のまま、path別Access BypassはOFFのままとする。

C1有効化前にはM2の503・副作用0証跡に加え、元のcallback回復試験全件と別リリース判断を完了する。M5の無効callback候補では稼働callback向けsink試験を内部alphaの前提にしない。

## M3: Phase 1移行

成果:

- Accessログイン/再認証/ログアウトUX
- 招待制Access policyを明示Emails/Groups allowlistで固定し、メールOTP login methodだけをallow条件にしない
- session、workspace、member API/UIのD1化
- 複数タブ、古い応答、結果不明、途中失敗の回帰
- Phase 1のactive request pathからSupabase Auth、refresh token、PostgREST/RPC依存を削除
- M4完了まで全Phase 2 manual read/mutation routeとUI入口をfail closedで一時停止し、安定した `503 MANUAL_MIGRATION_IN_PROGRESS` を返す。Supabase呼出し、自動再送、queued write、fallback、二重認証、二重書込みを作らない

完了条件:

- Phase 1 E2Eとアクセシビリティ成功
- 4ロールと未招待/停止/越境negative test成功
- Phase 1 active request pathのSupabase runtime fallback 0
- 旧manual routeがSupabaseへ到達せず、`503 MANUAL_MIGRATION_IN_PROGRESS` でfail closedになる回帰成功
- M3状態をstaging合格または内部alpha合格として扱わない

## M4: Phase 2 manual移行

成果:

- manuals、revisions、stepsのD1 schema
- create/edit/reorder/publish/next draft/archiveのD1対応atomic operation
- optimistic version、公開版不変、200 step上限
- API/UI/E2Eと途中失敗回帰
- M3で一時停止したmanual API/UIをD1経路だけで再開

完了条件:

- Phase 2正常系・異常系・競合・再送テスト成功
- Postgres SECURITY DEFINER RPC runtime依存 0

## M5: staging統合実証

成果:

- staging Access applicationのメールOTP・招待制
- staging Worker + D1 + R2
- previewがstaging bindingだけを持つnegative proof
- candidate SHA、migration履歴、Access policy、D1 databaseの対応証跡
- rollbackとAccess/D1/R2障害訓練
- candidate code SHAとschema migrationごとのcompatibility floor照合、code-only rollback可能条件、不可逆後はrollbackせずfail-closed/forward-fixとする条件、選択的rollback rehearsal

完了条件:

- review済みcandidate SHAからversion upload-onlyで実immutable previewを作成する。
- 未認証requestがAccessで拒否される。
- Access認証後もstaging D1/R2だけが利用可能で、production binding、route、secret、backendへのfallbackまたは到達経路がないことをnegative proofで確認する。
- candidate SHA、Access policy、D1 migration履歴、R2 bindingの対応を値非表示で照合する。
- candidate code SHAと各schema migrationのcompatibility floorを照合し、code-only rollback可能条件、不可逆後のfail-closed/forward-fix条件、選択的rollback rehearsalを実証する。callbackを有効化した候補をM5へ載せる場合だけ、C1の別リリース判断と全recovery証跡を前提に、外部effectのstable idempotency/correlation key、sink側idempotencyまたはsingle-writer境界、CAS後停止→takeover→旧worker復帰時のsink call最大1系統も同じ候補証跡で確認する。callback無効候補では `503 CALLBACK_MIGRATION_IN_PROGRESS` と副作用0のnegative proofだけを行う。
- DEC-064 Safetyの5操作（replacement gateと対応docs、旧workflow削除、runbook Superseded、両checker反転、直接依存test同一scope）を同一commit/rollback unitで完了する。
- この条件を満たした後にだけstaging合格を判断する。production資源作成・deployはM7の別承認とする。

禁止:

- production資源作成
- 実ユーザー/実業務データ
- production deploy

## M6: Supabase退役

成果:

- 残存runtime、環境変数、harness、文書からSupabase依存を削除（旧live workflowの削除、runbookのStatus: Superseded化、canonical/renamed旧workflow再追加拒否はM5 replacement gateと対応docsがmainへ着地する同一commit/rollback unit内で完了し、M6へ持ち越さない）
- 不要なSupabase資格情報の失効
- 旧migration/RLS harnessを履歴またはarchiveへ整理
- #92の完了記録を維持し、M5で退役済みの旧gateについてIssue #95の完了記録と残存履歴を整理する

完了条件:

- Supabase runtime参照 0
- secret scanner成功
- staging回帰成功
- ownerが退役対象を確認

## M7: production準備

別承認でのみ実施する。

- production Access application
- production D1
- production R2 bindings
- GitHub Environment required reviewers
- backup/restore、監視、rollback
- 最初の外部ユーザー招待

production資源作成、migration、deploy、外部招待は同一承認へまとめず、それぞれ対象と証跡を確認する。
