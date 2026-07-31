# ADR-0005: 公開版を不変revisionとして扱う

Status: Accepted

## 決定

手順書は `manuals` を論理本体、`manual_revisions` を版として扱う。公開時に不変の公開revisionを作り、以後の編集は下書きrevisionで行う。

## 理由

共有URL、PDF、分析、コメントが参照する内容を安定させるため。公開版と下書きが混ざると、閲覧者が見た手順と作成者の編集中内容が食い違います。

## 影響

- 公開版の直接更新は禁止。
- 共有リンクは公開revisionを参照する。
- 再公開時は新しいrevisionを発行する。
