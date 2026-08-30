import { readFile } from "node:fs/promises";
import { fetchWithCloudflareAccess } from "./cloudflare-access-fetch.mjs";

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

function appFetch(input, init) {
  return fetchWithCloudflareAccess(input, init, {
    expectedOrigin: config.appOrigin
  });
}

function requireValue(value, name) {
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function requireRemoteWriteGuard(appOrigin) {
  let hostname;
  try {
    hostname = new URL(appOrigin).hostname;
  } catch {
    throw new Error("MECCHA_APP_ORIGIN must be a valid absolute URL.");
  }
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
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

  throw new Error(`${label} failed with HTTP ${response.status}.`);
}

async function appLogin(appOrigin, email, password, label) {
  const response = await appFetch(`${appOrigin}/api/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await assertOk(response, `app login ${label}`);
  const cookie = extractCookies(response.headers);

  if (!cookie.includes("__Host-mm_access=") || !cookie.includes("__Host-mm_refresh=")) {
    throw new Error(`app login ${label} did not return session cookies`);
  }

  return {
    label,
    cookie,
    userId: payload.user?.id
  };
}

async function supabaseLogin(supabase, email, password, label) {
  const response = await fetch(`${supabase.url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${supabase.anonKey}`
    },
    body: JSON.stringify({ email, password })
  });
  const payload = await assertOk(response, `supabase login ${label}`);

  if (!payload.access_token || !payload.user?.id) {
    throw new Error(`supabase login ${label} did not return an access token`);
  }

  return {
    label,
    accessToken: payload.access_token,
    userId: payload.user.id
  };
}

async function getSession(appOrigin, actor) {
  const response = await appFetch(`${appOrigin}/api/session`, {
    headers: {
      "cookie": actor.cookie
    }
  });
  return assertOk(response, `session ${actor.label}`);
}

async function createWorkspace(appOrigin, actor, name, slug) {
  const response = await appFetch(`${appOrigin}/api/workspaces`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin,
      "cookie": actor.cookie
    },
    body: JSON.stringify({ name, slug })
  });
  return assertOk(response, `create workspace ${actor.label}`);
}

async function getWorkspaceMembers(appOrigin, actor, workspace) {
  const response = await appFetch(`${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members`, {
    headers: { "cookie": actor.cookie }
  });
  return assertOk(response, `get workspace members ${actor.label}`);
}

async function createWorkspaceJoinCode(appOrigin, actor) {
  const response = await appFetch(`${appOrigin}/api/member-join-code`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin,
      "cookie": actor.cookie
    },
    body: "{}"
  });
  return assertOk(response, `create workspace join code ${actor.label}`);
}

async function addWorkspaceMember(appOrigin, actor, workspace, joiningMember, role) {
  const issued = await createWorkspaceJoinCode(appOrigin, joiningMember);
  const response = await appFetch(`${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin,
      "cookie": actor.cookie
    },
    body: JSON.stringify({ joinCode: issued.joinCode, role })
  });
  const member = await assertOk(response, `add workspace member ${actor.label}`);
  return { member, joinCode: issued.joinCode };
}

async function updateWorkspaceMember(appOrigin, actor, workspace, userId, role, status) {
  const response = await appFetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(userId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "origin": appOrigin,
        "cookie": actor.cookie
      },
      body: JSON.stringify({ role, status })
    }
  );
  return assertOk(response, `update workspace member ${actor.label}`);
}

async function assertMemberApiRejected(response, expectedStatus, expectedCode, label) {
  const payload = await readJson(response);
  if (response.status !== expectedStatus || payload?.code !== expectedCode) {
    throw new Error(`${label} was not rejected with ${expectedStatus} ${expectedCode}.`);
  }
}

async function callSupabaseRpc(supabase, actor, rpc, body) {
  return fetch(`${supabase.url}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`
    },
    body: JSON.stringify(body)
  });
}

