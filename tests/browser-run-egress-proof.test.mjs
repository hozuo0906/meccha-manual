import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_EGRESS_CHANNELS,
  assertEvidenceProbe,
  buildSanitizedEvidenceArtifact,
  buildGuardedSessionBody,
  cleanupLiveSession,
  connectBrowserSafely,
  evaluateEgressEvidence,
  requireSameOrigin,
  unwrapCloudflareResult,
  validatedHttpsUrl
} from "../scripts/browser-run-egress-proof.mjs";

test("guarded session uses one exact fixture hostname and disables recording", () => {
  assert.deepEqual(buildGuardedSessionBody("https://fixture.example.test/path"), {
    guardrails: { allowedDomains: ["fixture.example.test"] },
    recording: false,
    targets: false
  });
});

test("fixture and evidence URLs must be credential-free HTTPS", () => {
  assert.throws(() => validatedHttpsUrl("http://fixture.example.test", "FIXTURE"), /HTTPS/);
  assert.throws(() => validatedHttpsUrl("https://user:secret@fixture.example.test", "FIXTURE"), /credentials/);
  assert.throws(
    () => requireSameOrigin(new URL("https://fixture.example.test"), new URL("https://sink.example.test")),
    /same HTTPS origin/
  );
});

test("all required channels pass only with pre-byte peer proof or explicit disablement", () => {
  const evidence = {
    schemaVersion: 1,
    channels: REQUIRED_EGRESS_CHANNELS.map((channel) => ({
      channel,
      decision: "blocked_before_bytes",
      applicationBytesObserved: 0,
      actualPeerVerifiedBeforeBytes: true
    }))
  };
  assert.deepEqual(evaluateEgressEvidence(evidence), {
    ok: true,
    checkedChannels: REQUIRED_EGRESS_CHANNELS.length,
    failures: []
  });
});

test("a missing, leaked, or peer-unverified channel keeps the gate closed", () => {
  const channels = REQUIRED_EGRESS_CHANNELS.slice(1).map((channel) => ({
    channel,
    decision: "blocked_before_bytes",
    applicationBytesObserved: 0,
    actualPeerVerifiedBeforeBytes: true
  }));
  channels.find((item) => item.channel === "websocket").applicationBytesObserved = 1;
  channels.find((item) => item.channel === "webtransport_quic").actualPeerVerifiedBeforeBytes = false;
  const result = evaluateEgressEvidence({ schemaVersion: 1, channels });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, [
    "navigation:missing",
    "websocket:unproven",
    "webtransport_quic:unproven"
  ]);
});

test("claimed disablement requires independent verification", () => {
  const channels = REQUIRED_EGRESS_CHANNELS.map((channel) => ({
    channel,
    decision: "disabled_before_attempt",
    disablementVerified: true,
    applicationBytesObserved: 0
  }));
  channels.find((item) => item.channel === "download").disablementVerified = false;
  const result = evaluateEgressEvidence({ schemaVersion: 1, channels });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, ["download:unproven"]);
});

test("disabled evidence must also prove zero application bytes", () => {
  const channels = REQUIRED_EGRESS_CHANNELS.map((channel) => ({
    channel,
    decision: "disabled_before_attempt",
    disablementVerified: true,
    applicationBytesObserved: 0
  }));
  channels.find((item) => item.channel === "websocket").applicationBytesObserved = 1;
  const result = evaluateEgressEvidence({ schemaVersion: 1, channels });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, ["websocket:unproven"]);
});

test("duplicate and unexpected channels invalidate evidence", () => {
  const channels = REQUIRED_EGRESS_CHANNELS.map((channel) => ({
    channel,
    decision: "disabled_before_attempt",
    disablementVerified: true,
    applicationBytesObserved: 0
  }));
  channels.push({ ...channels[0] }, {
    channel: "future_transport",
    decision: "disabled_before_attempt",
    disablementVerified: true
  });
  const result = evaluateEgressEvidence({ schemaVersion: 1, channels });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, ["navigation:duplicate", "future_transport:unexpected"]);
});

