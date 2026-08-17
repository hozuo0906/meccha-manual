import {
  ManualError,
  booleanRpc,
  canonicalUuidSegment,
  errorResponse,
  jsonResponse,
  requireSession,
  verifySameOriginWrite,
  type ManualEnv
} from "./manual-router.ts";

const CAPTURE_ROUTE = /^\/(?:api|v1)\/workspaces\/([^/]+)\/(capture-sessions|mobile-preview-sessions)(?:\/([^/]+)\/(live-url|commands))?$/;

async function assertCaptureEditor(request: Request, env: ManualEnv, workspaceId: string): Promise<void> {
  const session = await requireSession(request, env);
  const canEdit = await booleanRpc(
    env,
    session.accessToken,
    "has_workspace_role",
    { target_workspace_id: workspaceId, target_user_id: session.userId, allowed_roles: ["owner", "admin", "editor"] },
    "CAPTURE_ACCESS_CHECK_FAILED",
    "操作記録の利用権限を確認できませんでした。時間をおいて、もう一度お試しください。"
  );
  if (!canEdit) throw new ManualError(403, "CAPTURE_FORBIDDEN", "操作を記録する権限がありません。管理者に確認してください。");
}

export async function handleCaptureRoute(request: Request, env: ManualEnv): Promise<Response | null> {
  const url = new URL(request.url);
  const match = CAPTURE_ROUTE.exec(url.pathname);
  if (!match) return null;
  if (request.method !== "POST") return jsonResponse({ code: "METHOD_NOT_ALLOWED", message: "この操作には対応していません。" }, 405);

  try {
    verifySameOriginWrite(request);
    const workspaceId = canonicalUuidSegment(match[1] ?? "");
    if (!workspaceId) throw new ManualError(404, "CAPTURE_NOT_FOUND", "指定された操作記録領域が見つかりません。");
    if (match[3] && !canonicalUuidSegment(match[3])) throw new ManualError(404, "CAPTURE_NOT_FOUND", "指定された操作記録が見つかりません。");
    await assertCaptureEditor(request, env, workspaceId);

    // OQ-006 / DEC-032: this branch intentionally has no Browser binding. A
    // future verified-egress implementation must replace this boundary only
    // after all Browser traffic is constrained before application bytes leave.
    throw new ManualError(503, "BROWSER_EGRESS_NOT_VERIFIED", "安全な接続先の検証が完了していないため、現在は操作を記録できません。");
  } catch (error) {
    return errorResponse(error);
  }
}
