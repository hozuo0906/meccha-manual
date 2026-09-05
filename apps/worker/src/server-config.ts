export interface SupabaseBindings {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface AccessBindings {
  ACCESS_ISSUER?: string;
  ACCESS_AUDIENCE?: string;
  ACCESS_JWKS_URL?: string;
}

export interface AccessConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
}

export interface AccessConfigInspection {
  configured: boolean;
  hasIssuer: boolean;
  hasAudience: boolean;
  hasJwksUrl: boolean;
  config: AccessConfig | null;
}

function trustedHttpsUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      !parsed.hostname ||
      parsed.username ||
      parsed.password ||
      parsed.search ||
      parsed.hash
    ) {
      return null;
    }
    // Keep the configured spelling for issuer comparison. URL parsing is only
    // used for the trust and safety checks; JWT `iss` is not normalized.
    return value;
  } catch {
    return null;
  }
}

export function inspectAccessConfig(env: AccessBindings): AccessConfigInspection {
  const rawIssuer = String(env.ACCESS_ISSUER ?? "").trim();
  const audience = String(env.ACCESS_AUDIENCE ?? "").trim();
  const rawJwksUrl = String(env.ACCESS_JWKS_URL ?? "").trim();
  const issuer = rawIssuer.length > 0 ? trustedHttpsUrl(rawIssuer) : null;
  const jwksUrl = rawJwksUrl.length > 0 ? trustedHttpsUrl(rawJwksUrl) : null;
  const hasIssuer = rawIssuer.length > 0;
  const hasAudience = audience.length > 0;
  const hasJwksUrl = rawJwksUrl.length > 0;
  const config = issuer && jwksUrl && hasAudience ? { issuer, audience, jwksUrl } : null;

  return { configured: config !== null, hasIssuer, hasAudience, hasJwksUrl, config };
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
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
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
