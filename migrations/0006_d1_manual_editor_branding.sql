PRAGMA foreign_keys = ON;

-- A follow-up local save targets the original draft; it never creates a second manual.
ALTER TABLE claim_intents ADD COLUMN target_manual_id TEXT REFERENCES manuals(id);
ALTER TABLE claim_intents ADD COLUMN target_revision_id TEXT REFERENCES manual_revisions(id);
ALTER TABLE claim_intents ADD COLUMN expected_updated_at TEXT;
ALTER TABLE claim_intents ADD COLUMN completed_revision_id TEXT;
ALTER TABLE claim_intents ADD COLUMN completed_updated_at TEXT;
ALTER TABLE claim_intents ADD COLUMN completed_content_version TEXT;
DROP TRIGGER claim_intents_workspace_scope_insert;
CREATE TRIGGER claim_intents_workspace_scope_insert
BEFORE INSERT ON claim_intents
WHEN NOT EXISTS (
  SELECT 1 FROM identities i JOIN workspaces w ON w.id = NEW.workspace_id
  JOIN workspace_members m ON m.workspace_id = w.id AND m.application_id = NEW.actor_application_id
  WHERE i.application_id = NEW.actor_application_id AND i.status = 'active' AND w.status = 'active' AND m.status = 'active'
    AND ((NEW.target_manual_id IS NULL AND NEW.target_revision_id IS NULL AND NEW.expected_updated_at IS NULL
          AND w.created_by = NEW.actor_application_id AND w.workspace_kind = 'personal' AND m.role = 'owner')
      OR (m.role IN ('owner','admin','editor') AND EXISTS (
        SELECT 1 FROM manuals x JOIN manual_revisions r ON r.id = x.current_draft_revision_id
        WHERE x.id = NEW.target_manual_id AND x.workspace_id = NEW.workspace_id AND x.archived_at IS NULL
          AND r.id = NEW.target_revision_id AND r.workspace_id = NEW.workspace_id AND r.manual_id = x.id
          AND r.state = 'draft' AND r.updated_at = NEW.expected_updated_at)))
)
BEGIN SELECT RAISE(ABORT, 'claim intent requires active authorized workspace draft'); END;
CREATE TRIGGER claim_target_identity_immutable
BEFORE UPDATE OF actor_application_id, workspace_id, operation_id, target_manual_id, target_revision_id, expected_updated_at ON claim_intents
WHEN NEW.actor_application_id IS NOT OLD.actor_application_id OR NEW.workspace_id IS NOT OLD.workspace_id
 OR NEW.operation_id IS NOT OLD.operation_id OR NEW.target_manual_id IS NOT OLD.target_manual_id
 OR NEW.target_revision_id IS NOT OLD.target_revision_id OR NEW.expected_updated_at IS NOT OLD.expected_updated_at
BEGIN SELECT RAISE(ABORT, 'claim target is immutable'); END;

