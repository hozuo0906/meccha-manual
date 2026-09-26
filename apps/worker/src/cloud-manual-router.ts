import { AccessIdentityError, authenticateApplicationRequest, type ApplicationIdentityRepository } from "./access-identity.ts";
import { D1IdentityRepository } from "./infra/d1/identity-repository.ts";
import { D1RepositoryError } from "./infra/d1/d1-errors.ts";
import type { D1DatabaseLike } from "./infra/d1/d1-types.ts";
import { inspectAppRuntimeConfig } from "./server-config.ts";
import {
  CloudManualRepository,
  type ClaimIntentRecord,
  type ClaimStepInput,
  type ClaimAssetInput,
  type ManualDetailRecord,
  type ManualStepMutationInput
} from "./infra/d1/cloud-manual-repository.ts";
import type { AccessBindings, AppRuntimeBindings } from "./server-config.ts";

export interface CloudManualEnv extends AccessBindings, AppRuntimeBindings {
  DB?: D1DatabaseLike;
  MANUAL_ASSETS?: R2Bucket;
}

class CloudManualError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "same-origin"
};
const MAX_JSON_BYTES = 2 * 1024 * 1024;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const MAX_ASSETS = 100;
const MAX_STEPS = 200;
const CLAIM_INTENT_TTL_MS = 15 * 60 * 1000;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const STEP_TYPES = new Set(["action", "note", "decision", "warning"]);
const ACTION_TYPES = new Set(["click", "input", "select", "navigate", "wait", "other"]);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const OPERATION_PATTERN = /^[A-Za-z0-9_-]{16,128}$/u;
const CONTROL_PATTERN = /[\u0000-\u001f\u007f]/u;
const URL_SERIALIZED_SAFE_ASCII = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789:/?#[]@!$&()*+,;=._~%-";
const MAX_STEP_URL_LENGTH = 2048;
const MANUAL_MIGRATION_CODE = "MANUAL_MIGRATION_IN_PROGRESS";

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const merged = new Headers(JSON_HEADERS);
  new Headers(headers).forEach((value, key) => merged.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: merged });
}

function errorResponse(error: unknown): Response {
  if (error instanceof CloudManualError) return json({ code: error.code, message: error.message }, error.status);
  if (error instanceof AccessIdentityError) return json({ code: error.code, message: "認証を確認できませんでした。" }, error.status);
  if (error instanceof D1RepositoryError) {
    const mapped: [number, string] = error.code === "conflict" ? [409, "VERSION_CONFLICT"] : error.code === "not_found" ? [404, "MANUAL_NOT_FOUND"] : error.code === "forbidden" || error.code === "actor_forbidden" ? [403, "ACCESS_FORBIDDEN"] : error.code === "limit_exceeded" ? [413, "LIMIT_EXCEEDED"] : [503, "D1_UNAVAILABLE"];
    return json({ code: mapped[1], message: "データ操作を完了できませんでした。時間をおいて、もう一度お試しください。" }, mapped[0]);
  }
  return json({ code: "CLOUD_MANUAL_UNAVAILABLE", message: "手順書を保存できませんでした。時間をおいて、もう一度お試しください。" }, 503);
}

function ensureDb(env: CloudManualEnv): D1DatabaseLike {
  if (!env.DB) throw new CloudManualError(503, "D1_UNAVAILABLE", "保存先を利用できません。下書きは保持したまま、もう一度お試しください。");
  return env.DB;
}

function identityRepository(db: D1DatabaseLike): ApplicationIdentityRepository { return new D1IdentityRepository(db); }

async function auth(request: Request, env: CloudManualEnv): Promise<{ actorId: string; repository: CloudManualRepository }> {
  const db = ensureDb(env);
  let result;
  try {
    result = await authenticateApplicationRequest(request, env, identityRepository(db));
  } catch (error) {
    if (error instanceof AccessIdentityError) throw error;
    throw new CloudManualError(503, "ACCESS_IDENTITY_UNAVAILABLE", "認証を確認できません。時間をおいて、もう一度お試しください。");
  }
  if (result.kind !== "application_user") throw new CloudManualError(403, "ACCESS_FORBIDDEN", "この操作を行う権限がありません。");
  return { actorId: result.identity.applicationId, repository: new CloudManualRepository(db) };
}

