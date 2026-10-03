import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from "jose";
import { D1OnboardingRepository } from "./infra/d1/onboarding-repository.ts";
import type { D1DatabaseLike } from "./infra/d1/d1-types.ts";
import { inspectAppRuntimeConfig, inspectProductAuthConfig, resolveProductAuthProviderConfig, type AppRuntimeBindings, type ProductAuthBindings } from "./server-config.ts";

export const PRODUCT_SESSION_COOKIE = "__Host-mm_product";
const OAUTH_COOKIE_PREFIX = "__Host-mm_oauth_";
const SESSION_SECONDS = 60 * 60 * 24 * 7;
const TRANSACTION_SECONDS = 60 * 10;
const PROVIDER_TIMEOUT_MS = 5_000;
const PROVIDER_BODY_BYTES = 256 * 1024;
const GOOGLE = {
  issuer: "https://accounts.google.com",
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  jwksEndpoint: "https://www.googleapis.com/oauth2/v3/certs"
} as const;
const CHATGPT = {
  issuer: "https://auth.openai.com",
  authorizationEndpoint: "https://auth.openai.com/api/accounts/authorize",
  tokenEndpoint: "https://auth.openai.com/api/accounts/oauth/token",
  jwksEndpoint: "https://auth.openai.com/.well-known/jwks.json"
} as const;

export class ProductAuthError extends Error {
  readonly status: 400 | 401 | 403 | 409 | 429 | 502 | 503;
  readonly code: string;
  constructor(status: 400 | 401 | 403 | 409 | 429 | 502 | 503, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

export function hasProductSessionCookie(request: Request): boolean {
  return (request.headers.get("cookie") ?? "").split(";").some((part) => {
    const separator = part.indexOf("=");
    return (separator < 0 ? part : part.slice(0, separator)).trim() === PRODUCT_SESSION_COOKIE;
  });
}

interface Env extends AppRuntimeBindings, ProductAuthBindings { DB?: D1DatabaseLike; ONBOARDING_RATE_LIMITER?: RateLimit; }
interface TransactionRow { id: string; provider: Provider; state_hash: string; nonce_hash: string; verifier_hash: string; redirect_uri: string; return_path: string; expires_at: string; consumed_at: string | null; }
interface SessionRow { application_id: string; issuer: string; subject: string; expires_at: string; revoked_at: string | null; auth_method: Provider; }
type Provider = "google" | "chatgpt";
type ProviderSpec = typeof GOOGLE | typeof CHATGPT;

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function formComponent(value: string): string {
  return new URLSearchParams({ value }).toString().slice("value=".length);
}

async function hash(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function randomValue(bytes = 32): string { return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes))); }

async function boundedProviderFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    if (!response.body) return new Response(null, { status: response.status, headers: response.headers });
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
      while (true) {
        const next = await reader.read();
        if (next.done) break;
        total += next.value.byteLength;
        if (total > PROVIDER_BODY_BYTES) {
          await reader.cancel();
          throw new ProductAuthError(502, "AUTH_PROVIDER_INVALID", "ログインサービスの応答を確認できませんでした。時間をおいて再度お試しください。");
        }
        chunks.push(next.value);
      }
    } finally { reader.releaseLock(); }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
    return new Response(body, { status: response.status, headers: response.headers });
  } catch (error) {
    if (error instanceof ProductAuthError) throw error;
    throw new ProductAuthError(503, "AUTH_PROVIDER_UNAVAILABLE", "ログインサービスに接続できません。時間をおいて再度お試しください。");
  } finally { clearTimeout(timer); }
}

function providerConfig(env: Env, provider: Provider): { clientId: string; clientSecret: string; spec: ProviderSpec } {
  const config = resolveProductAuthProviderConfig(env, provider);
  if (!config) throw new ProductAuthError(503, "AUTH_PROVIDER_UNAVAILABLE", "このログイン方法は現在準備中です。別の方法を選ぶか、時間をおいて再度お試しください。");
  return { ...config, spec: provider === "google" ? GOOGLE : CHATGPT };
}