CREATE TABLE manual_edit_assets (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  manual_id TEXT NOT NULL REFERENCES manuals(id),
  revision_id TEXT NOT NULL REFERENCES manual_revisions(id),
  actor_application_id TEXT NOT NULL REFERENCES identities(application_id),
  operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 16 AND 128 AND operation_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  expected_updated_at TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
  byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 10485760),
  width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 16384),
  height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 16384 AND width * height <= 40000000),
  sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK(status IN ('reserved','ready')),
  created_at TEXT NOT NULL,
  UNIQUE(actor_application_id, workspace_id, manual_id, operation_id)
);
CREATE INDEX manual_edit_assets_manual_idx ON manual_edit_assets(workspace_id, manual_id, revision_id);
CREATE TRIGGER manual_edit_asset_scope_insert BEFORE INSERT ON manual_edit_assets
WHEN NOT EXISTS (
 SELECT 1 FROM manuals m JOIN manual_revisions r ON r.id = m.current_draft_revision_id
 JOIN workspace_members wm ON wm.workspace_id = m.workspace_id AND wm.application_id = NEW.actor_application_id
 JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = m.workspace_id
 WHERE m.id = NEW.manual_id AND m.workspace_id = NEW.workspace_id AND m.archived_at IS NULL
 AND r.id = NEW.revision_id AND r.manual_id = m.id AND r.workspace_id = m.workspace_id AND r.state = 'draft' AND r.updated_at = NEW.expected_updated_at
 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') AND i.status = 'active' AND w.status = 'active'
) BEGIN SELECT RAISE(ABORT, 'edited asset scope mismatch'); END;
CREATE TRIGGER manual_edit_asset_identity_immutable BEFORE UPDATE ON manual_edit_assets
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.manual_id IS NOT OLD.manual_id
 OR NEW.revision_id IS NOT OLD.revision_id OR NEW.actor_application_id IS NOT OLD.actor_application_id OR NEW.operation_id IS NOT OLD.operation_id
 OR NEW.expected_updated_at IS NOT OLD.expected_updated_at OR NEW.object_key IS NOT OLD.object_key OR NEW.content_type IS NOT OLD.content_type
 OR NEW.byte_length IS NOT OLD.byte_length OR NEW.width IS NOT OLD.width OR NEW.height IS NOT OLD.height OR NEW.sha256 IS NOT OLD.sha256
 OR NEW.created_at IS NOT OLD.created_at OR (OLD.status = 'ready' AND NEW.status <> 'ready')
BEGIN SELECT RAISE(ABORT, 'edited asset identity is immutable'); END;

DROP TRIGGER manual_step_asset_scope_insert;
DROP TRIGGER manual_step_asset_scope_update;
CREATE TRIGGER manual_step_asset_scope_insert BEFORE INSERT ON manual_steps
WHEN NEW.asset_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM assets a JOIN manual_revisions r ON r.id = NEW.revision_id AND r.workspace_id = NEW.workspace_id
 WHERE a.id = NEW.asset_id AND a.workspace_id = NEW.workspace_id AND a.kind = 'manual_image'
 AND (EXISTS (SELECT 1 FROM claim_assets ca JOIN claim_intents ci ON ci.id = ca.claim_intent_id
   WHERE ca.asset_id = a.id AND ca.status = 'completed' AND ci.status = 'completed' AND ci.manual_id = r.manual_id AND ci.workspace_id = NEW.workspace_id)
 OR EXISTS (SELECT 1 FROM manual_edit_assets ea WHERE ea.id = a.id AND ea.workspace_id = NEW.workspace_id AND ea.manual_id = r.manual_id AND ea.status = 'ready'))
) BEGIN SELECT RAISE(ABORT, 'manual step asset manual mismatch'); END;
CREATE TRIGGER manual_step_asset_scope_update BEFORE UPDATE OF asset_id, workspace_id, revision_id ON manual_steps
WHEN NEW.asset_id IS NOT NULL AND NOT EXISTS (
 SELECT 1 FROM assets a JOIN manual_revisions r ON r.id = NEW.revision_id AND r.workspace_id = NEW.workspace_id
 WHERE a.id = NEW.asset_id AND a.workspace_id = NEW.workspace_id AND a.kind = 'manual_image'
 AND (EXISTS (SELECT 1 FROM claim_assets ca JOIN claim_intents ci ON ci.id = ca.claim_intent_id
   WHERE ca.asset_id = a.id AND ca.status = 'completed' AND ci.status = 'completed' AND ci.manual_id = r.manual_id AND ci.workspace_id = NEW.workspace_id)
 OR EXISTS (SELECT 1 FROM manual_edit_assets ea WHERE ea.id = a.id AND ea.workspace_id = NEW.workspace_id AND ea.manual_id = r.manual_id AND ea.status = 'ready'))
) BEGIN SELECT RAISE(ABORT, 'manual step asset manual mismatch'); END;

