# Phase 2 手順書draft・step編集API

Status: Accepted

対象: GitHub Issue #64 / #74 / FR-004 / FR-005 / FR-006

## 前提

- #63の`GET/POST /api/workspaces/{workspaceId}/manuals`を土台にする。
- Phase 1のHttpOnly Cookie session、same-origin write、Supabase RLSを維持する。
- viewerは閲覧のみ。owner/admin/editorだけがmutationできる。
- 別workspace、非member、不正IDは存在推測を避けて404へまとめる。
- published / superseded revisionを直接更新しない。
- 外部AI APIは利用しない。
- すべてのwriteはWorker経由とし、`manuals`、`manual_revisions`、`manual_steps`の対応するdirect DML権限を閉じる。

## 共通上限

- write bodyはContent-Lengthの有無にかかわらず16 KiBで打ち切る。
- 詳細は最大200 active stepsとする。201件以上は切り詰めず`409 MANUAL_STEPS_LIMIT_EXCEEDED`。
- 詳細のSupabase JSONは、200 active stepsの最大フィールド長を安全に読める6 MiBで打ち切る。その他のSupabase JSONは512 KiBを維持する（DEC-052）。
- draft descriptionは10,000文字、step titleは128文字、instructionは4,000文字、targetTextは256文字、URLは2,048文字を上限とする。
- title/targetTextはECMAScript `trim()`相当後に空となる値をDBでも拒否する。
- URLはHTTP/HTTPSのみとし、userinfoを含むURLを拒否する。URLをサーバー側から取得・実行しない。

## API

### `GET /api/workspaces/{workspaceId}/manuals/{manualId}`

現在manual、current draft revision、active steps、編集可否を返す。

- member全ロールが閲覧可能。
- manualがworkspaceに属さない、archived、非memberの場合は404。
- draftが無い場合は`draft: null`、`steps: []`を返す。
- stepは`position asc`、`deleted_at is null`だけを返す。
- published/superseded revisionを編集対象として返さない。
- `annotation`、`masking`、`assetId`など内部更新項目はレスポンスへ公開しない。

成功例:

```json
{
  "manual": {
    "id": "<uuid>",
    "title": "入会受付手順",
    "status": "draft",
    "currentDraftRevisionId": "<uuid>",
    "currentPublishedRevisionId": null,
    "updatedAt": "2026-08-14T00:00:00.000Z"
  },
  "draft": {
    "id": "<uuid>",
    "revisionNo": 1,
    "title": "入会受付手順",
    "description": "受付担当者向け",
    "updatedAt": "2026-08-14T00:00:01.000Z"
  },
  "steps": [
    {
      "id": "<uuid>",
      "position": 0,
      "type": "action",
      "title": "保存する",
      "instruction": "［保存ボタン］をクリックします。",
      "actionType": "click",
      "targetText": "保存ボタン",
      "url": null,
      "updatedAt": "2026-08-14T00:00:02.000Z"
    }
  ],
  "permissions": {
    "canEdit": true
  }
}
```

### `PATCH /api/workspaces/{workspaceId}/manuals/{manualId}/draft`

current draftのtitle/descriptionを更新する。

- same-origin `Origin`と`Content-Type: application/json`を必須にする。
- owner/admin/editorのみ。
- titleはtrim後1〜64文字、descriptionは10,000文字以内。
- titleとdescriptionを両方送信し、`update_manual_draft` RPCで`manuals.title`とcurrent draftのtitle/descriptionを同一transactionで更新する。
- current draftが無い場合は409で、新しいdraft作成フローを案内する。
- revision stateがdraftでない場合は409。
- 通信切断、上流5xx、成功本文不正は`MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN`とし、自動再送せず詳細再取得で確認する。

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/steps`

current draft末尾へstepを追加する。

- same-origin `Origin`と`Content-Type: application/json`を必須にする。
- owner/admin/editorのみ。
- DB書込は`append_manual_step` RPCを利用する。
- RPCはdraft revision rowを`FOR UPDATE`でlockしてposition採番を直列化する。
- `type`: `action | note | decision | warning`。
- `actionType`: `click | input | select | navigate | wait | other | null`。
- titleは必須。instructionは任意。
- `targetText`は対象名だけを扱い、入力値そのものを受け取らない。`value`、password、token、カード番号等の未定義項目は400で拒否する。
- action stepでinstructionが未入力の場合だけFR-006のローカルテンプレート候補を初期値として使える。
- 一度ユーザーがinstructionを保存した後、`targetText`/`actionType`変更で勝手に上書きしない。
- 外部AI API呼び出しは禁止。
- 結果不明は`MANUAL_STEP_CREATE_RESULT_UNKNOWN`とし、自動再送しない。

### `PATCH /api/workspaces/{workspaceId}/manuals/{manualId}/steps/{stepId}`

current draft上のstep内容を部分更新する。

- same-origin `Origin`と`Content-Type: application/json`を必須にする。
- owner/admin/editorのみ。
- DB書込は`update_manual_step` RPCを利用し、append/delete/reorderと同じdraft revision rowをlockする。
- `position`、`workspace_id`、`revision_id`、`created_by`、`assetId`、`annotation`、`masking`等は入力として受け付けない。
- current draftに属するactive stepだけを更新する。
- instructionが入力に含まれない場合、保存済みinstructionを保持し、ローカル候補で上書きしない。
- 結果不明は`MANUAL_STEP_UPDATE_RESULT_UNKNOWN`とし、自動再送せず詳細再取得で確認する。

### `DELETE /api/workspaces/{workspaceId}/manuals/{manualId}/steps/{stepId}`

UI上のstep削除をsoft deleteとして実装する。

- same-origin `Origin`を必須にする。
- owner/admin/editorのみ。
- DB書込は`soft_delete_manual_step` RPCを利用し、他のstep mutationと同じdraft revision rowをlockする。
- 物理DELETEせず`deleted_at`を設定する。
- active step以外は404相当。
- 削除後にpositionを自動詰めしない。次の明示的reorderで0始まり連番へ正規化する。
- 結果不明は`MANUAL_STEP_DELETE_RESULT_UNKNOWN`とし、自動再送しない。

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/steps/reorder`

