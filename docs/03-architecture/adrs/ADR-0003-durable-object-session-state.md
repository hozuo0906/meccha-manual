# ADR-0003: Durable Objectをキャプチャセッション状態管理者にする

Status: Accepted

## 決定

1つの操作記録セッションにつき1つのDurable Objectを割り当て、Browser Run session ID、Live View URL発行、操作イベント連番、コマンド直列化、再接続、終了処理を管理する。

## 理由

操作記録は状態fulで、同時操作、再接続、終了処理、スクリーンショット保存の順序制御が必要です。通常のHTTPリクエストだけで扱うと、二重実行やイベント順序破損が起きやすくなります。

## 影響

- Durable Objectは一時状態の管理者。
- 永続データの正本はSupabase Postgres。
- Durable ObjectとPostgresの両方を同じ状態の正本にしない。