function assertSameOrigin(request: Request, env: CloudManualEnv): void {
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(request.method)) return;
  const origin = request.headers.get("origin");
  if (!origin) throw new CloudManualError(403, "ORIGIN_REQUIRED", "同一サイトからの操作だけ受け付けます。");
  try {
    const configured = inspectAppRuntimeConfig(env).config;
    if (!configured || new URL(origin).origin !== configured.baseUrl || new URL(request.url).origin !== configured.baseUrl) throw new CloudManualError(403, "ORIGIN_MISMATCH", "同一サイトからの操作だけを受け付けます。");
    if (new URL(origin).origin !== new URL(request.url).origin) throw new CloudManualError(403, "ORIGIN_MISMATCH", "同一サイトからの操作だけ受け付けます。");
  } catch (error) {
    if (error instanceof CloudManualError) throw error;
    throw new CloudManualError(403, "ORIGIN_INVALID", "同一サイトからの操作だけ受け付けます。");
  }
}

async function readBoundedText(request: Request): Promise<string> {
  if (!request.body) throw new CloudManualError(400, "JSON_BODY_REQUIRED", "JSON本文を指定してください。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_JSON_BYTES) { await reader.cancel("json too large").catch(() => undefined); throw new CloudManualError(413, "JSON_BODY_TOO_LARGE", "入力が大きすぎます。"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  const mediaType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase();
  if (mediaType !== "application/json") throw new CloudManualError(415, "JSON_CONTENT_TYPE_REQUIRED", "Content-Typeはapplication/jsonにしてください。");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_JSON_BYTES) throw new CloudManualError(413, "JSON_BODY_TOO_LARGE", "入力が大きすぎます。");
  const text = await readBoundedText(request);
  if (new TextEncoder().encode(text).byteLength > MAX_JSON_BYTES) throw new CloudManualError(413, "JSON_BODY_TOO_LARGE", "入力が大きすぎます。");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new CloudManualError(400, "INVALID_JSON", "JSONの形式が正しくありません。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new CloudManualError(400, "JSON_OBJECT_REQUIRED", "JSONオブジェクトを指定してください。");
  return value as Record<string, unknown>;
}

function exactKeys(body: Record<string, unknown>, keys: readonly string[]): void {
  if (Object.keys(body).some((key) => !keys.includes(key))) throw new CloudManualError(400, "INPUT_INVALID", "指定できない項目が含まれています。");
}

function stringField(value: unknown, max: number, code: string, required = true): string {
  if (typeof value !== "string" || (required && value.trim().length === 0) || Array.from(value).length > max || CONTROL_PATTERN.test(value)) throw new CloudManualError(400, code, "入力内容を確認してください。");
  return required ? value.trim() : value;
}

function textField(value: unknown, max: number, code: string, required = true): string {
  if (typeof value !== "string" || (required && value.trim().length === 0) || Array.from(value).length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) throw new CloudManualError(400, code, "入力内容を確認してください。");
  return required ? value.trim() : value;
}

function operationField(value: unknown): string {
  if (typeof value !== "string" || !OPERATION_PATTERN.test(value)) throw new CloudManualError(400, "OPERATION_ID_INVALID", "操作IDを確認してください。");
  return value;
}

function uuid(value: string, code = "RESOURCE_ID_INVALID"): string {
  if (!UUID_PATTERN.test(value)) throw new CloudManualError(400, code, "識別子を確認してください。");
  return value.toLowerCase();
}

function sha(value: unknown): string {
  if (typeof value !== "string" || !SHA256_PATTERN.test(value)) throw new CloudManualError(400, "SHA256_INVALID", "画像の検証情報を確認してください。");
  return value;
}

function serializedUrlBudgetLength(value: string): number {
  const encoder = new TextEncoder();
  let length = 0;
  let component: "url" | "query" | "fragment" = "url";
  for (const character of value) {
    if (character === "#") component = "fragment";
    else if (character === "?" && component === "url") component = "query";
    const bytes = encoder.encode(character).byteLength;
    const isSerializedAsOne = URL_SERIALIZED_SAFE_ASCII.includes(character)
      || (character === "'" && component !== "query");
    length += bytes === 1 && isSerializedAsOne ? 1 : bytes * 3;
  }
  return length;
}

function stepUrl(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new CloudManualError(400, "STEP_URL_INVALID", "URLを確認してください。");
  if (Array.from(value).length > MAX_STEP_URL_LENGTH || serializedUrlBudgetLength(value) > MAX_STEP_URL_LENGTH) {
    throw new CloudManualError(400, "STEP_URL_INVALID", "URLは正規化後も2048文字以内で入力してください。");
  }
  if (/[\s\u0000-\u001f\u007f]/u.test(value) || value.includes("\\")) {
    throw new CloudManualError(400, "STEP_URL_INVALID", "URLを確認してください。");
  }
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new CloudManualError(400, "STEP_URL_INVALID", "URLを確認してください。"); }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new CloudManualError(400, "STEP_URL_INVALID", "URLを確認してください。");
  }
  if (!parsed.hostname.startsWith("[") && parsed.hostname.toLowerCase().split(".").some((label) => label.startsWith("xn--"))) {
    throw new CloudManualError(400, "STEP_URL_INVALID", "URLを確認してください。");
  }
  const canonical = parsed.toString();
  if (Array.from(canonical).length > MAX_STEP_URL_LENGTH) {
    throw new CloudManualError(400, "STEP_URL_INVALID", "URLは正規化後も2048文字以内で入力してください。");
  }
  return canonical;
}

