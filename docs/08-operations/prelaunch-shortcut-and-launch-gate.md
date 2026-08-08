# Prelaunch暫定運用と本番公開前ゲート

Status: Accepted

## 現在の暫定運用

2026-08-08時点で、ownerから外部ユーザーと実業務データがまだ存在しないとの申告がある。この期間だけ、開発速度を優先して次を暫定許可する。

- PR・作業branchのCloudflare non-production build。
- PR、必須check、最新head SHAのレビューを通過して`main`へマージした後の暫定Worker自動deploy。
- staging環境を毎回経由しない開発確認。

mainへの直接push、PR自動merge、DB migration自動適用、production資源作成、課金ON、AI API ON、共有リンク公開は許可しない。Cloudflare画面上の`production`という表示はGit連携上のラベルであり、本番公開準備完了の証拠にしない。

## 強制終了条件

次のいずれかが発生する前に暫定運用を終了する。

- ownerが「本番公開」「販売開始」「ユーザー募集」を指示する。
- 最初の外部ユーザーを招待・登録する。
- 実業務データ、顧客情報、課金objectを保存する。
- 独自ドメインやStripe live modeを有効化する。

## 本番公開前チェックリスト

- [ ] Cloudflare `main`自動deployを解除し、staging合格SHAだけをproduction候補にする。
- [ ] GitHub Environment `staging` / `production` とrequired reviewersを確認する。
- [ ] main branch protectionでPR必須、status checks必須、up-to-date必須、conversation resolution必須、bypass禁止、直接push禁止を確認する。
- [ ] staging/production Worker、Supabase project、R2 bucket、Secret、routeを物理分離する。
- [ ] staging workflowの候補SHA証跡とproduction workflowの同一SHA照合を通す。
- [ ] RLS negative test、migration dry-run/rollback、backup/restoreを検証する。
- [ ] R2 private、workspace越境拒否、署名URL、削除再試行、容量上限を検証する。
- [ ] Browser Run SSRF actual-peer/egress、session破棄、入力値非保存を検証する。
- [ ] `BILLING_FEATURE_ENABLED=false`、AI API OFF、共有リンクdefault OFFを再確認する。
- [ ] 最新head SHAのCodex Review、P0/P1 0件、P2対応記録、unresolved thread 0件、全CI成功を確認する。
- [ ] 監視、障害通知、rollback責任者、データ保持・削除条件、プライバシー表示を確認する。

1項目でも未完了なら本番公開・外部ユーザー登録を開始しない。GitHub/Cloudflareの設定変更は現状と影響を報告し、owner承認後に行う。
