import { readFile, rm, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const first = source.indexOf(find);
  if (first < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, first + find.length) >= 0) {
    throw new Error(`Replacement target is not unique: ${label}`);
  }
  return `${source.slice(0, first)}${replacement}${source.slice(first + find.length)}`;
}

function replaceRegexOnce(source, pattern, replacement, label) {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== 1) throw new Error(`Expected one regex target for ${label}, found ${matches.length}`);
  return source.replace(pattern, replacement);
}

const serverConfig = `export interface SupabaseBindings {
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

export interface SupabaseConfigInspection {
  configured: boolean;
  hasUrl: boolean;
  hasAnonKey: boolean;
  projectRef: string | null;
  config: SupabaseConfig | null;
}

export function inspectSupabaseConfig(env: SupabaseBindings): SupabaseConfigInspection {
  const rawUrl = String(env.SUPABASE_URL ?? "").trim();
  const anonKey = String(env.SUPABASE_ANON_KEY ?? "").trim();
  const hasUrl = rawUrl.length > 0;
  const hasAnonKey = anonKey.length > 0;

  let url: string | null = null;
  let projectRef: string | null = null;
  if (hasUrl) {
    try {
      const parsed = new URL(rawUrl);
      if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password) {
        throw new Error("invalid Supabase URL");
      }
      url = parsed.origin;
      if (parsed.hostname.endsWith(".supabase.co")) {
        projectRef = parsed.hostname.slice(0, -".supabase.co".length) || null;
      }
    } catch {
      url = null;
    }
  }

  const config = url && hasAnonKey ? { url, anonKey } : null;
  return {
    configured: config !== null,
    hasUrl,
    hasAnonKey,
    projectRef,
    config
  };
}
`;
await writeFile("apps/worker/src/server-config.ts", serverConfig, "utf8");

let indexSource = await readFile("apps/worker/src/index.ts", "utf8");
indexSource = replaceOnce(
  indexSource,
  'import { APP_ASSET_VERSION } from "./app-assets.ts";\n',
  'import { APP_ASSET_VERSION } from "./app-assets.ts";\nimport { inspectSupabaseConfig, type SupabaseBindings } from "./server-config.ts";\n',
  "index server config import"
);
indexSource = replaceOnce(
  indexSource,
  'interface Env {\n  SUPABASE_URL?: string;\n  SUPABASE_ANON_KEY?: string;\n',
  'interface Env extends SupabaseBindings {\n',
  "index Env bindings"
);
indexSource = replaceRegexOnce(
  indexSource,
  /function getSupabaseProjectRef\(supabaseUrl: string \| undefined\): string \| null \{[\s\S]*?\n\}\n\n(?=function ensureSupabaseConfig)/,
  "",
  "duplicate project ref reader"
);
indexSource = replaceRegexOnce(
  indexSource,
  /function ensureSupabaseConfig\(env: Env\): \{ url: string; anonKey: string \} \{[\s\S]*?\n\}/,
  `function ensureSupabaseConfig(env: Env): { url: string; anonKey: string } {
  const config = inspectSupabaseConfig(env).config;
  if (!config) {
    throw new AppError(500, "SUPABASE_NOT_CONFIGURED", "Supabase設定が未完了です。");
  }
  return config;
}`,
  "centralized index config"
);
indexSource = replaceOnce(
  indexSource,
  'function configHealth(env: Env): Response {\n  const hasUrl = Boolean(env.SUPABASE_URL);\n  const hasAnonKey = Boolean(env.SUPABASE_ANON_KEY);\n',
  'function configHealth(env: Env): Response {\n  const supabase = inspectSupabaseConfig(env);\n  const { hasUrl, hasAnonKey } = supabase;\n',
  "config health inspection"
);
indexSource = replaceOnce(indexSource, "configured: hasUrl && hasAnonKey,", "configured: supabase.configured,", "config health configured");
indexSource = replaceOnce(indexSource, "projectRef: getSupabaseProjectRef(env.SUPABASE_URL)", "projectRef: supabase.projectRef", "config health project ref");
if (/env\.SUPABASE_(?:URL|ANON_KEY)/.test(indexSource)) {
  throw new Error("index.ts still reads Supabase bindings directly");
}
await writeFile("apps/worker/src/index.ts", indexSource, "utf8");

