export interface SupabaseBindings {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseConfigInspection {
  configured: boolean;
  hasUrl: boolean;
  hasAnonKey: boolean;
  projectRef: string | null;
  config: SupabaseConfig | null;
}

const APPROVED_SUPABASE_HOSTS = new Set(["spjowmulvoyxxkfeyjkr.supabase.co"]);

export function inspectSupabaseConfig(env: SupabaseBindings): SupabaseConfigInspection {
  const rawUrl = String(env.SUPABASE_URL ?? "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY ?? "").trim();
  const hasUrl = rawUrl.length > 0;
  const hasAnonKey = anonKey.length > 0;

  let url: string | null = null;
  let projectRef: string | null = null;
  if (hasUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password || !APPROVED_SUPABASE_HOSTS.has(parsed.hostname)) {
        throw new Error("invalid Supabase URL");
      }
      url = parsed.origin;
      if (parsed.hostname.endsWith(".supabase.co")) {
        projectRef = parsed.hostname.slice(0, -".supabase.co".length) || null;
      }
    } catch {
      url = null;
    }
  }

  const config = url && hasAnonKey ? { url, anonKey } : null;
  return {
    configured: config !== null,
    hasUrl,
    hasAnonKey,
    projectRef,
    config
  };
}
