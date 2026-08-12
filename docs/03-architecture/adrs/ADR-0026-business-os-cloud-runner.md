# ADR-0026: Business OS cloud runnerを既存Issue runnerと並設する

Status: Accepted

## Context

めっちゃマニュアルには `approved-for-codex` labelを起点とするIssue runnerがある。一方、Business OSのexecution target契約は、projectごとの署名job、予算、期限、許可path、event返送を必要とする。

既存runnerを直接置き換えると、Discord/GitHub Issue運用とBusiness OS automationの承認境界が混在する。

## Decision

既存Issue runnerを維持し、Business OS専用の `business-os-codex.yml` とtrusted clientを並設する。

- Issue runnerは人がIssueへ `approved-for-codex` を付けた場合だけ動く。
- Business OS runnerはOwner承認済みの署名jobだけをclaimする。
- 両経路ともmain直接push、production deploy、DB migration、secret変更を禁止する。
- Business OS runnerのbranch prefixは `codex/` とする。既存Issue runnerの `feature/issue-*` は変更しない。
- staging、production、migrationは既存の別workflowとOwner gateへ引き渡す。

## Consequences

automation経路は二つになるが、既存運用を壊さず段階移行できる。秘密情報は別管理になり、Business OS側はjob、予算、eventを一貫して監査できる。
