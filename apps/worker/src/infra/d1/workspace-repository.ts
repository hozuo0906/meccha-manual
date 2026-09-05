import { D1RepositoryError, ensureRepositoryError } from "./d1-errors.ts";
import { changed, type D1DatabaseLike } from "./d1-types.ts";

export type WorkspaceStatus = "active" | "suspended" | "deleted";
export type WorkspaceRole = "owner" | "admin" | "editor" | "viewer";
export type MembershipStatus = "active" | "invited" | "removed";

export interface WorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  createdAt: string;
}

export interface ProfileRecord {
  applicationId: string;
  displayName: string;
  locale: string;
  timezone: string;
}

export interface WorkspaceMemberRecord {
  applicationId: string;
  displayName: string;
  role: WorkspaceRole;
  status: "active";
  joinedAt: string;
}

export interface CreateWorkspaceInput {
  name: string;
  slug: string;
}

export interface JoinCodeResult {
  code: string;
  expiresAt: string;
}

export interface UpdateMemberInput {
  role: Exclude<WorkspaceRole, "owner">;
  status: "active" | "removed";
}

interface WorkspaceRow {
  id: string;
  name: string;
  slug: string;
  status: WorkspaceStatus;
  created_at: string;
}

interface ProfileRow {
  application_id: string;
  display_name: string;
  locale: string;
  timezone: string;
}

interface MemberRow {
  application_id: string;
  display_name: string;
  role: WorkspaceRole;
  status: "active";
  joined_at: string;
}

interface CurrentMemberRow {
  role: WorkspaceRole;
  status: MembershipStatus;
}

const WORKSPACE_LIST_LIMIT = 1_000;
const WORKSPACE_LIST_FETCH_LIMIT = WORKSPACE_LIST_LIMIT + 1;
const MEMBER_LIST_LIMIT = 1_000;
const JOIN_CODE_TTL_MS = 10 * 60 * 1_000;
const AUDIT_METADATA = JSON.stringify({ source: "worker", version: 1 });

function nowOrThrow(now: string): number {
  const value = Date.parse(now);
  if (!Number.isFinite(value)) throw new D1RepositoryError("invalid_input");
  return value;
}

function normalizeWorkspace(input: CreateWorkspaceInput): { name: string; slug: string } {
  if (typeof input.name !== "string" || typeof input.slug !== "string") {
    throw new D1RepositoryError("invalid_input");
  }
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();
  if ([...name].length < 1 || [...name].length > 64) {
    throw new D1RepositoryError("invalid_input");
  }
  if (slug.length < 3 || slug.length > 63 || !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) {
    throw new D1RepositoryError("invalid_input");
  }
  return { name, slug };
}

