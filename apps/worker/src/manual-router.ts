import { inspectSupabaseConfig, type SupabaseBindings } from "./server-config.ts";

interface ManualEnv extends SupabaseBindings {}

type ManualStatus = "draft" | "reviewing" | "published" | "stale" | "archived";

type ManualRow = {
  id: string;
  workspace_id: string;
  folder_id: string | null;
  title: string;
  status: ManualStatus;
  current_draft_revision_id: string | null;
  current_published_revision_id: string | null;
  updated_at: string;
};

type ManualSummary = {
  id: string;
  folderId: string | null;
  title: string;
  status: ManualStatus;
  currentDraftRevisionId: string | null;
  currentPublishedRevisionId: string | null;
  updatedAt: string;
};

const COOKIE_ACCESS_TOKEN = "__Host-mm_access";
const COOKIE_REFRESH_TOKEN = "__Host-mm_refresh";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON_BODY_BYTES = 16 * 1024;
const MAX_SUPABASE_JSON_BYTES = 512 * 1024;
const MAX_MANUAL_LIST_ITEMS = 1000;
const MAX_MANUAL_TITLE_LENGTH = 64;
const SUPABASE_TIMEOUT_MS = 5000;
const MANUAL_STATUSES = new Set<ManualStatus>(["draft", "reviewing", "published", "stale", "archived"]);

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin"
};

class ManualError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string
  ) {
    super(message);
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS
  });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ManualError) {
    return jsonResponse({ code: error.code, message: error.message }, error.status);
  }
  return jsonResponse({ code: "INTERNAL_ERROR", message: "予期しないエラーが発生しました。" }, 500);
}

function ensureConfig(env: ManualEnv): { url: string; anonKey: string } {
  const config = inspectSupabaseConfig(env).config;
  if (!config) {
    throw new ManualError(500, "SUPABASE_NOT_CONFIGURED", "Supabase設定が未完了です。");
  }
  return config;
}

function parseCookies(request: Request): Map<string, string> {
  const cookies = new Map<string, string>();
  for (const part of (request.headers.get("cookie") ?? "").split(";")) {
    const [name, ...valueParts] = part.trim().split("=");
    if (!name || valueParts.length === 0) continue;
    try {
      cookies.set(name, decodeURIComponent(valueParts.join("=")));
    } catch {
      if (name === COOKIE_ACCESS_TOKEN || name === COOKIE_REFRESH_TOKEN) {
        throw new ManualError(401, "SESSION_INVALID", "ログイン状態を確認できません。もう一度ログインしてください。");
      }
    }
  }
  return cookies;
}

function verifySameOriginWrite(request: Request): void {
  if (request.method !== "POST") return;
  const origin = request.headers.get("origin");
  if (!origin) throw new ManualError(403, "ORIGIN_REQUIRED", "不正なリクエストです。");
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    throw new ManualError(403, "ORIGIN_INVALID", "不正なリクエストです。");
  }
  if (parsed.origin !== new URL(request.url).origin) {
    throw new ManualError(403, "ORIGIN_MISMATCH", "不正なリクエストです。");
  }
}

async function readTextLimited(response: Response, maxBytes: number): Promise<string> {
  const contentLength = response.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) throw new Error("response too large");
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("response too large").catch(() => undefined);
        throw new Error("response too large");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readJsonLimited(response: Response): Promise<unknown> {
  const text = await readTextLimited(response, MAX_SUPABASE_JSON_BYTES);
  if (!text) return null;
  return JSON.parse(text);
}

async function readRequestTextLimited(request: Request): Promise<string> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    throw new ManualError(413, "JSON_BODY_TOO_LARGE", "リクエストが大きすぎます。");
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_JSON_BODY_BYTES) {
        await reader.cancel("body too large").catch(() => undefined);
        throw new ManualError(413, "JSON_BODY_TOO_LARGE", "リクエストが大きすぎます。");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function readRequestJson(request: Request): Promise<Record<string, unknown>> {
  const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") {
    throw new ManualError(415, "JSON_CONTENT_TYPE_REQUIRED", "Content-Typeはapplication/jsonにしてください。");
  }

  const text = await readRequestTextLimited(request);
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new ManualError(400, "INVALID_JSON", "JSONの形式が正しくありません。");
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ManualError(400, "JSON_OBJECT_REQUIRED", "JSONはオブジェクト形式にしてください。");
  }
  return value as Record<string, unknown>;
}