test("remote DELETE is attempted even when browser close fails", async () => {
  let remoteCloseCalls = 0;
  await assert.rejects(
    cleanupLiveSession(
      { close: async () => { throw new Error("CDP transport lost"); } },
      async () => { remoteCloseCalls += 1; }
    ),
    /CDP transport lost/
  );
  assert.equal(remoteCloseCalls, 1);
});

test("both cleanup failures are retained", async () => {
  await assert.rejects(
    cleanupLiveSession(
      { close: async () => { throw new Error("browser close failed"); } },
      async () => { throw new Error("remote DELETE failed"); }
    ),
    (error) => error instanceof AggregateError && error.errors.length === 2
  );
});

test("a hanging browser close is bounded and cannot suppress remote DELETE", async () => {
  let remoteCloseCalls = 0;
  await assert.rejects(
    cleanupLiveSession(
      { close: async () => new Promise(() => {}) },
      async () => { remoteCloseCalls += 1; },
      10
    ),
    /Browser disconnect timed out/
  );
  assert.equal(remoteCloseCalls, 1);
});

test("a hanging remote DELETE is bounded and receives an abort signal", async () => {
  let receivedSignal;
  await assert.rejects(
    cleanupLiveSession(
      null,
      async (signal) => {
        receivedSignal = signal;
        return new Promise(() => {});
      },
      10,
      10
    ),
    /Remote session DELETE timed out/
  );
  assert.equal(receivedSignal.aborted, true);
});

test("CDP connection errors suppress debugger endpoint details", async () => {
  const secretEndpoint = "wss://secret.example.test/cdp/session-token";
  await assert.rejects(
    connectBrowserSafely(async () => { throw new Error(`connect failed: ${secretEndpoint}`); }),
    (error) => error.message === "Browser Run CDP connection failed; endpoint details were suppressed." &&
      !JSON.stringify(error).includes(secretEndpoint) &&
      !error.stack.includes(secretEndpoint)
  );
});

test("sanitized artifact is run/SHA-bound and excludes fixture secrets", () => {
  const evidence = {
    schemaVersion: 1,
    fixtureToken: "must-not-persist",
    probeId: "must-not-persist",
    channels: REQUIRED_EGRESS_CHANNELS.map((channel) => ({
      channel,
      decision: "blocked_before_bytes",
      applicationBytesObserved: 0,
      actualPeerVerifiedBeforeBytes: true,
      requestUrl: "https://secret.example.test/path",
      headers: { authorization: "must-not-persist" }
    }))
  };
  const artifact = buildSanitizedEvidenceArtifact(evidence, {
    commitSha: "a".repeat(40),
    runId: "12345",
    runAttempt: "2"
  });
  assert.equal(artifact.commitSha, "a".repeat(40));
  assert.equal(artifact.runId, "12345");
  assert.equal(artifact.channels.length, REQUIRED_EGRESS_CHANNELS.length);
  assert.doesNotMatch(JSON.stringify(artifact), /must-not-persist|secret\.example|requestUrl|headers|probeId/);
});

test("sanitized artifact rejects missing or malformed GitHub binding", () => {
  assert.throws(
    () => buildSanitizedEvidenceArtifact({ channels: [] }, { commitSha: "main", runId: "run", runAttempt: "1" }),
    /binding is invalid/
  );
});

test("evidence must belong to the current probe before evaluation", () => {
  const currentProbe = "11111111-1111-4111-8111-111111111111";
  assert.doesNotThrow(() => assertEvidenceProbe({ probeId: currentProbe }, currentProbe));
  assert.throws(
    () => assertEvidenceProbe({ probeId: "22222222-2222-4222-8222-222222222222" }, currentProbe),
    /current probe/
  );
  assert.throws(() => assertEvidenceProbe({}, currentProbe), /current probe/);
});

test("Cloudflare v4 success envelopes are unwrapped and malformed responses fail closed", () => {
  assert.deepEqual(unwrapCloudflareResult({ success: true, result: { sessionId: "session" } }), {
    sessionId: "session"
  });
  assert.throws(() => unwrapCloudflareResult({ success: true }), /invalid success envelope/);
  assert.throws(() => unwrapCloudflareResult({ success: false, result: {} }), /invalid success envelope/);
});
