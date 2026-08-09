import { APP_CSS, APP_HTML, APP_JS } from "./app-assets.ts";

interface Env {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  DISCORD_INTERACTION_STORE?: KVNamespace;
  DISCORD_PUBLIC_KEY?: string;
  DISCORD_ALLOWED_GUILD_IDS?: string;
  DISCORD_ALLOWED_CHANNEL_IDS?: string;
  DISCORD_ALLOWED_USER_IDS?: string;
  DISCORD_ALLOWED_ROLE_IDS?: string;
  DISCORD_ALLOW_UNSCOPED_COMMANDS?: string;
  GITHUB_ISSUE_TOKEN?: string;
  GITHUB_ISSUE_REPOSITORY?: string;
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

interface SessionResult {
  user: SupabaseUser;
  accessToken: string;
  responseCookies: string[];
}

const COOKIE_ACCESS_TOKEN = "__Host-mm_access";
const COOKIE_REFRESH_TOKEN = "__Host-mm_refresh";
const MAX_ACCESS_COOKIE_AGE_SECONDS = 60 * 60;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const MAX_DISCORD_BODY_BYTES = 64 * 1024;
const DISCORD_SIGNATURE_TOLERANCE_SECONDS = 60 * 5;
const DISCORD_INTERACTION_TYPE_PING = 1;
const DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND = 2;
const DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT = 3;
const DISCORD_RESPONSE_TYPE_PONG = 1;
const DISCORD_RESPONSE_TYPE_CHANNEL_MESSAGE = 4;
const DISCORD_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE = 5;
const DISCORD_EPHEMERAL_FLAG = 1 << 6;
const DISCORD_REPLAY_TTL_SECONDS = 60 * 10;
const GITHUB_FETCH_TIMEOUT_MS = 2500;
const DISCORD_COMMAND_MECCHA = "meccha";
const DISCORD_COMMAND_MECCHA_TASK = "meccha-task";
const DISCORD_SUBCOMMAND_TASK = "task";
const GITHUB_DEFAULT_REPOSITORY = "hozuo0906/meccha-manual";
const GITHUB_MERGE_REQUEST_LABEL = "merge-requested";
const DISCORD_BASE_ISSUE_LABELS = ["from-discord", "needs-triage", "user-request", "status/triage"];
const DISCORD_DANGEROUS_ISSUE_LABELS = ["approval-required", "blocked-from-discord"];
const DANGEROUS_DISCORD_TASK_KEYWORDS = [
  "production",
  "prod",
  "deploy",
  "migration",
  "db migration",
  "stripe",
  "billing",
  "payment",
  "secret",
  "service" + "_role",
  "jwt secret",
  "ai api",
  "\u672c\u756a",
  "\u53cd\u6620",
  "\u30c7\u30d7\u30ed\u30a4",
  "\u30de\u30a4\u30b0\u30ec\u30fc\u30b7\u30e7\u30f3",
  "\u8ab2\u91d1",
  "\u6c7a\u6e08",
  "\u79d8\u5bc6",
  "\u5171\u6709\u30ea\u30f3\u30af"
];
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
    }, { status: error.status }, error.responseCookies);
  }

  return jsonResponse({
    code: "INTERNAL_ERROR",
    message: "予期しないエラーが発生しました。"
  }, { status: 500 });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  const contentType = request.headers.get("content-type") ?? "";
  const mediaType = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
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

function parseCookies(request: Request, tolerateInvalidSessionCookies = false): Map<string, string> {
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
          clearSessionCookies()
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

function requireEnvValue(value: string | undefined, name: string): string {
  if (!value) {
    throw new AppError(500, `${name}_NOT_CONFIGURED`, `${name} is not configured.`);
  }

  return value;
}

function splitCsv(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  );
}

function isAllowedId(value: string | undefined, allowedValues: Set<string>): boolean {
  return Boolean(value && allowedValues.has(value));
}

function allowUnscopedDiscordCommands(env: Env): boolean {
  return env.DISCORD_ALLOW_UNSCOPED_COMMANDS === "true";
}

function requireDiscordInteractionStore(env: Env): KVNamespace {
  if (!env.DISCORD_INTERACTION_STORE) {
    throw new AppError(500, "DISCORD_INTERACTION_STORE_NOT_CONFIGURED", "Discord interaction replay store is not configured.");
  }

  return env.DISCORD_INTERACTION_STORE;
}

