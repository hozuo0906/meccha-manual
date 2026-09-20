import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildContinueUrl, createHandoffId, createHandoffMetadata } from "../apps/extension/editor/handoff.js";
import { getOnboardingOrigin } from "../apps/extension/onboarding-config.js";
import { ONBOARDING_CSS, ONBOARDING_JS, renderOnboardingContinuePage } from "../apps/worker/src/onboarding-assets.ts";

test("handoff is 256-bit metadata and only the allowlisted origin can be used", () => {
  const id = createHandoffId(new Uint8Array(32));
  assert.match(id, /^[A-Za-z0-9_-]{43}$/);
  const metadata = createHandoffMetadata("draft-1", "save", Date.parse("2026-09-20T00:00:00Z"));
  assert.equal(metadata.draftId, "draft-1");
  assert.equal(metadata.outputAction, "save");
  assert.equal("title" in metadata, false);
  assert.match(buildContinueUrl("https://meccha-manual.meccha-iiyatsu.com", metadata.handoffId), /#handoff=/);
  assert.throws(() => buildContinueUrl("https://example.invalid", metadata.handoffId), /ORIGIN_NOT_ALLOWED/);
});

test("limited distribution keeps registration origin pending", () => {
  assert.equal(getOnboardingOrigin(), null);
  assert.equal(getOnboardingOrigin({ status: "ready", origin: "https://example.invalid" }), null);
  assert.equal(getOnboardingOrigin({ status: "ready", origin: "https://meccha-manual.meccha-iiyatsu.com" }), "https://meccha-manual.meccha-iiyatsu.com");
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
  assert.doesNotMatch(ONBOARDING_JS, /manualId|screenshot|assetCount|title/);
  assert.doesNotMatch(ONBOARDING_CSS, /unsafe-inline/);
});

test("editor gate keeps save failure from opening registration", async () => {
  const source = await readFile(new URL("../apps/extension/editor/editor.js", import.meta.url), "utf8");
  assert.match(source, /if \(!await persist\(/);
  assert.match(source, /保存に失敗したため、登録画面へ進めません/);
  assert.doesNotMatch(source, /__MECCHA_MANUAL_APP_ORIGIN__/);
});