function requireManualAssets(env: CloudManualEnv): asserts env is CloudManualEnv & { MANUAL_ASSETS: R2Bucket } {
  if (!env.MANUAL_ASSETS) throw new CloudManualError(503, MANUAL_MIGRATION_CODE, "手順書機能は移行中のため、現在利用できません。");
}

async function digest(bytes: Uint8Array): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function readAssetBody(request: Request): Promise<Uint8Array> {
  const headerLength = request.headers.get("content-length");
  const contentLength = headerLength === null ? null : Number(headerLength);
  if (contentLength === null || !Number.isSafeInteger(contentLength) || contentLength <= 0) throw new CloudManualError(411, "CONTENT_LENGTH_REQUIRED", "画像サイズを確認できません。");
  if (contentLength > MAX_ASSET_BYTES) throw new CloudManualError(413, "ASSET_TOO_LARGE", "画像は10MiB以下にしてください。");
  if (!request.body) throw new CloudManualError(400, "ASSET_BODY_REQUIRED", "画像を指定してください。");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_ASSET_BYTES) { await reader.cancel("asset too large").catch(() => undefined); throw new CloudManualError(413, "ASSET_TOO_LARGE", "画像は10MiB以下にしてください。"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  if (total !== contentLength) throw new CloudManualError(400, "ASSET_LENGTH_MISMATCH", "画像サイズを確認できません。");
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

function mediaExtension(contentType: string): string { return contentType === "image/jpeg" ? "jpg" : contentType.slice("image/".length); }

function hasImageSignature(contentType: string, bytes: Uint8Array): boolean {
  if (contentType === "image/png") return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  if (contentType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
}

async function deterministicAssetId(claimIntentId: string, assetSlot: number): Promise<string> {
  const value = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`meccha-manual:claim-asset:v1:${claimIntentId}:${assetSlot}`));
  const hex = Array.from(new Uint8Array(value), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function intentFingerprint(payload: { operationId: string; title: string; description: string; steps: ClaimStepInput[]; assets: ClaimAssetInput[] }): Promise<string> {
  return digest(new TextEncoder().encode(JSON.stringify(payload)));
}

async function claimIntentRoute(request: Request, env: CloudManualEnv): Promise<Response> {
  const { actorId, repository } = await auth(request, env);
  const body = await readJson(request);
  exactKeys(body, ["operationId", "assetCount"]);
  const operationId = operationField(body.operationId);
  if (!Number.isInteger(body.assetCount) || Number(body.assetCount) < 0 || Number(body.assetCount) > MAX_ASSETS) throw new CloudManualError(400, "ASSET_COUNT_INVALID", "画像件数を確認してください。");
  const result = await repository.createClaimIntent(actorId, operationId, Number(body.assetCount), new Date().toISOString(), CLAIM_INTENT_TTL_MS);
  return json({ claimIntentId: result.id, expiresAt: result.expiresAt }, 201);
}

async function stagedAssetRoute(request: Request, env: CloudManualEnv, claimIntentId: string, slot: number): Promise<Response> {
  requireManualAssets(env);
  const contentType = (request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!IMAGE_TYPES.has(contentType)) throw new CloudManualError(415, "ASSET_CONTENT_TYPE_INVALID", "PNG、JPEG、WebP画像だけを指定できます。");
  const operationId = operationField(request.headers.get("x-claim-operation-id"));
  const expectedSha = sha(request.headers.get("x-asset-sha256"));
  const expectedLength = Number(request.headers.get("x-asset-byte-length") ?? "");
  if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0 || expectedLength > MAX_ASSET_BYTES) throw new CloudManualError(400, "ASSET_LENGTH_INVALID", "画像サイズを確認してください。");
  const { actorId, repository } = await auth(request, env);
  const intent = await repository.getClaimIntent(actorId, uuid(claimIntentId, "CLAIM_INTENT_ID_INVALID"));
  if (!intent) throw new CloudManualError(404, "CLAIM_INTENT_NOT_FOUND", "保存操作が見つかりません。");
  if (intent.operationId !== operationId) throw new CloudManualError(409, "CLAIM_OPERATION_CONFLICT", "保存操作が一致しません。");
  if (intent.status === "completed") throw new CloudManualError(409, "CLAIM_ALREADY_COMPLETED", "保存済みの下書きは変更できません。");
  if (Date.parse(intent.expiresAt) <= Date.now()) throw new CloudManualError(410, "CLAIM_INTENT_EXPIRED", "保存操作の有効期限が切れています。");
  if (!Number.isInteger(slot) || slot < 0 || slot >= intent.assetCount) throw new CloudManualError(400, "ASSET_SLOT_INVALID", "画像番号を確認してください。");
  const bytes = await readAssetBody(request);
  if (bytes.byteLength !== expectedLength) throw new CloudManualError(400, "ASSET_LENGTH_MISMATCH", "画像サイズを確認してください。");
  if (!hasImageSignature(contentType, bytes)) throw new CloudManualError(415, "ASSET_CONTENT_INVALID", "画像形式を確認してください。");
  const actualSha = await digest(bytes);
  if (actualSha !== expectedSha) throw new CloudManualError(400, "ASSET_DIGEST_MISMATCH", "画像の検証に失敗しました。");
  const existing = await repository.getStagedAsset(actorId, intent.id, slot);
  const assetId = await deterministicAssetId(intent.id, slot);
  const objectKey = `${intent.workspaceId}/manuals/${intent.id}/${assetId}.${mediaExtension(contentType)}`;
  const metadata = { workspace_id: intent.workspaceId, asset_id: assetId, kind: "manual_image", content_type: contentType, checksum_sha256: actualSha };
  let reservation: Awaited<ReturnType<CloudManualRepository["reserveStagedAsset"]>> | undefined;
  if (existing) {
    if (existing.id !== assetId || existing.operationId !== operationId || existing.objectKey !== objectKey || existing.contentType !== contentType || existing.byteLength !== bytes.byteLength || existing.sha256 !== actualSha) throw new CloudManualError(409, "ASSET_RETRY_CONFLICT", "同じ画像番号へ別の画像は保存できません。");
    let head: R2Object | null = null;
    try { head = await env.MANUAL_ASSETS.head(existing.objectKey); } catch { throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。"); }
    const headMetadata = head?.customMetadata ?? {};
    if (head) {
      if (head.size !== bytes.byteLength || Object.keys(headMetadata).length !== 5 || Object.entries(metadata).some(([key, value]) => headMetadata[key] !== value)) throw new CloudManualError(409, "ASSET_RECONCILIATION_REQUIRED", "画像保存状態を確認できません。");
      if (existing.status === "reserved") await repository.recordStagedAsset({ id: existing.id, claimIntentId: existing.claimIntentId, assetSlot: existing.assetSlot, workspaceId: existing.workspaceId, operationId: existing.operationId, objectKey: existing.objectKey, contentType: existing.contentType, byteLength: existing.byteLength, sha256: existing.sha256 }, new Date().toISOString());
      return json({ assetSlot: slot, sha256: actualSha, byteLength: bytes.byteLength, contentType, status: "staged" });
    }
    if (existing.status !== "reserved") throw new CloudManualError(409, "ASSET_RECONCILIATION_REQUIRED", "画像保存状態を確認できません。");
    reservation = existing;
  }
  const record = { id: assetId, claimIntentId: intent.id, assetSlot: slot, workspaceId: intent.workspaceId, operationId, objectKey, contentType, byteLength: bytes.byteLength, sha256: actualSha };
  reservation ??= await repository.reserveStagedAsset(record, new Date().toISOString());
  if (reservation.id !== assetId || reservation.claimIntentId !== intent.id || reservation.assetSlot !== slot || reservation.workspaceId !== intent.workspaceId || reservation.operationId !== operationId || reservation.objectKey !== objectKey || reservation.contentType !== contentType || reservation.byteLength !== bytes.byteLength || reservation.sha256 !== actualSha) throw new CloudManualError(409, "ASSET_RETRY_CONFLICT", "同じ画像番号へ別の画像は保存できません。");
  if (reservation.status === "staged" || reservation.status === "completed") {
    let head: R2Object | null;
    try { head = await env.MANUAL_ASSETS.head(reservation.objectKey); } catch { throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。"); }
    const headMetadata = head?.customMetadata ?? {};
    if (!head || head.size !== bytes.byteLength || Object.keys(headMetadata).length !== 5 || Object.entries(metadata).some(([key, value]) => headMetadata[key] !== value)) throw new CloudManualError(409, "ASSET_RECONCILIATION_REQUIRED", "画像保存状態を確認できません。");
    return json({ assetSlot: slot, sha256: actualSha, byteLength: bytes.byteLength, contentType, status: "staged" });
  }
  try {
    await env.MANUAL_ASSETS.put(objectKey, bytes, {
      onlyIf: { etagDoesNotMatch: "*" },
      httpMetadata: { contentType, cacheControl: "no-store" },
      customMetadata: metadata
    });
  } catch {
    let head: R2Object | null;
    try { head = await env.MANUAL_ASSETS.head(objectKey); } catch { throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。"); }
    if (!head) throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。");
    if (head.size !== bytes.byteLength || Object.keys(head.customMetadata ?? {}).length !== 5 || Object.entries(metadata).some(([key, value]) => head.customMetadata?.[key] !== value)) throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。");
  }
  try {
    const head = await env.MANUAL_ASSETS.head(objectKey);
    if (!head || head.size !== bytes.byteLength || Object.keys(head.customMetadata ?? {}).length !== 5 || Object.entries(metadata).some(([key, value]) => head.customMetadata?.[key] !== value)) throw new CloudManualError(409, "ASSET_RECONCILIATION_REQUIRED", "画像保存状態を確認できません。");
  } catch (error) {
    if (error instanceof CloudManualError) throw error;
    throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。");
  }
  try {
    await repository.recordStagedAsset(record, new Date().toISOString());
  } catch (error) {
    if (error instanceof D1RepositoryError && error.code === "conflict") {
      const raced = await repository.getStagedAsset(actorId, intent.id, slot);
      if (raced) {
        if (raced.id !== assetId || raced.claimIntentId !== intent.id || raced.assetSlot !== slot || raced.workspaceId !== intent.workspaceId || raced.operationId !== operationId || raced.objectKey !== objectKey || raced.contentType !== contentType || raced.byteLength !== bytes.byteLength || raced.sha256 !== actualSha) throw new CloudManualError(409, "ASSET_RETRY_CONFLICT", "同じ画像番号へ別の画像は保存できません。");
        if (raced.status !== "staged" && raced.status !== "completed") throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。重ねて送信せず、もう一度状態を確認してください。");
        let head: R2Object | null;
        try { head = await env.MANUAL_ASSETS.head(raced.objectKey); } catch { throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。"); }
        const headMetadata = head?.customMetadata ?? {};
        if (!head || head.size !== bytes.byteLength || Object.keys(headMetadata).length !== 5 || Object.entries(metadata).some(([key, value]) => headMetadata[key] !== value)) throw new CloudManualError(409, "ASSET_RECONCILIATION_REQUIRED", "画像保存状態を確認できません。");
        return json({ assetSlot: slot, sha256: actualSha, byteLength: bytes.byteLength, contentType, status: "staged" });
      }
    }
    throw new CloudManualError(503, "ASSET_STAGING_RESULT_UNKNOWN", "画像の保存結果を確認できません。重ねて送信せず、もう一度状態を確認してください。");
  }
  return json({ assetSlot: slot, sha256: actualSha, byteLength: bytes.byteLength, contentType, status: "staged" });
}

function parseSteps(value: unknown): ClaimStepInput[] {
  if (!Array.isArray(value) || value.length > MAX_STEPS) throw new CloudManualError(400, "STEPS_INVALID", "手順件数を確認してください。");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new CloudManualError(400, "STEP_INVALID", "手順を確認してください。");
    const row = item as Record<string, unknown>;
    exactKeys(row, ["type", "title", "instruction", "actionType", "targetText", "url", "assetSlot"]);
    if (typeof row.type !== "string" || !STEP_TYPES.has(row.type)) throw new CloudManualError(400, "STEP_TYPE_INVALID", "手順の種類を確認してください。");
    if (row.actionType !== null && (typeof row.actionType !== "string" || !ACTION_TYPES.has(row.actionType))) throw new CloudManualError(400, "STEP_ACTION_TYPE_INVALID", "操作種別を確認してください。");
    const assetSlot = row.assetSlot === undefined ? null : row.assetSlot;
    if (assetSlot !== null && (!Number.isInteger(assetSlot) || Number(assetSlot) < 0 || Number(assetSlot) >= MAX_ASSETS)) throw new CloudManualError(400, "ASSET_SLOT_INVALID", "Asset slot is invalid.");
    return { type: row.type as ClaimStepInput["type"], title: stringField(row.title, 128, "STEP_TITLE_INVALID"), instruction: textField(row.instruction, 4000, "STEP_INSTRUCTION_INVALID", false), actionType: row.actionType === undefined ? null : row.actionType as ClaimStepInput["actionType"], targetText: row.targetText === null || row.targetText === undefined ? null : stringField(row.targetText, 256, "STEP_TARGET_INVALID"), url: stepUrl(row.url), assetSlot: assetSlot as number | null, assetId: null };
  });
}

function parseDraftSteps(value: unknown): Array<ManualStepMutationInput & { id: string | null }> {
  if (!Array.isArray(value) || value.length > MAX_STEPS) throw new CloudManualError(400, "STEPS_INVALID", "Step count is invalid.");
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new CloudManualError(400, "STEP_INVALID", "Step is invalid.");
    const row = item as Record<string, unknown>;
    exactKeys(row, ["id", "type", "title", "instruction", "actionType", "targetText", "url", "assetId"]);
    if (typeof row.type !== "string" || !STEP_TYPES.has(row.type)) throw new CloudManualError(400, "STEP_TYPE_INVALID", "手順の種類を確認してください。");
    const actionType = row.actionType === null || row.actionType === undefined ? null : row.actionType;
    if (actionType !== null && (typeof actionType !== "string" || !ACTION_TYPES.has(actionType))) throw new CloudManualError(400, "STEP_ACTION_TYPE_INVALID", "操作種別を確認してください。");
    return { id: row.id === null || row.id === undefined || row.id === "" ? null : uuid(String(row.id), "STEP_ID_INVALID"), type: row.type as ManualStepMutationInput["type"], title: stringField(row.title, 128, "STEP_TITLE_INVALID"), instruction: textField(row.instruction, 4000, "STEP_INSTRUCTION_INVALID", false), actionType: actionType as ManualStepMutationInput["actionType"], targetText: row.targetText === null || row.targetText === undefined ? null : stringField(row.targetText, 256, "STEP_TARGET_INVALID"), url: stepUrl(row.url), assetId: row.assetId === null || row.assetId === undefined || row.assetId === "" ? null : uuid(String(row.assetId), "ASSET_ID_INVALID") };
  });
}

function parseAssets(value: unknown): ClaimAssetInput[] {
  if (!Array.isArray(value) || value.length > MAX_ASSETS) throw new CloudManualError(400, "ASSETS_INVALID", "画像一覧を確認してください。");
  const seen = new Set<number>();
  return value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new CloudManualError(400, "ASSET_INVALID", "画像一覧を確認してください。");
    const row = item as Record<string, unknown>;
    exactKeys(row, ["assetSlot", "sha256"]);
    if (!Number.isInteger(row.assetSlot) || Number(row.assetSlot) < 0 || Number(row.assetSlot) >= MAX_ASSETS || seen.has(Number(row.assetSlot))) throw new CloudManualError(400, "ASSET_SLOT_INVALID", "画像番号を確認してください。");
    seen.add(Number(row.assetSlot));
    return { assetSlot: Number(row.assetSlot), sha256: sha(row.sha256) };
  });
}

