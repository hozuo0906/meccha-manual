import { APP_CSS, APP_HTML, APP_JS } from "./app-assets";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

interface HealthResponse {
  service: "meccha-manual";
  status: "ok";
  phase: "phase-1-auth-workspace-harness";
  timestamp: string;
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

interface SupabaseUser {
  id: string;
  email?: string;
}

interface SupabaseAuthTokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SupabaseUser;
}

interface SessionResult {
  user: SupabaseUser;
  accessToken: string;
  responseCookies: string[];
}

const COOKIE_ACCESS_TOKEN = "__Host-mm_access";
const COOKIE_REFRESH_TOKEN = "__Host-mm_refresh";
const MAX_JSON_BODY_BYTES = 16 * 1024;
const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};
const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy": [
    "default-src 'self'",
    "base-uri 'none'",
    "connect-src 'self'",
    "font-src 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data:",
    "script-src 'self'",
    "style-src 'self'"
  ].join("; ")
};

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

function ensureSupabaseConfig(env: Env): { url: string; anonKey: string } {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) {
    throw new AppError(500, "SUPABASE_NOT_CONFIGURED", "Supabase設定が未完了です。");
  }

  return {
    url: env.SUPABASE_URL.replace(/\/$/, ""),
    anonKey: env.SUPABASE_ANON_KEY
  };
}

class AppError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function jsonResponse(body: unknown, init?: ResponseInit, cookies: string[] = []): Response {
  const headers = new Headers({
    ...JSON_HEADERS,
    ...SECURITY_HEADERS
  });

  if (init?.headers) {
    const incomingHeaders = new Headers(init.headers);
    incomingHeaders.forEach((value, key) => {
      headers.set(key, value);
    });
  }

  for (const cookie of cookies) {
    headers.append("set-cookie", cookie);
  }

  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers
  });
}

function htmlResponse(body: string): Response {
  return new Response(body, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      ...SECURITY_HEADERS
    }
  });
}

function assetResponse(body: string, contentType: string): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=300",
      ...SECURITY_HEADERS
    }
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return jsonResponse({
      code: error.code,
      message: error.message
    }, { status: error.status });
  }

  return jsonResponse({
    code: "INTERNAL_ERROR",
    message: "予期しないエラーが発生しました。"
  }, { status: 500 });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new AppError(415, "JSON_CONTENT_TYPE_REQUIRED", "Content-Typeはapplication/jsonにしてください。");
  }

  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    throw new AppError(413, "JSON_BODY_TOO_LARGE", "リクエストが大きすぎます。");
  }

  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_JSON_BODY_BYTES) {
      throw new AppError(413, "JSON_BODY_TOO_LARGE", "リクエストが大きすぎます。");
    }

    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(400, "INVALID_JSON", "JSONの形式が正しくありません。");
  }
}

function verifySameOriginWrite(request: Request): void {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;

  const origin = request.headers.get("origin");
  if (!origin) {
    throw new AppError(403, "ORIGIN_REQUIRED", "不正なリクエストです。");
  }

  const requestUrl = new URL(request.url);
  let originUrl: URL;

  try {
    originUrl = new URL(origin);
  } catch {
    throw new AppError(403, "ORIGIN_INVALID", "不正なリクエストです。");
  }

  if (originUrl.origin !== requestUrl.origin) {
    throw new AppError(403, "ORIGIN_MISMATCH", "不正なリクエストです。");
  }
}

function parseCookies(request: Request): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const cookies = new Map<string, string>();

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    try {
      cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
    } catch {
      continue;
    }
  }

  return cookies;
}

function sessionCookie(name: string, value: string, maxAge: number): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function clearSessionCookies(): string[] {
  return [
    sessionCookie(COOKIE_ACCESS_TOKEN, "", 0),
    sessionCookie(COOKIE_REFRESH_TOKEN, "", 0)
  ];
}

async function supabaseFetch(
  env: Env,
  path: string,
  init: RequestInit = {},
  accessToken?: string
): Promise<Response> {
  const config = ensureSupabaseConfig(env);
  const headers = new Headers(init.headers);
  headers.set("apikey", config.anonKey);

  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(`${config.url}${path}`, {
    ...init,
    headers
  });
}

