# 認証とテナント

Status: Accepted

## 認証

Cloudflare Accessを人間ユーザーの本人確認前段として使う。商用MVPでは、価値体験後のセルフサーブ登録を成立させるため、productionの一般利用者向けAccess applicationではOne-time PINをlogin methodとして利用し、`Login Methods: One-time PIN` によって有効なメールアドレスを持つ利用者がAccess認証までは到達できるpolicyを意図的に採用する。

これは業務認可を全メール利用者へ開放する意味ではない。Cloudflare Accessの到達許可は「メールを受信できる人間主体の本人確認」に限定し、application identity、workspace、manualその他の業務アクセスはWorker/D1側でdeny-by-defaultとする。

環境ごとのpolicyを分離する。

- development/staging: ownerが承認したEmails/Groups allowlistを維持し、一般セルフサーブを有効化しない。
- production商用MVP: 一般利用者向けself-hosted applicationだけ、One-time PINで有効なメール利用者の認証到達を許可する。stagingとapplication、policy、audienceを共有しない。
- machine/health route: service token用の別application/policyを維持する。
- Stripe/Discord callback: exact path別境界を維持し、一般OTP policyやservice token policyへ混ぜない。

productionの一般OTP policyは外部公開設定であり、production公開時の明示承認境界に従う。公開前にrate limit、監視、停止手順を確認する。

Workerは `Cf-Access-Jwt-Assertion` の署名、algorithm、issuer、audience、expiration、issued-atを検証し、not-beforeはclaimが存在する場合に検証する。検証後のactorを `access_user | service_token` として分類する。

- `access_user`: `type: "app"`、trim後非空の `sub`、`common_name` 不在の3条件すべてを必須にする。application identityの正本は検証済み `issuer + subject` とする。
- `service_token`: `type: "app"`、空文字の `sub`、trim後非空の `common_name` の3条件すべてを必須にするmachine actor。明示allowlistしたhealth routeだけに許可する。
- 空の `sub` だけ、`sub` 不在、`common_name` だけ、または非空 `sub` と `common_name` の併存は曖昧なactorとして全routeで拒否する。
- service tokenをapplication user、workspace member、roleへ昇格させず、session/workspace/manual APIとself-service bootstrapを403にする。
- email、任意header、Access到達成功だけを業務認証として信用しない。
- JWT、OTP、Access cookie、password、refresh tokenをD1、ログ、ブラウザJavaScript、Chrome拡張へ保存・複製しない。

## Self-service bootstrap例外

検証済みの `access_user` がD1 application identityとして未知でも、商用MVPでは次のrouteだけをself-service provisioning入口として許可する。

- `POST /api/onboarding/bootstrap`

この例外は業務API全体の許可ではない。

- 未登録の検証済みaccess_userはbootstrap以外のsession/workspace/manual/share/billing APIを403で拒否する。
- bootstrapは検証済み `issuer + subject` を正本にする。email一致だけでidentityを作り直す、移動する、統合する、disabled/retired identityを復活させることを禁止する。
- identity、profile、Personal Workspace、active owner membership、auditを単一のD1 atomic operation/batchで確定する。
- `issuer + subject` とPersonal Workspaceの一意境界により、並行bootstrapでも二重作成しない。
- bootstrap操作はoperation IDで冪等にし、応答消失時は同じoperationを照合する。
- productionではbootstrap endpointへserver-side rate limitを適用し、少なくとも検証済みactorと接続元のabuse signalを用いて短時間大量実行を抑止する。rate limitの具体値はproduction公開前に負荷・誤検知を確認して固定する。
- guest manual本文やscreenshotをbootstrap requestへ含めないため、bootstrap abuseで匿名R2/D1 contentを量産できない。
- 1 human identityにつき初期Personal Workspaceは1つとし、追加workspace作成は認証後の別機能・上限契約へ従う。

詳細はADR-0032と `docs/05-api/guest-onboarding-and-claim-api.md` を正とする。

## External provider callback例外

`POST /v1/webhooks/stripe` と `POST /v1/integrations/discord/interactions` は、exact pathごとのpath別Access Bypassで外部providerからの到達だけを許可する。hostname全体、共通prefix、wildcard pathへBypassを適用しない。

Bypassは到達だけを許可し、認証・認可の代替にしない。Workerはexact POST/body上限、raw bodyのprovider署名・署名対象timestampの副作用なし検証、有界parse/schema・allowlist検証の後、provider ID、payload digest、receiptと再実行可能なwork/outboxを単一のatomic operationで保存する。guard commit成功後だけproviderへ成功応答し、Queue、外部API、業務D1、entitlementその他の副作用へ進める。receiptは `received/processing/retryable/reconcile_required/completed/dead_letter` で管理し、同じID・digestの再送は既存workを状態別に維持・再開・照合・冪等successとする。callbackを `access_user | service_token`、D1 identity、workspace membershipへ写像しない。通常ブラウザwrite APIだけに同一Originを必須とし、この2 callbackでは `Origin` で認証しない。通常アプリAPIと `GET /health/config` は引き続きAccessで保護する。OQ-031完了前はBypassを有効化しない。

M2ではこの2つのexact POST pathを常時 `503 CALLBACK_MIGRATION_IN_PROGRESS` とし、body読取、署名処理、KV／Queue／D1、外部fetch、`waitUntil`、成功ackを行わない。上記callback契約はC1で再開し、path別Access BypassはOFFを維持する。

## テナント境界

認証後の業務データはD1 application identityとactive workspace membershipへ固定する。

Accessへ到達できたactorを次の2状態へ分ける。

1. 未登録だが検証済みhuman `access_user`: self-service bootstrap routeだけ許可する。その他の業務APIは403。
2. active application identity: active membership/roleを持つworkspaceの業務APIだけ許可する。

disabled、retired、停止member、別workspace、role不足は従来どおり拒否する。

認可は次の4層で行う。

1. Access: 人間／machineとしてアプリへ到達できるか。production self-service policyは本人確認前段であり業務認可ではない。
2. Worker: 検証済みactor、application identity状態、membership、owner/admin/editor/viewer、resource workspace、期待versionを照合。未登録humanはbootstrap以外403。
3. D1 repository: actor IDとworkspace IDを必須にした用途別のworkspace固定D1 queryだけを公開し、resource ID単独の汎用更新・削除を作らない。
4. D1 constraints: foreign key、unique、CHECK、version、atomic batchで不変条件を強制。

Access到達やUI表示を認可根拠にしない。別workspace、viewer mutation、disabled、ID差し替え、last-owner、競合、途中失敗、結果不明、未知identityの非bootstrap APIをnegative/mutation testへ含める。

## ロール

- owner: 全管理。最低1名を維持する。
- admin: メンバー管理と多くの設定変更。
- editor: 手順書作成、編集、公開。
- viewer: 閲覧のみ。

初回Personal Workspaceのownerはself-service bootstrapでserver側が付与する。owner付与・移管の一般UIは専用のAcceptedフローができるまで拒否する。Team参加コードは本人が発行する短命・単回・digest-only credentialとし、Worker認可とD1 atomic operationで消費する。

移行前Supabase Auth/Postgres/RLS実装は履歴baselineであり、新規user/secret/data/migration/live testへ使用しない。正本はADR-0028、ADR-0032、D1データ・認可境界、Cloudflare Access / D1 API移行契約である。
