interface HealthResponse {
  service: "meccha-manual";
  status: "ok";
  phase: "cloudflare-worker-harness";
  timestamp: string;
}

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

interface ConfigHealthResponse extends HealthResponse {
  config: {
    supabase: {
      configured: boolean;
      hasUrl: boolean;
      hasAnonKey: boolean;
      projectRef: string | null;
    };
  };
}

function getSupabaseProjectRef(supabaseUrl: string | undefined): string | null {
  if (!supabaseUrl) return null;

  try {
    const hostname = new URL(supabaseUrl).hostname;
    if (!hostname.endsWith(".supabase.co")) return null;
    return hostname.replace(".supabase.co", "");
  } catch {
    return null;
  }
}

function jsonResponse(body: HealthResponse | ConfigHealthResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init?.headers
    }
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const timestamp = new Date().toISOString();

    if (url.pathname === "/health/config") {
      const hasUrl = Boolean(env.SUPABASE_URL);
      const hasAnonKey = Boolean(env.SUPABASE_ANON_KEY);

      return jsonResponse({
        service: "meccha-manual",
        status: "ok",
        phase: "cloudflare-worker-harness",
        timestamp,
        config: {
          supabase: {
            configured: hasUrl && hasAnonKey,
            hasUrl,
            hasAnonKey,
            projectRef: getSupabaseProjectRef(env.SUPABASE_URL)
          }
        }
      });
    }

    return jsonResponse({
      service: "meccha-manual",
      status: "ok",
      phase: "cloudflare-worker-harness",
      timestamp
    });
  }
} satisfies ExportedHandler<Env>;
