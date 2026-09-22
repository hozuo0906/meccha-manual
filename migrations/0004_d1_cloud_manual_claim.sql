PRAGMA foreign_keys = ON;

CREATE TABLE claim_intents (
  id TEXT PRIMARY KEY NOT NULL,
  actor_application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 16 AND 128 AND operation_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  asset_count INTEGER NOT NULL CHECK (asset_count BETWEEN 0 AND 100),
  expires_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'expired')),
  request_fingerprint TEXT,
  manual_id TEXT,
  created_at TEXT NOT NULL,
  completed_at TEXT,
  updated_at TEXT NOT NULL,
  UNIQUE (actor_application_id, id),
  UNIQUE (actor_application_id, operation_id),
  UNIQUE (id, workspace_id, operation_id)
);
CREATE INDEX claim_intents_workspace_idx ON claim_intents(workspace_id, status, expires_at);

CREATE TABLE manuals (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  folder_id TEXT,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 64 AND length(trim(title)) > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'reviewing', 'published', 'stale', 'archived')),
  current_draft_revision_id TEXT,
  current_published_revision_id TEXT,
  created_by TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX manuals_workspace_updated_idx ON manuals(workspace_id, archived_at, updated_at DESC, id);

CREATE TABLE manual_revisions (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  manual_id TEXT NOT NULL REFERENCES manuals(id) ON DELETE RESTRICT,
  revision_no INTEGER NOT NULL CHECK (revision_no > 0),
  state TEXT NOT NULL CHECK (state IN ('draft', 'published', 'superseded')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 64 AND length(trim(title)) > 0),
  description TEXT NOT NULL CHECK (length(description) <= 10000),
  content_version TEXT NOT NULL CHECK (length(content_version) = 32 AND content_version NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (manual_id, revision_no)
);
CREATE UNIQUE INDEX manual_revisions_one_draft_idx ON manual_revisions(manual_id) WHERE state = 'draft';
CREATE UNIQUE INDEX manual_revisions_one_published_idx ON manual_revisions(manual_id) WHERE state = 'published';

CREATE TABLE manual_steps (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  revision_id TEXT NOT NULL REFERENCES manual_revisions(id) ON DELETE RESTRICT,
  position INTEGER NOT NULL CHECK (position >= 0 AND position < 200),
  type TEXT NOT NULL CHECK (type IN ('action', 'note', 'decision', 'warning')),
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 128 AND length(trim(title)) > 0),
  instruction TEXT NOT NULL CHECK (length(instruction) <= 4000),
  action_type TEXT CHECK (action_type IS NULL OR action_type IN ('click', 'input', 'select', 'navigate', 'wait', 'other')),
  target_text TEXT CHECK (target_text IS NULL OR length(target_text) <= 256),
  url TEXT CHECK (url IS NULL OR length(url) <= 2048),
  asset_id TEXT,
  annotation TEXT NOT NULL DEFAULT '{}',
  masking TEXT NOT NULL DEFAULT '{}',
  deleted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX manual_steps_revision_idx ON manual_steps(revision_id, deleted_at, position, id);
CREATE UNIQUE INDEX manual_steps_revision_position_active ON manual_steps(revision_id, position) WHERE deleted_at IS NULL;

CREATE TABLE assets (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  bucket TEXT NOT NULL CHECK (bucket = 'MANUAL_ASSETS'),
  object_key TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL CHECK (kind = 'manual_image'),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 10485760),
  checksum_sha256 TEXT NOT NULL CHECK (length(checksum_sha256) = 64 AND checksum_sha256 NOT GLOB '*[^0-9a-f]*'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX assets_workspace_idx ON assets(workspace_id, id);

CREATE TRIGGER manual_step_asset_scope_insert
BEFORE INSERT ON manual_steps
WHEN NEW.asset_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM assets a
   JOIN claim_assets ca ON ca.asset_id = a.id AND ca.status = 'completed'
   JOIN claim_intents ci ON ci.id = ca.claim_intent_id AND ci.status = 'completed'
   JOIN manual_revisions r ON r.id = NEW.revision_id
   WHERE a.id = NEW.asset_id AND a.workspace_id = NEW.workspace_id AND a.kind = 'manual_image' AND ci.manual_id = r.manual_id
 )
BEGIN SELECT RAISE(ABORT, 'manual step asset manual mismatch'); END;

CREATE TRIGGER manual_step_asset_scope_update
BEFORE UPDATE OF asset_id, workspace_id, revision_id ON manual_steps
WHEN NEW.asset_id IS NOT NULL
 AND NOT EXISTS (
   SELECT 1 FROM assets a
   JOIN claim_assets ca ON ca.asset_id = a.id AND ca.status = 'completed'
   JOIN claim_intents ci ON ci.id = ca.claim_intent_id AND ci.status = 'completed'
   JOIN manual_revisions r ON r.id = NEW.revision_id
   WHERE a.id = NEW.asset_id AND a.workspace_id = NEW.workspace_id AND a.kind = 'manual_image' AND ci.manual_id = r.manual_id
 )
BEGIN SELECT RAISE(ABORT, 'manual step asset manual mismatch'); END;

CREATE TRIGGER manual_step_active_limit
BEFORE INSERT ON manual_steps
WHEN NEW.deleted_at IS NULL
 AND (SELECT COUNT(*) FROM manual_steps WHERE revision_id = NEW.revision_id AND deleted_at IS NULL) >= 200
BEGIN SELECT RAISE(ABORT, 'manual step limit'); END;

CREATE TABLE claim_assets (
  id TEXT PRIMARY KEY NOT NULL,
  claim_intent_id TEXT NOT NULL REFERENCES claim_intents(id) ON DELETE RESTRICT,
  asset_slot INTEGER NOT NULL CHECK (asset_slot BETWEEN 0 AND 99),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'image/webp')),
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 10485760),
  sha256 TEXT NOT NULL CHECK (length(sha256) = 64 AND sha256 NOT GLOB '*[^0-9a-f]*'),
  status TEXT NOT NULL CHECK (status IN ('reserved', 'staged', 'completed')),
  asset_id TEXT REFERENCES assets(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (claim_intent_id, asset_slot),
  UNIQUE (claim_intent_id, operation_id, asset_slot),
  FOREIGN KEY (claim_intent_id, workspace_id, operation_id) REFERENCES claim_intents(id, workspace_id, operation_id)
);
CREATE INDEX claim_assets_workspace_idx ON claim_assets(workspace_id, status, updated_at);

