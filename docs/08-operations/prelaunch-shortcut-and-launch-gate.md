# Prelaunch暫定運用と本番公開前ゲート

Status: Accepted

## 現在の暫定運用

2026-08-30時点で外部ユーザーと実業務データはまだ存在しないが、Issue #92で公開previewとbackend分離のP0が判明したため、暫定運用を次のように制限する。

- PR・作業branchはGitHub Actionsのrepo-side CIだけを自動実行してよい。
- Cloudflare Git integrationのnon-production branch buildは無効のまま維持し、PR pushからpreviewを自動生成しない。
- `main` のGit連携は `wrangler versions upload` だけを使用し、active deploymentへ自動promoteしない。immutable previewはCloudflare Accessのdeny-by-default、Cloudflare account members、preview専用service tokenで保護する。
- `Phase 1 RLS Live Gate` は現行Accepted transitional gateとして、Issue #176 M5のAccess/D1/R2 replacement gateと対応正本が同じrollback単位でmainへ着地するまで維持する。実行はowner承認済みの既存staging/test契約とcanonical workflowに限定し、M5着地時に同じrollback単位で置換する。新規Supabase test user、`MECCHA_RLS_*` secret、環境追加、production実行は行わない。
- 暫定Workerの `main` 自動deployを許可する旧prelaunch例外は停止済みである。Issue #92はcompleted closeされ、blanket main merge holdは解除済みである。各PRは通常品質ゲートを満たせばmainへ統合できるが、Issue #176 M5の実preview negative proof完了まではstaging合格、production資源作成・deploy、外部招待を禁止する。
- staging環境を毎回経由しないrepo-side開発確認は継続できるが、preview/staging合格やbackend分離の証跡には扱わない。

mainへの直接push、PR自動merge、DB migration自動適用、production資源作成、課金ON、AI API ON、共有リンク公開は許可しない。Cloudflare画面上の `production` という表示はGit連携上のラベルであり、本番公開準備完了の証拠にしない。

## Release-mode review policy

pre-commercial開発では、レビューを完全無欠にすること自体を目的化せず、安全にユーザー価値をmainへ届けることを優先する。

- **P0** はrelease blockerとし、merge前に必ず解消する。
- **P1** はrelease blockerとし、merge前に必ず解消する。
- **P2** は原則としてrelease blockerにしない。対応状況を記録し、必要に応じてfollow-up Issueへ移管してmain統合を継続できる。
- ただしP2でも、security/privacy境界、データ破損・データ損失、重大なユーザー影響、不可逆操作、production/external operationの安全性に直結する場合はrelease blockerとして扱う。
- severity表記だけでリスクを過小評価しない。実質的にP0/P1相当のリスクをP2 deferとして隠してはならない。
- merge時は未解決review threadを0件にする。deferするfindingはfollow-up Issueへの参照と判断理由をthreadへ残してresolveする。
- required CIと`PR Latest Review Gate`はgreenを必須とし、release速度を理由にgateを緩和・skipしない。
- Codex Reviewはmerge対象のexact head SHAに対して完了しており、reviewed SHAとmerge target SHAが一致していることを必須とする。
- production deploy、production Access/D1/R2変更、Stripe live/Billing有効化、secret変更、Chrome Web Store一般公開など、別承認が必要なexternal operationはこのrelease-modeでは自動承認しない。

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
- [ ] R2 private、workspace越境拒否、業務assetの毎回Access/D1再検証Worker proxy、失効後新規request拒否、削除再試行、容量上限を検証する。
- [ ] Browser Run SSRF actual-peer/egress、session破棄、入力値非保存を検証する。
- [ ] `BILLING_FEATURE_ENABLED=false`、AI API OFF、共有リンクdefault OFFを再確認する。
- [ ] 最新head SHAのCodex Review、P0/P1 0件、P2対応記録、unresolved thread 0件、全CI成功を確認する。
- [ ] 監視、障害通知、rollback責任者、データ保持・削除条件、プライバシー表示を確認する。

1項目でも未完了なら本番公開・外部ユーザー登録を開始しない。GitHub/Cloudflareの設定変更は現状と影響を報告し、owner承認後に行う。