全active stepの順序を1回のDB transactionで置き換える。

入力:

```json
{
  "orderedStepIds": ["<uuid>", "<uuid>"]
}
```

- same-origin `Origin`と`Content-Type: application/json`を必須にする。
- owner/admin/editorのみ。
- `reorder_manual_steps` RPCを利用し、他のstep mutationと同じdraft revision rowをlockする。
- current draftの全active step IDを重複なく、過不足なく1回ずつ送る。
- UUIDはlowercase canonical formへ正規化する。
- 別revision、deleted step、重複、欠落、余分なIDは全体を失敗させる。
- unique position制約との衝突を避けるため、RPC内で一時positionへ退避してから0始まり連番にする。
- 結果不明は`MANUAL_STEP_REORDER_RESULT_UNKNOWN`とし、詳細再取得を要求して自動再送しない。

## FR-006

FR-006の文章生成は常にローカル決定的処理とする。

例:

- `保存ボタン` + `click` → `［保存ボタン］をクリックします。`
- `メールアドレス欄` + `input` → `［メールアドレス欄］に入力します。`

入力値そのもの、password、カード番号、token、個人番号を文章生成関数へ渡さない。将来FR-020を実装してもFR-006を外部AIへ切り替えない。

## DB migration境界

`202608140010_phase2_manual_step_mutations.sql`は次を追加する。

- `append_manual_step`
- `update_manual_step`
- `soft_delete_manual_step`
- `reorder_manual_steps`

`202608140012_phase2_manual_edit_http_contract.sql`は次を追加・強化する。

- `update_manual_draft`
- draft descriptionとstep本文フィールドの上限constraint
- step title/targetTextの空白のみ拒否constraint
- `manuals`と`manual_revisions`のauthenticated direct write revoke

境界ルール:

- `authenticated`から`manual_steps`への直接`INSERT / UPDATE / DELETE`権限をrevokeする。
- manual作成、draft更新、公開、draft再作成はSECURITY DEFINER RPCだけを利用する。
- 4つのstep mutation RPCは、権限・draft状態・workspace境界を確認してから、同一のdraft revision rowを`FOR UPDATE`でlockする。
- 失敗時は部分更新を残さずtransaction全体をrollbackする。
- RPCは`authenticated`だけが実行でき、`public`と`anon`には公開しない。

これらのmigrationはrepository内とGitHub Actions内の使い捨てPostgreSQLで検証するだけで、GitHub PRだけを根拠にstaging/productionへ適用しない。DBへの適用は環境・対象migration・rollback条件を確認した別の明示承認で行う。

## テスト

最低限:

- member詳細取得、draftなし、viewerの`canEdit: false`
- viewer mutation 403
- 非member/別workspace/不正UUID 404
- draft title/descriptionの原子的更新
- published/superseded直接変更拒否
- append/update/soft-delete/reorder RPC正常系
- `authenticated`のdirect write拒否
- 4 RPCが同じrevision lockを待つ並行実行試験
- step更新時の手修正instruction保持
- 入力値フィールド拒否
- soft delete
- reorder全集合、重複、欠落、越境拒否
- 失敗時rollback
- mutation結果不明時に再送を誘発しない
- body/response/件数上限と未読body cancel
- FR-006ローカル生成と手修正保持
- `npm run check`
- `git diff --check`
