import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

function replaceIfNeeded(source, find, replacement, label) {
  if (source.includes(replacement)) return source;
  return replaceOnce(source, find, replacement, label);
}

function appendIfMissing(source, marker, addition) {
  if (source.includes(marker)) return source;
  return `${source.trimEnd()}\n\n${addition.trim()}\n`;
}

const migration = `-- Phase 2 manual titles must remain bounded and nonblank so list responses stay available.
-- Existing rows are not truncated or normalized; validation fails safely if incompatible data exists.
-- The btrim character set mirrors ECMAScript String.prototype.trim whitespace/line terminators.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manuals_title_length'
      and conrelid = 'public.manuals'::regclass
  ) then
    alter table public.manuals
      add constraint manuals_title_length
      check (char_length(title) between 1 and 64)
      not valid;
  end if;
end $$;

alter table public.manuals validate constraint manuals_title_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manuals_title_nonblank'
      and conrelid = 'public.manuals'::regclass
  ) then
    alter table public.manuals
      add constraint manuals_title_nonblank
      check (
        char_length(
          btrim(
            title,
            ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
            chr(160) || chr(5760) ||
            chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
            chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) ||
            chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)
          )
        ) > 0
      )
      not valid;
  end if;
end $$;

alter table public.manuals validate constraint manuals_title_nonblank;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_revisions_title_length'
      and conrelid = 'public.manual_revisions'::regclass
  ) then
    alter table public.manual_revisions
      add constraint manual_revisions_title_length
      check (char_length(title) between 1 and 64)
      not valid;
  end if;
end $$;

alter table public.manual_revisions validate constraint manual_revisions_title_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_revisions_title_nonblank'
      and conrelid = 'public.manual_revisions'::regclass
  ) then
    alter table public.manual_revisions
      add constraint manual_revisions_title_nonblank
      check (
        char_length(
          btrim(
            title,
            ' ' || chr(9) || chr(10) || chr(11) || chr(12) || chr(13) ||
            chr(160) || chr(5760) ||
            chr(8192) || chr(8193) || chr(8194) || chr(8195) || chr(8196) ||
            chr(8197) || chr(8198) || chr(8199) || chr(8200) || chr(8201) || chr(8202) ||
            chr(8232) || chr(8233) || chr(8239) || chr(8287) || chr(12288) || chr(65279)
          )
        ) > 0
      )
      not valid;
  end if;
end $$;

alter table public.manual_revisions validate constraint manual_revisions_title_nonblank;
`;

await writeFile(
  "supabase/migrations/202608140005_phase2_manual_title_length.sql",
  migration,
  "utf8"
);

let router = await readFile("apps/worker/src/manual-router.ts", "utf8");
router = replaceIfNeeded(
  router,
  "      workspaceId = decodeURIComponent(match[1]);",
  "      workspaceId = decodeURIComponent(match[1]).toLowerCase();",
  "canonical workspace UUID"
);
await writeFile("apps/worker/src/manual-router.ts", router, "utf8");

const blankTitleSqlTests = `do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.manuals (
      id,
      workspace_id,
      title,
      owner_id,
      created_by
    )
    values (
      '66666666-6666-4666-8666-666666666666',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      repeat(chr(9), 3),
      '11111111-1111-4111-8111-111111111111',
      '11111111-1111-4111-8111-111111111111'
    );
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'tab-only manual title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    insert into public.manual_revisions (
      id,
      workspace_id,
      manual_id,
      title,
      created_by
    )
    values (
      '77777777-7777-4777-8777-777777777777',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      '22222222-2222-4222-8222-222222222222',
      repeat(chr(160), 3),
      '11111111-1111-4111-8111-111111111111'
    );
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'NBSP-only revision title was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manuals
    set title = repeat(chr(9), 3)
    where id = '22222222-2222-4222-8222-222222222222';
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'tab-only manual title update was accepted';
  end if;
end;
$$;

do $$
declare
  rejected boolean := false;
begin
  begin
    update public.manual_revisions
    set title = repeat(chr(160), 3)
    where id = '33333333-3333-4333-8333-333333333333';
  exception
    when check_violation then rejected := true;
  end;

  if not rejected then
    raise exception 'NBSP-only revision title update was accepted';
  end if;
end;
$$;`;

let sqlTest = await readFile("tests/sql/phase2-manual-title-test.sql", "utf8");
if (!sqlTest.includes("tab-only manual title was accepted")) {
  sqlTest = replaceOnce(
    sqlTest,
    "\nreset role;\n",
    `\n${blankTitleSqlTests}\n\nreset role;\n`,
    "authenticated blank-title database tests"
  );
}
await writeFile("tests/sql/phase2-manual-title-test.sql", sqlTest, "utf8");

