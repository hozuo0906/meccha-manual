CREATE TABLE workspace_owner_transfer_permits (
  workspace_id TEXT PRIMARY KEY NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  actor_application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  target_application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  CHECK (actor_application_id <> target_application_id)
);

DROP TRIGGER workspace_member_owner_transfer;
CREATE TRIGGER workspace_member_owner_transfer
BEFORE UPDATE OF role ON workspace_members
WHEN NEW.role = 'owner' AND OLD.role <> 'owner'
  AND NOT EXISTS (
    SELECT 1 FROM workspace_owner_transfer_permits AS permit
    JOIN workspaces AS w ON w.id = permit.workspace_id
    JOIN workspace_members AS actor
      ON actor.workspace_id = permit.workspace_id
      AND actor.application_id = permit.actor_application_id
    JOIN identities AS actor_identity ON actor_identity.application_id = actor.application_id
    JOIN identities AS target_identity ON target_identity.application_id = NEW.application_id
    WHERE permit.workspace_id = NEW.workspace_id
      AND permit.target_application_id = NEW.application_id
      AND permit.actor_application_id <> NEW.application_id
      AND actor.role = 'owner' AND actor.status = 'active'
      AND actor_identity.status = 'active' AND target_identity.status = 'active'
      AND OLD.status = 'active' AND NEW.status = 'active'
      AND OLD.role IN ('admin', 'editor', 'viewer')
      AND w.workspace_kind = 'standard' AND w.status = 'active'
  )
BEGIN
  SELECT RAISE(ABORT, 'owner transfer requires valid permit');
END;
