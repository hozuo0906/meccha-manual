import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

let router = await readFile("apps/worker/src/manual-router.ts", "utf8");
router = replaceOnce(
  router,
  '  if (contentLength && Number(contentLength) > maxBytes) throw new Error("response too large");\n',
  '  if (contentLength && Number(contentLength) > maxBytes) {\n    await response.body?.cancel("response too large").catch(() => undefined);\n    throw new Error("response too large");\n  }\n',
  "oversized response cancellation"
);
await writeFile("apps/worker/src/manual-router.ts", router, "utf8");

let tests = await readFile("tests/manual-api.test.mjs", "utf8");
tests += `

test("oversized Content-Length response cancels its unread body immediately", async () => {
  let cancelled = false;
  const oversized = new Response(new ReadableStream({
    cancel() {
      cancelled = true;
    }
  }), {
    status: 200,
    headers: {
      "content-type": "application/json",
      "content-length": "600000",
      "content-range": "0-0/1"
    }
  });
  const mock = installFetch([authOk(), memberOk(), oversized]);
  try {
    const startedAt = Date.now();
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 502);
    assert.equal((await response.json()).code, "MANUALS_RESPONSE_INVALID");
    assert.equal(cancelled, true);
    assert.ok(Date.now() - startedAt < 1000, "oversized body cancellation should not wait for the 5-second deadline");
  } finally {
    mock.restore();
  }
});
`;
await writeFile("tests/manual-api.test.mjs", tests, "utf8");