function safeReturnPath(value: string | null): string {
  if (!value) return "/";
  let decoded = value;
  try { decoded = decodeURIComponent(value); } catch { throw new ProductAuthError(400, "AUTH_RETURN_INVALID", "戻り先を確認できませんでした。最初の画面からログインをやり直してください。"); }
  if (!decoded.startsWith("/") || decoded.startsWith("//") || decoded.includes("\\") || decoded.includes("\n") || decoded.includes("\r")) {
    throw new ProductAuthError(400, "AUTH_RETURN_INVALID", "戻り先を確認できませんでした。最初の画面からログインをやり直してください。");
  }
  const parsed = new URL(decoded, "https://meccha-manual.invalid");
  const allowed = new Set(["/", "/onboarding/continue", "/manuals"]);
  if (parsed.origin !== "https://meccha-manual.invalid" || !allowed.has(parsed.pathname) || parsed.search || parsed.hash) {
    throw new ProductAuthError(400, "AUTH_RETURN_INVALID", "戻り先を確認できませんでした。最初の画面からログインをやり直してください。");
  }
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function cookie(name: string, value: string, maxAge: number, path = "/"): string {
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=${path}; HttpOnly; Secure; SameSite=Lax`;
}

function clearCookie(name: string, path = "/"): string { return cookie(name, "", 0, path); }

function cookies(request: Request): Map<string, string> {
  const result = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    try { result.set(part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1).trim())); } catch { /* malformed cookie is ignored */ }
  }
  return result;
}

function runtimeBaseUrl(env: Env): string {
  const config = inspectAppRuntimeConfig(env).config;
  if (!config) throw new ProductAuthError(503, "AUTH_RUNTIME_UNAVAILABLE", "ログイン設定を確認できません。管理者が設定を確認してから再度お試しください。");
  return config.baseUrl;
}

export function configuredProductProviders(env: ProductAuthBindings): { google: boolean; chatgpt: boolean } {
  const config = inspectProductAuthConfig(env);
  return { google: config.google.configured, chatgpt: config.chatgpt.configured };
}

export async function beginProductAuth(request: Request, env: Env, provider: Provider): Promise<Response> {
  const { clientId, spec } = providerConfig(env, provider);
  if (!env.DB) throw new ProductAuthError(503, "AUTH_STORAGE_UNAVAILABLE", "ログイン状態を保存できません。時間をおいて再度お試しください。");
  if (!env.ONBOARDING_RATE_LIMITER) throw new ProductAuthError(503, "AUTH_RATE_LIMITED", "ログイン設定を確認できません。管理者が設定を確認してから再度お試しください。");
  const ip = request.headers.get("CF-Connecting-IP")?.trim() || "unknown";
  const limited = await env.ONBOARDING_RATE_LIMITER.limit({ key: `product-auth:${provider}:${await hash(ip)}` }).catch(() => null);
  if (!limited || limited.success !== true) throw new ProductAuthError(429, "AUTH_RATE_LIMITED", "ログイン操作が多すぎます。時間をおいて再度お試しください。");
  const returnPath = safeReturnPath(new URL(request.url).searchParams.get("return"));
  const redirectUri = `${runtimeBaseUrl(env)}/api/auth/${provider}/callback`;
  const state = randomValue();
  const nonce = randomValue();
  const verifier = randomValue(48);
  const transactionId = crypto.randomUUID();
  const now = new Date();
  const expires = new Date(now.getTime() + TRANSACTION_SECONDS * 1000).toISOString();
  const result = await env.DB.prepare(`INSERT INTO oauth_transactions
    (id, provider, state_hash, nonce_hash, verifier_hash, redirect_uri, return_path, created_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(transactionId, provider, await hash(state), await hash(nonce), await hash(verifier), redirectUri, returnPath, now.toISOString(), expires).run();
  if (!result.success) throw new ProductAuthError(503, "AUTH_STORAGE_UNAVAILABLE", "ログイン状態を保存できません。時間をおいて再度お試しください。");
  const params = new URLSearchParams({ client_id: clientId, redirect_uri: redirectUri, response_type: "code", scope: "openid email profile", state, nonce, code_challenge: bytesToBase64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)))), code_challenge_method: "S256" });
  const response = new Response(null, { status: 302, headers: { location: `${spec.authorizationEndpoint}?${params}`, "cache-control": "no-store" } });
  response.headers.append("set-cookie", cookie(`${OAUTH_COOKIE_PREFIX}${provider}`, `${transactionId}.${verifier}.${nonce}`, TRANSACTION_SECONDS));
  return response;
}

