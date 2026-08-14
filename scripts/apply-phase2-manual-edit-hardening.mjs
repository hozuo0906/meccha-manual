import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

function appendIfMissing(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

let migration = await readFile("supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql", "utf8");
const capacitySql = `do $$
begin
  if exists (
    select 1
    from public.manual_steps ms
    where ms.deleted_at is null
    group by ms.revision_id
    having count(*) > 200
  ) then
    raise exception 'manual step limit preflight failed';
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_annotation_size'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_annotation_size
      check (octet_length(annotation::text) <= 65536)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_annotation_size;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_steps_masking_size'
      and conrelid = 'public.manual_steps'::regclass
  ) then
    alter table public.manual_steps
      add constraint manual_steps_masking_size
      check (octet_length(masking::text) <= 65536)
      not valid;
  end if;
end $$;

alter table public.manual_steps validate constraint manual_steps_masking_size;

create or replace function public.enforce_manual_steps_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  needs_check boolean := false;
  active_step_count integer;
begin
  if tg_op = 'INSERT' then
    needs_check := new.deleted_at is null;
  elsif tg_op = 'UPDATE' then
    needs_check := new.deleted_at is null
      and (old.deleted_at is not null or old.revision_id is distinct from new.revision_id);
  end if;

  if not needs_check then
    return new;
  end if;

  perform 1
  from public.manual_revisions mr
  where mr.id = new.revision_id
  for update;

  if not found then
    raise exception 'draft revision not found';
  end if;

  if tg_op = 'INSERT' then
    select count(*)::integer
    into active_step_count
    from public.manual_steps ms
    where ms.revision_id = new.revision_id
      and ms.deleted_at is null;
  else
    select count(*)::integer
    into active_step_count
    from public.manual_steps ms
    where ms.revision_id = new.revision_id
      and ms.deleted_at is null
      and ms.id <> old.id;
  end if;

  if active_step_count >= 200 then
    raise exception 'manual step limit exceeded';
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'manual_steps_active_limit_guard'
      and tgrelid = 'public.manual_steps'::regclass
      and not tgisinternal
  ) then
    create trigger manual_steps_active_limit_guard
    before insert or update of revision_id, deleted_at on public.manual_steps
    for each row
    execute function public.enforce_manual_steps_active_limit();
  end if;
end $$;

revoke all on function public.enforce_manual_steps_active_limit() from public, anon, authenticated;
`;
if (!migration.includes("manual_steps_active_limit_guard")) {
  migration = replaceOnce(
    migration,
    "\ncreate or replace function public.update_manual_draft(",
    `\n${capacitySql}\ncreate or replace function public.update_manual_draft(`,
    "manual step capacity and internal JSON bounds"
  );
}
await writeFile("supabase/migrations/202608140012_phase2_manual_edit_http_contract.sql", migration, "utf8");

let router = await readFile("apps/worker/src/manual-edit-router.ts", "utf8");
router = replaceOnce(
  router,
  "function parseStep(value: unknown, workspaceId: string, draftId: string): ManualStep | null {\n  if (!isPlainObject(value)) return null;\n  const id = canonicalUuidValue(value.id);\n  const rowWorkspaceId = canonicalUuidValue(value.workspace_id);\n  const revisionId = canonicalUuidValue(value.revision_id);\n  const assetId = value.asset_id === null ? null : canonicalUuidValue(value.asset_id);\n  const updatedAt = requireTimestamp(value.updated_at);",
  "function parseStep(\n  value: unknown,\n  workspaceId: string,\n  draftId: string,\n  requireInternalFields = false\n): ManualStep | null {\n  if (!isPlainObject(value)) return null;\n  const id = canonicalUuidValue(value.id);\n  const rowWorkspaceId = canonicalUuidValue(value.workspace_id);\n  const revisionId = canonicalUuidValue(value.revision_id);\n  const assetId = value.asset_id === undefined || value.asset_id === null ? null : canonicalUuidValue(value.asset_id);\n  const annotation = value.annotation === undefined ? {} : value.annotation;\n  const masking = value.masking === undefined ? {} : value.masking;\n  const updatedAt = requireTimestamp(value.updated_at);",
  "optional internal step fields"
);
router = replaceOnce(
  router,
  "    (value.asset_id !== null && !assetId) ||\n    !isPlainObject(value.annotation) || !isPlainObject(value.masking) ||\n    !updatedAt",
  "    (value.asset_id !== undefined && value.asset_id !== null && !assetId) ||\n    !isPlainObject(annotation) || !isPlainObject(masking) ||\n    (requireInternalFields && (value.asset_id === undefined || value.annotation === undefined || value.masking === undefined)) ||\n    !updatedAt",
  "internal step validation"
);
router = replaceOnce(
  router,
  "    annotation: value.annotation,\n    masking: value.masking,",
  "    annotation,\n    masking,",
  "parsed internal step defaults"
);
router = replaceOnce(
  router,
  '    "/rest/v1/manual_steps?select=id,workspace_id,revision_id,position,type,title,instruction,action_type,target_text,url,asset_id,annotation,masking,updated_at",\n    `workspace_id=eq.${encodeURIComponent(workspaceId)}`,\n    `revision_id=eq.${encodeURIComponent(draftId)}`,\n    "deleted_at=is.null",\n    "order=position.asc",',
  '    "/rest/v1/manual_steps?select=id,workspace_id,revision_id,position,type,title,instruction,action_type,target_text,url,updated_at",\n    `workspace_id=eq.${encodeURIComponent(workspaceId)}`,\n    `revision_id=eq.${encodeURIComponent(draftId)}`,\n    "deleted_at=is.null",\n    "order=position.asc",',
  "public detail step selection"
);
router = replaceOnce(
  router,
  "  const step = parseStep(rows[0], workspaceId, draftId);",
  "  const step = parseStep(rows[0], workspaceId, draftId, true);",
  "active step internal parse"
);
router = replaceOnce(
  router,
  "  if (message.includes(\"active manual step not found\")) {\n    return new ManualError(404, \"MANUAL_STEP_NOT_FOUND\", \"指定された手順が見つかりません。\");\n  }",
  "  if (message.includes(\"active manual step not found\")) {\n    return new ManualError(404, \"MANUAL_STEP_NOT_FOUND\", \"指定された手順が見つかりません。\");\n  }\n  if (message.includes(\"manual step limit exceeded\")) {\n    return new ManualError(409, \"MANUAL_STEPS_LIMIT_EXCEEDED\", \"手順は200件まで追加できます。不要な手順を整理してください。\");\n  }",
  "step limit RPC mapping"
);
await writeFile("apps/worker/src/manual-edit-router.ts", router, "utf8");

let apiTests = await readFile("tests/manual-edit-api.test.mjs", "utf8");
apiTests = appendIfMissing(
  apiTests,
  "step creation maps the database capacity guard to 409",
  `test("step creation maps the database capacity guard to 409", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]),
    json({ message: "manual step limit exceeded" }, 400)
  ]);
  try {
    const response = await handleManualEditRoute(
      request(detailPath("/steps"), "POST", JSON.stringify({
        type: "note",
        title: "上限確認",
        instruction: "確認します。"
      })),
      ENV
    );
    assert.equal(response?.status, 409);
    assert.equal((await response.json()).code, "MANUAL_STEPS_LIMIT_EXCEEDED");
  } finally {
    mock.restore();
  }
});`
);
apiTests = appendIfMissing(
  apiTests,
  "manual detail does not request hidden step mutation fields",
  `test("manual detail does not request hidden step mutation fields", async () => {
  const mock = installFetch([
    authOk(), memberOk(), editorOk(), json([manualRow()]), json([draftRow()]),
    json([{
      id: STEP_ID,
      workspace_id: WORKSPACE_ID,
      revision_id: DRAFT_ID,
      position: 0,
      type: "note",
      title: "確認",
      instruction: "確認します。",
      action_type: null,
      target_text: null,
      url: null,
      updated_at: "2026-08-14T00:00:02.000Z"
    }], 200, { "content-range": "0-0/1" })
  ]);
  try {
    const response = await handleManualEditRoute(request(detailPath()), ENV);
    assert.equal(response?.status, 200);
    const stepQuery = mock.calls[5].url;
    assert.doesNotMatch(stepQuery, /asset_id|annotation|masking/);
  } finally {
    mock.restore();
  }
});`
);
await writeFile("tests/manual-edit-api.test.mjs", apiTests, "utf8");

let sqlTests = await readFile("tests/sql/phase2-manual-edit-http-test.sql", "utf8");
const capacityTest = `do $$
declare
  index_no integer;
  rejected boolean := false;
begin
  for index_no in 2..200 loop
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'note',
      '手順' || index_no::text,
      '',
      null,
      null,
      null,
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  end loop;

  begin
    perform public.append_manual_step(
      '44444444-4444-4444-8444-444444444444',
      'note',
      '201件目',
      '',
      null,
      null,
      null,
      null,
      '{}'::jsonb,
      '{}'::jsonb
    );
  exception
    when others then
      if sqlerrm like '%manual step limit exceeded%' then
        rejected := true;
      else
        raise;
      end if;
  end;

  if not rejected then
    raise exception '201st active manual step was accepted';
  end if;
end;
$$;`;
if (!sqlTests.includes("201st active manual step was accepted")) {
  sqlTests = replaceOnce(sqlTests, "\nreset role;\n", `\n${capacityTest}\n\nreset role;\n`, "database active step capacity test");
}
await writeFile("tests/sql/phase2-manual-edit-http-test.sql", sqlTests, "utf8");

let checker = await readFile("scripts/check-phase2-manual-edit-api.mjs", "utf8");
checker = replaceOnce(
  checker,
  '  "manual_steps_url_length",\n  "create or replace function public.update_manual_draft(",',
  '  "manual_steps_url_length",\n  "manual_steps_annotation_size",\n  "manual_steps_masking_size",\n  "manual step limit preflight failed",\n  "manual_steps_active_limit_guard",\n  "manual step limit exceeded",\n  "create or replace function public.update_manual_draft(",',
  "hardening migration contract checks"
);
checker = replaceOnce(
  checker,
  '  "MAX_MANUAL_STEPS = 200",\n  "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN",',
  '  "MAX_MANUAL_STEPS = 200",\n  "MANUAL_STEPS_LIMIT_EXCEEDED",\n  "requireInternalFields",\n  "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN",',
  "hardening router contract checks"
);
await writeFile("scripts/check-phase2-manual-edit-api.mjs", checker, "utf8");

let contract = await readFile("docs/05-api/phase2-manual-edit-api.md", "utf8");
contract = replaceOnce(
  contract,
  "- 詳細は最大200 active stepsとする。201件以上は切り詰めず`409 MANUAL_STEPS_LIMIT_EXCEEDED`。",
  "- 詳細・作成とも最大200 active stepsとする。DB triggerが201件目を拒否し、APIは`409 MANUAL_STEPS_LIMIT_EXCEEDED`を返す。既存データに201件以上ある場合はmigration preflightで停止する。",
  "step capacity contract"
);
contract = replaceOnce(
  contract,
  "- `annotation`、`masking`、`assetId`など内部更新項目はレスポンスへ公開しない。",
  "- `annotation`、`masking`、`assetId`など内部更新項目は詳細取得queryにも含めず、レスポンスへ公開しない。step更新時だけ対象1件を取得し、内部JSONは各64 KiB以下をDBで強制する。",
  "hidden step metadata contract"
);
await writeFile("docs/05-api/phase2-manual-edit-api.md", contract, "utf8");

let setup = await readFile("docs/04-data/phase2-manual-core-setup.md", "utf8");
setup = replaceOnce(
  setup,
  "- `manual_steps_url_length`",
  "- `manual_steps_url_length`\n- `manual_steps_annotation_size` / `manual_steps_masking_size`\n- `manual_steps_active_limit_guard` trigger",
  "expected step hardening objects"
);
setup = replaceOnce(
  setup,
  "- 200 active stepsと本文フィールド上限を超える入力・応答を拒否する。",
  "- 200 active stepsと本文フィールド上限を超える入力・応答を拒否する。201件目はDB triggerで拒否し、内部annotation/maskingは各64 KiB以下とする。",
  "step hardening verification"
);
await writeFile("docs/04-data/phase2-manual-core-setup.md", setup, "utf8");

let definitions = await readFile("docs/04-data/table-definitions.md", "utf8");
definitions = replaceOnce(
  definitions,
  "`manual_steps_title_*`、`manual_steps_instruction_length`、`manual_steps_target_text_*`、`manual_steps_url_length`で本文上限を強制",
  "`manual_steps_title_*`、`manual_steps_instruction_length`、`manual_steps_target_text_*`、`manual_steps_url_length`、内部JSON各64 KiB、active 200件triggerで上限を強制",
  "step hardening table contract"
);
await writeFile("docs/04-data/table-definitions.md", definitions, "utf8");