async function finalizeRoute(request: Request, env: CloudManualEnv, claimIntentId: string): Promise<Response> {
  const { actorId, repository } = await auth(request, env);
  const body = await readJson(request);
  exactKeys(body, ["operationId", "manual", "assets"]);
  const operationId = operationField(body.operationId);
  if (!body.manual || typeof body.manual !== "object" || Array.isArray(body.manual)) throw new CloudManualError(400, "MANUAL_INVALID", "手順書を確認してください。");
  const manual = body.manual as Record<string, unknown>;
  exactKeys(manual, ["title", "description", "steps"]);
  const title = stringField(manual.title, 64, "MANUAL_TITLE_INVALID");
  const description = textField(manual.description, 10000, "MANUAL_DESCRIPTION_INVALID", false);
  const steps = parseSteps(manual.steps);
  const assets = parseAssets(body.assets);
  const id = uuid(claimIntentId, "CLAIM_INTENT_ID_INVALID");
  const intent = await repository.getClaimIntent(actorId, id);
  if (!intent) throw new CloudManualError(404, "CLAIM_INTENT_NOT_FOUND", "保存操作が見つかりません。");
  if (intent.operationId !== operationId) throw new CloudManualError(409, "CLAIM_OPERATION_CONFLICT", "保存操作が一致しません。");
  const fingerprint = await intentFingerprint({ operationId, title, description, steps, assets });
  if (intent.status === "completed") {
    if (intent.requestFingerprint === fingerprint && intent.manualId) return json({ status: "claimed", manualId: intent.manualId });
    throw new CloudManualError(409, "CLAIM_RETRY_CONFLICT", "同じ保存操作へ別の内容は送信できません。");
  }
  if (Date.parse(intent.expiresAt) <= Date.now()) throw new CloudManualError(410, "CLAIM_INTENT_EXPIRED", "保存操作の有効期限が切れています。");
  if (assets.length !== intent.assetCount) throw new CloudManualError(400, "ASSETS_INCOMPLETE", "画像一覧が不足しています。");
  const stagedRows = await repository.getStagedAssets(actorId, intent.id, assets.map((asset) => asset.assetSlot));
  const stagedBySlot = new Map(stagedRows.map((row) => [row.assetSlot, row]));
  const staged = [];
  for (const asset of assets) {
    const row = stagedBySlot.get(asset.assetSlot);
    if (!row || row.sha256 !== asset.sha256 || row.status !== "staged") throw new CloudManualError(409, "ASSET_NOT_STAGED", "画像の保存が完了していません。");
    requireManualAssets(env);
    const object = await env.MANUAL_ASSETS.head(row.objectKey);
    const metadata = object?.customMetadata ?? {};
    if (!object || object.size !== row.byteLength || metadata.workspace_id !== row.workspaceId || metadata.asset_id !== row.id || metadata.kind !== "manual_image" || metadata.content_type !== row.contentType || metadata.checksum_sha256 !== row.sha256) throw new CloudManualError(409, "ASSET_RECONCILIATION_REQUIRED", "画像保存状態を確認できません。");
    staged.push({ ...asset, id: row.id, objectKey: row.objectKey, contentType: row.contentType, byteLength: row.byteLength });
  }
  const stagedBySlotForSteps = new Map(staged.map((asset) => [asset.assetSlot, asset]));
  const resolvedSteps = steps.map((step) => {
    const asset = step.assetSlot === null ? null : stagedBySlotForSteps.get(step.assetSlot);
    if (step.assetSlot !== null && !asset) throw new CloudManualError(409, "ASSET_NOT_STAGED", "Step asset is not staged.");
    return { ...step, assetId: asset?.id ?? null };
  });
  const result = await repository.finalizeClaim(actorId, intent, fingerprint, title, description, resolvedSteps, staged, new Date().toISOString());
  return json(result);
}