async function readTransaction(db: D1DatabaseLike, provider: Provider, state: string, transactionId: string, verifier: string): Promise<TransactionRow> {
  const row = await db.prepare(`SELECT id, provider, state_hash, nonce_hash, verifier_hash, redirect_uri, return_path, expires_at, consumed_at FROM oauth_transactions WHERE id = ? AND provider = ? AND state_hash = ?`).bind(transactionId, provider, await hash(state)).first<TransactionRow>();
  const expiresAt = Date.parse(row?.expires_at ?? "");
  if (!row || row.consumed_at || !Number.isFinite(expiresAt) || expiresAt <= Date.now() || row.verifier_hash !== await hash(verifier)) throw new ProductAuthError(401, "AUTH_TRANSACTION_INVALID", "ログインの有効期限が切れました。ログインをやり直してください。");
  const consumed = await db.prepare("UPDATE oauth_transactions SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL").bind(new Date().toISOString(), row.id).run();
  if (!consumed.success || (consumed.meta?.changes ?? 0) !== 1) throw new ProductAuthError(409, "AUTH_TRANSACTION_REPLAYED", "このログイン操作はすでに使用されています。ログインをやり直してください。");
  return row;
}

interface IdClaims extends JWTPayload { email?: unknown; email_verified?: unknown; name?: unknown; }

async function exchangeAndVerify(request: Request, env: Env, provider: Provider, code: string, verifier: string, nonce: string, transaction: TransactionRow): Promise<{ issuer: string; subject: string; displayName: string; method: Provider }> {
  const { clientId, clientSecret, spec } = providerConfig(env, provider);
  const body = new URLSearchParams({ client_id: clientId, code, code_verifier: verifier, grant_type: "authorization_code", redirect_uri: transaction.redirect_uri });
  const headers = new Headers({ "content-type": "application/x-www-form-urlencoded", accept: "application/json" });
  if (provider === "google") body.set("client_secret", clientSecret);
  else headers.set("authorization", `Basic ${bytesToBase64(new TextEncoder().encode(`${formComponent(clientId)}:${formComponent(clientSecret)}`))}`);
  const response = await boundedProviderFetch(spec.tokenEndpoint, { method: "POST", headers, body });
  if (!response.ok) throw new ProductAuthError(401, "AUTH_CODE_INVALID", "ログインを確認できませんでした。ログインをやり直してください。");
  const payload = await response.json().catch(() => null) as { id_token?: unknown } | null;
  if (!payload || typeof payload.id_token !== "string") throw new ProductAuthError(502, "AUTH_PROVIDER_INVALID", "ログインサービスの応答を確認できませんでした。時間をおいて再度お試しください。");
  let claims: IdClaims;
  try {
    ({ payload: claims } = await jwtVerify<IdClaims>(payload.id_token, createRemoteJWKSet(new URL(spec.jwksEndpoint), { [customFetch]: (input, init) => boundedProviderFetch(input, init) }), { issuer: spec.issuer, audience: clientId, requiredClaims: ["iss", "sub", "aud", "exp", "iat", "nonce"] }));
  } catch {
    throw new ProductAuthError(401, "AUTH_IDENTITY_INVALID", "ログイン情報を確認できませんでした。ログインをやり直してください。");
  }
  if (claims.nonce !== nonce || typeof claims.sub !== "string" || !claims.sub.trim() || (provider === "google" && claims.email_verified !== true)) throw new ProductAuthError(403, "AUTH_IDENTITY_UNVERIFIED", "確認済みのログイン情報を受け取れませんでした。別のログイン方法をお試しください。");
  const subject = provider === "google" ? claims.sub : `siwc:${await hash(JSON.stringify([clientId, claims.sub]))}`;
  return { issuer: spec.issuer, subject, displayName: typeof claims.name === "string" ? claims.name.slice(0, 64) : "めっちゃマニュアル利用者", method: provider };
}

