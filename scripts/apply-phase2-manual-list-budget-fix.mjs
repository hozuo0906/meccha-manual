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
  "const MAX_SUPABASE_JSON_BYTES = 512 * 1024;\nconst MAX_MANUAL_LIST_ITEMS = 1000;\n",
  "const MAX_SUPABASE_JSON_BYTES = 512 * 1024;\nconst MAX_MANUAL_LIST_JSON_BYTES = 1024 * 1024;\nconst MAX_MANUAL_LIST_ITEMS = 1000;\n",
  "manual list response budget constant"
);
router = replaceOnce(
  router,
  "async function readJsonLimited(response: Response): Promise<unknown> {\n  const text = await readTextLimited(response, MAX_SUPABASE_JSON_BYTES);\n",
  "async function readJsonLimited(\n  response: Response,\n  maxBytes = MAX_SUPABASE_JSON_BYTES\n): Promise<unknown> {\n  const text = await readTextLimited(response, maxBytes);\n",
  "parameterized JSON reader"
);
router = replaceOnce(
  router,
  "    payload = await readJsonLimited(response);\n  } catch {\n    throw new ManualError(502, \"MANUALS_RESPONSE_INVALID\"",
  "    payload = await readJsonLimited(response, MAX_MANUAL_LIST_JSON_BYTES);\n  } catch {\n    throw new ManualError(502, \"MANUALS_RESPONSE_INVALID\"",
  "manual list JSON budget use"
);
await writeFile("apps/worker/src/manual-router.ts", router, "utf8");

let tests = await readFile("tests/manual-api.test.mjs", "utf8");
tests += `

test("1000 worst-case JSON-escaped titles fit the dedicated manual list budget", async () => {
  const title = "\\u0001".repeat(64);
  const rows = Array.from({ length: 1000 }, (_, index) => ({
    ...manualRow(index + 1),
    title
  }));
  const serialized = JSON.stringify(rows);
  const serializedBytes = Buffer.byteLength(serialized);
  assert.ok(serializedBytes > 512 * 1024, "fixture must exceed the generic Supabase JSON budget");
  assert.ok(serializedBytes < 1024 * 1024, "fixture must fit the dedicated manual list budget");

  const mock = installFetch([
    authOk(),
    memberOk(),
    new Response(serialized, {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(serializedBytes),
        "content-range": "0-999/1000"
      }
    })
  ]);
  try {
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 200);
    const body = await response.json();
    assert.equal(body.manuals.length, 1000);
    assert.equal(body.manuals[0].title, title);
  } finally {
    mock.restore();
  }
});
`;
await writeFile("tests/manual-api.test.mjs", tests, "utf8");

let docs = await readFile("docs/05-api/phase2-manual-api.md", "utf8");
docs = replaceOnce(
  docs,
  "- header欠落、件数不整合、不正なrow、過大/非JSONの上流応答は空一覧にせず502とする。\n",
  "- header欠落、件数不整合、不正なrow、過大/非JSONの上流応答は空一覧にせず502とする。\n- 一覧本文は1000件・title最大64 code point・JSON最悪エスケープを含めて1 MiBで打ち切り、その他のSupabase JSON応答は512 KiBを維持する。\n",
  "manual list response budget contract"
);
await writeFile("docs/05-api/phase2-manual-api.md", docs, "utf8");
