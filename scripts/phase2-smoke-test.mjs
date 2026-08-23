import { readFile } from "node:fs/promises";

const DEFAULT_APP_ORIGIN = "https://meccha-manual.tattoo-studio-crm.workers.dev";
const REMOTE_WRITE_GUARD = "I_UNDERSTAND_TEST_DATA_WILL_BE_CREATED";

const config = {
  appOrigin: process.env.MECCHA_APP_ORIGIN || DEFAULT_APP_ORIGIN,
  allowRemoteWrite: process.env.MECCHA_PHASE2_ALLOW_REMOTE_WRITE,
  supabaseUrl: process.env.MECCHA_SUPABASE_URL,
  supabaseAnonKey: process.env.MECCHA_SUPABASE_ANON_KEY,
  userA: {
    email: process.env.MECCHA_PHASE2_USER_A_EMAIL,
    password: process.env.MECCHA_PHASE2_USER_A_PASSWORD
  },
  userB: {
    email: process.env.MECCHA_PHASE2_USER_B_EMAIL,
    password: process.env.MECCHA_PHASE2_USER_B_PASSWORD
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
      `Remote Phase 2 smoke test creates workspace/manual rows. Set MECCHA_PHASE2_ALLOW_REMOTE_WRITE=${REMOTE_WRITE_GUARD} to continue.`
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
  return `phase2-${label}-${Date.now()}-${random}`;
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

  throw new Error(`${label} failed: HTTP ${response.status}`);
}

async function assertFails(responseOrPromise, label) {
  const response = await responseOrPromise;
  const payload = await readJson(response);
  if (!response.ok) return payload;

  throw new Error(`${label} unexpectedly succeeded: HTTP ${response.status}`);
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
  const payload = await assertOk(response, "app login");
  const cookie = extractCookies(response.headers);

  if (!cookie.includes("__Host-mm_access=") || !cookie.includes("__Host-mm_refresh=")) {
    throw new Error("app login did not return session cookies");
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
  const payload = await assertOk(response, "Supabase login");

  if (!payload.access_token || !payload.user?.id) {
    throw new Error("Supabase login did not return an access token");
  }

  return {
    email,
    accessToken: payload.access_token,
    userId: payload.user.id
  };
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
  return assertOk(response, "create workspace");
}

async function archiveManual(appOrigin, actor, workspaceId, manualId, expectedUpdatedAt) {
  const response = await fetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspaceId)}/manuals/${encodeURIComponent(manualId)}/archive`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": appOrigin,
        "cookie": actor.cookie
      },
      body: JSON.stringify({ expectedUpdatedAt })
    }
  );
  return assertOk(response, "archive manual");
}

async function supabaseRequest(supabase, actor, path, options = {}) {
  return fetch(`${supabase.url}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      "apikey": supabase.anonKey,
      "authorization": `Bearer ${actor.accessToken}`,
      ...(options.headers || {})
    }
  });
}

async function rpc(supabase, actor, functionName, body) {
  const response = await supabaseRequest(supabase, actor, `/rest/v1/rpc/${functionName}`, {
    method: "POST",
    body: JSON.stringify(body)
  });
  return assertOk(response, `rpc ${functionName}`);
}

async function selectRows(supabase, actor, table, query) {
  const response = await supabaseRequest(supabase, actor, `/rest/v1/${table}?${query}`, {
    method: "GET"
  });
  const payload = await assertOk(response, `select ${table}`);

  if (!Array.isArray(payload)) {
    throw new Error(`select ${table} did not return an array`);
  }

  return payload;
}

async function assertCannotReadManualGraph(supabase, actor, manualId, revisionIds, stepIds) {
  const revisions = Array.isArray(revisionIds) ? revisionIds : [revisionIds];
  const steps = Array.isArray(stepIds) ? stepIds : [stepIds];
  const manualRows = await selectRows(
    supabase,
    actor,
    "manuals",
    `select=id&id=eq.${encodeURIComponent(manualId)}`
  );
  const revisionRows = await selectRows(
    supabase,
    actor,
    "manual_revisions",
    `select=id&id=in.(${revisions.map((id) => encodeURIComponent(id)).join(",")})`
  );
  const stepRows = await selectRows(
    supabase,
    actor,
    "manual_steps",
    `select=id&id=in.(${steps.map((id) => encodeURIComponent(id)).join(",")})`
  );

  if (manualRows.length !== 0) {
    throw new Error("User B can directly read User A manual through Supabase REST.");
  }

  if (revisionRows.length !== 0) {
    throw new Error("User B can directly read User A manual revision through Supabase REST.");
  }

  if (stepRows.length !== 0) {
    throw new Error("User B can directly read User A manual step through Supabase REST.");
  }
}

