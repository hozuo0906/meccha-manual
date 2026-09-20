import type { AccessUserActor } from "../../access-identity.ts";
import { D1RepositoryError } from "./d1-errors.ts";
import type { D1DatabaseLike } from "./d1-types.ts";

export interface BootstrapResult {
  status: "ready";
  workspaceId: string;
  createdIdentity: boolean;
}

export class D1OnboardingRepository {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) { this.db = db; }

  async bootstrap(actor: AccessUserActor, operationId: string): Promise<BootstrapResult> {
    if (actor.kind !== "access_user" || !actor.issuer || !actor.subject.trim()) {
      throw new D1RepositoryError("actor_forbidden");
    }
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(operationId)) throw new D1RepositoryError("invalid_input");
    const identityId = crypto.randomUUID();
    const workspaceId = crypto.randomUUID();
    const now = new Date().toISOString();
    const identity = "SELECT application_id FROM identities WHERE issuer = ?1 AND subject = ?2 AND status = 'active'";
    const personal = `SELECT w.id FROM workspaces w JOIN identities i ON i.application_id = w.created_by
      WHERE i.issuer = ?1 AND i.subject = ?2 AND i.status = 'active'
        AND w.workspace_kind = 'personal' AND w.status = 'active'`;
    const authorized = `${personal} AND EXISTS (SELECT 1 FROM workspace_members m
      WHERE m.workspace_id = w.id AND m.application_id = i.application_id AND m.role = 'owner' AND m.status = 'active')`;
    const bind = (sql: string, ...rest: unknown[]) => this.db.prepare(sql).bind(actor.issuer, actor.subject, ...rest);

    try {
      await this.assertAvailable(actor);
      // D1 batch is the transaction boundary. All authorization predicates run again
      // inside it; the NOT NULL operation insert aborts the entire batch on denial.
      const result = await this.db.batch([
        bind(`INSERT INTO identities(application_id, issuer, subject, status, created_at, updated_at)
          VALUES (?3, ?1, ?2, 'active', ?4, ?4) ON CONFLICT(issuer, subject) DO NOTHING`, identityId, now),
        bind(`INSERT INTO profiles(application_id, display_name, locale, timezone, created_at, updated_at)
          SELECT application_id, '利用者', 'ja-JP', 'Asia/Tokyo', ?3, ?3 FROM identities
          WHERE issuer = ?1 AND subject = ?2 AND status = 'active'
          ON CONFLICT(application_id) DO NOTHING`, now),
        bind(`INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at, workspace_kind)
          SELECT ?3, 'Personal Workspace', ?4, 'active', application_id, ?5, ?5, 'personal'
          FROM identities i WHERE issuer = ?1 AND subject = ?2 AND status = 'active'
            AND NOT EXISTS (SELECT 1 FROM workspaces w WHERE w.created_by = i.application_id AND w.workspace_kind = 'personal')`,
        workspaceId, `personal-${workspaceId}`, now),
        bind(`INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at)
          SELECT w.id, w.created_by, 'owner', 'active', ?3, ?3 FROM workspaces w
          WHERE w.id = (${personal}) AND NOT EXISTS (SELECT 1 FROM workspace_members m
            WHERE m.workspace_id = w.id AND m.application_id = w.created_by)`, now),
        bind(`INSERT INTO audit_logs(id, actor_application_id, workspace_id, target_application_id, action, metadata_json, created_at)
          SELECT ?3, w.created_by, w.id, NULL, 'workspace.created', '{}', ?4 FROM workspaces w
          WHERE w.id = ?5 AND w.id = (${authorized})`, `bootstrap-${workspaceId}`, now, workspaceId),
        bind(`INSERT INTO onboarding_bootstrap_operations(application_id, operation_id, workspace_id, created_identity, created_at)
          SELECT (${identity}), ?3, (${authorized}), CASE WHEN (${identity}) = ?4 THEN 1 ELSE 0 END, ?5
          WHERE NOT EXISTS (SELECT 1 FROM onboarding_bootstrap_operations
            WHERE application_id = (${identity}) AND operation_id = ?3)`, operationId, identityId, now),
        bind(`INSERT INTO onboarding_signup_events(event_id, event_name, application_id, operation_id, workspace_id, occurred_at)
          SELECT 'meccha-manual:onboarding:v1:signup_completed:' || length(o.application_id) || ':' || o.application_id || ':' || o.operation_id,
            'signup_completed', o.application_id, o.operation_id, o.workspace_id, o.created_at
          FROM onboarding_bootstrap_operations o WHERE o.application_id = (${identity})
            AND o.operation_id = ?3 AND o.created_identity = 1
            AND NOT EXISTS (SELECT 1 FROM onboarding_signup_events e WHERE e.application_id = o.application_id)`, operationId)
      ]);
      if (result.some((item) => !item.success)) throw new D1RepositoryError("unavailable");
      const saved = await bind(`SELECT o.workspace_id, o.created_identity FROM onboarding_bootstrap_operations o
        WHERE o.application_id = (${identity}) AND o.operation_id = ?3 AND o.workspace_id = (${authorized})`, operationId)
        .first<{ workspace_id: string; created_identity: number }>();
      if (!saved) { await this.assertAvailable(actor); throw new D1RepositoryError("unavailable"); }
      return { status: "ready", workspaceId: saved.workspace_id, createdIdentity: saved.created_identity === 1 };
    } catch (error) {
      if (error instanceof D1RepositoryError) throw error;
      // Distinguish a concurrent authorization change from transient storage failure.
      await this.assertAvailable(actor);
      throw new D1RepositoryError("unavailable");
    }
  }

  private async assertAvailable(actor: AccessUserActor): Promise<void> {
    let state: { status: string; workspace_status: string | null; member_role: string | null; member_status: string | null } | null;
    try {
      state = await this.db.prepare(`SELECT i.status, w.status AS workspace_status, m.role AS member_role, m.status AS member_status
        FROM identities i LEFT JOIN workspaces w ON w.created_by = i.application_id AND w.workspace_kind = 'personal'
        LEFT JOIN workspace_members m ON m.workspace_id = w.id AND m.application_id = i.application_id
        WHERE i.issuer = ?1 AND i.subject = ?2`).bind(actor.issuer, actor.subject).first();
    } catch { throw new D1RepositoryError("unavailable"); }
    if (!state) return;
    if (state.status !== "active") throw new D1RepositoryError("actor_forbidden");
    if (state.workspace_status !== null && state.workspace_status !== "active") throw new D1RepositoryError("personal_workspace_unavailable");
    if (state.member_role !== null && (state.member_role !== "owner" || state.member_status !== "active")) {
      throw new D1RepositoryError("actor_forbidden");
    }
  }
}
