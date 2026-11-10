import assert from "node:assert/strict";
import { test } from "node:test";

import worker from "../apps/worker/src/index.ts";
import phase2Worker from "../apps/worker/src/index-phase2.ts";

const CALLBACK_PATHS = [
  "/v1/webhooks/stripe",
  "/v1/integrations/discord/interactions"
];

for (const [entryName, candidate] of [["phase1", worker], ["phase2", phase2Worker]]) {
  for (const path of CALLBACK_PATHS) {
    test(`${entryName} ${path} returns the migration 503 stub`, async () => {
      const response = await candidate.fetch(new Request(`https://app.example${path}`, {
        method: "POST"
      }), {}, { waitUntil() { throw new Error("callback stub must not start background work"); } });

      assert.equal(response.status, 503);
      assert.deepEqual(await response.json(), {
        code: "CALLBACK_MIGRATION_IN_PROGRESS",
        message: "外部連携は移行中のため現在利用できません。"
      });
      assert.equal(response.headers.get("cache-control"), "no-store");
    });
  }
}

test("phase2 Access migration preserves capture authorization before the Browser egress contract", async () => {
  for (const path of [
    "/api/workspaces/11111111-1111-4111-8111-111111111111/capture-sessions",
    "/v1/workspaces/11111111-1111-4111-8111-111111111111/capture-sessions/22222222-2222-4222-8222-222222222222/live-url",
    "/api/workspaces/11111111-1111-4111-8111-111111111111/mobile-preview-sessions",
    "/v1/workspaces/11111111-1111-4111-8111-111111111111/mobile-preview-sessions"
  ]) {
    const response = await phase2Worker.fetch(new Request(`https://app.example${path}`, {
      method: "POST",
      headers: { origin: "https://app.example" }
    }), {
      ACCESS_ISSUER: "https://access.example.invalid",
      ACCESS_AUDIENCE: "access-configured",
      ACCESS_JWKS_URL: "https://access.example.invalid/.well-known/jwks.json",
      DB: { prepare() { throw new Error("D1 must not be reached before Access authentication"); } }
    }, { waitUntil() {} });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "ACCESS_JWT_REQUIRED");
  }
});