async function claimStatusRoute(request: Request, env: CloudManualEnv, claimIntentId: string): Promise<Response> {
  const { actorId, repository } = await auth(request, env);
  const params = new URL(request.url).searchParams;
  if ([...params.keys()].some((key) => key !== "operationId") || params.getAll("operationId").length !== 1) throw new CloudManualError(400, "OPERATION_ID_INVALID", "operationId is required.");
  const operationId = operationField(params.get("operationId"));
  const intent = await repository.getClaimIntent(actorId, uuid(claimIntentId, "CLAIM_INTENT_ID_INVALID"));
  if (!intent) throw new CloudManualError(404, "CLAIM_INTENT_NOT_FOUND", "保存操作が見つかりません。");
  if (intent.operationId !== operationId) throw new CloudManualError(409, "CLAIM_OPERATION_CONFLICT", "保存操作が一致しません。");
  if (intent.status === "completed") return json({ status: "completed", manualId: intent.manualId });
  if (Date.parse(intent.expiresAt) <= Date.now()) return json({ status: "expired", expiresAt: intent.expiresAt });
  return json({ status: "pending", expiresAt: intent.expiresAt });
}

function manualPayload(detail: ManualDetailRecord, workspaceId: string): Record<string, unknown> {
  return {
    manual: { id: detail.id, title: detail.title, status: detail.status, currentDraftRevisionId: detail.currentDraftRevisionId, currentPublishedRevisionId: detail.currentPublishedRevisionId, updatedAt: detail.updatedAt },
    draft: detail.draft,
    steps: detail.steps.map((step) => ({ ...step, assetUrl: step.assetId ? `/api/workspaces/${workspaceId}/assets/${step.assetId}` : null })),
    permissions: { canEdit: detail.canEdit }
  };
}

