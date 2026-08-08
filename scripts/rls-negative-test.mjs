import { readFile } from "node:fs/promises";

const DEFAULT_APP_ORIGIN = "https://meccha-manual.tattoo-studio-crm.workers.dev";
const REMOTE_WRITE_GUARD = "I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED";

const config = {
  appOrigin: process.env.MECCHA_APP_ORIGIN || DEFAULT_APP_ORIGIN,
  allowRemoteWrite: process.env.MECCHA_RLS_ALLOW_REMOTE_WRITE,
  supabaseUrl: process.env.MECCHA_SUPABASE_URL,
  supabaseAnonKey: process.env.MECCHA_SUPABASE_ANON_KEY,
  userA: {
    email: process.env.MECCHA_RLS_USER_A_EMAIL,
    password: process.env.MECCHA_RLS_USER_A_PASSWORD
  },
  userB: {
    email: process.env.MECCHA_RLS_USER_B_EMAIL,
    password: process.env.MECCHA_RLS_USER_B_PASSWORD
  }
};

function requireValue(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireRemoteWriteGuard(appOrigin) {
  const isLocal = appOrigin.includes("localhost") || appOrigin.includes("127.0.0.1");
  if (isLocal) return;

  if (config.allowRemoteWrite !== REMOTE_WRITE_GUARD) {
    throw new Error(
      `Remote RLS test creates workspace rows. Set MECCHA_RLS_ALLOW_REMOTE_WRITE=${REMOTE_WRITE_GUARD} to continue.`
    );
  }
}

async function loadPublicSupabaseConfig() {
  if (config.supabaseUrl && config.supabaseAnonKey) {
    return {
      url: config.supabaseUrl.replace(/\/$/, ""),
      anonKey: config.supabaseAnonKey
    };
  }

  const wrangler = JSON.parse(await readFile("wrangler.jsonc", "utf8"));
  const url = wrangler.vars?.SUPABASE_URL;
  const anonKey = wrangler.vars?.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("Supabase public config not found in env or wrangler.jsonc.");
  }

  return {
    url: url.replace(/\/$/, ""),
    anonKey
  };
}

function uniqueSlug(label) {
  const random = Math.random().toString(36).slice(2, 8);
  return `rls-${label}-${Date.now()}-${random}`;
}

function extractCookies(headers) {
  const fromGetSetCookie = typeof headers.getSetCookie === "function"
    ? headers.getSetCookie()
    : [];
  const rawCookies = fromGetSetCookie.length > 0
    ? fromGetSetCookie
    : (headers.get("set-cookie") || "").split(/,(?=\s*__Host-mm_)/);

  const cookies = [];

  for (const rawCookie of rawCookies) {
    const firstPart = rawCookie.split(";")[0]?.trim();
    if (firstPart) cookies.push(firstPart);
  }

  return cookies.join("; ");
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function assertOk(response, label) {
  const payload = await readJson(response);
  if (response.ok) return payload;

  throw new Error(`${label} failed: HTTP ${response.status} ${JSON.stringify(payload)}`);
}

async function appLogin(appOrigin, email, password) {
  const response = await fetch(`${appOrigin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await assertOk(response, `app login ${email}`);
  const cookie = extractCookies(response.headers);

  if (!cookie.includes("__Host-mm_access=") || !cookie.includes("__Host-mm_refresh=")) {
    throw new Error(`app login ${email} did not return session cookies`);
  }

  return {
    email,
    cookie,
    userId: payload.user?.id
  };
}

async function supabaseLogin(supabase, email, password) {
  const response = await fetch(`${supabase.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${supabase.anonKey}`
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await assertOk(response, `supabase login ${email}`);

  if (!payload.access_token || !payload.user?.id) {
    throw new Error(`supabase login ${email} did not return an access token`);
  }

  return {
    email,
    accessToken: payload.access_token,
    userId: payload.user.id
  };
}

async function getSession(appOrigin, actor) {
  const response = await fetch(`${appOrigin}/api/session`, {
    headers: {
      "cookie": actor.cookie
    }
  });
  return assertOk(response, `session ${actor.email}`);
}

async function createWorkspace(appOrigin, actor, name, slug) {
  const response = await fetch(`${appOrigin}/api/workspaces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin,
      "cookie": actor.cookie
    },
    body: JSON.stringify({ name, slug })
  });
  return assertOk(response, `create workspace ${actor.email}`);
}

