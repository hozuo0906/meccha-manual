# ADR-0019 Phase 1本番開発の着手前ゲート

Status: Superseded

実行禁止: ADR-0028、DEC-064、Issue #176により、本書は移行前Supabase/Postgres/RLS baselineである。新規Supabase project/user/secret、migration、remote write、live workflow、staging合格証跡の根拠にしない。後継はIssue #176 M1〜M3。

## 背景

めっちゃマニュアルは、ハーネス整備後にPhase 1のアプリ基盤、認証、ワークスペースへ進む。ただしユーザーから、GitHub上で本番開発に入る前はいったん承認を求めるよう指示がある。

## 決定

- Phase 1本番開発へ入る前に `Phase 1 Readiness Gate` を通す。
- `phase1-readiness:check` を `npm run check` に含める。
- ゲートは必要docs、Phase 1 migration、RLS negative test、Workerの認証API、service_role未使用を確認する。
- ゲート通過は着手許可ではない。着手許可はユーザー承認を正本にする。
- production反映、DB migrationの新規適用、課金変更、AI API有効化、共有リンク公開はこのゲートでは実行しない。

## 理由

- Phase 1は以降の全機能の土台であり、認証、RLS、ワークスペース境界の欠陥はP0につながる。
- 承認前に実装へ進むと、ユーザーの意図したAI駆動開発の監査線を越える。
- 自動チェックで準備状態を可視化し、ユーザーは承認判断だけに集中できる。

## 影響

- PRではPhase 1着手前ゲートが必須チェック候補になる。
- 本番開発へ入る直前に、親セッションはユーザーへ明示承認を求める。
- 承認後の最初の作業は、Phase 1のScope Checkから始める。
