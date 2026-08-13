import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const STAGING_SUPABASE_REF = "spjowmulvoyxxkfeyjkr";
const STAGING_SUPABASE_ANON_KEY_SHA256 = "adce1c87f20633f9737ca9edb6bbb454fd14690e674310e12a6fb11086ad9a1b";
const expected = {
  APP_ENV: "staging",
  APP_BASE_URL: "https://meccha-manual.tattoo-studio-crm.workers.dev",
  BILLING_FEATURE_ENABLED: "false",
  SUPABASE_URL: `https://${STAGING_SUPABASE_REF}.supabase.co`
};

const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
const errors = [];

if (wrangler.keep_vars !== true) {
  errors.push("wrangler.jsonc must keep keep_vars=true during the prelaunch staging shortcut.");
}

for (const [name, value] of Object.entries(expected)) {
  if (wrangler.vars?.[name] !== value) {
    errors.push(`${name} must match the approved provisional staging value.`);
  }
}

if (wrangler.vars?.APP_BASE_URL?.includes("meccha-iiyatsu.com")) {
  errors.push("The provisional staging Worker must not point APP_BASE_URL at the production custom domain.");
}

if (String(wrangler.vars?.BILLING_FEATURE_ENABLED).toLowerCase() !== "false") {
  errors.push("Billing must remain fail-closed during Phase 1 prelaunch.");
}

const anonKey = wrangler.vars?.SUPABASE_ANON_KEY;
if (typeof anonKey !== "string") {
  errors.push("SUPABASE_ANON_KEY must be present for the provisional staging Worker.");
} else {
  const anonKeySha256 = createHash("sha256").update(anonKey, "utf8").digest("hex");
  if (anonKeySha256 !== STAGING_SUPABASE_ANON_KEY_SHA256) {
    errors.push("SUPABASE_ANON_KEY must exactly match the approved public staging anon key fingerprint.");
  }

  try {
    const parts = anonKey.split(".");
    if (parts.length !== 3) throw new Error("JWT must have three segments");
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (payload.ref !== STAGING_SUPABASE_REF) {
      errors.push("SUPABASE_ANON_KEY must belong to the approved staging Supabase project.");
    }
    if (payload.role !== "anon") {
      errors.push("SUPABASE_ANON_KEY must be an anon key, not a privileged Supabase credential.");
    }
  } catch {
    errors.push("SUPABASE_ANON_KEY must be a valid Supabase anon JWT whose project can be verified.");
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Runtime boundary harness OK: provisional Worker is staging, approved staging Supabase URL/key are pinned, technical URL only, and billing is fail-closed.");