function hexToBytes(hex: string): Uint8Array {
  if (!/^[a-f0-9]+$/i.test(hex) || hex.length % 2 !== 0) {
    throw new AppError(401, "DISCORD_SIGNATURE_INVALID", "Discord signature is invalid.");
  }

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < hex.length; index += 2) {
    bytes[index / 2] = Number.parseInt(hex.slice(index, index + 2), 16);
  }

  return bytes;
}

async function verifyDiscordSignature(request: Request, env: Env, bodyText: string): Promise<void> {
  const publicKey = requireEnvValue(env.DISCORD_PUBLIC_KEY, "DISCORD_PUBLIC_KEY");
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");

  if (!signature || !timestamp) {
    throw new AppError(401, "DISCORD_SIGNATURE_REQUIRED", "Discord signature headers are required.");
  }

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) {
    throw new AppError(401, "DISCORD_TIMESTAMP_INVALID", "Discord timestamp is invalid.");
  }

  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > DISCORD_SIGNATURE_TOLERANCE_SECONDS) {
    throw new AppError(401, "DISCORD_TIMESTAMP_EXPIRED", "Discord timestamp is outside the allowed window.");
  }

  const encodedMessage = new TextEncoder().encode(`${timestamp}${bodyText}`);
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    hexToBytes(publicKey),
    "Ed25519",
    false,
    ["verify"]
  );
  const verified = await crypto.subtle.verify(
    "Ed25519",
    cryptoKey,
    hexToBytes(signature),
    encodedMessage
  );

  if (!verified) {
    throw new AppError(401, "DISCORD_SIGNATURE_INVALID", "Discord signature is invalid.");
  }
}

interface DiscordInteraction {
  id?: string;
  application_id?: string;
  token?: string;
  type?: number;
  guild_id?: string;
  channel_id?: string;
  member?: {
    roles?: string[];
    user?: {
      id?: string;
      username?: string;
      global_name?: string | null;
    };
  };
  user?: {
    id?: string;
    username?: string;
    global_name?: string | null;
  };
  data?: {
    name?: string;
    custom_id?: string;
    options?: DiscordCommandOption[];
  };
}

interface DiscordCommandOption {
  name?: string;
  type?: number;
  value?: string | number | boolean;
  options?: DiscordCommandOption[];
}

interface DiscordTaskCommand {
  title: string;
  body: string;
  priority: string;
  requester: {
    id: string | null;
    name: string;
  };
  guildId: string | null;
  channelId: string | null;
  interactionId: string | null;
  dangerous: boolean;
}

interface GitHubPrAction {
  kind: "status" | "merge_request";
  repository: string;
  number: number;
}

interface GitHubPullRequestResponse {
  number: number;
  title?: string;
  html_url?: string;
  state?: string;
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  base?: {
    ref?: string;
  };
  head?: {
    ref?: string;
    sha?: string;
  };
  user?: {
    login?: string;
  };
}

interface GitHubCombinedStatusResponse {
  state?: string;
  total_count?: number;
}

function discordResponse(content: string, status = 200): Response {
  return jsonResponse({
    type: DISCORD_RESPONSE_TYPE_CHANNEL_MESSAGE,
    data: {
      content,
      flags: DISCORD_EPHEMERAL_FLAG
    }
  }, { status });
}

function discordDeferredResponse(): Response {
  return jsonResponse({
    type: DISCORD_RESPONSE_TYPE_DEFERRED_CHANNEL_MESSAGE,
    data: {
      flags: DISCORD_EPHEMERAL_FLAG
    }
  });
}

