import { D1RepositoryError, ensureRepositoryError } from "./d1-errors.ts";
import { changed, type D1DatabaseLike } from "./d1-types.ts";
export interface BrandingRecord { versionId: string | null; themeColor: string; foregroundColor: string; logoId: string | null }
export interface BrandLogoRecord { id: string; workspaceId: string; actorId: string; operationId: string; objectKey: string; contentType: string; byteLength: number; width: number; height: number; sha256: string; status: "reserved" | "ready"; sourceClaimId: string | null }
const logoColumns = `id, workspace_id AS workspaceId, actor_application_id AS actorId, operation_id AS operationId, object_key AS objectKey, content_type AS contentType, byte_length AS byteLength, width, height, sha256, status, source_claim_id AS sourceClaimId`;
export const DEFAULT_BRANDING: BrandingRecord = { versionId: null, themeColor: "#087f7a", foregroundColor: "#ffffff", logoId: null };
export function brandingForeground(themeColor: string): string {
  const channels = [1, 3, 5].map((offset) => parseInt(themeColor.slice(offset, offset + 2), 16) / 255).map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  const luminance = channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? "#000000" : "#ffffff";
}
export class ManualBrandingRepository {
  private readonly db: D1DatabaseLike;
  constructor(db: D1DatabaseLike) { this.db = db; }
  async read(workspaceId: string, versionId?: string | null): Promise<BrandingRecord> {
    if (versionId === null) return { ...DEFAULT_BRANDING };
    const row = await this.db.prepare(`SELECT b.id AS versionId, b.theme_color AS themeColor, b.foreground_color AS foregroundColor, b.logo_id AS logoId
      FROM workspace_branding_versions b WHERE b.workspace_id = ?1 AND b.id = ${versionId === undefined ? "(SELECT version_id FROM workspace_branding WHERE workspace_id = ?1)" : "?2"} LIMIT 1`)
      .bind(...(versionId === undefined ? [workspaceId] : [workspaceId, versionId])).first<BrandingRecord>();
    if (versionId && !row) throw new D1RepositoryError("unavailable");
    return row ?? { ...DEFAULT_BRANDING };
  }
  async update(actorId: string, workspaceId: string, expectedVersionId: string | null, themeColor: string, logoId: string | null, now: string): Promise<BrandingRecord> {
    const id = crypto.randomUUID(); const foregroundColor = brandingForeground(themeColor);
    try {
      const result = await this.db.batch([
        this.db.prepare(`INSERT INTO workspace_branding_versions (id, workspace_id, theme_color, foreground_color, logo_id, created_by, created_at)
          SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7
          WHERE (SELECT version_id FROM workspace_branding WHERE workspace_id = ?2) IS ?8`)
          .bind(id, workspaceId, themeColor, foregroundColor, logoId, actorId, now, expectedVersionId),
        this.db.prepare(`INSERT INTO workspace_branding (workspace_id, version_id)
          SELECT ?1, ?2 WHERE EXISTS (SELECT 1 FROM workspace_branding_versions WHERE id = ?2 AND workspace_id = ?1)
          ON CONFLICT(workspace_id) DO UPDATE SET version_id = excluded.version_id WHERE workspace_branding.version_id IS ?3`)
          .bind(workspaceId, id, expectedVersionId)
      ]);
      if (changed(result[0]) !== 1 || changed(result[1]) !== 1) throw new D1RepositoryError("conflict");
      return { versionId: id, themeColor, foregroundColor, logoId };
    } catch (error) { throw ensureRepositoryError(error); }
  }
  async hasClaimSnapshot(workspaceId: string, claimId: string): Promise<boolean> {
    return Boolean(await this.db.prepare("SELECT id FROM workspace_branding_versions WHERE workspace_id = ?1 AND source_claim_id = ?2").bind(workspaceId, claimId).first());
  }
  async claimSnapshot(actorId: string, workspaceId: string, claimId: string, themeColor: string, logoId: string | null, now: string): Promise<string> {
    const lookup = () => this.db.prepare(`SELECT id, theme_color AS themeColor, logo_id AS logoId FROM workspace_branding_versions
      WHERE workspace_id = ?1 AND source_claim_id = ?2 AND created_by = ?3`).bind(workspaceId, claimId, actorId).first<{ id: string; themeColor: string; logoId: string | null }>();
    const verify = (row: { id: string; themeColor: string; logoId: string | null }) => {
      if (row.themeColor !== themeColor || row.logoId !== logoId) throw new D1RepositoryError("conflict");
      return row.id;
    };
    const previous = await lookup();
    if (previous) return verify(previous);
    try {
      const id = crypto.randomUUID();
      await this.db.prepare(`INSERT INTO workspace_branding_versions (id, workspace_id, theme_color, foreground_color, logo_id, created_by, created_at, source_claim_id)
        VALUES (?1,?2,?3,?4,?5,?6,?7,?8)`).bind(id, workspaceId, themeColor, brandingForeground(themeColor), logoId, actorId, now, claimId).run();
      return id;
    } catch (error) {
      const raced = await lookup();
      if (raced) return verify(raced);
      throw ensureRepositoryError(error);
    }
  }
  async logo(workspaceId: string, id: string): Promise<BrandLogoRecord | null> {
    return this.db.prepare(`SELECT ${logoColumns} FROM workspace_brand_logos WHERE workspace_id = ?1 AND id = ?2 AND status = 'ready'`).bind(workspaceId, id).first<BrandLogoRecord>();
  }
  async uploadedLogo(actorId: string, workspaceId: string, operationId: string): Promise<BrandLogoRecord | null> {
    return this.db.prepare(`SELECT ${logoColumns} FROM workspace_brand_logos WHERE actor_application_id = ?1 AND workspace_id = ?2 AND operation_id = ?3`).bind(actorId, workspaceId, operationId).first<BrandLogoRecord>();
  }
  async reserveLogo(record: Omit<BrandLogoRecord, "status">, now: string): Promise<BrandLogoRecord> {
    const previous = await this.uploadedLogo(record.actorId, record.workspaceId, record.operationId);
    if (previous) return previous;
    try {
      await this.db.prepare(`INSERT INTO workspace_brand_logos (id, workspace_id, actor_application_id, operation_id, object_key, content_type, byte_length, width, height, sha256, status, created_at, source_claim_id) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,'reserved',?11,?12)`)
        .bind(record.id, record.workspaceId, record.actorId, record.operationId, record.objectKey, record.contentType, record.byteLength, record.width, record.height, record.sha256, now, record.sourceClaimId).run();
      return { ...record, status: "reserved" };
    } catch (error) {
      const raced = await this.uploadedLogo(record.actorId, record.workspaceId, record.operationId);
      if (raced) return raced;
      throw ensureRepositoryError(error);
    }
  }
  async readyLogo(actorId: string, workspaceId: string, id: string): Promise<void> {
    const result = await this.db.prepare(`UPDATE workspace_brand_logos SET status = 'ready' WHERE id = ?1 AND workspace_id = ?2 AND actor_application_id = ?3
      AND EXISTS (SELECT 1 FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
        WHERE wm.workspace_id = ?2 AND wm.application_id = ?3 AND wm.status = 'active' AND ((workspace_brand_logos.source_claim_id IS NULL AND wm.role IN ('owner','admin')) OR (wm.role IN ('owner','admin','editor') AND EXISTS (SELECT 1 FROM claim_intents ci WHERE ci.id = workspace_brand_logos.source_claim_id AND ci.actor_application_id = ?3 AND ci.workspace_id = ?2 AND ci.status = 'pending' AND ci.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')))) AND i.status = 'active' AND w.status = 'active')`).bind(id, workspaceId, actorId).run();
    if (changed(result) !== 1) throw new D1RepositoryError("forbidden");
  }
}
