# ADR-0004: Supabase Auth/Postgres/Storage/RLSを採用する

Status: Accepted

## 決定

Supabase Authを認証、Postgresを永続データ、Storageを画像/出力ファイル保存、RLSをテナント分離の最終防衛線として採用する。

## 理由

認証、DB、Storage、RLSを一体で扱えるため、初期構築と運用を簡潔にできる。日本ユーザー向けにSupabase東京リージョンを第一候補にできる。

## 影響

- 公開スキーマのテーブルはRLS必須。
- Storage bucketはprivateを基本にする。
- service role keyはCloudflare Workerのみで扱い、クライアントへ渡さない。
