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
  `}\n\nasync function requireSession(request: Request, env: ManualEnv): Promise<{ userId: string; accessToken: string }> {`,
  `}\n\nasync function cancelUnreadResponseBody(response: Response): Promise<void> {\n  if (!response.body) return;\n  try {\n    await response.body.cancel("response body not consumed");\n  } catch {\n    // The response is already terminating; cancellation is best effort.\n  }\n}\n\nasync function requireSession(request: Request, env: ManualEnv): Promise<{ userId: string; accessToken: string }> {`,
  "response cancellation helper"
);

router = replaceOnce(
  router,
  `  if (response.status === 401) {\n    if (refreshToken) throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n    throw new ManualError(401, "SESSION_EXPIRED", "セッションの有効期限が切れました。もう一度ログインしてください。");\n  }\n  if (!response.ok) {\n    throw new ManualError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");\n  }`,
  `  if (response.status === 401) {\n    await cancelUnreadResponseBody(response);\n    if (refreshToken) throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n    throw new ManualError(401, "SESSION_EXPIRED", "セッションの有効期限が切れました。もう一度ログインしてください。");\n  }\n  if (!response.ok) {\n    await cancelUnreadResponseBody(response);\n    throw new ManualError(502, "SESSION_VERIFY_FAILED", "セッション状態を確認できませんでした。時間をおいて、もう一度お試しください。");\n  }`,
  "session status exits"
);

router = replaceOnce(
  router,
  `  if (response.status === 401) throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n  if (!response.ok) throw new ManualError(502, failureCode, failureMessage);`,
  `  if (response.status === 401) {\n    await cancelUnreadResponseBody(response);\n    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n  }\n  if (!response.ok) {\n    await cancelUnreadResponseBody(response);\n    throw new ManualError(502, failureCode, failureMessage);\n  }`,
  "boolean RPC status exits"
);

router = replaceOnce(
  router,
  `  if (response.status === 401) throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n  if (!response.ok) throw new ManualError(502, "MANUALS_FETCH_FAILED", "手順書を取得できませんでした。時間をおいて、もう一度お試しください。");`,
  `  if (response.status === 401) {\n    await cancelUnreadResponseBody(response);\n    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n  }\n  if (!response.ok) {\n    await cancelUnreadResponseBody(response);\n    throw new ManualError(502, "MANUALS_FETCH_FAILED", "手順書を取得できませんでした。時間をおいて、もう一度お試しください。");\n  }`,
  "manual list status exits"
);

router = replaceOnce(
  router,
  `  if (response.status === 401) throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n  if (!response.ok) {\n    if (response.status >= 500) {\n      throw new ManualError(502, "MANUAL_CREATE_RESULT_UNKNOWN", "作成結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");\n    }`,
  `  if (response.status === 401) {\n    await cancelUnreadResponseBody(response);\n    throw new ManualError(401, "SESSION_REFRESH_REQUIRED", "ログイン状態を更新してください。");\n  }\n  if (!response.ok) {\n    if (response.status >= 500) {\n      await cancelUnreadResponseBody(response);\n      throw new ManualError(502, "MANUAL_CREATE_RESULT_UNKNOWN", "作成結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。");\n    }`,
  "manual create status exits"
);

await writeFile("apps/worker/src/manual-router.ts", router, "utf8");

let apiTests = await readFile("tests/manual-api.test.mjs", "utf8");
apiTests += `\n\ntest("status-only create failure cancels the unread Supabase body", async () => {\n  let cancelled = false;\n  const stalledFailure = new Response(new ReadableStream({\n    cancel() {\n      cancelled = true;\n    }\n  }), {\n    status: 500,\n    headers: { "content-type": "application/json" }\n  });\n  const mock = installFetch([authOk(), memberOk(), editorOk(), stalledFailure]);\n  try {\n    const startedAt = Date.now();\n    const response = await handleManualRoute(\n      request("POST", JSON.stringify({ title: "保存手順" })),\n      ENV\n    );\n    assert.equal(response?.status, 502);\n    assert.equal((await response.json()).code, "MANUAL_CREATE_RESULT_UNKNOWN");\n    assert.equal(cancelled, true);\n    assert.ok(Date.now() - startedAt < 1000, "unread body cancellation should not wait for the 5-second deadline");\n  } finally {\n    mock.restore();\n  }\n});\n`;
await writeFile("tests/manual-api.test.mjs", apiTests, "utf8");

let docsTest = await readFile("tests/manual-title-docs.test.mjs", "utf8");
docsTest = replaceOnce(
  docsTest,
  `  assert.match(setup, new RegExp(TITLE_MIGRATION.replaceAll("/", "\\\\/")));\n  assert.match(setup, /manuals_title_length/);`,
  `  const migrationBlock = setup.match(/## Migration\\s+[\\s\\S]*?\\x60\\x60\\x60text\\n([\\s\\S]*?)\\x60\\x60\\x60/)?.[1];\n  assert.ok(migrationBlock, "ordered Phase 2 migration block is required");\n  const migrationFiles = migrationBlock.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);\n  const coreIndex = migrationFiles.indexOf("supabase/migrations/202608020001_phase2_manual_core.sql");\n  const contextFixIndex = migrationFiles.indexOf("supabase/migrations/202608020002_phase2_manual_create_context_fix.sql");\n  const titleIndex = migrationFiles.indexOf(TITLE_MIGRATION);\n  assert.ok(coreIndex >= 0, "manual core migration must be executable");\n  assert.ok(contextFixIndex > coreIndex, "context fix must follow manual core");\n  assert.ok(titleIndex > contextFixIndex, "title constraint must follow both Phase 2 prerequisites");\n  assert.match(setup, /manuals_title_length/);`,
  "ordered migration block assertion"
);
await writeFile("tests/manual-title-docs.test.mjs", docsTest, "utf8");