function assertDiscordAllowed(interaction: DiscordInteraction, env: Env): void {
  const userId = interaction.member?.user?.id ?? interaction.user?.id;
  const roleIds = interaction.member?.roles ?? [];
  const allowedGuildIds = splitCsv(env.DISCORD_ALLOWED_GUILD_IDS);
  const allowedChannelIds = splitCsv(env.DISCORD_ALLOWED_CHANNEL_IDS);
  const allowedUserIds = splitCsv(env.DISCORD_ALLOWED_USER_IDS);
  const allowedRoleIds = splitCsv(env.DISCORD_ALLOWED_ROLE_IDS);
  const unscopedAllowed = allowUnscopedDiscordCommands(env);

  if (!unscopedAllowed && allowedGuildIds.size === 0) {
    throw new AppError(500, "DISCORD_ALLOWED_GUILD_IDS_REQUIRED", "DISCORD_ALLOWED_GUILD_IDS is required.");
  }

  if (!unscopedAllowed && allowedChannelIds.size === 0) {
    throw new AppError(500, "DISCORD_ALLOWED_CHANNEL_IDS_REQUIRED", "DISCORD_ALLOWED_CHANNEL_IDS is required.");
  }

  if (allowedGuildIds.size > 0 && !isAllowedId(interaction.guild_id, allowedGuildIds)) {
    throw new AppError(403, "DISCORD_GUILD_NOT_ALLOWED", "This Discord server is not allowed.");
  }

  if (allowedChannelIds.size > 0 && !isAllowedId(interaction.channel_id, allowedChannelIds)) {
    throw new AppError(403, "DISCORD_CHANNEL_NOT_ALLOWED", "This Discord channel is not allowed.");
  }

  if (allowedUserIds.size > 0 || allowedRoleIds.size > 0) {
    const userAllowed = allowedUserIds.size > 0 && isAllowedId(userId, allowedUserIds);
    const roleAllowed = allowedRoleIds.size > 0 && roleIds.some((roleId) => allowedRoleIds.has(roleId));
    if (!userAllowed && !roleAllowed) {
      throw new AppError(403, "DISCORD_ACTOR_NOT_ALLOWED", "This Discord user or role is not allowed.");
    }
  }
}

function optionText(options: DiscordCommandOption[], name: string): string {
  const option = options.find((item) => item.name === name);
  return typeof option?.value === "string" ? option.value.trim() : "";
}

function taskOptions(interaction: DiscordInteraction): DiscordCommandOption[] {
  const options = interaction.data?.options ?? [];
  const subcommand = options.find((option) => option.name === DISCORD_SUBCOMMAND_TASK);
  return subcommand?.options ?? options;
}

function parseDiscordTaskCommand(interaction: DiscordInteraction): DiscordTaskCommand {
  const commandName = interaction.data?.name;
  if (commandName !== DISCORD_COMMAND_MECCHA && commandName !== DISCORD_COMMAND_MECCHA_TASK) {
    throw new AppError(400, "DISCORD_COMMAND_UNSUPPORTED", "Unsupported Discord command.");
  }

  const options = taskOptions(interaction);
  const title = optionText(options, "title");
  const body = optionText(options, "body") || optionText(options, "request");
  const priority = optionText(options, "priority") || "P2";
  const requesterUser = interaction.member?.user ?? interaction.user;
  const requesterName = requesterUser?.global_name || requesterUser?.username || "unknown";
  const dangerous = hasDangerousDiscordTaskContent(title, body);

  if (!title || title.length > 120) {
    throw new AppError(400, "DISCORD_TASK_TITLE_INVALID", "Task title must be 1-120 characters.");
  }

  if (body.length > 4000) {
    throw new AppError(400, "DISCORD_TASK_BODY_TOO_LONG", "Task body must be 4000 characters or fewer.");
  }

  if (!["P0", "P1", "P2", "P3"].includes(priority)) {
    throw new AppError(400, "DISCORD_TASK_PRIORITY_INVALID", "Priority must be P0, P1, P2, or P3.");
  }

  return {
    title,
    body,
    priority,
    requester: {
      id: requesterUser?.id ?? null,
      name: requesterName
    },
    guildId: interaction.guild_id ?? null,
    channelId: interaction.channel_id ?? null,
    interactionId: interaction.id ?? null,
    dangerous
  };
}

function hasDangerousDiscordTaskContent(title: string, body: string): boolean {
  const normalized = `${title}\n${body}`.toLowerCase();
  return DANGEROUS_DISCORD_TASK_KEYWORDS.some((keyword) => normalized.includes(keyword.toLowerCase()));
}

function githubIssueLabels(command: DiscordTaskCommand): string[] {
  const labels = [...DISCORD_BASE_ISSUE_LABELS, `priority/${command.priority}`];
  return command.dangerous
    ? [...labels, ...DISCORD_DANGEROUS_ISSUE_LABELS]
    : labels;
}

