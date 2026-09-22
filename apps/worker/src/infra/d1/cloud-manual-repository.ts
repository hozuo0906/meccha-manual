import { D1RepositoryError, ensureRepositoryError } from "./d1-errors.ts";
import { changed, type D1DatabaseLike, type D1RunResult } from "./d1-types.ts";

export type CloudManualRole = "owner" | "admin" | "editor" | "viewer";
export type ClaimIntentStatus = "pending" | "completed" | "expired";
export type ManualStatus = "draft" | "reviewing" | "published" | "stale" | "archived";

export interface ClaimIntentRecord {
  id: string;
  actorId: string;
  workspaceId: string;
  operationId: string;
  assetCount: number;
  expiresAt: string;
  status: ClaimIntentStatus;
  requestFingerprint: string | null;
  manualId: string | null;
}

export interface StagedAssetRecord {
  id: string;
  claimIntentId: string;
  assetSlot: number;
  workspaceId: string;
  operationId: string;
  objectKey: string;
  contentType: string;
  byteLength: number;
  sha256: string;
  status: "reserved" | "staged" | "completed";
}

export interface ManualListRecord {
  id: string;
  workspaceId: string;
  title: string;
  status: ManualStatus;
  currentDraftRevisionId: string | null;
  currentPublishedRevisionId: string | null;
  updatedAt: string;
}

export interface ManualDetailRecord extends ManualListRecord {
  draft: {
    id: string;
    revisionNo: number;
    title: string;
    description: string;
    updatedAt: string;
    state: "draft" | "published";
    contentVersion: string;
  } | null;
  steps: Array<{
    id: string;
    position: number;
    type: "action" | "note" | "decision" | "warning";
    title: string;
    instruction: string;
    actionType: "click" | "input" | "select" | "navigate" | "wait" | "other" | null;
    targetText: string | null;
    url: string | null;
    assetId: string | null;
    updatedAt: string;
  }>;
  canEdit: boolean;
}

export interface ClaimStepInput {
  type: "action" | "note" | "decision" | "warning";
  title: string;
  instruction: string;
  actionType: "click" | "input" | "select" | "navigate" | "wait" | "other" | null;
  targetText: string | null;
  url: string | null;
  assetSlot: number | null;
  assetId: string | null;
}

export interface ClaimAssetInput {
  assetSlot: number;
  sha256: string;
}

export interface ManualStepMutationInput {
  type: ClaimStepInput["type"];
  title: string;
  instruction: string;
  actionType: ClaimStepInput["actionType"];
  targetText: string | null;
  url: string | null;
  assetId: string | null;
}

interface ClaimIntentRow {
  id: string;
  actor_application_id: string;
  workspace_id: string;
  operation_id: string;
  asset_count: number;
  expires_at: string;
  status: ClaimIntentStatus;
  request_fingerprint: string | null;
  manual_id: string | null;
}

interface StagedAssetRow {
  id: string;
  claim_intent_id: string;
  asset_slot: number;
  workspace_id: string;
  operation_id: string;
  object_key: string;
  content_type: string;
  byte_length: number;
  sha256: string;
  status: "reserved" | "staged" | "completed";
}

const ACTIVE_ROLES = "('owner','admin','editor','viewer')";

function repositoryError(error: unknown): D1RepositoryError {
  return ensureRepositoryError(error);
}

function mapClaimIntent(row: ClaimIntentRow): ClaimIntentRecord {
  return {
    id: row.id,
    actorId: row.actor_application_id,
    workspaceId: row.workspace_id,
    operationId: row.operation_id,
    assetCount: row.asset_count,
    expiresAt: row.expires_at,
    status: row.status,
    requestFingerprint: row.request_fingerprint,
    manualId: row.manual_id
  };
}

export class CloudManualRepository {
  private readonly db: D1DatabaseLike;
  constructor(db: D1DatabaseLike) { this.db = db; }

