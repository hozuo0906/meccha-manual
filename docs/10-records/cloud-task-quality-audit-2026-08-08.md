# Codex Cloud変更 品質監査記録（2026-08-08）

Status: Accepted

## 対象と基準点

- Repository: `hozuo0906/meccha-manual`
- 監査開始時main: `88c5f336e1d24a04a6ed77bc104d26f332b7c1c6`
- 対象: リポジトリ作成からPR #26までの全PR、残存remote branch、Codex Task link、Codex review、main上のコード・文書・検査
- 方法: PR本文・head/merge関係・review thread・review対象SHA・Actions、全tracked file、migration/RLS、Stripe、R2、Browser Run、workflow、Discordを横断した。`npm ci`、`npm run check`、個別検査、`git diff --check`を基準にした。
- 制約: GitHub branch protection/rulesetは利用可能なGitHub連携から取得できず未検証。Supabase/R2/Browser Run/Stripeの実環境操作は承認対象のため実行していない。

PR #10と#18は存在しない。PR #22だけがclosed/unmergedで、主要目的はPR #21へ作り直されたが差分は完全同一ではない。ローカルだけに存在する未公開commitはGitHubから証明できないため、remote branch、PR、mainのcommit到達性までを監査範囲とした。

## 抽出したPR・タスク

| No | クラウドタスク | PR | ブランチ | 最終SHA | 状態 | main反映 | Codex review | 監査対象 |
|---|---|---|---|---|---|---|---|---|
| 1 | 運用/R2方針 | #1 | `feature/ops-side-context` | `abe9a159fe52` | merged | 有 | なし | 文書整合 |
| 2 | Discord Issue bridge | #2 | `feature/discord-issue-bridge` | `d7422e7bf33f` | merged | 有 | なし | 通知・Secret |
| 3 | Discord日本語通知 | #3 | `feature/japanese-discord-notifications` | `684d794ac550` | merged | 有 | なし | 通知失敗分離 |
| 4 | Discord command登録 | #4 | `feature/discord-command-registration` | `fad1049c4a01` | merged | 有 | なし | 外部通知 |
| 5 | ブランドasset | #5 | `feature/brand-assets` | `4d6c82c6a600` | merged | 有 | なし | asset/文書 |
| 6 | Discord ACK timeout | #6 | `feature/discord-interaction-ack-timeout` | `a66c3e069293` | merged | 有 | なし | timeout/再送 |
| 7 | Cloudflare監査 | #7 | `feature/japanese-pr-and-cloudflare-config` | `4e642ff9def2` | merged | 有 | なし | deploy/Secret |
| 8 | Discord通知test | #8 | `feature/discord-notify-test` | `b2ff52b784ca` | merged | 有 | なし | 通知失敗分離 |
| 9 | Cloudflare binding修正 | #9 | `feature/fix-cloudflare-runtime-bindings` | `90658d47d2b1` | merged | 有 | なし | runtime config |
| 11 | Issue label管理 | #11 | `feature/issue-label-management` | `e32d7cf8e5ce` | merged | 有 | なし | GitHub操作 |
| 12 | Issue→PR flow | #12 | `feature/issue-to-pr-flow` | `869259273500` | merged | 有 | なし | 自動PR |
| 13 | Discord PR bridge | #13 | `feature/discord-pr-merge-bridge` | `175bbd90a2c5` | merged | 有 | なし | 権限/通知 |
| 14 | 品質loop | #14 | `feature/quality-loop-harness` | `323532ed9f44` | merged | 有 | なし | 品質ゲート |
| 15 | R2方針harness | #15 | `feature/r2-storage-harness` | `7c1ae118b2da` | merged | 有 | なし | Storage契約 |
| 16 | Phase 1 gate | #16 | `feature/phase1-readiness-gate` | `a06405007359` | merged | 有 | なし | Auth/RLS |
| 17 | Codex Cloud readiness | #17 | `feature/cloud-codex-environment` | `931496c0604a` | merged | 有 | なし | Cloud task運用 |
| 19 | 確認済みCodex Task | #19 | `codex/advance-phase-1-authentication-workspace` | `a2df28eba995` | merged | 有 | P1×2未解決 | 最優先 |
| 20 | Issue event自動化 | #20 | `feature/issue-event-codex-automation` | `f0ce1404e9a9` | merged | 有 | なし | GitHub/Discord |
| 21 | 残harness作り直し | #21 | `feature/remaining-harness-docs` | `88ba60fa5a10` | merged | 有 | なし | #22置換先 |
| 22 | 確認済みCodex Task | #22 | `codex/add-documentation-for-harness-tasks` | `1ec6dd7fa368` | closed/unmerged | 無（#21へ一部置換） | P1×3/P2×2 | 置換差分確認 |
| 23 | 確認済みCodex Task | #23 | `codex/prepare-r2-storage-harness-implementation` | `7c0b234deb54` | merged | 有 | P2×4未解決 | R2最優先 |
| 24 | 確認済みCodex Task | #24 | `codex/establish-staging-and-production-separation-harness` | `775cfc9092d7` | merged | 有 | P2×3未解決 | delivery最優先 |
| 25 | R2画像削除未決 | #25 | `feature/r2-image-cleanup-question` | `5063aa636cb6` | merged | 有 | なし | 保持・削除 |
| 26 | 料金/Stripe Link | #26 | `feature/pricing-and-stripe-link` | `f1262e9d2e7b` | merged | 有 | P1×2/P2×4未解決 | 課金最優先 |

