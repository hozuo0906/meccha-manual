import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

export const REQUIRED_EGRESS_CHANNELS = Object.freeze([
  "navigation",
  "redirect",
  "iframe",
  "subresource",
  "fetch",
  "websocket",
  "service_worker",
  "download",
  "webtransport_quic",
  "webrtc_ice_stun_turn"
]);

const API_ORIGIN = "https://api.cloudflare.com";
const LIVE_CONFIRMATION = "RUN_ISOLATED_STAGING_P0";

export function validatedHttpsUrl(value, name) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be an absolute HTTPS URL.`);
  }
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error(`${name} must be an absolute HTTPS URL without credentials.`);
  }
  return url;
}

export function buildGuardedSessionBody(fixtureOrigin) {
  const fixture = validatedHttpsUrl(fixtureOrigin, "BROWSER_EGRESS_FIXTURE_ORIGIN");
  return {
    guardrails: {
      allowedDomains: [fixture.hostname]
    },
    recording: false,
    targets: false
  };
}

export function requireSameOrigin(left, right) {
  if (left.origin !== right.origin) {
    throw new Error("Fixture and evidence endpoints must use the same HTTPS origin.");
  }
}

export function evaluateEgressEvidence(evidence) {
  const failures = [];
  if (!evidence || evidence.schemaVersion !== 1) failures.push("schema_version");
  const channels = Array.isArray(evidence?.channels) ? evidence.channels : [];
  const results = new Map();
  for (const item of channels) {
    if (!item || typeof item.channel !== "string") {
      failures.push("channel:invalid");
      continue;
    }
    if (!REQUIRED_EGRESS_CHANNELS.includes(item.channel)) {
      failures.push(`${item.channel}:unexpected`);
      continue;
    }
    if (results.has(item.channel)) {
      failures.push(`${item.channel}:duplicate`);
      continue;
    }
    results.set(item.channel, item);
  }

  for (const channel of REQUIRED_EGRESS_CHANNELS) {
    const result = results.get(channel);
    if (!result) {
      failures.push(`${channel}:missing`);
      continue;
    }
    const safelyDisabled =
      result.decision === "disabled_before_attempt" &&
      result.disablementVerified === true;
    const safelyBlocked =
      result.decision === "blocked_before_bytes" &&
      result.applicationBytesObserved === 0 &&
      result.actualPeerVerifiedBeforeBytes === true;
    if (!safelyDisabled && !safelyBlocked) failures.push(`${channel}:unproven`);
  }

  return {
    ok: failures.length === 0,
    checkedChannels: REQUIRED_EGRESS_CHANNELS.length,
    failures
  };
}

async function cloudflareRequest(path, init, token) {
  const response = await fetch(`${API_ORIGIN}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
      ...init?.headers
    }
  });
  if (!response.ok) throw new Error(`Cloudflare Browser Run API failed with HTTP ${response.status}.`);
  return response.json();
}

async function closeSession(accountId, sessionId, token) {
  const encodedAccount = encodeURIComponent(accountId);
  const encodedSession = encodeURIComponent(sessionId);
  const result = await cloudflareRequest(
    `/client/v4/accounts/${encodedAccount}/browser-rendering/devtools/browser/${encodedSession}`,
    { method: "DELETE" },
    token
  );
  if (result.status !== "closed" && result.status !== "closing") {
    throw new Error("Browser Run session close was not accepted.");
  }
}

async function runLiveProof() {
  if (process.env.BROWSER_EGRESS_RUN_CONFIRMATION !== LIVE_CONFIRMATION) {
    throw new Error(`Live proof requires BROWSER_EGRESS_RUN_CONFIRMATION=${LIVE_CONFIRMATION}.`);
  }

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID ?? "";
  const token = process.env.CLOUDFLARE_BROWSER_RUN_API_TOKEN ?? "";
  const fixture = validatedHttpsUrl(process.env.BROWSER_EGRESS_FIXTURE_ORIGIN ?? "", "BROWSER_EGRESS_FIXTURE_ORIGIN");
  const evidenceUrl = validatedHttpsUrl(process.env.BROWSER_EGRESS_EVIDENCE_URL ?? "", "BROWSER_EGRESS_EVIDENCE_URL");
  requireSameOrigin(fixture, evidenceUrl);
  const fixtureToken = process.env.BROWSER_EGRESS_FIXTURE_TOKEN ?? "";
  if (!accountId || !token || !fixtureToken) throw new Error("Required live-proof credentials are unavailable.");

  const probeId = randomUUID();
  const encodedAccount = encodeURIComponent(accountId);
  let sessionId = "";
  let browser;
  let primaryError;
  try {
    const created = await cloudflareRequest(
      `/client/v4/accounts/${encodedAccount}/browser-rendering/devtools/browser?keep_alive=60000`,
      { method: "POST", body: JSON.stringify(buildGuardedSessionBody(fixture.origin)) },
      token
    );
    sessionId = created.sessionId;
    if (!sessionId || !created.webSocketDebuggerUrl) throw new Error("Browser Run did not return a usable guarded session.");

    const { chromium } = await import("@playwright/test");
    browser = await chromium.connectOverCDP(created.webSocketDebuggerUrl, {
      headers: { authorization: `Bearer ${token}` }
    });
    const context = browser.contexts()[0] ?? await browser.newContext();
    const page = context.pages()[0] ?? await context.newPage();
    const startUrl = new URL("/browser-run-egress/start", fixture);
    startUrl.searchParams.set("probe", probeId);
    await page.goto(startUrl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => globalThis.__MECCHA_EGRESS_PROBE_COMPLETE__ === true, null, { timeout: 45000 });

    const evidenceEndpoint = new URL(evidenceUrl);
    evidenceEndpoint.searchParams.set("probe", probeId);
    const response = await fetch(evidenceEndpoint, {
      headers: { authorization: `Bearer ${fixtureToken}` }
    });
    if (!response.ok) throw new Error(`Fixture evidence endpoint failed with HTTP ${response.status}.`);
    const result = evaluateEgressEvidence(await response.json());
    console.log(JSON.stringify({ ok: result.ok, checkedChannels: result.checkedChannels, failures: result.failures }));
    if (!result.ok) throw new Error("Browser Run egress proof remains fail-closed.");
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      if (browser) await browser.close();
      if (sessionId) await closeSession(accountId, sessionId, token);
    } catch (closeError) {
      if (!primaryError) throw closeError;
      console.error("Browser Run cleanup also failed; session identifier is intentionally omitted.");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--run")) {
    await runLiveProof();
  } else {
    const fixture = process.env.BROWSER_EGRESS_FIXTURE_ORIGIN || "https://fixture.invalid";
    const body = buildGuardedSessionBody(fixture);
    const synthetic = evaluateEgressEvidence({
      schemaVersion: 1,
      channels: REQUIRED_EGRESS_CHANNELS.map((channel) => ({
        channel,
        decision: "disabled_before_attempt",
        disablementVerified: true
      }))
    });
    if (body.guardrails.allowedDomains.length !== 1 || !synthetic.ok) process.exitCode = 1;
    else console.log("Browser Run egress proof contract OK (live Browser Run was not started). ");
  }
}
