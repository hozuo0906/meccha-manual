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
- 旧Supabase RLS live gateは移行前baselineとしてSupersededとし、新規Supabase test user、資格情報、live runを追加しない。

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
- Supabase前提文書のSuperseded表示
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
- 検証済みsubjectからapplication identityを解決する最小contract
- 未招待・disabled identityの拒否
- email、JWT、OTPをログへ出さない検査

禁止:

- 独自password
- 未検証headerの信用
- production Access変更
- 旧Supabase経路へのfallback

## M2: D1 workspace boundary

成果:

- staging用D1 schema/migration
- identities、profiles、workspaces、workspace_members、join codes、audit logs
- workspace固定repository API
- 別workspace、viewer、disabled、last-owner、ID差し替えnegative test
- backup/export/restore rehearsal
- staging/production binding分離scanner

完了条件:

- Worker認可とD1制約の両方を破壊するmutation testが失敗する
- workspace条件なしqueryを静的検出する
- stagingだけで動的negative testが成功する

M2のscanner、repository negative test、staging D1 testはM5の実preview証跡に向けた準備であり、staging合格やproduction準備開始の根拠にはしない。

## M3: Phase 1移行

成果:

- Accessログイン/再認証/ログアウトUX
- session、workspace、member API/UIのD1化
- 複数タブ、古い応答、結果不明、途中失敗の回帰
- Supabase Auth、refresh token、PostgREST/RPC依存の削除

完了条件:

- Phase 1 E2Eとアクセシビリティ成功
- 4ロールと未招待/停止/越境negative test成功
- Supabase runtime fallback 0

## M4: Phase 2 manual移行

成果:

- manuals、revisions、stepsのD1 schema
- create/edit/reorder/publish/next draft/archiveのD1対応atomic operation
- optimistic version、公開版不変、200 step上限
- API/UI/E2Eと途中失敗回帰

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

完了条件:

- review済みcandidate SHAからversion upload-onlyで実immutable previewを作成する。
- 未認証requestがAccessで拒否される。
- Access認証後もstaging D1/R2だけが利用可能で、production binding、route、secret、backendへのfallbackまたは到達経路がないことをnegative proofで確認する。
- candidate SHA、Access policy、D1 migration履歴、R2 bindingの対応を値非表示で照合する。
- この条件を満たした後にだけstaging合格を判断する。production資源作成・deployはM7の別承認とする。

禁止:

- production資源作成
- 実ユーザー/実業務データ
- production deploy

## M6: Supabase退役

成果:

- runtime、workflow、環境変数、文書からSupabase依存を削除
- 不要なSupabase資格情報の失効
- 旧migration/RLS harnessを履歴またはarchiveへ整理
- #92の完了記録を維持し、#95と旧Supabase gateのclose／supersede判断を行う

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