-- Logos are separate private objects, never masquerading as manual_image assets.
CREATE TABLE workspace_brand_logos (
 id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 actor_application_id TEXT NOT NULL REFERENCES identities(application_id),
 operation_id TEXT NOT NULL CHECK(length(operation_id) BETWEEN 16 AND 128 AND operation_id NOT GLOB '*[^A-Za-z0-9_-]*'),
 object_key TEXT NOT NULL UNIQUE, content_type TEXT NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
 byte_length INTEGER NOT NULL CHECK(byte_length BETWEEN 1 AND 1048576),
 width INTEGER NOT NULL CHECK(width BETWEEN 1 AND 4096), height INTEGER NOT NULL CHECK(height BETWEEN 1 AND 4096 AND width * height <= 4000000),
 sha256 TEXT NOT NULL CHECK(length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
 status TEXT NOT NULL CHECK(status IN ('reserved','ready')), created_at TEXT NOT NULL,
 source_claim_id TEXT UNIQUE REFERENCES claim_intents(id),
 UNIQUE(workspace_id, actor_application_id, operation_id), UNIQUE(id, workspace_id)
);
CREATE TABLE workspace_branding_versions (
 id TEXT PRIMARY KEY NOT NULL, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 theme_color TEXT NOT NULL CHECK(length(theme_color) = 7 AND substr(theme_color,1,1) = '#' AND substr(theme_color,2) NOT GLOB '*[^0-9a-fA-F]*'),
 foreground_color TEXT NOT NULL CHECK(foreground_color IN ('#000000','#ffffff')),
 logo_id TEXT, created_by TEXT NOT NULL REFERENCES identities(application_id), created_at TEXT NOT NULL,
 source_claim_id TEXT UNIQUE REFERENCES claim_intents(id),
 FOREIGN KEY (logo_id, workspace_id) REFERENCES workspace_brand_logos(id, workspace_id), UNIQUE(id,workspace_id)
);
CREATE TABLE workspace_branding (
 workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id),
 version_id TEXT NOT NULL, FOREIGN KEY(version_id,workspace_id) REFERENCES workspace_branding_versions(id,workspace_id)
);
CREATE TRIGGER workspace_brand_logo_scope BEFORE INSERT ON workspace_brand_logos
WHEN NEW.status <> 'reserved' OR NOT EXISTS (SELECT 1 FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
 WHERE wm.application_id = NEW.actor_application_id AND wm.workspace_id = NEW.workspace_id AND wm.status = 'active' AND i.status = 'active' AND w.status = 'active'
 AND ((NEW.source_claim_id IS NULL AND wm.role IN ('owner','admin')) OR (NEW.source_claim_id IS NOT NULL AND wm.role IN ('owner','admin','editor') AND EXISTS (SELECT 1 FROM claim_intents ci WHERE ci.id = NEW.source_claim_id AND ci.workspace_id = NEW.workspace_id
 AND ci.actor_application_id = NEW.actor_application_id AND ci.status = 'pending' AND ci.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND (ci.target_manual_id IS NULL OR EXISTS (SELECT 1 FROM manuals m JOIN manual_revisions r ON r.id = m.current_draft_revision_id
   WHERE m.id = ci.target_manual_id AND m.workspace_id = ci.workspace_id AND m.archived_at IS NULL
     AND r.id = ci.target_revision_id AND r.state = 'draft' AND r.updated_at = ci.expected_updated_at))))))
BEGIN SELECT RAISE(ABORT, 'branding requires active administrator or claim writer'); END;
CREATE TRIGGER workspace_brand_logo_immutable BEFORE UPDATE ON workspace_brand_logos
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.actor_application_id IS NOT OLD.actor_application_id
 OR NEW.operation_id IS NOT OLD.operation_id OR NEW.object_key IS NOT OLD.object_key OR NEW.content_type IS NOT OLD.content_type
 OR NEW.byte_length IS NOT OLD.byte_length OR NEW.width IS NOT OLD.width OR NEW.height IS NOT OLD.height OR NEW.sha256 IS NOT OLD.sha256
 OR NEW.created_at IS NOT OLD.created_at OR NEW.source_claim_id IS NOT OLD.source_claim_id OR (OLD.status = 'ready' AND NEW.status <> 'ready')
