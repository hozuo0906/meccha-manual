CREATE TABLE onboarding_bootstrap_operations (
  application_id TEXT NOT NULL REFERENCES identities(application_id) ON DELETE RESTRICT,
  operation_id TEXT NOT NULL CHECK (
    typeof(operation_id) = 'text'
    AND length(operation_id) BETWEEN 16 AND 128
    AND operation_id NOT GLOB '*[^A-Za-z0-9_-]*'
    AND instr(operation_id, char(0)) = 0
  ),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
  created_identity INTEGER NOT NULL CHECK (created_identity IN (0, 1)),
  created_at TEXT NOT NULL,
  PRIMARY KEY (application_id, operation_id)
);

CREATE UNIQUE INDEX onboarding_bootstrap_first_operation_unique
  ON onboarding_bootstrap_operations(application_id)
  WHERE created_identity = 1;

CREATE TRIGGER onboarding_bootstrap_created_identity_authoritative_insert
BEFORE INSERT ON onboarding_bootstrap_operations
WHEN NEW.created_identity = 1
  AND NOT EXISTS (
    SELECT 1 FROM identities i
    WHERE i.application_id = NEW.application_id
      AND NEW.created_at = i.created_at
  )
BEGIN
  SELECT RAISE(ABORT, 'created identity operation requires authoritative identity timestamp');
END;

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

CREATE TRIGGER onboarding_bootstrap_operation_workspace_scope_insert
BEFORE INSERT ON onboarding_bootstrap_operations
WHEN NOT EXISTS (
  SELECT 1
  FROM identities i
  JOIN workspaces w ON w.created_by = i.application_id
  JOIN workspace_members m
    ON m.workspace_id = w.id
   AND m.application_id = i.application_id
  WHERE i.application_id = NEW.application_id
    AND i.status = 'active'
    AND w.id = NEW.workspace_id
    AND w.status = 'active'
    AND w.workspace_kind = 'personal'
    AND m.role = 'owner'
    AND m.status = 'active'
)
BEGIN
  SELECT RAISE(ABORT, 'bootstrap operation requires active personal owner workspace');
END;

CREATE TRIGGER onboarding_bootstrap_operation_append_only_insert
BEFORE INSERT ON onboarding_bootstrap_operations
WHEN EXISTS (
  SELECT 1 FROM onboarding_bootstrap_operations o
  WHERE o.application_id = NEW.application_id
    AND o.operation_id = NEW.operation_id
)
BEGIN
  SELECT RAISE(ABORT, 'bootstrap operation is append only');
END;

CREATE TRIGGER onboarding_bootstrap_created_identity_immutable
BEFORE UPDATE OF created_identity ON onboarding_bootstrap_operations
WHEN NEW.created_identity <> OLD.created_identity
BEGIN
  SELECT RAISE(ABORT, 'bootstrap created identity is immutable');
END;

CREATE TRIGGER onboarding_bootstrap_operation_identity_immutable
BEFORE UPDATE OF application_id, operation_id, workspace_id ON onboarding_bootstrap_operations
WHEN NEW.application_id <> OLD.application_id
  OR NEW.operation_id <> OLD.operation_id
  OR NEW.workspace_id <> OLD.workspace_id
BEGIN
  SELECT RAISE(ABORT, 'bootstrap operation identity is immutable');
END;

CREATE TRIGGER onboarding_bootstrap_created_at_immutable
BEFORE UPDATE OF created_at ON onboarding_bootstrap_operations
WHEN NEW.created_at <> OLD.created_at
BEGIN
  SELECT RAISE(ABORT, 'bootstrap operation timestamp is immutable');
END;

CREATE TRIGGER onboarding_bootstrap_operations_append_only_delete
BEFORE DELETE ON onboarding_bootstrap_operations
BEGIN
  SELECT RAISE(ABORT, 'bootstrap operation is append only');
END;