function githubIssueBody(command: DiscordTaskCommand): string {
  return [
    "This issue was created from a Discord slash command.",
    "",
    "## Request",
    "",
    command.body || "_No body provided._",
    "",
    "## Metadata",
    "",
    `- priority: ${command.priority}`,
    `- requester: ${command.requester.name}`,
    `- requester_id: ${command.requester.id ?? "unknown"}`,
    `- guild_id: ${command.guildId ?? "unknown"}`,
    `- channel_id: ${command.channelId ?? "unknown"}`,
    `- interaction_id: ${command.interactionId ?? "unknown"}`,
    `- dangerous_operation_detected: ${command.dangerous ? "yes" : "no"}`,
    "",
    "## Rules",
    "",
    "- Do not paste secrets, tokens, credentials, personal data, or raw customer data into this issue.",
    "- Production deploys, DB migrations, billing, Stripe, AI API, and shared-link changes require explicit owner approval.",
    "- Codex must triage this issue before implementation."
  ].join("\n");
}

async function createGitHubIssue(env: Env, command: DiscordTaskCommand): Promise<string> {
  const token = requireEnvValue(env.GITHUB_ISSUE_TOKEN, "GITHUB_ISSUE_TOKEN");
  const repository = env.GITHUB_ISSUE_REPOSITORY || GITHUB_DEFAULT_REPOSITORY;
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new AppError(500, "GITHUB_ISSUE_REPOSITORY_INVALID", "GITHUB_ISSUE_REPOSITORY must be owner/repo.");
  }

  const createIssue = async (labels: string[]) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);
    const body: { title: string; body: string; labels?: string[] } = {
      title: `[Discord][${command.priority}] ${command.title}`,
      body: githubIssueBody(command)
    };

    if (labels.length > 0) {
      body.labels = labels;
    }

    return fetch(`https://api.github.com/repos/${owner}/${repo}/issues`, {
      method: "POST",
      headers: {
        "accept": "application/vnd.github+json",
        "authorization": `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "meccha-manual-worker",
        "x-github-api-version": "2022-11-28"
      },
      body: JSON.stringify(body),
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));
  };

  const labels = githubIssueLabels(command);
  let response = await createIssue(labels);
  let payload = await response.json().catch(() => null) as { html_url?: string; message?: string } | null;

  if (!response.ok && response.status === 422 && labels.length > 0) {
    response = await createIssue([]);
    payload = await response.json().catch(() => null) as { html_url?: string; message?: string } | null;
  }

  if (!response.ok || !payload?.html_url) {
    throw new AppError(response.status, "GITHUB_ISSUE_CREATE_FAILED", "GitHub issue creation failed.");
  }

  return payload.html_url;
}

function githubRepository(env: Env): { repository: string; owner: string; repo: string } {
  const repository = env.GITHUB_ISSUE_REPOSITORY || GITHUB_DEFAULT_REPOSITORY;
  const [owner, repo] = repository.split("/");

  if (!owner || !repo) {
    throw new AppError(500, "GITHUB_ISSUE_REPOSITORY_INVALID", "GITHUB_ISSUE_REPOSITORY must be owner/repo.");
  }

  return { repository, owner, repo };
}

function githubHeaders(env: Env, requiresWrite = false): HeadersInit {
  const token = requiresWrite
    ? requireEnvValue(env.GITHUB_ISSUE_TOKEN, "GITHUB_ISSUE_TOKEN")
    : env.GITHUB_ISSUE_TOKEN;
  const headers: Record<string, string> = {
    "accept": "application/vnd.github+json",
    "content-type": "application/json",
    "user-agent": "meccha-manual-worker",
    "x-github-api-version": "2022-11-28"
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return headers;
}

async function githubApi<T>(env: Env, path: string, init: RequestInit = {}, requiresWrite = false): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GITHUB_FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      headers: githubHeaders(env, requiresWrite),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as T | { message?: string } | null;

    if (!response.ok) {
      throw new AppError(response.status, "GITHUB_API_FAILED", "GitHub API request failed.");
    }

    return payload as T;
  } finally {
    clearTimeout(timeout);
  }
}

function parseGitHubPrAction(customId: string | undefined): GitHubPrAction {
  const match = customId?.match(/^meccha:pr:(status|merge_request):([^/]+\/[^:]+):(\d+)$/);
  if (!match) {
    throw new AppError(400, "DISCORD_COMPONENT_UNSUPPORTED", "Unsupported Discord button.");
  }

  const number = Number(match[3]);
  if (!Number.isSafeInteger(number) || number < 1) {
    throw new AppError(400, "DISCORD_COMPONENT_PR_INVALID", "Pull request number is invalid.");
  }

  return {
    kind: match[1] === "status" ? "status" : "merge_request",
    repository: match[2],
    number
  };
}

function assertPrRepositoryAllowed(env: Env, action: GitHubPrAction): { owner: string; repo: string } {
  const expected = githubRepository(env);
  if (action.repository !== expected.repository) {
    throw new AppError(403, "GITHUB_PR_REPOSITORY_NOT_ALLOWED", "This pull request repository is not allowed.");
  }

  return {
    owner: expected.owner,
    repo: expected.repo
  };
}

async function fetchGitHubPullRequest(env: Env, action: GitHubPrAction): Promise<GitHubPullRequestResponse> {
  const { owner, repo } = assertPrRepositoryAllowed(env, action);
  return githubApi<GitHubPullRequestResponse>(env, `/repos/${owner}/${repo}/pulls/${action.number}`);
}

async function fetchGitHubCombinedStatus(env: Env, owner: string, repo: string, sha: string | undefined): Promise<GitHubCombinedStatusResponse | null> {
  if (!sha) return null;

  try {
    return await githubApi<GitHubCombinedStatusResponse>(env, `/repos/${owner}/${repo}/commits/${sha}/status`);
  } catch {
    return null;
  }
}

function githubPrStatusText(pr: GitHubPullRequestResponse, status: GitHubCombinedStatusResponse | null): string {
  const mergeableLabel = pr.mergeable === null || pr.mergeable === undefined
    ? "計算中"
    : pr.mergeable ? "可能" : "不可";
  const checkState = status?.state || "未取得";
  const totalChecks = typeof status?.total_count === "number" ? `${status.total_count}件` : "不明";

  return [
    `PR #${pr.number}: ${pr.title || "無題"}`,
    pr.html_url || "",
    "",
    `- 状態: ${pr.state || "不明"}${pr.draft ? " / draft" : ""}${pr.merged ? " / merged" : ""}`,
    `- base: ${pr.base?.ref || "不明"}`,
    `- head: ${pr.head?.ref || "不明"}`,
    `- mergeable: ${mergeableLabel}`,
    `- checks: ${checkState} (${totalChecks})`,
    "",
    pr.merged
      ? "このPRはすでにmerge済みです。"
      : "実mergeはGitHub上の必須check、レビュー、owner承認を確認してから行います。"
  ].filter(Boolean).join("\n");
}

function discordRequester(interaction: DiscordInteraction): { id: string; name: string } {
  const user = interaction.member?.user ?? interaction.user;
  return {
    id: user?.id || "unknown",
    name: user?.global_name || user?.username || "unknown"
  };
}

async function addGitHubPrLabels(env: Env, owner: string, repo: string, number: number, labels: string[]): Promise<boolean> {
  try {
    await githubApi<{ labels?: unknown[] }>(
      env,
      `/repos/${owner}/${repo}/issues/${number}/labels`,
      {
        method: "POST",
        body: JSON.stringify({ labels })
      },
      true
    );
    return true;
  } catch {
    return false;
  }
}

async function createGitHubPrComment(env: Env, owner: string, repo: string, number: number, body: string): Promise<void> {
  await githubApi<{ html_url?: string }>(
    env,
    `/repos/${owner}/${repo}/issues/${number}/comments`,
    {
      method: "POST",
      body: JSON.stringify({ body })
    },
    true
  );
}

async function requestGitHubPrMerge(env: Env, interaction: DiscordInteraction, action: GitHubPrAction, pr: GitHubPullRequestResponse): Promise<string> {
  const { owner, repo } = assertPrRepositoryAllowed(env, action);
  const requester = discordRequester(interaction);
  const labelApplied = await addGitHubPrLabels(env, owner, repo, action.number, [GITHUB_MERGE_REQUEST_LABEL]);
  const commentBody = [
    "Discordからマージ依頼が記録されました。",
    "",
    "## Requester",
    "",
    `- discord_user: ${requester.name}`,
    `- discord_user_id: ${requester.id}`,
    `- guild_id: ${interaction.guild_id ?? "unknown"}`,
    `- channel_id: ${interaction.channel_id ?? "unknown"}`,
    `- interaction_id: ${interaction.id ?? "unknown"}`,
    "",
    "## Rules",
    "",
    "- このコメントはmerge依頼の記録であり、Discordボタンだけではmergeしません。",
    "- GitHub上で必須check、conflict、draft、レビュー、owner承認を確認してからmergeします。"
  ].join("\n");

  await createGitHubPrComment(env, owner, repo, action.number, commentBody);

  return [
    `PR #${pr.number} にマージ依頼を記録しました。`,
    pr.html_url || "",
    labelApplied
      ? `\`${GITHUB_MERGE_REQUEST_LABEL}\` labelを付けました。`
      : `\`${GITHUB_MERGE_REQUEST_LABEL}\` label付与は失敗しましたが、PRコメントは残しました。`,
    "実mergeはGitHub上で確認してから行います。"
  ].filter(Boolean).join("\n");
}

async function processDiscordPrComponent(env: Env, interaction: DiscordInteraction): Promise<void> {
  const action = parseGitHubPrAction(interaction.data?.custom_id);
  const existing = await reserveDiscordInteraction(env, interaction.id ?? null);

  if (existing === "pending") {
    await updateDiscordOriginalResponseSafe(interaction, "This Discord request is already being processed.");
    return;
  }

  if (existing && existing !== "failed") {
    await updateDiscordOriginalResponseSafe(interaction, existing);
    return;
  }

  try {
    const pr = await fetchGitHubPullRequest(env, action);

    if (action.kind === "status") {
      const { owner, repo } = assertPrRepositoryAllowed(env, action);
      const status = await fetchGitHubCombinedStatus(env, owner, repo, pr.head?.sha);
      const message = githubPrStatusText(pr, status);
      await completeDiscordInteraction(env, interaction.id ?? null, message);
      await updateDiscordOriginalResponse(interaction, message);
      return;
    }

    const message = await requestGitHubPrMerge(env, interaction, action, pr);
    await completeDiscordInteraction(env, interaction.id ?? null, message);
    await updateDiscordOriginalResponse(interaction, message);
  } catch (error) {
    await completeDiscordInteraction(env, interaction.id ?? null, "failed");
    throw error;
  }
}

async function readDiscordBody(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_DISCORD_BODY_BYTES) {
    throw new AppError(413, "DISCORD_BODY_TOO_LARGE", "Discord request body is too large.");
  }

  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > MAX_DISCORD_BODY_BYTES) {
    throw new AppError(413, "DISCORD_BODY_TOO_LARGE", "Discord request body is too large.");
  }

  return text;
}

