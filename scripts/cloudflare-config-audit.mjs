import { appendFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const CLOUDFLARE_API_ORIGIN = "https://api.cloudflare.com/client/v4";
export const API_TIMEOUT_MS = 10_000;
export const MAX_RESPONSE_BYTES = 256 * 1024;
export const DEFAULT_WORKER_NAME = "meccha-manual";
export const ALLOWED_BINDINGS = new Map([
  ["DB", new Set(["d1"])],
  ["DISCORD_INTERACTION_STORE", new Set(["kv_namespace"])],
  ["BROWSER_RUN", new Set(["browser"])],
  ["CAPTURE_SESSION", new Set(["durable_object_namespace"])],
  ["CAPTURE_ASSETS", new Set(["r2_bucket"])],
  ["MANUAL_ASSETS", new Set(["r2_bucket"])],
  ["EXPORTS", new Set(["r2_bucket"])],
  ["AVATARS", new Set(["r2_bucket"])],
]);
export const REQUIRED_SECRET_COUNT = 2;
const REQUIRED_SECRET_NAMES = new Set(["DISCORD_PUBLIC_KEY", "GITHUB_ISSUE_TOKEN"]);
const API_BASE_URL = new URL(CLOUDFLARE_API_ORIGIN);

const ACCOUNT_ID_PATTERN = /^[a-f0-9]{32}$/i;
const WORKER_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?$/i;
const API_PATHS = Object.freeze({
  settings: (accountId, workerName) => `/accounts/${accountId}/workers/scripts/${workerName}/settings`,
  secrets: (accountId, workerName) => `/accounts/${accountId}/workers/scripts/${workerName}/secrets`,
  d1: (accountId) => `/accounts/${accountId}/d1/database`,
  r2: (accountId) => `/accounts/${accountId}/r2/buckets`,
  access: (accountId) => `/accounts/${accountId}/access/apps`,
});

export function validateAuditConfig({ accountId, workerName = DEFAULT_WORKER_NAME, token } = {}) {
  return Boolean(
    typeof token === "string" && token.trim() &&
      typeof accountId === "string" && ACCOUNT_ID_PATTERN.test(accountId) &&
      typeof workerName === "string" && WORKER_NAME_PATTERN.test(workerName),
  );
}

function statusLabel(status) {
  if (status === 401) return "認証無効";
  if (status === 403) return "権限不足";
  if (status === 404) return "対象なし";
  if (status === 429) return "レート制限";
  if (status >= 500) return "Cloudflare応答失敗";
  return "API応答失敗";
}

function classifyFetchError(error) {
  if (error?.message === "response too large") return "応答上限超過";
  if (error?.name === "AbortError" || error?.name === "TimeoutError") return "タイムアウト";
  if (error instanceof TypeError) return "ネットワーク失敗";
  return "API接続失敗";
}

function safeStatus(status) {
  return Number.isInteger(status) && status >= 100 && status <= 599 ? status : 0;
}

function makeApiUrl(path) {
  const allowedPath = /^\/accounts\/[a-f0-9]{32}\/(?:d1\/database|r2\/buckets|access\/apps|workers\/scripts\/[a-z0-9](?:[a-z0-9_-]{0,61}[a-z0-9])?\/(?:settings|secrets))$/i;
  if (typeof path !== "string" || !allowedPath.test(path) || path.includes("//")) {
    throw new Error("invalid internal Cloudflare API path");
  }
  const url = new URL(`${API_BASE_URL.pathname}${path}`, API_BASE_URL.origin);
  if (url.origin !== API_BASE_URL.origin || !url.pathname.startsWith(`${API_BASE_URL.pathname}/`)) {
    throw new Error("untrusted Cloudflare API origin");
  }
  return url;
}

async function readLimitedText(response, maxBytes = MAX_RESPONSE_BYTES) {
  if (!response.body?.getReader) {
    const text = await response.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new Error("response too large");
    return text;
  }
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("response too large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString("utf8");
}

function parseEnvelope(body) {
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, classification: "応答不正" };
  }
  if (!parsed || parsed.success !== true || !("result" in parsed)) {
    return { ok: false, classification: "API応答失敗" };
  }
  return { ok: true, result: parsed.result, resultInfo: parsed.result_info || {} };
}

