import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { afterEach, test } from "node:test";
import { exportJWK, SignJWT } from "jose";
import {
  AccessIdentityError,
  authenticateApplicationRequest,
  createAccessAuthenticator,
  isMachineRouteAllowed,
  requireHumanActor,
  requireMachineRoute,
  resolveApplicationIdentity,
  verifyAccessJwt
} from "../apps/worker/src/access-identity.ts";
import { inspectAccessConfig } from "../apps/worker/src/server-config.ts";

const issuer = "https://team.example.invalid/";
const audience = "meccha-manual-staging";
const jwksUrl = "https://team.example.invalid/.well-known/jwks.json";
const env = { ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: audience, ACCESS_JWKS_URL: jwksUrl };
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const { privateKey: otherPrivateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicJwk = await exportJWK(publicKey);
publicJwk.kid = "local-test-key";
publicJwk.alg = "RS256";
publicJwk.use = "sig";
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function request(path = "/api/session", token) {
  const headers = token ? { "Cf-Access-Jwt-Assertion": token } : {};
  return new Request(`https://app.example.invalid${path}`, { headers });
}

function configureJwks(fetchImpl = async (url) => {
  assert.equal(url, jwksUrl);
  return Response.json({ keys: [publicJwk] });
}) {
  globalThis.fetch = fetchImpl;
}

async function accessToken(claims = {}, protectedHeader = {}) {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({
    type: "app",
    iss: issuer,
    aud: audience,
    sub: "subject-raw",
    exp: now + 300,
    iat: now,
    ...claims
  })
    .setProtectedHeader({ alg: "RS256", kid: "local-test-key", ...protectedHeader })
    .sign(privateKey);
}

async function tokenWithKey(key, claims = {}, protectedHeader = {}) {
  const now = Math.floor(Date.now() / 1_000);
  return new SignJWT({ type: "app", iss: issuer, aud: audience, sub: "subject-raw", exp: now + 300, iat: now, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "local-test-key", ...protectedHeader })
    .sign(key);
}

function assertIdentityError(action, status, code) {
  assert.throws(action, (error) => {
    assert.ok(error instanceof AccessIdentityError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

async function assertIdentityErrorAsync(action, status, code) {
  await assert.rejects(action, (error) => {
    assert.ok(error instanceof AccessIdentityError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    return true;
  });
}

test("Access設定はissuer/JWKSの信頼済みHTTPS URLだけを受け付ける", () => {
  assert.deepEqual(inspectAccessConfig(env), {
    configured: true,
    hasIssuer: true,
    hasAudience: true,
    hasJwksUrl: true,
    config: { issuer, audience, jwksUrl }
  });
  const issuerWithoutSlash = "https://team.example.invalid";
  assert.equal(inspectAccessConfig({ ...env, ACCESS_ISSUER: issuerWithoutSlash }).config?.issuer, issuerWithoutSlash);
  for (const key of ["ACCESS_ISSUER", "ACCESS_JWKS_URL"]) {
    for (const value of ["http://team.example.invalid", "https://user:pass@team.example.invalid", "https://team.example.invalid?x=1", "https://team.example.invalid/#fragment"]) {
      assert.equal(inspectAccessConfig({ ...env, [key]: value }).configured, false);
    }
  }
});

test("署名検証済みuser actorはsubjectの原文字列を保持してidentity lookupへ渡す", async () => {
  configureJwks();
  const token = await accessToken({ sub: "  subject-with-space  " });
  const actor = await verifyAccessJwt(request("/api/session", token), env);
  assert.deepEqual(actor, { kind: "access_user", issuer, subject: "  subject-with-space  " });

  const calls = [];
  const resolution = await resolveApplicationIdentity(actor, {
    async findByIssuerAndSubject(receivedIssuer, receivedSubject) {
      calls.push([receivedIssuer, receivedSubject]);
      return { applicationId: "app-user-1", status: "active" };
    }
  });
  assert.deepEqual(calls, [[issuer, "  subject-with-space  "]]);
  assert.deepEqual(resolution, { state: "active", identity: { applicationId: "app-user-1", issuer, subject: "  subject-with-space  " } });
});

test("issuerは末尾slashを補正せず、署名済みissの原文字列と一致させる", async () => {
  const issuerWithoutSlash = "https://team.example.invalid";
  const exactEnv = { ...env, ACCESS_ISSUER: issuerWithoutSlash };
  configureJwks();
  const actor = await verifyAccessJwt(request("/api/session", await accessToken({ iss: issuerWithoutSlash })), exactEnv);
  assert.deepEqual(actor, { kind: "access_user", issuer: issuerWithoutSlash, subject: "subject-raw" });
});

test("nbfなしservice tokenはmachine healthだけに許可されidentity lookupを行わない", async () => {
  configureJwks();
  const token = await accessToken({ sub: "", common_name: "runner.example" });
  const actor = await verifyAccessJwt(request("/health/config", token), env);
  assert.equal(actor.kind, "service_token");
  assert.equal(isMachineRouteAllowed(actor, request("/health/config")), true);
  assert.equal(isMachineRouteAllowed(actor, request("/api/session")), false);
  assert.equal(isMachineRouteAllowed(actor, request("/health/config?detail=1")), false);
  assert.equal(isMachineRouteAllowed(actor, new Request("https://app.example.invalid/health/config", { method: "POST" })), false);
  assertIdentityError(() => requireHumanActor(actor), 403, "ACCESS_ACTOR_FORBIDDEN");
  assertIdentityError(() => requireMachineRoute(actor, request("/api/session")), 403, "ACCESS_ACTOR_FORBIDDEN");

  let lookupCount = 0;
  assert.deepEqual(await resolveApplicationIdentity(actor, {
    async findByIssuerAndSubject() {
      lookupCount += 1;
      return { applicationId: "must-not-be-used", status: "active" };
    }
  }), { state: "unknown" });
  assert.equal(lookupCount, 0);
});

test("user actorはmachine routeへ到達できず、service tokenは人間routeへ昇格しない", async () => {
  configureJwks();
  const actor = await verifyAccessJwt(request("/api/session", await accessToken()), env);
  assert.equal(isMachineRouteAllowed(actor, request("/health/config")), false);
  assertIdentityError(() => requireMachineRoute(actor, request("/health/config")), 403, "ACCESS_ACTOR_FORBIDDEN");
});

test("identityのunknown/disabled/unavailableをactiveと取り違えない", async () => {
  configureJwks();
  const actor = await verifyAccessJwt(request("/api/session", await accessToken()), env);
  assert.deepEqual(await resolveApplicationIdentity(actor, { async findByIssuerAndSubject() { return null; } }), { state: "unknown" });
  assert.deepEqual(await resolveApplicationIdentity(actor, { async findByIssuerAndSubject() { return { applicationId: "app-user-1", status: "disabled" }; } }), { state: "disabled" });
  assert.deepEqual(await resolveApplicationIdentity(actor, { async findByIssuerAndSubject() { throw new Error("database unavailable"); } }), { state: "unavailable" });
  assert.deepEqual(await resolveApplicationIdentity(actor, { async findByIssuerAndSubject() { return { applicationId: "", status: "active" }; } }), { state: "unavailable" });
});

test("合成entrypointは検証済みactorだけをroute判定とidentity lookupへ渡す", async () => {
  configureJwks();
  const calls = [];
  const repository = {
    async findByIssuerAndSubject(receivedIssuer, receivedSubject) {
      calls.push([receivedIssuer, receivedSubject]);
      return { applicationId: "app-user-1", status: "active" };
    }
  };
  const userContext = await authenticateApplicationRequest(request("/api/session", await accessToken()), env, repository);
  assert.equal(userContext.kind, "application_user");
  assert.equal(calls.length, 1);

  calls.length = 0;
  const machineContext = await authenticateApplicationRequest(request("/health/config", await accessToken({ sub: "", common_name: "runner" })), env, repository);
  assert.equal(machineContext.kind, "machine");
  assert.equal(calls.length, 0);

  const unknownRepository = { async findByIssuerAndSubject() { return null; } };
  const unknownToken = await accessToken();
  await assertIdentityErrorAsync(() => authenticateApplicationRequest(request("/api/session", unknownToken), env, unknownRepository), 403, "ACCESS_ACTOR_FORBIDDEN");
  const unavailableToken = await accessToken();
  await assertIdentityErrorAsync(() => authenticateApplicationRequest(request("/api/session", unavailableToken), env, { async findByIssuerAndSubject() { throw new Error("D1 failure"); } }), 503, "ACCESS_IDENTITY_UNAVAILABLE");
});

test("JWTなし、設定不備、JWKS取得障害は安全な401/503になる", async () => {
  await assertIdentityErrorAsync(() => verifyAccessJwt(request(), env), 401, "ACCESS_JWT_REQUIRED");
  const validToken = await accessToken();
  await assertIdentityErrorAsync(() => verifyAccessJwt(request("/api/session", validToken), { ...env, ACCESS_AUDIENCE: "" }), 503, "ACCESS_CONFIG_UNAVAILABLE");
  globalThis.fetch = async () => { throw new Error("network secret must not escape"); };
  const unavailableToken = await accessToken();
  let error;
  try {
    await verifyAccessJwt(request("/api/session", unavailableToken), env);
    assert.fail("expected JWKS failure");
  } catch (caught) {
    error = caught;
  }
  assert.equal(error.status, 503);
  assert.equal(error.code, "ACCESS_JWKS_UNAVAILABLE");
  assert.doesNotMatch(error.message, /network|subject|@|token|secret/);
});

test("署名、algorithm、issuer、audience、期限、iat、nbfのnegativeを拒否する", async () => {
  configureJwks();
  const now = Math.floor(Date.now() / 1_000);
  const cases = [
    ["issuer", { iss: "https://other.example.invalid/" }],
    ["audience", { aud: "other-audience" }],
    ["expiration", { exp: now - 1 }],
    ["issued-at missing", { iat: undefined }],
    ["issued-at future", { iat: now + 3_600, exp: now + 7_200 }],
    ["not-before future", { nbf: now + 3_600, exp: now + 7_200 }],
    ["not-before wrong type", { nbf: "later" }],
    ["type missing", { type: undefined, expectedStatus: 403 }]
  ];
  for (const [, claims] of cases) {
    const { expectedStatus = 401, ...tokenClaims } = claims;
    const token = await accessToken(tokenClaims);
    await assertIdentityErrorAsync(() => verifyAccessJwt(request("/api/session", token), env), expectedStatus, expectedStatus === 403 ? "ACCESS_ACTOR_FORBIDDEN" : "ACCESS_JWT_INVALID");
  }

  const tampered = `${await accessToken()}.x`;
  await assertIdentityErrorAsync(() => verifyAccessJwt(request("/api/session", tampered), env), 401, "ACCESS_JWT_INVALID");
  const signedToken = await accessToken();
  const [header, tokenPayload, signature] = signedToken.split(".");
  const wrongAlgorithmHeader = Buffer.from(JSON.stringify({ alg: "HS256", kid: "local-test-key" })).toString("base64url");
  const wrongAlgorithm = `${wrongAlgorithmHeader}.${tokenPayload}.${signature}`;
  await assertIdentityErrorAsync(() => verifyAccessJwt(request("/api/session", wrongAlgorithm), env), 401, "ACCESS_JWT_INVALID");
});

test("sub/common_nameの曖昧なshapeとemailだけを全て拒否し秘密値をエラーへ出さない", async () => {
  configureJwks();
  const cases = [
    { sub: undefined },
    { sub: "" },
    { sub: "   " },
    { sub: 42 },
    { sub: "", common_name: undefined },
    { sub: "", common_name: "   " },
    { sub: "", common_name: null },
    { sub: "subject", common_name: "runner" },
    { sub: undefined, email: "person@example.invalid" }
  ];
  for (const claims of cases) {
    const token = await accessToken(claims);
    await assert.rejects(() => verifyAccessJwt(request("/api/session", token), env), (error) => {
      assert.equal(error.status, 403);
      assert.equal(error.code, "ACCESS_ACTOR_FORBIDDEN");
      assert.doesNotMatch(error.message, /person@example|runner|subject/);
      return true;
    });
  }
});

test("JWKSに該当kidがないJWTは401で、鍵URLの外部指定を行わない", async () => {
  let requestedUrl = "";
  configureJwks(async (url) => {
    requestedUrl = url;
    return Response.json({ keys: [publicJwk] });
  });
  const token = await accessToken({}, { kid: "attacker-selected-key" });
  await assertIdentityErrorAsync(() => verifyAccessJwt(request("/api/session", token), env), 401, "ACCESS_JWT_INVALID");
  assert.equal(requestedUrl, jwksUrl);
});

test("正しいJWKSに対する別RSA秘密鍵の署名は401になる", async () => {
  configureJwks();
  const token = await tokenWithKey(otherPrivateKey);
  await assertIdentityErrorAsync(() => verifyAccessJwt(request("/api/session", token), env), 401, "ACCESS_JWT_INVALID");
});

test("jku/x5uを無視し、同一認証器の2回検証で設定済みJWKSだけを1回取得する", async () => {
  let fetchCount = 0;
  configureJwks(async (url) => {
    fetchCount += 1;
    assert.equal(url, jwksUrl);
    return Response.json({ keys: [publicJwk] });
  });
  const authenticator = createAccessAuthenticator(env);
  const protectedHeader = {
    jku: "https://attacker.example.invalid/keys",
    x5u: "https://attacker.example.invalid/cert"
  };
  const token = await accessToken({}, protectedHeader);
  assert.equal((await authenticator.verify(request("/api/session", token))).kind, "access_user");
  assert.equal((await authenticator.verify(request("/api/session", token))).kind, "access_user");
  assert.equal(fetchCount, 1);
});

test("合成entrypointは不正JWTとservice business accessでlookupせず、disabledはlookup1回後403にする", async () => {
  configureJwks();
  let lookupCount = 0;
  const repository = {
    async findByIssuerAndSubject() {
      lookupCount += 1;
      return { applicationId: "app-user-1", status: "disabled" };
    }
  };
  await assertIdentityErrorAsync(() => authenticateApplicationRequest(request("/api/session", "invalid.jwt"), env, repository), 401, "ACCESS_JWT_INVALID");
  assert.equal(lookupCount, 0);

  const serviceToken = await accessToken({ sub: "", common_name: "runner" });
  await assertIdentityErrorAsync(() => authenticateApplicationRequest(request("/api/session", serviceToken), env, repository), 403, "ACCESS_ACTOR_FORBIDDEN");
  assert.equal(lookupCount, 0);
  const disabledToken = await accessToken();
  await assertIdentityErrorAsync(() => authenticateApplicationRequest(request("/api/session", disabledToken), env, repository), 403, "ACCESS_ACTOR_FORBIDDEN");
  assert.equal(lookupCount, 1);

  const machineToken = await accessToken({ sub: "", common_name: "runner" });
  const machinePost = new Request("https://app.example.invalid/health/config", { method: "POST", headers: { "Cf-Access-Jwt-Assertion": machineToken } });
  await assertIdentityErrorAsync(() => authenticateApplicationRequest(machinePost, env, repository), 403, "ACCESS_ACTOR_FORBIDDEN");
  assert.equal(lookupCount, 1);
});

test("壊れたJWKS JSONはJWT不正と混同せず503にする", async () => {
  globalThis.fetch = async () => new Response("not-json", { status: 200, headers: { "content-type": "application/json" } });
  const token = await accessToken();
  await assertIdentityErrorAsync(() => verifyAccessJwt(request("/api/session", token), env), 503, "ACCESS_JWKS_UNAVAILABLE");
});