async function readSupabaseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function assertSupabaseOk(response: Response, fallbackCode: string, fallbackMessage: string): Promise<unknown> {
  const payload = await readSupabaseJson(response);

  if (response.ok) return payload;

  const message = typeof payload === "object" && payload && "message" in payload
    ? String((payload as { message?: unknown }).message)
    : fallbackMessage;

  throw new AppError(response.status, fallbackCode, message || fallbackMessage);
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody<{ email?: string; password?: string }>(request);
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    throw new AppError(400, "LOGIN_INPUT_REQUIRED", "メールアドレスとパスワードを入力してください。");
  }

  const response = await supabaseFetch(env, "/auth/v1/token?grant_type=password", {
    method: "POST",
    body: JSON.stringify({ email, password })
  });

  const payload = await assertSupabaseOk(response, "LOGIN_FAILED", "ログインに失敗しました。");
  const auth = payload as SupabaseAuthTokenResponse;

  if (!auth.access_token || !auth.refresh_token || !auth.user?.id) {
    throw new AppError(502, "LOGIN_RESPONSE_INVALID", "認証レスポンスを確認できませんでした。");
  }

  const cookies = [
    sessionCookie(COOKIE_ACCESS_TOKEN, auth.access_token, auth.expires_in || 3600),
    sessionCookie(COOKIE_REFRESH_TOKEN, auth.refresh_token, 60 * 60 * 24 * 30)
  ];

  return jsonResponse({ user: sanitizeUser(auth.user) }, undefined, cookies);
}

async function refreshSession(env: Env, refreshToken: string): Promise<SessionResult> {
  const response = await supabaseFetch(env, "/auth/v1/token?grant_type=refresh_token", {
    method: "POST",
    body: JSON.stringify({ refresh_token: refreshToken })
  });
  const payload = await assertSupabaseOk(response, "SESSION_REFRESH_FAILED", "セッションを更新できませんでした。");
  const auth = payload as SupabaseAuthTokenResponse;

  if (!auth.access_token || !auth.refresh_token || !auth.user?.id) {
    throw new AppError(401, "SESSION_REFRESH_INVALID", "もう一度ログインしてください。");
  }

  return {
    user: auth.user,
    accessToken: auth.access_token,
    responseCookies: [
      sessionCookie(COOKIE_ACCESS_TOKEN, auth.access_token, auth.expires_in || 3600),
      sessionCookie(COOKIE_REFRESH_TOKEN, auth.refresh_token, 60 * 60 * 24 * 30)
    ]
  };
}

async function requireSession(request: Request, env: Env): Promise<SessionResult> {
  const cookies = parseCookies(request);
  const accessToken = cookies.get(COOKIE_ACCESS_TOKEN);
  const refreshToken = cookies.get(COOKIE_REFRESH_TOKEN);

  if (!accessToken && !refreshToken) {
    throw new AppError(401, "SESSION_REQUIRED", "ログインしてください。");
  }

  if (accessToken) {
    const response = await supabaseFetch(env, "/auth/v1/user", { method: "GET" }, accessToken);
    if (response.ok) {
      const user = await response.json() as SupabaseUser;
      return { user, accessToken, responseCookies: [] };
    }
  }

  if (refreshToken) {
    return refreshSession(env, refreshToken);
  }

  throw new AppError(401, "SESSION_EXPIRED", "セッションの有効期限が切れました。");
}

function sanitizeUser(user: SupabaseUser): SupabaseUser {
  return {
    id: user.id,
    email: user.email
  };
}

async function getSession(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  const [profile, workspaces] = await Promise.all([
    fetchProfile(env, session.accessToken, session.user.id),
    fetchWorkspaces(env, session.accessToken)
  ]);

  return jsonResponse({
    user: sanitizeUser(session.user),
    profile,
    workspaces
  }, undefined, session.responseCookies);
}

