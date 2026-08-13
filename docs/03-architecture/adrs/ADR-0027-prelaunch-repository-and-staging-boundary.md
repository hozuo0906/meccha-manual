# ADR-0027: prelaunch期間の公開リポジトリとstaging接続境界を固定する

Status: Accepted

## Context

Phase 1 prelaunchでは、現在の単一WorkerとSupabase projectを暫定dev/stagingとして利用している。一方、repository visibility、Workerの環境名、技術URL、Supabase接続先、課金flagが別々に管理されると、品質ゲートを通過してもproduction相当の外部資源へ誤接続する余地が残る。

また、リポジトリは現在publicであり、Issue #39で公開範囲の判断を明示的に確定する必要がある。

## Decision

- Phase 1 prelaunch期間は `hozuo0906/meccha-manual` をpublicのまま維持する。
- publicを維持する前提として、service role key、DB password、JWT Secret、実ユーザーPII、共有tokenなどの秘密値・実データをコミットしない。既存のsecret scanとPR品質ゲートを維持する。
- 現在の単一Workerはproductionではなく暫定stagingとして扱い、`APP_ENV=staging` をソース側で固定する。
- `APP_BASE_URL` は暫定Workerの技術URLだけを許可し、production custom domainを指さない。
- `BILLING_FEATURE_ENABLED=false` を固定し、Phase 1 prelaunchでは課金をfail closedにする。
- staging Workerの `SUPABASE_URL` は、承認済み暫定staging projectだけを指すようリポジトリ側runtime boundary harnessで固定する。具体的なproject refは運用文書へ重複記録しない。
- `SUPABASE_ANON_KEY` は承認済み公開anon keyのSHA-256 fingerprintとの完全一致をCIで検査し、あわせてJWT payloadのproject/role整合も確認する。service role等の強権credentialは許可しない。
- GitHub branch protection、required checks、up-to-date要求、conversation resolution、bypass禁止、GitHub Environment required reviewersは外部管理設定として別途監査し、リポジトリ内の静的設定だけで完了扱いにしない。

## Consequences

- staging Workerがproduction Supabaseへ接続してもCIが成功する、という取り違えを防げる。
- public repositoryを継続できるが、秘密値や実データを置けるという意味ではない。
- 将来production Supabase/Workerを作成する際は、staging用allowlistを変更するのではなく、production用の設定・deploy gateを別系統で定義する必要がある。
- repository visibilityをprivateへ変更する必要が生じた場合は、別の明示判断として記録する。

## Rollback

このADRでproduction資源は作成・変更しない。staging境界の変更で不具合が出た場合はPRをrevertし、直前の暫定Worker設定へ戻す。ただしbilling ON、production Supabase、production custom domainへのfallbackはrollback手段として使わない。