function randomId(): string {
  return crypto.randomUUID();
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

async function digestJoinCode(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function runCount(result: Parameters<typeof changed>[0]): number {
  return changed(result);
}

export class D1WorkspaceRepository {
  private readonly db: D1DatabaseLike;

  constructor(db: D1DatabaseLike) {
    this.db = db;
  }

  async listWorkspaces(actorId: string): Promise<WorkspaceSummary[]> {
    try {
      const result = await this.db
        .prepare(
          `SELECT w.id, w.name, w.slug, w.status, w.created_at
             FROM workspaces AS w
             JOIN workspace_members AS m ON m.workspace_id = w.id
             JOIN identities AS i ON i.application_id = m.application_id
            WHERE m.application_id = ?1
              AND i.application_id = ?1
              AND i.status = 'active'
              AND m.status = 'active'
              AND m.role IN ('owner', 'admin', 'editor', 'viewer')
              AND w.status = 'active'
            ORDER BY w.created_at ASC, w.id ASC
            LIMIT ?2`
        )
        .bind(actorId, WORKSPACE_LIST_FETCH_LIMIT)
        .all<WorkspaceRow>();
      if (result.results.length > WORKSPACE_LIST_LIMIT) {
        throw new D1RepositoryError("limit_exceeded");
      }
      return result.results.map((row) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        status: row.status,
        createdAt: row.created_at
      }));
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }

  async getProfile(actorId: string): Promise<ProfileRecord | null> {
    try {
      const row = await this.db
        .prepare(
          `SELECT p.application_id, p.display_name, p.locale, p.timezone
             FROM profiles AS p
             JOIN identities AS i ON i.application_id = p.application_id
            WHERE p.application_id = ?1 AND i.status = 'active'
            LIMIT 1`
        )
        .bind(actorId)
        .first<ProfileRow>();
      return row
        ? {
            applicationId: row.application_id,
            displayName: row.display_name,
            locale: row.locale,
            timezone: row.timezone
          }
        : null;
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }

  async listMembers(actorId: string, workspaceId: string): Promise<WorkspaceMemberRecord[]> {
    try {
      const result = await this.db
        .prepare(
          `SELECT target.application_id, p.display_name, target.role, target.status, target.joined_at
             FROM workspace_members AS actor_member
             JOIN identities AS actor_identity
               ON actor_identity.application_id = actor_member.application_id
             JOIN workspaces AS w ON w.id = actor_member.workspace_id
             JOIN workspace_members AS target ON target.workspace_id = actor_member.workspace_id
             JOIN identities AS target_identity ON target_identity.application_id = target.application_id
             JOIN profiles AS p ON p.application_id = target.application_id
            WHERE actor_member.application_id = ?1
              AND actor_member.workspace_id = ?2
              AND actor_identity.status = 'active'
              AND actor_member.status = 'active'
              AND actor_member.role IN ('owner', 'admin', 'editor', 'viewer')
              AND w.status = 'active'
              AND target.status = 'active'
              AND target_identity.status = 'active'
            ORDER BY target.joined_at ASC, target.application_id ASC
            LIMIT ?3`
        )
        .bind(actorId, workspaceId, MEMBER_LIST_LIMIT)
        .all<MemberRow>();
      return result.results.map((row) => ({
        applicationId: row.application_id,
        displayName: row.display_name,
        role: row.role,
        status: row.status,
        joinedAt: row.joined_at
      }));
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }

  async createWorkspace(actorId: string, input: CreateWorkspaceInput, now: string): Promise<WorkspaceSummary> {
    const normalized = normalizeWorkspace(input);
    nowOrThrow(now);
    const id = randomId();
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `INSERT INTO workspaces(id, name, slug, status, created_by, created_at, updated_at)
             SELECT ?1, ?2, ?3, 'active', i.application_id, ?4, ?4
               FROM identities AS i
              WHERE i.application_id = ?5 AND i.status = 'active'`
          )
          .bind(id, normalized.name, normalized.slug, now, actorId),
        this.db
          .prepare(
            `INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at)
             SELECT ?1, w.created_by, 'owner', 'active', ?2, ?2
               FROM workspaces AS w
               JOIN identities AS i ON i.application_id = w.created_by
              WHERE w.id = ?1 AND w.created_by = ?3 AND w.status = 'active' AND i.status = 'active'`
          )
          .bind(id, now, actorId),
        this.db
          .prepare(
            `INSERT INTO audit_logs(id, actor_application_id, workspace_id, action, metadata_json, created_at)
             SELECT ?1, ?2, ?3, 'workspace.created', ?4, ?5
              WHERE EXISTS (
                SELECT 1 FROM workspace_members
                 WHERE workspace_id = ?3 AND application_id = ?2 AND role = 'owner' AND status = 'active'
              )`
          )
          .bind(randomId(), actorId, id, AUDIT_METADATA, now)
      ]);
      if (runCount(results[0]) !== 1 || runCount(results[1]) !== 1 || runCount(results[2]) !== 1) {
        throw new D1RepositoryError("forbidden");
      }
      return { id, name: normalized.name, slug: normalized.slug, status: "active", createdAt: now };
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }

  async issueJoinCode(actorId: string, now: string): Promise<JoinCodeResult> {
    const issuedAt = nowOrThrow(now);
    const expiresAt = new Date(issuedAt + JOIN_CODE_TTL_MS).toISOString();
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    const code = `mmj_${encodeBase64Url(bytes)}`;
    const digest = await digestJoinCode(code);
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `UPDATE workspace_join_codes
                SET revoked_at = ?2
              WHERE issuer_application_id = ?1
                AND consumed_at IS NULL AND revoked_at IS NULL
                AND EXISTS (
                  SELECT 1 FROM identities
                   WHERE application_id = ?1 AND status = 'active'
                )`
          )
          .bind(actorId, now),
        this.db
          .prepare(
            `INSERT INTO workspace_join_codes
              (id, issuer_application_id, digest, issued_at, expires_at)
             SELECT ?1, i.application_id, ?2, ?3, ?4
               FROM identities AS i
              WHERE i.application_id = ?5 AND i.status = 'active'`
          )
          .bind(randomId(), digest, now, expiresAt, actorId),
        this.db
          .prepare(
            `INSERT INTO audit_logs
              (id, actor_application_id, action, metadata_json, created_at)
             SELECT ?1, ?2, 'join_code.issued', ?3, ?4
              WHERE EXISTS (
                SELECT 1 FROM workspace_join_codes
                 WHERE issuer_application_id = ?2 AND digest = ?5
              )`
          )
          .bind(randomId(), actorId, AUDIT_METADATA, now, digest)
      ]);
      if (runCount(results[1]) !== 1 || runCount(results[2]) !== 1) throw new D1RepositoryError("forbidden");
      return { code, expiresAt };
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }

  async consumeJoinCode(
    actorId: string,
    workspaceId: string,
    code: string,
    role: Exclude<WorkspaceRole, "owner">,
    now: string
  ): Promise<void> {
    nowOrThrow(now);
    if (typeof code !== "string" || code.length < 4 || code.length > 256) {
      throw new D1RepositoryError("conflict");
    }
    if (!["admin", "editor", "viewer"].includes(role)) {
      throw new D1RepositoryError("conflict");
    }
    const digest = await digestJoinCode(code);
    const consumptionNonce = randomId();
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `UPDATE workspace_join_codes AS c
                SET consumed_at = ?1, consumption_nonce = ?2
              WHERE c.digest = ?3
                AND c.consumed_at IS NULL AND c.revoked_at IS NULL AND c.expires_at > ?1
                AND EXISTS (
                  SELECT 1 FROM identities AS issuer
                   WHERE issuer.application_id = c.issuer_application_id AND issuer.status = 'active'
                )
                AND EXISTS (
                  SELECT 1 FROM workspace_members AS admin_member
                   JOIN identities AS admin_identity ON admin_identity.application_id = admin_member.application_id
                   JOIN workspaces AS w ON w.id = admin_member.workspace_id
                  WHERE admin_member.application_id = ?4 AND admin_member.workspace_id = ?5
                    AND admin_member.status = 'active' AND admin_member.role IN ('owner', 'admin')
                    AND admin_identity.status = 'active' AND w.status = 'active'
                )
                AND EXISTS (
                  SELECT 1 FROM identities AS target_identity
                   WHERE target_identity.application_id = c.issuer_application_id AND target_identity.status = 'active'
                )
                AND NOT EXISTS (
                  SELECT 1 FROM workspace_members AS existing
                    WHERE existing.workspace_id = ?5
                     AND existing.application_id = c.issuer_application_id
                     AND existing.status = 'active'
                )`
          )
          .bind(now, consumptionNonce, digest, actorId, workspaceId),
        this.db
          .prepare(
            `INSERT INTO workspace_members(workspace_id, application_id, role, status, joined_at, updated_at)
             SELECT ?1, c.issuer_application_id, ?2, 'active', ?3, ?3
               FROM workspace_join_codes AS c
               JOIN workspaces AS w ON w.id = ?1 AND w.status = 'active'
               JOIN identities AS actor_identity ON actor_identity.application_id = ?4 AND actor_identity.status = 'active'
              WHERE c.digest = ?5 AND c.consumed_at = ?3 AND c.consumption_nonce = ?6
                AND EXISTS (
                  SELECT 1 FROM workspace_members AS admin_member
                   WHERE admin_member.workspace_id = ?1 AND admin_member.application_id = ?4
                     AND admin_member.role IN ('owner', 'admin') AND admin_member.status = 'active'
                )
             ON CONFLICT(workspace_id, application_id) DO UPDATE SET
               role = excluded.role, status = 'active', joined_at = excluded.joined_at, updated_at = excluded.updated_at
              WHERE workspace_members.role <> 'owner' AND workspace_members.status <> 'active'`
          )
          .bind(workspaceId, role, now, actorId, digest, consumptionNonce),
        this.db
          .prepare(
            `INSERT INTO audit_logs
              (id, actor_application_id, workspace_id, target_application_id, action, metadata_json, created_at)
             SELECT ?1, ?2, ?3, c.issuer_application_id, 'member.joined', ?4, ?5
               FROM workspace_join_codes AS c
              WHERE c.digest = ?6 AND c.consumed_at = ?5 AND c.consumption_nonce = ?7
                AND EXISTS (
                  SELECT 1 FROM workspace_members
                   WHERE workspace_id = ?3 AND application_id = c.issuer_application_id
                     AND status = 'active'
                )`
          )
          .bind(randomId(), actorId, workspaceId, AUDIT_METADATA, now, digest, consumptionNonce)
      ]);
      if (runCount(results[0]) !== 1 || runCount(results[1]) !== 1 || runCount(results[2]) !== 1) {
        if (runCount(results[0]) === 0) throw new D1RepositoryError("conflict");
        throw new D1RepositoryError("unavailable");
      }
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }

  async updateMember(
    actorId: string,
    workspaceId: string,
    targetId: string,
    input: UpdateMemberInput,
    now: string
  ): Promise<void> {
    nowOrThrow(now);
    if (!["admin", "editor", "viewer"].includes(input.role) || !["active", "removed"].includes(input.status)) {
      throw new D1RepositoryError("invalid_input");
    }
    if (actorId === targetId && input.status === "removed") throw new D1RepositoryError("forbidden");
    try {
      const results = await this.db.batch([
        this.db
          .prepare(
            `UPDATE workspace_members AS target
                SET role = ?1, status = ?2, updated_at = ?3
              WHERE target.workspace_id = ?4 AND target.application_id = ?5
                AND target.role <> 'owner'
                AND (target.role <> ?1 OR target.status <> ?2)
                AND NOT (target.status <> 'active' AND ?2 = 'active')
                AND EXISTS (
                  SELECT 1 FROM identities AS target_identity
                   WHERE target_identity.application_id = target.application_id
                     AND target_identity.status = 'active'
                )
                AND EXISTS (
                  SELECT 1 FROM workspace_members AS actor_member
                   JOIN identities AS actor_identity ON actor_identity.application_id = actor_member.application_id
                   JOIN workspaces AS w ON w.id = actor_member.workspace_id
                  WHERE actor_member.workspace_id = ?4 AND actor_member.application_id = ?6
                    AND actor_member.status = 'active' AND actor_member.role IN ('owner', 'admin')
                    AND actor_identity.status = 'active' AND w.status = 'active'
                )`
          )
          .bind(input.role, input.status, now, workspaceId, targetId, actorId),
        this.db
          .prepare(
            `INSERT INTO audit_logs
              (id, actor_application_id, workspace_id, target_application_id, action, metadata_json, created_at)
             SELECT ?1, ?2, ?3, ?4, 'member.updated', ?5, ?6
              WHERE changes() = 1`
          )
          .bind(randomId(), actorId, workspaceId, targetId, AUDIT_METADATA, now)
      ]);
      if (runCount(results[0]) === 1) return;
      const current = await this.db
        .prepare(
          `SELECT target.role, target.status
             FROM workspace_members AS target
             JOIN identities AS target_identity ON target_identity.application_id = target.application_id
            WHERE target.workspace_id = ?1 AND target.application_id = ?2
              AND target.role <> 'owner' AND target_identity.status = 'active'
              AND EXISTS (
                SELECT 1 FROM workspace_members AS actor_member
                 JOIN identities AS actor_identity ON actor_identity.application_id = actor_member.application_id
                 JOIN workspaces AS w ON w.id = actor_member.workspace_id
                WHERE actor_member.workspace_id = ?1 AND actor_member.application_id = ?3
                  AND actor_member.status = 'active' AND actor_member.role IN ('owner', 'admin')
                  AND actor_identity.status = 'active' AND w.status = 'active'
              )
            LIMIT 1`
        )
        .bind(workspaceId, targetId, actorId)
        .first<CurrentMemberRow>();
      if (current?.role === input.role && current.status === input.status) return;
      throw new D1RepositoryError("forbidden");
    } catch (error) {
      throw ensureRepositoryError(error);
    }
  }
}