CREATE TRIGGER claim_intents_workspace_scope_insert
BEFORE INSERT ON claim_intents
WHEN NOT EXISTS (
  SELECT 1 FROM identities i JOIN workspaces w ON w.id = NEW.workspace_id
  JOIN workspace_members m ON m.workspace_id = w.id AND m.application_id = NEW.actor_application_id
  WHERE i.application_id = NEW.actor_application_id AND i.status = 'active'
    AND w.created_by = NEW.actor_application_id AND w.workspace_kind = 'personal' AND w.status = 'active'
    AND m.role = 'owner' AND m.status = 'active'
)
BEGIN SELECT RAISE(ABORT, 'claim intent requires active personal owner workspace'); END;

CREATE TRIGGER manuals_scope_insert
BEFORE INSERT ON manuals
WHEN NOT EXISTS (
  SELECT 1 FROM identities i JOIN workspaces w ON w.id = NEW.workspace_id
  JOIN workspace_members m ON m.workspace_id = w.id AND m.application_id = NEW.created_by
  WHERE i.application_id = NEW.created_by AND i.status = 'active' AND w.status = 'active'
    AND m.status = 'active' AND m.role IN ('owner','admin','editor')
)
BEGIN SELECT RAISE(ABORT, 'manual requires active workspace membership'); END;

CREATE TRIGGER manual_revision_workspace_scope
BEFORE INSERT ON manual_revisions
WHEN NOT EXISTS (SELECT 1 FROM manuals m WHERE m.id = NEW.manual_id AND m.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'revision workspace mismatch'); END;

