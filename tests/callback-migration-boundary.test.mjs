import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, test } from "node:test";

import worker from "../apps/worker/src/index.ts";
import phase2Worker from "../apps/worker/src/index-phase2.ts";

const originalFetch = globalThis.fetch;
const CALLBACK_PATHS = [
  "/v1/webhooks/stripe",
  "/v1/integrations/discord/interactions"
];

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function trackedCallbackEnvironment(bodyText = "{}") {
  const calls = {
    fetch: 0,
    kvGet: 0,
    kvPut: 0,
    waitUntil: 0,
    bodyRead: 0,
    d1: 0,
    queue: 0
  };
  const bytes = new TextEncoder().encode(bodyText);
  let bodySent = false;
  const body = new ReadableStream({
    pull(controller) {
      calls.bodyRead += 1;
      if (bodySent) return controller.close();
      bodySent = true;
      controller.enqueue(bytes);
      controller.close();
    }
  }, { highWaterMark: 0 });
  const db = {
    prepare() {
      calls.d1 += 1;
      throw new Error("D1 must not be reached while callback migration is in progress");
    }
  };
  const queue = {
    async send() {
      calls.queue += 1;
      throw new Error("Queue must not be reached while callback migration is in progress");
    }
  };
  const env = {
    DISCORD_PUBLIC_KEY: "00".repeat(32),
    DISCORD_ALLOWED_GUILD_IDS: "guild-id",
    DISCORD_ALLOWED_CHANNEL_IDS: "channel-id",
    GITHUB_ISSUE_TOKEN: "EXAMPLE_GITHUB_ISSUE_TOKEN",
    DISCORD_INTERACTION_STORE: {
      async get() {
        calls.kvGet += 1;
        return null;
      },
      async put() {
        calls.kvPut += 1;
      }
    },
    DB: db,
    CALLBACK_QUEUE: queue
  };
  const context = {
    waitUntil() {
      calls.waitUntil += 1;
    }
  };
  return { body, calls, context, env };
}

function validDiscordHeaders(bodyText = "{}") {
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const publicDer = publicKey.export({ format: "der", type: "spki" });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = sign(null, Buffer.from(`${timestamp}${bodyText}`), privateKey).toString("hex");
  return {
    headers: {
      "x-signature-ed25519": signature,
      "x-signature-timestamp": timestamp
    },
    publicKeyHex: publicDer.subarray(-32).toString("hex")
  };
}

const requestKinds = [
  {
    name: "valid signature",
    configure(fixture) {
      const signed = validDiscordHeaders(fixture.bodyText);
      fixture.env.DISCORD_PUBLIC_KEY = signed.publicKeyHex;
      return signed.headers;
    }
  },
  {
    name: "unsigned",
    configure() {
      return {};
    }
  },
  {
    name: "invalid body",
    configure() {
      return { "content-type": "application/json" };
    },
    bodyText: "not-json"
  },
  {
    name: "environment unset",
    configure(fixture) {
      fixture.env = {};
      return {};
    }
  }
];

