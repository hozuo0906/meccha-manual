# Phase 2 手順書draft・step編集API

Status: Superseded

実行禁止: ADR-0028、DEC-064、Issue #176により、本書は移行前Supabase/Postgres/RLS baselineである。新規Supabase project/user/secret、migration、remote write、live workflow、staging合格証跡の根拠にしない。後継は`cloudflare-access-d1-api.md` とIssue #176 M4。

対象: GitHub Issue #64 / #74 / #80 / #82 / FR-004 / FR-005 / FR-006

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
- URLはHTTP/HTTPSのみとし、userinfo、空白、制御文字、backslash、壊れたauthority、範囲外portを拒否する。WorkerはWHATWG URLでASCII正規形へ変換し、DBは正規化後のhost（underscoreを含む有効なspecial-scheme host、空port、先行ゼロ付きport、範囲内の10進・8進・16進・省略IPv4を許可）とdirect RPC入力のauthorityを同じ境界で検証する。WHATWGがpath separatorへ変換するbackslashは、曖昧な保存を避ける共通subsetとして正規化前に拒否する。PostgreSQLだけでWHATWG IDNAを再現して境界差を作らないため、`xn--`から始まるpunycode hostname labelはWorker・direct RPCとも受け付けない。URLをサーバー側から取得・実行しない。

## API

### `GET /api/workspaces/{workspaceId}/manuals/archived`

