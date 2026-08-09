import { readFile } from "node:fs/promises";

const worker = await readFile("apps/worker/src/index.ts", "utf8");
const appAssets = await readFile("apps/worker/src/app-assets.ts", "utf8");

const requiredWorkerSnippets = [
  "import { APP_CSS, APP_HTML, APP_JS } from \"./app-assets.ts\"",
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
  "/auth/v1/logout?scope=local",
  "LOGOUT_REVOKE_FAILED",
  "ORIGIN_MISMATCH",
  "decodeURIComponent",
  "/v1/integrations/discord/interactions",
  "verifyDiscordSignature",
  "GITHUB_ISSUE_TOKEN",
  "DISCORD_PUBLIC_KEY",
  "DISCORD_INTERACTION_STORE",
  "DISCORD_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE",
  "DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT",
  "merge_request",
  "GITHUB_MERGE_REQUEST_LABEL",
  "DISCORD_ALLOWED_GUILD_IDS_REQUIRED",
  "DISCORD_ALLOWED_CHANNEL_IDS_REQUIRED",
  "status/triage",
  "priority/",
  "blocked-from-discord"
];

const requiredAppSnippets = [
  "class AppRequestError",
  "let sessionGeneration = 0",
  "let sessionReloadSequence = 0",
  "new BroadcastChannel(\"meccha-manual-authentication\")",
  "announceAuthenticationChange()",
  "async function withAuthenticationLock(operation)",
  "AUTH_LOCK_UNAVAILABLE",
  "navigator.locks.request(\"meccha-manual-authentication\", { mode: \"exclusive\" }, operation)",
  "withAuthenticationLock(() => requestJson(\"/api/auth/login\"",
  "withAuthenticationLock(() => requestJson(\"/api/auth/logout\"",
  "function renderAuthenticationReload()",
  "ログイン状態を更新しています",
  "event.data?.type !== \"authentication-changed\"",
  "function replaceCurrentSession(nextSession)",
  "const requestSessionGeneration = sessionGeneration",
  "const requestSessionGeneration = ++sessionGeneration",
  "const requestReloadSequence = ++sessionReloadSequence",
  "const requestUserId = currentSession?.user?.id",
  "let requestWorkspaceSequence = ++sessionReloadSequence",
  "requestWorkspaceSequence = ++sessionReloadSequence",
  "requestWorkspaceSequence !== sessionReloadSequence",
  "let workspaceCreated = false",
  "workspaceCreated = true",
  "ワークスペースは作成されましたが、最新の一覧を取得できませんでした。",
  "session.user?.id !== requestUserId",
  "requestReloadSequence !== sessionReloadSequence",
  "currentSession?.user?.id !== session.user?.id",
  "currentSession = session",
  "if (requestSessionGeneration !== sessionGeneration) return",
  "renderLoadFailure",
  "error.status === 401",
  "error.code !== \"LOGOUT_REVOKE_FAILED\"",
  "error.code === \"AUTH_LOCK_UNAVAILABLE\"",
  "ログアウトを完了できませんでした。通信環境を確認して、もう一度お試しください。",
  "if (activeButton) activeButton.disabled = false",
  "SESSION_INVALID",
  "サービスを読み込めません",
  "ワークスペースを作成",
  "手順書（準備中）"
];

const forbiddenSnippets = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "service_role",
  "JWT_SECRET",
  "DATABASE_PASSWORD",
  "workspaceTemplate",
  "Supabase AuthとWorkerセッション"
];

const errors = [];

for (const snippet of requiredWorkerSnippets) {
  if (!worker.includes(snippet)) {
    errors.push(`Missing worker harness snippet: ${snippet}`);
  }
}

for (const snippet of requiredAppSnippets) {
  if (!appAssets.includes(snippet)) {
    errors.push(`Missing app harness snippet: ${snippet}`);
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