async function supabaseFetch(
  env: ManualEnv,
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const config = ensureConfig(env);
  const headers = new Headers(init.headers);
  headers.set("apikey", config.anonKey);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const controller = new AbortController();
  if (init.signal) {
    if (init.signal.aborted) controller.abort(init.signal.reason);
    else init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason), { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("Supabase response deadline exceeded")), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(`${config.url}${path}`, {
      ...init,
      headers,
      signal: controller.signal
    });
    if (!response.body) {
      clearTimeout(timer);
      return response;
    }

    const reader = response.body.getReader();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reader.releaseLock();
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const result = await reader.read();
          if (result.done) {
            finish();
            streamController.close();
            return;
          }
          streamController.enqueue(result.value);
        } catch (error) {
          finish();
          streamController.error(error);
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          finish();
        }
      }
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

async function cancelUnreadResponseBody(response: Response): Promise<void> {
  if (!response.body) return;
  try {
    await response.body.cancel("response body not consumed");
  } catch {
    // The response is already terminating; cancellation is best effort.
  }
}

async function requireSession(request: Request, env: ManualEnv): Promise<{ userId: string; accessToken: string }> {
  const cookies = parseCookies(request);
  const accessToken = cookies.get(COOKIE_ACCESS_TOKEN);
  const refreshToken = cookies.get(COOKIE_REFRESH_TOKEN);

  if (!accessToken) {
    if (refreshToken) throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
    throw new ManualError(401, "SESSION_REQUIRED", "ログインしてください。");
  }

  let response: Response;
  try {
    response = await supabaseFetch(env, "/auth/v1/user", accessToken, { method: "GET" });
  } catch {
    throw new ManualError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
  }

  if (response.status === 401) {
    await cancelUnreadResponseBody(response);
    if (refreshToken) throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
    throw new ManualError(401, "SESSION_EXPIRED", "セッションの有効期限が切れました。もう一度ログインしてください。");
  }
  if (!response.ok) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
  }

  let payload: unknown;
  try {
    payload = await readJsonLimited(response);
  } catch {
    throw new ManualError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const userId = payload && typeof payload === "object" && "id" in payload ? String(payload.id) : "";
  if (!UUID_PATTERN.test(userId)) {
    throw new ManualError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  return { userId, accessToken };
}

async function booleanRpc(
  env: ManualEnv,
  accessToken: string,
  functionName: string,
  body: Record<string, unknown>,
  failureCode: string,
  failureMessage: string
): Promise<boolean> {
  let response: Response;
  try {
    response = await supabaseFetch(env, `/rest/v1/rpc/${functionName}`, accessToken, {
      method: "POST",
      body: JSON.stringify(body)
    });
  } catch {
    throw new ManualError(502, failureCode, failureMessage);
  }
  if (response.status === 401) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
  }
  if (!response.ok) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(502, failureCode, failureMessage);
  }
  try {
    const payload = await readJsonLimited(response);
    if (typeof payload !== "boolean") throw new Error("invalid boolean rpc response");
    return payload;
  } catch {
    throw new ManualError(502, failureCode, failureMessage);
  }
}

async function assertWorkspaceMember(
  env: ManualEnv,
  accessToken: string,
  userId: string,
  workspaceId: string
): Promise<void> {
  const isMember = await booleanRpc(
    env,
    accessToken,
    "is_workspace_member",
    { target_workspace_id: workspaceId, target_user_id: userId },
    "MANUALS_ACCESS_CHECK_FAILED",
    "手順書の利用権限を確認できませんでした。時間をおいて、もう一度お試しください。"
  );
  if (!isMember) {
    throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");
  }
}

async function assertWorkspaceEditor(
  env: ManualEnv,
  accessToken: string,
  userId: string,
  workspaceId: string
): Promise<void> {
  const canEdit = await booleanRpc(
    env,
    accessToken,
    "has_workspace_role",
    {
      target_workspace_id: workspaceId,
      target_user_id: userId,
      allowed_roles: ["owner", "admin", "editor"]
    },
    "MANUAL_CREATE_ACCESS_CHECK_FAILED",
    "手順書の作成権限を確認できませんでした。時間をおいて、もう一度お試しください。"
  );
  if (!canEdit) {
    throw new ManualError(403, "MANUAL_CREATE_FORBIDDEN", "手順書を作成する権限がありません。管理者に確認してください。");
  }
}

