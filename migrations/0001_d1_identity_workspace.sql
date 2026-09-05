PRAGMA foreign_keys = ON;

CREATE TABLE identities (
  application_id TEXT PRIMARY KEY NOT NULL,
  issuer TEXT NOT NULL,
  subject TEXT NOT NULL CHECK (
    length(trim(subject, char(9) || char(10) || char(11) || char(12) || char(13) || char(32) || char(160) || char(5760) || char(8192) || char(8193) || char(8194) || char(8195) || char(8196) || char(8197) || char(8198) || char(8199) || char(8200) || char(8201) || char(8202) || char(8232) || char(8233) || char(8239) || char(8287) || char(12288) || char(65279))) > 0
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'disabled')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE profiles (
  application_id TEXT PRIMARY KEY NOT NULL
    REFERENCES identities(application_id) ON DELETE RESTRICT,
  display_name TEXT NOT NULL CHECK (length(trim(display_name)) BETWEEN 1 AND 64),
  locale TEXT NOT NULL CHECK (length(locale) BETWEEN 1 AND 32),
  timezone TEXT NOT NULL CHECK (length(timezone) BETWEEN 1 AND 64),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 64),
  slug TEXT NOT NULL CHECK (
    length(slug) BETWEEN 3 AND 63
    AND slug NOT GLOB '*[^a-z0-9-]*'
    AND substr(slug, 1, 1) <> '-'
    AND substr(slug, -1, 1) <> '-'
  ),
  status TEXT NOT NULL CHECK (status IN ('active', 'suspended', 'deleted')),
  created_by TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX workspaces_active_slug_unique
  ON workspaces(slug) WHERE status = 'active';
CREATE INDEX workspaces_created_by_idx ON workspaces(created_by, created_at, id);

CREATE TRIGGER workspace_identity_immutable
BEFORE UPDATE OF id, created_by, created_at ON workspaces
WHEN NEW.id <> OLD.id OR NEW.created_by <> OLD.created_by OR NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'workspace identity is immutable');
END;

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  status TEXT NOT NULL CHECK (status IN ('active', 'invited', 'removed')),
  joined_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, application_id),
  CHECK (role <> 'owner' OR status = 'active')
);
CREATE INDEX workspace_members_application_idx
  ON workspace_members(application_id, status, workspace_id);
CREATE INDEX workspace_members_workspace_idx
  ON workspace_members(workspace_id, status, role, joined_at, application_id);

CREATE TRIGGER workspace_member_identity_immutable
BEFORE UPDATE OF workspace_id, application_id ON workspace_members
WHEN NEW.workspace_id <> OLD.workspace_id
  OR NEW.application_id <> OLD.application_id
BEGIN
  SELECT RAISE(ABORT, 'workspace member identity is immutable');
END;

CREATE TRIGGER workspace_member_insert_limit
BEFORE INSERT ON workspace_members
WHEN NEW.status = 'active'
  AND (SELECT count(*) FROM workspace_members
       WHERE workspace_id = NEW.workspace_id AND status = 'active') >= 1000
BEGIN
  SELECT RAISE(ABORT, 'workspace member limit');
END;

CREATE TRIGGER workspace_member_update_limit
BEFORE UPDATE OF workspace_id, status ON workspace_members
WHEN OLD.status <> 'active' AND NEW.status = 'active'
  AND (SELECT count(*) FROM workspace_members
       WHERE workspace_id = NEW.workspace_id AND status = 'active') >= 1000
BEGIN
  SELECT RAISE(ABORT, 'workspace member limit');
END;

CREATE TRIGGER workspace_member_owner_transfer
BEFORE UPDATE OF role ON workspace_members
WHEN NEW.role = 'owner' AND OLD.role <> 'owner'
BEGIN
  SELECT RAISE(ABORT, 'owner transfer is unavailable');
END;

CREATE TRIGGER workspace_member_owner_loss_update
BEFORE UPDATE OF role, status ON workspace_members
WHEN OLD.role = 'owner'
  AND (NEW.role <> 'owner' OR NEW.status <> 'active')
  AND (SELECT count(*) FROM workspace_members
       WHERE workspace_id = OLD.workspace_id AND role = 'owner' AND status = 'active'
         AND EXISTS (SELECT 1 FROM identities AS owner_identity
                      WHERE owner_identity.application_id = workspace_members.application_id
                        AND owner_identity.status = 'active')) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last active owner');
END;

CREATE TRIGGER workspace_member_owner_loss_delete
BEFORE DELETE ON workspace_members
WHEN OLD.role = 'owner'
  AND (SELECT count(*) FROM workspace_members
       WHERE workspace_id = OLD.workspace_id AND role = 'owner' AND status = 'active'
         AND EXISTS (SELECT 1 FROM identities AS owner_identity
                      WHERE owner_identity.application_id = workspace_members.application_id
                        AND owner_identity.status = 'active')) <= 1
BEGIN
  SELECT RAISE(ABORT, 'last active owner');
END;

CREATE TRIGGER identity_disable_last_owner
BEFORE UPDATE OF status ON identities
WHEN OLD.status = 'active' AND NEW.status = 'disabled'
  AND EXISTS (
    SELECT 1 FROM workspace_members AS owner_membership
     WHERE owner_membership.application_id = OLD.application_id
       AND owner_membership.role = 'owner' AND owner_membership.status = 'active'
       AND NOT EXISTS (
         SELECT 1 FROM workspace_members AS other_owner
         JOIN identities AS other_identity ON other_identity.application_id = other_owner.application_id
        WHERE other_owner.workspace_id = owner_membership.workspace_id
          AND other_owner.role = 'owner' AND other_owner.status = 'active'
          AND other_owner.application_id <> OLD.application_id
          AND other_identity.status = 'active'
       )
  )
BEGIN
  SELECT RAISE(ABORT, 'last active owner');
END;

CREATE TABLE workspace_join_codes (
  id TEXT PRIMARY KEY NOT NULL,
  issuer_application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  digest TEXT NOT NULL CHECK (length(digest) = 64 AND digest NOT GLOB '*[^0-9a-f]*'),
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  consumption_nonce TEXT,
  revoked_at TEXT,
  UNIQUE (issuer_application_id, digest),
  CHECK (consumed_at IS NULL OR consumed_at >= issued_at),
  CHECK ((consumed_at IS NULL AND consumption_nonce IS NULL)
      OR (consumed_at IS NOT NULL AND consumption_nonce IS NOT NULL)),
  CHECK (revoked_at IS NULL OR revoked_at >= issued_at)
);
CREATE INDEX workspace_join_codes_lookup_idx
  ON workspace_join_codes(digest, expires_at, consumed_at, revoked_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  actor_application_id TEXT REFERENCES identities(application_id) ON DELETE RESTRICT,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE RESTRICT,
  target_application_id TEXT REFERENCES identities(application_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action IN ('workspace.created', 'join_code.issued', 'member.joined', 'member.updated')),
  metadata_json TEXT NOT NULL CHECK (length(metadata_json) <= 512),
  created_at TEXT NOT NULL
);
CREATE INDEX audit_logs_workspace_idx ON audit_logs(workspace_id, created_at, id);

CREATE TRIGGER audit_logs_append_only_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit log is append only');
END;
CREATE TRIGGER audit_logs_append_only_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit log is append only');
END;
