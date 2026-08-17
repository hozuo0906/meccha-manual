import {
  suggestManualInstruction,
  type ManualActionType
} from "./domain/manual/instruction-template.ts";
import {
  ManualError,
  UUID_PATTERN,
  MAX_MANUAL_TITLE_LENGTH,
  assertWorkspaceMember,
  booleanRpc,
  cancelUnreadResponseBody,
  canonicalUuidSegment,
  errorResponse,
  jsonResponse,
  readJsonLimited,
  readRequestJson,
  requireSession,
  supabaseFetch,
  verifySameOriginWrite,
  type ManualEnv
} from "./manual-router.ts";

type ManualStatus = "draft" | "reviewing" | "published" | "stale" | "archived";
type RevisionState = "draft" | "published" | "superseded";
type ManualStepType = "action" | "note" | "decision" | "warning";

type ManualContext = {
  id: string;
  workspaceId: string;
  title: string;
  status: ManualStatus;
  currentDraftRevisionId: string | null;
  currentPublishedRevisionId: string | null;
  updatedAt: string;
};

type DraftSummary = {
  id: string;
  revisionNo: number;
  title: string;
  description: string;
  updatedAt: string;
};

type ManualStep = {
  id: string;
  workspaceId: string;
  revisionId: string;
  position: number;
  type: ManualStepType;
  title: string;
  instruction: string;
  actionType: ManualActionType | null;
  targetText: string | null;
  url: string | null;
  assetId: string | null;
  annotation: Record<string, unknown>;
  masking: Record<string, unknown>;
  updatedAt: string;
};

type ManualSession = {
  userId: string;
  accessToken: string;
};

const MAX_MANUAL_DETAIL_JSON_BYTES = 8 * 1024 * 1024;
const MAX_MANUAL_STEPS = 200;
const MAX_MANUAL_DESCRIPTION_LENGTH = 10_000;
const MAX_STEP_TITLE_LENGTH = 128;
const MAX_STEP_INSTRUCTION_LENGTH = 4_000;
const MAX_STEP_TARGET_TEXT_LENGTH = 256;
const MAX_STEP_URL_LENGTH = 2_048;
const MANUAL_STATUSES = new Set<ManualStatus>(["draft", "reviewing", "published", "stale", "archived"]);
const REVISION_STATES = new Set<RevisionState>(["draft", "published", "superseded"]);
const STEP_TYPES = new Set<ManualStepType>(["action", "note", "decision", "warning"]);
const ACTION_TYPES = new Set<ManualActionType>(["click", "input", "select", "navigate", "wait", "other"]);
const LABEL_CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const TEXT_CONTROL_PATTERN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;
const URL_SERIALIZED_SAFE_ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:/?#[]@!$&()*+,;=._~%-";

function codePointLength(value: string): number {
  return Array.from(value).length;
}

function serializedUrlBudgetLength(value: string): number {
  const encoder = new TextEncoder();
  let length = 0;
  let component: "url" | "query" | "fragment" = "url";
  for (const character of value) {
    if (character === "#") {
      component = "fragment";
    } else if (character === "?" && component === "url") {
      component = "query";
    }
    const bytes = encoder.encode(character).byteLength;
    const isSerializedAsOne = URL_SERIALIZED_SAFE_ASCII.includes(character)
      || (character === "'" && component !== "query");
    length += bytes === 1 && isSerializedAsOne ? 1 : bytes * 3;
  }
  return length;
}

function canonicalUuidValue(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const canonical = value.toLowerCase();
  return UUID_PATTERN.test(canonical) ? canonical : null;
}

function requireTimestamp(value: unknown): string | null {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) return null;
  return value;
}

function requiredExpectedDraftUpdatedAt(body: Record<string, unknown>): string {
  const expectedUpdatedAt = requireTimestamp(body.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    throw new ManualError(400, "MANUAL_DRAFT_VERSION_INVALID", "基本情報を再読み込みしてから保存してください。");
  }
  return expectedUpdatedAt;
}

