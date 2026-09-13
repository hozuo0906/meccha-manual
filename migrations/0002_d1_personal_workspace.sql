ALTER TABLE workspaces
  ADD COLUMN workspace_kind TEXT NOT NULL DEFAULT 'standard'
  CHECK (workspace_kind IN ('standard', 'personal'));

CREATE UNIQUE INDEX workspaces_personal_creator_unique
  ON workspaces(created_by)
  WHERE workspace_kind = 'personal';

CREATE TRIGGER workspace_kind_immutable
BEFORE UPDATE OF workspace_kind ON workspaces
WHEN NEW.workspace_kind <> OLD.workspace_kind
BEGIN
  SELECT RAISE(ABORT, 'workspace kind is immutable');
END;
