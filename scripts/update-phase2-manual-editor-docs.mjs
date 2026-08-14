import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) throw new Error(`Replacement target is not unique: ${label}`);
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

let traceability = await readFile("docs/01-product/requirements-traceability.md", "utf8");
traceability = replaceOnce(
  traceability,
  "| FR-004 | SCR-MANUAL-EDITOR | `GET/POST /api/workspaces/{id}/manuals`, manual detail/draft APIs | manuals, manual_revisions, manual_steps | ADR-0006 | `tests/manual-api.test.mjs`, `tests/manual-edit-api.test.mjs`, AC-010 | #63, #64, #74, EPIC-06 |",
  "| FR-004 | SCR-MANUAL-EDITOR | `GET/POST /api/workspaces/{id}/manuals`, manual detail/draft APIs | manuals, manual_revisions, manual_steps | ADR-0006 | `tests/manual-api.test.mjs`, `tests/manual-edit-api.test.mjs`, `tests/e2e/phase2-manual-editor.spec.mjs`, AC-010 | #63, #64, #65, #74, EPIC-06 |",
  "FR-004 manual editor UI traceability"
);
traceability = replaceOnce(
  traceability,
  "| FR-005 | SCR-MANUAL-EDITOR | manual step append/update/delete/reorder APIs | manual_steps | ADR-0006 | `tests/manual-edit-api.test.mjs`, step RPC/RLS/lock SQL tests | #64, #74, EPIC-06 |",
  "| FR-005 | SCR-MANUAL-EDITOR | manual step append/update/delete/reorder APIs | manual_steps | ADR-0006 | `tests/manual-edit-api.test.mjs`, step RPC/RLS/lock SQL tests, `tests/e2e/phase2-manual-editor.spec.mjs` | #64, #65, #74, EPIC-06 |",
  "FR-005 manual editor UI traceability"
);
traceability = replaceOnce(
  traceability,
  "| FR-006 | SCR-MANUAL-EDITOR | local instruction suggestion only; external APIなし | - | ADR-0009 | `tests/manual-instruction-template.test.mjs`, `tests/manual-edit-api.test.mjs` | #64, #74, EPIC-06 |",
  "| FR-006 | SCR-MANUAL-EDITOR | local instruction suggestion only; external APIなし | - | ADR-0009 | `tests/manual-instruction-template.test.mjs`, `tests/manual-edit-api.test.mjs`, `tests/e2e/phase2-manual-editor.spec.mjs` | #64, #65, #74, EPIC-06 |",
  "FR-006 manual editor UI traceability"
);
traceability = replaceOnce(
  traceability,
  "- #63は一覧・新規作成、#64は詳細・draft/step編集、#65はUI/E2Eへ分離する。",
  "- #63は一覧・新規作成、#64/#74は詳細・draft/step編集、#65は一覧・エディタUI/E2Eを正とする。",
  "Phase 2 issue split"
);
await writeFile("docs/01-product/requirements-traceability.md", traceability, "utf8");