function requiredExpectedStepUpdatedAt(body: Record<string, unknown>): string {
  const expectedUpdatedAt = requireTimestamp(body.expectedUpdatedAt);
  if (!expectedUpdatedAt) {
    throw new ManualError(400, "MANUAL_STEP_VERSION_INVALID", "手順を再読み込みしてから保存してください。");
  }
  return expectedUpdatedAt;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertAllowedKeys(body: Record<string, unknown>, allowed: readonly string[]): void {
  const allowedSet = new Set(allowed);
  const unexpected = Object.keys(body).filter((key) => !allowedSet.has(key));
  if (unexpected.length > 0) {
    throw new ManualError(400, "MANUAL_EDIT_FIELD_UNEXPECTED", `利用できない入力項目があります: ${unexpected.join(", ")}`);
  }
}

function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

function requiredLabel(value: unknown, fieldName: string, maxLength: number, code: string): string {
  if (typeof value !== "string") {
    throw new ManualError(400, code, `${fieldName}を入力してください。`);
  }
  const normalized = value.trim();
  if (!normalized || codePointLength(normalized) > maxLength || LABEL_CONTROL_PATTERN.test(normalized)) {
    throw new ManualError(400, code, `${fieldName}は${maxLength}文字以内の文字で入力してください。`);
  }
  return normalized;
}

function optionalDescription(value: unknown): string {
  if (typeof value !== "string") {
    throw new ManualError(400, "MANUAL_DESCRIPTION_INVALID", "説明は文字で入力してください。");
  }
  if (codePointLength(value) > MAX_MANUAL_DESCRIPTION_LENGTH || TEXT_CONTROL_PATTERN.test(value)) {
    throw new ManualError(400, "MANUAL_DESCRIPTION_INVALID", `説明は${MAX_MANUAL_DESCRIPTION_LENGTH}文字以内で入力してください。`);
  }
  return value;
}

function optionalInstruction(value: unknown): string {
  if (typeof value !== "string") {
    throw new ManualError(400, "MANUAL_STEP_INSTRUCTION_INVALID", "手順文は文字で入力してください。");
  }
  if (codePointLength(value) > MAX_STEP_INSTRUCTION_LENGTH || TEXT_CONTROL_PATTERN.test(value)) {
    throw new ManualError(400, "MANUAL_STEP_INSTRUCTION_INVALID", `手順文は${MAX_STEP_INSTRUCTION_LENGTH}文字以内で入力してください。`);
  }
  return value;
}

function optionalTargetText(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ManualError(400, "MANUAL_STEP_TARGET_INVALID", "操作対象は文字で入力してください。");
  }
  const normalized = value.trim().replace(/\s+/gu, " ");
  if (!normalized || codePointLength(normalized) > MAX_STEP_TARGET_TEXT_LENGTH || LABEL_CONTROL_PATTERN.test(normalized)) {
    throw new ManualError(400, "MANUAL_STEP_TARGET_INVALID", `操作対象は${MAX_STEP_TARGET_TEXT_LENGTH}文字以内で入力してください。`);
  }
  return normalized;
}

function optionalUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", "URLを確認してください。");
  }
  if (codePointLength(value) > MAX_STEP_URL_LENGTH) {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", `URLは${MAX_STEP_URL_LENGTH}文字以内で入力してください。`);
  }
  if (serializedUrlBudgetLength(value) > MAX_STEP_URL_LENGTH) {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", `URLは正規化後も${MAX_STEP_URL_LENGTH}文字以内で入力してください。`);
  }
  if (/[\s\u0000-\u001f\u007f]/u.test(value) || value.includes("\\")) {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", "URLを確認してください。");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", "URLを確認してください。");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", "URLを確認してください。");
  }
  if (!parsed.hostname.startsWith("[") && parsed.hostname.toLowerCase().split(".").some((label) => label.startsWith("xn--"))) {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", "URLを確認してください。");
  }
  const canonical = parsed.toString();
  if (codePointLength(canonical) > MAX_STEP_URL_LENGTH) {
    throw new ManualError(400, "MANUAL_STEP_URL_INVALID", `URLは${MAX_STEP_URL_LENGTH}文字以内で入力してください。`);
  }
  return canonical;
}

function stepType(value: unknown, fallback?: ManualStepType): ManualStepType {
  if (value === undefined && fallback) return fallback;
  if (typeof value !== "string" || !STEP_TYPES.has(value as ManualStepType)) {
    throw new ManualError(400, "MANUAL_STEP_TYPE_INVALID", "手順の種類を確認してください。");
  }
  return value as ManualStepType;
}

function actionType(value: unknown, fallback?: ManualActionType | null): ManualActionType | null {
  if (value === undefined) return fallback ?? null;
  if (value === null || value === "") return null;
  if (typeof value !== "string" || !ACTION_TYPES.has(value as ManualActionType)) {
    throw new ManualError(400, "MANUAL_STEP_ACTION_INVALID", "操作の種類を確認してください。");
  }
  return value as ManualActionType;
}

async function fetchArray(
  env: ManualEnv,
  accessToken: string,
  path: string,
  fetchCode: string,
  invalidCode: string,
  message: string,
  maxBytes = 512 * 1024,
  init: RequestInit = { method: "GET" }
): Promise<{ response: Response; rows: unknown[] }> {
  let response: Response;
  try {
    response = await supabaseFetch(env, path, accessToken, init);
  } catch {
    throw new ManualError(502, fetchCode, message);
  }
  if (response.status === 401) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
  }
  if (!response.ok) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(502, fetchCode, message);
  }
  let payload: unknown;
  try {
    payload = await readJsonLimited(response, maxBytes);
  } catch {
    throw new ManualError(502, invalidCode, message);
  }
  if (!Array.isArray(payload)) {
    throw new ManualError(502, invalidCode, message);
  }
  return { response, rows: payload };
}