async function supabaseSelect(supabase, actor, table, query) {
  const response = await fetch(`${supabase.url}/rest/v1/${table}?${query}`, {
    headers: {
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`
    }
  });
  const payload = await assertOk(response, `supabase select ${table} ${actor.label}`);

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

  return assertOk(response, `supabase ${method.toLowerCase()} ${table} ${actor.label}`);
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
  const expectedMessages = Array.isArray(expectedMessage) ? expectedMessage : [expectedMessage];
  if (!expectedMessages.some((expected) => message.includes(expected))) {
    throw new Error(`${label} failed for an unexpected reason with HTTP ${response.status}.`);
  }
}

async function assertSupabaseWriteHasNoEffect(
  supabase,
  actor,
  verifier,
  table,
  query,
  body,
  label
) {
  const response = await fetch(`${supabase.url}/rest/v1/${table}?${query}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`,
      "prefer": "return=representation"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(`${label} failed for an unexpected reason with HTTP ${response.status}.`);
  }

  const payload = await readJson(response);
  if (!Array.isArray(payload)) {
    throw new Error(`${label} did not return an array.`);
  }
  if (payload.length > 0) {
    throw new Error(`${label} unexpectedly updated ${payload.length} row(s).`);
  }

  await verifier();
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

async function assertAuthenticatedWorkspaceInputRejected(supabase, actor, name, slug, label) {
  const response = await fetch(`${supabase.url}/rest/v1/rpc/create_workspace`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`
    },
    body: JSON.stringify({ workspace_name: name, workspace_slug: slug })
  });
  const payload = await readJson(response);
  if (response.ok) {
    throw new Error(`${label} unexpectedly created a workspace.`);
  }
  const code = typeof payload === "object" && payload !== null ? String(payload.code || "") : "";
  if (code !== "22023") {
    throw new Error(`${label} was rejected for an unexpected reason with HTTP ${response.status}.`);
  }
}

async function assertAuthenticatedWorkspaceNameUpdateRejected(supabase, actor, workspace, name, expectedName, label) {
  const response = await fetch(`${supabase.url}/rest/v1/workspaces?id=eq.${encodeURIComponent(workspace.id)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`,
      "prefer": "return=representation"
    },
    body: JSON.stringify({ name })
  });
  if (response.ok) {
    throw new Error(`${label} unexpectedly stored a non-normalized workspace name.`);
  }
  await assertWorkspaceName(supabase, actor, workspace, expectedName, label);
}

async function assertDisplayNameContract(supabase, actor) {
  const query = `id=eq.${encodeURIComponent(actor.userId)}`;
  const boundaryName = "😀".repeat(64);
  await supabaseWrite(supabase, actor, "profiles", "PATCH", query, { display_name: boundaryName });
  const boundaryRows = await supabaseSelect(
    supabase,
    actor,
    "profiles",
    `select=id,display_name&${query}`
  );
  if (boundaryRows.length !== 1 || Array.from(boundaryRows[0]?.display_name || "").length !== 64) {
    throw new Error("64-code-point display name was not stored intact.");
  }

  await assertSupabaseWriteRejected(
    supabase,
    actor,
    "profiles",
    "PATCH",
    query,
    { display_name: "😀".repeat(65) },
    "profiles_display_name_length",
    "65-code-point display name"
  );
  await assertSupabaseWriteRejected(
    supabase,
    actor,
    "profiles",
    "PATCH",
    query,
    { display_name: " padded name " },
    "profiles_display_name_length",
    "non-normalized display name"
  );
}

async function assertIdentityFieldsImmutable(
  appOrigin,
  supabase,
  appOwner,
  appAdmin,
  owner,
  admin,
  workspace
) {
  const workspaceQuery = `id=eq.${encodeURIComponent(workspace.id)}`;
  const ownerMembershipQuery = [
    `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
    `user_id=eq.${encodeURIComponent(owner.userId)}`
  ].join("&");
  const adminMembershipQuery = [
    `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
    `user_id=eq.${encodeURIComponent(admin.userId)}`
  ].join("&");

  await addWorkspaceMember(appOrigin, appOwner, workspace, appAdmin, "admin");
  const insertedAdmin = await supabaseSelect(
    supabase,
    owner,
    "workspace_members",
    `select=created_by&${adminMembershipQuery}`
  );
  if (insertedAdmin.length !== 1 || insertedAdmin[0]?.created_by !== owner.userId) {
    throw new Error("workspace membership created_by was not forced to the authenticated actor.");
  }

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
        "permission denied for table workspace_members",
        `${label} membership ${mutation.field} mutation`
      );
    }
  }
}