async function manualRoute(request: Request, env: CloudManualEnv, workspaceId: string, manualId: string | null): Promise<Response> {
  const { actorId, repository } = await auth(request, env);
  const role = await repository.getWorkspaceRole(actorId, workspaceId);
  if (!role) throw new CloudManualError(403, "ACCESS_FORBIDDEN", "このワークスペースを利用する権限がありません。");
  if (!manualId && request.method === "GET") return json({ manuals: await repository.listManuals(actorId, workspaceId) });
  if (!manualId && request.method === "POST") throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
  if (!manualId) throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
  const detail = await repository.getManual(actorId, workspaceId, manualId);
  if (!detail) throw new CloudManualError(404, "MANUAL_NOT_FOUND", "手順書が見つかりません。");
  if (request.method === "GET") return json(manualPayload(detail, workspaceId));
  throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
}

async function draftRoute(request: Request, env: CloudManualEnv, workspaceId: string, manualId: string): Promise<Response> {
  const { actorId, repository } = await auth(request, env);
  const detail = await repository.getManual(actorId, workspaceId, manualId);
  if (!detail) throw new CloudManualError(404, "MANUAL_NOT_FOUND", "手順書が見つかりません。");
  if (!detail.canEdit) throw new CloudManualError(403, "MANUAL_EDIT_FORBIDDEN", "手順書を編集する権限がありません。");
  if (request.method !== "PATCH") throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
  const body = await readJson(request);
  exactKeys(body, ["title", "description", "steps", "expectedUpdatedAt"]);
  const title = stringField(body.title, 64, "MANUAL_TITLE_INVALID");
  const description = textField(body.description, 10000, "MANUAL_DESCRIPTION_INVALID", false);
  if (typeof body.expectedUpdatedAt !== "string" || Number.isNaN(Date.parse(body.expectedUpdatedAt))) throw new CloudManualError(400, "MANUAL_DRAFT_VERSION_INVALID", "下書きの版を確認してください。");
  const result = await repository.updateDraftWithSteps(actorId, workspaceId, manualId, title, description, parseDraftSteps(body.steps), body.expectedUpdatedAt, new Date().toISOString());
  return json(result);
}

