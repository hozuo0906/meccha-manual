# ADR-0042: 手順書のアーカイブからの復元

Status: Accepted

Date: 2026-11-08

## 背景

FR-004の非破壊アーカイブはrevision pointerと内容を保持するが、OQ-028により復元と物理削除を保留していた。削除は破壊的操作であり、復元可能性の確保が削除設計の前提条件だったため、復元を先に有効化する。

## 決定

- 対象は`status = 'archived'`かつ`archived_at IS NOT NULL`の手順書だけとする。
- 権限はアーカイブと同じowner / admin / editorとし、viewerは拒否する。
- 同じworkspace・manualの最新の`manual.archived`監査の`metadata.previousStatus`へ正確に戻す。許容値はdraft / reviewing / published / staleだけとし、監査なし・欠落・不正値では`manual restore state unknown`でfail closedにする。監査の最新順は`created_at DESC, id DESC`とする。同時刻の監査で状態が異なる場合も推測せず拒否する。
- 物理削除・自動削除が無効な間、アーカイブ済み手順書は無期限に保持し、復元期限を設けない。
- `expectedUpdatedAt`によるmanual更新時刻のCASを必須にする。不一致は競合エラーとし、古い操作を適用しない。
- revision・手順・asset・revision pointerは変更しない。共有リンクも変更しない。失効済みリンクは失効のまま、未失効かつ期限内のリンクは`archived_at`の解消により再び有効になる。既存のパスコード・権限等の共有境界は維持する。
- 同じtransactionで`manual.restored`を`audit_logs`へ記録し、metadataに`restoredStatus` / `draftRevisionId` / `publishedRevisionId`を含める。
- `restore_manual`はSECURITY DEFINER RPCとし、認証、workspace_idと手順書の所属一致、`has_workspace_role`を必須にする。manual rowをFOR UPDATEでlockし、transaction-localな`app.manual_publish_context`を使う。RLSポリシーは変更しない。
- UIはarchived詳細を表示できた場合に復元ボタンと確認を表示し、アーカイブ前の状態と共有リンクの再有効化を案内する。通常一覧・詳細からarchivedを隠す既存の取得境界は変更しない。アーカイブ一覧・専用取得経路は今回の対象外とし、通常画面からの到達は別途決定する。

## 物理削除との境界

物理削除・自動削除は今回も有効化しない。猶予期間、参照削除の順序、監査保持、再試行を別のADRで確定するまで、OQ-028の物理削除部分は未解決として残す。本決定は削除API・RPC・UI・cronの追加を承認しない。

## 検証と影響

SQLで状態復帰・監査・CAS・権限・workspace越境・二重復元・監査不明の拒否を確認する。Workerではsame-origin、認証、method、入力、RPCエラーと結果不明を確認し、UIではarchived時の編集禁止・復元確認・再読込を検証する。移行前Supabase/Postgres baselineの復元を対象とし、D1への移植やremote migration適用を含めない。