[DEC-117](../09-delivery/decision-log.md#dec-117-レガシーのアーカイブ済み一覧から既存の復元uiへ接続する)に基づくレガシー専用一覧。通常一覧の`archived_at=is.null`は維持する。

- Phase 1 HttpOnly Cookie sessionとactiveなworkspace所属を必須とし、owner/admin/editor/viewerが閲覧できる。GET以外は405、未認証は401、非member・不正workspace IDは404。
- Workerは既存の利用者access tokenとanon keyで`list_archived_manuals(target_workspace_id)`を呼ぶ。workspaceを固定し、`status = 'archived' AND archived_at IS NOT NULL`だけを`updated_at desc, id`順に取得する。
- 成功は200の`{ "manuals": [...] }`。項目は通常一覧と同じ`id`、`folderId`、`title`、`status`、`currentDraftRevisionId`、`currentPublishedRevisionId`、`updatedAt`。`archived_at`は上流検証に使い、公開応答には追加しない。
- RPCとPostgRESTの取得上限は1001件。`Prefer: count=exact`と`Content-Range`の件数整合を検証し、総数または取得件数が1000件超なら`409 MANUALS_LIMIT_EXCEEDED`。切り詰めた一覧は返さない。
- 一覧本文は1 MiBまで。件数header欠落・不整合、別workspace、不正なstatus／archive日時、形式不正・過大応答は`502 MANUALS_RESPONSE_INVALID`。通信・上流拒否は`502 MANUALS_FETCH_FAILED`、上流401は`401 SESSION_REFRESH_REQUIRED`とする。失敗を空一覧へ変換しない。

### `GET /api/workspaces/{workspaceId}/manuals/archived/{manualId}`

アーカイブ済み手順書を既存詳細画面で閲覧し、下記restore endpointへ接続するための専用詳細。

- 認証とactiveなworkspace所属、owner/admin/editor/viewerを必須にする。GET以外は405、未認証は401、非member・不正ID・対象なし・workspace不一致・archivedの両条件を満たさない対象は404。
- Workerは既存の利用者access tokenとanon keyで`get_archived_manual_detail(target_workspace_id, target_manual_id)`だけを呼ぶ。manual・表示revision・steps・権限を単一SQL文の同一MVCC snapshotから取得する。
- 成功は200で通常詳細と同じ`manual`、`draft`、`steps`、`permissions.canEdit`を返す。manualのstatusは`archived`。`archived_at`は上流検証にだけ使い、公開応答には追加しない。manual.updatedAtを復元時の`expectedUpdatedAt`に使う。
- 表示revisionはcurrent draft優先、なければcurrent published。互換性のためどちらも`draft`キーへ格納し、`draft.state`で判別する。両pointerなしは`draft: null`、`steps: []`。supersededは返さない。
- stepsは表示revisionとworkspaceを固定し、`deleted_at IS NULL`だけを`position asc`で返す。通常詳細と同じ公開項目に限定し、asset・annotation・masking等は取得・公開しない。
- RPC内でowner/admin/editorなら`can_edit: true`、viewerはfalse。HTTPでは`permissions.canEdit`へ変換する。archived表示は全ロールで編集禁止とし、trueの場合だけ既存の復元確認を提示する。復元自体の認可・CASは`restore_manual`が再検証する。
- 詳細本文上限8 MiB、最大200 active steps、201件目による異常検出を維持する。上限超は`409 MANUAL_STEPS_LIMIT_EXCEEDED`、不正scope・状態・形式は502。RPCのnullは404、上流401は`401 SESSION_REFRESH_REQUIRED`。通常詳細の取得境界は変えない。

### `GET /api/workspaces/{workspaceId}/manuals/{manualId}`

現在manual、表示対象revision（current draftを優先し、無ければcurrent published）、active steps、編集可否を返す。互換性維持のため表示対象revisionはレスポンスの`draft`キーに格納し、`draft.state`で`draft`または`published`を判別する。

- member全ロールが閲覧可能。
- manualがworkspaceに属さない、archived、非memberの場合は404。
- current draftが無くcurrent publishedがある場合は、published revisionとそのactive stepsを読み取り専用の表示対象として返す。両方とも無い場合だけ`draft: null`、`steps: []`を返す。
- stepは`position asc`、`deleted_at is null`だけを返す。
- published revisionを返す場合も編集対象にはせず、更新系APIはcurrent draftだけを受け付ける。superseded revisionは返さない。
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

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/publish`

- owner/admin/editorだけが実行できる。viewerは403、別workspace・非memberは404。
- JSON bodyの`expectedDraftRevisionId`、詳細取得時の`expectedContentVersion`、`confirmedSensitiveDataReview: true`を必須とする。
- `publish_manual_revision` RPCはmanual rowとdraft rowをlockし、期待IDとmetadata・active stepsのcontent versionを再照合する。公開と同じtransactionでactor・manual・revisionを監査ログへ記録する。
- UIは未保存フォームがある間の公開を拒否し、機密情報とマスキング完了の明示確認を要求する。API直呼びも確認値なしでは拒否する。
- 成功時は`{ "publishedRevisionId": "<uuid>" }`を返す。公開版は以後直接変更できない。
- 通信切断、上流5xx、不正な成功本文、返却ID不一致は`MANUAL_PUBLISH_RESULT_UNKNOWN`とし、自動再送せず詳細再取得で照合する。
- 公開URLや共有リンクは作成しない。
- current draftがない詳細取得ではcurrent published revisionとactive stepsを読み取り専用で返す。

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/draft`

- JSON bodyの`expectedPublishedRevisionId`を必須とし、current published revisionと一致することを確認する。
- current published revisionから編集用の次draftを`create_manual_draft_from_published(manual_id, expected_published_revision_id)` RPCで生成する。
- current draftが既に存在する場合はそのIDを返し、重複draftを作らない。
- 成功時は`{ "draftRevisionId": "<uuid>" }`を返す。新規作成時は201、既存draft確認時は200。
- 結果不明時は`MANUAL_DRAFT_CREATE_RESULT_UNKNOWN`とし、自動再送せず詳細再取得で照合する。

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/archive`

手順書を非破壊でアーカイブし、通常の一覧・詳細から除外する。

- same-origin `Origin`と`Content-Type: application/json`を必須にする。
- owner/admin/editorのみ。viewerは403、routeのworkspaceとmanualのworkspaceが異なる場合、非member、既にarchivedの場合は404とする。
- 詳細取得時のmanual `updatedAt`を`expectedUpdatedAt`として必須入力にする。
- `archive_manual(workspace_id, manual_id, expected_updated_at)` RPCはmanual rowをlockし、workspace、role、未アーカイブ、期待更新時刻を同一transactionで照合する。
- 成功時は`status = archived`と`archived_at`だけを更新し、下書き・公開版・step・revision pointerは削除・変更しない。
- 同じtransactionで`manual.archived`を`audit_logs`へ記録する。
- 古い表示からの操作は`409 MANUAL_ARCHIVE_CONFLICT`とし、先行更新をアーカイブで隠さない。
- 通信切断、上流5xx、不正な成功本文、返却ID不一致は`MANUAL_ARCHIVE_RESULT_UNKNOWN`とし、自動再送せず一覧再取得で確認する。
- 復元はADR-0042と下記endpointで提供する。物理削除・自動削除・関連参照の削除はOQ-028の未解決部分として引き続き行わない。

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/restore`

[ADR-0042](../03-architecture/adrs/ADR-0042-manual-restore-from-archive.md)に基づき、アーカイブ前の状態へ戻す。

- same-origin `Origin`と`Content-Type: application/json`、認証を必須にする。POST以外は405。
- bodyは`{ "expectedUpdatedAt": "<timestamptz>" }`のみ。アーカイブ後のmanual更新時刻を必須にし、未知キー・欠落・不正値を400で拒否する。
- owner/admin/editorのみ。viewerは403、非member・workspace所属不一致・未アーカイブ・二重復元は404。RPC自体も認証・所属・roleを検証する。
- `restore_manual(target_workspace_id, target_manual_id, expected_manual_updated_at)`はSECURITY DEFINERでmanualをFOR UPDATE lockし、`status = archived`かつ`archived_at IS NOT NULL`とCASを検証する。RLSポリシーは変更しない。
- 最新`manual.archived`監査（同じworkspace・manual・resource_type）の`metadata.previousStatus`へ戻す。draft/reviewing/published/stale以外、監査なし、同時刻の矛盾は`409 MANUAL_RESTORE_STATE_UNKNOWN`。古い有効監査へfallbackしない。
- CAS不一致は`409 MANUAL_RESTORE_CONFLICT`。成功は`{ "restoredManualId": "<uuid>" }`（200）。statusとarchived_atだけを復帰し、revision・手順・assetは保持する。
- 同じtransactionで`manual.restored`を監査し、metadataは`restoredStatus` / `draftRevisionId` / `publishedRevisionId`。
- 共有リンクは変更しない。失効済みリンクは失効のまま、未失効かつ期限内のリンクは再び有効になる。パスコード等の既存条件は維持する。
- 通信切断・上流5xx・不正成功本文・ID不一致は`502 MANUAL_RESTORE_RESULT_UNKNOWN`。未分類の上流拒否は`502 MANUAL_RESTORE_UNAVAILABLE`。結果不明では自動再送せず一覧で照合する。
- アーカイブ済み手順書の通常一覧・詳細非表示は維持する。DEC-117の専用一覧・専用詳細から既存復元UIへ接続する。restore自体は取得を行わず、専用詳細で表示したmanual.updatedAtを使う。
- 物理削除・自動削除が無効な間、保持と復元に期限はない。物理削除・自動削除は引き続き無効。

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

`202608180002_phase2_manual_archive.sql`は次を追加する。

- 表示中manual更新時刻とworkspaceをrow lock内で照合する`archive_manual`
- revision pointerと内容を保持した非破壊アーカイブ
- `manual.archived`監査ログとauthenticated限定のRPC実行権限

`202608180004_phase2_archived_manual_read.sql`は、`list_archived_manuals(target_workspace_id uuid)`と`get_archived_manual_detail(target_workspace_id uuid, target_manual_id uuid)`を追加する。両RPCは`STABLE`、`SECURITY DEFINER`、空の`search_path`と完全修飾名を使い、`auth.uid()`と`has_workspace_role`でcaller本人のactive所属・owner/admin/editor/viewerを検証する。callerのactor IDは受け取らない。workspaceとarchivedの両条件を関数内に固定し、非member・removed／invited・未認証は一覧0件／詳細null。PUBLIC・anonのEXECUTEをrevokeし、authenticatedだけに許可する。既存SELECT RLSと通常詳細RPCは変更しない。

一覧RPCは`id`、`workspace_id`、`folder_id`、`title`、`status`（text）、両revision pointer、`updated_at`、`archived_at`を返す。専用詳細RPCは通常詳細と同じ`can_edit`、`manual`、`draft`、`steps`のJSONを返し、manualに検証用`archived_at`を含む。どちらも読取り専用で、復元・監査追記・共有変更は行わない。既存RLSがarchivedを除外するため、専用取得に限って関数内認可で読み取る方式とする。

境界ルール:

- `authenticated`から`manual_steps`への直接`INSERT / UPDATE / DELETE`権限をrevokeする。
- manual作成、draft更新、公開、draft再作成、アーカイブ、復元はSECURITY DEFINER RPCだけを利用する。
- 4つのstep mutation RPCは、権限・draft状態・workspace境界を確認してから、同一のdraft revision rowを`FOR UPDATE`でlockする。
- 失敗時は部分更新を残さずtransaction全体をrollbackする。
- RPCは`authenticated`だけが実行でき、`public`と`anon`には公開しない。
- step追加・更新RPCもHTTP契約と同じ境界を強制し、`asset_id`、`annotation`、`masking`の外部入力、非action手順のaction項目、userinfo・空白・制御文字・backslash・壊れたauthority・範囲外port・punycode hostnameを含むURLを拒否する。WHATWG URLで有効なunderscore hostは拒否しない。step更新では既存の内部項目を保持する。

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
- 公開成功、viewer/越境拒否、返却revision不一致の結果不明化
- 公開後draft生成と既存draftへの冪等収束
- アーカイブ成功、viewer/越境/古いversion拒否、revision pointer保持、監査、返却ID不一致の結果不明化
- 復元成功、元状態不明・CAS・未アーカイブ・二重復元・権限／workspace境界の拒否、manual.restored監査、結果不明化
- 専用一覧・詳細のeditor／viewer閲覧、非member・未認証・workspace越境・不整合archive状態の拒否、current draft優先／published fallback、deleted step除外、通常SELECTのarchived非表示維持、RPC実行権限（`tests/sql/phase2-archived-manual-read-test.sql`）
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

`202608180003_phase2_manual_restore.sql`は、RLSを変更せず、認証済みowner/admin/editor限定の`restore_manual`と`manual.restored`監査を追加する。SQL回帰は既存archiveと同じdisposable PostgresのManual Edit API CIで実行する。ローカル`npm run check`はSQL実行を含まない。

Manual Edit API CIではrestoreの後に`202608180004_phase2_archived_manual_read.sql`を適用し、restore回帰の後に専用読み取りSQL回帰を実行する。実DBでの実行結果はローカルWorker／UIテストとは別に記録する。