CREATE TRIGGER onboarding_signup_event_consistency_insert
BEFORE INSERT ON onboarding_signup_events
WHEN NOT EXISTS (
  SELECT 1 FROM onboarding_bootstrap_operations o
  WHERE o.application_id = NEW.application_id
    AND o.operation_id = NEW.operation_id
    AND o.workspace_id = NEW.workspace_id
    AND o.created_identity = 1
)
BEGIN
  SELECT RAISE(ABORT, 'signup event requires created identity operation');
END;

CREATE TRIGGER onboarding_signup_event_consistency_update
BEFORE UPDATE OF application_id, operation_id, workspace_id ON onboarding_signup_events
WHEN NOT EXISTS (
  SELECT 1 FROM onboarding_bootstrap_operations o
  WHERE o.application_id = NEW.application_id
    AND o.operation_id = NEW.operation_id
    AND o.workspace_id = NEW.workspace_id
    AND o.created_identity = 1
)
BEGIN
  SELECT RAISE(ABORT, 'signup event requires created identity operation');
END;

CREATE TRIGGER onboarding_signup_event_envelope_insert
BEFORE INSERT ON onboarding_signup_events
WHEN NOT EXISTS (
  SELECT 1 FROM onboarding_bootstrap_operations o
  WHERE o.application_id = NEW.application_id
    AND o.operation_id = NEW.operation_id
    AND o.workspace_id = NEW.workspace_id
    AND o.created_identity = 1
    AND NEW.event_id = 'meccha-manual:onboarding:v1:signup_completed:'
      || length(o.application_id) || ':' || o.application_id || ':' || o.operation_id
    AND NEW.occurred_at = o.created_at
)
AND EXISTS (
  SELECT 1 FROM onboarding_bootstrap_operations o
  WHERE o.application_id = NEW.application_id
    AND o.operation_id = NEW.operation_id
    AND o.workspace_id = NEW.workspace_id
    AND o.created_identity = 1
)
BEGIN
  SELECT RAISE(ABORT, 'signup event envelope does not match operation');
END;

CREATE TRIGGER onboarding_signup_event_envelope_update
BEFORE UPDATE OF event_id, application_id, operation_id, workspace_id, occurred_at ON onboarding_signup_events
WHEN NOT EXISTS (
  SELECT 1 FROM onboarding_bootstrap_operations o
  WHERE o.application_id = NEW.application_id
    AND o.operation_id = NEW.operation_id
    AND o.workspace_id = NEW.workspace_id
    AND o.created_identity = 1
    AND NEW.event_id = 'meccha-manual:onboarding:v1:signup_completed:'
      || length(o.application_id) || ':' || o.application_id || ':' || o.operation_id
    AND NEW.occurred_at = o.created_at
)
AND EXISTS (
  SELECT 1 FROM onboarding_bootstrap_operations o
  WHERE o.application_id = NEW.application_id
    AND o.operation_id = NEW.operation_id
    AND o.workspace_id = NEW.workspace_id
    AND o.created_identity = 1
)
BEGIN
  SELECT RAISE(ABORT, 'signup event envelope does not match operation');
END;

CREATE TRIGGER onboarding_signup_event_identity_immutable
BEFORE UPDATE OF application_id, operation_id, workspace_id ON onboarding_signup_events
WHEN NEW.application_id <> OLD.application_id
  OR NEW.operation_id <> OLD.operation_id
  OR NEW.workspace_id <> OLD.workspace_id
BEGIN
  SELECT RAISE(ABORT, 'signup event identity is immutable');
END;

CREATE TRIGGER onboarding_signup_event_append_only_insert
BEFORE INSERT ON onboarding_signup_events
WHEN EXISTS (
  SELECT 1 FROM onboarding_signup_events e
  WHERE e.event_id = NEW.event_id
     OR e.application_id = NEW.application_id
)
BEGIN
  SELECT RAISE(ABORT, 'signup event is append only');
END;

CREATE TRIGGER onboarding_signup_events_append_only_delete
BEFORE DELETE ON onboarding_signup_events
BEGIN
  SELECT RAISE(ABORT, 'signup event is append only');
END;
