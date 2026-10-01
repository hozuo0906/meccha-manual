import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
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
const MAIN_REF = "refs/heads/main";

export function assertLiveWorkflowContext(context) {
  const commitSha = context?.commitSha;
  const candidateSha = context?.candidateSha;
  const valid =
    context?.eventName === "workflow_dispatch" &&
    context?.confirmation === LIVE_CONFIRMATION &&
    context?.ref === MAIN_REF &&
    typeof commitSha === "string" &&
    /^[0-9a-f]{40}$/u.test(commitSha) &&
    typeof candidateSha === "string" &&
    /^[0-9a-f]{40}$/u.test(candidateSha) &&
    commitSha === candidateSha &&
    context?.runAttempt === "1" &&
    context?.stagingReady === "v1";
  if (!valid) throw new Error("Live proof workflow context is invalid.");
}

function assertLiveWorkflowEnvironment() {
  assertLiveWorkflowContext({
    eventName: process.env.GITHUB_EVENT_NAME,
    confirmation: process.env.BROWSER_EGRESS_RUN_CONFIRMATION,
    ref: process.env.GITHUB_REF,
    commitSha: process.env.GITHUB_SHA,
    candidateSha: process.env.BROWSER_EGRESS_CANDIDATE_SHA,
    runAttempt: process.env.GITHUB_RUN_ATTEMPT,
    stagingReady: process.env.MECCHA_MANUAL_BROWSER_EGRESS_STAGING_READY
  });
}

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
      failures.push("channel:unexpected");
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
      result.disablementVerified === true &&
      result.applicationBytesObserved === 0;
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

export function buildSanitizedEvidenceArtifact(evidence, context) {
  const commitSha = typeof context?.commitSha === "string" && /^[0-9a-f]{40}$/u.test(context.commitSha)
    ? context.commitSha
    : null;
  const runId = typeof context?.runId === "string" && /^\d+$/u.test(context.runId) ? context.runId : null;
  const runAttempt = typeof context?.runAttempt === "string" && /^\d+$/u.test(context.runAttempt)
    ? context.runAttempt
    : null;
  if (!commitSha || !runId || !runAttempt) throw new Error("GitHub run/SHA artifact binding is invalid.");

  const byChannel = new Map((evidence?.channels ?? []).map((item) => [item.channel, item]));
  return {
    schemaVersion: 1,
    commitSha,
    runId,
    runAttempt,
    channels: REQUIRED_EGRESS_CHANNELS.map((channel) => {
      const item = byChannel.get(channel) ?? {};
      return {
        channel,
        decision: item.decision === "blocked_before_bytes" || item.decision === "disabled_before_attempt"
          ? item.decision
          : "unproven",
        applicationBytesObserved: Number.isSafeInteger(item.applicationBytesObserved) && item.applicationBytesObserved >= 0
          ? item.applicationBytesObserved
          : null,
        actualPeerVerifiedBeforeBytes: item.actualPeerVerifiedBeforeBytes === true,
        disablementVerified: item.disablementVerified === true
      };
    })
  };
}

export function assertEvidenceProbe(evidence, expectedProbeId) {
  if (
    typeof expectedProbeId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(expectedProbeId) ||
    evidence?.probeId !== expectedProbeId
  ) {
    throw new Error("Fixture evidence does not match the current probe.");
  }
}

async function cloudflareRequest(path, init, token) {
  return fetchCloudflareResultSafely(path, init, token);
}

export async function fetchCloudflareResultSafely(path, init, token, fetchImpl = fetch, timeoutMs = 10000) {
  const execute = async (signal) => {
    const response = await fetchImpl(`${API_ORIGIN}${path}`, {
      ...init,
      signal: init?.signal ?? signal,
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        ...init?.headers
      }
    });
    if (!response.ok) throw new Error(`Cloudflare Browser Run API failed with HTTP ${response.status}.`);
    return unwrapCloudflareResult(await response.json());
  };
  if (init?.signal) return execute(init.signal);
  return withAbortTimeout(execute, timeoutMs, "Cloudflare Browser Run API timed out.");
}

export function unwrapCloudflareResult(envelope) {
  if (!envelope || envelope.success !== true || !envelope.result || typeof envelope.result !== "object") {
    throw new Error("Cloudflare Browser Run API returned an invalid success envelope.");
  }
  return envelope.result;
}

async function closeSession(accountId, sessionId, token, signal) {
  const encodedAccount = encodeURIComponent(accountId);
  const encodedSession = encodeURIComponent(sessionId);
  const result = await cloudflareRequest(
    `/client/v4/accounts/${encodedAccount}/browser-rendering/devtools/browser/${encodedSession}`,
    { method: "DELETE", signal },
    token
  );
  if (result.status !== "closed" && result.status !== "closing") {
    throw new Error("Browser Run session close was not accepted.");
  }
}