export async function fetchCloudflareJson(path, {
  token,
  fetchImpl = fetch,
  timeoutMs = API_TIMEOUT_MS,
} = {}) {
  if (typeof token !== "string" || !token.trim()) return { ok: false, classification: "認証設定不足" };
  let url;
  try {
    url = makeApiUrl(path);
  } catch {
    return { ok: false, classification: "内部設定不正" };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "error",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "user-agent": "meccha-manual-cloudflare-readonly-audit",
        accept: "application/json",
      },
    });
    const status = safeStatus(response.status);
    if (!response.ok) return { ok: false, classification: statusLabel(status) };
    const body = await readLimitedText(response);
    return parseEnvelope(body);
  } catch (error) {
    return { ok: false, classification: classifyFetchError(error) };
  } finally {
    clearTimeout(timer);
  }
}

function totalCount(result, resultInfo) {
  if (Number.isInteger(resultInfo?.total_count) && resultInfo.total_count >= 0) return resultInfo.total_count;
  if (Number.isInteger(resultInfo?.count) && resultInfo.count >= 0) return resultInfo.count;
  return Array.isArray(result) ? result.length : 0;
}

function summarizeBindings(result) {
  const bindings = Array.isArray(result?.bindings) ? result.bindings : [];
  const allowed = bindings
    .filter((binding) => {
      const name = typeof binding?.name === "string" ? binding.name : "";
      const type = typeof binding?.type === "string" ? binding.type : "";
      return ALLOWED_BINDINGS.get(name)?.has(type) === true;
    })
    .map((binding) => ({ name: binding.name, type: binding.type }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return { total: bindings.length, allowed };
}

function summarizeSecretState(result, resultInfo) {
  const secrets = Array.isArray(result) ? result : [];
  const total = totalCount(secrets, resultInfo);
  const presentRequired = secrets.reduce(
    (count, secret) => count + (REQUIRED_SECRET_NAMES.has(secret?.name) ? 1 : 0),
    0,
  );
  return { total, presentRequired, required: REQUIRED_SECRET_COUNT };
}

export function validateResourceShape(key, response) {
  if (!response.ok) return response;
  const valid = key === "settings"
    ? response.result && Array.isArray(response.result.bindings)
    : key === "r2"
      ? response.result && Array.isArray(response.result.buckets)
      : Array.isArray(response.result);
  if (!valid) return { ok: false, classification: "応答不正" };
  if (key === "r2") return { ...response, result: response.result.buckets };
  return response;
}

function operationState(result) {
  return result.ok ? "取得済み" : result.classification || "取得失敗";
}

function tableRow(cells) {
  return `| ${cells.join(" | ")} |`;
}

export function buildReport({ settings, secrets, d1, r2, access, accountConfigured = true } = {}) {
  const bindingSummary = settings?.ok ? summarizeBindings(settings.result) : { total: 0, allowed: [] };
  const secretSummary = secrets?.ok
    ? summarizeSecretState(secrets.result, secrets.resultInfo)
    : { total: 0, presentRequired: 0, required: REQUIRED_SECRET_COUNT };
  const allApiReadsSucceeded = [settings, secrets, d1, r2, access].every((item) => item?.ok === true);
  const requiredStateOk = secretSummary.presentRequired === secretSummary.required;
  const status = allApiReadsSucceeded && accountConfigured ? "確認完了" : "要確認";
  const lines = [
    "# Cloudflare実環境 read-only 診断",
    "",
    `診断結果: ${status}`,
    "実行方式: Cloudflare APIのGETのみ",
    `認証設定: ${accountConfigured ? "設定済み" : "不足"}`,
    "",
    "## Worker設定",
    "",
    tableRow(["項目", "状態", "件数"]),
    tableRow(["---", "---", "---"]),
    tableRow(["設定取得", operationState(settings || {}), settings?.ok ? "1" : "-"]),
    tableRow(["許可済みbinding", settings?.ok ? "取得済み" : operationState(settings || {}), String(bindingSummary.allowed.length)]),
    tableRow(["binding総数", settings?.ok ? "取得済み" : operationState(settings || {}), settings?.ok ? String(bindingSummary.total) : "-"]),
    "",
    "## Worker secret",
    "",
    tableRow(["項目", "状態", "件数"]),
    tableRow(["---", "---", "---"]),
    tableRow(["secret一覧取得", operationState(secrets || {}), secrets?.ok ? String(secretSummary.total) : "-"]),
    tableRow(["旧連携必須secret", secrets?.ok ? (requiredStateOk ? "そろっている" : "不足") : operationState(secrets || {}), `${secretSummary.presentRequired}/${secretSummary.required}`]),
    "",
    "## Cloudflare資源の存在確認",
    "",
    tableRow(["資源", "状態", "件数"]),
    tableRow(["---", "---", "---"]),
    tableRow(["D1", operationState(d1 || {}), d1?.ok ? String(totalCount(d1.result, d1.resultInfo)) : "-" ]),
    tableRow(["R2", operationState(r2 || {}), r2?.ok ? String(totalCount(r2.result, r2.resultInfo)) : "-" ]),
    tableRow(["Access application", operationState(access || {}), access?.ok ? String(totalCount(access.result, access.resultInfo)) : "-" ]),
    "",
    "## 許可済みbinding",
    "",
    tableRow(["NAME", "種類"]),
    tableRow(["---", "---"]),
    ...(bindingSummary.allowed.length > 0
      ? bindingSummary.allowed.map((binding) => tableRow([binding.name, binding.type]))
      : [tableRow(["(なし)", "-"])]),
    "",
    "## 注意",
    "",
    "- この診断は読み取り専用です。資源作成・更新・削除、deploy、DB query、secret値取得、Access policy変更は行いません。",
    "- token、account ID、resource ID、secret値、email、policy内容、API本文、実URLは出力しません。",
    "- 確認完了は実環境の取得結果を示すだけで、移行・staging合格・alpha完成を意味しません。",
  ];
  return { ok: status === "確認完了", markdown: `${lines.join("\n")}\n` };
}

async function writeReport(report) {
  await writeFile("cloudflare-config-audit.md", report.markdown, { encoding: "utf8" });
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, report.markdown, { encoding: "utf8" });
  console.log(report.markdown);
}

export async function runAudit({
  accountId = process.env.CLOUDFLARE_ACCOUNT_ID,
  token = process.env.CLOUDFLARE_API_TOKEN,
  workerName = process.env.MECCHA_WORKER_NAME || DEFAULT_WORKER_NAME,
  fetchImpl = fetch,
} = {}) {
  if (!validateAuditConfig({ accountId, workerName, token })) {
    const report = buildReport({ accountConfigured: false });
    await writeReport(report);
    return { ...report, exitCode: 1 };
  }
  const paths = Object.fromEntries(Object.entries(API_PATHS).map(([key, factory]) => [key, factory(accountId, workerName)]));
  const [settingsResponse, secretsResponse, d1Response, r2Response, accessResponse] = await Promise.all([
    fetchCloudflareJson(paths.settings, { token, fetchImpl }),
    fetchCloudflareJson(paths.secrets, { token, fetchImpl }),
    fetchCloudflareJson(paths.d1, { token, fetchImpl }),
    fetchCloudflareJson(paths.r2, { token, fetchImpl }),
    fetchCloudflareJson(paths.access, { token, fetchImpl }),
  ]);
  const settings = validateResourceShape("settings", settingsResponse);
  const secrets = validateResourceShape("secrets", secretsResponse);
  const d1 = validateResourceShape("d1", d1Response);
  const r2 = validateResourceShape("r2", r2Response);
  const access = validateResourceShape("access", accessResponse);
  const report = buildReport({ settings, secrets, d1, r2, access });
  await writeReport(report);
  return { ...report, exitCode: report.ok ? 0 : 1 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runAudit();
  if (result.exitCode !== 0) process.exitCode = result.exitCode;
}
