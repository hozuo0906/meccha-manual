# 環境とデリバリー

Status: Proposed

## 環境

| 環境 | 用途 |
|---|---|
| local | 最小確認。外部接続は原則モック |
| preview | PRごとの確認。Cloudflare/Supabase/Stripe testを使う |
| staging | 本番同等検証。Browser Run remote bindingを使う |
| production | 本番 |

## 環境変数台帳

実装前に `docs/08-operations/environment-variables.md` を作成し、次を分類します。

- public
- server
- secret

secretはCloudflare Secretとして管理し、クライアントに出しません。

## リリース

- PRごとに文書差分を確認する。
- migrationとRLS変更は専用テストを必須にする。
- 本番反映前にsmoke testを実行する。
- ロールバック手順をRunbookに残す。
