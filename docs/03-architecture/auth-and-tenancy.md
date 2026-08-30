# 認証とテナント

Status: Accepted

## 認証

Cloudflare AccessのメールOTPを招待制ログインの前段に使う。Access policyは明示Emails/Groups allowlistで固定し、One-time PINをlogin methodに選ぶだけで全メール利用者を許可しない。

Workerは `Cf-Access-Jwt-Assertion` の署名、algorithm、issuer、audience、not-before、expirationを検証する。検証後のactorを `access_user | service_token` として分類する。

- `access_user`: 空でない `sub` を必須にし、D1のactive identityへ `issuer + subject` で解決する。
- `service_token`: 空の `sub` または `common_name` を持つmachine actor。明示allowlistしたhealth routeだけに許可する。
- service tokenをapplication user、workspace member、roleへ昇格させず、session/workspace/manual APIとidentity bootstrapを403にする。
- email、任意header、Access到達成功だけを業務認証として信用しない。
- JWT、OTP、Access cookie、password、refresh tokenをD1、ログ、ブラウザJavaScriptへ保存・複製しない。

## テナント境界

全ユーザーはD1のapplication identityを持ち、業務データ操作時はactiveなworkspace membershipを必要とする。Accessへ到達できても、未招待、未登録、disabled、未所属、停止中は業務APIを拒否する。

認可は次の4層で行う。

1. Access: アプリへの到達可否。
2. Worker: 検証済み `access_user`、active identity、membership、owner/admin/editor/viewer、resource workspace、期待versionを照合。
3. D1 repository: actor IDとworkspace IDを必須にした用途別のworkspace固定D1 queryだけを公開し、resource ID単独の汎用更新・削除を作らない。
4. D1 constraints: foreign key、unique、CHECK、version、atomic batchで不変条件を強制。

Access到達やUI表示を認可根拠にしない。別workspace、viewer mutation、disabled、ID差し替え、last-owner、競合、途中失敗、結果不明をnegative/mutation testへ含める。

## ロール

- owner: 全管理。最低1名を維持する。
- admin: メンバー管理と多くの設定変更。
- editor: 手順書作成、編集、公開。
- viewer: 閲覧のみ。

owner付与・移管は専用のAcceptedフローができるまで拒否する。参加コードは本人が発行する短命・単回・digest-only credentialとし、Worker認可とD1 atomic operationで消費する。

移行前Supabase Auth/Postgres/RLS実装は履歴baselineであり、新規user/secret/data/migration/live testへ使用しない。正本はADR-0028、D1データ・認可境界、Cloudflare Access / D1 API移行契約である。
