import phase1Worker from "./index.ts";
import { handleCaptureRoute } from "./capture-router.ts";
import { handleManualEditRoute } from "./manual-edit-router.ts";
import { handleManualRoute, type ManualEnv } from "./manual-router.ts";
import { inspectAccessConfig } from "./server-config.ts";

type Env = ManualEnv & {
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  ACCESS_JWKS_URL?: string;
  DISCORD_INTERACTION_STORE?: KVNamespace;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_ALLOWED_GUILD_IDS?: string;
  DISCORD_ALLOWED_CHANNEL_IDS?: string;
  DISCORD_ALLOWED_USER_IDS?: string;
  DISCORD_ALLOWED_ROLE_IDS?: string;
  DISCORD_ALLOW_UNSCOPED_COMMANDS?: string;
  GITHUB_ISSUE_TOKEN?: string;
  GITHUB_ISSUE_REPOSITORY?: string;
};

const MANUAL_MIGRATION_CODE = "MANUAL_MIGRATION_IN_PROGRESS";
const LEGACY_MANUAL_ROUTE = /^\/(?:api|v1)\/workspaces\/[^/]+\/manuals(?:\/|$)/;

function accessModeEnabled(env: Env): boolean {
  const access = inspectAccessConfig(env);
  return access.hasIssuer || access.hasAudience || access.hasJwksUrl;
}

function manualMigrationResponse(): Response {
  return new Response(JSON.stringify({
    code: MANUAL_MIGRATION_CODE,
    message: "手順書機能は移行中のため、現在利用できません。"
  }), {
    status: 503,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "same-origin"
    }
  });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (accessModeEnabled(env)) {
      const pathname = new URL(request.url).pathname;
      if (LEGACY_MANUAL_ROUTE.test(pathname)) return manualMigrationResponse();
    }
    const captureResponse = await handleCaptureRoute(request, env);
    if (captureResponse) return captureResponse;
    const manualEditResponse = await handleManualEditRoute(request, env);
    if (manualEditResponse) return manualEditResponse;
    const manualResponse = await handleManualRoute(request, env);
    if (manualResponse) return manualResponse;
    return phase1Worker.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