let manualSource = await readFile("apps/worker/src/manual-router.ts", "utf8");
manualSource = `import { inspectSupabaseConfig, type SupabaseBindings } from "./server-config.ts";\n\n${manualSource}`;
manualSource = replaceOnce(
  manualSource,
  'interface ManualEnv {\n  SUPABASE_URL?: string;\n  SUPABASE_ANON_KEY?: string;\n}',
  'interface ManualEnv extends SupabaseBindings {}',
  "manual Env bindings"
);
manualSource = replaceRegexOnce(
  manualSource,
  /function ensureConfig\(env: ManualEnv\): \{ url: string; anonKey: string \} \{[\s\S]*?\n\}/,
  `function ensureConfig(env: ManualEnv): { url: string; anonKey: string } {
  const config = inspectSupabaseConfig(env).config;
  if (!config) {
    throw new ManualError(500, "SUPABASE_NOT_CONFIGURED", "Supabase設定が未完了です。");
  }
  return config;
}`,
  "centralized manual config"
);
manualSource = replaceOnce(
  manualSource,
  "const MAX_MANUAL_LIST_ITEMS = 1000;\n",
  "const MAX_MANUAL_LIST_ITEMS = 1000;\nconst MAX_MANUAL_TITLE_LENGTH = 64;\n",
  "manual title constant"
);
manualSource = replaceRegexOnce(
  manualSource,
  /async function supabaseFetch\([\s\S]*?\n\}\n\n(?=async function requireSession)/,
  `async function supabaseFetch(
  env: ManualEnv,
  path: string,
  accessToken: string,
  init: RequestInit = {}
): Promise<Response> {
  const config = ensureConfig(env);
  const headers = new Headers(init.headers);
  headers.set("apikey", config.anonKey);
  headers.set("authorization", \`Bearer \${accessToken}\`);
  if (init.body && !headers.has("content-type")) headers.set("content-type", "application/json");

  const controller = new AbortController();
  if (init.signal) {
    if (init.signal.aborted) controller.abort(init.signal.reason);
    else init.signal.addEventListener("abort", () => controller.abort(init.signal?.reason), { once: true });
  }
  const timer = setTimeout(() => controller.abort(new Error("Supabase response deadline exceeded")), SUPABASE_TIMEOUT_MS);

  try {
    const response = await fetch(\`\${config.url}\${path}\`, {
      ...init,
      headers,
      signal: controller.signal
    });
    if (!response.body) {
      clearTimeout(timer);
      return response;
    }

    const reader = response.body.getReader();
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      reader.releaseLock();
    };
    const body = new ReadableStream<Uint8Array>({
      async pull(streamController) {
        try {
          const result = await reader.read();
          if (result.done) {
            finish();
            streamController.close();
            return;
          }
          streamController.enqueue(result.value);
        } catch (error) {
          finish();
          streamController.error(error);
        }
      },
      async cancel(reason) {
        try {
          await reader.cancel(reason);
        } finally {
          finish();
        }
      }
    });
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  } catch (error) {
    clearTimeout(timer);
    throw error;
  }
}

`,
  "full Supabase response deadline"
);
manualSource = replaceOnce(
  manualSource,
  '    typeof row.title !== "string" || row.title.trim().length === 0 ||\n',
  '    typeof row.title !== "string" || row.title.trim().length === 0 || Array.from(row.title).length > MAX_MANUAL_TITLE_LENGTH ||\n',
  "manual list title validation"
);
manualSource = replaceOnce(
  manualSource,
  '  if (!title) throw new ManualError(400, "MANUAL_TITLE_REQUIRED", "手順書タイトルを入力してください。");\n',
  '  if (!title) throw new ManualError(400, "MANUAL_TITLE_REQUIRED", "手順書タイトルを入力してください。");\n  if (Array.from(title).length > MAX_MANUAL_TITLE_LENGTH) {\n    throw new ManualError(400, "MANUAL_TITLE_INVALID", "手順書タイトルは64文字以内で入力してください。");\n  }\n',
  "manual create title validation"
);
manualSource = replaceOnce(
  manualSource,
  '  try {\n    const workspaceId = decodeURIComponent(match[1]);\n    if (!UUID_PATTERN.test(workspaceId)) {\n      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");\n    }\n',
  '  try {\n    let workspaceId: string;\n    try {\n      workspaceId = decodeURIComponent(match[1]);\n    } catch {\n      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");\n    }\n    if (!UUID_PATTERN.test(workspaceId)) {\n      throw new ManualError(404, "MANUALS_NOT_FOUND", "指定された手順書領域が見つかりません。");\n    }\n',
  "malformed workspace path"
);
if (/env\.SUPABASE_(?:URL|ANON_KEY)/.test(manualSource)) {
  throw new Error("manual-router.ts still reads Supabase bindings directly");
}
await writeFile("apps/worker/src/manual-router.ts", manualSource, "utf8");

