import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const TITLE_MIGRATION = "supabase/migrations/202608140005_phase2_manual_title_length.sql";

test("accepted Phase 2 rollout includes the manual title constraint migration", async () => {
  const setup = await readFile("docs/04-data/phase2-manual-core-setup.md", "utf8");
  assert.match(setup, new RegExp(TITLE_MIGRATION.replaceAll("/", "\\/")));
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