CREATE TRIGGER manual_step_workspace_scope
BEFORE INSERT ON manual_steps
WHEN NOT EXISTS (SELECT 1 FROM manual_revisions r WHERE r.id = NEW.revision_id AND r.workspace_id = NEW.workspace_id)
BEGIN SELECT RAISE(ABORT, 'step workspace mismatch'); END;

CREATE TRIGGER manuals_workspace_immutable
BEFORE UPDATE OF id, workspace_id, created_by ON manuals
WHEN NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.created_by <> OLD.created_by
BEGIN SELECT RAISE(ABORT, 'manual identity is immutable'); END;

CREATE TRIGGER manual_revisions_workspace_immutable
BEFORE UPDATE OF id, workspace_id, manual_id ON manual_revisions
WHEN NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.manual_id <> OLD.manual_id
BEGIN SELECT RAISE(ABORT, 'revision identity is immutable'); END;

CREATE TRIGGER manual_steps_workspace_immutable
BEFORE UPDATE OF id, workspace_id, revision_id ON manual_steps
WHEN NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.revision_id <> OLD.revision_id
BEGIN SELECT RAISE(ABORT, 'step identity is immutable'); END;

CREATE TRIGGER manual_revision_sync_draft
AFTER UPDATE OF title, description, content_version, updated_at ON manual_revisions
WHEN NEW.state = 'draft'
BEGIN
  UPDATE manuals SET title = NEW.title, updated_at = NEW.updated_at
   WHERE id = NEW.manual_id AND workspace_id = NEW.workspace_id AND current_draft_revision_id = NEW.id;
  SELECT CASE WHEN (SELECT changes()) <> 1 THEN RAISE(ABORT, 'draft manual pointer mismatch') END;
END;

CREATE TRIGGER claim_asset_scope_insert
BEFORE INSERT ON claim_assets
WHEN NOT EXISTS (SELECT 1 FROM claim_intents c WHERE c.id = NEW.claim_intent_id AND c.workspace_id = NEW.workspace_id AND c.operation_id = NEW.operation_id AND NEW.asset_slot < c.asset_count)
BEGIN SELECT RAISE(ABORT, 'claim asset scope mismatch'); END;

CREATE TRIGGER claim_asset_total_limit_insert
BEFORE INSERT ON claim_assets
WHEN (SELECT COALESCE(SUM(byte_length), 0) FROM claim_assets
      WHERE claim_intent_id = NEW.claim_intent_id AND status IN ('reserved', 'staged', 'completed'))
     + NEW.byte_length > 104857600
BEGIN SELECT RAISE(ABORT, 'claim asset total limit'); END;

CREATE TRIGGER claim_asset_identity_immutable
BEFORE UPDATE OF id, claim_intent_id, asset_slot, workspace_id, operation_id, object_key, content_type, byte_length, sha256
ON claim_assets
WHEN NEW.id <> OLD.id OR NEW.claim_intent_id <> OLD.claim_intent_id
  OR NEW.asset_slot <> OLD.asset_slot OR NEW.workspace_id <> OLD.workspace_id
  OR NEW.operation_id <> OLD.operation_id OR NEW.object_key <> OLD.object_key
  OR NEW.content_type <> OLD.content_type OR NEW.byte_length <> OLD.byte_length
  OR NEW.sha256 <> OLD.sha256
BEGIN SELECT RAISE(ABORT, 'claim asset identity is immutable'); END;

CREATE TRIGGER claim_asset_status_transition
BEFORE UPDATE OF status ON claim_assets
WHEN (OLD.status = 'reserved' AND NEW.status NOT IN ('reserved', 'staged'))
  OR (OLD.status = 'staged' AND NEW.status NOT IN ('staged', 'completed'))
  OR (OLD.status = 'completed' AND NEW.status <> 'completed')
  OR (NEW.status = 'completed' AND NEW.asset_id IS NULL)
BEGIN SELECT RAISE(ABORT, 'claim asset status transition is invalid'); END;