BEGIN SELECT RAISE(ABORT, 'brand logo identity is immutable'); END;
CREATE TRIGGER workspace_brand_version_scope BEFORE INSERT ON workspace_branding_versions
WHEN NOT EXISTS (SELECT 1 FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id
 WHERE wm.application_id = NEW.created_by AND wm.workspace_id = NEW.workspace_id AND wm.status = 'active' AND i.status = 'active' AND w.status = 'active'
 AND ((NEW.source_claim_id IS NULL AND wm.role IN ('owner','admin')) OR (NEW.source_claim_id IS NOT NULL AND wm.role IN ('owner','admin','editor') AND EXISTS (SELECT 1 FROM claim_intents ci WHERE ci.id = NEW.source_claim_id AND ci.workspace_id = NEW.workspace_id
 AND ci.actor_application_id = NEW.created_by AND ci.status = 'pending' AND ci.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ','now')
 AND (ci.target_manual_id IS NULL OR EXISTS (SELECT 1 FROM manuals m JOIN manual_revisions r ON r.id = m.current_draft_revision_id
   WHERE m.id = ci.target_manual_id AND m.workspace_id = ci.workspace_id AND m.archived_at IS NULL
     AND r.id = ci.target_revision_id AND r.state = 'draft' AND r.updated_at = ci.expected_updated_at))))))
 OR (NEW.logo_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspace_brand_logos l WHERE l.id = NEW.logo_id AND l.workspace_id = NEW.workspace_id AND l.status = 'ready' AND l.source_claim_id IS NEW.source_claim_id))
BEGIN SELECT RAISE(ABORT, 'brand version scope mismatch'); END;
CREATE TRIGGER workspace_brand_pointer_scope_insert BEFORE INSERT ON workspace_branding
WHEN NOT EXISTS (SELECT 1 FROM workspace_branding_versions b WHERE b.id = NEW.version_id AND b.workspace_id = NEW.workspace_id AND b.source_claim_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'workspace branding scope mismatch'); END;
CREATE TRIGGER workspace_brand_pointer_scope_update BEFORE UPDATE ON workspace_branding
WHEN NEW.workspace_id IS NOT OLD.workspace_id OR NOT EXISTS (SELECT 1 FROM workspace_branding_versions b WHERE b.id = NEW.version_id AND b.workspace_id = NEW.workspace_id AND b.source_claim_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'workspace branding scope mismatch'); END;
CREATE TRIGGER workspace_brand_version_immutable BEFORE UPDATE ON workspace_branding_versions
BEGIN SELECT RAISE(ABORT, 'brand version is immutable'); END;
ALTER TABLE manual_revisions ADD COLUMN branding_version_id TEXT REFERENCES workspace_branding_versions(id);
CREATE TRIGGER manual_revision_brand_scope_insert BEFORE INSERT ON manual_revisions
WHEN NEW.branding_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspace_branding_versions b WHERE b.id = NEW.branding_version_id AND b.workspace_id = NEW.workspace_id AND (b.source_claim_id IS NULL OR EXISTS (SELECT 1 FROM claim_intents ci WHERE ci.id = b.source_claim_id AND ci.workspace_id = NEW.workspace_id AND (ci.manual_id = NEW.manual_id OR ci.target_manual_id = NEW.manual_id))))
BEGIN SELECT RAISE(ABORT, 'manual branding scope mismatch'); END;
CREATE TRIGGER manual_revision_brand_scope_update BEFORE UPDATE OF branding_version_id ON manual_revisions
WHEN OLD.state <> 'draft' OR (NEW.branding_version_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM workspace_branding_versions b WHERE b.id = NEW.branding_version_id AND b.workspace_id = NEW.workspace_id AND (b.source_claim_id IS NULL OR EXISTS (SELECT 1 FROM claim_intents ci WHERE ci.id = b.source_claim_id AND ci.workspace_id = NEW.workspace_id AND (ci.manual_id = NEW.manual_id OR ci.target_manual_id = NEW.manual_id)))))
BEGIN SELECT RAISE(ABORT, 'manual branding scope mismatch'); END;
CREATE TRIGGER claim_completed_receipt_immutable BEFORE UPDATE ON claim_intents
WHEN OLD.status = 'completed' AND (NEW.status <> 'completed' OR NEW.manual_id IS NOT OLD.manual_id
 OR NEW.request_fingerprint IS NOT OLD.request_fingerprint OR NEW.completed_revision_id IS NOT OLD.completed_revision_id
 OR NEW.completed_updated_at IS NOT OLD.completed_updated_at OR NEW.completed_content_version IS NOT OLD.completed_content_version)
