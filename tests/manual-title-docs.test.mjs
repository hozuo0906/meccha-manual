import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TITLE_MIGRATION = "supabase/migrations/202608140005_phase2_manual_title_length.sql";

test("accepted Phase 2 rollout includes the manual title constraint migration", async () => {
  const setup = await readFile("docs/04-data/phase2-manual-core-setup.md", "utf8");
  const migrationBlock = setup.match(/## Migration\s+[\s\S]*?\x60\x60\x60text\n([\s\S]*?)\x60\x60\x60/)?.[1];
  assert.ok(migrationBlock, "ordered Phase 2 migration block is required");
  const migrationFiles = migrationBlock.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const coreIndex = migrationFiles.indexOf("supabase/migrations/202608020001_phase2_manual_core.sql");
  const contextFixIndex = migrationFiles.indexOf("supabase/migrations/202608020002_phase2_manual_create_context_fix.sql");
  const titleIndex = migrationFiles.indexOf(TITLE_MIGRATION);
  assert.ok(coreIndex >= 0, "manual core migration must be executable");
  assert.ok(contextFixIndex > coreIndex, "context fix must follow manual core");
  assert.ok(titleIndex > contextFixIndex, "title constraint must follow both Phase 2 prerequisites");
  assert.match(setup, /manuals_title_length/);
  assert.match(setup, /manual_revisions_title_length/);
  assert.match(setup, /65文字以上/);
});

test("table definitions record the same manual title invariant", async () => {
  const definitions = await readFile("docs/04-data/table-definitions.md", "utf8");
  assert.match(definitions, /manuals\.title[^\n]*1〜64/);
  assert.match(definitions, /manual_revisions\.title[^\n]*1〜64/);
  assert.match(definitions, /char_length\(title\) between 1 and 64/);
});

test("Manual API CI executes the migration through authenticated RLS fixtures", async () => {
  const workflow = await readFile(".github/workflows/manual-api.yml", "utf8");
  assert.match(workflow, /postgres:16/);
  assert.match(workflow, /phase2-manual-title-fixture\.sql/);
  assert.match(workflow, /202608140005_phase2_manual_title_length\.sql/);
  assert.match(workflow, /phase2-manual-title-test\.sql/);
});
