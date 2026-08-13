import { readFile } from "node:fs/promises";

const expected = {
  APP_ENV: "staging",
  APP_BASE_URL: "https://meccha-manual.tattoo-studio-crm.workers.dev",
  BILLING_FEATURE_ENABLED: "false"
};

const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const errors = [];

if (wrangler.keep_vars !== true) {
  errors.push("wrangler.jsonc must keep keep_vars=true during the prelaunch staging shortcut.");
}

for (const [name, value] of Object.entries(expected)) {
  if (wrangler.vars?.[name] !== value) {
    errors.push(`${name} must be pinned to ${value} for the provisional staging Worker.`);
  }
}

if (wrangler.vars?.APP_BASE_URL?.includes("meccha-iiyatsu.com")) {
  errors.push("The provisional staging Worker must not point APP_BASE_URL at the production custom domain.");
}

if (String(wrangler.vars?.BILLING_FEATURE_ENABLED).toLowerCase() !== "false") {
  errors.push("Billing must remain fail-closed during Phase 1 prelaunch.");
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Runtime boundary harness OK: provisional Worker is staging, technical URL only, and billing is fail-closed.");