BEGIN SELECT RAISE(ABORT, 'completed claim receipt is immutable'); END;
CREATE TRIGGER manual_edit_asset_total_limit BEFORE INSERT ON manual_edit_assets
WHEN (SELECT COALESCE(SUM(byte_length),0) FROM manual_edit_assets WHERE workspace_id = NEW.workspace_id AND manual_id = NEW.manual_id
 AND revision_id = NEW.revision_id AND expected_updated_at = NEW.expected_updated_at) + NEW.byte_length > 104857600
BEGIN SELECT RAISE(ABORT, 'edited asset total limit'); END;
CREATE TRIGGER workspace_brand_version_delete_forbidden BEFORE DELETE ON workspace_branding_versions
BEGIN SELECT RAISE(ABORT, 'brand version is immutable'); END;
CREATE TRIGGER manual_edit_asset_reserve_only BEFORE INSERT ON manual_edit_assets
WHEN NEW.status <> 'reserved' OR EXISTS (SELECT 1 FROM assets a WHERE a.id = NEW.id)
BEGIN SELECT RAISE(ABORT, 'edited asset must reserve a new identity'); END;
CREATE TRIGGER manual_edit_asset_ready_scope BEFORE UPDATE OF status ON manual_edit_assets
WHEN NEW.status = 'ready' AND NOT EXISTS (
 SELECT 1 FROM assets a WHERE a.id = NEW.id AND a.workspace_id = NEW.workspace_id AND a.bucket = 'MANUAL_ASSETS'
 AND a.kind = 'manual_image' AND a.object_key = NEW.object_key AND a.content_type = NEW.content_type
 AND a.byte_length = NEW.byte_length AND a.checksum_sha256 = NEW.sha256
)
BEGIN SELECT RAISE(ABORT, 'edited asset ready identity mismatch'); END;
CREATE TRIGGER manual_asset_identity_immutable BEFORE UPDATE OF id, workspace_id, bucket, object_key, kind, content_type, byte_length, checksum_sha256 ON assets
WHEN NEW.id IS NOT OLD.id OR NEW.workspace_id IS NOT OLD.workspace_id OR NEW.bucket IS NOT OLD.bucket
 OR NEW.object_key IS NOT OLD.object_key OR NEW.kind IS NOT OLD.kind OR NEW.content_type IS NOT OLD.content_type
 OR NEW.byte_length IS NOT OLD.byte_length OR NEW.checksum_sha256 IS NOT OLD.checksum_sha256
BEGIN SELECT RAISE(ABORT, 'manual asset identity is immutable'); END;

