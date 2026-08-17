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

- write bodyはContent-Lengthの有無にかかわらず64 KiBで打ち切る。10,000 Unicode code pointのdescriptionが4 byte文字でもJSONとして収まる一方、無制限bufferは許可しない。
- 詳細・作成とも最大200 active stepsとする。DB triggerが201件目を拒否し、APIは`409 MANUAL_STEPS_LIMIT_EXCEEDED`を返す。既存データに201件以上ある場合はmigration preflightで停止する。
- 詳細のSupabase JSONは、200 active stepsに加えて件数異常を判定する201件目まで、DBで許容される最大フィールド長と1 code pointあたり最大6 byteのJSON制御文字escapeを安全に読める8 MiBで打ち切る。その他のSupabase JSONは512 KiBを維持する（[DEC-052](../09-delivery/decision-log.md)）。
- draft descriptionは10,000文字、step titleは128文字、instructionは4,000文字、targetTextは256文字を上限とする。URLは入力値が2,048文字以内、かつRFC 3986のASCII文字を1、それ以外をUTF-8 byteごとにpercent encodingした共通budgetが2,048以内とする。ただしapostrophe（`'`）はWHATWG serializationに合わせ、query内では`%27`の3文字、path／fragmentでは1文字として数える。WorkerのWHATWG正規化後も2,048文字以内を強制する。
- title/targetTextはECMAScript `trim()`相当後に空となる値をDBでも拒否する。
- URLはHTTP/HTTPSのみとし、userinfo、空白、制御文字、壊れたauthority、範囲外portを拒否する。WorkerはWHATWG URLでASCII正規形へ変換し、DBは正規化後のhost（underscoreを含む有効なspecial-scheme host、空port、先行ゼロ付きport、範囲内の10進・8進・16進・省略IPv4を許可）とdirect RPC入力のauthorityを同じ境界で検証する。PostgreSQLだけでWHATWG IDNAを再現して境界差を作らないため、`xn--`から始まるpunycode hostname labelはWorker・direct RPCとも受け付けない。URLをサーバー側から取得・実行しない。

## API

### `GET /api/workspaces/{workspaceId}/manuals/{manualId}`

現在manual、current draft revision、active steps、編集可否を返す。

- member全ロールが閲覧可能。
- manualがworkspaceに属さない、archived、非memberの場合は404。
- draftが無い場合は`draft: null`、`steps: []`を返す。
- stepは`position asc`、`deleted_at is null`だけを返す。
- published/superseded revisionを編集対象として返さない。
- `annotation`、`masking`、`assetId`など内部更新項目は詳細取得queryにも含めず、レスポンスへ公開しない。step更新時だけ対象1件を取得し、内部JSONは各64 KiB以下をDBで強制する。
- manual、current draft、active stepsは`get_manual_edit_detail`の単一SQL文で取得し、同一MVCC snapshotの値だけを組み合わせる。公開やmetadata保存が並行しても、旧manualと新draft、または消えたdraftを混在させない。
- `permissions.canEdit`も同じ`get_manual_edit_detail`文内でロールを判定し、詳細データより古い権限を編集UIへ返さない。

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
- title、description、詳細取得時に表示したdraftの`updatedAt`を`expectedUpdatedAt`として送信する。
- Workerはcurrent draft IDと表示中の`updatedAt`を`update_manual_draft` RPCへ渡し、manual rowとdraft rowをlockした後に一致する場合だけ`manuals.title`とcurrent draftのtitle/descriptionを同一transactionで更新する。
- 同じversionからの後続保存は`409 MANUAL_DRAFT_EDIT_CONFLICT`とし、先行したタイトル・説明を古いフォームで上書きしない。
- current draftが無い、またはcurrent draft IDが切り替わった場合は409で、新しいdraft作成フローを案内する。
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
- クライアントは詳細取得時に表示したstepの`updatedAt`を`expectedUpdatedAt`としてPATCHへ含める。Workerはその値を楽観的更新条件としてRPCへ渡し、revision lock取得後のDB rowと一致するときだけ更新する。同じversionからの後続更新は`409 MANUAL_STEP_EDIT_CONFLICT`とし、先行更新を上書きしない。WorkerがPATCH直前に再取得した新しいversionへ差し替えてはならない。
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