function parseManualContext(value: unknown, workspaceId: string, manualId: string): ManualContext | null {
  if (!isPlainObject(value)) return null;
  const id = canonicalUuidValue(value.id);
  const rowWorkspaceId = canonicalUuidValue(value.workspace_id);
  const draftId = value.current_draft_revision_id === null ? null : canonicalUuidValue(value.current_draft_revision_id);
  const publishedId = value.current_published_revision_id === null ? null : canonicalUuidValue(value.current_published_revision_id);
  const updatedAt = requireTimestamp(value.updated_at);
  if (
    id !== manualId || rowWorkspaceId !== workspaceId ||
    typeof value.title !== "string" || !value.title.trim() || codePointLength(value.title) > MAX_MANUAL_TITLE_LENGTH ||
    typeof value.status !== "string" || !MANUAL_STATUSES.has(value.status as ManualStatus) ||
    (value.current_draft_revision_id !== null && !draftId) ||
    (value.current_published_revision_id !== null && !publishedId) ||
    !updatedAt
  ) return null;
  return {
    id,
    workspaceId: rowWorkspaceId,
    title: value.title,
    status: value.status as ManualStatus,
    currentDraftRevisionId: draftId,
    currentPublishedRevisionId: publishedId,
    updatedAt
  };
}

async function fetchManualContext(
  env: ManualEnv,
  accessToken: string,
  workspaceId: string,
  manualId: string
): Promise<ManualContext> {
  const query = [
    "/rest/v1/manuals?select=id,workspace_id,title,status,current_draft_revision_id,current_published_revision_id,updated_at",
    `workspace_id=eq.${encodeURIComponent(workspaceId)}`,
    `id=eq.${encodeURIComponent(manualId)}`,
    "archived_at=is.null",
    "limit=2"
  ].join("&");
  const { rows } = await fetchArray(
    env,
    accessToken,
    query,
    "MANUAL_DETAIL_FETCH_FAILED",
    "MANUAL_DETAIL_RESPONSE_INVALID",
    "手順書を確認できませんでした。時間をおいて、もう一度お試しください。"
  );
  if (rows.length === 0) {
    throw new ManualError(404, "MANUAL_NOT_FOUND", "指定された手順書が見つかりません。");
  }
  if (rows.length !== 1) {
    throw new ManualError(502, "MANUAL_DETAIL_RESPONSE_INVALID", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const manual = parseManualContext(rows[0], workspaceId, manualId);
  if (!manual) {
    throw new ManualError(502, "MANUAL_DETAIL_RESPONSE_INVALID", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  return manual;
}

function parseDraft(value: unknown, workspaceId: string, manualId: string, draftId: string): DraftSummary | null {
  if (!isPlainObject(value)) return null;
  const id = canonicalUuidValue(value.id);
  const rowWorkspaceId = canonicalUuidValue(value.workspace_id);
  const rowManualId = canonicalUuidValue(value.manual_id);
  const updatedAt = requireTimestamp(value.updated_at);
  if (
    id !== draftId || rowWorkspaceId !== workspaceId || rowManualId !== manualId ||
    typeof value.revision_no !== "number" || !Number.isSafeInteger(value.revision_no) || value.revision_no < 1 ||
    typeof value.state !== "string" || !REVISION_STATES.has(value.state as RevisionState) || value.state !== "draft" ||
    typeof value.title !== "string" || !value.title.trim() || codePointLength(value.title) > MAX_MANUAL_TITLE_LENGTH ||
    typeof value.description !== "string" || codePointLength(value.description) > MAX_MANUAL_DESCRIPTION_LENGTH ||
    !updatedAt
  ) return null;
  return {
    id,
    revisionNo: value.revision_no,
    title: value.title,
    description: value.description,
    updatedAt
  };
}

function parseStep(
  value: unknown,
  workspaceId: string,
  draftId: string,
  requireInternalFields = false
): ManualStep | null {
  if (!isPlainObject(value)) return null;
  const id = canonicalUuidValue(value.id);
  const rowWorkspaceId = canonicalUuidValue(value.workspace_id);
  const revisionId = canonicalUuidValue(value.revision_id);
  const assetId = value.asset_id === undefined || value.asset_id === null ? null : canonicalUuidValue(value.asset_id);
  const annotation = value.annotation === undefined ? {} : value.annotation;
  const masking = value.masking === undefined ? {} : value.masking;
  const updatedAt = requireTimestamp(value.updated_at);
  if (
    !id || rowWorkspaceId !== workspaceId || revisionId !== draftId ||
    typeof value.position !== "number" || !Number.isSafeInteger(value.position) || value.position < 0 ||
    typeof value.type !== "string" || !STEP_TYPES.has(value.type as ManualStepType) ||
    typeof value.title !== "string" || !value.title.trim() || codePointLength(value.title) > MAX_STEP_TITLE_LENGTH ||
    typeof value.instruction !== "string" || codePointLength(value.instruction) > MAX_STEP_INSTRUCTION_LENGTH ||
    (value.action_type !== null && (typeof value.action_type !== "string" || !ACTION_TYPES.has(value.action_type as ManualActionType))) ||
    (value.target_text !== null && (typeof value.target_text !== "string" || codePointLength(value.target_text) > MAX_STEP_TARGET_TEXT_LENGTH)) ||
    (value.url !== null && (typeof value.url !== "string" || codePointLength(value.url) > MAX_STEP_URL_LENGTH)) ||
    (value.asset_id !== undefined && value.asset_id !== null && !assetId) ||
    !isPlainObject(annotation) || !isPlainObject(masking) ||
    (requireInternalFields && (value.asset_id === undefined || value.annotation === undefined || value.masking === undefined)) ||
    !updatedAt
  ) return null;
  return {
    id,
    workspaceId: rowWorkspaceId,
    revisionId,
    position: value.position,
    type: value.type as ManualStepType,
    title: value.title,
    instruction: value.instruction,
    actionType: value.action_type as ManualActionType | null,
    targetText: value.target_text as string | null,
    url: value.url as string | null,
    assetId,
    annotation,
    masking,
    updatedAt
  };
}

async function fetchManualDetailSnapshot(
  env: ManualEnv,
  accessToken: string,
  workspaceId: string,
  manualId: string
): Promise<{ manual: ManualContext; draft: DraftSummary | null; steps: ManualStep[]; canEdit: boolean }> {
  let response: Response;
  try {
    response = await supabaseFetch(env, "/rest/v1/rpc/get_manual_edit_detail", accessToken, {
      method: "POST",
      body: JSON.stringify({ target_workspace_id: workspaceId, target_manual_id: manualId })
    });
  } catch {
    throw new ManualError(502, "MANUAL_DETAIL_FETCH_FAILED", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  if (response.status === 401) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
  }
  if (!response.ok) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(502, "MANUAL_DETAIL_FETCH_FAILED", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  let payload: unknown;
  try {
    payload = await readJsonLimited(response, MAX_MANUAL_DETAIL_JSON_BYTES);
  } catch {
    throw new ManualError(502, "MANUAL_DETAIL_RESPONSE_INVALID", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  if (payload === null) {
    throw new ManualError(404, "MANUAL_NOT_FOUND", "指定された手順書が見つかりません。");
  }
  if (!isPlainObject(payload) || !isPlainObject(payload.manual) || !Array.isArray(payload.steps) || typeof payload.can_edit !== "boolean") {
    throw new ManualError(502, "MANUAL_DETAIL_RESPONSE_INVALID", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const manual = parseManualContext(payload.manual, workspaceId, manualId);
  if (!manual) {
    throw new ManualError(502, "MANUAL_DETAIL_RESPONSE_INVALID", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  if (!manual.currentDraftRevisionId) {
    if (payload.draft !== null || payload.steps.length !== 0) {
      throw new ManualError(502, "MANUAL_DETAIL_RESPONSE_INVALID", "手順書を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
    return { manual, draft: null, steps: [], canEdit: payload.can_edit };
  }
  if (payload.steps.length > MAX_MANUAL_STEPS) {
    throw new ManualError(409, "MANUAL_STEPS_LIMIT_EXCEEDED", "手順が多いため編集画面を表示できません。手順を整理してください。");
  }
  const draft = parseDraft(payload.draft, workspaceId, manualId, manual.currentDraftRevisionId);
  if (!draft) {
    throw new ManualError(502, "MANUAL_DETAIL_RESPONSE_INVALID", "手順書の下書きを確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const steps = payload.steps.map((row) => parseStep(row, workspaceId, manual.currentDraftRevisionId!));
  if (steps.some((step) => step === null)) {
    throw new ManualError(502, "MANUAL_STEPS_RESPONSE_INVALID", "手順を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const typed = steps as ManualStep[];
  for (let index = 1; index < typed.length; index += 1) {
    const current = typed[index];
    const previous = typed[index - 1];
    if (!current || !previous || current.position <= previous.position) {
      throw new ManualError(502, "MANUAL_STEPS_RESPONSE_INVALID", "手順を確認できませんでした。時間をおいて、もう一度お試しください。");
    }
  }
  return { manual, draft, steps: typed, canEdit: payload.can_edit };
}

async function fetchActiveStep(
  env: ManualEnv,
  accessToken: string,
  workspaceId: string,
  draftId: string,
  stepId: string
): Promise<ManualStep> {
  const query = [
    "/rest/v1/manual_steps?select=id,workspace_id,revision_id,position,type,title,instruction,action_type,target_text,url,asset_id,annotation,masking,updated_at",
    `workspace_id=eq.${encodeURIComponent(workspaceId)}`,
    `revision_id=eq.${encodeURIComponent(draftId)}`,
    `id=eq.${encodeURIComponent(stepId)}`,
    "deleted_at=is.null",
    "limit=2"
  ].join("&");
  const { rows } = await fetchArray(
    env,
    accessToken,
    query,
    "MANUAL_STEP_FETCH_FAILED",
    "MANUAL_STEP_RESPONSE_INVALID",
    "手順を確認できませんでした。時間をおいて、もう一度お試しください。"
  );
  if (rows.length === 0) {
    throw new ManualError(404, "MANUAL_STEP_NOT_FOUND", "指定された手順が見つかりません。");
  }
  if (rows.length !== 1) {
    throw new ManualError(502, "MANUAL_STEP_RESPONSE_INVALID", "手順を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  const step = parseStep(rows[0], workspaceId, draftId, true);
  if (!step || step.id !== stepId) {
    throw new ManualError(502, "MANUAL_STEP_RESPONSE_INVALID", "手順を確認できませんでした。時間をおいて、もう一度お試しください。");
  }
  return step;
}

async function canEditWorkspace(env: ManualEnv, session: ManualSession, workspaceId: string): Promise<boolean> {
  return booleanRpc(
    env,
    session.accessToken,
    "has_workspace_role",
    {
      target_workspace_id: workspaceId,
      target_user_id: session.userId,
      allowed_roles: ["owner", "admin", "editor"]
    },
    "MANUAL_EDIT_ACCESS_CHECK_FAILED",
    "手順書の編集権限を確認できませんでした。時間をおいて、もう一度お試しください。"
  );
}

async function authorizedMemberSession(
  request: Request,
  env: ManualEnv,
  workspaceId: string
): Promise<ManualSession> {
  const session = await requireSession(request, env);
  await assertWorkspaceMember(env, session.accessToken, session.userId, workspaceId);
  return session;
}

async function authorizedSession(
  request: Request,
  env: ManualEnv,
  workspaceId: string,
  requireEditor: boolean
): Promise<{ session: ManualSession; canEdit: boolean }> {
  const session = await authorizedMemberSession(request, env, workspaceId);
  const canEdit = await canEditWorkspace(env, session, workspaceId);
  if (requireEditor && !canEdit) {
    throw new ManualError(403, "MANUAL_EDIT_FORBIDDEN", "手順書を編集する権限がありません。管理者に確認してください。");
  }
  return { session, canEdit };
}

function requireDraftId(manual: ManualContext): string {
  if (!manual.currentDraftRevisionId) {
    throw new ManualError(409, "MANUAL_DRAFT_UNAVAILABLE", "編集できる下書きがありません。下書きを作成してから、もう一度お試しください。");
  }
  return manual.currentDraftRevisionId;
}

async function upstreamMessage(response: Response): Promise<string> {
  try {
    const payload = await readJsonLimited(response);
    if (isPlainObject(payload) && typeof payload.message === "string") return payload.message;
  } catch {
    // A malformed 4xx body remains an upstream service error.
  }
  return "";
}

function knownRpcError(message: string): ManualError | null {
  if (message.includes("workspace editor role required")) {
    return new ManualError(403, "MANUAL_EDIT_FORBIDDEN", "手順書を編集する権限がありません。管理者に確認してください。");
  }
  if (message.includes("manual not found")) {
    return new ManualError(404, "MANUAL_NOT_FOUND", "指定された手順書が見つかりません。");
  }
  if (message.includes("draft revision not found") || message.includes("current draft revision")) {
    return new ManualError(409, "MANUAL_DRAFT_UNAVAILABLE", "編集できる下書きがありません。詳細を再読み込みしてください。");
  }
  if (message.includes("manual draft changed concurrently")) {
    return new ManualError(409, "MANUAL_DRAFT_EDIT_CONFLICT", "別の更新が先に保存されました。基本情報を再読み込みして、変更内容を確認してください。");
  }
  if (message.includes("manual step changed concurrently")) {
    return new ManualError(409, "MANUAL_STEP_EDIT_CONFLICT", "別の更新が先に保存されました。詳細を再読み込みして、変更内容を確認してください。");
  }
  if (message.includes("active manual step not found")) {
    return new ManualError(404, "MANUAL_STEP_NOT_FOUND", "指定された手順が見つかりません。");
  }
  if (message.includes("manual step limit exceeded")) {
    return new ManualError(409, "MANUAL_STEPS_LIMIT_EXCEEDED", "手順は200件まで追加できます。不要な手順を整理してください。");
  }
  if (message.includes("manual step url is invalid")) {
    return new ManualError(400, "MANUAL_STEP_URL_INVALID", "URLを確認してください。");
  }
  if (message.includes("ordered step ids")) {
    return new ManualError(400, "MANUAL_STEP_ORDER_INVALID", "手順の並び順を確認してください。");
  }
  if (message.includes("violates check constraint") || message.includes("value too long")) {
    return new ManualError(400, "MANUAL_EDIT_INPUT_INVALID", "入力内容を確認してください。");
  }
  return null;
}

async function callMutationRpc(
  env: ManualEnv,
  accessToken: string,
  functionName: string,
  body: Record<string, unknown>,
  expectation: "uuid" | "void",
  unknownCode: string,
  unknownMessage: string,
  unavailableCode: string
): Promise<string | null> {
  let response: Response;
  try {
    response = await supabaseFetch(env, `/rest/v1/rpc/${functionName}`, accessToken, {
      method: "POST",
      body: JSON.stringify(body)
    });
  } catch {
    throw new ManualError(502, unknownCode, unknownMessage);
  }
  if (response.status === 401) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");
  }
  if (response.status >= 500) {
    await cancelUnreadResponseBody(response);
    throw new ManualError(502, unknownCode, unknownMessage);
  }
  if (!response.ok) {
    const message = await upstreamMessage(response);
    const known = knownRpcError(message);
    if (known) throw known;
    throw new ManualError(502, unavailableCode, "手順書編集サービスを利用できません。時間をおいて、もう一度お試しください。");
  }
  let payload: unknown;
  try {
    payload = await readJsonLimited(response);
  } catch {
    throw new ManualError(502, unknownCode, unknownMessage);
  }
  if (expectation === "void") {
    if (payload !== null) throw new ManualError(502, unknownCode, unknownMessage);
    return null;
  }
  const resultId = canonicalUuidValue(payload);
  if (!resultId) throw new ManualError(502, unknownCode, unknownMessage);
  return resultId;
}

function publicStep(step: ManualStep): Omit<ManualStep, "workspaceId" | "revisionId" | "assetId" | "annotation" | "masking"> {
  return {
    id: step.id,
    position: step.position,
    type: step.type,
    title: step.title,
    instruction: step.instruction,
    actionType: step.actionType,
    targetText: step.targetText,
    url: step.url,
    updatedAt: step.updatedAt
  };
}

async function getManualDetail(
  request: Request,
  env: ManualEnv,
  workspaceId: string,
  manualId: string
): Promise<Response> {
  const session = await authorizedMemberSession(request, env, workspaceId);
  const { manual, draft, steps, canEdit } = await fetchManualDetailSnapshot(env, session.accessToken, workspaceId, manualId);
  return jsonResponse({
    manual: {
      id: manual.id,
      title: manual.title,
      status: manual.status,
      currentDraftRevisionId: manual.currentDraftRevisionId,
      currentPublishedRevisionId: manual.currentPublishedRevisionId,
      updatedAt: manual.updatedAt
    },
    draft,
    steps: steps.map(publicStep),
    permissions: { canEdit }
  });
}

async function updateDraft(
  request: Request,
  env: ManualEnv,
  workspaceId: string,
  manualId: string
): Promise<Response> {
  verifySameOriginWrite(request);
  const { session } = await authorizedSession(request, env, workspaceId, true);
  const manual = await fetchManualContext(env, session.accessToken, workspaceId, manualId);
  const expectedDraftId = requireDraftId(manual);
  const body = await readRequestJson(request);
  assertAllowedKeys(body, ["title", "description", "expectedUpdatedAt"]);
  if (!hasOwn(body, "title") || !hasOwn(body, "description") || !hasOwn(body, "expectedUpdatedAt")) {
    throw new ManualError(400, "MANUAL_DRAFT_INPUT_REQUIRED", "タイトル、説明、表示中の更新日時を送信してください。");
  }
  const title = requiredLabel(body.title, "手順書タイトル", MAX_MANUAL_TITLE_LENGTH, "MANUAL_TITLE_INVALID");
  const description = optionalDescription(body.description);
  const expectedUpdatedAt = requiredExpectedDraftUpdatedAt(body);
  const draftId = await callMutationRpc(
    env,
    session.accessToken,
    "update_manual_draft",
    {
      target_manual_id: manualId,
      expected_draft_revision_id: expectedDraftId,
      expected_draft_updated_at: expectedUpdatedAt,
      draft_title: title,
      draft_description: description
    },
    "uuid",
    "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN",
    "保存結果を確認できませんでした。重ねて保存せず、詳細を再読み込みしてください。",
    "MANUAL_DRAFT_UPDATE_UNAVAILABLE"
  );
  if (draftId !== expectedDraftId) {
    throw new ManualError(502, "MANUAL_DRAFT_UPDATE_RESULT_UNKNOWN", "保存結果を確認できませんでした。重ねて保存せず、詳細を再読み込みしてください。");
  }
  return jsonResponse({ draftId });
}

function createStepInput(body: Record<string, unknown>): {
  type: ManualStepType;
  title: string;
  instruction: string;
  actionType: ManualActionType | null;
  targetText: string | null;
  url: string | null;
} {
  assertAllowedKeys(body, ["type", "title", "instruction", "actionType", "targetText", "url"]);
  const type = stepType(body.type ?? "action");
  const title = requiredLabel(body.title, "手順タイトル", MAX_STEP_TITLE_LENGTH, "MANUAL_STEP_TITLE_INVALID");
  const nextActionType = actionType(body.actionType);
  const targetText = optionalTargetText(body.targetText);
  const url = optionalUrl(body.url);
  if (type !== "action" && (nextActionType !== null || targetText !== null)) {
    throw new ManualError(400, "MANUAL_STEP_ACTION_INVALID", "操作以外の手順には操作種類と操作対象を設定できません。");
  }
  const instruction = hasOwn(body, "instruction")
    ? optionalInstruction(body.instruction)
    : type === "action" && nextActionType
      ? suggestManualInstruction({ targetText, actionType: nextActionType }) ?? ""
      : "";
  return {
    type,
    title,
    instruction,
    actionType: type === "action" ? nextActionType : null,
    targetText: type === "action" ? targetText : null,
    url
  };
}

async function createStep(
  request: Request,
  env: ManualEnv,
  workspaceId: string,
  manualId: string
): Promise<Response> {
  verifySameOriginWrite(request);
  const { session } = await authorizedSession(request, env, workspaceId, true);
  const manual = await fetchManualContext(env, session.accessToken, workspaceId, manualId);
  const draftId = requireDraftId(manual);
  const input = createStepInput(await readRequestJson(request));
  const stepId = await callMutationRpc(
    env,
    session.accessToken,
    "append_manual_step",
    {
      target_revision_id: draftId,
      step_type: input.type,
      step_title: input.title,
      step_instruction: input.instruction,
      step_action_type: input.actionType,
      step_target_text: input.targetText,
      step_url: input.url,
      step_asset_id: null,
      step_annotation: {},
      step_masking: {}
    },
    "uuid",
    "MANUAL_STEP_CREATE_RESULT_UNKNOWN",
    "追加結果を確認できませんでした。重ねて追加せず、詳細を再読み込みしてください。",
    "MANUAL_STEP_CREATE_UNAVAILABLE"
  );
  return jsonResponse({ stepId }, 201);
}

function patchStepInput(body: Record<string, unknown>, existing: ManualStep): ManualStep {
  assertAllowedKeys(body, ["type", "title", "instruction", "actionType", "targetText", "url", "expectedUpdatedAt"]);
  const patchKeys = Object.keys(body).filter((key) => key !== "expectedUpdatedAt");
  if (patchKeys.length === 0) {
    throw new ManualError(400, "MANUAL_STEP_PATCH_REQUIRED", "変更内容を入力してください。");
  }
  const type = stepType(body.type, existing.type);
  const title = hasOwn(body, "title")
    ? requiredLabel(body.title, "手順タイトル", MAX_STEP_TITLE_LENGTH, "MANUAL_STEP_TITLE_INVALID")
    : existing.title;
  const instruction = hasOwn(body, "instruction") ? optionalInstruction(body.instruction) : existing.instruction;
  const nextActionType = actionType(body.actionType, existing.actionType);
  const targetText = hasOwn(body, "targetText") ? optionalTargetText(body.targetText) : existing.targetText;
  const url = hasOwn(body, "url") ? optionalUrl(body.url) : existing.url;
  if (type !== "action" && (nextActionType !== null || targetText !== null)) {
    throw new ManualError(400, "MANUAL_STEP_ACTION_INVALID", "操作以外の手順には操作種類と操作対象を設定できません。");
  }
  return {
    ...existing,
    type,
    title,
    instruction,
    actionType: type === "action" ? nextActionType : null,
    targetText: type === "action" ? targetText : null,
    url
  };
}

async function updateStep(
  request: Request,
  env: ManualEnv,
  workspaceId: string,
  manualId: string,
  stepId: string
): Promise<Response> {
  verifySameOriginWrite(request);
  const { session } = await authorizedSession(request, env, workspaceId, true);
  const manual = await fetchManualContext(env, session.accessToken, workspaceId, manualId);
  const draftId = requireDraftId(manual);
  const body = await readRequestJson(request);
  const expectedUpdatedAt = requiredExpectedStepUpdatedAt(body);
  const existing = await fetchActiveStep(env, session.accessToken, workspaceId, draftId, stepId);
  const next = patchStepInput(body, existing);
  await callMutationRpc(
    env,
    session.accessToken,
    "update_manual_step",
    {
      target_revision_id: draftId,
      target_step_id: stepId,
      expected_step_updated_at: expectedUpdatedAt,
      step_type: next.type,
      step_title: next.title,
      step_instruction: next.instruction,
      step_action_type: next.actionType,
      step_target_text: next.targetText,
      step_url: next.url,
      step_asset_id: null,
      step_annotation: {},
      step_masking: {}
    },
    "void",
    "MANUAL_STEP_UPDATE_RESULT_UNKNOWN",
    "保存結果を確認できませんでした。重ねて保存せず、詳細を再読み込みしてください。",
    "MANUAL_STEP_UPDATE_UNAVAILABLE"
  );
  return jsonResponse({ stepId });
}

async function deleteStep(
  request: Request,
  env: ManualEnv,
  workspaceId: string,
  manualId: string,
  stepId: string
): Promise<Response> {
  verifySameOriginWrite(request);
  const { session } = await authorizedSession(request, env, workspaceId, true);
  const manual = await fetchManualContext(env, session.accessToken, workspaceId, manualId);
  const draftId = requireDraftId(manual);
  await callMutationRpc(
    env,
    session.accessToken,
    "soft_delete_manual_step",
    { target_revision_id: draftId, target_step_id: stepId },
    "void",
    "MANUAL_STEP_DELETE_RESULT_UNKNOWN",
    "削除結果を確認できませんでした。重ねて削除せず、詳細を再読み込みしてください。",
    "MANUAL_STEP_DELETE_UNAVAILABLE"
  );
  return jsonResponse({ stepId, deleted: true });
}

async function reorderSteps(
  request: Request,
  env: ManualEnv,
  workspaceId: string,
  manualId: string
): Promise<Response> {
  verifySameOriginWrite(request);
  const { session } = await authorizedSession(request, env, workspaceId, true);
  const manual = await fetchManualContext(env, session.accessToken, workspaceId, manualId);
  const draftId = requireDraftId(manual);
  const body = await readRequestJson(request);
  assertAllowedKeys(body, ["orderedStepIds"]);
  if (!Array.isArray(body.orderedStepIds) || body.orderedStepIds.length > MAX_MANUAL_STEPS) {
    throw new ManualError(400, "MANUAL_STEP_ORDER_INVALID", "手順の並び順を確認してください。");
  }
  const orderedStepIds = body.orderedStepIds.map(canonicalUuidValue);
  if (orderedStepIds.some((id) => id === null)) {
    throw new ManualError(400, "MANUAL_STEP_ORDER_INVALID", "手順の並び順を確認してください。");
  }
  const ids = orderedStepIds as string[];
  if (new Set(ids).size !== ids.length) {
    throw new ManualError(400, "MANUAL_STEP_ORDER_INVALID", "同じ手順を複数回指定できません。");
  }
  await callMutationRpc(
    env,
    session.accessToken,
    "reorder_manual_steps",
    { target_revision_id: draftId, ordered_step_ids: ids },
    "void",
    "MANUAL_STEP_REORDER_RESULT_UNKNOWN",
    "並べ替え結果を確認できませんでした。重ねて並べ替えず、詳細を再読み込みしてください。",
    "MANUAL_STEP_REORDER_UNAVAILABLE"
  );
  return jsonResponse({ reordered: true });
}

function routeIds(workspaceSegment: string, manualSegment: string, stepSegment?: string): {
  workspaceId: string;
  manualId: string;
  stepId: string | null;
} {
  const workspaceId = canonicalUuidSegment(workspaceSegment);
  const manualId = canonicalUuidSegment(manualSegment);
  const stepId = stepSegment === undefined ? null : canonicalUuidSegment(stepSegment);
  if (!workspaceId || !manualId || (stepSegment !== undefined && !stepId)) {
    throw new ManualError(404, "MANUAL_NOT_FOUND", "指定された手順書が見つかりません。");
  }
  return { workspaceId, manualId, stepId };
}

export async function handleManualEditRoute(request: Request, env: ManualEnv): Promise<Response | null> {
  const pathname = new URL(request.url).pathname;
  const reorderMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/manuals\/([^/]+)\/steps\/reorder$/);
  const draftMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/manuals\/([^/]+)\/draft$/);
  const stepsMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/manuals\/([^/]+)\/steps$/);
  const stepMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/manuals\/([^/]+)\/steps\/([^/]+)$/);
  const detailMatch = pathname.match(/^\/api\/workspaces\/([^/]+)\/manuals\/([^/]+)$/);
  if (!reorderMatch && !draftMatch && !stepsMatch && !stepMatch && !detailMatch) return null;

  try {
    if (reorderMatch) {
      const ids = routeIds(reorderMatch[1] ?? "", reorderMatch[2] ?? "");
      if (request.method === "POST") return await reorderSteps(request, env, ids.workspaceId, ids.manualId);
    } else if (draftMatch) {
      const ids = routeIds(draftMatch[1] ?? "", draftMatch[2] ?? "");
      if (request.method === "PATCH") return await updateDraft(request, env, ids.workspaceId, ids.manualId);
    } else if (stepsMatch) {
      const ids = routeIds(stepsMatch[1] ?? "", stepsMatch[2] ?? "");
      if (request.method === "POST") return await createStep(request, env, ids.workspaceId, ids.manualId);
    } else if (stepMatch) {
      const ids = routeIds(stepMatch[1] ?? "", stepMatch[2] ?? "", stepMatch[3] ?? "");
      if (request.method === "PATCH") return await updateStep(request, env, ids.workspaceId, ids.manualId, ids.stepId as string);
      if (request.method === "DELETE") return await deleteStep(request, env, ids.workspaceId, ids.manualId, ids.stepId as string);
    } else if (detailMatch) {
      const ids = routeIds(detailMatch[1] ?? "", detailMatch[2] ?? "");
      if (request.method === "GET") return await getManualDetail(request, env, ids.workspaceId, ids.manualId);
    }
    return jsonResponse({ code: "METHOD_NOT_ALLOWED", message: "この操作は利用できません。" }, 405);
  } catch (error) {
    return errorResponse(error);
  }
}

export type { DraftSummary, ManualContext, ManualStep };
