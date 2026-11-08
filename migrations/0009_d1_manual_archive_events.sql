PRAGMA foreign_keys = ON;

-- D1 manual audit is append-only and does not rebuild the workspace audit table.
CREATE TABLE manual_archive_events (
  id TEXT PRIMARY KEY NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  manual_id TEXT NOT NULL UNIQUE REFERENCES manuals(id) ON DELETE RESTRICT,
  actor_application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  action TEXT NOT NULL CHECK (action = 'manual.archived'),
  expected_updated_at TEXT NOT NULL,
  archived_at TEXT NOT NULL CHECK (strftime('%s', archived_at) IS NOT NULL)
);
CREATE INDEX manual_archive_events_workspace_idx ON manual_archive_events(workspace_id, archived_at, id);

CREATE TRIGGER manual_archive_events_scope_insert
BEFORE INSERT ON manual_archive_events
WHEN NOT EXISTS (
  SELECT 1 FROM manuals m
  JOIN workspaces w ON w.id = m.workspace_id
  JOIN workspace_members wm ON wm.workspace_id = w.id AND wm.application_id = NEW.actor_application_id
  JOIN identities i ON i.application_id = wm.application_id
  WHERE m.id = NEW.manual_id AND m.workspace_id = NEW.workspace_id
    AND m.status = 'archived' AND m.archived_at = NEW.archived_at AND m.updated_at = NEW.expected_updated_at
    AND w.status = 'active' AND i.status = 'active' AND wm.status = 'active'
    AND wm.role IN ('owner','admin','editor')
)
BEGIN SELECT RAISE(ABORT, 'manual archive audit scope mismatch'); END;

CREATE TRIGGER manual_archive_events_append_only_update
BEFORE UPDATE ON manual_archive_events
BEGIN SELECT RAISE(ABORT, 'manual archive audit is append only'); END;
CREATE TRIGGER manual_archive_events_append_only_delete
BEFORE DELETE ON manual_archive_events
BEGIN SELECT RAISE(ABORT, 'manual archive audit is append only'); END;