-- '{}' is the legacy empty overlay. Every new overlay is a bounded editable array.
CREATE TRIGGER manual_step_annotation_format_insert BEFORE INSERT ON manual_steps
WHEN NEW.masking <> '{}' OR length(CAST(NEW.annotation AS BLOB)) > 65536 OR NOT json_valid(NEW.annotation)
BEGIN SELECT RAISE(ABORT, 'manual annotation format invalid'); END;
CREATE TRIGGER manual_step_annotation_schema_insert BEFORE INSERT ON manual_steps
WHEN json_valid(NEW.annotation) AND length(CAST(NEW.annotation AS BLOB)) <= 65536 AND NEW.annotation <> '{}' AND (
 json_type(NEW.annotation) <> 'array' OR json_array_length(NEW.annotation) > 100
 OR (NEW.asset_id IS NULL AND json_array_length(NEW.annotation) > 0)
 OR (SELECT count(DISTINCT json_extract(a.value,'$.id')) FROM json_each(NEW.annotation) a) <> json_array_length(NEW.annotation)
 OR EXISTS (SELECT 1 FROM json_each(NEW.annotation) a WHERE
    json_type(a.value) <> 'object'
    OR COALESCE(json_type(a.value,'$.id'),'') <> 'text' OR length(json_extract(a.value,'$.id')) NOT BETWEEN 1 AND 128 OR instr(json_extract(a.value,'$.id'),char(0)) > 0
    OR COALESCE(json_extract(a.value,'$.type'),'') NOT IN ('text','rectangle','ellipse','arrow')
    OR COALESCE(json_type(a.value,'$.color'),'') <> 'text' OR length(json_extract(a.value,'$.color')) <> 7
    OR substr(json_extract(a.value,'$.color'),1,1) <> '#' OR substr(json_extract(a.value,'$.color'),2) GLOB '*[^0-9a-fA-F]*'
    OR COALESCE(json_type(a.value,'$.strokeWidth'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.strokeWidth') NOT BETWEEN 1 AND 16
    OR (json_extract(a.value,'$.type') = 'arrow' AND (
      COALESCE(json_type(a.value,'$.x1'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.x1') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.y1'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.y1') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.x2'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.x2') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.y2'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.y2') NOT BETWEEN 0 AND 1
      OR (json_extract(a.value,'$.x1') = json_extract(a.value,'$.x2') AND json_extract(a.value,'$.y1') = json_extract(a.value,'$.y2'))))
    OR (json_extract(a.value,'$.type') IN ('text','rectangle','ellipse') AND (
      COALESCE(json_type(a.value,'$.x'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.x') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.y'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.y') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.width'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.width') <= 0
      OR COALESCE(json_type(a.value,'$.height'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.height') <= 0
      OR json_extract(a.value,'$.x') + json_extract(a.value,'$.width') > 1.0000000000000009
      OR json_extract(a.value,'$.y') + json_extract(a.value,'$.height') > 1.0000000000000009))
    OR (json_extract(a.value,'$.type') = 'text' AND (
      COALESCE(json_type(a.value,'$.text'),'') <> 'text' OR length(json_extract(a.value,'$.text')) NOT BETWEEN 1 AND 500 OR instr(json_extract(a.value,'$.text'),char(0)) > 0
      OR COALESCE(json_type(a.value,'$.fontSize'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.fontSize') NOT BETWEEN 10 AND 96))
    OR EXISTS (SELECT 1 FROM json_each(a.value) p WHERE p.key NOT IN ('id','type','color','strokeWidth')
      AND NOT ((json_extract(a.value,'$.type') = 'arrow' AND p.key IN ('x1','y1','x2','y2'))
        OR (json_extract(a.value,'$.type') IN ('text','rectangle','ellipse') AND p.key IN ('x','y','width','height'))
        OR (json_extract(a.value,'$.type') = 'text' AND p.key IN ('text','fontSize'))))
)
)
BEGIN SELECT RAISE(ABORT, 'manual annotation schema invalid'); END;

-- '{}' is the legacy empty overlay. Every new overlay is a bounded editable array.
CREATE TRIGGER manual_step_annotation_format_update BEFORE UPDATE OF annotation, masking, asset_id ON manual_steps
WHEN NEW.masking <> '{}' OR length(CAST(NEW.annotation AS BLOB)) > 65536 OR NOT json_valid(NEW.annotation)
BEGIN SELECT RAISE(ABORT, 'manual annotation format invalid'); END;
CREATE TRIGGER manual_step_annotation_schema_update BEFORE UPDATE OF annotation, masking, asset_id ON manual_steps
WHEN json_valid(NEW.annotation) AND length(CAST(NEW.annotation AS BLOB)) <= 65536 AND NEW.annotation <> '{}' AND (
 json_type(NEW.annotation) <> 'array' OR json_array_length(NEW.annotation) > 100
 OR (NEW.asset_id IS NULL AND json_array_length(NEW.annotation) > 0)
 OR (SELECT count(DISTINCT json_extract(a.value,'$.id')) FROM json_each(NEW.annotation) a) <> json_array_length(NEW.annotation)
 OR EXISTS (SELECT 1 FROM json_each(NEW.annotation) a WHERE
    json_type(a.value) <> 'object'
    OR COALESCE(json_type(a.value,'$.id'),'') <> 'text' OR length(json_extract(a.value,'$.id')) NOT BETWEEN 1 AND 128 OR instr(json_extract(a.value,'$.id'),char(0)) > 0
    OR COALESCE(json_extract(a.value,'$.type'),'') NOT IN ('text','rectangle','ellipse','arrow')
    OR COALESCE(json_type(a.value,'$.color'),'') <> 'text' OR length(json_extract(a.value,'$.color')) <> 7
    OR substr(json_extract(a.value,'$.color'),1,1) <> '#' OR substr(json_extract(a.value,'$.color'),2) GLOB '*[^0-9a-fA-F]*'
    OR COALESCE(json_type(a.value,'$.strokeWidth'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.strokeWidth') NOT BETWEEN 1 AND 16
    OR (json_extract(a.value,'$.type') = 'arrow' AND (
      COALESCE(json_type(a.value,'$.x1'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.x1') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.y1'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.y1') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.x2'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.x2') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.y2'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.y2') NOT BETWEEN 0 AND 1
      OR (json_extract(a.value,'$.x1') = json_extract(a.value,'$.x2') AND json_extract(a.value,'$.y1') = json_extract(a.value,'$.y2'))))
    OR (json_extract(a.value,'$.type') IN ('text','rectangle','ellipse') AND (
      COALESCE(json_type(a.value,'$.x'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.x') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.y'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.y') NOT BETWEEN 0 AND 1
      OR COALESCE(json_type(a.value,'$.width'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.width') <= 0
      OR COALESCE(json_type(a.value,'$.height'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.height') <= 0
      OR json_extract(a.value,'$.x') + json_extract(a.value,'$.width') > 1.0000000000000009
      OR json_extract(a.value,'$.y') + json_extract(a.value,'$.height') > 1.0000000000000009))
    OR (json_extract(a.value,'$.type') = 'text' AND (
      COALESCE(json_type(a.value,'$.text'),'') <> 'text' OR length(json_extract(a.value,'$.text')) NOT BETWEEN 1 AND 500 OR instr(json_extract(a.value,'$.text'),char(0)) > 0
      OR COALESCE(json_type(a.value,'$.fontSize'),'') NOT IN ('integer','real') OR json_extract(a.value,'$.fontSize') NOT BETWEEN 10 AND 96))
    OR EXISTS (SELECT 1 FROM json_each(a.value) p WHERE p.key NOT IN ('id','type','color','strokeWidth')
      AND NOT ((json_extract(a.value,'$.type') = 'arrow' AND p.key IN ('x1','y1','x2','y2'))
        OR (json_extract(a.value,'$.type') IN ('text','rectangle','ellipse') AND p.key IN ('x','y','width','height'))
        OR (json_extract(a.value,'$.type') = 'text' AND p.key IN ('text','fontSize'))))
)
)
BEGIN SELECT RAISE(ABORT, 'manual annotation schema invalid'); END;