for (const [entryName, candidate] of [["phase1", worker], ["phase2", phase2Worker]]) {
  for (const path of CALLBACK_PATHS) {
    for (const requestKind of requestKinds) {
      test(`${entryName} ${path} returns 503 without side effects for ${requestKind.name}`, async () => {
        const bodyText = requestKind.bodyText ?? "{}";
        const fixture = trackedCallbackEnvironment(bodyText);
        const headers = requestKind.configure(fixture);
        const request = new Request(`https://app.example${path}`, {
          method: "POST",
          headers,
          body: fixture.body,
          duplex: "half"
        });
        const bodyReadsBeforeDispatch = fixture.calls.bodyRead;
        assert.equal(bodyReadsBeforeDispatch, 0);
        globalThis.fetch = async () => {
          fixture.calls.fetch += 1;
          throw new Error("callback external fetch must not run while migration is in progress");
        };

        const response = await candidate.fetch(request, fixture.env, fixture.context);
        const payload = await response.json();

        assert.equal(response.status, 503);
        assert.equal(payload.code, "CALLBACK_MIGRATION_IN_PROGRESS");
        assert.equal(payload.message, "外部連携は移行中のため現在利用できません。");
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(fixture.calls.bodyRead, bodyReadsBeforeDispatch);
        assert.equal(fixture.calls.kvGet, 0);
        assert.equal(fixture.calls.kvPut, 0);
        assert.equal(fixture.calls.fetch, 0);
        assert.equal(fixture.calls.waitUntil, 0);
        assert.equal(fixture.calls.d1, 0);
        assert.equal(fixture.calls.queue, 0);
      });
    }

    test(`${entryName} ${path} sends non-POST requests to a stable 405`, async () => {
      const fixture = trackedCallbackEnvironment();
      const bodyReadsBeforeDispatch = fixture.calls.bodyRead;
      assert.equal(bodyReadsBeforeDispatch, 0);
      globalThis.fetch = async () => {
        fixture.calls.fetch += 1;
        throw new Error("callback external fetch must not run while migration is in progress");
      };
      const response = await candidate.fetch(new Request(`https://app.example${path}`, {
        method: "GET"
      }), fixture.env, fixture.context);

      assert.equal(response.status, 405);
      assert.equal((await response.json()).code, "METHOD_NOT_ALLOWED");
      assert.equal(fixture.calls.bodyRead, bodyReadsBeforeDispatch);
      assert.equal(fixture.calls.kvGet, 0);
      assert.equal(fixture.calls.kvPut, 0);
      assert.equal(fixture.calls.fetch, 0);
      assert.equal(fixture.calls.waitUntil, 0);
      assert.equal(fixture.calls.d1, 0);
      assert.equal(fixture.calls.queue, 0);
    });

    test(`${entryName} ${path}/subpath remains a 404`, async () => {
      const fixture = trackedCallbackEnvironment();
      const request = new Request(`https://app.example${path}/subpath`, {
        method: "POST",
        headers: { origin: "https://app.example" },
        body: fixture.body,
        duplex: "half"
      });
      const bodyReadsBeforeDispatch = fixture.calls.bodyRead;
      assert.equal(bodyReadsBeforeDispatch, 0);
      globalThis.fetch = async () => {
        fixture.calls.fetch += 1;
        throw new Error("callback external fetch must not run while migration is in progress");
      };
      const response = await candidate.fetch(request, fixture.env, fixture.context);

      assert.equal(response.status, 404);
      assert.equal((await response.json()).code, "NOT_FOUND");
      assert.equal(fixture.calls.bodyRead, bodyReadsBeforeDispatch);
      assert.equal(fixture.calls.kvGet, 0);
      assert.equal(fixture.calls.kvPut, 0);
      assert.equal(fixture.calls.fetch, 0);
      assert.equal(fixture.calls.waitUntil, 0);
      assert.equal(fixture.calls.d1, 0);
      assert.equal(fixture.calls.queue, 0);
    });
  }
}

for (const [entryName, candidate] of [["phase1", worker], ["phase2", phase2Worker]]) {
  test(`${entryName} guard前のbody読取りmutationはbody read 0 assertionで失敗する`, async () => {
    const fixture = trackedCallbackEnvironment("{}");
    const signed = validDiscordHeaders("{}");
    fixture.env.DISCORD_PUBLIC_KEY = signed.publicKeyHex;
    const request = new Request("https://app.example/v1/integrations/discord/interactions", {
      method: "POST",
      headers: signed.headers,
      body: fixture.body,
      duplex: "half"
    });

    await assert.rejects(async () => {
      await request.text();
      const response = await candidate.fetch(request, fixture.env, fixture.context);
      assert.equal(response.status, 503);
      assert.equal(fixture.calls.bodyRead, 0);
    }, assert.AssertionError);
    assert.equal(fixture.calls.bodyRead, 1);
  });
}