function parseManualRow(value: unknown, workspaceId: string): ManualSummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<ManualRow>;
  if (
    typeof row.id !== "string" || !UUID_PATTERN.test(row.id) ||
    row.workspace_id !== workspaceId ||
    (row.folder_id !== null && (typeof row.folder_id !== "string" || !UUID_PATTERN.test(row.folder_id))) ||
    typeof row.title !== "string" || row.title.trim().length === 0 || Array.from(row.title).length > MAX_MANUAL_TITLE_LENGTH ||
    typeof row.status !== "string" || !MANUAL_STATUSES.has(row.status as ManualStatus) ||
    (row.current_draft_revision_id !== null && (typeof row.current_draft_revision_id !== "string" || !UUID_PATTERN.test(row.current_draft_revision_id))) ||
    (row.current_published_revision_id !== null && (typeof row.current_published_revision_id !== "string" || !UUID_PATTERN.test(row.current_published_revision_id))) ||
    typeof row.updated_at !== "string" || Number.isNaN(Date.parse(row.updated_at))
  ) return null;

  return {
    id: row.id,
    folderId: row.folder_id,
    title: row.title,
    status: row.status as ManualStatus,
    currentDraftRevisionId: row.current_draft_revision_id,
    currentPublishedRevisionId: row.current_published_revision_id,
    updatedAt: row.updated_at
  };
}