async function assertMembershipTableWritesRevoked(supabase, owner, admin, workspace) {
  for (const actor of [owner, admin]) {
    await assertSupabaseWriteRejected(
      supabase,
      actor,
      "workspace_members",
      "POST",
      "",
      {
        workspace_id: workspace.id,
        user_id: crypto.randomUUID(),
        role: "viewer",
        status: "invited",
        created_by: actor.userId
      },
      "permission denied for table workspace_members",
      `${actor.label} direct invited membership insert`
    );
    await assertSupabaseWriteRejected(
      supabase,
      actor,
      "workspace_members",
      "PATCH",
      [
        `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
        `user_id=eq.${encodeURIComponent(admin.userId)}`
      ].join("&"),
      { status: "invited" },
      "permission denied for table workspace_members",
      `${actor.label} direct invited membership update`
    );
  }
}

async function assertInitialAuditContract(appOrigin, supabase, appOwner, owner, admin, workspace) {
  const query = [
    "select=id,workspace_id,actor_id,action,resource_type,resource_id,metadata,created_at",
    `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
    `resource_id=eq.${encodeURIComponent(admin.userId)}`,
    "order=created_at.asc"
  ].join("&");
  const ownerRows = await supabaseSelect(supabase, owner, "audit_logs", query);
  const adminRows = await supabaseSelect(supabase, admin, "audit_logs", query);
  if (ownerRows.length !== 1 || adminRows.length !== 1) {
    throw new Error("owner/admin could not read the initial member audit record.");
  }
  const row = ownerRows[0];
  if (
    row.actor_id !== owner.userId || row.action !== "workspace_member.added" ||
    row.resource_type !== "workspace_member" || row.resource_id !== admin.userId ||
    row.metadata?.oldRole !== null || row.metadata?.newRole !== "admin" ||
    row.metadata?.oldStatus !== null || row.metadata?.newStatus !== "active"
  ) {
    throw new Error("initial member audit record did not preserve actor/action/resource/metadata.");
  }

  await updateWorkspaceMember(appOrigin, appOwner, workspace, admin.userId, "admin", "active");
  const afterIdempotent = await supabaseSelect(supabase, owner, "audit_logs", query);
  if (afterIdempotent.length !== 1) {
    throw new Error("idempotent member update created a duplicate audit record.");
  }

  for (const actor of [owner, admin]) {
    const fakeAudit = {
      workspace_id: workspace.id,
      actor_id: actor.userId,
      action: "workspace_member.added",
      resource_type: "workspace_member",
      resource_id: actor.userId,
      metadata: {}
    };
    await assertSupabaseWriteRejected(
      supabase,
      actor,
      "audit_logs",
      "POST",
      "",
      fakeAudit,
      "permission denied for table audit_logs",
      `${actor.label} direct audit insert`
    );
    for (const method of ["PATCH", "DELETE"]) {
      await assertSupabaseWriteRejected(
        supabase,
        actor,
        "audit_logs",
        method,
        `id=eq.${encodeURIComponent(row.id)}`,
        method === "PATCH" ? { action: "tampered" } : {},
        "permission denied for table audit_logs",
        `${actor.label} direct audit ${method.toLowerCase()}`
      );
    }
  }
}

async function assertAuditHiddenFromRole(supabase, actor, workspace, role) {
  const rows = await supabaseSelect(
    supabase,
    actor,
    "audit_logs",
    `select=id&workspace_id=eq.${encodeURIComponent(workspace.id)}`
  );
  if (rows.length !== 0) {
    throw new Error(`${role} could read workspace audit records.`);
  }
}

async function assertWorkspaceName(supabase, owner, workspace, expectedName, label) {
  const rows = await supabaseSelect(
    supabase,
    owner,
    "workspaces",
    `select=id,name&id=eq.${encodeURIComponent(workspace.id)}`
  );

  if (rows.length !== 1 || rows[0]?.name !== expectedName) {
    throw new Error(`${label} changed the workspace despite insufficient permissions.`);
  }
}

async function assertWorkspaceMemberRole(supabase, owner, workspace, member, expectedRole, label) {
  const rows = await supabaseSelect(
    supabase,
    owner,
    "workspace_members",
    [
      "select=workspace_id,user_id,role,status",
      `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
      `user_id=eq.${encodeURIComponent(member.userId)}`
    ].join("&")
  );

  if (rows.length !== 1 || rows[0]?.role !== expectedRole || rows[0]?.status !== "active") {
    throw new Error(`${label} changed the membership despite insufficient permissions.`);
  }
}

async function assertRoleCanReadWorkspace(supabase, member, workspace, expectedRole) {
  const workspaceRows = await supabaseSelect(
    supabase,
    member,
    "workspaces",
    `select=id&id=eq.${encodeURIComponent(workspace.id)}`
  );
  const membershipRows = await supabaseSelect(
    supabase,
    member,
    "workspace_members",
    [
      "select=workspace_id,user_id,role,status",
      `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
      `user_id=eq.${encodeURIComponent(member.userId)}`
    ].join("&")
  );

  if (workspaceRows.length !== 1) {
    throw new Error(`${expectedRole} cannot read its workspace.`);
  }
  if (
    membershipRows.length !== 1 ||
    membershipRows[0]?.role !== expectedRole ||
    membershipRows[0]?.status !== "active"
  ) {
    throw new Error(`${expectedRole} cannot read its active membership.`);
  }
}

async function assertLastOwnerProtected(appOrigin, owner, admin, workspace) {
  for (const actor of [owner, admin]) {
    for (const body of [
      { role: "editor", status: "active" },
      { role: "editor", status: "removed" }
    ]) {
      const response = await appFetch(
        `${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(owner.userId)}`,
        {
          method: "PATCH",
          headers: {
            "content-type": "application/json",
            "origin": appOrigin,
            "cookie": actor.cookie
          },
          body: JSON.stringify(body)
        }
      );
      await assertMemberApiRejected(
        response,
        409,
        "OWNER_TRANSFER_REQUIRED",
        `${actor.label} last-owner ${body.status}`
      );
    }
  }
}

async function assertEditorViewerRestrictions(appOrigin, supabase, appOwner, owner, member, workspace) {
  const originalName = "RLS negative test A";
  const workspaceQuery = `id=eq.${encodeURIComponent(workspace.id)}`;
  const membershipQuery = [
    `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
    `user_id=eq.${encodeURIComponent(member.userId)}`
  ].join("&");

  for (const role of ["editor", "viewer"]) {
    await updateWorkspaceMember(appOrigin, appOwner, workspace, member.userId, role, "active");
    await assertWorkspaceMemberRole(supabase, owner, workspace, member, role, `${role} setup`);
    await assertRoleCanReadWorkspace(supabase, member, workspace, role);
    await assertAuditHiddenFromRole(supabase, member, workspace, role);

    await assertSupabaseWriteHasNoEffect(
      supabase,
      member,
      () => assertWorkspaceName(supabase, owner, workspace, originalName, role),
      "workspaces",
      workspaceQuery,
      { name: `${originalName} changed by ${role}` },
      `${role} workspace update`
    );
    await assertSupabaseWriteRejected(
      supabase,
      member,
      "workspace_members",
      "PATCH",
      membershipQuery,
      { role: "admin" },
      "permission denied for table workspace_members",
      `${role} membership update`
    );
    await assertWorkspaceMemberRole(supabase, owner, workspace, member, role, role);
    await assertRoleCanReadWorkspace(supabase, member, workspace, role);
  }
}

async function assertCrossWorkspaceWritesRejected(supabase, userA, userB, workspaceA, workspaceB) {
  const cases = [
    {
      actor: userA,
      actorWorkspace: workspaceA,
      targetOwner: userB,
      targetWorkspace: workspaceB,
      targetName: "RLS negative test B",
      label: "User A to workspace B"
    },
    {
      actor: userB,
      actorWorkspace: workspaceB,
      targetOwner: userA,
      targetWorkspace: workspaceA,
      targetName: "RLS negative test A",
      label: "User B to workspace A"
    }
  ];

  for (const testCase of cases) {
    await assertRoleCanReadWorkspace(supabase, testCase.actor, testCase.actorWorkspace, "owner");
    await assertSupabaseWriteHasNoEffect(
      supabase,
      testCase.actor,
      () => assertWorkspaceName(
        supabase,
        testCase.targetOwner,
        testCase.targetWorkspace,
        testCase.targetName,
        testCase.label
      ),
      "workspaces",
      `id=eq.${encodeURIComponent(testCase.targetWorkspace.id)}`,
      { name: `${testCase.targetName} cross-tenant mutation` },
      `${testCase.label} workspace update`
    );
    await assertSupabaseWriteRejected(
      supabase,
      testCase.actor,
      "workspace_members",
      "PATCH",
      [
        `workspace_id=eq.${encodeURIComponent(testCase.targetWorkspace.id)}`,
        `user_id=eq.${encodeURIComponent(testCase.targetOwner.userId)}`
      ].join("&"),
      { role: "viewer" },
      "permission denied for table workspace_members",
      `${testCase.label} membership update`
    );
    await assertRoleCanReadWorkspace(supabase, testCase.actor, testCase.actorWorkspace, "owner");
  }
}

async function assertCrossWorkspaceMemberApisRejected(appOrigin, userA, userB, workspaceA, workspaceB) {
  for (const [actor, target, label] of [
    [userA, workspaceB, "User A to workspace B member list"],
    [userB, workspaceA, "User B to workspace A member list"]
  ]) {
    const response = await appFetch(`${appOrigin}/api/workspaces/${encodeURIComponent(target.id)}/members`, {
      headers: { "cookie": actor.cookie }
    });
    await assertMemberApiRejected(response, 404, "WORKSPACE_MEMBERS_NOT_FOUND", label);
  }
}

async function assertMemberMutationApisRejected(appOrigin, actor, owner, workspace, role) {
  const addResponse = await appFetch(`${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin,
      "cookie": actor.cookie
    },
    body: JSON.stringify({ joinCode: `mmj_${"A".repeat(43)}`, role: "viewer" })
  });
  await assertMemberApiRejected(addResponse, 403, "MEMBER_MANAGE_FORBIDDEN", `${role} member add`);

  const patchResponse = await appFetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(actor.userId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "origin": appOrigin,
        "cookie": actor.cookie
      },
      body: JSON.stringify({ role: "viewer", status: "active" })
    }
  );
  await assertMemberApiRejected(patchResponse, 403, "MEMBER_MANAGE_FORBIDDEN", `${role} member update`);
}