export async function finishProductAuth(request: Request, env: Env, provider: Provider): Promise<Response> {
  if (!env.DB) throw new ProductAuthError(503, "AUTH_STORAGE_UNAVAILABLE", "ログイン状態を保存できません。時間をおいて再度お試しください。");
  const query = new URL(request.url).searchParams;
  if (query.get("error")) throw new ProductAuthError(401, "AUTH_CANCELLED", "ログインをキャンセルしました。ログイン画面から再度お試しください。");
  const state = query.get("state") ?? "";
  const code = query.get("code") ?? "";
  const parts = cookies(request).get(`${OAUTH_COOKIE_PREFIX}${provider}`)?.split(".") ?? [];
  if (!state || !code || parts.length !== 3) throw new ProductAuthError(401, "AUTH_TRANSACTION_INVALID", "ログインの有効期限が切れました。ログインをやり直してください。");
  const [transactionId, verifier, nonce] = parts;
  if (!transactionId || !verifier || !nonce) throw new ProductAuthError(401, "AUTH_TRANSACTION_INVALID", "ログインの有効期限が切れました。ログインをやり直してください。");
  const transaction = await readTransaction(env.DB, provider, state, transactionId, verifier);
  if ((await hash(nonce)) !== transaction.nonce_hash) throw new ProductAuthError(401, "AUTH_TRANSACTION_INVALID", "ログインの有効期限が切れました。ログインをやり直してください。");
  const identity = await exchangeAndVerify(request, env, provider, code, verifier, nonce, transaction);
  await new D1OnboardingRepository(env.DB).bootstrap({ kind: "product_user", issuer: identity.issuer, subject: identity.subject }, `oauth-${crypto.randomUUID().replaceAll("-", "")}`);
  const token = randomValue(32);
  const now = new Date();
  const result = await env.DB.prepare(`INSERT INTO auth_sessions (id, application_id, token_hash, auth_method, issued_at, expires_at)
    SELECT ?, application_id, ?, ?, ?, ? FROM identities WHERE issuer = ? AND subject = ? AND status = 'active'`)
    .bind(crypto.randomUUID(), await hash(token), identity.method, now.toISOString(), new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString(), identity.issuer, identity.subject).run();
  if (!result.success || (result.meta?.changes ?? 0) !== 1) throw new ProductAuthError(503, "AUTH_SESSION_UNAVAILABLE", "ログイン状態を保存できません。時間をおいて再度お試しください。");
  const response = new Response(null, { status: 302, headers: { location: new URL(transaction.return_path, runtimeBaseUrl(env)).toString(), "cache-control": "no-store" } });
  response.headers.append("set-cookie", cookie(PRODUCT_SESSION_COOKIE, token, SESSION_SECONDS));
  response.headers.append("set-cookie", clearCookie(`${OAUTH_COOKIE_PREFIX}${provider}`));
  return response;
}

export async function getProductSession(request: Request, env: Env): Promise<{ applicationId: string; issuer: string; subject: string; authMethod: Provider } | null> {
  const token = cookies(request).get(PRODUCT_SESSION_COOKIE);
  if (!token || !env.DB) return null;
  const runtime = inspectAppRuntimeConfig(env).config;
  if (!runtime || new URL(request.url).origin !== runtime.baseUrl) return null;
  const row = await env.DB.prepare(`SELECT s.application_id, i.issuer, i.subject, s.expires_at, s.revoked_at, s.auth_method
    FROM auth_sessions s JOIN identities i ON i.application_id = s.application_id
    WHERE s.token_hash = ? AND i.status = 'active'`).bind(await hash(token)).first<SessionRow>();
  const expiresAt = Date.parse(row?.expires_at ?? "");
  if (!row || row.revoked_at || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
  return { applicationId: row.application_id, issuer: row.issuer, subject: row.subject, authMethod: row.auth_method };
}

export async function revokeProductSession(request: Request, env: Env): Promise<Response> {
  const token = cookies(request).get(PRODUCT_SESSION_COOKIE);
  if (token && !env.DB) throw new ProductAuthError(503, "AUTH_STORAGE_UNAVAILABLE", "ログアウト状態を保存できません。時間をおいて再度お試しください。");
  if (token && env.DB) {
    const result = await env.DB.prepare("UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL").bind(new Date().toISOString(), await hash(token)).run();
    if (!result.success) throw new ProductAuthError(503, "AUTH_STORAGE_UNAVAILABLE", "ログアウト状態を保存できません。時間をおいて再度お試しください。");
  }
  return new Response(null, { status: 204, headers: { "set-cookie": clearCookie(PRODUCT_SESSION_COOKIE), "cache-control": "no-store" } });
}
