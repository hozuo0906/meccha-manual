import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildContinueUrl, createHandoffId, createHandoffMetadata, pruneExpiredHandoffs } from "../apps/extension/editor/handoff.js";
import { getOnboardingOrigin } from "../apps/extension/onboarding-config.js";
import { ONBOARDING_CSS, ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";
import worker from "../apps/worker/src/index.ts";
import { inspectAppRuntimeConfig, isConfiguredOnboardingOrigin } from "../apps/worker/src/server-config.ts";

test("handoff is 256-bit metadata and only the staging origin can be used", () => {
  const id = createHandoffId(new Uint8Array(32));
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  const extensionId = "a".repeat(32);
  const metadata = createHandoffMetadata("draft-1", "save", Date.parse("2026-09-20T00:00:00Z"), extensionId);
  assert.equal(metadata.draftId, "draft-1");
  assert.equal(metadata.outputAction, "save");
  assert.equal("title" in metadata, false);
  assert.match(buildContinueUrl("https://meccha-manual-staging.meccha-iiyatsu.com", metadata.handoffId, extensionId), /^https:\/\/meccha-manual-staging\.meccha-iiyatsu\.com\/onboarding\/continue#handoff=.*&extensionId=a{32}$/);
  for (const origin of [
    "https://meccha-manual.meccha-iiyatsu.com",
    "https://meccha-manual-staging.meccha-iiyatsu.com.evil.invalid",
    "https://meccha-manual-staging.meccha-iiyatsu.com:443",
    "https://user:pass@meccha-manual-staging.meccha-iiyatsu.com",
    "http://localhost:8787",
    "https://meccha-manual-staging.meccha-iiyatsu.com/path",
    "https://meccha-manual-staging.meccha-iiyatsu.com?redirect=1"
  ]) assert.throws(() => buildContinueUrl(origin, metadata.handoffId, extensionId), /ORIGIN_NOT_ALLOWED/);
});

test("staging distribution is ready and rejects every non-staging config", () => {
  assert.equal(getOnboardingOrigin(), "https://meccha-manual-staging.meccha-iiyatsu.com");
  assert.equal(getOnboardingOrigin({ status: "pending", origin: "https://meccha-manual-staging.meccha-iiyatsu.com" }), null);
  assert.equal(getOnboardingOrigin({ status: "ready", origin: "https://example.invalid" }), null);
  for (const origin of [
    "https://meccha-manual.meccha-iiyatsu.com",
    "https://meccha-manual-staging.meccha-iiyatsu.com.evil.invalid",
    "https://meccha-manual-staging.meccha-iiyatsu.com:443",
    "https://user:pass@meccha-manual-staging.meccha-iiyatsu.com",
    "http://localhost:8787",
    "https://meccha-manual-staging.meccha-iiyatsu.com/path",
    "https://meccha-manual-staging.meccha-iiyatsu.com?redirect=1"
  ]) assert.equal(getOnboardingOrigin({ status: "ready", origin }), null);
});

test("expired handoff metadata is pruned without touching local draft content", async () => {
  const removed = [];
  const storage = {
    async get() { return {
      "meccha-manual:handoff:expired": { expiresAt: "2026-09-19T23:00:00.000Z" },
      "meccha-manual:handoff:fresh": { expiresAt: "2026-09-20T02:00:00.000Z", draftId: "draft-1" },
      draft: { id: "draft-1", title: "local" }
    }; },
    async remove(keys) { removed.push(...keys); }
  };
  await pruneExpiredHandoffs(storage, Date.parse("2026-09-20T00:00:00.000Z"));
  assert.deepEqual(removed, ["meccha-manual:handoff:expired"]);
});

test("onboarding page uses CSP-compatible external assets and metadata-only bootstrap", () => {
  const html = renderOnboardingContinuePage({ bootstrapEnabled: false });
  assert.match(html, /data-bootstrap-enabled="false"/);
  assert.match(html, /assets\/onboarding\.css/);
  assert.match(html, /assets\/onboarding\.js/);
  assert.doesNotMatch(html, /<style|<script>[^<]/);
  assert.match(ONBOARDING_JS, /fetch\("\/api\/onboarding\/bootstrap"/);
  assert.match(ONBOARDING_JS, /credentials: "same-origin"/);
  assert.match(ONBOARDING_JS, /sessionStorage/);
  assert.match(ONBOARDING_JS, /HANDOFF_TTL_MS/);
  assert.match(ONBOARDING_JS, /handoff\.asset\.chunk/);
  assert.match(ONBOARDING_JS, /claim-intents/);
  assert.match(ONBOARDING_JS, /claimStatus: "finalize-pending"/);
  assert.match(ONBOARDING_JS, /method: "GET"/);
  assert.match(ONBOARDING_JS, /X-Requested-With/);
  assert.match(ONBOARDING_JS, /手順書を保存/);
  assert.doesNotMatch(ONBOARDING_CSS, /unsafe-inline/);
});

test("runtime config requires an exact environment and onboarding origin pair", () => {
  const staging = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com"
  };
  assert.equal(inspectAppRuntimeConfig(staging).configured, true);
  assert.equal(isConfiguredOnboardingOrigin(staging.APP_BASE_URL, staging), true);
  const production = {
    APP_ENV: "production",
    APP_BASE_URL: "https://meccha-manual.meccha-iiyatsu.com"
  };
  assert.equal(inspectAppRuntimeConfig(production).configured, true);
  assert.equal(isConfiguredOnboardingOrigin(production.APP_BASE_URL, production), true);
  assert.equal(isConfiguredOnboardingOrigin("https://meccha-manual-staging.meccha-iiyatsu.com.evil.invalid", staging), false);
  for (const env of [
    {},
    { APP_ENV: "staging" },
    { APP_BASE_URL: staging.APP_BASE_URL },
    { APP_ENV: "production", APP_BASE_URL: staging.APP_BASE_URL },
    { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual.meccha-iiyatsu.com" },
    { APP_ENV: "staging", APP_BASE_URL: `${staging.APP_BASE_URL}/` },
    { APP_ENV: "staging", APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com?redirect=1" }
  ]) {
    assert.equal(inspectAppRuntimeConfig(env).configured, false, JSON.stringify(env));
  }
});

test("dedicated onboarding Wrangler config separates staging and fail-closed production", async () => {
  const config = JSON.parse(await readFile(new URL("../wrangler.onboarding.jsonc", import.meta.url), "utf8"));
  const runbook = await readFile(new URL("../docs/08-operations/onboarding-b-owner-pilot-runtime.md", import.meta.url), "utf8");
  assert.equal(config.main, "apps/worker/src/index.ts");
  assert.equal(config.keep_vars, true);
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.env.staging.preview_urls, true);
  assert.equal(config.env.production.preview_urls, false);
  assert.deepEqual(config.env.staging.vars, {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com"
  });
  assert.equal(config.env.staging.d1_databases[0].database_id, "99b0c9b6-2bdf-4e65-9c43-3e336b6d3376");
  assert.deepEqual(config.env.staging.ratelimits[0].simple, { limit: 10, period: 60 });
  assert.match(config.env.production.d1_databases[0].database_id, /^__PENDING_/);
  assert.match(config.env.production.ratelimits[0].namespace_id, /^__PENDING_/);
  assert.equal("r2_buckets" in config.env.staging, false);
  assert.equal("r2_buckets" in config.env.production, false);
  assert.equal("ai" in config.env.staging, false);
  assert.equal("durable_objects" in config.env.production, false);
  assert.doesNotMatch(runbook, /99b0c9b6-2bdf-4e65-9c43-3e336b6d3376|cloudflareaccess\.com|cdn-cgi\/access\/certs/u);
});

test("editor gate keeps save failure from opening registration", async () => {
  const source = await readFile(new URL("../apps/extension/editor/editor.js", import.meta.url), "utf8");
  assert.match(source, /if \(!await persist\(/);
  assert.match(source, /保存に失敗したため、登録画面へ進めません/);
  assert.doesNotMatch(source, /__MECCHA_MANUAL_APP_ORIGIN__/);
});

test("worker serves onboarding page/assets and fails closed when bindings are unavailable", async () => {
  const configuredEnv = {
    APP_ENV: "staging",
    APP_BASE_URL: "https://meccha-manual-staging.meccha-iiyatsu.com",
    ACCESS_ISSUER: "https://issuer.example.invalid",
    ACCESS_AUDIENCE: "meccha-manual",
    ACCESS_JWKS_URL: "https://issuer.example.invalid/.well-known/jwks.json",
    DB: {},
    ONBOARDING_RATE_LIMITER: {}
  };
  const page = await worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/onboarding/continue"), configuredEnv, {});
  assert.equal(page.status, 200);
  const pageText = await page.text();
  assert.match(pageText, /data-bootstrap-enabled="true"/);
  assert.match(pageText, /assets\/onboarding\.css/);
  assert.match(pageText, /assets\/onboarding\.js/);
  assert.equal((await (worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/assets/onboarding.js"), configuredEnv, {}))).headers.get("cache-control"), "no-store");
  assert.match(page.headers.get("content-security-policy"), /script-src 'self'/);
  assert.doesNotMatch(page.headers.get("content-security-policy"), /unsafe-inline/);
  const mismatchedOrigin = await worker.fetch(new Request("https://meccha-manual.meccha-iiyatsu.com/onboarding/continue"), configuredEnv, {});
  assert.match(await mismatchedOrigin.text(), /data-bootstrap-enabled="false"/);
  const productionPage = await worker.fetch(new Request("https://meccha-manual.meccha-iiyatsu.com/onboarding/continue"), {
    ...configuredEnv,
    APP_ENV: "production",
    APP_BASE_URL: "https://meccha-manual.meccha-iiyatsu.com"
  }, {});
  assert.match(await productionPage.text(), /data-bootstrap-enabled="true"/);
  const css = await worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/assets/onboarding.css"), configuredEnv, {});
  const js = await worker.fetch(new Request("https://meccha-manual-staging.meccha-iiyatsu.com/assets/onboarding.js"), configuredEnv, {});
  assert.equal(css.status, 200);
  assert.equal(js.status, 200);
  assert.match(await js.text(), /\/api\/onboarding\/bootstrap/);
  const pending = await worker.fetch(new Request("https://meccha-manual.meccha-iiyatsu.com/onboarding/continue"), { ACCESS_ISSUER: "", ACCESS_AUDIENCE: "", ACCESS_JWKS_URL: "" }, {});
  assert.equal(pending.status, 200);
  assert.match(await pending.text(), /data-bootstrap-enabled="false"/);
});