export async function cleanupLiveSession(
  browser,
  closeRemoteSession,
  browserCloseTimeoutMs = 5000,
  remoteCloseTimeoutMs = 10000
) {
  let browserCloseError;
  try {
    if (browser) await withTimeout(() => browser.close(), browserCloseTimeoutMs, "Browser disconnect timed out.");
  } catch (error) {
    browserCloseError = error;
  }

  let remoteCloseError;
  try {
    await withAbortTimeout(closeRemoteSession, remoteCloseTimeoutMs, "Remote session DELETE timed out.");
  } catch (error) {
    remoteCloseError = error;
  }

  if (browserCloseError && remoteCloseError) {
    throw new AggregateError([browserCloseError, remoteCloseError], "Browser and remote session cleanup both failed.");
  }
  if (browserCloseError) throw browserCloseError;
  if (remoteCloseError) throw remoteCloseError;
}

export async function withAbortTimeout(operation, timeoutMs, message) {
  const controller = new AbortController();
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(() => operation(controller.signal)),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(new Error(message));
        }, timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function withTimeout(operation, timeoutMs, message) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(operation),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(message)), timeoutMs);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function connectBrowserSafely(connect, timeoutMs = 10000) {
  try {
    return await connect(timeoutMs);
  } catch {
    throw new Error("Browser Run CDP connection failed; endpoint details were suppressed.");
  }
}

export async function fetchEvidenceSafely(evidenceEndpoint, fixtureToken, fetchImpl = fetch, timeoutMs = 10000) {
  try {
    return await withAbortTimeout(
      async (signal) => {
        const response = await fetchImpl(evidenceEndpoint, {
          headers: { authorization: `Bearer ${fixtureToken}` },
          signal
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      },
      timeoutMs,
      "Fixture evidence retrieval timed out."
    );
  } catch (error) {
    if (error instanceof Error && error.message === "Fixture evidence retrieval timed out.") throw error;
    throw new Error("Fixture evidence retrieval failed; endpoint details were suppressed.");
  }
}

export async function getProofPageSafely(browser, timeoutMs = 10000) {
  try {
    return await withTimeout(async () => {
      const context = browser.contexts()[0] ?? await browser.newContext();
      const page = context.pages()[0] ?? await context.newPage();
      return page;
    }, timeoutMs, "Browser Run CDP setup timed out.");
  } catch {
    throw new Error("Browser Run CDP setup failed; endpoint details were suppressed.");
  }
}

export async function runPageProbeSafely(page, startUrl) {
  try {
    await page.goto(startUrl.href, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForFunction(() => globalThis.__MECCHA_EGRESS_PROBE_COMPLETE__ === true, null, { timeout: 45000 });
  } catch {
    throw new Error("Browser Run fixture navigation failed; URL details were suppressed.");
  }
}

async function runLiveProof() {
  assertLiveWorkflowEnvironment();

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
    browser = await connectBrowserSafely((timeout) => chromium.connectOverCDP(created.webSocketDebuggerUrl, {
      headers: { authorization: `Bearer ${token}` },
      timeout
    }));
    const page = await getProofPageSafely(browser);
    const startUrl = new URL("/browser-run-egress/start", fixture);
    startUrl.searchParams.set("probe", probeId);
    await runPageProbeSafely(page, startUrl);

    const evidenceEndpoint = new URL(evidenceUrl);
    evidenceEndpoint.searchParams.set("probe", probeId);
    const evidence = await fetchEvidenceSafely(evidenceEndpoint, fixtureToken);
    assertEvidenceProbe(evidence, probeId);
    const result = evaluateEgressEvidence(evidence);
    console.log(JSON.stringify({ ok: result.ok, checkedChannels: result.checkedChannels, failures: result.failures }));
    if (!result.ok) throw new Error("Browser Run egress proof remains fail-closed.");
    const artifact = buildSanitizedEvidenceArtifact(evidence, {
      commitSha: process.env.GITHUB_SHA,
      runId: process.env.GITHUB_RUN_ID,
      runAttempt: process.env.GITHUB_RUN_ATTEMPT
    });
    await writeFile(
      process.env.BROWSER_EGRESS_ARTIFACT_PATH || "browser-run-egress-evidence.json",
      `${JSON.stringify(artifact, null, 2)}\n`,
      { encoding: "utf8", mode: 0o600 }
    );
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await cleanupLiveSession(
        browser,
        async (signal) => {
          if (sessionId) await closeSession(accountId, sessionId, token, signal);
        }
      );
    } catch (closeError) {
      if (!primaryError) throw closeError;
      console.error("Browser Run cleanup also failed; session identifier is intentionally omitted.");
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes("--preflight")) {
    assertLiveWorkflowEnvironment();
    console.log("Browser Run egress proof workflow preflight OK (staging was not requested). ");
  } else if (process.argv.includes("--run")) {
    await runLiveProof();
  } else {
    const fixture = process.env.BROWSER_EGRESS_FIXTURE_ORIGIN || "https://fixture.invalid";
    const body = buildGuardedSessionBody(fixture);
    const synthetic = evaluateEgressEvidence({
      schemaVersion: 1,
      channels: REQUIRED_EGRESS_CHANNELS.map((channel) => ({
        channel,
        decision: "disabled_before_attempt",
        disablementVerified: true,
        applicationBytesObserved: 0
      }))
    });
    if (body.guardrails.allowedDomains.length !== 1 || !synthetic.ok) process.exitCode = 1;
    else console.log("Browser Run egress proof contract OK (live Browser Run was not started). ");
  }
}