async function supabaseSelect(supabase, actor, table, query) {
  const response = await fetch(`${supabase.url}/rest/v1/${table}?${query}`, {
    headers: {
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`
    }
  });
  const payload = await assertOk(response, `supabase select ${table} ${actor.email}`);

  if (!Array.isArray(payload)) {
    throw new Error(`supabase select ${table} did not return an array`);
  }

  return payload;
}

async function supabaseWrite(supabase, actor, table, method, query, body) {
  const response = await fetch(`${supabase.url}/rest/v1/${table}?${query}`, {
    method,
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`,
      "prefer": "return=minimal"
    },
    body: JSON.stringify(body)
  });

  return assertOk(response, `supabase ${method.toLowerCase()} ${table} ${actor.email}`);
}

async function assertSupabaseWriteRejected(
  supabase,
  actor,
  table,
  method,
  query,
  body,
  expectedMessage,
  label
) {
  const response = await fetch(`${supabase.url}/rest/v1/${table}?${query}`, {
    method,
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`,
      "prefer": "return=minimal"
    },
    body: JSON.stringify(body)
  });

  const payload = await readJson(response);
  if (response.ok) {
    throw new Error(`${label} unexpectedly succeeded with HTTP ${response.status}.`);
  }

  const message = typeof payload === "object" && payload !== null
    ? String(payload.message || "")
    : String(payload || "");
  if (!message.includes(expectedMessage)) {
    throw new Error(`${label} failed for an unexpected reason with HTTP ${response.status}.`);
  }
}

async function assertAnonymousRpcRejected(supabase, rpc, body) {
  const response = await fetch(`${supabase.url}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${supabase.anonKey}`
    },
    body: JSON.stringify(body)
  });

  const payload = await readJson(response);
  if (response.ok) {
    throw new Error(`anonymous RPC ${rpc} unexpectedly succeeded with HTTP ${response.status}.`);
  }
  const code = typeof payload === "object" && payload !== null ? String(payload.code || "") : "";
  const message = typeof payload === "object" && payload !== null ? String(payload.message || "") : "";
  if (code !== "42501" || !message.includes(`permission denied for function ${rpc}`)) {
    throw new Error(`anonymous RPC ${rpc} was rejected for an unexpected reason with HTTP ${response.status}.`);
  }
}

async function addWorkspaceAdmin(supabase, owner, workspace, admin) {
  await supabaseWrite(supabase, owner, "workspace_members", "POST", "", {
    workspace_id: workspace.id,
    user_id: admin.userId,
    role: "admin",
    status: "active",
    created_by: owner.userId
  });
}

async function assertIdentityFieldsImmutable(supabase, owner, admin, workspace) {
  const workspaceQuery = `id=eq.${encodeURIComponent(workspace.id)}`;
  const ownerMembershipQuery = [
    `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
    `user_id=eq.${encodeURIComponent(owner.userId)}`
  ].join("&");
  const adminMembershipQuery = [
    `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
    `user_id=eq.${encodeURIComponent(admin.userId)}`
  ].join("&");

  await addWorkspaceAdmin(supabase, owner, workspace, admin);

  const workspaceMutations = [
    { field: "id", value: crypto.randomUUID() },
    { field: "created_by", value: admin.userId },
    { field: "created_at", value: "2000-01-01T00:00:00.000Z" }
  ];
  const membershipMutations = [
    { field: "workspace_id", value: crypto.randomUUID() },
    { field: "user_id", value: crypto.randomUUID() },
    { field: "created_by", value: admin.userId },
    { field: "created_at", value: "2000-01-01T00:00:00.000Z" }
  ];
  const actors = [
    { actor: owner, membershipQuery: ownerMembershipQuery, label: "owner" },
    { actor: admin, membershipQuery: adminMembershipQuery, label: "admin" }
  ];

  for (const { actor, membershipQuery, label } of actors) {
    for (const mutation of workspaceMutations) {
      await assertSupabaseWriteRejected(
        supabase,
        actor,
        "workspaces",
        "PATCH",
        workspaceQuery,
        { [mutation.field]: mutation.value },
        "workspace identity and creation audit fields are immutable",
        `${label} workspace ${mutation.field} mutation`
      );
    }

    for (const mutation of membershipMutations) {
      await assertSupabaseWriteRejected(
        supabase,
        actor,
        "workspace_members",
        "PATCH",
        membershipQuery,
        { [mutation.field]: mutation.value },
        "workspace membership identity and creation audit fields are immutable",
        `${label} membership ${mutation.field} mutation`
      );
    }
  }
}

function workspaceList(payload) {
  return Array.isArray(payload.workspaces) ? payload.workspaces : [];
}

function hasWorkspace(workspaces, expected) {
  return workspaces.some((workspace) =>
    workspace.id === expected.id || workspace.slug === expected.slug
  );
}

function assertCanSee(workspaces, expected, label) {
  if (!hasWorkspace(workspaces, expected)) {
    throw new Error(`${label} cannot see its own created workspace.`);
  }
}

function assertCannotSee(workspaces, expected, label) {
  if (hasWorkspace(workspaces, expected)) {
    throw new Error(`${label} can see another user's workspace through app API.`);
  }
}

async function assertDirectCannotReadWorkspace(supabase, actor, workspace, label) {
  const workspaceRows = await supabaseSelect(
    supabase,
    actor,
    "workspaces",
    `select=id,slug&id=eq.${encodeURIComponent(workspace.id)}`
  );
  const memberRows = await supabaseSelect(
    supabase,
    actor,
    "workspace_members",
    `select=workspace_id,user_id&workspace_id=eq.${encodeURIComponent(workspace.id)}`
  );

  if (workspaceRows.length !== 0) {
    throw new Error(`${label} can directly read another user's workspace through Supabase REST.`);
  }

  if (memberRows.length !== 0) {
    throw new Error(`${label} can directly read another user's workspace_members through Supabase REST.`);
  }
}

async function main() {
  const appOrigin = config.appOrigin.replace(/\/$/, "");
  requireRemoteWriteGuard(appOrigin);

  const supabase = await loadPublicSupabaseConfig();
  const userAEmail = requireValue(config.userA.email, "MECCHA_RLS_USER_A_EMAIL");
  const userAPassword = requireValue(config.userA.password, "MECCHA_RLS_USER_A_PASSWORD");
  const userBEmail = requireValue(config.userB.email, "MECCHA_RLS_USER_B_EMAIL");
  const userBPassword = requireValue(config.userB.password, "MECCHA_RLS_USER_B_PASSWORD");

  if (userAEmail === userBEmail) {
    throw new Error("RLS negative test requires two different users.");
  }

  const [appUserA, appUserB, directUserA, directUserB] = await Promise.all([
    appLogin(appOrigin, userAEmail, userAPassword),
    appLogin(appOrigin, userBEmail, userBPassword),
    supabaseLogin(supabase, userAEmail, userAPassword),
    supabaseLogin(supabase, userBEmail, userBPassword)
  ]);

  const slugA = uniqueSlug("a");
  const slugB = uniqueSlug("b");
  const createdA = await createWorkspace(appOrigin, appUserA, "RLS negative test A", slugA);
  const createdB = await createWorkspace(appOrigin, appUserB, "RLS negative test B", slugB);
  const workspaceA = { id: createdA.workspaceId, slug: slugA };
  const workspaceB = { id: createdB.workspaceId, slug: slugB };

  const [sessionA, sessionB] = await Promise.all([
    getSession(appOrigin, appUserA),
    getSession(appOrigin, appUserB)
  ]);
  const userAWorkspaces = workspaceList(sessionA);
  const userBWorkspaces = workspaceList(sessionB);

  assertCanSee(userAWorkspaces, workspaceA, "User A");
  assertCanSee(userBWorkspaces, workspaceB, "User B");
  assertCannotSee(userAWorkspaces, workspaceB, "User A");
  assertCannotSee(userBWorkspaces, workspaceA, "User B");

  await Promise.all([
    assertDirectCannotReadWorkspace(supabase, directUserA, workspaceB, "User A"),
    assertDirectCannotReadWorkspace(supabase, directUserB, workspaceA, "User B")
  ]);

  await Promise.all([
    assertAnonymousRpcRejected(supabase, "create_workspace", {
      workspace_name: "anonymous must fail",
      workspace_slug: uniqueSlug("anonymous")
    }),
    assertAnonymousRpcRejected(supabase, "is_workspace_member", {
      target_workspace_id: workspaceA.id
    })
  ]);
  await assertIdentityFieldsImmutable(supabase, directUserA, directUserB, workspaceA);

  console.log(JSON.stringify({
    status: "ok",
    appOrigin,
    checks: {
      userALogin: true,
      userBLogin: true,
      userACanSeeOwnWorkspace: true,
      userBCanSeeOwnWorkspace: true,
      userACannotSeeUserBWorkspaceViaApp: true,
      userBCannotSeeUserAWorkspaceViaApp: true,
      userACannotReadUserBWorkspaceViaSupabaseRest: true,
      userBCannotReadUserAWorkspaceViaSupabaseRest: true,
      anonymousCannotExecuteWorkspaceRpcs: true,
      ownerCannotMutateIdentityFields: true,
      adminCannotMutateIdentityFields: true
    },
    createdWorkspaces: {
      userA: { slug: slugA, idPresent: Boolean(workspaceA.id) },
      userB: { slug: slugB, idPresent: Boolean(workspaceB.id) }
    },
    counts: {
      userAWorkspaces: userAWorkspaces.length,
      userBWorkspaces: userBWorkspaces.length
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