async function main() {
  const appOrigin = config.appOrigin.replace(/\/$/, "");
  requireRemoteWriteGuard(appOrigin);

  const supabase = await loadPublicSupabaseConfig();
  const userAEmail = requireValue(config.userA.email, "MECCHA_PHASE2_USER_A_EMAIL");
  const userAPassword = requireValue(config.userA.password, "MECCHA_PHASE2_USER_A_PASSWORD");
  const userBEmail = requireValue(config.userB.email, "MECCHA_PHASE2_USER_B_EMAIL");
  const userBPassword = requireValue(config.userB.password, "MECCHA_PHASE2_USER_B_PASSWORD");

  if (userAEmail === userBEmail) {
    throw new Error("Phase 2 smoke test requires two different users.");
  }

  const [appUserA, directUserA, directUserB] = await Promise.all([
    appLogin(appOrigin, userAEmail, userAPassword),
    supabaseLogin(supabase, userAEmail, userAPassword),
    supabaseLogin(supabase, userBEmail, userBPassword)
  ]);

  const workspaceSlug = uniqueSlug("workspace");
  const createdWorkspace = await createWorkspace(appOrigin, appUserA, "Phase 2 smoke workspace", workspaceSlug);
  const workspaceId = createdWorkspace.workspaceId;

  const manualId = await rpc(supabase, directUserA, "create_manual", {
    target_workspace_id: workspaceId,
    target_folder_id: null,
    manual_title: "Phase 2 smoke manual",
    manual_description: "Phase 2 schema smoke test"
  });

  const [manual] = await selectRows(
    supabase,
    directUserA,
    "manuals",
    `select=id,current_draft_revision_id,current_published_revision_id,status&id=eq.${encodeURIComponent(manualId)}&limit=1`
  );

  if (!manual?.current_draft_revision_id || manual.current_published_revision_id !== null) {
    throw new Error("create_manual did not create the expected draft-only manual state.");
  }

  const draftRevisionId = manual.current_draft_revision_id;
  const stepId = await rpc(supabase, directUserA, "append_manual_step", {
    target_revision_id: draftRevisionId,
    step_type: "action",
    step_title: "ログイン画面を開く",
    step_instruction: "ログイン画面を開きます。",
    step_action_type: "navigate",
    step_target_text: "ログイン",
    step_url: "https://example.com/login",
    step_asset_id: null,
    step_annotation: {},
    step_masking: {}
  });

  const contentVersion = await rpc(supabase, directUserA, "get_manual_edit_detail", {
    target_workspace_id: workspaceId,
    target_manual_id: manualId
  });
  const publishedRevisionId = await rpc(supabase, directUserA, "publish_manual_revision", {
    target_manual_id: manualId,
    expected_draft_revision_id: draftRevisionId,
    expected_content_version: contentVersion.draft.content_version,
    confirmed_sensitive_data_review: true
  });

  if (publishedRevisionId !== draftRevisionId) {
    throw new Error("publish_manual returned a revision different from the current draft.");
  }

  const publishedRevisionBeforeDraftEdit = await selectRows(
    supabase,
    directUserA,
    "manual_revisions",
    `select=id,state,title,description&id=eq.${encodeURIComponent(publishedRevisionId)}&limit=1`
  );
  const publishedStepBeforeDraftEdit = await selectRows(
    supabase,
    directUserA,
    "manual_steps",
    `select=id,type,title,instruction,action_type,target_text,url&revision_id=eq.${encodeURIComponent(publishedRevisionId)}&deleted_at=is.null&limit=2`
  );
  if (publishedRevisionBeforeDraftEdit.length !== 1 || publishedStepBeforeDraftEdit.length !== 1) {
    throw new Error("published manual snapshot was not available");
  }

  await assertFails(
    supabaseRequest(supabase, directUserA, "/rest/v1/manual_steps", {
      method: "POST",
      headers: {
        "prefer": "return=representation"
      },
      body: JSON.stringify({
        workspace_id: workspaceId,
        revision_id: publishedRevisionId,
        position: 2,
        type: "note",
        title: "公開版は編集不可",
        instruction: "この挿入は失敗する必要があります。",
        created_by: directUserA.userId
      })
    }),
    "insert step into published revision"
  );

  const nextDraftRevisionId = await rpc(supabase, directUserA, "create_manual_draft_from_published", {
    target_manual_id: manualId,
    expected_published_revision_id: publishedRevisionId
  });
  const copiedSteps = await selectRows(
    supabase,
    directUserA,
    "manual_steps",
    `select=id,updated_at,type,title,instruction,action_type,target_text,url&revision_id=eq.${encodeURIComponent(nextDraftRevisionId)}&deleted_at=is.null`
  );

  if (copiedSteps.length !== 1) {
    throw new Error("create_manual_draft did not copy the published step into the new draft.");
  }

  const copiedStep = copiedSteps[0];
  if (!copiedStep?.id || typeof copiedStep.updated_at !== "string") {
    throw new Error("copied draft step did not return an editable version");
  }

  await rpc(supabase, directUserA, "update_manual_step", {
    target_revision_id: nextDraftRevisionId,
    target_step_id: copiedStep.id,
    expected_step_updated_at: copiedStep.updated_at,
    step_type: copiedStep.type,
    step_title: "ログイン画面を開く（下書き編集）",
    step_instruction: "ログイン画面を開いて確認します。",
    step_action_type: copiedStep.action_type,
    step_target_text: copiedStep.target_text,
    step_url: copiedStep.url,
    step_asset_id: null,
    step_annotation: {},
    step_masking: {}
  });

  const detailAfterDraftEdit = await rpc(supabase, directUserA, "get_manual_edit_detail", {
    target_workspace_id: workspaceId,
    target_manual_id: manualId
  });
  if (
    !detailAfterDraftEdit?.manual?.updated_at
    || detailAfterDraftEdit.draft?.id !== nextDraftRevisionId
    || detailAfterDraftEdit.steps?.length !== 1
    || detailAfterDraftEdit.steps[0]?.title !== "ログイン画面を開く（下書き編集）"
  ) {
    throw new Error("next draft RPC edit was not reflected in the current detail");
  }

  const publishedRevisionAfterDraftEdit = await selectRows(
    supabase,
    directUserA,
    "manual_revisions",
    `select=id,state,title,description&id=eq.${encodeURIComponent(publishedRevisionId)}&limit=1`
  );
  const publishedStepAfterDraftEdit = await selectRows(
    supabase,
    directUserA,
    "manual_steps",
    `select=id,type,title,instruction,action_type,target_text,url&revision_id=eq.${encodeURIComponent(publishedRevisionId)}&deleted_at=is.null&limit=2`
  );
  if (
    JSON.stringify(publishedRevisionAfterDraftEdit) !== JSON.stringify(publishedRevisionBeforeDraftEdit)
    || JSON.stringify(publishedStepAfterDraftEdit) !== JSON.stringify(publishedStepBeforeDraftEdit)
  ) {
    throw new Error("editing the next draft changed the published revision");
  }

  await assertFails(
    supabaseRequest(supabase, directUserB, "/rest/v1/rpc/create_manual", {
      method: "POST",
      body: JSON.stringify({
        target_workspace_id: workspaceId,
        target_folder_id: null,
        manual_title: "This should fail",
        manual_description: ""
      })
    }),
    "user B create manual in user A workspace"
  );
  await assertCannotReadManualGraph(supabase, directUserB, manualId, publishedRevisionId, stepId);

  const archiveResult = await archiveManual(
    appOrigin,
    appUserA,
    workspaceId,
    manualId,
    detailAfterDraftEdit.manual.updated_at
  );
  if (archiveResult?.archivedManualId !== manualId) {
    throw new Error("archive_manual returned an unexpected result");
  }

  const archivedDetailResponse = await fetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspaceId)}/manuals/${encodeURIComponent(manualId)}`,
    { headers: { "cookie": appUserA.cookie } }
  );
  await readJson(archivedDetailResponse);
  if (archivedDetailResponse.status !== 404) {
    throw new Error("archived manual remained visible through the detail API");
  }

  const archivedListResponse = await fetch(
    `${appOrigin}/api/workspaces/${encodeURIComponent(workspaceId)}/manuals`,
    { headers: { "cookie": appUserA.cookie } }
  );
  const archivedList = await assertOk(archivedListResponse, "list manuals after archive");
  if (!Array.isArray(archivedList.manuals) || archivedList.manuals.some((row) => row?.id === manualId)) {
    throw new Error("archived manual remained visible through the list API");
  }

  await assertCannotReadManualGraph(
    supabase,
    directUserA,
    manualId,
    [publishedRevisionId, nextDraftRevisionId],
    [stepId, copiedStep.id]
  );

  const archiveAuditRows = await selectRows(
    supabase,
    directUserA,
    "audit_logs",
    `select=action,resource_id,metadata&workspace_id=eq.${encodeURIComponent(workspaceId)}&resource_id=eq.${encodeURIComponent(manualId)}&action=eq.manual.archived&limit=2`
  );
  if (
    archiveAuditRows.length !== 1
    || archiveAuditRows[0]?.metadata?.draftRevisionId !== nextDraftRevisionId
    || archiveAuditRows[0]?.metadata?.publishedRevisionId !== publishedRevisionId
  ) {
    throw new Error("archive audit did not preserve revision pointers");
  }

  console.log(JSON.stringify({
    status: "ok",
    checks: {
      userALogin: true,
      userBLogin: true,
      createWorkspace: true,
      createManual: true,
      insertDraftStep: true,
      publishManual: true,
      publishedRevisionImmutable: true,
      createDraftFromPublished: true,
      editDraftThroughRpc: true,
      publishedRevisionUnchangedAfterDraftEdit: true,
      archiveNonDestructivePointersRecorded: true,
      archivedManualHiddenFromDetail: true,
      archivedManualExcludedFromList: true,
      archivedManualGraphHiddenFromDirectReads: true,
      userBCannotCreateInUserAWorkspace: true,
      userBCannotReadUserAManualGraph: true
    },
    created: {
      workspaceIdPresent: Boolean(workspaceId),
      manualIdPresent: Boolean(manualId),
      publishedRevisionIdPresent: Boolean(publishedRevisionId),
      nextDraftRevisionIdPresent: Boolean(nextDraftRevisionId)
    }
  }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
