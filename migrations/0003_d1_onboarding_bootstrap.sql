CREATE TABLE onboarding_bootstrap_operations (
  application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL CHECK (length(operation_id) BETWEEN 16 AND 128),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  created_identity INTEGER NOT NULL CHECK (created_identity IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (application_id, operation_id)
);

CREATE TABLE onboarding_signup_events (
  event_id TEXT PRIMARY KEY NOT NULL,
  event_name TEXT NOT NULL CHECK (event_name = 'signup_completed'),
  application_id TEXT NOT NULL UNIQUE REFERENCES identities(application_id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  occurred_at TEXT NOT NULL,
  FOREIGN KEY (application_id, operation_id)
    REFERENCES onboarding_bootstrap_operations(application_id, operation_id) ON DELETE RESTRICT
);