let manualApiTest = await readFile("tests/manual-api.test.mjs", "utf8");
manualApiTest = replaceIfNeeded(
  manualApiTest,
  `  assert.match(migration, /char_length\\(title\\) between 1 and 64/i);\n});`,
  `  assert.match(migration, /char_length\\(title\\) between 1 and 64/i);\n  assert.match(migration, /manuals_title_nonblank/);\n  assert.match(migration, /manual_revisions_title_nonblank/);\n  assert.match(migration, /btrim\\(\\s*title/i);\n  assert.match(migration, /chr\\(160\\)/);\n});`,
  "manual title nonblank migration assertions"
);
manualApiTest = appendIfMissing(
  manualApiTest,
  "uppercase workspace UUID is canonicalized before querying and comparing rows",
  `test("uppercase workspace UUID is canonicalized before querying and comparing rows", async () => {
  const canonicalWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const uppercaseWorkspaceId = canonicalWorkspaceId.toUpperCase();
  const row = { ...manualRow(1), workspace_id: canonicalWorkspaceId };
  const mock = installFetch([
    authOk(),
    memberOk(),
    json([row], 200, { "content-range": "0-0/1" })
  ]);
  try {
    const response = await handleManualRoute(
      new Request(
        \`\${APP_ORIGIN}/api/workspaces/\${uppercaseWorkspaceId}/manuals\`,
        { headers: { cookie: "__Host-mm_access=access-token; __Host-mm_refresh=refresh-token" } }
      ),
      ENV
    );
    assert.equal(response?.status, 200);
    assert.equal((await response.json()).manuals[0].id, row.id);
    assert.deepEqual(JSON.parse(String(mock.calls[1].init.body)), {
      target_workspace_id: canonicalWorkspaceId,
      target_user_id: USER_ID
    });
    assert.ok(
      mock.calls[2].url.includes(\`workspace_id=eq.\${canonicalWorkspaceId}\`),
      "manual query must use the canonical lowercase workspace UUID"
    );
  } finally {
    mock.restore();
  }
});`
);
await writeFile("tests/manual-api.test.mjs", manualApiTest, "utf8");

let definitions = await readFile("docs/04-data/table-definitions.md", "utf8");
definitions = replaceIfNeeded(
  definitions,
  "| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧、editor以上で変更。`title`はtrim後1〜64 Unicode文字。`manuals_title_length` constraintでdirect authenticated writeを含めて強制 |",
  "| `manuals` | `workspace_id`, `folder_id`, `title`, `status`, `current_draft_revision_id`, `current_published_revision_id`, `owner_id`, `archived_at` | メンバー閲覧、editor以上で変更。raw `title`は`char_length(title) between 1 and 64`、かつECMAScript `trim()`相当後に空でないことを`manuals_title_length`と`manuals_title_nonblank`でdirect authenticated writeにも強制 |",
  "manuals title data contract"
);
definitions = replaceIfNeeded(
  definitions,
  "| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | 下書きはeditor以上、公開版は不変。`title`は1〜64 Unicode文字で、`manual_revisions_title_length` constraintを強制 |",
  "| `manual_revisions` | `workspace_id`, `manual_id`, `revision_no`, `state`, `title`, `description`, `source_url`, `cover_asset_id`, `published_at` | 下書きはeditor以上、公開版は不変。raw `title`は`char_length(title) between 1 and 64`、かつECMAScript `trim()`相当後に空でないことを`manual_revisions_title_length`と`manual_revisions_title_nonblank`で強制 |",
  "manual revision title data contract"
);
await writeFile("docs/04-data/table-definitions.md", definitions, "utf8");

