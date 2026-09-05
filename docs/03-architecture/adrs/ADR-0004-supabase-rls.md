# ADR-0004: Supabase Auth/Postgres/RLSを採用する

Status: Superseded

Superseded by [ADR-0028](ADR-0028-cloudflare-access-d1.md)。以下は移行前の判断記録として保持する。

## 決定

Supabase Authを認証、Postgresを業務データとファイルメタデータの正本、RLSをテナント分離の最終防衛線として採用する。ファイル本体の保存先はADR-0011に従いCloudflare R2を第一候補にする。

## 理由

認証、DB、RLSを一体で扱えるため、テナント分離をDB層まで一貫できる。日本ユーザー向けにSupabase東京リージョンを第一候補にできる。

## 影響

- 公開スキーマのテーブルはRLS必須。
- R2 bucketはprivateを基本にし、ファイル参照時もPostgresメタデータによる認可を通す。
- service role keyはCloudflare Workerのみで扱い、クライアントへ渡さない。