## 問題と判断

| No | 対象 | 優先度 | 問題 | 状態 | 根拠・影響 | 対応 |
|---|---|---|---|---|---|---|
| F-01 | #19 | P1 | hardeningが静的検査だけでowner/admin/anonymous動的経路を検査しない | 未修正→PR #29 | `test:rls`は越境readのみ | anonymous RPC、全不変fieldのnegative test |
| F-02 | #19 | P1 | Phase 2手順がhardening migrationを前提にしない | 未修正→PR #29 | hardening未適用でPhase 2へ進める | prerequisiteと検査追加 |
| F-03 | #22/#21 | P1 | DNS再解決だけでBrowser Runの実接続先を拘束しない | 未修正→PR #30 | DNS rebindingで内部到達可能 | actual peer/egress拘束、不能時fail closed |
| F-04 | #22 | P1 | スクリーンショットをmask前に保存し得る | 現mainでは再現しない | #21正本はmask失敗時R2保存禁止 | 追加修正なし |
| F-05 | #22 | P1 | FRトレーサビリティ誤り | 現mainでは再現しない | #21以後の表で修正済み | 追加修正なし |
| F-06 | #22/#26 | P2/P1 | billing OFFが既存Webhookまで止める | 未修正→PR #27 | 解約・返金が反映されない | 新規購入だけ停止 |
| F-07 | #23 | P2×4 | read shape、key/metadata、checksum、kindが不一致 | 未修正→PR #28 | 越境・破損・stub差 | domain契約とfake R2 test |
| F-08 | #24 | P2 | candidate SHAとstaging証跡が不十分 | 未修正→本PR | production候補を照合不能 | candidate checkoutとartifact照合 |
| F-09 | #24 | P2 | deploy禁止regexが間接command/actionを見逃す | 未修正→本PR | 未承認外部操作 | action/command allowlist |
| F-10 | #24 | P2 | secret検査がtoken形式を見逃す | 未修正→本PR | token漏洩 | 値非表示scanner |
| F-11 | #26 | P1 | reusable Payment Linkで支払だけ成立 | 未修正→PR #27 | 支払済み・権利なし | 短命Sessionと返金queue |
| F-12 | #26 | P2×4 | entitlement終了、旧Pro、downgrade、exportが曖昧 | 未修正→PR #27 | 誤権利・二重契約 | 状態遷移と安全側停止 |
| F-13 | #27再レビュー | P1×3/P2×1 | idempotency、Team置換、traceability、README旧仕様 | 一部修正→PR #27更新 | 二重Session等 | 修正・thread解決・再レビュー |
| F-14 | #28再レビュー | P2×3 | body mutation、metadata allowlist、kind exact set | 一部修正→PR #28更新 | checksum/正本不一致 | snapshotとexact set検査 |
| F-15 | 全PR | P1 | 最新SHAレビューを強制するゲートがない | 未修正→本PR | 再発原因 | AGENTS、template、fail-closed gate |
| F-16 | delivery/R2 docs | P2 | prelaunch shortcutとbucket作成申告が未反映 | 未修正→本PR | 公開前設定忘れ | 公開前強制checklist |
| F-17 | repository | P0 | 実Secret混入 | 現mainでは再現しない | tracked fileと履歴の代表patternで実値なし | scannerをcheckへ追加 |

## PR #26の6件

6件はすべて現在のmainに残っており誤検知ではなかった。PR #27で、(1) billing OFF中の既存Webhook継続、(2)短命Checkout Sessionと不正支払い返金、(3)`expired`遷移、(4)3プラン仕様、(5)Team契約中のPersonal安全側拒否、(6)R2 100%時は新規生成拒否・生成済みdownload許可へ修正した。再レビューで見つかった4件も同PRの次commitで修正した。外部Stripe設定とDB migrationは行っていない。

## 問題を確認しなかった領域

- PR #1〜#17、#20、#25: main到達性、現行workflow/static check、Secret/PII pattern、Discord通知の失敗分離、R2削除/保持のopen questionを確認した。今回の基準で追加P0/P1/P2は特定しなかった。
- closed/unmerged #22: 古いコードを復活させず、mainに残った安全要件だけをPR #27/#30/本PRで修正した。
- cherry-pick/作り直し: #24はmain上の同内容commitとして到達、#21は#22の置換先だが完全同一ではないため#22 reviewをmainへ再評価した。

## 外部環境で未検証

- PR #29のRLS negative test（検証DB書き込み承認が必要）。
- PR #28の実R2 upload/read/delete、署名URL、越境、削除再試行。
- PR #30のBrowser Run actual-peer/egressとDNS rebinding fixture。
- Stripe test mode Webhook/Checkout/reconciliation。
- GitHub branch protection/rulesetの現在値。推奨はPR必須、required checks、up-to-date、conversation resolution、bypass禁止、main直接push禁止。変更はowner承認後に行う。

## 残存仕様判断

- OQ-011/013/022/023: 画像・capture・未参照assetの保持、猶予、復元、物理削除。
- OQ-015〜017/024〜027: 席数、未払い、返金、計測、chargeback、未契約R2容量、Team→Personal置換。
- OQ-006/018: Browser Run egress方式、timeout、同時実行。

本監査の修正PRは自動mergeせず、各最新head SHAのCI、Codex再レビュー、P0/P1/P2、unresolved threadを再確認してowner判断を待つ。
