# Prelaunch暫定運用と本番公開前ゲート

Status: Accepted

## 現在の暫定運用

2026-08-30時点で外部ユーザーと実業務データはまだ存在しないが、Issue #92で公開previewとbackend分離のP0が判明したため、暫定運用を次のように制限する。

- PR・作業branchはGitHub Actionsのrepo-side CIだけを自動実行してよい。
- Cloudflare Git integrationのnon-production branch buildは無効のまま維持し、PR pushからpreviewを自動生成しない。
- `main` のGit連携は `wrangler versions upload` だけを使用し、active deploymentへ自動promoteしない。immutable previewはCloudflare Accessのdeny-by-default、Cloudflare account members、preview専用service tokenで保護する。
- 旧 `Phase 1 RLS Live Gate` はSupersededであり、実行可能workflowをdefault branchから削除して再追加をCIで拒否する。Supabase test user作成、`MECCHA_RLS_*` secret追加、live RLS実行を行わない。
- 暫定Workerの `main` 自動deployを許可する旧prelaunch例外は停止済みである。Issue #92はcompleted closeされ、blanket main merge holdは解除済みである。各PRは通常品質ゲートを満たせばmainへ統合できるが、Issue #176 M5の実preview negative proof完了まではstaging合格、production資源作成・deploy、外部招待を禁止する。
- staging環境を毎回経由しないrepo-side開発確認は継続できるが、preview/staging合格やbackend分離の証跡には扱わない。

mainへの直接push、PR自動merge、DB migration自動適用、production資源作成、課金ON、AI API ON、共有リンク公開は許可しない。Cloudflare画面上の `production` という表示はGit連携上のラベルであり、本番公開準備完了の証拠にしない。

## 強制終了条件

次のいずれかが発生する前に暫定運用を終了する。

- ownerが「本番公開」「販売開始」「ユーザー募集」を指示する。
- 最初の外部ユーザーを招待・登録する。
- 実業務データ、顧客情報、課金objectを保存する。
- 独自ドメインやStripe live modeを有効化する。

## 本番公開前チェックリスト

- [x] Cloudflare `main` triggerをversion uploadだけにし、active deploymentへの自動promoteを解除した。
- [x] non-production branch buildが無効であり、immutable previewがAccess deny-by-default、Cloudflare account members、preview専用service tokenで保護されていることを確認した。
- [ ] GitHub Environment `staging` / `production` とrequired reviewersを確認する。
- [ ] main branch protectionでPR必須、status checks必須、up-to-date必須、conversation resolution必須、bypass禁止、直接push禁止を確認する。
- [ ] staging/production Access application、Worker、D1、R2、Secret、routeを物理分離する。
- [ ] staging workflowの候補SHA証跡とproduction workflowの同一SHA照合を通す。
- [ ] Access JWT、D1 workspace negative test、D1 migration dry-run/rollback、backup/restoreを検証する。
- [ ] review済みcandidate SHAの実immutable previewがstaging D1/R2だけをbindingし、production backendへ到達できないことを検証する。
- [ ] R2 private、workspace越境拒否、署名URL、削除再試行、容量上限を検証する。
- [ ] Browser Run SSRF actual-peer/egress、session破棄、入力値非保存を検証する。
- [ ] `BILLING_FEATURE_ENABLED=false`、AI API OFF、共有リンクdefault OFFを再確認する。
- [ ] 最新head SHAのCodex Review、P0/P1 0件、P2対応記録、unresolved thread 0件、全CI成功を確認する。
- [ ] 監視、障害通知、rollback責任者、データ保持・削除条件、プライバシー表示を確認する。

1項目でも未完了なら本番公開・外部ユーザー登録を開始しない。GitHub/Cloudflareの設定変更は現状と影響を報告し、owner承認後に行う。