let tests = await readFile("tests/manual-api.test.mjs", "utf8");
tests = replaceOnce(tests, 'import assert from "node:assert/strict";\n', 'import assert from "node:assert/strict";\nimport { readFile } from "node:fs/promises";\n', "test fs import");
tests = replaceOnce(
  tests,
  'import { handleManualRoute } from "../apps/worker/src/manual-router.ts";\n',
  'import { handleManualRoute } from "../apps/worker/src/manual-router.ts";\nimport { inspectSupabaseConfig } from "../apps/worker/src/server-config.ts";\n',
  "test config import"
);
tests += `

test("Supabase bindings are normalized through the single server config module", async () => {
  assert.deepEqual(
    inspectSupabaseConfig({ SUPABASE_URL: " https://project.supabase.co/// ", SUPABASE_ANON_KEY: " key " }),
    {
      configured: true,
      hasUrl: true,
      hasAnonKey: true,
      projectRef: "project",
      config: { url: "https://project.supabase.co", anonKey: "key" }
    }
  );
  const [indexSource, manualSource, configSource] = await Promise.all([
    readFile("apps/worker/src/index.ts", "utf8"),
    readFile("apps/worker/src/manual-router.ts", "utf8"),
    readFile("apps/worker/src/server-config.ts", "utf8")
  ]);
  assert.doesNotMatch(indexSource, /env\\.SUPABASE_(?:URL|ANON_KEY)/);
  assert.doesNotMatch(manualSource, /env\\.SUPABASE_(?:URL|ANON_KEY)/);
  assert.match(configSource, /env\\.SUPABASE_URL/);
  assert.match(configSource, /env\\.SUPABASE_ANON_KEY/);
});

test("manual title over 64 code points is rejected before create RPC", async () => {
  const mock = installFetch([authOk(), memberOk(), editorOk()]);
  try {
    const response = await handleManualRoute(
      request("POST", JSON.stringify({ title: "あ".repeat(65) })),
      ENV
    );
    assert.equal(response?.status, 400);
    assert.equal((await response.json()).code, "MANUAL_TITLE_INVALID");
    assert.equal(mock.calls.length, 3);
  } finally {
    mock.restore();
  }
});

test("malformed escaped workspace path is hidden as 404", async () => {
  const response = await handleManualRoute(
    new Request(\`${APP_ORIGIN}/api/workspaces/%ZZ/manuals\`),
    ENV
  );
  assert.equal(response?.status, 404);
  assert.equal((await response.json()).code, "MANUALS_NOT_FOUND");
});

test("Supabase deadline remains active while response body is consumed", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = (callback, delay, ...args) => originalSetTimeout(callback, Math.min(Number(delay), 20), ...args);
  const mock = installFetch([
    authOk(),
    memberOk(),
    (_url, init) => new Response(new ReadableStream({
      start(controller) {
        const fail = () => controller.error(new DOMException("Aborted", "AbortError"));
        if (init.signal?.aborted) fail();
        else init.signal?.addEventListener("abort", fail, { once: true });
      }
    }), {
      status: 200,
      headers: { "content-type": "application/json", "content-range": "0-0/1" }
    })
  ]);
  try {
    const response = await handleManualRoute(request(), ENV);
    assert.equal(response?.status, 502);
    assert.equal((await response.json()).code, "MANUALS_RESPONSE_INVALID");
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    mock.restore();
  }
});

test("manual title migration fixes the same 64-character contract", async () => {
  const migration = await readFile("supabase/migrations/202608140005_phase2_manual_title_length.sql", "utf8");
  assert.match(migration, /manuals_title_length/);
  assert.match(migration, /manual_revisions_title_length/);
  assert.match(migration, /char_length\\(title\\) between 1 and 64/i);
});
`;
await writeFile("tests/manual-api.test.mjs", tests, "utf8");