function interactionReplayKey(interactionId: string): string {
  return `discord-interaction:${interactionId}`;
}

async function reserveDiscordInteraction(env: Env, interactionId: string | null): Promise<string | null> {
  if (!interactionId) return null;

  const store = requireDiscordInteractionStore(env);
  const key = interactionReplayKey(interactionId);
  const existing = await store.get(key);
  if (existing) return existing;

  await store.put(key, "pending", { expirationTtl: DISCORD_REPLAY_TTL_SECONDS });
  return null;
}

async function completeDiscordInteraction(env: Env, interactionId: string | null, value: string): Promise<void> {
  if (!interactionId) return;

  const store = requireDiscordInteractionStore(env);
  await store.put(interactionReplayKey(interactionId), value, { expirationTtl: DISCORD_REPLAY_TTL_SECONDS });
}

async function updateDiscordOriginalResponse(interaction: DiscordInteraction, content: string): Promise<void> {
  if (!interaction.application_id || !interaction.token) {
    throw new AppError(500, "DISCORD_FOLLOWUP_CONTEXT_MISSING", "Discord followup context is missing.");
  }

  const response = await fetch(
    `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({ content })
    }
  );

  if (!response.ok) {
    throw new AppError(response.status, "DISCORD_FOLLOWUP_FAILED", "Discord followup failed.");
  }
}

async function processDiscordTask(env: Env, interaction: DiscordInteraction, command: DiscordTaskCommand): Promise<void> {
  try {
    const issueUrl = await createGitHubIssue(env, command);
    await completeDiscordInteraction(env, command.interactionId, issueUrl);
    await updateDiscordOriginalResponse(interaction, `GitHub Issue created: ${issueUrl}`);
  } catch {
    await completeDiscordInteraction(env, command.interactionId, "failed");
    await updateDiscordOriginalResponse(interaction, "Failed to create GitHub Issue. Check Worker logs.");
  }
}

async function updateDiscordOriginalResponseSafe(interaction: DiscordInteraction, content: string): Promise<void> {
  try {
    await updateDiscordOriginalResponse(interaction, content);
  } catch {
    // Discord followup failures should not make the initial interaction timeout.
  }
}

async function processDiscordInteraction(env: Env, interaction: DiscordInteraction): Promise<void> {
  try {
    assertDiscordAllowed(interaction, env);

    if (interaction.type === DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT) {
      await processDiscordPrComponent(env, interaction);
      return;
    }

    const command = parseDiscordTaskCommand(interaction);
    const existing = await reserveDiscordInteraction(env, command.interactionId);

    if (existing === "pending") {
      await updateDiscordOriginalResponseSafe(interaction, "This Discord request is already being processed.");
      return;
    }

    if (existing && existing !== "failed") {
      await updateDiscordOriginalResponseSafe(interaction, `GitHub Issue already exists: ${existing}`);
      return;
    }

    await processDiscordTask(env, interaction, command);
  } catch (error) {
    const message = error instanceof AppError && error.status < 500
      ? error.message
      : "Failed to process Discord request. Check Worker logs.";
    await updateDiscordOriginalResponseSafe(interaction, message);
  }
}

async function discordInteractions(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  if (request.method !== "POST") {
    return jsonResponse({ code: "METHOD_NOT_ALLOWED" }, { status: 405 });
  }

  const bodyText = await readDiscordBody(request);
  await verifyDiscordSignature(request, env, bodyText);

  let interaction: DiscordInteraction;
  try {
    interaction = JSON.parse(bodyText) as DiscordInteraction;
  } catch {
    return discordResponse("Invalid Discord request body.", 400);
  }
  if (interaction.type === DISCORD_INTERACTION_TYPE_PING) {
    return jsonResponse({ type: DISCORD_RESPONSE_TYPE_PONG });
  }

  if (
    interaction.type !== DISCORD_INTERACTION_TYPE_APPLICATION_COMMAND &&
    interaction.type !== DISCORD_INTERACTION_TYPE_MESSAGE_COMPONENT
  ) {
    return discordResponse("Unsupported Discord interaction type.", 400);
  }

  if (!ctx) {
    await processDiscordInteraction(env, interaction);
    return discordResponse("Discord request processing finished.");
  }

  ctx.waitUntil(processDiscordInteraction(env, interaction));
  return discordDeferredResponse();
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
  cookies = parseCookies(request),
  allowRefresh = false
): Promise<SessionResult> {
  const accessToken = cookies.get(COOKIE_ACCESS_TOKEN);
  const refreshToken = cookies.get(COOKIE_REFRESH_TOKEN);

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
    clearSessionCookies()
  );
}

async function refreshAuthentication(request: Request, env: Env): Promise<Response> {
  await readJsonBody<Record<string, never>>(request);
  const cookies = parseCookies(request);
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

function logoutRevokeFailureResponse(): Response {
  return jsonResponse({
    code: "LOGOUT_REVOKE_FAILED",
    message: "この端末のログイン情報は削除しましたが、認証サーバー側のログアウトを確認できませんでした。もう一度ログインしてからログアウトしてください。"
  }, { status: 502 }, clearSessionCookies());
}

function configHealth(env: Env): Response {
  const hasUrl = Boolean(env.SUPABASE_URL);
  const hasAnonKey = Boolean(env.SUPABASE_ANON_KEY);
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
        configured: hasUrl && hasAnonKey,
        hasUrl,
        hasAnonKey,
        projectRef: getSupabaseProjectRef(env.SUPABASE_URL)
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

async function route(request: Request, env: Env, ctx?: ExecutionContext): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/v1/integrations/discord/interactions") {
    return discordInteractions(request, env, ctx);
  }

  verifySameOriginWrite(request);

  if (request.method === "GET" && url.pathname === "/") return htmlResponse(APP_HTML);
  if (request.method === "GET" && url.pathname === "/assets/app.css") return assetResponse(APP_CSS, "text/css; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/assets/app.js") return assetResponse(APP_JS, "application/javascript; charset=utf-8");
  if (request.method === "GET" && url.pathname === "/health") return basicHealth();
  if (request.method === "GET" && url.pathname === "/health/config") return configHealth(env);
  if (request.method === "GET" && url.pathname === "/api/session") return getSession(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/refresh") return refreshAuthentication(request, env);
  if (request.method === "POST" && url.pathname === "/api/auth/logout") return logout(request, env);
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
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      return await route(request, env, ctx);
    } catch (error) {
      return errorResponse(error);
    }
  }
} satisfies ExportedHandler<Env>;