- `manual_step_ipv4_host_is_valid`（WHATWGの10進・8進・16進・省略IPv4境界を再現する非公開helper）
- `manual_step_url_is_valid`（step追加・更新RPC専用の非公開URL検証関数）
- `append_manual_step`
- `update_manual_step`
- `soft_delete_manual_step`
- `reorder_manual_steps`

`202608140012_phase2_manual_edit_http_contract.sql`は次を追加・強化する。

- optimistic version照合付き`update_manual_draft`
- manual・draft・steps・編集可否を単一MVCC snapshotで読む`get_manual_edit_detail`（SECURITY INVOKER、member RLSを維持）
- draft descriptionとstep本文フィールドの上限constraint
- step title/targetTextの空白のみ拒否constraint
- revisionごとのactive step 200件preflightと`manual_steps_active_limit_guard`
- `annotation` / `masking` JSON各64 KiB constraint
- `manuals`と`manual_revisions`のauthenticated direct write revoke

境界ルール:

- `authenticated`から`manual_steps`への直接`INSERT / UPDATE / DELETE`権限をrevokeする。
- manual作成、draft更新、公開、draft再作成はSECURITY DEFINER RPCだけを利用する。
- 4つのstep mutation RPCは、権限・draft状態・workspace境界を確認してから、同一のdraft revision rowを`FOR UPDATE`でlockする。
- 失敗時は部分更新を残さずtransaction全体をrollbackする。
- RPCは`authenticated`だけが実行でき、`public`と`anon`には公開しない。
- step追加・更新RPCもHTTP契約と同じ境界を強制し、`asset_id`、`annotation`、`masking`の外部入力、非action手順のaction項目、userinfo・空白・制御文字・壊れたauthority・範囲外port・punycode hostnameを含むURLを拒否する。WHATWG URLで有効なunderscore hostは拒否しない。step更新では既存の内部項目を保持する。

これらのmigrationはrepository内とGitHub Actions内の使い捨てPostgreSQLで検証するだけで、GitHub PRだけを根拠にstaging/productionへ適用しない。DBへの適用は環境・対象migration・rollback条件を確認した別の明示承認で行う。

## テスト

最低限:

- member詳細取得、draftなし、viewerの`canEdit: false`
- 詳細取得が1つの`get_manual_edit_detail` RPCだけを使い、manual・draft・stepsを別々の時点から合成しないこと
- viewer mutation 403
- 非member/別workspace/不正UUID 404
- draft title/descriptionの原子的更新
- 同じdraft `updatedAt`を持つ2更新のうち1件だけ成功し、もう1件が`MANUAL_DRAFT_EDIT_CONFLICT`になる並行実行試験
- published/superseded直接変更拒否
- append/update/soft-delete/reorder RPC正常系
- `authenticated`のdirect write拒否
- authenticated direct RPCでの不正URL拒否
- 4 RPCが同じrevision lockを待つ並行実行試験
- 同じupdatedAtを持つ2更新のうち1件だけ成功し、もう1件が`MANUAL_STEP_EDIT_CONFLICT`になる並行実行試験
- step更新時の手修正instruction保持
- 入力値フィールド拒否
- soft delete
- reorder全集合、重複、欠落、越境拒否
- 失敗時rollback
- mutation結果不明時に再送を誘発しない
- DB triggerによる201件目の拒否と409 mapping
- 詳細queryが`assetId` / `annotation` / `masking`を取得しないこと
- body/response/件数上限と未読body cancel
- FR-006ローカル生成と手修正保持
- `npm run check`
- `git diff --check`