const titleMigration = `-- Phase 2 manual titles must remain bounded so list responses stay available.
-- Existing rows are not truncated; validation fails safely if incompatible data exists.

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manuals_title_length'
      and conrelid = 'public.manuals'::regclass
  ) then
    alter table public.manuals
      add constraint manuals_title_length
      check (char_length(title) between 1 and 64)
      not valid;
  end if;
end $$;

alter table public.manuals validate constraint manuals_title_length;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'manual_revisions_title_length'
      and conrelid = 'public.manual_revisions'::regclass
  ) then
    alter table public.manual_revisions
      add constraint manual_revisions_title_length
      check (char_length(title) between 1 and 64)
      not valid;
  end if;
end $$;

alter table public.manual_revisions validate constraint manual_revisions_title_length;
`;
await writeFile("supabase/migrations/202608140005_phase2_manual_title_length.sql", titleMigration, "utf8");

let tsconfig = await readFile("tsconfig.worker.json", "utf8");
tsconfig = replaceOnce(
  tsconfig,
  '    "apps/worker/src/index-phase2.ts",\n    "apps/worker/src/manual-router.ts"\n',
  '    "apps/worker/src/index-phase2.ts",\n    "apps/worker/src/manual-router.ts",\n    "apps/worker/src/server-config.ts"\n',
  "worker config include"
);
await writeFile("tsconfig.worker.json", tsconfig, "utf8");

let workflow = await readFile(".github/workflows/manual-api.yml", "utf8");
workflow = replaceOnce(
  workflow,
  '      - "apps/worker/src/manual-router.ts"\n',
  '      - "apps/worker/src/manual-router.ts"\n      - "apps/worker/src/server-config.ts"\n      - "supabase/migrations/202608140005_phase2_manual_title_length.sql"\n',
  "manual API workflow paths"
);
await writeFile(".github/workflows/manual-api.yml", workflow, "utf8");

let docs = await readFile("docs/05-api/phase2-manual-api.md", "utf8");
docs = replaceOnce(
  docs,
  "- bodyはストリーム読取中にも16 KiBで打ち切り、`Content-Length`が無いchunked bodyでも上限を迂回させない。\n",
  "- bodyはストリーム読取中にも16 KiBで打ち切り、`Content-Length`が無いchunked bodyでも上限を迂回させない。\n- titleはtrim後1〜64 Unicode code pointとし、WorkerとDB制約で同じ上限を強制する。\n",
  "API title contract"
);
docs = replaceOnce(
  docs,
  "- access token更新が必要な場合はCookieを変更せず`401 SESSION_REFRESH_REQUIRED`とする。\n",
  "- access token更新が必要な場合はCookieを変更せず`401 SESSION_REFRESH_REQUIRED`とする。\n- Supabase URL/anon keyの読取・正規化は`server-config.ts`だけで行い、Phase 1とmanual routeで同じ設定境界を使う。\n- Supabase応答はheader到着だけでtimeoutを解除せず、本文読取完了まで5秒deadlineを維持する。\n",
  "API config and deadline contract"
);
docs = replaceOnce(
  docs,
  "- 不正workspace IDは存在推測を避けて`404 MANUALS_NOT_FOUND`へまとめる。",
  "- 不正workspace ID（不正なpercent encodingを含む）は存在推測を避けて`404 MANUALS_NOT_FOUND`へまとめる。",
  "API malformed ID contract"
);
await writeFile("docs/05-api/phase2-manual-api.md", docs, "utf8");

await rm("scripts/apply-phase2-manual-review-fixes.mjs");
await rm(".github/workflows/apply-phase2-manual-review-fixes.yml");
