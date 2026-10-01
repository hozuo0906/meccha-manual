import { D1RepositoryError, ensureRepositoryError } from "./d1-errors.ts";
import { changed, type D1DatabaseLike } from "./d1-types.ts";

export interface EditorAssetRecord {
  id: string; workspaceId: string; manualId: string; revisionId: string; actorId: string; operationId: string;
  expectedUpdatedAt: string; objectKey: string; contentType: string; byteLength: number; width: number; height: number; sha256: string;
  status: "reserved" | "ready";
}
const columns = `id, workspace_id AS workspaceId, manual_id AS manualId, revision_id AS revisionId,
 actor_application_id AS actorId, operation_id AS operationId, expected_updated_at AS expectedUpdatedAt,
 object_key AS objectKey, content_type AS contentType, byte_length AS byteLength, width, height, sha256, status`;
export class ManualEditorAssetsRepository {
  private readonly db: D1DatabaseLike;
  constructor(db: D1DatabaseLike) { this.db = db; }
  async get(actorId: string, workspaceId: string, manualId: string, operationId: string): Promise<EditorAssetRecord | null> {
    return this.db.prepare(`SELECT ${columns} FROM manual_edit_assets WHERE actor_application_id = ?1 AND workspace_id = ?2 AND manual_id = ?3 AND operation_id = ?4`)
      .bind(actorId, workspaceId, manualId, operationId).first<EditorAssetRecord>();
  }
  async reserve(record: Omit<EditorAssetRecord, "status">, now: string): Promise<EditorAssetRecord> {
    const previous = await this.get(record.actorId, record.workspaceId, record.manualId, record.operationId);
    if (previous) return previous;
    try {
      // The insert trigger repeats actor, tenant, current draft and exact version checks.
      await this.db.prepare(`INSERT INTO manual_edit_assets (id, workspace_id, manual_id, revision_id, actor_application_id, operation_id, expected_updated_at, object_key, content_type, byte_length, width, height, sha256, status, created_at)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,'reserved',?14)`)
        .bind(record.id, record.workspaceId, record.manualId, record.revisionId, record.actorId, record.operationId, record.expectedUpdatedAt, record.objectKey, record.contentType, record.byteLength, record.width, record.height, record.sha256, now).run();
      return { ...record, status: "reserved" };
    } catch (error) {
      const raced = await this.get(record.actorId, record.workspaceId, record.manualId, record.operationId);
      if (raced) return raced;
      throw ensureRepositoryError(error);
    }
  }
  async ready(record: EditorAssetRecord, now: string): Promise<void> {
    try {
      const results = await this.db.batch([
        this.db.prepare(`INSERT INTO assets (id, workspace_id, bucket, object_key, kind, content_type, byte_length, checksum_sha256, created_at, updated_at)
          SELECT ea.id, ea.workspace_id, 'MANUAL_ASSETS', ea.object_key, 'manual_image', ea.content_type, ea.byte_length, ea.sha256, ?1, ?1
          FROM manual_edit_assets ea JOIN workspace_members wm ON wm.workspace_id = ea.workspace_id AND wm.application_id = ea.actor_application_id
          JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
          WHERE ea.id = ?2 AND ea.actor_application_id = ?3 AND ea.workspace_id = ?4 AND ea.status = 'reserved'
            AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') AND i.status = 'active' AND w.status = 'active'
          ON CONFLICT(id) DO NOTHING`).bind(now, record.id, record.actorId, record.workspaceId),
        this.db.prepare(`UPDATE manual_edit_assets SET status = 'ready' WHERE id = ?1 AND workspace_id = ?2 AND actor_application_id = ?3
          AND EXISTS (SELECT 1 FROM assets a WHERE a.id = ?1 AND a.workspace_id = ?2 AND a.object_key = manual_edit_assets.object_key AND a.checksum_sha256 = manual_edit_assets.sha256)
          AND EXISTS (SELECT 1 FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
            WHERE wm.workspace_id = ?2 AND wm.application_id = ?3 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') AND i.status = 'active' AND w.status = 'active')`)
          .bind(record.id, record.workspaceId, record.actorId)
      ]);
      if (changed(results[1]) !== 1) throw new D1RepositoryError("forbidden");
    } catch (error) { throw ensureRepositoryError(error); }
  }
}