async function assertMemberManagementApis(appOrigin, owner, managedMember, workspace) {
  const added = await addWorkspaceMember(appOrigin, owner, workspace, managedMember, "editor");
  const reusedCodeResponse = await appFetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": appOrigin,
        "cookie": owner.cookie
      },
      body: JSON.stringify({ joinCode: added.joinCode, role: "viewer" })
    }
  );
  await assertMemberApiRejected(
    reusedCodeResponse,
    409,
    "JOIN_CODE_UNAVAILABLE",
    "used join code reuse"
  );
  const ownerList = await getWorkspaceMembers(appOrigin, owner, workspace);
  if (
    ownerList.currentUserRole !== "owner" ||
    !ownerList.members?.some((member) => member.userId === managedMember.userId && member.role === "editor")
  ) {
    throw new Error("owner member list did not include the added editor.");
  }

  const editorList = await getWorkspaceMembers(appOrigin, managedMember, workspace);
  if (editorList.currentUserRole !== "editor") {
    throw new Error("editor member list did not return the editor role.");
  }

  await assertMemberMutationApisRejected(appOrigin, managedMember, owner, workspace, "editor");

  await updateWorkspaceMember(appOrigin, owner, workspace, managedMember.userId, "admin", "active");
  const adminList = await getWorkspaceMembers(appOrigin, managedMember, workspace);
  if (adminList.currentUserRole !== "admin") {
    throw new Error("admin member list did not return the admin role.");
  }
  await updateWorkspaceMember(appOrigin, managedMember, workspace, managedMember.userId, "admin", "active");
  const adminOwnerResponse = await appFetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(owner.userId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "origin": appOrigin,
        "cookie": managedMember.cookie
      },
      body: JSON.stringify({ role: "editor", status: "active" })
    }
  );
  await assertMemberApiRejected(adminOwnerResponse, 409, "OWNER_TRANSFER_REQUIRED", "admin owner update");

  await updateWorkspaceMember(appOrigin, owner, workspace, managedMember.userId, "editor", "active");
  await assertMemberMutationApisRejected(appOrigin, managedMember, owner, workspace, "editor");
  await updateWorkspaceMember(appOrigin, owner, workspace, managedMember.userId, "viewer", "active");
  await assertMemberMutationApisRejected(appOrigin, managedMember, owner, workspace, "viewer");
  const stopped = await updateWorkspaceMember(appOrigin, owner, workspace, managedMember.userId, "viewer", "removed");
  const stoppedAgain = await updateWorkspaceMember(appOrigin, owner, workspace, managedMember.userId, "viewer", "removed");
  for (const result of [stopped, stoppedAgain]) {
    if (
      result.member?.userId !== managedMember.userId ||
      result.member?.status !== "removed" ||
      result.member?.displayName !== "利用停止済み"
    ) {
      throw new Error("removed member mutation response exposed profile fields or lacked the redaction label.");
    }
  }
  const stoppedList = await getWorkspaceMembers(appOrigin, owner, workspace);
  if (stoppedList.members?.some((member) => member.userId === managedMember.userId)) {
    throw new Error("owner member list still included the stopped member.");
  }

  const lastOwnerResponse = await appFetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members/${encodeURIComponent(owner.userId)}`,
    {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        "origin": appOrigin,
        "cookie": owner.cookie
      },
      body: JSON.stringify({ role: "editor", status: "removed" })
    }
  );
  await assertMemberApiRejected(lastOwnerResponse, 409, "OWNER_TRANSFER_REQUIRED", "last owner API removal");
}

async function assertRemovedMemberRequiresFreshJoinCode(
  appOrigin,
  supabase,
  owner,
  joiningMember,
  directOwner,
  workspace
) {
  const directResponse = await callSupabaseRpc(supabase, directOwner, "update_workspace_member", {
    target_workspace_id: workspace.id,
    target_user_id: joiningMember.userId,
    target_role: "viewer",
    target_status: "active"
  });
  const directPayload = await readJson(directResponse);
  if (directResponse.ok || !String(directPayload?.message || "").includes("MM_MEMBER_UPDATE_UNAVAILABLE")) {
    throw new Error("removed member was reactivated without a fresh join code through direct RPC.");
  }

  const first = await createWorkspaceJoinCode(appOrigin, joiningMember);
  const second = await createWorkspaceJoinCode(appOrigin, joiningMember);
  const firstResponse = await appFetch(`${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin,
      "cookie": owner.cookie
    },
    body: JSON.stringify({ joinCode: first.joinCode, role: "viewer" })
  });
  await assertMemberApiRejected(firstResponse, 409, "JOIN_CODE_UNAVAILABLE", "replaced join code");

  const secondResponse = await appFetch(`${appOrigin}/api/workspaces/${encodeURIComponent(workspace.id)}/members`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": appOrigin,
      "cookie": owner.cookie
    },
    body: JSON.stringify({ joinCode: second.joinCode, role: "viewer" })
  });
  const rejoined = await assertOk(secondResponse, "fresh join code rejoin");
  if (rejoined.member?.userId !== joiningMember.userId || rejoined.member?.status !== "active") {
    throw new Error("fresh join code did not reactivate the removed member.");
  }
}