async function assetProxyRoute(request: Request, env: CloudManualEnv, workspaceId: string, assetId: string): Promise<Response> {
  if (request.method !== "GET") throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
  requireManualAssets(env);
  const { actorId, repository } = await auth(request, env);
  const asset = await repository.getAssetForRead(actorId, workspaceId, uuid(assetId, "ASSET_ID_INVALID"));
  if (!asset) throw new CloudManualError(404, "ASSET_NOT_FOUND", "画像が見つかりません。");
  const object = await env.MANUAL_ASSETS.get(asset.objectKey);
  if (!object || !("body" in object) || !object.body) throw new CloudManualError(404, "ASSET_NOT_FOUND", "画像が見つかりません。");
  return new Response(object.body, { status: 200, headers: { "content-type": asset.contentType, "cache-control": "no-store", "x-content-type-options": "nosniff", "content-disposition": "inline" } });
}

export async function handleCloudManualRoute(request: Request, env: CloudManualEnv): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const intentMatch = path.match(/^\/api\/onboarding\/claim-intents$/u);
  const stagedMatch = path.match(/^\/api\/onboarding\/claim-intents\/([^/]+)\/assets\/([0-9]+)$/u);
  const claimMatch = path.match(/^\/api\/onboarding\/claims\/([^/]+)$/u);
  const draftMatch = path.match(/^\/api\/workspaces\/([^/]+)\/manuals\/([^/]+)\/draft$/u);
  const assetMatch = path.match(/^\/api\/workspaces\/([^/]+)(?:\/manuals\/([^/]+))?\/assets\/([^/]+)$/u);
  const manualMatch = path.match(/^\/api\/workspaces\/([^/]+)\/manuals(?:\/([^/]+))?$/u);
  if (!intentMatch && !stagedMatch && !claimMatch && !assetMatch && !manualMatch && !draftMatch) return null;
  try {
    requireManualAssets(env);
    assertSameOrigin(request, env);
    if (intentMatch) { if (request.method !== "POST") throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。"); return await claimIntentRoute(request, env); }
    if (stagedMatch) { if (request.method !== "PUT") throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。"); return await stagedAssetRoute(request, env, stagedMatch[1]!, Number(stagedMatch[2]!)); }
    if (claimMatch && request.method === "GET") return await claimStatusRoute(request, env, claimMatch[1]!);
    if (claimMatch) { if (request.method !== "POST") throw new CloudManualError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。"); return await finalizeRoute(request, env, claimMatch[1]!); }
    if (draftMatch) return await draftRoute(request, env, draftMatch[1]!, uuid(draftMatch[2]!, "MANUAL_ID_INVALID"));
    if (assetMatch) return await assetProxyRoute(request, env, assetMatch[1]!, assetMatch[3]!);
    const matchedManual = manualMatch!;
    return await manualRoute(request, env, matchedManual[1]!, matchedManual[2] ? uuid(matchedManual[2]!, "MANUAL_ID_INVALID") : null);
  } catch (error) { return errorResponse(error); }
}
