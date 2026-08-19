import assert from "node:assert/strict";
import test from "node:test";
import {
  REQUIRED_EGRESS_CHANNELS,
  buildGuardedSessionBody,
  evaluateEgressEvidence,
  requireSameOrigin,
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
    disablementVerified: true
  }));
  channels.find((item) => item.channel === "download").disablementVerified = false;
  const result = evaluateEgressEvidence({ schemaVersion: 1, channels });
  assert.equal(result.ok, false);
  assert.deepEqual(result.failures, ["download:unproven"]);
});

test("duplicate and unexpected channels invalidate evidence", () => {
  const channels = REQUIRED_EGRESS_CHANNELS.map((channel) => ({
    channel,
    decision: "disabled_before_attempt",
    disablementVerified: true
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
