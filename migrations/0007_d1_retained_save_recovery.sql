PRAGMA foreign_keys = ON;

-- Remember committed attachment provenance after the mutable draft replaces an
-- image. Upload readiness alone must not authorize a stale, never-used image.
ALTER TABLE manual_edit_assets ADD COLUMN first_attached_at TEXT;
UPDATE manual_edit_assets SET first_attached_at = (
  SELECT MIN(s.created_at) FROM manual_steps s
  JOIN manual_revisions r ON r.id = s.revision_id AND r.workspace_id = s.workspace_id
  WHERE s.asset_id = manual_edit_assets.id AND s.workspace_id = manual_edit_assets.workspace_id
    AND r.manual_id = manual_edit_assets.manual_id
)
WHERE status = 'ready';

CREATE TRIGGER manual_edit_asset_attachment_insert BEFORE INSERT ON manual_edit_assets
WHEN NEW.first_attached_at IS NOT NULL
BEGIN SELECT RAISE(ABORT, 'edited asset attachment requires saved step'); END;
CREATE TRIGGER manual_edit_asset_attachment_update BEFORE UPDATE OF first_attached_at ON manual_edit_assets
WHEN NEW.first_attached_at IS NOT OLD.first_attached_at AND (
  OLD.first_attached_at IS NOT NULL OR NEW.first_attached_at IS NULL OR NEW.status <> 'ready'
  OR NOT EXISTS (SELECT 1 FROM manual_steps s
    JOIN manual_revisions r ON r.id = s.revision_id AND r.workspace_id = s.workspace_id
    WHERE s.asset_id = NEW.id AND s.workspace_id = NEW.workspace_id AND r.manual_id = NEW.manual_id)
)
BEGIN SELECT RAISE(ABORT, 'edited asset attachment provenance is immutable'); END;

CREATE TRIGGER manual_step_record_attachment_insert AFTER INSERT ON manual_steps
WHEN NEW.asset_id IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  UPDATE manual_edit_assets SET first_attached_at = NEW.updated_at
  WHERE id = NEW.asset_id AND workspace_id = NEW.workspace_id AND status = 'ready' AND first_attached_at IS NULL
    AND manual_id = (SELECT manual_id FROM manual_revisions WHERE id = NEW.revision_id AND workspace_id = NEW.workspace_id);
END;
CREATE TRIGGER manual_step_record_attachment_update AFTER UPDATE OF asset_id, workspace_id, revision_id, deleted_at ON manual_steps
WHEN NEW.asset_id IS NOT NULL AND NEW.deleted_at IS NULL
BEGIN
  UPDATE manual_edit_assets SET first_attached_at = NEW.updated_at
  WHERE id = NEW.asset_id AND workspace_id = NEW.workspace_id AND status = 'ready' AND first_attached_at IS NULL
    AND manual_id = (SELECT manual_id FROM manual_revisions WHERE id = NEW.revision_id AND workspace_id = NEW.workspace_id);
END;

-- Expiry is a terminal server decision, not a client-clock observation. Prevent
-- delayed finalization or direct SQL from resurrecting a released operation.
CREATE TRIGGER claim_expired_terminal BEFORE UPDATE OF status ON claim_intents
WHEN OLD.status = 'expired' AND NEW.status <> 'expired'
BEGIN SELECT RAISE(ABORT, 'expired claim is terminal'); END;
