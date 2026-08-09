import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/phase1-migration-bundle.mjs"], {
  encoding: "utf8",
  maxBuffer: 2 * 1024 * 1024,
  stdio: ["ignore", "pipe", "pipe"]
});

if (result.error || result.status !== 0) {
  throw new Error("Phase 1 migration bundle generation failed.");
}

const bundle = result.stdout;
const baseline = "-- BEGIN supabase/migrations/202608010001_phase1_identity_workspaces.sql";
const hardening = "-- BEGIN supabase/migrations/202608010002_phase1_workspace_membership_hardening.sql";
const inputHardening = "-- BEGIN supabase/migrations/202608100001_phase1_workspace_input_hardening.sql";
const errors = [];

if ((bundle.match(/^begin;$/gm) || []).length !== 1) {
  errors.push("bundle must contain exactly one begin statement");
}
if ((bundle.match(/^commit;$/gm) || []).length !== 1 || !bundle.trimEnd().endsWith("commit;")) {
  errors.push("bundle must end with exactly one commit statement");
}
if ((bundle.match(/^-- SHA-256 [a-f0-9]{64}$/gm) || []).length !== 3) {
  errors.push("bundle must contain three migration SHA-256 markers");
}
if (bundle.indexOf(baseline) < 0 || bundle.indexOf(hardening) < 0 || bundle.indexOf(inputHardening) < 0) {
  errors.push("bundle must contain all Phase 1 migrations");
} else if (!(bundle.indexOf(baseline) < bundle.indexOf(hardening) && bundle.indexOf(hardening) < bundle.indexOf(inputHardening))) {
  errors.push("Phase 1 migrations must preserve their declared order");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Phase 1 migration bundle OK: one transaction, three ordered migrations, three SHA-256 markers.");