function validateExactCount(response: Response, itemCount: number): void {
  const contentRange = response.headers.get("content-range") ?? "";
  const populated = contentRange.match(/^(\d+)-(\d+)\/(\d+)$/);
  const empty = contentRange.match(/^\*\/(\d+)$/);
  const total = populated ? Number(populated[3]) : empty ? Number(empty[1]) : null;

  if (total !== null && Number.isSafeInteger(total) && total > MAX_MANUAL_LIST_ITEMS) {
    throw new ManualError(409, "MANUALS_LIMIT_EXCEEDED", "手順書が多いため一覧を表示できません。整理してから、もう一度お試しください。");
  }
  if (itemCount > MAX_MANUAL_LIST_ITEMS) {
    throw new ManualError(409, "MANUALS_LIMIT_EXCEEDED", "手順書が多いため一覧を表示できません。整理してから、もう一度お試しください。");
  }

  const valid = itemCount === 0
    ? Boolean(empty && total === 0)
    : Boolean(
        populated &&
        Number(populated[1]) === 0 &&
        Number(populated[2]) - Number(populated[1]) + 1 === itemCount &&
        total === itemCount
      );
  if (!valid || total === null || !Number.isSafeInteger(total)) {
    throw new ManualError(502, "MANUALS_RESPONSE_INVALID", "手順書一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
}

async function listManuals(request: Request, env: ManualEnv, workspaceId: string): Promise<Response> {
  const session = await requireSession(request, env);
  await assertWorkspaceMember(env, session.accessToken, session.userId, workspaceId);

  const query = [
    "/rest/v1/manuals?select=id,workspace_id,folder_id,title,status,current_draft_revision_id,current_published_revision_id,updated_at",
    `workspace_id=eq.${encodeURIComponent(workspaceId)}`,
    "archived_at=is.null",
    "order=updated_at.desc",
    `limit=${MAX_MANUAL_LIST_ITEMS + 1}`
  ].join("&");

  let response: Response;
  try {
    response = await supabaseFetch(env, query, session.accessToken, {
      method: "GET",
      headers: { prefer: "count=exact" }
    });
  } catch {
    throw new ManualError(502, "MANUALS_FETCH_FAILED", "手順書を取得できませんでした。時間をおいて、もう一度お試しください。");
  }
  if (response.status === 401) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
  }
  if (!response.ok) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(502, "MANUALS_FETCH_FAILED", "手順書を取得できませんでした。時間をおいて、もう一度お試しください。");
  }

  let payload: unknown;
  try {
    payload = await readJsonLimited(response);
  } catch {
    throw new ManualError(502, "MANUALS_RESPONSE_INVALID", "手順書一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  if (!Array.isArray(payload)) {
    throw new ManualError(502, "MANUALS_RESPONSE_INVALID", "手順書一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  validateExactCount(response, payload.length);

  const manuals = payload.map((row) => parseManualRow(row, workspaceId));
  if (manuals.some((manual) => manual === null)) {
    throw new ManualError(502, "MANUALS_RESPONSE_INVALID", "手順書一覧を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  return jsonResponse({ manuals });
}

async function createManual(request: Request, env: ManualEnv, workspaceId: string): Promise<Response> {
  verifySameOriginWrite(request);
  const session = await requireSession(request, env);
  await assertWorkspaceMember(env, session.accessToken, session.userId, workspaceId);
  await assertWorkspaceEditor(env, session.accessToken, session.userId, workspaceId);

  const body = await readRequestJson(request);
  if (typeof body.title !== "string") {
    throw new ManualError(400, "MANUAL_TITLE_REQUIRED", "手順書タイトルを入力してください。");
  }
  const title = body.title.trim();
  if (!title) throw new ManualError(400, "MANUAL_TITLE_REQUIRED", "手順書タイトルを入力してください。");
  if (Array.from(title).length > MAX_MANUAL_TITLE_LENGTH) {
    throw new ManualError(400, "MANUAL_TITLE_INVALID", "手順書タイトルは64文字以内で入力してください。");
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    throw new ManualError(400, "MANUAL_DESCRIPTION_INVALID", "説明は文字で入力してください。");
  }
  const description = typeof body.description === "string" ? body.description : "";
  const folderId = body.folderId === undefined || body.folderId === null ? null : String(body.folderId);
  if (folderId !== null && !UUID_PATTERN.test(folderId)) {
    throw new ManualError(400, "MANUAL_FOLDER_INVALID", "フォルダーを確認してください。");
  }

  let response: Response;
  try {
    response = await supabaseFetch(env, "/rest/v1/rpc/create_manual", session.accessToken, {
      method: "POST",
      body: JSON.stringify({
        target_workspace_id: workspaceId,
        target_folder_id: folderId,
        manual_title: title,
        manual_description: description
      })
    });
  } catch {
    throw new ManualError(502, "MANUAL_CREATE_RESULT_UNKNOWN", "作成結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
  }
  if (response.status === 401) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
  }
  if (!response.ok) {
    if (response.status >= 500) {
      await cancelUnreadResponseBody(response);
      throw new ManualError(502, "MANUAL_CREATE_RESULT_UNKNOWN", "作成結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
    }
    let message = "";
    try {
      const errorPayload = await readJsonLimited(response);
      if (errorPayload && typeof errorPayload === "object" && "message" in errorPayload) message = String(errorPayload.message);
    } catch {
      // Unknown upstream errors are not reclassified as safe input failures.
    }
    if (message.includes("folder not found in workspace")) {
      throw new ManualError(400, "MANUAL_FOLDER_INVALID", "フォルダーを確認してください。");
    }
    throw new ManualError(502, "MANUAL_CREATE_SERVICE_UNAVAILABLE", "手順書作成サービスを利用できません。入力を変えず、時間をおいて確認してください。");
  }

  let manualId: unknown;
  try {
    manualId = await readJsonLimited(response);
  } catch {
    throw new ManualError(502, "MANUAL_CREATE_RESULT_UNKNOWN", "作成結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
  }
  if (typeof manualId !== "string" || !UUID_PATTERN.test(manualId)) {
    throw new ManualError(502, "MANUAL_CREATE_RESULT_UNKNOWN", "作成結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");
  }
  return jsonResponse({ manualId }, 201);
}

export async function handleManualRoute(request: Request, env: ManualEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/workspaces\/([^/]+)\/manuals$/);
  if (!match?.[1]) return null;

  try {
    let workspaceId: string;
    try {
      workspaceId = decodeURIComponent(match[1]);
    } catch {
      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");
    }
    if (!UUID_PATTERN.test(workspaceId)) {
      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");
    }
    if (request.method === "GET") return await listManuals(request, env, workspaceId);
    if (request.method === "POST") return await createManual(request, env, workspaceId);
    return jsonResponse({ code: "METHOD_NOT_ALLOWED", message: "この操作は利用できません。" }, 405);
  } catch (error) {
    return errorResponse(error);
  }
}

export type { ManualEnv, ManualSummary };