async function fetchProfile(env: Env, accessToken: string, userId: string): Promise<unknown> {
  const query = `/rest/v1/profiles?select=id,display_name,locale,timezone&id=eq.${encodeURIComponent(userId)}&limit=1`;
  const response = await supabaseFetch(env, query, { method: "GET" }, accessToken);
  const payload = await assertSupabaseOk(response, "PROFILE_FETCH_FAILED", "プロフィールを取得できませんでした。");
  return Array.isArray(payload) ? payload[0] ?? null : null;
}

async function fetchWorkspaces(env: Env, accessToken: string): Promise<unknown[]> {
  const query = "/rest/v1/workspaces?select=id,name,slug,status,created_at&order=created_at.desc";
  const response = await supabaseFetch(env, query, { method: "GET" }, accessToken);
  const payload = await assertSupabaseOk(response, "WORKSPACES_FETCH_FAILED", "ワークスペースを取得できませんでした。");
  return Array.isArray(payload) ? payload : [];
}

async function createWorkspace(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  const body = await readJsonBody<{ name?: string; slug?: string }>(request);
  const name = String(body.name ?? "").trim();
  const slug = String(body.slug ?? "").trim().toLowerCase();

  if (name.length < 1 || name.length > 64) {
    throw new AppError(400, "WORKSPACE_NAME_INVALID", "ワークスペース名は1〜64文字で入力してください。");
  }

  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) {
    throw new AppError(400, "WORKSPACE_SLUG_INVALID", "URL用IDは半角英数字とハイフンで3〜63文字にしてください。");
  }

  const response = await supabaseFetch(env, "/rest/v1/rpc/create_workspace", {
    method: "POST",
    body: JSON.stringify({
      workspace_name: name,
      workspace_slug: slug
    })
  }, session.accessToken);

  const workspaceId = await assertSupabaseOk(response, "WORKSPACE_CREATE_FAILED", "ワークスペースを作成できませんでした。");

  return jsonResponse({
    workspaceId,
    workspaces: await fetchWorkspaces(env, session.accessToken)
  }, { status: 201 }, session.responseCookies);
}

function logout(): Response {
  return jsonResponse({ status: "ok" }, undefined, clearSessionCookies());
}

function configHealth(env: Env): Response {
  const hasUrl = Boolean(env.SUPABASE_URL);
  const hasAnonKey = Boolean(env.SUPABASE_ANON_KEY);

  return jsonResponse({
    service: "meccha-manual",
    status: "ok",
    phase: "phase-1-auth-workspace-harness",
    timestamp: new Date().toISOString(),
    config: {
      supabase: {
        configured: hasUrl && hasAnonKey,
        hasUrl,
        hasAnonKey,
        projectRef: getSupabaseProjectRef(env.SUPABASE_URL)
      }
    }
  } satisfies ConfigHealthResponse);
}

function basicHealth(): Response {
  return jsonResponse({
    service: "meccha-manual",
    status: "ok",
    phase: "phase-1-auth-workspace-harness",
    timestamp: new Date().toISOString()
  } satisfies HealthResponse);
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);

  verifySameOriginWrite(request);

  if (request.method === "GET" && url.pathname === "/") return htmlResponse(APP_HTML);
  if (request.method === "GET" && url.pathname === "/assets/app.css") return assetResponse(APP_CSS, "text/css; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/assets/app.js") return assetResponse(APP_JS, "application/javascript; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/health") return basicHealth();
  if (request.method === "GET" && url.pathname === "/health/config") return configHealth(env);
  if (request.method === "GET" && url.pathname === "/api/session") return getSession(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/logout") return logout();
  if (request.method === "GET" && url.pathname === "/api/workspaces") {
    const session = await requireSession(request, env);
    return jsonResponse({ workspaces: await fetchWorkspaces(env, session.accessToken) }, undefined, session.responseCookies);
  }
  if (request.method === "POST" && url.pathname === "/api/workspaces") return createWorkspace(request, env);

  return jsonResponse({
    code: "NOT_FOUND",
    message: "指定されたページまたはAPIが見つかりません。"
  }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    try {
      return await route(request, env);
    } catch (error) {
      return errorResponse(error);
    }
  }
} satisfies ExportedHandler<Env>;
