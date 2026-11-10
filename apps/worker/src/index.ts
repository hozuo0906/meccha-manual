import { MANUAL_SAMPLE_IMAGE_PATHS } from "./manual-sample-assets.ts";
import { EDITOR_TOOLS_JS } from "./editor-tools-assets.ts";
import { APP_CSS, APP_HTML, APP_JS } from "./app-assets.ts";
import { APP_ASSET_VERSION } from "./app-assets.ts";
import { AccessIdentityError, authenticateApplicationRequest, requireHumanActor, verifyAccessJwt, type ApplicationIdentityRepository } from "./access-identity.ts";
import { D1IdentityRepository } from "./infra/d1/identity-repository.ts";
import { D1OnboardingRepository } from "./infra/d1/onboarding-repository.ts";
import { D1RepositoryError } from "./infra/d1/d1-errors.ts";
import { D1WorkspaceRepository, type CreateWorkspaceInput, type ProfileRecord, type WorkspaceMemberRecord } from "./infra/d1/workspace-repository.ts";
import type { D1DatabaseLike } from "./infra/d1/d1-types.ts";
import { ONBOARDING_CSS, ONBOARDING_JS, renderOnboardingContinuePage } from "./onboarding-assets.ts";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "./cloud-manual-assets.ts";
import { handleCloudManualRoute } from "./cloud-manual-router.ts";
import { handleShareLinkRoute } from "./share-link-router.ts";
import { beginProductAuth, clearProductAuthTransactionCookie, configuredProductProviders, finishProductAuth, getProductSession, hasProductSessionCookie, ProductAuthError, productAuthReturnPath, revokeProductSession } from "./product-auth.ts";
import { inspectAccessConfig, inspectAccessHealthServiceTokenNames, inspectAppRuntimeConfig, inspectProductAuthConfig, inspectSupabaseConfig, isConfiguredOnboardingOrigin, ONBOARDING_ORIGINS, type AccessBindings, type AppRuntimeBindings, type ProductAuthBindings, type SupabaseBindings } from "./server-config.ts";

interface Env extends SupabaseBindings, AccessBindings, AppRuntimeBindings, ProductAuthBindings {
  DB?: D1DatabaseLike;
  ONBOARDING_RATE_LIMITER?: RateLimit;
  SHARE_AUTH_RATE_LIMITER?: RateLimit;
  DISCORD_INTERACTION_STORE?: KVNamespace;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_ALLOWED_GUILD_IDS?: string;
  DISCORD_ALLOWED_CHANNEL_IDS?: string;
  DISCORD_ALLOWED_USER_IDS?: string;
  DISCORD_ALLOWED_ROLE_IDS?: string;
  DISCORD_ALLOW_UNSCOPED_COMMANDS?: string;
  GITHUB_ISSUE_TOKEN?: string;
  GITHUB_ISSUE_REPOSITORY?: string;
  MANUAL_ASSETS?: R2Bucket;
  ASSETS?: Fetcher;
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
    productAuth: {
      googleConfigured: boolean;
      chatgptConfigured: boolean;
    };
    discord: {
      issueBridgeConfigured: boolean;
      hasPublicKey: boolean;
      hasIssueToken: boolean;
      hasIssueRepository: boolean;
      hasInteractionStore: boolean;
      hasAllowedGuildIds: boolean;
      hasAllowedChannelIds: boolean;
      allowUnscopedCommands: boolean;
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

interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  status: "active" | "suspended";
  created_at: string;
}

type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
type WorkspaceMemberStatus = "active" | "invited" | "removed";

interface WorkspaceMemberSummary {
  userId: string;
  displayName: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joinedAt: string | null;
}

interface WorkspaceMemberRpcRow {
  user_id: string;
  display_name: string;
  role: WorkspaceRole;
  status: WorkspaceMemberStatus;
  joined_at: string | null;
  actor_role?: WorkspaceRole;
  total_count?: number;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const JOIN_CODE_PATTERN = /^mmj_[A-Za-z0-9_-]{43}$/;
const WORKSPACE_INPUT_ERROR_CODES = new Set(["22023", "23505"]);

interface SessionResult {
  user: SupabaseUser;
  accessToken: string;
  responseCookies: string[];
}

const COOKIE_ACCESS_TOKEN = "__Host-mm_access";
const COOKIE_REFRESH_TOKEN = "__Host-mm_refresh";
const MAX_ACCESS_COOKIE_AGE_SECONDS = 60 * 60;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const MAX_SUPABASE_JSON_BYTES = 512 * 1024;
const MAX_WORKSPACE_LIST_ITEMS = 1000;
const MAX_WORKSPACE_MEMBER_LIST_ITEMS = 1000;
const SUPABASE_READ_TIMEOUT_MS = 5000;
const DISABLED_CALLBACK_PATHS = new Set([
  "/v1/webhooks/stripe",
  "/v1/integrations/discord/interactions"
]);
const CALLBACK_MIGRATION_CODE = "CALLBACK_MIGRATION_IN_PROGRESS";
const ACCESS_LEGACY_ROUTE_MIGRATION_CODE = "MANUAL_MIGRATION_IN_PROGRESS";
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

function ensureSupabaseConfig(env: Env): { url: string; anonKey: string } {
  const config = inspectSupabaseConfig(env).config;
  if (!config) {
    throw new AppError(500, "SUPABASE_NOT_CONFIGURED", "Supabase設定が未完了です。");
  }
  return config;
}

class AppError extends Error {
  status: number;
  code: string;
  responseCookies: string[];

  constructor(status: number, code: string, message: string, responseCookies: string[] = []) {
    super(message);
    this.status = status;
    this.code = code;
    this.responseCookies = responseCookies;
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

function assetResponse(body: string, contentType: string, versioned: boolean): Response {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": versioned
        ? "public, max-age=31536000, immutable"
        : "no-store",
      ...SECURITY_HEADERS
    }
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof AppError) {
    return jsonResponse({
      code: error.code,
      message: error.message
    }, { status: error.status }, error.responseCookies);
  }

  if (error instanceof ProductAuthError) {
    return jsonResponse({ code: error.code, message: error.message }, { status: error.status });
  }

