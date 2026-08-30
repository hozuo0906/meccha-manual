# Cloudflare Access / D1移行ロードマップ

Status: Accepted

## 目的

Issue #176とADR-0028に基づき、Supabase Auth/Postgres/RLS前提の実装をCloudflare Access/Workers/D1へ段階移行する。各マイルストーンは独立PRとし、前段のP0/P1、CI、review threadが解消するまで次へ進まない。

## 現在地

- Cloudflare Workers、preview Access保護、R2方針、Browser Run fail-closed基盤は継続利用する。
- Supabase Auth、Postgres migration、RLS、RPC、PostgRESTを使うPhase 1/2実装は移行前baselineとして存在する。
- production D1、production Access application、実データ、外部ユーザーは未作成・未移行である。
- PR #175でmainへ取り込まれたAccess保護とproduction自動promote停止は移行中も維持する。Supabase RLS live gateはIssue #176 M2のD1境界gateへ置換する。
- 全PRのmain merge holdはIssue #92と本移行の安全gateが整理されるまで維持する。

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
- create/edit/reorder/publish/next draft/archive transaction
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

禁止:

- production資源作成
- 実ユーザー/実業務データ
- production deploy

## M6: Supabase退役

成果:

- runtime、workflow、環境変数、文書からSupabase依存を削除
- 不要なSupabase資格情報の失効
- 旧migration/RLS harnessを履歴またはarchiveへ整理
- #92/#95と旧PRのclose/supersede判断

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
