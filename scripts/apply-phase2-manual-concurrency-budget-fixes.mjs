import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Unexpected regex match count for ${label}: ${matches.length}`);
  return source.replace(pattern, replacement);
}

let manualRouter = await readFile("apps/worker/src/manual-router.ts", "utf8");
manualRouter = replaceOnce(
  manualRouter,
  "const MAX_JSON_BODY_BYTES = 16 * 1024;",
  "const MAX_JSON_BODY_BYTES = 64 * 1024;",
  "manual JSON body budget"
);
await writeFile("apps/worker/src/manual-router.ts", manualRouter, "utf8");

let editRouter = await readFile("apps/worker/src/manual-edit-router.ts", "utf8");
editRouter = replaceOnce(
  editRouter,
  `  if (message.includes("active manual step not found")) {\n    return new ManualError(404, "MANUAL_STEP_NOT_FOUND", "指定された手順が見つかりません。");\n  }`,
  `  if (message.includes("manual step changed concurrently")) {\n    return new ManualError(409, "MANUAL_STEP_EDIT_CONFLICT", "別の更新が先に保存されました。詳細を再読み込みして、変更内容を確認してください。");\n  }\n  if (message.includes("active manual step not found")) {\n    return new ManualError(404, "MANUAL_STEP_NOT_FOUND", "指定された手順が見つかりません。");\n  }`,
  "manual step optimistic conflict mapping"
);
editRouter = replaceOnce(
  editRouter,
  `      target_revision_id: draftId,\n      target_step_id: stepId,\n      step_type: next.type,`,
  `      target_revision_id: draftId,\n      target_step_id: stepId,\n      expected_step_updated_at: existing.updatedAt,\n      step_type: next.type,`,
  "manual step expected updated_at RPC argument"
);
await writeFile("apps/worker/src/manual-edit-router.ts", editRouter, "utf8");

let migration = await readFile("supabase/migrations/202608140010_phase2_manual_step_mutations.sql", "utf8");
const updatedFunction = `create or replace function public.update_manual_step(\n  target_revision_id uuid,\n  target_step_id uuid,\n  expected_step_updated_at timestamptz,\n  step_type public.manual_step_type,\n  step_title text,\n  step_instruction text,\n  step_action_type public.manual_action_type,\n  step_target_text text,\n  step_url text,\n  step_asset_id uuid,\n  step_annotation jsonb,\n  step_masking jsonb\n)\nreturns void\nlanguage plpgsql\nsecurity definer\nset search_path = public\nas $$\ndeclare\n  actor_id uuid := auth.uid();\n  target_workspace_id uuid;\nbegin\n  if actor_id is null then\n    raise exception 'authentication required';\n  end if;\n\n  if expected_step_updated_at is null then\n    raise exception 'expected step updated_at is required';\n  end if;\n\n  select mr.workspace_id\n  into target_workspace_id\n  from public.manual_revisions mr\n  join public.manuals m on m.id = mr.manual_id\n  where mr.id = target_revision_id\n    and mr.state = 'draft'\n    and m.archived_at is null\n  for update of mr;\n\n  if target_workspace_id is null then\n    raise exception 'draft revision not found';\n  end if;\n\n  if not public.has_workspace_role(\n    target_workspace_id,\n    actor_id,\n    array['owner', 'admin', 'editor']::public.workspace_role[]\n  ) then\n    raise exception 'workspace editor role required';\n  end if;\n\n  update public.manual_steps ms\n  set type = step_type,\n      title = step_title,\n      instruction = coalesce(step_instruction, ''),\n      action_type = step_action_type,\n      target_text = step_target_text,\n      url = step_url,\n      asset_id = step_asset_id,\n      annotation = coalesce(step_annotation, '{}'::jsonb),\n      masking = coalesce(step_masking, '{}'::jsonb),\n      updated_at = clock_timestamp()\n  where ms.id = target_step_id\n    and ms.revision_id = target_revision_id\n    and ms.workspace_id = target_workspace_id\n    and ms.deleted_at is null\n    and ms.updated_at = expected_step_updated_at;\n\n  if not found then\n    if exists (\n      select 1\n      from public.manual_steps ms\n      where ms.id = target_step_id\n        and ms.revision_id = target_revision_id\n        and ms.workspace_id = target_workspace_id\n        and ms.deleted_at is null\n    ) then\n      raise exception 'manual step changed concurrently';\n    end if;\n    raise exception 'active manual step not found';\n  end if;\nend;\n$$;\n\ncreate or replace function public.soft_delete_manual_step(`;
migration = replaceRegexOnce(
  migration,
  /create or replace function public\.update_manual_step\([\s\S]*?\n\$\$;\n\ncreate or replace function public\.soft_delete_manual_step\(/,
  updatedFunction,
  "update_manual_step optimistic RPC"
);
migration = replaceOnce(
  migration,
  `revoke all on function public.update_manual_step(\n  uuid,\n  uuid,\n  public.manual_step_type,`,
  `revoke all on function public.update_manual_step(\n  uuid,\n  uuid,\n  timestamptz,\n  public.manual_step_type,`,
  "update_manual_step revoke signature"
);
migration = replaceOnce(
  migration,
  `grant execute on function public.update_manual_step(\n  uuid,\n  uuid,\n  public.manual_step_type,`,
  `grant execute on function public.update_manual_step(\n  uuid,\n  uuid,\n  timestamptz,\n  public.manual_step_type,`,
  "update_manual_step grant signature"
);
await writeFile("supabase/migrations/202608140010_phase2_manual_step_mutations.sql", migration, "utf8");

for (const fixturePath of [
  "tests/sql/phase2-manual-step-rpc-fixture.sql",
  "tests/sql/phase2-manual-edit-http-fixture.sql"
]) {
  let fixture = await readFile(fixturePath, "utf8");
  fixture = replaceOnce(
    fixture,
    `  created_by uuid not null,\n  deleted_at timestamptz`,
    `  created_by uuid not null,\n  updated_at timestamptz not null default clock_timestamp(),\n  deleted_at timestamptz`,
    `${fixturePath} manual step updated_at`
  );
  await writeFile(fixturePath, fixture, "utf8");
}

let rpcTest = await readFile("tests/sql/phase2-manual-step-rpc-test.sql", "utf8");
rpcTest = replaceOnce(
  rpcTest,
  `select public.update_manual_step(\n  :'revision_a', :'step_a', 'action', '保存', '手修正済み instruction', 'click', '保存', null, null, '{}'::jsonb, '{}'::jsonb\n);`,
  `do $$\ndeclare\n  target_id uuid;\n  stale_updated_at timestamptz;\n  rejected boolean := false;\nbegin\n  select id, updated_at\n  into target_id, stale_updated_at\n  from public.manual_steps\n  where revision_id = '66666666-6666-4666-8666-666666666666'\n    and title = '保存ボタン';\n\n  perform public.update_manual_step(\n    '66666666-6666-4666-8666-666666666666', target_id, stale_updated_at,\n    'action', '保存', '手修正済み instruction', 'click', '保存', null, null, '{}'::jsonb, '{}'::jsonb\n  );\n\n  begin\n    perform public.update_manual_step(\n      '66666666-6666-4666-8666-666666666666', target_id, stale_updated_at,\n      'action', '競合上書き', '古い更新', 'click', '古い対象', null, null, '{}'::jsonb, '{}'::jsonb\n    );\n  exception\n    when others then\n      if sqlerrm like '%manual step changed concurrently%' then\n        rejected := true;\n      else\n        raise;\n      end if;\n  end;\n\n  if not rejected then\n    raise exception 'stale manual step update was accepted';\n  end if;\nend;\n$$;`,
  "manual step sequential optimistic conflict test"
);
await writeFile("tests/sql/phase2-manual-step-rpc-test.sql", rpcTest, "utf8");

await writeFile(
  "scripts/test-phase2-manual-step-locks.sh",
  await readFile("scripts/test-phase2-manual-step-locks.next.sh", "utf8"),
  "utf8"
);

let stepCheck = await readFile("scripts/check-phase2-manual-step-migration.mjs", "utf8");
stepCheck = replaceOnce(
  stepCheck,
  `  "create or replace function public.update_manual_step(",\n  "create or replace function public.soft_delete_manual_step(",`,
  `  "create or replace function public.update_manual_step(",\n  "expected_step_updated_at timestamptz",\n  "and ms.updated_at = expected_step_updated_at",\n  "manual step changed concurrently",\n  "create or replace function public.soft_delete_manual_step(",`,
  "manual step optimistic migration checks"
);
stepCheck = replaceOnce(
  stepCheck,
  `  "4 RPCが同じrevision lockを待つ並行実行試験",\n  "\`［保存ボタン］をクリックします。\`",`,
  `  "4 RPCが同じrevision lockを待つ並行実行試験",\n  "同じupdatedAtを持つ2更新のうち1件だけ成功",\n  "\`MANUAL_STEP_EDIT_CONFLICT\`",\n  "\`［保存ボタン］をクリックします。\`",`,
  "manual step optimistic documentation checks"
);
await writeFile("scripts/check-phase2-manual-step-migration.mjs", stepCheck, "utf8");

let apiCheck = await readFile("scripts/check-phase2-manual-edit-api.mjs", "utf8");
apiCheck = replaceOnce(
  apiCheck,
  `  "export async function readRequestJson",\n  "export async function supabaseFetch",`,
  `  "export async function readRequestJson",\n  "MAX_JSON_BODY_BYTES = 64 * 1024",\n  "export async function supabaseFetch",`,
  "manual request body budget check"
);
apiCheck = replaceOnce(
  apiCheck,
  `  "MANUAL_STEP_UPDATE_RESULT_UNKNOWN",\n  "MANUAL_STEP_DELETE_RESULT_UNKNOWN",`,
  `  "MANUAL_STEP_UPDATE_RESULT_UNKNOWN",\n  "MANUAL_STEP_EDIT_CONFLICT",\n  "expected_step_updated_at: existing.updatedAt",\n  "MANUAL_STEP_DELETE_RESULT_UNKNOWN",`,
  "manual step optimistic API checks"
);
apiCheck = replaceOnce(
  apiCheck,
  `  "200 active steps",\n  "6 MiB",`,
  `  "200 active steps",\n  "64 KiB",\n  "6 MiB",\n  "MANUAL_STEP_EDIT_CONFLICT",`,
  "manual API documentation budget and conflict checks"
);
await writeFile("scripts/check-phase2-manual-edit-api.mjs", apiCheck, "utf8");

let apiTest = await readFile("tests/manual-edit-api.test.mjs", "utf8");
apiTest = replaceOnce(
  apiTest,
  `test("step creation uses the local Japanese suggestion only when instruction is omitted", async () => {`,
  `test("10,000 four-byte Japanese characters fit within the bounded request body", async () => {\n  const description = "𠮷".repeat(10_000);\n  const body = JSON.stringify({ title: "最大説明", description });\n  assert.ok(new TextEncoder().encode(body).byteLength < 64 * 1024);\n  const mock = installFetch([\n    authOk(), memberOk(), editorOk(), json([manualRow()]), json(DRAFT_ID)\n  ]);\n  try {\n    const response = await handleManualEditRoute(\n      request(detailPath("/draft"), "PATCH", body),\n      ENV\n    );\n    assert.equal(response?.status, 200);\n    assert.equal(JSON.parse(String(mock.calls[4].init.body)).draft_description, description);\n  } finally {\n    mock.restore();\n  }\n});\n\ntest("request bodies above 64 KiB are rejected before mutation RPC", async () => {\n  const body = JSON.stringify({ title: "上限超過", description: "あ".repeat(22_000) });\n  assert.ok(new TextEncoder().encode(body).byteLength > 64 * 1024);\n  const mock = installFetch([authOk(), memberOk(), editorOk(), json([manualRow()])]);\n  try {\n    const response = await handleManualEditRoute(\n      request(detailPath("/draft"), "PATCH", body),\n      ENV\n    );\n    assert.equal(response?.status, 413);\n    assert.equal((await response.json()).code, "JSON_BODY_TOO_LARGE");\n    assert.equal(mock.calls.length, 4);\n  } finally {\n    mock.restore();\n  }\n});\n\ntest("step creation uses the local Japanese suggestion only when instruction is omitted", async () => {`,
  "manual request body boundary tests"
);
apiTest = replaceOnce(
  apiTest,
  `    assert.equal(rpcBody.step_instruction, "手修正済みです。");\n    assert.equal(rpcBody.step_action_type, "select");`,
  `    assert.equal(rpcBody.expected_step_updated_at, "2026-08-14T00:00:02.000Z");\n    assert.equal(rpcBody.step_instruction, "手修正済みです。");\n    assert.equal(rpcBody.step_action_type, "select");`,
  "manual step expected timestamp request test"
);
apiTest = replaceOnce(
  apiTest,
  `test("step delete uses the soft-delete RPC", async () => {`,
  `test("stale manual step update maps to a determinate 409 conflict", async () => {\n  const mock = installFetch([\n    authOk(), memberOk(), editorOk(), json([manualRow()]), json([stepRow()]),\n    json({ message: "manual step changed concurrently" }, 400)\n  ]);\n  try {\n    const response = await handleManualEditRoute(\n      request(detailPath(\`/steps/\${STEP_ID}\`), "PATCH", JSON.stringify({ title: "競合更新" })),\n      ENV\n    );\n    assert.equal(response?.status, 409);\n    const body = await response.json();\n    assert.equal(body.code, "MANUAL_STEP_EDIT_CONFLICT");\n    assert.match(body.message, /再読み込み/);\n  } finally {\n    mock.restore();\n  }\n});\n\ntest("step delete uses the soft-delete RPC", async () => {`,
  "manual step optimistic conflict HTTP test"
);
await writeFile("tests/manual-edit-api.test.mjs", apiTest, "utf8");

let contract = await readFile("docs/05-api/phase2-manual-edit-api.md", "utf8");
contract = replaceOnce(
  contract,
  "- write bodyはContent-Lengthの有無にかかわらず16 KiBで打ち切る。",
  "- write bodyはContent-Lengthの有無にかかわらず64 KiBで打ち切る。10,000 Unicode code pointのdescriptionが4 byte文字でもJSONとして収まる一方、無制限bufferは許可しない。",
  "manual write body budget documentation"
);
contract = replaceOnce(
  contract,
  `- DB書込は\`update_manual_step\` RPCを利用し、append/delete/reorderと同じdraft revision rowをlockする。\n- \`position\`、`,
  `- DB書込は\`update_manual_step\` RPCを利用し、append/delete/reorderと同じdraft revision rowをlockする。\n- Workerが取得したstepの\`updatedAt\`を楽観的更新条件としてRPCへ渡し、revision lock取得後のDB rowと一致するときだけ更新する。同じversionからの後続更新は\`409 MANUAL_STEP_EDIT_CONFLICT\`とし、先行更新を上書きしない。\n- \`position\`、`,
  "manual step optimistic API documentation"
);
contract = replaceOnce(
  contract,
  `- 4 RPCが同じrevision lockを待つ並行実行試験\n- step更新時の手修正instruction保持`,
  `- 4 RPCが同じrevision lockを待つ並行実行試験\n- 同じupdatedAtを持つ2更新のうち1件だけ成功し、もう1件が\`MANUAL_STEP_EDIT_CONFLICT\`になる並行実行試験\n- step更新時の手修正instruction保持`,
  "manual step concurrent test documentation"
);
await writeFile("docs/05-api/phase2-manual-edit-api.md", contract, "utf8");

let decisionLog = await readFile("docs/09-delivery/decision-log.md", "utf8");
decisionLog = replaceOnce(
  decisionLog,
  `| DEC-052 | 2026-08-14 | 手順書詳細は200 active steps・6 MiB、draft description 10,000文字、step title 128文字、instruction 4,000文字、target 256文字、URL 2,048文字を上限とし、manual/revision/stepのwriteはSECURITY DEFINER RPCへ集約する | 有効なデータだけで詳細APIのbuffer上限を超えるDoSと、複数tableの部分更新・Worker境界迂回を同時に防ぐため |\n\nDEC-014`,
  `| DEC-052 | 2026-08-14 | 手順書詳細は200 active steps・6 MiB、draft description 10,000文字、step title 128文字、instruction 4,000文字、target 256文字、URL 2,048文字を上限とし、manual/revision/stepのwriteはSECURITY DEFINER RPCへ集約する | 有効なデータだけで詳細APIのbuffer上限を超えるDoSと、複数tableの部分更新・Worker境界迂回を同時に防ぐため |\n| DEC-053 | 2026-08-14 | 手順書write body上限を64 KiBとし、step PATCHは取得時のupdatedAtをrevision lock内で照合する楽観的更新にする | 10,000 Unicode code pointの日本語説明を正当に受理しつつ、同じ旧versionを基にした並行更新が互いの変更を黙って上書きすることを防ぐため |\n\nDEC-014`,
  "manual concurrency and body budget decision"
);
await writeFile("docs/09-delivery/decision-log.md", decisionLog, "utf8");

console.log("Phase 2 manual optimistic concurrency and request budget fixes applied.");
