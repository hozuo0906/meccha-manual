PRAGMA foreign_keys = ON;

CREATE UNIQUE INDEX IF NOT EXISTS manual_revisions_identity_scope_idx
  ON manual_revisions(id, manual_id, workspace_id);

-- A share always points at an immutable published revision. The draft pointer
-- remains editable and is intentionally never used by anonymous reads.
CREATE TABLE share_links (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  manual_id TEXT NOT NULL REFERENCES manuals(id) ON DELETE RESTRICT,
  published_revision_id TEXT NOT NULL REFERENCES manual_revisions(id) ON DELETE RESTRICT,
  source_draft_revision_id TEXT NOT NULL REFERENCES manual_revisions(id) ON DELETE RESTRICT,
  source_content_version TEXT NOT NULL CHECK (length(source_content_version) = 32 AND source_content_version NOT GLOB '*[^0-9a-f]*'),
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*'),
  passcode_salt TEXT NOT NULL CHECK (length(passcode_salt) BETWEEN 20 AND 128 AND passcode_salt NOT GLOB '*[^A-Za-z0-9_-]*'),
  passcode_hash TEXT NOT NULL CHECK (length(passcode_hash) BETWEEN 40 AND 256 AND passcode_hash NOT GLOB '*[^A-Za-z0-9_-]*'),
  permission TEXT NOT NULL CHECK (permission = 'read_only'),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_by TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 16 AND 128 AND operation_id NOT GLOB '*[^A-Za-z0-9_-]*'),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (published_revision_id, manual_id, workspace_id)
    REFERENCES manual_revisions(id, manual_id, workspace_id)
);
CREATE INDEX share_links_token_idx ON share_links(token_hash);
CREATE INDEX share_links_workspace_idx ON share_links(workspace_id, manual_id, revoked_at, expires_at);
CREATE UNIQUE INDEX share_links_active_manual_idx ON share_links(manual_id) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX share_links_actor_operation_idx ON share_links(created_by, operation_id);
CREATE UNIQUE INDEX share_links_identity_token_idx ON share_links(id, token_hash);

CREATE TABLE share_grants (
  id TEXT PRIMARY KEY NOT NULL,
  share_link_id TEXT NOT NULL REFERENCES share_links(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL,
  grant_hash TEXT NOT NULL UNIQUE CHECK (length(grant_hash) = 64 AND grant_hash NOT GLOB '*[^0-9a-f]*'),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  manual_id TEXT NOT NULL REFERENCES manuals(id) ON DELETE RESTRICT,
  published_revision_id TEXT NOT NULL REFERENCES manual_revisions(id) ON DELETE RESTRICT,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (share_link_id, token_hash) REFERENCES share_links(id, token_hash),
  FOREIGN KEY (published_revision_id, manual_id, workspace_id)
    REFERENCES manual_revisions(id, manual_id, workspace_id)
);
CREATE INDEX share_grants_lookup_idx ON share_grants(grant_hash, revoked_at, expires_at);

CREATE TRIGGER share_links_scope_insert
BEFORE INSERT ON share_links
WHEN NOT EXISTS (
  SELECT 1
    FROM manuals m
    JOIN manual_revisions r ON r.id = NEW.published_revision_id
      AND r.manual_id = NEW.manual_id AND r.workspace_id = NEW.workspace_id AND r.state = 'published'
    JOIN manual_revisions d ON d.id = NEW.source_draft_revision_id
      AND d.manual_id = NEW.manual_id AND d.workspace_id = NEW.workspace_id
      AND d.state = 'draft' AND d.content_version = NEW.source_content_version
    JOIN identities i ON i.application_id = NEW.created_by
    JOIN workspaces w ON w.id = NEW.workspace_id
    JOIN workspace_members wm ON wm.workspace_id = NEW.workspace_id AND wm.application_id = NEW.created_by
   WHERE m.id = NEW.manual_id AND m.workspace_id = NEW.workspace_id
     AND m.current_draft_revision_id = d.id
     AND m.current_published_revision_id = NEW.published_revision_id
     AND m.archived_at IS NULL AND i.status = 'active' AND w.status = 'active'
     AND wm.status = 'active' AND wm.role IN ('owner','admin','editor')
)
BEGIN SELECT RAISE(ABORT, 'share link scope mismatch'); END;

CREATE TRIGGER share_links_identity_immutable
BEFORE UPDATE OF id, workspace_id, manual_id, published_revision_id, source_draft_revision_id, source_content_version, token_hash, passcode_salt, passcode_hash, permission, created_by, operation_id
ON share_links
WHEN NEW.id <> OLD.id OR NEW.workspace_id <> OLD.workspace_id OR NEW.manual_id <> OLD.manual_id
  OR NEW.published_revision_id <> OLD.published_revision_id OR NEW.source_draft_revision_id <> OLD.source_draft_revision_id
  OR NEW.source_content_version <> OLD.source_content_version OR NEW.token_hash <> OLD.token_hash
  OR NEW.passcode_salt <> OLD.passcode_salt OR NEW.passcode_hash <> OLD.passcode_hash
  OR NEW.permission <> OLD.permission OR NEW.created_by <> OLD.created_by OR NEW.operation_id <> OLD.operation_id
BEGIN SELECT RAISE(ABORT, 'share link identity is immutable'); END;

CREATE TRIGGER share_grants_scope_insert
BEFORE INSERT ON share_grants
WHEN NOT EXISTS (
  SELECT 1 FROM share_links s
  WHERE s.id = NEW.share_link_id AND s.token_hash = NEW.token_hash
    AND s.workspace_id = NEW.workspace_id AND s.manual_id = NEW.manual_id
    AND s.published_revision_id = NEW.published_revision_id
)
 OR EXISTS (SELECT 1 FROM share_links s WHERE s.id = NEW.share_link_id AND (s.revoked_at IS NOT NULL OR NEW.expires_at > s.expires_at))
 OR strftime('%s', NEW.expires_at) IS NULL
 OR strftime('%s', NEW.created_at) IS NULL
 OR strftime('%s', NEW.expires_at) <= strftime('%s', NEW.created_at)
 OR strftime('%s', NEW.expires_at) - strftime('%s', NEW.created_at) > 900
BEGIN SELECT RAISE(ABORT, 'share grant scope or expiry mismatch'); END;

CREATE TRIGGER share_grants_identity_immutable
BEFORE UPDATE OF id, share_link_id, token_hash, grant_hash, workspace_id, manual_id, published_revision_id
ON share_grants
WHEN NEW.id <> OLD.id OR NEW.share_link_id <> OLD.share_link_id OR NEW.token_hash <> OLD.token_hash
  OR NEW.grant_hash <> OLD.grant_hash OR NEW.workspace_id <> OLD.workspace_id
  OR NEW.manual_id <> OLD.manual_id OR NEW.published_revision_id <> OLD.published_revision_id
BEGIN SELECT RAISE(ABORT, 'share grant identity is immutable'); END;

CREATE TRIGGER share_grant_expiry_immutable
BEFORE UPDATE OF expires_at ON share_grants
WHEN NEW.expires_at > OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'share grant expiry cannot be extended'); END;

