import phase1Worker from "./index.ts";
import { handleManualEditRoute } from "./manual-edit-router.ts";
import { handleManualRoute, type ManualEnv } from "./manual-router.ts";

type Env = ManualEnv & {
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

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const manualEditResponse = await handleManualEditRoute(request, env);
    if (manualEditResponse) return manualEditResponse;
    const manualResponse = await handleManualRoute(request, env);
    if (manualResponse) return manualResponse;
    return phase1Worker.fetch(request, env, ctx);
  }
} satisfies ExportedHandler<Env>;