let setup = await readFile("docs/04-data/phase2-manual-core-setup.md", "utf8");
setup = replaceIfNeeded(
  setup,
  "`202608140005_phase2_manual_title_length.sql` は、`manuals.title` と `manual_revisions.title` を1〜64文字へ固定するforward migrationである。既存行を切り詰めず、互換性のない既存データがある場合はconstraint validationを失敗させて安全に停止する。",
  "`202608140005_phase2_manual_title_length.sql` は、`manuals.title` と `manual_revisions.title` のraw長を1〜64文字へ固定し、ECMAScript `trim()`相当後に空白だけとなる値を拒否するforward migrationである。既存行を切り詰めたり正規化したりせず、互換性のない既存データがある場合はconstraint validationを失敗させて安全に停止する。",
  "manual title migration description"
);
setup = replaceIfNeeded(
  setup,
  "- `manuals.title` と `manual_revisions.title` の1〜64文字DB制約",
  "- `manuals.title` と `manual_revisions.title` のraw 1〜64文字・ECMAScript空白のみ拒否DB制約",
  "manual title scope"
);
setup = replaceIfNeeded(
  setup,
  "- 手順書タイトルとrevisionタイトルは、前後空白を除去した業務入力で1〜64 Unicode文字とし、WorkerとDB constraintの両方で強制する。",
  "- 手順書タイトルとrevisionタイトルは、WorkerでECMAScript `trim()`後1〜64 Unicode code pointへ正規化する。DB direct writeもraw 1〜64文字かつ同じ空白集合だけの値を拒否する。",
  "manual title rule"
);
setup = replaceIfNeeded(
  setup,
  "7. 既存の `manuals.title` と `manual_revisions.title` に65文字以上の行がないことを確認する。",
  "7. 既存の `manuals.title` と `manual_revisions.title` に65文字以上、またはECMAScript `trim()`相当後に空となる行がないことを確認する。",
  "manual title preflight"
);
setup = replaceIfNeeded(
  setup,
  "- `manuals_title_length`\n- `manual_revisions_title_length`",
  "- `manuals_title_length`\n- `manuals_title_nonblank`\n- `manual_revisions_title_length`\n- `manual_revisions_title_nonblank`",
  "manual title expected constraints"
);
setup = replaceIfNeeded(
  setup,
  "- 認証済みeditorのRLS経路でも65文字以上のmanual/revisionタイトルはDB constraintで拒否される。",
  "- 認証済みeditorのRLS経路でも65文字以上、およびタブ・NBSPなどECMAScript空白だけのmanual/revisionタイトルはDB constraintで拒否される。",
  "manual title verification plan"
);
await writeFile("docs/04-data/phase2-manual-core-setup.md", setup, "utf8");

let api = await readFile("docs/05-api/phase2-manual-api.md", "utf8");
api = replaceIfNeeded(
  api,
  "- 一覧本文は1000件・title最大64 code point・JSON最悪エスケープを含めて1 MiBで打ち切り、その他のSupabase JSON応答は512 KiBを維持する。",
  "- 一覧本文は1000件・title最大64 code point・JSON最悪エスケープを含めて1 MiBで打ち切り、その他のSupabase JSON応答は512 KiBを維持する（DEC-051）。",
  "manual list response budget decision reference"
);
await writeFile("docs/05-api/phase2-manual-api.md", api, "utf8");

let decisionLog = await readFile("docs/09-delivery/decision-log.md", "utf8");
if (!decisionLog.includes("| DEC-051 |")) {
  decisionLog = replaceOnce(
    decisionLog,
    "\n\nDEC-014とDEC-030の単一Pro価格部分はDEC-037で更新する。課金機能を初期OFFにする安全境界は継続する。",
    "\n| DEC-051 | 2026-08-14 | 手順書一覧のSupabase応答上限は1000件かつ1 MiBとし、その他のSupabase JSON応答は512 KiBを維持する | title最大64 Unicode code pointがJSON制御文字として最大6 byteへ展開しても1000件一覧を取得可能にしつつ、一般応答の無制限buffer拡大を避けるため |\n\nDEC-014とDEC-030の単一Pro価格部分はDEC-037で更新する。課金機能を初期OFFにする安全境界は継続する。",
    "manual list response budget decision"
  );
}
await writeFile("docs/09-delivery/decision-log.md", decisionLog, "utf8");

let docsTest = await readFile("tests/manual-title-docs.test.mjs", "utf8");
docsTest = replaceIfNeeded(
  docsTest,
  `  assert.match(definitions, /char_length\\(title\\) between 1 and 64/);\n});`,
  `  assert.match(definitions, /char_length\\(title\\) between 1 and 64/);\n  assert.match(definitions, /manuals_title_nonblank/);\n  assert.match(definitions, /manual_revisions_title_nonblank/);\n  assert.match(definitions, /ECMAScript \\x60trim\\(\\)\\x60相当/);\n});`,
  "table definition nonblank assertions"
);
docsTest = appendIfMissing(
  docsTest,
  "decision log records the dedicated manual-list response budget",
  `test("decision log records the dedicated manual-list response budget", async () => {
  const decisionLog = await readFile("docs/09-delivery/decision-log.md", "utf8");
  const api = await readFile("docs/05-api/phase2-manual-api.md", "utf8");
  assert.match(decisionLog, /DEC-051[^\\n]*1000件かつ1 MiB[^\\n]*512 KiB/);
  assert.match(decisionLog, /JSON制御文字として最大6 byte/);
  assert.match(api, /1 MiB[^\\n]*512 KiB[^\\n]*DEC-051/);
});`
);
await writeFile("tests/manual-title-docs.test.mjs", docsTest, "utf8");