CREATE TRIGGER share_grant_revoke_immutable
BEFORE UPDATE OF revoked_at ON share_grants
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL
BEGIN SELECT RAISE(ABORT, 'share grant revoke cannot be undone'); END;

CREATE TRIGGER share_link_expiry_immutable
BEFORE UPDATE OF expires_at ON share_links
WHEN NEW.expires_at > OLD.expires_at
BEGIN SELECT RAISE(ABORT, 'share link expiry cannot be extended'); END;

CREATE TRIGGER share_link_revoke_immutable
BEFORE UPDATE OF revoked_at ON share_links
WHEN OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL
BEGIN SELECT RAISE(ABORT, 'share link revoke cannot be undone'); END;

CREATE TRIGGER published_revision_content_immutable
BEFORE UPDATE OF workspace_id, manual_id, revision_no, title, description, content_version, created_at ON manual_revisions
WHEN OLD.state = 'published'
BEGIN SELECT RAISE(ABORT, 'published revision is immutable'); END;

CREATE TRIGGER published_revision_timestamp_immutable
BEFORE UPDATE OF updated_at ON manual_revisions
WHEN OLD.state = 'published' AND NEW.state = 'published' AND NEW.updated_at <> OLD.updated_at
BEGIN SELECT RAISE(ABORT, 'published revision is immutable'); END;

CREATE TRIGGER published_step_insert_forbidden
BEFORE INSERT ON manual_steps
WHEN (SELECT state FROM manual_revisions WHERE id = NEW.revision_id) = 'published'
BEGIN SELECT RAISE(ABORT, 'published step is immutable'); END;

CREATE TRIGGER published_step_content_immutable
BEFORE UPDATE OF workspace_id, revision_id, position, type, title, instruction, action_type, target_text, url, asset_id, annotation, masking, deleted_at, created_at, updated_at ON manual_steps
WHEN (SELECT state FROM manual_revisions WHERE id = OLD.revision_id) = 'published'
BEGIN SELECT RAISE(ABORT, 'published step is immutable'); END;

CREATE TRIGGER published_step_delete_forbidden
BEFORE DELETE ON manual_steps
WHEN (SELECT state FROM manual_revisions WHERE id = OLD.revision_id) = 'published'
BEGIN SELECT RAISE(ABORT, 'published step is immutable'); END;