  async getWorkspaceRole(actorId: string, workspaceId: string): Promise<CloudManualRole | null> {
    try {
      const row = await this.db.prepare(`
        SELECT m.role
          FROM workspace_members m
          JOIN identities i ON i.application_id = m.application_id
          JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.application_id = ?1 AND m.workspace_id = ?2
           AND m.status = 'active' AND i.status = 'active' AND w.status = 'active'
           AND m.role IN ${ACTIVE_ROLES}
         LIMIT 1`).bind(actorId, workspaceId).first<{ role: CloudManualRole }>();
      return row?.role ?? null;
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async createClaimIntent(actorId: string, operationId: string, assetCount: number, now: string, ttlMs: number): Promise<ClaimIntentRecord> {
    if (!/^[A-Za-z0-9_-]{16,128}$/u.test(operationId) || !Number.isInteger(assetCount) || assetCount < 0 || assetCount > 100) {
      throw new D1RepositoryError("invalid_input");
    }
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.parse(now) + ttlMs).toISOString();
    try {
      const existing = await this.getClaimIntentByOperation(actorId, operationId);
      if (existing) {
        if (existing.assetCount !== assetCount) throw new D1RepositoryError("conflict");
        return existing;
      }
      const result = await this.db.prepare(`
        INSERT INTO claim_intents (id, actor_application_id, workspace_id, operation_id, asset_count, expires_at, status, created_at, updated_at)
        SELECT ?1, ?2, w.id, ?3, ?4, ?5, 'pending', ?6, ?6
          FROM workspaces w
          JOIN workspace_members m ON m.workspace_id = w.id AND m.application_id = ?2
         WHERE w.created_by = ?2 AND w.workspace_kind = 'personal'
           AND w.status = 'active' AND m.status = 'active' AND m.role = 'owner'
         LIMIT 1`).bind(id, actorId, operationId, assetCount, expiresAt, now).run();
      if (changed(result) !== 1) throw new D1RepositoryError("forbidden");
      const row = await this.getClaimIntent(actorId, id);
      if (!row) throw new D1RepositoryError("unavailable");
      return row;
    } catch (error) {
      const mapped = repositoryError(error);
      if (mapped.code === "conflict") {
        const raced = await this.getClaimIntentByOperation(actorId, operationId);
        if (raced) {
          if (raced.assetCount !== assetCount) throw mapped;
          return raced;
        }
      }
      throw mapped;
    }
  }

  async getClaimIntent(actorId: string, claimIntentId: string): Promise<ClaimIntentRecord | null> {
    try {
      const row = await this.db.prepare(`SELECT c.id, c.actor_application_id, c.workspace_id, c.operation_id, c.asset_count, c.expires_at, c.status, c.request_fingerprint, c.manual_id
        FROM claim_intents c JOIN identities i ON i.application_id = c.actor_application_id JOIN workspaces w ON w.id = c.workspace_id
        JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
        WHERE c.id = ?1 AND c.actor_application_id = ?2 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner' LIMIT 1`).bind(claimIntentId, actorId).first<ClaimIntentRow>();
      return row ? mapClaimIntent(row) : null;
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async getClaimIntentByOperation(actorId: string, operationId: string): Promise<ClaimIntentRecord | null> {
    try {
      const row = await this.db.prepare(`SELECT c.id, c.actor_application_id, c.workspace_id, c.operation_id, c.asset_count, c.expires_at, c.status, c.request_fingerprint, c.manual_id
        FROM claim_intents c JOIN identities i ON i.application_id = c.actor_application_id JOIN workspaces w ON w.id = c.workspace_id
        JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
        WHERE c.actor_application_id = ?1 AND c.operation_id = ?2 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner' LIMIT 1`).bind(actorId, operationId).first<ClaimIntentRow>();
      return row ? mapClaimIntent(row) : null;
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async getStagedAsset(actorId: string, claimIntentId: string, assetSlot: number): Promise<StagedAssetRecord | null> {
    try {
      const row = await this.db.prepare(`SELECT a.id, a.claim_intent_id, a.asset_slot, a.workspace_id, a.operation_id, a.object_key, a.content_type, a.byte_length, a.sha256, a.status
        FROM claim_assets a JOIN claim_intents c ON c.id = a.claim_intent_id JOIN identities i ON i.application_id = c.actor_application_id JOIN workspaces w ON w.id = c.workspace_id
        JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
       WHERE a.claim_intent_id = ?1 AND a.asset_slot = ?2 AND c.actor_application_id = ?3 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner' LIMIT 1`)
        .bind(claimIntentId, assetSlot, actorId).first<StagedAssetRow>();
      return row ? { id: row.id, claimIntentId: row.claim_intent_id, assetSlot: row.asset_slot, workspaceId: row.workspace_id, operationId: row.operation_id, objectKey: row.object_key, contentType: row.content_type, byteLength: row.byte_length, sha256: row.sha256, status: row.status } : null;
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async getStagedAssets(actorId: string, claimIntentId: string, assetSlots: number[]): Promise<StagedAssetRecord[]> {
    if (assetSlots.length === 0) return [];
    try {
      const result = await this.db.prepare(`SELECT a.id, a.claim_intent_id, a.asset_slot, a.workspace_id, a.operation_id, a.object_key, a.content_type, a.byte_length, a.sha256, a.status
        FROM claim_assets a JOIN claim_intents c ON c.id = a.claim_intent_id JOIN identities i ON i.application_id = c.actor_application_id JOIN workspaces w ON w.id = c.workspace_id
        JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
       WHERE a.claim_intent_id = ?1 AND c.actor_application_id = ?2 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner'
         AND a.asset_slot IN (SELECT CAST(value AS INTEGER) FROM json_each(?3))`)
        .bind(claimIntentId, actorId, JSON.stringify(assetSlots)).all<StagedAssetRow>();
      return result.results.map((row) => ({ id: row.id, claimIntentId: row.claim_intent_id, assetSlot: row.asset_slot, workspaceId: row.workspace_id, operationId: row.operation_id, objectKey: row.object_key, contentType: row.content_type, byteLength: row.byte_length, sha256: row.sha256, status: row.status }));
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async reserveStagedAsset(record: Omit<StagedAssetRecord, "status">, now: string): Promise<StagedAssetRecord> {
    try {
      const result = await this.db.prepare(`INSERT INTO claim_assets (id, claim_intent_id, asset_slot, workspace_id, operation_id, object_key, content_type, byte_length, sha256, status, created_at, updated_at)
        SELECT ?1, c.id, ?2, c.workspace_id, c.operation_id, ?3, ?4, ?5, ?6, 'reserved', ?7, ?7
          FROM claim_intents c WHERE c.id = ?8 AND c.workspace_id = ?9 AND c.operation_id = ?10 AND c.status = 'pending'
            AND EXISTS (SELECT 1 FROM identities i JOIN workspaces w ON w.id = c.workspace_id JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
              WHERE i.application_id = c.actor_application_id AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner')`)
        .bind(record.id, record.assetSlot, record.objectKey, record.contentType, record.byteLength, record.sha256, now, record.claimIntentId, record.workspaceId, record.operationId).run();
      if (changed(result) === 1) return { ...record, status: "reserved" };
      const existing = await this.db.prepare(`SELECT a.id, a.claim_intent_id, a.asset_slot, a.workspace_id, a.operation_id, a.object_key, a.content_type, a.byte_length, a.sha256, a.status
        FROM claim_assets a JOIN claim_intents c ON c.id = a.claim_intent_id JOIN identities i ON i.application_id = c.actor_application_id JOIN workspaces w ON w.id = c.workspace_id
        JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
        WHERE a.claim_intent_id = ?1 AND a.asset_slot = ?2 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner' LIMIT 1`).bind(record.claimIntentId, record.assetSlot).first<StagedAssetRow>();
      if (existing) return { id: existing.id, claimIntentId: existing.claim_intent_id, assetSlot: existing.asset_slot, workspaceId: existing.workspace_id, operationId: existing.operation_id, objectKey: existing.object_key, contentType: existing.content_type, byteLength: existing.byte_length, sha256: existing.sha256, status: existing.status };
      throw new D1RepositoryError("conflict");
    } catch (error) { throw repositoryError(error); }
  }

  async recordStagedAsset(record: Omit<StagedAssetRecord, "status">, now: string): Promise<StagedAssetRecord> {
    try {
      const result = await this.db.prepare(`UPDATE claim_assets SET status = 'staged', updated_at = ?1
        WHERE claim_intent_id = ?2 AND asset_slot = ?3 AND status = 'reserved' AND id = ?4 AND workspace_id = ?5 AND operation_id = ?6 AND object_key = ?7 AND content_type = ?8 AND byte_length = ?9 AND sha256 = ?10
          AND EXISTS (SELECT 1 FROM claim_intents c JOIN identities i ON i.application_id = c.actor_application_id JOIN workspaces w ON w.id = c.workspace_id JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
            WHERE c.id = ?2 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner')`)
        .bind(now, record.claimIntentId, record.assetSlot, record.id, record.workspaceId, record.operationId, record.objectKey, record.contentType, record.byteLength, record.sha256).run();
      if (changed(result) === 1) return { ...record, status: "staged" };
      const existing = await this.db.prepare(`SELECT a.id, a.claim_intent_id, a.asset_slot, a.workspace_id, a.operation_id, a.object_key, a.content_type, a.byte_length, a.sha256, a.status
        FROM claim_assets a JOIN claim_intents c ON c.id = a.claim_intent_id JOIN identities i ON i.application_id = c.actor_application_id JOIN workspaces w ON w.id = c.workspace_id
        JOIN workspace_members wm ON wm.workspace_id = c.workspace_id AND wm.application_id = c.actor_application_id
        WHERE a.claim_intent_id = ?1 AND a.asset_slot = ?2 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner' LIMIT 1`).bind(record.claimIntentId, record.assetSlot).first<StagedAssetRow>();
      if (existing) return { id: existing.id, claimIntentId: existing.claim_intent_id, assetSlot: existing.asset_slot, workspaceId: existing.workspace_id, operationId: existing.operation_id, objectKey: existing.object_key, contentType: existing.content_type, byteLength: existing.byte_length, sha256: existing.sha256, status: existing.status };
      throw new D1RepositoryError("conflict");
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async listManuals(actorId: string, workspaceId: string): Promise<ManualListRecord[]> {
    try {
      const result = await this.db.prepare(`SELECT m.id, m.workspace_id, m.title, m.status, m.current_draft_revision_id, m.current_published_revision_id, m.updated_at
        FROM manuals m JOIN workspace_members wm ON wm.workspace_id = m.workspace_id
       JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
       WHERE wm.application_id = ?1 AND wm.workspace_id = ?2 AND wm.status = 'active' AND i.status = 'active' AND w.status = 'active'
         AND wm.role IN ${ACTIVE_ROLES} AND m.archived_at IS NULL
       ORDER BY m.updated_at DESC, m.id ASC LIMIT 201`).bind(actorId, workspaceId).all<ManualListRecord & { updated_at?: string; current_draft_revision_id?: string | null; current_published_revision_id?: string | null; workspace_id?: string }>();
      if (result.results.length > 200) throw new D1RepositoryError("limit_exceeded");
      return result.results.map((row) => ({ id: row.id, workspaceId: row.workspace_id ?? workspaceId, title: row.title, status: row.status, currentDraftRevisionId: row.current_draft_revision_id ?? null, currentPublishedRevisionId: row.current_published_revision_id ?? null, updatedAt: row.updated_at ?? row.updatedAt }));
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async getManual(actorId: string, workspaceId: string, manualId: string): Promise<ManualDetailRecord | null> {
    try {
      const manual = await this.db.prepare(`SELECT m.id, m.workspace_id, m.title, m.status, m.current_draft_revision_id, m.current_published_revision_id, m.updated_at
        FROM manuals m JOIN workspace_members wm ON wm.workspace_id = m.workspace_id JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
       WHERE m.id = ?1 AND m.workspace_id = ?2 AND wm.application_id = ?3 AND wm.status = 'active' AND i.status = 'active' AND w.status = 'active' AND wm.role IN ${ACTIVE_ROLES} AND m.archived_at IS NULL LIMIT 1`).bind(manualId, workspaceId, actorId).first<{ id: string; workspace_id: string; title: string; status: ManualStatus; current_draft_revision_id: string | null; current_published_revision_id: string | null; updated_at: string }>();
      if (!manual) return null;
      const displayedRevision = manual.current_draft_revision_id ?? manual.current_published_revision_id;
      let draft: ManualDetailRecord["draft"] = null;
      let steps: ManualDetailRecord["steps"] = [];
      if (displayedRevision) {
        const revision = await this.db.prepare(`SELECT id, revision_no, title, description, updated_at, state, content_version FROM manual_revisions WHERE id = ?1 AND workspace_id = ?2 AND manual_id = ?3 AND state IN ('draft','published') LIMIT 1`).bind(displayedRevision, workspaceId, manualId).first<{ id: string; revision_no: number; title: string; description: string; updated_at: string; state: "draft" | "published"; content_version: string }>();
        if (!revision) throw new D1RepositoryError("unavailable");
        draft = { id: revision.id, revisionNo: revision.revision_no, title: revision.title, description: revision.description, updatedAt: revision.updated_at, state: revision.state, contentVersion: revision.content_version };
        const rows = await this.db.prepare(`SELECT id, position, type, title, instruction, action_type, target_text, url, asset_id, updated_at FROM manual_steps WHERE workspace_id = ?1 AND revision_id = ?2 AND deleted_at IS NULL ORDER BY position ASC, id ASC LIMIT 201`).bind(workspaceId, displayedRevision).all<{ id: string; position: number; type: ManualDetailRecord["steps"][number]["type"]; title: string; instruction: string; action_type: ManualDetailRecord["steps"][number]["actionType"]; target_text: string | null; url: string | null; asset_id: string | null; updated_at: string }>();
        if (rows.results.length > 200) throw new D1RepositoryError("limit_exceeded");
        steps = rows.results.map((row) => ({ id: row.id, position: row.position, type: row.type, title: row.title, instruction: row.instruction, actionType: row.action_type, targetText: row.target_text, url: row.url, assetId: row.asset_id, updatedAt: row.updated_at }));
      }
      const role = await this.getWorkspaceRole(actorId, workspaceId);
      return { id: manual.id, workspaceId: manual.workspace_id, title: manual.title, status: manual.status, currentDraftRevisionId: manual.current_draft_revision_id, currentPublishedRevisionId: manual.current_published_revision_id, updatedAt: manual.updated_at, draft, steps, canEdit: role === "owner" || role === "admin" || role === "editor" };
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async updateDraftWithSteps(actorId: string, workspaceId: string, manualId: string, title: string, description: string, steps: Array<ManualStepMutationInput & { id: string | null }>, expectedUpdatedAt: string, now: string): Promise<{ draftId: string; contentVersion: string; updatedAt: string }> {
    try {
      const current = await this.db.prepare(`SELECT m.current_draft_revision_id AS draft_id, r.content_version, r.updated_at
        FROM manuals m JOIN manual_revisions r ON r.id = m.current_draft_revision_id
        WHERE m.id = ?1 AND m.workspace_id = ?2 AND m.archived_at IS NULL AND r.state = 'draft' LIMIT 1`)
        .bind(manualId, workspaceId).first<{ draft_id: string | null; content_version: string; updated_at: string }>();
      if (!current?.draft_id) throw new D1RepositoryError("not_found");
      if (current.updated_at !== expectedUpdatedAt) throw new D1RepositoryError("conflict");
      const writeNow = new Date(Math.max(Date.parse(now), Date.parse(current.updated_at) + 1)).toISOString();
      const existingRows = await this.db.prepare("SELECT id FROM manual_steps WHERE revision_id = ?1 AND workspace_id = ?2 AND deleted_at IS NULL ORDER BY position ASC, id ASC").bind(current.draft_id, workspaceId).all<{ id: string }>();
      const existingIds = new Set(existingRows.results.map((row) => row.id));
      const seenIds = new Set<string>();
      const assetIds = new Set<string>();
      for (const step of steps) {
        if (step.id !== null) {
          if (!existingIds.has(step.id) || seenIds.has(step.id)) throw new D1RepositoryError("conflict");
          seenIds.add(step.id);
        }
        if (step.assetId) assetIds.add(step.assetId);
      }
      if (assetIds.size > 0) {
        const assetRows = await this.db.prepare(`SELECT DISTINCT a.id FROM assets a
          JOIN claim_assets ca ON ca.asset_id = a.id AND ca.status = 'completed'
          JOIN claim_intents ci ON ci.id = ca.claim_intent_id AND ci.status = 'completed' AND ci.manual_id = ?1
          WHERE a.workspace_id = ?2 AND a.kind = 'manual_image' AND a.id IN (SELECT value FROM json_each(?3))`)
          .bind(manualId, workspaceId, JSON.stringify(Array.from(assetIds))).all<{ id: string }>();
        if (new Set(assetRows.results.map((row) => row.id)).size !== assetIds.size) throw new D1RepositoryError("conflict");
      }
      const newIds = steps.map((step) => step.id ?? crypto.randomUUID());
      const deletedCount = existingRows.results.length - seenIds.size;
      const existingCount = seenIds.size;
      const newCount = steps.filter((step) => step.id === null).length;
      const newContentVersion = crypto.randomUUID().replaceAll("-", "").slice(0, 32);
      const stepsPayload = JSON.stringify(steps.map((step, index) => ({ ...step, id: newIds[index], position: index })));
      const statements = [
        this.db.prepare(`UPDATE manual_revisions SET title = ?1, description = ?2, content_version = ?3, updated_at = ?4
          WHERE id = ?5 AND workspace_id = ?6 AND state = 'draft' AND updated_at = ?7
            AND EXISTS (SELECT 1 FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
              WHERE wm.workspace_id = ?6 AND wm.application_id = ?8 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') AND i.status = 'active' AND w.status = 'active')
            AND EXISTS (SELECT 1 FROM manuals m WHERE m.id = ?9 AND m.workspace_id = ?6 AND m.current_draft_revision_id = ?5 AND m.archived_at IS NULL)`)
          .bind(title, description, newContentVersion, writeNow, current.draft_id, workspaceId, expectedUpdatedAt, actorId, manualId),
        this.db.prepare(`UPDATE manual_steps SET deleted_at = ?1, updated_at = ?1
          WHERE revision_id = ?2 AND workspace_id = ?3 AND deleted_at IS NULL
            AND id NOT IN (SELECT json_extract(item.value, '$.id') FROM json_each(?4) AS item)
            AND EXISTS (SELECT 1 FROM manual_revisions gr WHERE gr.id = ?5 AND gr.workspace_id = ?6 AND gr.state = 'draft' AND gr.updated_at = ?7 AND gr.content_version = ?8)`)
          .bind(writeNow, current.draft_id, workspaceId, stepsPayload, current.draft_id, workspaceId, writeNow, newContentVersion),
        this.db.prepare(`UPDATE manual_steps SET
            position = CAST((SELECT json_extract(item.value, '$.position') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id) AS INTEGER),
            type = (SELECT json_extract(item.value, '$.type') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id),
            title = (SELECT json_extract(item.value, '$.title') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id),
            instruction = (SELECT json_extract(item.value, '$.instruction') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id),
            action_type = (SELECT json_extract(item.value, '$.actionType') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id),
            target_text = (SELECT json_extract(item.value, '$.targetText') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id),
            url = (SELECT json_extract(item.value, '$.url') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id),
            asset_id = (SELECT json_extract(item.value, '$.assetId') FROM json_each(?1) AS item WHERE json_extract(item.value, '$.id') = manual_steps.id),
            deleted_at = ?2, updated_at = ?2
          WHERE revision_id = ?3 AND workspace_id = ?4
            AND id IN (SELECT json_extract(item.value, '$.id') FROM json_each(?1) AS item)
            AND EXISTS (SELECT 1 FROM manual_revisions gr WHERE gr.id = ?5 AND gr.workspace_id = ?6 AND gr.state = 'draft' AND gr.updated_at = ?7 AND gr.content_version = ?8)`)
          .bind(stepsPayload, writeNow, current.draft_id, workspaceId, current.draft_id, workspaceId, writeNow, newContentVersion),
        this.db.prepare(`INSERT INTO manual_steps (id, workspace_id, revision_id, position, type, title, instruction, action_type, target_text, url, asset_id, created_at, updated_at)
          SELECT json_extract(item.value, '$.id'), ?2, ?3, CAST(json_extract(item.value, '$.position') AS INTEGER),
            json_extract(item.value, '$.type'), json_extract(item.value, '$.title'), json_extract(item.value, '$.instruction'),
            json_extract(item.value, '$.actionType'), json_extract(item.value, '$.targetText'), json_extract(item.value, '$.url'),
            json_extract(item.value, '$.assetId'), ?4, ?4
          FROM json_each(?1) AS item
          WHERE NOT EXISTS (SELECT 1 FROM manual_steps old_step WHERE old_step.id = json_extract(item.value, '$.id'))
            AND EXISTS (SELECT 1 FROM manual_revisions gr WHERE gr.id = ?5 AND gr.workspace_id = ?6 AND gr.state = 'draft' AND gr.updated_at = ?7 AND gr.content_version = ?8)`)
          .bind(stepsPayload, workspaceId, current.draft_id, writeNow, current.draft_id, workspaceId, writeNow, newContentVersion),
        this.db.prepare(`UPDATE manual_steps SET deleted_at = NULL
          WHERE revision_id = ?1 AND workspace_id = ?2 AND id IN (SELECT json_extract(item.value, '$.id') FROM json_each(?3) AS item)
            AND EXISTS (SELECT 1 FROM manual_revisions gr WHERE gr.id = ?4 AND gr.workspace_id = ?5 AND gr.state = 'draft' AND gr.updated_at = ?6 AND gr.content_version = ?7)`)
          .bind(current.draft_id, workspaceId, stepsPayload, current.draft_id, workspaceId, writeNow, newContentVersion)
      ];
      let results: D1RunResult[];
      results = await this.db.batch(statements);
      if (results.length !== 5 || changed(results[0]) !== 1 || changed(results[1]) !== deletedCount || changed(results[2]) !== existingCount || changed(results[3]) !== newCount || changed(results[4]) !== steps.length) throw new D1RepositoryError("conflict");
      const updated = await this.db.prepare("SELECT content_version, updated_at FROM manual_revisions WHERE id = ?1 AND workspace_id = ?2 LIMIT 1").bind(current.draft_id, workspaceId).first<{ content_version: string; updated_at: string }>();
      if (!updated) throw new D1RepositoryError("unavailable");
      return { draftId: current.draft_id, contentVersion: updated.content_version, updatedAt: updated.updated_at };
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async finalizeClaim(actorId: string, intent: ClaimIntentRecord, fingerprint: string, title: string, description: string, steps: ClaimStepInput[], assets: Array<ClaimAssetInput & { id: string; objectKey: string; contentType: string; byteLength: number }>, now: string): Promise<{ status: "claimed"; manualId: string }> {
    const manualId = crypto.randomUUID();
    const revisionId = crypto.randomUUID();
    try {
      const stepRows = steps.map((step) => ({ ...step, id: crypto.randomUUID() }));
      const assetsPayload = JSON.stringify(assets);
      const statements = [
        this.db.prepare(`UPDATE claim_intents SET status = 'completed', request_fingerprint = ?1, manual_id = ?2, completed_at = ?3, updated_at = ?3
          WHERE id = ?4 AND actor_application_id = ?5 AND status = 'pending' AND expires_at > ?3
            AND EXISTS (SELECT 1 FROM identities i JOIN workspaces w ON w.id = claim_intents.workspace_id JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.application_id = ?5
              WHERE i.application_id = ?5 AND i.status = 'active' AND w.status = 'active' AND wm.status = 'active' AND wm.role = 'owner')`).bind(fingerprint, manualId, now, intent.id, actorId),
        this.db.prepare(`INSERT INTO manuals (id, workspace_id, title, status, current_draft_revision_id, created_by, created_at, updated_at) SELECT ?1, ?2, ?3, 'draft', ?4, ?5, ?6, ?6 WHERE EXISTS (SELECT 1 FROM claim_intents WHERE id = ?7 AND status = 'completed' AND manual_id = ?1)`).bind(manualId, intent.workspaceId, title, revisionId, actorId, now, intent.id),
        this.db.prepare(`INSERT INTO manual_revisions (id, workspace_id, manual_id, revision_no, state, title, description, content_version, created_at, updated_at) SELECT ?1, ?2, ?3, 1, 'draft', ?4, ?5, lower(hex(randomblob(16))), ?6, ?6 WHERE EXISTS (SELECT 1 FROM manuals WHERE id = ?3 AND current_draft_revision_id = ?1)`).bind(revisionId, intent.workspaceId, manualId, title, description, now),
        this.db.prepare(`INSERT INTO assets (id, workspace_id, bucket, object_key, kind, content_type, byte_length, checksum_sha256, created_at, updated_at)
          SELECT json_extract(item.value, '$.id'), ?1, 'MANUAL_ASSETS', json_extract(item.value, '$.objectKey'), 'manual_image', json_extract(item.value, '$.contentType'), CAST(json_extract(item.value, '$.byteLength') AS INTEGER), json_extract(item.value, '$.sha256'), ?2, ?2
          FROM json_each(?3) AS item WHERE EXISTS (SELECT 1 FROM manuals WHERE id = ?4 AND workspace_id = ?1)`)
          .bind(intent.workspaceId, now, assetsPayload, manualId),
        this.db.prepare(`UPDATE claim_assets SET status = 'completed', asset_id = (SELECT json_extract(item.value, '$.id') FROM json_each(?1) AS item WHERE CAST(json_extract(item.value, '$.assetSlot') AS INTEGER) = claim_assets.asset_slot), updated_at = ?2
          WHERE claim_intent_id = ?3 AND status = 'staged'
            AND EXISTS (SELECT 1 FROM json_each(?1) AS item WHERE CAST(json_extract(item.value, '$.assetSlot') AS INTEGER) = claim_assets.asset_slot AND json_extract(item.value, '$.sha256') = claim_assets.sha256)
            AND EXISTS (SELECT 1 FROM claim_intents ci WHERE ci.id = ?3 AND ci.status = 'completed' AND ci.manual_id = ?4)
            AND EXISTS (SELECT 1 FROM manuals m WHERE m.id = ?4 AND m.workspace_id = ?5 AND m.current_draft_revision_id = ?6)`)
          .bind(assetsPayload, now, intent.id, manualId, intent.workspaceId, revisionId),
        this.db.prepare(`INSERT INTO manual_steps (id, workspace_id, revision_id, position, type, title, instruction, action_type, target_text, url, asset_id, created_at, updated_at)
          SELECT json_extract(item.value, '$.id'), ?1, ?2, CAST(json_extract(item.value, '$.position') AS INTEGER), json_extract(item.value, '$.type'), json_extract(item.value, '$.title'), json_extract(item.value, '$.instruction'), json_extract(item.value, '$.actionType'), json_extract(item.value, '$.targetText'), json_extract(item.value, '$.url'), json_extract(item.value, '$.assetId'), ?3, ?3
          FROM json_each(?4) AS item WHERE EXISTS (SELECT 1 FROM manual_revisions WHERE id = ?2 AND workspace_id = ?1 AND state = 'draft')`)
          .bind(intent.workspaceId, revisionId, now, JSON.stringify(stepRows.map((step, index) => ({ ...step, position: index }))))
      ];
      const results = await this.db.batch(statements);
      const expectedChanges = [1, 1, 1, assets.length, assets.length, steps.length];
      if (results.length === expectedChanges.length && results.every((result, index) => changed(result) === expectedChanges[index])) return { status: "claimed", manualId };
      const current = await this.getClaimIntent(actorId, intent.id);
      if (current?.status === "completed" && current.requestFingerprint === fingerprint && current.manualId) return { status: "claimed", manualId: current.manualId };
      throw new D1RepositoryError("conflict");
    } catch (error) {
      throw repositoryError(error);
    }
  }

  async getAssetForRead(actorId: string, workspaceId: string, assetId: string): Promise<{ objectKey: string; contentType: string } | null> {
    try {
      return await this.db.prepare(`SELECT a.object_key AS objectKey, a.content_type AS contentType FROM assets a JOIN workspace_members wm ON wm.workspace_id = a.workspace_id JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id WHERE a.id = ?1 AND a.workspace_id = ?2 AND wm.application_id = ?3 AND wm.status = 'active' AND wm.role IN ${ACTIVE_ROLES} AND i.status = 'active' AND w.status = 'active' LIMIT 1`).bind(assetId, workspaceId, actorId).first<{ objectKey: string; contentType: string }>();
    } catch (error) {
      throw repositoryError(error);
    }
  }
}