  return jsonResponse({
    code: "INTERNAL_ERROR",
    message: "予期しないエラーが発生しました。"
  }, { status: 500 });
}

async function productAuthCallbackRoute(request: Request, env: Env, provider: "google" | "chatgpt"): Promise<Response> {
  try {
    const response = await finishProductAuth(request, env, provider);
    // A successful product login is an explicit authentication transition.
    // Clear competing legacy credentials so a later reload cannot resurrect
    // the previous Supabase account. Callback failures preserve them.
    for (const sessionCookie of clearSessionCookies()) response.headers.append("set-cookie", sessionCookie);
    return response;
  } catch (error) {
    const json = errorResponse(error);
    const status = json.status;
    const message = error instanceof ProductAuthError
      ? error.message
      : "ログインを完了できませんでした。時間をおいて、もう一度お試しください。";
    const returnPath = error instanceof ProductAuthError ? error.returnPath : undefined;
    const acceptsHtml = (request.headers.get("accept") ?? "").includes("text/html");
    const escapedMessage = message.replace(/[&<>\"']/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[value] ?? value));
    const safeReturn = returnPath?.replace(/[&<>\"']/g, (value) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[value] ?? value));
    const response = acceptsHtml
      ? new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ログインを完了できませんでした</title><main><h1>ログインを完了できませんでした</h1><p>${escapedMessage}</p><a href="${safeReturn ?? "/"}">${safeReturn ? "元の操作へ戻って再試行" : "ログイン画面へ戻る"}</a></main></html>`, { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff" } })
      : json;
    response.headers.set("referrer-policy", "no-referrer");
    const state = new URL(request.url).searchParams.get("state") ?? "";
    const transactionCookie = await clearProductAuthTransactionCookie(provider, state);
    if (transactionCookie) response.headers.append("set-cookie", transactionCookie);
    return response;
  }
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>\"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[character] ?? character));
}

function productAuthRecoveryUrl(request: Request, env: Env): string | null {
  const runtimeInspection = inspectAppRuntimeConfig(env);
  const runtime = runtimeInspection.config;
  const requestUrl = new URL(request.url);
  const knownOrigin = Object.values(ONBOARDING_ORIGINS).find((origin) => requestUrl.origin === origin) ?? null;
  const canonicalOrigin = runtime?.baseUrl ?? knownOrigin;
  if (!canonicalOrigin) return null;
  if (requestUrl.origin !== canonicalOrigin) return `${canonicalOrigin}/`;
  try {
    return new URL(productAuthReturnPath(requestUrl.searchParams.get("return")), canonicalOrigin).toString();
  } catch {
    return `${canonicalOrigin}/`;
  }
}

function productAuthRecoveryHtml(request: Request, env: Env, status: number, message: string): Response {
  const recoveryUrl = productAuthRecoveryUrl(request, env);
  const safeMessage = escapeHtml(message);
  const recoveryLink = recoveryUrl
    ? `<a class="primary-button" href="${escapeHtml(recoveryUrl)}">元の画面へ戻る</a>`
    : "<p class=\"muted\">ログイン設定が整った後に、ログイン画面からやり直してください。</p>";
  return new Response(`<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>ログインを開始できませんでした</title><link rel="stylesheet" href="/assets/app.css?v=${APP_ASSET_VERSION}"></head><body><a class="skip-link" href="#screen-content">本文へ移動</a><main class="app"><section id="screen-content" class="login-screen" aria-labelledby="auth-recovery-heading" tabindex="-1"><div class="login-intro"><div class="login-copy"><div class="logo-mark" aria-hidden="true"><span>め</span></div><p class="eyebrow">日本のオフィスワーカー専用</p><h1>めっちゃマニュアル</h1><p>業務の手順をわかりやすく整理し、チームで共有するためのサービスです。</p></div></div><div class="login-panel"><div class="panel-heading"><h2 id="auth-recovery-heading">ログインを開始できませんでした</h2><p class="error-box show" role="alert" aria-live="assertive">${safeMessage}</p>${recoveryLink}</div></div></section></main></body></html>`, {
    status,
    headers: {
      ...SECURITY_HEADERS,
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "referrer-policy": "no-referrer"
    }
  });
}

async function productAuthStartRoute(request: Request, env: Env, provider: "google" | "chatgpt"): Promise<Response> {
  try {
    return await beginProductAuth(request, env, provider);
  } catch (error) {
    const json = errorResponse(error);
    if (!(request.headers.get("accept") ?? "").includes("text/html")) return json;
    const status = json.status;
    const message = error instanceof ProductAuthError
      ? error.message
      : "ログインを完了できませんでした。時間をおいて、もう一度お試しください。";
    return productAuthRecoveryHtml(request, env, status, message);
  }
}

function d1ErrorResponse(error: unknown, operation: "profile" | "workspaces" | "create_workspace" | "join_code" | "members" | "members_join" | "members_update"): AppError {
  if (!(error instanceof D1RepositoryError)) {
    return new AppError(503, "D1_UNAVAILABLE", "データを利用できません。時間をおいて、もう一度お試しください。");
  }
  if (error.code === "limit_exceeded") {
    return new AppError(409, operation === "members" || operation === "members_join" || operation === "members_update" ? "WORKSPACE_MEMBERS_LIMIT_EXCEEDED" : "WORKSPACES_LIMIT_EXCEEDED", operation === "members" || operation === "members_join" || operation === "members_update" ? "メンバーが多いため一覧を表示できません。管理者に整理を依頼してください。" : "所属ワークスペースが多いため一覧を表示できません。管理者に整理を依頼してください。");
  }
  if (error.code === "invalid_input") {
    return new AppError(400, operation === "create_workspace" ? "WORKSPACE_INPUT_INVALID" : "REQUEST_INVALID", "入力内容を確認してください。");
  }
  if (error.code === "conflict") {
    return new AppError(409, operation === "join_code" || operation === "members_join" ? "JOIN_CODE_UNAVAILABLE" : operation === "members_update" ? "MEMBER_UPDATE_UNAVAILABLE" : "WORKSPACE_CONFLICT", "処理対象の状態が変わりました。最新の状態を確認してください。");
  }
  if (error.code === "actor_forbidden") {
    return new AppError(403, operation === "create_workspace" ? "ACCESS_ACTOR_FORBIDDEN" : "ACCESS_FORBIDDEN", "この操作を行う権限がありません。");
  }
  if (error.code === "not_found" && operation === "members") {
    return new AppError(404, "WORKSPACE_MEMBERS_NOT_FOUND", "ワークスペースまたはメンバー情報を確認できませんでした。");
  }
  if (error.code === "forbidden" || error.code === "not_found") {
    return new AppError(403, "ACCESS_FORBIDDEN", "この操作を行う権限がありません。");
  }
  return new AppError(503, "D1_UNAVAILABLE", "データを利用できません。時間をおいて、もう一度お試しください。");
}

function mapAccessIdentityError(error: unknown): AppError {
  if (error instanceof AccessIdentityError) {
    return new AppError(error.status, error.code, error.message);
  }
  return new AppError(503, "ACCESS_IDENTITY_UNAVAILABLE", "認証サービスを利用できません。時間をおいて、もう一度お試しください。");
}

function useAccessD1Routes(env: Env): boolean {
  const access = inspectAccessConfig(env);
  return access.hasIssuer || access.hasAudience || access.hasJwksUrl;
}

function useProductD1Routes(env: Env, request?: Request): boolean {
  const providers = configuredProductProviders(env);
  const legacyConfigured = inspectSupabaseConfig(env).configured;

  // Route selection follows the credential present on this request. A legacy
  // Supabase session must stay on the password route even while a product OIDC
  // provider is configured and its backend is available. A product cookie
  // remains fail-closed and wins over any legacy cookie so it cannot fall back
  // to another authentication system. A legacy cookie alone cannot select a
  // backend that is not configured.
  if (request) {
    if (hasProductSessionCookie(request)) return true;
    if (hasLegacySupabaseSessionCookie(request) && legacyConfigured) return false;
  }
  return providers.google || providers.chatgpt;
}

function hasLegacySupabaseSessionCookie(request: Request): boolean {
  const cookieNames = new Set((request.headers.get("cookie") ?? "").split(";").map((part) => {
    const separator = part.indexOf("=");
    return (separator < 0 ? part : part.slice(0, separator)).trim();
  }));
  return cookieNames.has(COOKIE_ACCESS_TOKEN) || cookieNames.has(COOKIE_REFRESH_TOKEN);
}

function hasAccessAssertion(request: Request): boolean {
  return Boolean(request.headers.get("Cf-Access-Jwt-Assertion")?.trim());
}

function useD1ApplicationRoutes(env: Env, request?: Request): boolean {
  if (request) {
    // A request credential selects the authentication boundary before an
    // environment fallback. Product cookies are fail-closed and win over
    // every other credential. A configured Supabase session stays on the
    // legacy route even when Access and product providers are configured.
    if (hasProductSessionCookie(request)) return true;
    if (hasAccessAssertion(request)) return true;
    if (hasLegacySupabaseSessionCookie(request) && inspectSupabaseConfig(env).configured) return false;
  }
  return useAccessD1Routes(env) || useProductD1Routes(env, request);
}

interface D1RouteContext {
  actorId: string;
  repository: D1WorkspaceRepository;
  authMode: "product" | "access";
}

function d1IdentityRepository(env: Env): ApplicationIdentityRepository {
  if (env.DB) return new D1IdentityRepository(env.DB);
  return {
    async findByIssuerAndSubject() {
      throw new D1RepositoryError("unavailable");
    }
  };
}

async function authenticateD1User(request: Request, env: Env): Promise<D1RouteContext> {
  const productSession = await getProductSession(request, env);
  if (productSession && env.DB) {
    return { actorId: productSession.applicationId, repository: new D1WorkspaceRepository(env.DB), authMode: "product" };
  }
  if (hasProductSessionCookie(request)) throw new AppError(401, "SESSION_REQUIRED", "ログインの有効期限が切れました。ログインをやり直してください。");
  if (useProductD1Routes(env, request) && !hasAccessAssertion(request)) throw new AppError(401, "SESSION_REQUIRED", "ログインしてください。");
  let auth;
  try {
    auth = await authenticateApplicationRequest(request, env, d1IdentityRepository(env));
  } catch (error) {
    if (error instanceof D1RepositoryError) throw d1ErrorResponse(error, "profile");
    throw mapAccessIdentityError(error);
  }
  if (auth.kind !== "application_user") {
    throw new AppError(403, "ACCESS_FORBIDDEN", "この操作を行う権限がありません。");
  }
  if (!env.DB) {
    throw new AppError(503, "D1_UNAVAILABLE", "データを利用できません。時間をおいて、もう一度お試しください。");
  }
  return { actorId: auth.identity.applicationId, repository: new D1WorkspaceRepository(env.DB), authMode: "access" };
}

function apiWorkspaceSummary(workspace: Awaited<ReturnType<D1WorkspaceRepository["listWorkspaces"]>>[number]): WorkspaceSummary {
  return {
    id: workspace.id,
    name: workspace.name,
    slug: workspace.slug,
    status: workspace.status === "deleted" ? "suspended" : workspace.status,
    created_at: workspace.createdAt
  };
}

function apiProfile(profile: ProfileRecord | null): unknown {
  if (!profile) return null;
  return {
    id: profile.applicationId,
    display_name: profile.displayName,
    locale: profile.locale,
    timezone: profile.timezone
  };
}

function apiWorkspaceMember(member: WorkspaceMemberRecord): WorkspaceMemberSummary {
  return {
    userId: member.applicationId,
    displayName: member.displayName,
    role: member.role,
    status: member.status,
    joinedAt: member.joinedAt
  };
}

async function bootstrapOnboarding(request: Request, env: Env): Promise<Response> {
  if (!isConfiguredOnboardingOrigin(new URL(request.url).origin, env)) {
    throw new AppError(503, "ONBOARDING_UNAVAILABLE", "保存先の準備が完了していません。時間をおいて、もう一度お試しください。");
  }
  const productSession = await getProductSession(request, env);
  let actor;
  if (productSession) {
    actor = { kind: "product_user" as const, issuer: productSession.issuer, subject: productSession.subject };
  } else {
    if (hasProductSessionCookie(request)) throw new AppError(401, "SESSION_REQUIRED", "ログインの有効期限が切れました。ログインをやり直してください。");
    if (useProductD1Routes(env, request) && !hasAccessAssertion(request)) throw new AppError(401, "SESSION_REQUIRED", "ログインしてください。");
    try { actor = requireHumanActor(await verifyAccessJwt(request, env)); }
    catch (error) { throw mapAccessIdentityError(error); }
  }
  const body = await readJsonBody<{ operationId?: unknown }>(request);
  if (Object.keys(body).some((key) => key !== "operationId") || typeof body.operationId !== "string"
    || !/^[A-Za-z0-9_-]{16,128}$/.test(body.operationId)) {
    throw new AppError(400, "ONBOARDING_INPUT_INVALID", "再試行情報を確認できませんでした。");
  }
  if (!env.DB || !env.ONBOARDING_RATE_LIMITER) {
    throw new AppError(503, "ONBOARDING_UNAVAILABLE", "保存の準備を利用できません。下書きを保持したまま、時間をおいて再試行してください。");
  }
  const connectionSignal = cloudflareConnectionSignal(request);
  if (!connectionSignal) {
    throw new AppError(503, "ONBOARDING_UNAVAILABLE", "保存の準備を利用できません。下書きを保持したまま、時間をおいて再試行してください。");
  }
  let actorAllowed: boolean;
  let connectionAllowed: boolean;
  try {
    const actorKey = await onboardingRateLimitKey("actor", JSON.stringify([actor.issuer, actor.subject]));
    const connectionKey = await onboardingRateLimitKey("connection", connectionSignal);
    const actorResult = await env.ONBOARDING_RATE_LIMITER.limit({ key: actorKey });
    if (typeof actorResult.success !== "boolean") throw new Error("invalid actor rate-limit result");
    actorAllowed = actorResult.success;
    if (!actorAllowed) {
      connectionAllowed = false;
    } else {
      const connectionResult = await env.ONBOARDING_RATE_LIMITER.limit({ key: connectionKey });
      if (typeof connectionResult.success !== "boolean") throw new Error("invalid connection rate-limit result");
      connectionAllowed = connectionResult.success;
    }
  } catch {
    throw new AppError(503, "ONBOARDING_UNAVAILABLE", "保存の準備を利用できません。時間をおいて再試行してください。");
  }
  if (!actorAllowed || !connectionAllowed) return jsonResponse({ code: "ONBOARDING_RATE_LIMITED", message: "しばらく待ってから再試行してください。" }, { status: 429, headers: { "retry-after": "60" } });
  try {
    return jsonResponse(await new D1OnboardingRepository(env.DB).bootstrap(actor, body.operationId));
  } catch (error) {
    if (error instanceof D1RepositoryError && error.code === "personal_workspace_unavailable") {
      throw new AppError(403, "PERSONAL_WORKSPACE_UNAVAILABLE", "保存先が利用停止中です。下書きを保持して管理者へお問い合わせください。");
    }
    throw d1ErrorResponse(error, "profile");
  }
}

function cloudflareConnectionSignal(request: Request): string | null {
  const cloudflareRequest = request as Request & { cf?: unknown };
  if (!cloudflareRequest.cf || request.headers.has("CF-Worker")) return null;
  // Cloudflare documents CF-Connecting-IP as the client IP on edge-to-origin
  // requests. Prefer the real IPv6 preserved by Cloudflare only when
  // CF-Connecting-IP is a Pseudo IPv4 address. Never accept a forwarded list
  // or preserve the raw value beyond this validation boundary; the
  // rate-limit key is hashed below.
  const ipv4OrIpv6 = request.headers.get("CF-Connecting-IP");
  if (ipv4OrIpv6 === null) return null;
  const ip = canonicalIpAddress(ipv4OrIpv6.trim());
  if (!ip) return null;
  const ipv6 = request.headers.get("CF-Connecting-IPv6");
  if (ipv6 === null) return ip;
  if (!isPseudoIpv4(ip)) return null;
  return canonicalIpAddress(ipv6.trim());
}

function canonicalIpAddress(value: string): string | null {
  if (value.length === 0 || value.length > 45 || /[\s,]/u.test(value)) return null;
  const ipv4 = value.split(".");
  if (ipv4.length === 4 && ipv4.every((part) => /^(?:0|[1-9][0-9]{0,2})$/u.test(part) && Number(part) <= 255)) return value;
  try {
    const hostname = new URL(`http://[${value}]/`).hostname;
    return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1).toLowerCase() : null;
  } catch {
    return null;
  }
}

function isPseudoIpv4(value: string): boolean {
  const firstOctet = Number(value.split(".")[0]);
  return Number.isInteger(firstOctet) && firstOctet >= 240 && firstOctet <= 255;
}

async function onboardingRateLimitKey(namespace: "actor" | "connection", value: string): Promise<string> {
  const keyBytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`meccha-manual:onboarding:rate-limit:${namespace}:v1\0${value}`));
  return `${namespace}:${Array.from(new Uint8Array(keyBytes), (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

async function getD1Session(request: Request, env: Env): Promise<Response> {
  const { actorId, repository, authMode } = await authenticateD1User(request, env);
  try {
    const [profile, workspaces] = await Promise.all([
      repository.getProfile(actorId),
      repository.listWorkspaces(actorId)
    ]);
    return jsonResponse({
      user: { id: actorId },
      authMode,
      profile: apiProfile(profile),
      workspaces: workspaces.map(apiWorkspaceSummary),
      manuals: { status: env.MANUAL_ASSETS ? "ready" : "migration" },
      members: { status: "ready" }
    });
  } catch (error) {
    throw d1ErrorResponse(error, "profile");
  }
}

async function listD1Workspaces(request: Request, env: Env): Promise<Response> {
  const { actorId, repository } = await authenticateD1User(request, env);
  try {
    return jsonResponse({ workspaces: (await repository.listWorkspaces(actorId)).map(apiWorkspaceSummary) });
  } catch (error) {
    throw d1ErrorResponse(error, "workspaces");
  }
}

async function cloudManualPage(request: Request, env: Env): Promise<Response> {
  let auth;
  try {
    auth = await authenticateD1User(request, env);
  } catch (error) {
    if (error instanceof AppError && error.status === 401 && error.code === "SESSION_REQUIRED"
      && useProductD1Routes(env, request) && (request.headers.get("accept") ?? "").includes("text/html")) {
      return new Response(null, { status: 302, headers: { location: "/?return=%2Fmanuals", "cache-control": "no-store" } });
    }
    if (error instanceof D1RepositoryError) throw d1ErrorResponse(error, "profile");
    throw error;
  }
  try {
    const workspace = await auth.repository.getPersonalWorkspace(auth.actorId);
    return htmlResponse(renderCloudManualsPage({ workspaceId: workspace.id, assetVersion: APP_ASSET_VERSION }));
  } catch (error) {
    if (error instanceof D1RepositoryError && error.code === "personal_workspace_unavailable") {
      throw new AppError(403, "PERSONAL_WORKSPACE_UNAVAILABLE", "Personal Workspaceを利用できないため、手順書を表示できません。");
    }
    throw d1ErrorResponse(error, "profile");
  }
}

async function createD1Workspace(request: Request, env: Env): Promise<Response> {
  const { actorId, repository } = await authenticateD1User(request, env);
  const body = await readJsonBody<{ name?: unknown; slug?: unknown }>(request);
  if (typeof body.name !== "string" || typeof body.slug !== "string") {
    throw new AppError(400, "WORKSPACE_INPUT_INVALID", "ワークスペース名とURL用IDを文字で入力してください。");
  }
  try {
    const workspace = await repository.createWorkspace(actorId, { name: body.name, slug: body.slug } satisfies CreateWorkspaceInput, new Date().toISOString());
    return jsonResponse({ workspaceId: workspace.id }, { status: 201 });
  } catch (error) {
    throw d1ErrorResponse(error, "create_workspace");
  }
}

async function createD1WorkspaceJoinCode(request: Request, env: Env): Promise<Response> {
  const { actorId, repository } = await authenticateD1User(request, env);
  const body = await readJsonBody<Record<string, unknown>>(request);
  if (Object.keys(body).length !== 0) {
    throw new AppError(400, "JOIN_CODE_INPUT_INVALID", "参加コードの発行には空のJSONを送信してください。");
  }
  try {
    const result = await repository.issueJoinCode(actorId, new Date().toISOString());
    return jsonResponse({ joinCode: result.code, expiresAt: result.expiresAt }, { status: 201 });
  } catch (error) {
    throw d1ErrorResponse(error, "join_code");
  }
}

async function getD1WorkspaceMembers(request: Request, env: Env, workspaceId: string): Promise<Response> {
  requireWorkspaceId(workspaceId);
  const { actorId, repository } = await authenticateD1User(request, env);
  try {
    const members = await repository.listMembers(actorId, workspaceId);
    const currentUserRole = members.find((member) => member.applicationId === actorId)?.role;
    if (!currentUserRole || members.length === 0) throw new D1RepositoryError("not_found");
    return jsonResponse({
      workspaceId,
      currentUserRole,
      members: members.map(apiWorkspaceMember)
    });
  } catch (error) {
    throw d1ErrorResponse(error, "members");
  }
}

async function addD1WorkspaceMember(request: Request, env: Env, workspaceId: string): Promise<Response> {
  requireWorkspaceId(workspaceId);
  const { actorId, repository } = await authenticateD1User(request, env);
  const body = await readJsonBody<{ joinCode?: unknown; role?: unknown }>(request);
  if (typeof body.joinCode !== "string" || !JOIN_CODE_PATTERN.test(body.joinCode.trim())) {
    throw new AppError(409, "JOIN_CODE_UNAVAILABLE", "参加コードを利用できません。有効期限または入力内容を確認し、本人に再発行を依頼してください。");
  }
  if (body.role !== "admin" && body.role !== "editor" && body.role !== "viewer") {
    throw new AppError(body.role === "owner" ? 409 : 400, body.role === "owner" ? "OWNER_TRANSFER_REQUIRED" : "MEMBER_ROLE_INVALID", body.role === "owner" ? "管理責任者の変更は、メンバー管理の「管理責任者に移管」から行ってください。" : "権限は管理者・編集者・閲覧者から選択してください。");
  }
  try {
    await repository.consumeJoinCode(actorId, workspaceId, body.joinCode.trim(), body.role, new Date().toISOString());
    return jsonResponse({ status: "ok" }, { status: 201 });
  } catch (error) {
    throw d1ErrorResponse(error, "members_join");
  }
}

async function updateD1WorkspaceMember(request: Request, env: Env, workspaceId: string, userId: string): Promise<Response> {
  requireWorkspaceId(workspaceId);
  if (!UUID_PATTERN.test(userId)) throw new AppError(409, "MEMBER_UPDATE_UNAVAILABLE", "対象メンバーの状態が変わったため更新できませんでした。一覧を更新してください。");
  const { actorId, repository } = await authenticateD1User(request, env);
  const body = await readJsonBody<{ role?: unknown; status?: unknown }>(request);
  if (body.role !== "admin" && body.role !== "editor" && body.role !== "viewer") {
    throw new AppError(body.role === "owner" ? 409 : 400, body.role === "owner" ? "OWNER_TRANSFER_REQUIRED" : "MEMBER_ROLE_INVALID", body.role === "owner" ? "管理責任者の変更は、メンバー管理の「管理責任者に移管」から行ってください。" : "権限は管理者・編集者・閲覧者から選択してください。");
  }
  if (body.status !== "active" && body.status !== "removed") throw new AppError(400, "MEMBER_STATUS_INVALID", "メンバー状態の指定が正しくありません。");
  try {
    await repository.updateMember(actorId, workspaceId, userId, { role: body.role, status: body.status }, new Date().toISOString());
    return jsonResponse({ status: "ok" });
  } catch (error) {
    throw d1ErrorResponse(error, "members_update");
  }
}

async function transferD1WorkspaceOwnership(request: Request, env: Env, workspaceId: string): Promise<Response> {
  requireWorkspaceId(workspaceId);
  const { actorId, repository } = await authenticateD1User(request, env);
  const body = await readJsonBody<{ targetUserId?: unknown }>(request);
  if (Object.keys(body).some((key) => key !== "targetUserId")
    || typeof body.targetUserId !== "string" || !UUID_PATTERN.test(body.targetUserId)) {
    throw new AppError(400, "OWNER_TRANSFER_INPUT_INVALID", "移管先のメンバーを正しく指定してください。");
  }
  try {
    await repository.transferOwnership(actorId, workspaceId, body.targetUserId, new Date().toISOString());
    return jsonResponse({ status: "ok" });
  } catch (error) {
    if (error instanceof D1RepositoryError) {
      switch (error.code) {
        case "forbidden":
          throw new AppError(403, "OWNER_TRANSFER_FORBIDDEN", "現在の管理責任者本人だけが移管できます。");
        case "owner_transfer_self":
          throw new AppError(409, "OWNER_TRANSFER_SELF", "自分自身には管理責任者を移管できません。");
        case "owner_transfer_target_invalid":
          throw new AppError(409, "OWNER_TRANSFER_TARGET_INVALID", "移管先は同じワークスペースの有効な管理者・編集者・閲覧者から選択してください。");
        case "owner_transfer_personal":
          throw new AppError(409, "OWNER_TRANSFER_PERSONAL_WORKSPACE", "Personal Workspaceの管理責任者は移管できません。");
        case "conflict":
          throw new AppError(409, "OWNER_TRANSFER_CONFLICT", "メンバーの状態が変わったため移管できませんでした。一覧を更新して確認してください。");
      }
    }
    throw new AppError(503, "OWNER_TRANSFER_UNAVAILABLE", "移管結果を確認できません。一覧を更新して管理責任者を確認してください。");
  }
}

async function readBodyTextLimited(
  request: Request,
  maxBytes: number,
  tooLargeCode: string,
  tooLargeMessage: string
): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new AppError(413, tooLargeCode, tooLargeMessage);
  }

  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("body too large").catch(() => undefined);
        throw new AppError(413, tooLargeCode, tooLargeMessage);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

function isPlainJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

async function readJsonBody<T extends Record<string, unknown>>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new AppError(415, "JSON_CONTENT_TYPE_REQUIRED", "Content-Typeはapplication/jsonにしてください。");
  }

  try {
    const text = await readBodyTextLimited(
      request,
      MAX_JSON_BODY_BYTES,
      "JSON_BODY_TOO_LARGE",
      "リクエストが大きすぎます。"
    );
    const body: unknown = JSON.parse(text);
    if (!isPlainJsonObject(body)) {
      throw new AppError(400, "JSON_OBJECT_REQUIRED", "JSONはオブジェクト形式にしてください。");
    }
    return body as T;
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

function parseCookies(
  request: Request,
  tolerateInvalidSessionCookies = false,
  clearInvalidSessionCookies = false
): Map<string, string> {
  const header = request.headers.get("cookie") ?? "";
  const cookies = new Map<string, string>();

  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    try {
      cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
    } catch {
      if ([COOKIE_ACCESS_TOKEN, COOKIE_REFRESH_TOKEN].includes(rawName)) {
        if (tolerateInvalidSessionCookies) continue;
        throw new AppError(
          401,
          "SESSION_INVALID",
          "ログイン状態を確認できません。もう一度ログインしてください。",
          clearInvalidSessionCookies ? clearSessionCookies() : []
        );
      }
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
  } else {
    headers.set("authorization", `Bearer ${config.anonKey}`);
  }

  if (init.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }

  return fetch(`${config.url}${path}`, {
    ...init,
    headers
  });
}

function splitCsv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function allowUnscopedDiscordCommands(env: Env): boolean {
  return env.DISCORD_ALLOW_UNSCOPED_COMMANDS === "true";
}

async function readSupabaseJson(response: Response, maxBytes = MAX_SUPABASE_JSON_BYTES): Promise<unknown> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new Error("Supabase response body is too large.");
  }
  if (!response.body) return null;

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("response body too large").catch(() => undefined);
        throw new Error("Supabase response body is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder().decode(bytes);
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

  throw new AppError(response.status, fallbackCode, fallbackMessage);
}

function parseAuthTokenResponse(
  payload: unknown,
  invalidCode: string,
  invalidMessage: string,
  invalidStatus = 502
): SupabaseAuthTokenResponse {
  if (!payload || typeof payload !== "object") {
    throw new AppError(invalidStatus, invalidCode, invalidMessage);
  }

  const auth = payload as Partial<SupabaseAuthTokenResponse>;
  const expiresIn = auth.expires_in;
  if (
    typeof auth.access_token !== "string" || !auth.access_token ||
    typeof auth.refresh_token !== "string" || !auth.refresh_token ||
    !auth.user || typeof auth.user.id !== "string" || !auth.user.id ||
    typeof expiresIn !== "number" || !Number.isSafeInteger(expiresIn) || expiresIn <= 0
  ) {
    throw new AppError(invalidStatus, invalidCode, invalidMessage);
  }

  return {
    access_token: auth.access_token,
    refresh_token: auth.refresh_token,
    expires_in: Math.min(Math.floor(expiresIn), MAX_ACCESS_COOKIE_AGE_SECONDS),
    user: auth.user
  };
}

async function login(request: Request, env: Env): Promise<Response> {
  const body = await readJsonBody<{ email?: string; password?: string }>(request);
  const email = String(body.email ?? "").trim();
  const password = String(body.password ?? "");

  if (!email || !password) {
    throw new AppError(400, "LOGIN_INPUT_REQUIRED", "メールアドレスとパスワードを入力してください。");
  }

  let response: Response;
  try {
    response = await supabaseFetch(env, "/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
  } catch {
    throw new AppError(
      502,
      "LOGIN_SERVICE_UNAVAILABLE",
      "認証サービスに接続できませんでした。時間をおいて、もう一度お試しください。"
    );
  }

  if (!response.ok) {
    await readSupabaseJson(response).catch(() => null);
    if ([400, 401, 422].includes(response.status)) {
      throw new AppError(
        400,
        "LOGIN_FAILED",
        "メールアドレスまたはパスワードを確認して、もう一度ログインしてください。"
      );
    }
    if (response.status === 429) {
      throw new AppError(429, "LOGIN_RATE_LIMITED", "ログイン試行が多すぎます。時間をおいて、もう一度お試しください。");
    }
    throw new AppError(
      502,
      "LOGIN_SERVICE_UNAVAILABLE",
      "認証サービスを利用できません。時間をおいて、もう一度お試しください。"
    );
  }

  const auth = parseAuthTokenResponse(
    await readSupabaseJson(response),
    "LOGIN_RESPONSE_INVALID",
    "認証レスポンスを確認できませんでした。時間をおいて、もう一度お試しください。"
  );

  const cookies = [
    sessionCookie(COOKIE_ACCESS_TOKEN, auth.access_token, auth.expires_in),
    sessionCookie(COOKIE_REFRESH_TOKEN, auth.refresh_token, 60 * 60 * 24 * 30)
  ];

  // A successful explicit password login is an authentication transition. If
  // an older product session cookie is still present, revoke that server-side
  // session and clear the competing credential before the new legacy session
  // can be used. An invalid product cookie still fails closed on protected
  // requests; this transition never treats it as a silent fallback.
  if (hasProductSessionCookie(request)) {
    const productLogout = await revokeProductSession(request, env);
    const productCookie = productLogout.headers.get("set-cookie");
    if (productCookie) cookies.push(productCookie);
  }

  return jsonResponse({ user: sanitizeUser(auth.user) }, undefined, cookies);
}

async function refreshSession(env: Env, refreshToken: string): Promise<SessionResult> {
  let response: Response;
  try {
    response = await supabaseFetch(env, "/auth/v1/token?grant_type=refresh_token", {
      method: "POST",
      body: JSON.stringify({ refresh_token: refreshToken })
    });
  } catch {
    throw new AppError(502, "SESSION_REFRESH_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  if (!response.ok) {
    if ([400, 401].includes(response.status)) {
      throw new AppError(
        401,
        "SESSION_EXPIRED",
        "セッションの有効期限が切れました。もう一度ログインしてください。",
        clearSessionCookies()
      );
    }
    throw new AppError(502, "SESSION_REFRESH_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  let auth: SupabaseAuthTokenResponse;
  try {
    auth = parseAuthTokenResponse(
      await readSupabaseJson(response),
      "SESSION_REFRESH_INVALID",
      "セッションの有効期限が切れました。もう一度ログインしてください。",
      401
    );
  } catch (error) {
    if (error instanceof AppError && error.code === "SESSION_REFRESH_INVALID") {
      error.responseCookies = clearSessionCookies();
    }
    throw error;
  }

  return {
    user: auth.user,
    accessToken: auth.access_token,
    responseCookies: [
      sessionCookie(COOKIE_ACCESS_TOKEN, auth.access_token, auth.expires_in),
      sessionCookie(COOKIE_REFRESH_TOKEN, auth.refresh_token, 60 * 60 * 24 * 30)
    ]
  };
}

async function requireSession(
  request: Request,
  env: Env,
  cookies?: Map<string, string>,
  allowRefresh = false
): Promise<SessionResult> {
  const sessionCookies = cookies ?? parseCookies(request, false, allowRefresh);
  const accessToken = sessionCookies.get(COOKIE_ACCESS_TOKEN);
  const refreshToken = sessionCookies.get(COOKIE_REFRESH_TOKEN);

  if (!accessToken && !refreshToken) {
    throw new AppError(401, "SESSION_REQUIRED", "ログインしてください。");
  }

  if (accessToken) {
    let response: Response;
    try {
      response = await supabaseFetch(env, "/auth/v1/user", { method: "GET" }, accessToken);
    } catch {
      throw new AppError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
    if (response.ok) {
      const user = await response.json().catch(() => null) as SupabaseUser | null;
      if (!user || typeof user.id !== "string" || !user.id) {
        throw new AppError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
      }
      return { user, accessToken, responseCookies: [] };
    }
    if (response.status >= 500 || response.status === 429) {
      throw new AppError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
  }

  if (refreshToken) {
    if (!allowRefresh) {
      throw new AppError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
    }
    return refreshSession(env, refreshToken);
  }

  throw new AppError(
    401,
    "SESSION_EXPIRED",
    "セッションの有効期限が切れました。",
    allowRefresh ? clearSessionCookies() : []
  );
}

async function refreshAuthentication(request: Request, env: Env): Promise<Response> {
  await readJsonBody<Record<string, never>>(request);
  const cookies = parseCookies(request, false, true);
  const refreshToken = cookies.get(COOKIE_REFRESH_TOKEN);
  if (!refreshToken) {
    throw new AppError(401, "SESSION_EXPIRED", "セッションの有効期限が切れました。もう一度ログインしてください。", clearSessionCookies());
  }

  const session = await refreshSession(env, refreshToken);
  return jsonResponse({ status: "ok", user: sanitizeUser(session.user) }, undefined, session.responseCookies);
}

function sanitizeUser(user: SupabaseUser): SupabaseUser {
  return {
    id: user.id,
    email: user.email
  };
}

async function getSession(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  const [profileResult, workspacesResult] = await Promise.allSettled([
    fetchProfile(env, session.accessToken, session.user.id),
    fetchWorkspaces(env, session.accessToken)
  ]);

  for (const result of [profileResult, workspacesResult]) {
    if (result.status === "rejected" && result.reason instanceof AppError && result.reason.code === "SESSION_REFRESH_REQUIRED") {
      throw result.reason;
    }
  }
  if (profileResult.status === "rejected") throw profileResult.reason;
  if (workspacesResult.status === "rejected") throw workspacesResult.reason;

  return jsonResponse({
    user: sanitizeUser(session.user),
    profile: profileResult.value,
    workspaces: workspacesResult.value
  }, undefined, session.responseCookies);
}

async function withSupabaseReadTimeout<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  fallbackCode: string,
  fallbackMessage: string
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new AppError(502, fallbackCode, fallbackMessage));
    }, SUPABASE_READ_TIMEOUT_MS);
  });
  try {
    return await Promise.race([operation(controller.signal), timeout]);
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, fallbackCode, fallbackMessage);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

async function fetchProfile(env: Env, accessToken: string, userId: string): Promise<unknown> {
  const query = `/rest/v1/profiles?select=id,display_name,locale,timezone&id=eq.${encodeURIComponent(userId)}&limit=1`;
  const fallbackMessage = "プロフィールを取得できませんでした。時間をおいて、もう一度お試しください。";
  return withSupabaseReadTimeout(async (signal) => {
    const response = await supabaseFetch(env, query, { method: "GET", signal }, accessToken);
    if (response.status === 401) {
      throw new AppError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
    }
    if (response.status === 403) {
      throw new AppError(403, "PROFILE_ACCESS_DENIED", "プロフィールを表示する権限を確認できませんでした。もう一度ログインしてください。");
    }
    if (!response.ok) throw new AppError(502, "PROFILE_FETCH_FAILED", fallbackMessage);
    const payload = await readSupabaseJson(response);
    return Array.isArray(payload) ? payload[0] ?? null : null;
  }, "PROFILE_FETCH_FAILED", fallbackMessage);
}

async function fetchWorkspaces(env: Env, accessToken: string): Promise<WorkspaceSummary[]> {
  const query = `/rest/v1/workspaces?select=id,name,slug,status,created_at&status=neq.deleted&order=created_at.desc&limit=${MAX_WORKSPACE_LIST_ITEMS + 1}`;
  const fallbackMessage = "ワークスペースを取得できませんでした。時間をおいて、もう一度お試しください。";
  return withSupabaseReadTimeout(async (signal) => {
    const response = await supabaseFetch(env, query, {
      method: "GET",
      headers: { prefer: "count=exact" },
      signal
    }, accessToken);
    if (response.status === 401) {
      throw new AppError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
    }
    if (response.status === 403) {
      throw new AppError(403, "WORKSPACES_ACCESS_DENIED", "ワークスペースを表示する権限を確認できませんでした。もう一度ログインしてください。");
    }
    if (!response.ok) throw new AppError(502, "WORKSPACES_FETCH_FAILED", fallbackMessage);
    const payload = await readSupabaseJson(response);
    if (!Array.isArray(payload) || !payload.every(isWorkspaceSummary) || new Set(payload.map((workspace) => workspace.id)).size !== payload.length) {
      throw new AppError(502, "WORKSPACES_RESPONSE_INVALID", "ワークスペース一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
    const contentRange = response.headers.get("content-range") ?? "";
    const populatedRange = contentRange.match(/^(\d+)-(\d+)\/(\d+)$/);
    const emptyRange = contentRange.match(/^\*\/(\d+)$/);
    const rangeStart = populatedRange ? Number(populatedRange[1]) : null;
    const rangeEnd = populatedRange ? Number(populatedRange[2]) : null;
    const exactTotal = populatedRange ? Number(populatedRange[3]) : emptyRange ? Number(emptyRange[1]) : null;
    const rangeIsValid = payload.length === 0
      ? emptyRange !== null && exactTotal === 0
      : populatedRange !== null &&
        typeof rangeStart === "number" &&
        typeof rangeEnd === "number" &&
        rangeStart === 0 &&
        Number.isSafeInteger(rangeEnd) &&
        rangeEnd - rangeStart + 1 === payload.length &&
        typeof exactTotal === "number" &&
        Number.isSafeInteger(exactTotal) &&
        exactTotal >= payload.length;
    if (!rangeIsValid || exactTotal === null || !Number.isSafeInteger(exactTotal)) {
      throw new AppError(502, "WORKSPACES_RESPONSE_INVALID", "ワークスペース一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
    const validatedExactTotal = exactTotal;
    if (
      payload.length > MAX_WORKSPACE_LIST_ITEMS ||
      validatedExactTotal > MAX_WORKSPACE_LIST_ITEMS
    ) {
      throw new AppError(409, "WORKSPACES_LIMIT_EXCEEDED", "所属ワークスペースが多いため一覧を表示できません。管理者に整理を依頼してください。");
    }
    if (validatedExactTotal !== payload.length) {
      throw new AppError(502, "WORKSPACES_RESPONSE_INVALID", "ワークスペース一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
    return payload;
  }, "WORKSPACES_FETCH_FAILED", fallbackMessage);
}

function isWorkspaceSummary(value: unknown): value is WorkspaceSummary {
  if (!value || typeof value !== "object") return false;
  const workspace = value as Partial<WorkspaceSummary>;
  return (
    typeof workspace.id === "string" && UUID_PATTERN.test(workspace.id) &&
    typeof workspace.name === "string" && workspace.name.trim().length > 0 && Array.from(workspace.name).length <= 64 &&
    typeof workspace.slug === "string" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(workspace.slug) &&
    (workspace.status === "active" || workspace.status === "suspended") &&
    typeof workspace.created_at === "string" && !Number.isNaN(Date.parse(workspace.created_at))
  );
}

async function createWorkspace(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  const body = await readJsonBody<{ name?: string; slug?: string }>(request);
  if (typeof body.name !== "string" || typeof body.slug !== "string") {
    throw new AppError(400, "WORKSPACE_INPUT_INVALID", "ワークスペース名とURL用IDを文字で入力してください。");
  }
  const name = body.name.trim();
  const slug = body.slug.trim().toLowerCase();

  if (Array.from(name).length < 1 || Array.from(name).length > 64) {
    throw new AppError(400, "WORKSPACE_NAME_INVALID", "ワークスペース名は1〜64文字で入力してください。");
  }

  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) {
    throw new AppError(400, "WORKSPACE_SLUG_INVALID", "URL用IDは半角英数字とハイフンで3〜63文字にしてください。");
  }

  let response: Response;
  try {
    response = await supabaseFetch(env, "/rest/v1/rpc/create_workspace", {
      method: "POST",
      body: JSON.stringify({
        workspace_name: name,
        workspace_slug: slug
      })
    }, session.accessToken);
  } catch {
    throw new AppError(502, "WORKSPACE_CREATE_RESULT_UNKNOWN", "作成処理の結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
  }
  if (response.status === 401) {
    throw new AppError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
  }
  if (response.status === 403) {
    throw new AppError(403, "WORKSPACE_CREATE_FORBIDDEN", "ワークスペースを作成する権限がありません。管理者に確認してください。");
  }
  if (!response.ok) {
    if (response.status >= 500) {
      throw new AppError(502, "WORKSPACE_CREATE_RESULT_UNKNOWN", "作成処理の結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
    }
    if (response.status === 429) {
      throw new AppError(502, "WORKSPACE_CREATE_FAILED", "ワークスペースを作成できませんでした。時間をおいて、もう一度お試しください。");
    }
    let upstreamCode = "";
    try {
      const upstreamError = await readSupabaseJson(response);
      if (upstreamError && typeof upstreamError === "object" && "code" in upstreamError) {
        upstreamCode = String(upstreamError.code);
      }
    } catch {
      // 不正な上流エラー本文は入力不正と決めつけず、サービス障害として扱う。
    }
    if ((response.status === 400 || response.status === 409) && WORKSPACE_INPUT_ERROR_CODES.has(upstreamCode)) {
      throw new AppError(400, "WORKSPACE_CREATE_FAILED", "ワークスペースを作成できませんでした。入力内容を確認して、もう一度お試しください。");
    }
    throw new AppError(502, "WORKSPACE_CREATE_SERVICE_UNAVAILABLE", "ワークスペース作成サービスを利用できません。入力を変えず、管理者に確認してください。");
  }

  let workspaceId: unknown;
  try {
    workspaceId = await readSupabaseJson(response);
  } catch {
    throw new AppError(502, "WORKSPACE_CREATE_RESULT_UNKNOWN", "作成処理の結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
  }
  if (typeof workspaceId !== "string" || !UUID_PATTERN.test(workspaceId)) {
    throw new AppError(502, "WORKSPACE_CREATE_RESULT_UNKNOWN", "作成処理の結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
  }

  return jsonResponse({
    workspaceId
  }, { status: 201 }, session.responseCookies);
}

function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return ["owner", "admin", "editor", "viewer"].includes(String(value));
}

function isWorkspaceMemberStatus(value: unknown): value is WorkspaceMemberStatus {
  return ["active", "invited", "removed"].includes(String(value));
}

function parseWorkspaceMemberRow(value: unknown): WorkspaceMemberRpcRow | null {
  if (!value || typeof value !== "object") return null;
  const member = value as Partial<WorkspaceMemberRpcRow>;
  if (
    typeof member.user_id !== "string" || !UUID_PATTERN.test(member.user_id) ||
    typeof member.display_name !== "string" || member.display_name.trim().length === 0 ||
    Array.from(member.display_name).length > 64 ||
    !isWorkspaceRole(member.role) ||
    !isWorkspaceMemberStatus(member.status) ||
    (member.joined_at !== null && (
      typeof member.joined_at !== "string" || Number.isNaN(Date.parse(member.joined_at))
    ))
  ) {
    return null;
  }
  return member as WorkspaceMemberRpcRow;
}

function workspaceMemberSummary(member: WorkspaceMemberRpcRow): WorkspaceMemberSummary {
  return {
    userId: member.user_id,
    displayName: member.display_name,
    role: member.role,
    status: member.status,
    joinedAt: member.joined_at
  };
}

function memberRpcMessage(payload: unknown): string {
  if (!payload || typeof payload !== "object" || !("message" in payload)) return "";
  return typeof payload.message === "string" ? payload.message : "";
}

function throwMemberRpcFailure(
  payload: unknown,
  mutation: boolean,
  fallback?: { code: string; message: string }
): never {
  const message = memberRpcMessage(payload);
  if (message.includes("MM_WORKSPACE_MEMBERS_NOT_FOUND")) {
    throw new AppError(404, "WORKSPACE_MEMBERS_NOT_FOUND", "ワークスペースまたはメンバー情報を確認できませんでした。");
  }
  if (message.includes("MM_MEMBER_MANAGE_FORBIDDEN")) {
    throw new AppError(403, "MEMBER_MANAGE_FORBIDDEN", "メンバーを変更する権限がありません。");
  }
  if (message.includes("MM_OWNER_TRANSFER_REQUIRED")) {
    throw new AppError(409, "OWNER_TRANSFER_REQUIRED", "管理責任者の変更は、メンバー管理の「管理責任者に移管」から行ってください。");
  }
  if (message.includes("MM_JOIN_CODE_UNAVAILABLE")) {
    throw new AppError(409, "JOIN_CODE_UNAVAILABLE", "参加コードを利用できません。有効期限または入力内容を確認し、本人に再発行を依頼してください。");
  }
  if (message.includes("MM_JOIN_CODE_CREATE_FAILED")) {
    throw new AppError(502, "JOIN_CODE_CREATE_RESULT_UNKNOWN", "参加コードを確認できませんでした。もう一度発行すると、以前のコードは無効になります。");
  }
  if (message.includes("MM_MEMBER_UPDATE_UNAVAILABLE")) {
    throw new AppError(409, "MEMBER_UPDATE_UNAVAILABLE", "対象メンバーの状態が変わったため更新できませんでした。一覧を更新してください。");
  }
  if (message.includes("MM_MEMBER_STATUS_INVALID")) {
    throw new AppError(400, "MEMBER_STATUS_INVALID", "メンバー状態の指定が正しくありません。");
  }
  if (message.includes("MM_WORKSPACE_MEMBERS_LIMIT_EXCEEDED")) {
    throw new AppError(409, "WORKSPACE_MEMBERS_LIMIT_EXCEEDED", "メンバーが多いため一覧を表示できません。管理者に整理を依頼してください。");
  }
  if (mutation) {
    throw new AppError(
      502,
      fallback?.code ?? "MEMBER_CHANGE_RESULT_UNKNOWN",
      fallback?.message ?? "変更結果を確認できませんでした。一覧を更新して状態を確認してください。"
    );
  }
  throw new AppError(502, "WORKSPACE_MEMBERS_FETCH_FAILED", "メンバー一覧を取得できませんでした。時間をおいて、もう一度お試しください。");
}

async function callWorkspaceMemberRpc(
  env: Env,
  accessToken: string,
  rpcName: string,
  body: Record<string, unknown>,
  mutation: boolean,
  fallback?: { code: string; message: string }
): Promise<unknown> {
  const fallbackCode = fallback?.code ?? (mutation ? "MEMBER_CHANGE_RESULT_UNKNOWN" : "WORKSPACE_MEMBERS_FETCH_FAILED");
  const fallbackMessage = fallback?.message ?? (mutation
    ? "変更結果を確認できませんでした。一覧を更新して状態を確認してください。"
    : "メンバー一覧を取得できませんでした。時間をおいて、もう一度お試しください。");
  return withSupabaseReadTimeout(async (signal) => {
    const response = await supabaseFetch(env, `/rest/v1/rpc/${rpcName}`, {
      method: "POST",
      body: JSON.stringify(body),
      signal
    }, accessToken);
    if (response.status === 401) {
      throw new AppError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
    }
    let payload: unknown;
    try {
      payload = await readSupabaseJson(response);
    } catch {
      throw new AppError(502, fallbackCode, fallbackMessage);
    }
    if (!response.ok) throwMemberRpcFailure(payload, mutation, fallback);
    return payload;
  }, fallbackCode, fallbackMessage);
}

async function createWorkspaceJoinCode(request: Request, env: Env): Promise<Response> {
  const session = await requireSession(request, env);
  await readJsonBody<Record<string, never>>(request);
  const unknown = {
    code: "JOIN_CODE_CREATE_RESULT_UNKNOWN",
    message: "参加コードを確認できませんでした。もう一度発行すると、以前のコードは無効になります。"
  };
  const payload = await callWorkspaceMemberRpc(
    env,
    session.accessToken,
    "create_workspace_join_code",
    {},
    true,
    unknown
  );
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new AppError(502, unknown.code, unknown.message);
  }
  const row = payload[0];
  if (!row || typeof row !== "object") {
    throw new AppError(502, unknown.code, unknown.message);
  }
  const candidate = row as { join_code?: unknown; expires_at?: unknown };
  const expiresAt = typeof candidate.expires_at === "string" ? Date.parse(candidate.expires_at) : Number.NaN;
  const now = Date.now();
  if (
    typeof candidate.join_code !== "string" || !JOIN_CODE_PATTERN.test(candidate.join_code) ||
    !Number.isFinite(expiresAt) || expiresAt <= now || expiresAt > now + 11 * 60 * 1000
  ) {
    throw new AppError(502, unknown.code, unknown.message);
  }
  return jsonResponse({
    joinCode: candidate.join_code,
    expiresAt: candidate.expires_at
  }, { status: 201 }, session.responseCookies);
}

function requireWorkspaceId(workspaceId: string): void {
  if (!UUID_PATTERN.test(workspaceId)) {
    throw new AppError(404, "WORKSPACE_MEMBERS_NOT_FOUND", "ワークスペースまたはメンバー情報を確認できませんでした。");
  }
}

async function getWorkspaceMembers(request: Request, env: Env, workspaceId: string): Promise<Response> {
  requireWorkspaceId(workspaceId);
  const session = await requireSession(request, env);
  const payload = await callWorkspaceMemberRpc(
    env,
    session.accessToken,
    "list_workspace_members",
    { target_workspace_id: workspaceId },
    false
  );
  if (!Array.isArray(payload) || payload.length === 0 || payload.length > MAX_WORKSPACE_MEMBER_LIST_ITEMS) {
    throw new AppError(502, "WORKSPACE_MEMBERS_RESPONSE_INVALID", "メンバー一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const rows = payload.map(parseWorkspaceMemberRow);
  if (rows.some((member) => member === null)) {
    throw new AppError(502, "WORKSPACE_MEMBERS_RESPONSE_INVALID", "メンバー一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const members = rows as WorkspaceMemberRpcRow[];
  const actorRole = members[0]?.actor_role;
  const totalCount = members[0]?.total_count;
  if (
    !isWorkspaceRole(actorRole) ||
    typeof totalCount !== "number" || !Number.isSafeInteger(totalCount) || totalCount !== members.length ||
    members.some((member) => member.status !== "active") ||
    members.some((member) => member.actor_role !== actorRole || member.total_count !== totalCount) ||
    new Set(members.map((member) => member.user_id)).size !== members.length
  ) {
    throw new AppError(502, "WORKSPACE_MEMBERS_RESPONSE_INVALID", "メンバー一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  return jsonResponse({
    workspaceId,
    currentUserRole: actorRole,
    members: members.map(workspaceMemberSummary)
  }, undefined, session.responseCookies);
}

function requireManageableRole(value: unknown): "admin" | "editor" | "viewer" {
  if (value !== "admin" && value !== "editor" && value !== "viewer") {
    if (value === "owner") {
      throw new AppError(409, "OWNER_TRANSFER_REQUIRED", "管理責任者の変更は、メンバー管理の「管理責任者に移管」から行ってください。");
    }
    throw new AppError(400, "MEMBER_ROLE_INVALID", "権限は管理者・編集者・閲覧者から選択してください。");
  }
  return value;
}

function requireMemberMutationResult(
  payload: unknown,
  expected: { userId?: string; role: "admin" | "editor" | "viewer"; status: "active" | "removed" }
): WorkspaceMemberSummary {
  if (!Array.isArray(payload) || payload.length !== 1) {
    throw new AppError(502, "MEMBER_CHANGE_RESULT_UNKNOWN", "変更結果を確認できませんでした。一覧を更新して状態を確認してください。");
  }
  const member = parseWorkspaceMemberRow(payload[0]);
  if (
    !member ||
    (expected.userId !== undefined && member.user_id !== expected.userId) ||
    member.role !== expected.role ||
    member.status !== expected.status
  ) {
    throw new AppError(502, "MEMBER_CHANGE_RESULT_UNKNOWN", "変更結果を確認できませんでした。一覧を更新して状態を確認してください。");
  }
  return workspaceMemberSummary(member);
}

async function addWorkspaceMember(request: Request, env: Env, workspaceId: string): Promise<Response> {
  requireWorkspaceId(workspaceId);
  const session = await requireSession(request, env);
  const body = await readJsonBody<{ joinCode?: string; role?: string }>(request);
  if (typeof body.joinCode !== "string" || !JOIN_CODE_PATTERN.test(body.joinCode.trim())) {
    throw new AppError(409, "JOIN_CODE_UNAVAILABLE", "参加コードを利用できません。有効期限または入力内容を確認し、本人に再発行を依頼してください。");
  }
  const joinCode = body.joinCode.trim();
  const role = requireManageableRole(body.role);
  const payload = await callWorkspaceMemberRpc(
    env,
    session.accessToken,
    "redeem_workspace_join_code",
    { target_workspace_id: workspaceId, join_code: joinCode, target_role: role },
    true
  );
  return jsonResponse({
    member: requireMemberMutationResult(payload, { role, status: "active" })
  }, { status: 201 }, session.responseCookies);
}

async function updateWorkspaceMember(
  request: Request,
  env: Env,
  workspaceId: string,
  userId: string
): Promise<Response> {
  requireWorkspaceId(workspaceId);
  if (!UUID_PATTERN.test(userId)) {
    throw new AppError(409, "MEMBER_UPDATE_UNAVAILABLE", "対象メンバーの状態が変わったため更新できませんでした。一覧を更新してください。");
  }
  const session = await requireSession(request, env);
  const body = await readJsonBody<{ role?: string; status?: string }>(request);
  const role = requireManageableRole(body.role);
  if (body.status !== "active" && body.status !== "removed") {
    throw new AppError(400, "MEMBER_STATUS_INVALID", "メンバー状態の指定が正しくありません。");
  }
  const payload = await callWorkspaceMemberRpc(
    env,
    session.accessToken,
    "update_workspace_member",
    {
      target_workspace_id: workspaceId,
      target_user_id: userId,
      target_role: role,
      target_status: body.status
    },
    true
  );
  return jsonResponse({
    member: requireMemberMutationResult(payload, {
      userId,
      role,
      status: body.status
    })
  }, undefined, session.responseCookies);
}

async function logout(request: Request, env: Env): Promise<Response> {
  await readJsonBody<Record<string, never>>(request);
  const cookies = parseCookies(request, true);
  if (!cookies.has(COOKIE_ACCESS_TOKEN) && !cookies.has(COOKIE_REFRESH_TOKEN)) {
    return jsonResponse({ status: "ok" }, undefined, clearSessionCookies());
  }

  let session: SessionResult;
  try {
    session = await requireSession(request, env, cookies, true);
  } catch (error) {
    if (error instanceof AppError && error.code === "SESSION_EXPIRED") {
      return jsonResponse({ status: "ok" }, undefined, clearSessionCookies());
    }
    return logoutRevokeFailureResponse();
  }

  let response: Response;
  try {
    response = await supabaseFetch(env, "/auth/v1/logout?scope=local", {
      method: "POST"
    }, session.accessToken);
  } catch {
    return logoutRevokeFailureResponse();
  }

  if (!response.ok) {
    return logoutRevokeFailureResponse();
  }

  return jsonResponse({ status: "ok" }, undefined, clearSessionCookies());
}

async function accessLogout(request: Request, env: Env): Promise<Response> {
  await readJsonBody<Record<string, never>>(request);
  try {
    requireHumanActor(await verifyAccessJwt(request, env));
  } catch (error) {
    throw mapAccessIdentityError(error);
  }
  // Access assertion is the selected logout boundary. Clear competing legacy
  // cookies only after the assertion has been verified; invalid/failing Access
  // requests must not erase credentials that were not authenticated here.
  return jsonResponse({ status: "ok", redirectUrl: "/cdn-cgi/access/logout" }, undefined, clearSessionCookies());
}

function logoutRevokeFailureResponse(): Response {
  return jsonResponse({
    code: "LOGOUT_REVOKE_FAILED",
    message: "この端末のログイン情報は削除しましたが、認証サーバー側のログアウトを確認できませんでした。もう一度ログインしてからログアウトしてください。"
  }, { status: 502 }, clearSessionCookies());
}

async function configHealth(request: Request, env: Env): Promise<Response> {
  if (useAccessD1Routes(env)) {
    let auth;
    try {
      auth = await authenticateApplicationRequest(request, env, d1IdentityRepository(env));
    } catch (error) {
      throw mapAccessIdentityError(error);
    }
    if (auth.kind !== "machine" || !inspectAccessHealthServiceTokenNames(env).has(auth.actor.commonName)) {
      throw new AppError(403, "ACCESS_FORBIDDEN", "この操作を行う権限がありません。");
    }
  }

  const supabase = inspectSupabaseConfig(env);
  const { hasUrl, hasAnonKey } = supabase;
  const hasAllowedGuildIds = splitCsv(env.DISCORD_ALLOWED_GUILD_IDS).size > 0;
  const hasAllowedChannelIds = splitCsv(env.DISCORD_ALLOWED_CHANNEL_IDS).size > 0;
  const allowUnscopedCommands = allowUnscopedDiscordCommands(env);
  const discordIssueBridgeConfigured = Boolean(
    env.DISCORD_PUBLIC_KEY &&
    env.GITHUB_ISSUE_TOKEN &&
    env.DISCORD_INTERACTION_STORE &&
    (allowUnscopedCommands || (hasAllowedGuildIds && hasAllowedChannelIds))
  );

  return jsonResponse({
    service: "meccha-manual",
    status: "ok",
    phase: "phase-1-auth-workspace-harness",
    timestamp: new Date().toISOString(),
    config: {
      supabase: {
        configured: supabase.configured,
        hasUrl,
        hasAnonKey,
        projectRef: supabase.projectRef
      },
      productAuth: {
        googleConfigured: configuredProductProviders(env).google,
        chatgptConfigured: configuredProductProviders(env).chatgpt
      },
      discord: {
        issueBridgeConfigured: discordIssueBridgeConfigured,
        hasPublicKey: Boolean(env.DISCORD_PUBLIC_KEY),
        hasIssueToken: Boolean(env.GITHUB_ISSUE_TOKEN),
        hasIssueRepository: Boolean(env.GITHUB_ISSUE_REPOSITORY),
        hasInteractionStore: Boolean(env.DISCORD_INTERACTION_STORE),
        hasAllowedGuildIds,
        hasAllowedChannelIds,
        allowUnscopedCommands
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

function callbackMigrationResponse(): Response {
  return jsonResponse({
    code: CALLBACK_MIGRATION_CODE,
    message: "外部連携は移行中のため現在利用できません。"
  }, { status: 503 });
}

function accessLegacyRouteMigrationResponse(): Response {
  return jsonResponse({
    code: ACCESS_LEGACY_ROUTE_MIGRATION_CODE,
    message: "認証・メンバー機能は移行中のため、現在利用できません。"
  }, { status: 503 });
}

function cloudManualMigrationResponse(): Response {
  return jsonResponse({
    code: ACCESS_LEGACY_ROUTE_MIGRATION_CODE,
    message: "手順書機能は移行中のため、現在利用できません。"
  }, { status: 503 });
}

function isLegacySupabaseProtectedRoute(pathname: string): boolean {
  return /^\/api\/auth\/(?:login|refresh)$/.test(pathname);
}

const BRAND_ASSET_PATHS: Record<string, string> = {
  "/assets/meccha-manual-logo-mark.png": "/assets/meccha-manual-logo-mark.png",
  "/assets/meccha-manual-mascot-me-clear-eyes.png": "/assets/meccha-manual-mascot-me-clear-eyes.png",
  "/s/assets/brand/logo.png": "/assets/meccha-manual-logo-mark.png",
  "/s/assets/brand/mascot.png": "/assets/meccha-manual-mascot-me-clear-eyes.png",
};

async function brandAssetResponse(request: Request, env: Env): Promise<Response | null> {
  if (request.method !== "GET") return null;
  const assetPath = BRAND_ASSET_PATHS[new URL(request.url).pathname];
  if (!assetPath) return null;
  if (!env.ASSETS) return new Response("Not Found", { status: 404 });
  const target = new URL(assetPath, request.url);
  return env.ASSETS.fetch(new Request(target, { method: "GET", headers: request.headers }));
}

async function route(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);
  if (useAccessD1Routes(env) && isLegacySupabaseProtectedRoute(url.pathname)) {
    return accessLegacyRouteMigrationResponse();
  }
  if (DISABLED_CALLBACK_PATHS.has(url.pathname)) {
    if (request.method === "POST") return callbackMigrationResponse();
    return jsonResponse({
      code: "METHOD_NOT_ALLOWED",
      message: "この操作には対応していません。"
    }, { status: 405 });
  }
  const hasCurrentAssetVersion = url.searchParams.get("v") === APP_ASSET_VERSION;
  const workspaceMembersMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/members$/);
  const ownerTransferMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/owner-transfer$/);
  const workspaceMemberMatch = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/members\/([^/]+)$/);

  // Exact public sample routes never resolve identity, workspace, D1 or R2.
  if (request.method === "GET" && url.pathname === "/manuals/sample") {
    return htmlResponse(renderCloudManualsPage({ mode: "sample", assetVersion: APP_ASSET_VERSION }));
  }
  if (request.method === "GET" && url.pathname === "/assets/manual-sample.css") {
    return assetResponse(CLOUD_MANUAL_CSS, "text/css; charset=utf-8", hasCurrentAssetVersion);
  }
  if (request.method === "GET" && url.pathname === "/assets/manual-sample.js") {
    return assetResponse(CLOUD_MANUAL_JS, "application/javascript; charset=utf-8", hasCurrentAssetVersion);
  }
  const sampleImagePath = MANUAL_SAMPLE_IMAGE_PATHS[url.pathname];
  if (request.method === "GET" && sampleImagePath) {
    if (!env.ASSETS) return new Response("Not Found", { status: 404 });
    return env.ASSETS.fetch(new Request(new URL(sampleImagePath, request.url), { method: "GET", headers: request.headers }));
  }

  const brandAsset = await brandAssetResponse(request, env);
  if (brandAsset) return brandAsset;

  // The share viewer, token/grant APIs, and their assets are public entry
  // points. Share management and protected manual routes still depend on the
  // credential-selected application route.
  if (url.pathname.startsWith("/s/")) {
    const shareResponse = await handleShareLinkRoute(request, env);
    if (shareResponse) return shareResponse;
  }

  if (useD1ApplicationRoutes(env, request)) {
    const shareResponse = await handleShareLinkRoute(request, env);
    if (shareResponse) return shareResponse;
    const cloudManualResponse = await handleCloudManualRoute(request, env);
    if (cloudManualResponse) return cloudManualResponse;
  }

  if (request.method === "GET" && url.pathname === "/api/auth/providers") {
    return jsonResponse({ providers: configuredProductProviders(env), password: inspectSupabaseConfig(env).configured && !useAccessD1Routes(env) });
  }
  if (request.method === "GET" && url.pathname === "/api/auth/google/start") return productAuthStartRoute(request, env, "google");
  if (request.method === "GET" && url.pathname === "/api/auth/google/callback") return productAuthCallbackRoute(request, env, "google");
  if (request.method === "GET" && url.pathname === "/api/auth/chatgpt/start") return productAuthStartRoute(request, env, "chatgpt");
  if (request.method === "GET" && url.pathname === "/api/auth/chatgpt/callback") return productAuthCallbackRoute(request, env, "chatgpt");

  verifySameOriginWrite(request);

  if (request.method === "POST" && url.pathname === "/api/onboarding/bootstrap") return bootstrapOnboarding(request, env);
  if (request.method === "GET" && url.pathname === "/onboarding/continue") {
    const bootstrapEnabled = isConfiguredOnboardingOrigin(url.origin, env)
      && (inspectAccessConfig(env).configured || useProductD1Routes(env, request)) && Boolean(env.DB) && Boolean(env.ONBOARDING_RATE_LIMITER);
    return htmlResponse(renderOnboardingContinuePage({ bootstrapEnabled }));
  }
  if (request.method === "GET" && url.pathname === "/assets/onboarding.css") {
    return assetResponse(ONBOARDING_CSS, "text/css; charset=utf-8", false);
  }
  if (request.method === "GET" && url.pathname === "/assets/onboarding.js") {
    return assetResponse(ONBOARDING_JS, "application/javascript; charset=utf-8", false);
  }
  if (useD1ApplicationRoutes(env, request) && request.method === "GET" && url.pathname === "/assets/cloud-manual.css" && !env.MANUAL_ASSETS) {
    return cloudManualMigrationResponse();
  }
  if (useD1ApplicationRoutes(env, request) && request.method === "GET" && url.pathname === "/assets/cloud-manual.css") {
    return assetResponse(CLOUD_MANUAL_CSS, "text/css; charset=utf-8", hasCurrentAssetVersion);
  }
  if (useD1ApplicationRoutes(env, request) && request.method === "GET" && url.pathname === "/assets/cloud-manual.js" && !env.MANUAL_ASSETS) {
    return cloudManualMigrationResponse();
  }
  if (useD1ApplicationRoutes(env, request) && request.method === "GET" && url.pathname === "/assets/editor-tools.js") {
    if (!env.MANUAL_ASSETS) return cloudManualMigrationResponse();
    return assetResponse(EDITOR_TOOLS_JS, "application/javascript; charset=utf-8", hasCurrentAssetVersion);
  }
  if (useD1ApplicationRoutes(env, request) && request.method === "GET" && url.pathname === "/assets/cloud-manual.js") {
    return assetResponse(CLOUD_MANUAL_JS, "application/javascript; charset=utf-8", hasCurrentAssetVersion);
  }
  if (useD1ApplicationRoutes(env, request) && request.method === "GET" && url.pathname === "/manuals") {
    if (!env.MANUAL_ASSETS) return cloudManualMigrationResponse();
    return cloudManualPage(request, env);
  }
  if (request.method === "GET" && url.pathname === "/") {
    const response = htmlResponse(APP_HTML);
    if (url.searchParams.get("auth") === "complete") response.headers.set("referrer-policy", "no-referrer");
    return response;
  }
  if (request.method === "GET" && url.pathname === "/assets/app.css") {
    return assetResponse(APP_CSS, "text/css; charset=utf-8", hasCurrentAssetVersion);
  }
  if (request.method === "GET" && url.pathname === "/assets/app.js") {
    return assetResponse(APP_JS, "application/javascript; charset=utf-8", hasCurrentAssetVersion);
  }
  if (request.method === "GET" && url.pathname === "/health") return basicHealth();
  if (request.method === "GET" && url.pathname === "/health/config") return configHealth(request, env);
  if (request.method === "GET" && url.pathname === "/api/session") {
    return useD1ApplicationRoutes(env, request) ? getD1Session(request, env) : getSession(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/refresh") return refreshAuthentication(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    if ((await getProductSession(request, env)) || hasProductSessionCookie(request)) return revokeProductSession(request, env);
    if (hasAccessAssertion(request)) return accessLogout(request, env);
    if (inspectSupabaseConfig(env).configured && hasLegacySupabaseSessionCookie(request)) return logout(request, env);
    return useAccessD1Routes(env) ? accessLogout(request, env) : logout(request, env);
  }
  if (request.method === "GET" && url.pathname === "/api/workspaces") {
    if (useD1ApplicationRoutes(env, request)) return listD1Workspaces(request, env);
    const session = await requireSession(request, env);
    return jsonResponse({ workspaces: await fetchWorkspaces(env, session.accessToken) }, undefined, session.responseCookies);
  }
  if (request.method === "POST" && url.pathname === "/api/workspaces") {
    return useD1ApplicationRoutes(env, request) ? createD1Workspace(request, env) : createWorkspace(request, env);
  }
  if (request.method === "POST" && url.pathname === "/api/member-join-code") {
    return useD1ApplicationRoutes(env, request) ? createD1WorkspaceJoinCode(request, env) : createWorkspaceJoinCode(request, env);
  }
  if (request.method === "POST" && ownerTransferMatch?.[1]) {
    return transferD1WorkspaceOwnership(request, env, ownerTransferMatch[1]);
  }
  if (request.method === "GET" && workspaceMembersMatch?.[1]) {
    return useD1ApplicationRoutes(env, request)
      ? getD1WorkspaceMembers(request, env, workspaceMembersMatch[1])
      : getWorkspaceMembers(request, env, workspaceMembersMatch[1]);
  }
  if (request.method === "POST" && workspaceMembersMatch?.[1]) {
    return useD1ApplicationRoutes(env, request)
      ? addD1WorkspaceMember(request, env, workspaceMembersMatch[1])
      : addWorkspaceMember(request, env, workspaceMembersMatch[1]);
  }
  if (request.method === "PATCH" && workspaceMemberMatch?.[1] && workspaceMemberMatch[2]) {
    return useD1ApplicationRoutes(env, request)
      ? updateD1WorkspaceMember(request, env, workspaceMemberMatch[1], workspaceMemberMatch[2])
      : updateWorkspaceMember(request, env, workspaceMemberMatch[1], workspaceMemberMatch[2]);
  }

  return jsonResponse({
    code: "NOT_FOUND",
    message: "指定されたページまたはAPIが見つかりません。"
  }, { status: 404 });
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  }
} satisfies ExportedHandler<Env>;
