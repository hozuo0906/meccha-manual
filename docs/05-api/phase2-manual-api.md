# Phase 2 手順書一覧・作成API

Status: Accepted

対象: GitHub Issue #63 / FR-004

## 目的

Phase 1のHttpOnly Cookie sessionと既存Supabase RLS/RPCを使い、選択workspaceの手順書一覧取得と新規作成を提供する。

## API

### `GET /api/workspaces/{workspaceId}/manuals`

- 認証: Phase 1 HttpOnly Cookie session必須。
- 認可: active workspace member。
- 別workspace、非member、不正workspace ID（不正なpercent encodingを含む）は存在推測を避けて`404 MANUALS_NOT_FOUND`へまとめる。
- workspace IDはUUID検証後に小文字のcanonical formへ正規化し、RPC、PostgREST query、row境界比較で同一値を使う。
- `manuals`のうち`archived_at is null`だけを`updated_at desc`で取得する。
- 返却項目は`id`、`folderId`、`title`、`status`、`currentDraftRevisionId`、`currentPublishedRevisionId`、`updatedAt`だけとする。
- PostgRESTは`limit=1001` + `Prefer: count=exact`を使い、`Content-Range`と返却件数を照合する。
- 総数または返却件数が1000件を超えた場合は`409 MANUALS_LIMIT_EXCEEDED`とし、切り詰めた一覧を返さない。
- header欠落、件数不整合、不正なrow、過大/非JSONの上流応答は空一覧にせず502とする。
- 一覧本文は1000件・title最大64 code point・JSON最悪エスケープを含めて1 MiBで打ち切り、その他のSupabase JSON応答は512 KiBを維持する（[DEC-051](../09-delivery/decision-log.md)）。
- access token更新が必要な場合はCookieを変更せず`401 SESSION_REFRESH_REQUIRED`とする。
- Supabase URL/anon keyの読取・正規化は`server-config.ts`だけで行い、Phase 1とmanual routeで同じ設定境界を使う。
- Supabase応答はheader到着だけでtimeoutを解除せず、本文読取完了まで5秒deadlineを維持する。

成功:

```json
{
  "manuals": [
    {
      "id": "<uuid>",
      "folderId": null,
      "title": "入会受付手順",
      "status": "draft",
      "currentDraftRevisionId": "<uuid>",
      "currentPublishedRevisionId": null,
      "updatedAt": "2026-08-14T00:00:00.000Z"
    }
  ]
}
```

### `POST /api/workspaces/{workspaceId}/manuals`

- 認証: Phase 1 HttpOnly Cookie session必須。
- CSRF境界: same-origin `Origin`必須、`Content-Type: application/json`必須。
- bodyはストリーム読取中にも16 KiBで打ち切り、`Content-Length`が無いchunked bodyでも上限を迂回させない。
- titleはtrim後1〜64 Unicode code pointとし、WorkerとDB制約で同じ上限を強制する。
- active memberであることを確認した上で、owner/admin/editorのみ作成可能。viewerは`403 MANUAL_CREATE_FORBIDDEN`。
- 別workspace/非memberは403にせず`404 MANUALS_NOT_FOUND`。
- DB書込は既存`create_manual` RPCを利用し、manualとrevision 1のdraftを同一DB処理で作成する。
- `folderId`はnullまたはUUID。別workspace/不存在folderは`400 MANUAL_FOLDER_INVALID`。
- RPC送信後の通信切断、上流5xx、成功本文不正は作成済みの可能性があるため`502 MANUAL_CREATE_RESULT_UNKNOWN`とし、重ねて作成せず一覧確認を案内する。
- RPC不存在・schema不整合など、既知の入力不正でない上流4xxは`502 MANUAL_CREATE_SERVICE_UNAVAILABLE`として入力不正と区別する。

入力:

```json
{
  "title": "入会受付手順",
  "description": "受付担当者向け",
  "folderId": null
}
```

成功: `201`

```json
{
  "manualId": "<uuid>"
}
```

## 非対象

- manual詳細取得
- draft title/description更新
- step CRUD/並べ替え
- 公開
- Browser Run/R2
- 外部AI API
- production DB migration / production deploy

上記は後続Issueで扱う。

## テスト

`tests/manual-api.test.mjs`で少なくとも以下を固定する。

- member一覧正常系
- 大文字UUIDをcanonical lowercaseへ正規化した一覧正常系
- 非member 404
- viewer作成403
- editor作成正常系と`create_manual` RPC payload
- Content-Lengthなしの16 KiB超bodyを413
- 1000件超を409
- 1000件・JSON最悪エスケープが1 MiB以内で取得できる
- 作成上流5xxをresult unknownとして再送誘発しない
