import { readFile } from "node:fs/promises";

const worker = await readFile("apps/worker/src/index.ts", "utf8");
const appAssets = await readFile("apps/worker/src/app-assets.ts", "utf8");

const requiredWorkerSnippets = [
  "import { APP_CSS, APP_HTML, APP_JS } from \"./app-assets\"",
  "POST\" && url.pathname === \"/api/auth/login\"",
  "POST\" && url.pathname === \"/api/auth/logout\"",
  "GET\" && url.pathname === \"/api/session\"",
  "POST\" && url.pathname === \"/api/workspaces\"",
  "HttpOnly",
  "SameSite=Lax",
  "content-security-policy",
  "/rest/v1/rpc/create_workspace",
  "MAX_JSON_BODY_BYTES",
  "verifySameOriginWrite(request)",
  "ORIGIN_MISMATCH",
  "decodeURIComponent",
  "/v1/integrations/discord/interactions",
  "verifyDiscordSignature",
  "GITHUB_ISSUE_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_INTERACTION_STORE",
  "DISCORD_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE",
  "DISCORD_ALLOWED_GUILD_IDS_REQUIRED",
  "DISCORD_ALLOWED_CHANNEL_IDS_REQUIRED",
  "status/triage",
  "priority/",
  "blocked-from-discord"
];

const forbiddenSnippets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
  "JWT_SECRET",
  "DATABASE_PASSWORD"
];

const errors = [];

for (const snippet of requiredWorkerSnippets) {
  if (!worker.includes(snippet)) {
    errors.push(`Missing worker harness snippet: ${snippet}`);
  }
}

for (const snippet of forbiddenSnippets) {
  if (worker.includes(snippet) || appAssets.includes(snippet)) {
    errors.push(`Forbidden secret-related snippet found: ${snippet}`);
  }
}

if (/Test1234|test@example/.test(worker) || /Test1234|test@example/.test(appAssets)) {
  errors.push("Test credentials must not be embedded in the public Worker UI.");
}

const appJsMatch = appAssets.match(/export const APP_JS = `([\s\S]*)`;\s*$/);
if (!appJsMatch) {
  errors.push("APP_JS template not found in app-assets.ts.");
} else {
  try {
    new Function(appJsMatch[1]);
  } catch (error) {
    errors.push(`APP_JS syntax error: ${error.message}`);
  }
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}

console.log("Worker harness OK.");
