# Phase 2 手順書draft・step編集API

Status: Accepted

対象: GitHub Issue #64 / FR-004 / FR-005 / FR-006

## 前提

- #63の`GET/POST /api/workspaces/{workspaceId}/manuals`を土台にする。
- Phase 1のHttpOnly Cookie session、same-origin write、Supabase RLSを維持する。
- viewerは閲覧のみ。owner/admin/editorだけがmutationできる。
- 別workspace、非member、不正IDは存在推測を避けて404へまとめる。
- published / superseded revisionを直接更新しない。
- 外部AI APIは利用しない。

## API

### `GET /api/workspaces/{workspaceId}/manuals/{manualId}`

現在manual、current draft revision、active stepsを返す。

- member全ロールが閲覧可能。
- manualがworkspaceに属さない、archived、非memberの場合は404。
- draftが無い場合は`draft: null`、`steps: []`を返す。
- stepは`position asc`、`deleted_at is null`だけを返す。
- published/superseded revisionを編集対象として返さない。

### `PATCH /api/workspaces/{workspaceId}/manuals/{manualId}/draft`

current draftのtitle/descriptionを更新する。

- owner/admin/editorのみ。
- titleはtrim後1〜64文字。
- descriptionは文字列。body全体16 KiB上限を維持する。
- current draftが無い場合は409で、新しいdraft作成フローを案内する。
- revision stateがdraftでない場合は409。
- 結果不明時は再送せず詳細再取得で確認する。

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/steps`

current draft末尾へstepを追加する。

- owner/admin/editorのみ。
- DB書込は`append_manual_step` RPCを利用する。
- RPCはdraft revision rowを`FOR UPDATE`でlockしてposition採番を直列化する。
- `type`: `action | note | decision | warning`。
- `actionType`: `click | input | select | navigate | wait | other | null`。
- titleは必須。instructionは任意。
- `targetText`は対象名だけを扱い、入力した値そのものを受け取らない。
- action stepでinstructionが未入力の場合だけFR-006のローカルテンプレート候補を初期値として使える。
- 一度ユーザーがinstructionを保存した後、`targetText`/`actionType`変更で勝手に上書きしない。
- 外部AI API呼び出しは禁止。

### `PATCH /api/workspaces/{workspaceId}/manuals/{manualId}/steps/{stepId}`

current draft上のstep内容を更新する。

- owner/admin/editorのみ。
- DB書込は`update_manual_step` RPCを利用し、append/delete/reorderと同じdraft revision rowをlockする。
- `position`、`workspace_id`、`revision_id`、`created_by`等の所有・並び順項目は入力として受け付けない。
- current draftに属するactive stepだけを更新する。
- 結果不明時は詳細再取得で確認し、同じ変更を自動再送しない。

### `DELETE /api/workspaces/{workspaceId}/manuals/{manualId}/steps/{stepId}`

UI上のstep削除をsoft deleteとして実装する。

- owner/admin/editorのみ。
- DB書込は`soft_delete_manual_step` RPCを利用し、他のstep mutationと同じdraft revision rowをlockする。
- 物理DELETEせず`deleted_at`を設定する。
- active step以外は404相当。
- 削除後にpositionを自動詰めしない。次の明示的reorderで0始まり連番へ正規化する。

### `POST /api/workspaces/{workspaceId}/manuals/{manualId}/steps/reorder`

全active stepの順序を1回のDB transactionで置き換える。

入力:

```json
{
  "orderedStepIds": ["<uuid>", "<uuid>"]
}
```

- owner/admin/editorのみ。
- `reorder_manual_steps` RPCを利用し、他のstep mutationと同じdraft revision rowをlockする。
- current draftの全active step IDを重複なく、過不足なく1回ずつ送る。
- 別revision、deleted step、重複、欠落、余分なIDは全体を失敗させる。
- unique position制約との衝突を避けるため、RPC内で一時positionへ退避してから0始まり連番にする。
- 通信切断・5xx・成功応答不正は結果不明として詳細再取得を要求し、自動再送しない。

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

境界ルール:

- `authenticated`から`manual_steps`への直接`INSERT / UPDATE / DELETE`権限をrevokeする。
- 4つのmutation RPCは、権限・draft状態・workspace境界を確認してから、同一のdraft revision rowを`FOR UPDATE`でlockする。
- 失敗時は部分更新を残さずtransaction全体をrollbackする。
- RPCは`authenticated`だけが実行でき、`public`と`anon`には公開しない。

このmigrationはrepository内とGitHub Actions内の使い捨てPostgreSQLで検証するだけで、GitHub PRだけを根拠にstaging/productionへ適用しない。DBへの適用は環境・対象migration・rollback条件を確認した別の明示承認で行う。

## テスト

最低限:

- member詳細取得
- viewer mutation 403
- 非member/別workspace 404
- published/superseded直接変更拒否
- append/update/soft-delete/reorder RPC正常系
- `authenticated`の直接write拒否
- 4 RPCが同じrevision lockを待つ並行実行試験
- updateでposition変更不可
- soft delete
- reorder全集合、重複、欠落、越境拒否
- 失敗時rollback
- reorder結果不明時に再送を誘発しない
- FR-006ローカル生成と手修正保持
- `npm run check`
- `git diff --check`