async function assertMemberAuditSequence(supabase, owner, workspace, member) {
  const rows = await supabaseSelect(
    supabase,
    owner,
    "audit_logs",
    [
      "select=id,actor_id,action,resource_type,resource_id,metadata,created_at",
      `workspace_id=eq.${encodeURIComponent(workspace.id)}`,
      `resource_id=eq.${encodeURIComponent(member.userId)}`,
      "order=created_at.asc,id.asc"
    ].join("&")
  );
  const expectedCounts = new Map([
    ["workspace_member.added", 1],
    ["workspace_member.role_changed", 3],
    ["workspace_member.status_changed", 1],
    ["workspace_member.rejoined", 1]
  ]);
  const actualCounts = new Map();
  for (const row of rows) actualCounts.set(row.action, (actualCounts.get(row.action) || 0) + 1);
  if (
    rows.length !== 6 ||
    rows.some((row) => row.actor_id !== owner.userId ||
      row.resource_type !== "workspace_member" || row.resource_id !== member.userId) ||
    [...expectedCounts].some(([action, count]) => actualCounts.get(action) !== count) ||
    [...actualCounts.keys()].some((action) => !expectedCounts.has(action))
  ) {
    throw new Error("member audit action sequence was incomplete or duplicated.");
  }
  const last = rows.find((row) => row.action === "workspace_member.rejoined");
  if (
    last.metadata?.oldRole !== "viewer" || last.metadata?.newRole !== "viewer" ||
    last.metadata?.oldStatus !== "removed" || last.metadata?.newStatus !== "active"
  ) {
    throw new Error("member rejoin audit metadata was incomplete.");
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
    appLogin(appOrigin, userAEmail, userAPassword, "User A"),
    appLogin(appOrigin, userBEmail, userBPassword, "User B"),
    supabaseLogin(supabase, userAEmail, userAPassword, "User A"),
    supabaseLogin(supabase, userBEmail, userBPassword, "User B")
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
    assertAuthenticatedWorkspaceInputRejected(
      supabase,
      directUserA,
      "a".repeat(65),
      uniqueSlug("long-name"),
      "authenticated 65-character workspace name"
    ),
    assertAuthenticatedWorkspaceInputRejected(
      supabase,
      directUserA,
      "valid name",
      "INVALID SLUG",
      "authenticated invalid workspace slug"
    ),
    assertAuthenticatedWorkspaceInputRejected(
      supabase,
      directUserA,
      "\t\n",
      uniqueSlug("control-whitespace"),
      "authenticated control-whitespace-only workspace name"
    ),
    assertAuthenticatedWorkspaceInputRejected(
      supabase,
      directUserA,
      "\u00a0\u3000",
      uniqueSlug("unicode-whitespace"),
      "authenticated Unicode-whitespace-only workspace name"
    ),
    assertAuthenticatedWorkspaceInputRejected(
      supabase,
      directUserA,
      "😀".repeat(65),
      uniqueSlug("emoji-name"),
      "authenticated 65-code-point workspace name"
    )
  ]);
  await Promise.all([
    assertAuthenticatedWorkspaceNameUpdateRejected(
      supabase,
      directUserA,
      workspaceA,
      ` ${"a".repeat(64)} `,
      "RLS negative test A",
      "authenticated space-padded workspace name"
    ),
    assertAuthenticatedWorkspaceNameUpdateRejected(
      supabase,
      directUserA,
      workspaceA,
      `\t${"a".repeat(64)}\u00a0`,
      "RLS negative test A",
      "authenticated control-and-Unicode-padded workspace name"
    )
  ]);
  await assertDisplayNameContract(supabase, directUserA);
  await assertCrossWorkspaceWritesRejected(
    supabase,
    directUserA,
    directUserB,
    workspaceA,
    workspaceB
  );
  await assertCrossWorkspaceMemberApisRejected(appOrigin, appUserA, appUserB, workspaceA, workspaceB);

  await Promise.all([
    assertAnonymousRpcRejected(supabase, "create_workspace", {
      workspace_name: "anonymous must fail",
      workspace_slug: uniqueSlug("anonymous")
    }),
    assertAnonymousRpcRejected(supabase, "is_workspace_member", {
      target_workspace_id: workspaceA.id
    }),
    assertAnonymousRpcRejected(supabase, "list_workspace_members", {
      target_workspace_id: workspaceA.id
    }),
    assertAnonymousRpcRejected(supabase, "create_workspace_join_code", {}),
    assertAnonymousRpcRejected(supabase, "redeem_workspace_join_code", {
      target_workspace_id: workspaceA.id,
      join_code: `mmj_${"A".repeat(43)}`,
      target_role: "viewer"
    }),
    assertAnonymousRpcRejected(supabase, "update_workspace_member", {
      target_workspace_id: workspaceA.id,
      target_user_id: directUserB.userId,
      target_role: "viewer",
      target_status: "active"
    })
  ]);
  await assertIdentityFieldsImmutable(
    appOrigin,
    supabase,
    appUserA,
    appUserB,
    directUserA,
    directUserB,
    workspaceA
  );
  await assertInitialAuditContract(
    appOrigin,
    supabase,
    appUserA,
    directUserA,
    directUserB,
    workspaceA
  );
  await assertMembershipTableWritesRevoked(supabase, directUserA, directUserB, workspaceA);
  await assertLastOwnerProtected(appOrigin, appUserA, appUserB, workspaceA);
  await assertEditorViewerRestrictions(
    appOrigin,
    supabase,
    appUserA,
    directUserA,
    directUserB,
    workspaceA
  );
  await assertMemberManagementApis(appOrigin, appUserB, appUserA, workspaceB);
  await assertRemovedMemberRequiresFreshJoinCode(
    appOrigin,
    supabase,
    appUserB,
    appUserA,
    directUserB,
    workspaceB
  );
  await assertMemberAuditSequence(supabase, directUserB, workspaceB, directUserA);

  console.log(JSON.stringify({
    status: "ok",
    checks: {
      userALogin: true,
      userBLogin: true,
      userACanSeeOwnWorkspace: true,
      userBCanSeeOwnWorkspace: true,
      userACannotSeeUserBWorkspaceViaApp: true,
      userBCannotSeeUserAWorkspaceViaApp: true,
      userACannotReadUserBWorkspaceViaSupabaseRest: true,
      userBCannotReadUserAWorkspaceViaSupabaseRest: true,
      userACannotWriteUserBWorkspaceViaSupabaseRest: true,
      userBCannotWriteUserAWorkspaceViaSupabaseRest: true,
      anonymousCannotExecuteWorkspaceRpcs: true,
      authenticatedCannotBypassWorkspaceInputContract: true,
      displayNameUsesCodePointSafeBound: true,
      ownerCannotMutateIdentityFields: true,
      adminCannotMutateIdentityFields: true,
      membershipCreatedByForcedToActor: true,
      auditActorActionResourceMetadataVerified: true,
      idempotentMemberUpdateDoesNotDuplicateAudit: true,
      auditWritesAreAppendOnlyForClients: true,
      editorViewerCannotReadAudit: true,
      directMembershipTableWritesRevoked: true,
      editorCannotManageWorkspaceOrMembers: true,
      viewerCannotManageWorkspaceOrMembers: true,
      adminCanUseMemberMutationApi: true,
      ownerCannotRemoveOrDowngradeLastOwner: true,
      adminCannotRemoveOrDowngradeLastOwner: true,
      memberApiRejectsCrossWorkspaceReads: true,
      ownerCanRedeemConsentCodeChangeAndStopMember: true,
      repeatedJoinCodeIssuanceReplacesPriorCode: true,
      removedMemberRequiresFreshJoinCode: true,
      removedMemberMutationRedactsProfile: true,
      editorCannotUseMemberMutationApi: true,
      memberApiRejectsLastOwnerRemoval: true
    },
    createdWorkspaces: {
      userA: Boolean(workspaceA.id),
      userB: Boolean(workspaceB.id)
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
