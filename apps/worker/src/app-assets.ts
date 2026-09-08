export const APP_ASSET_VERSION = "sha256-c5ad709595bf3651";

export const APP_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>ã‚ã£ã¡ã‚ƒãƒžãƒ‹ãƒ¥ã‚¢ãƒ«</title>
  <link rel="stylesheet" href="/assets/app.css?v=${APP_ASSET_VERSION}">
</head>
<body>
  <a class="skip-link" href="#screen-content">æœ¬æ–‡ã¸ç§»å‹•</a>
  <main class="app">
    <div id="app">
    <section id="screen-content" class="boot" role="status" aria-live="polite" aria-busy="true" tabindex="-1">
      <div class="logo-mark" aria-hidden="true"><span>ã‚</span></div>
      <p>ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹ã‚’èª­ã¿è¾¼ã‚“ã§ã„ã¾ã™</p>
    </section>
    </div>
  </main>
  <script src="/assets/app.js?v=${APP_ASSET_VERSION}" defer></script>
</body>
</html>`;

export const APP_CSS = `
:root {
  color-scheme: light;
  --bg: #f6f7f9;
  --surface: #ffffff;
  --surface-strong: #f0f3f7;
  --border: #d9dee7;
  --text: #162033;
  --muted: #667085;
  --primary: #0f766e;
  --primary-strong: #115e59;
  --accent: #c2410c;
  --danger: #b42318;
  --shadow: 0 18px 48px rgba(16, 24, 40, 0.12);
  font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  margin: 0;
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}

.skip-link {
  position: fixed;
  top: 8px;
  left: 8px;
  z-index: 100;
  min-height: 44px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  border-radius: 8px;
  background: #fff;
  color: var(--primary-strong);
  font-weight: 800;
  box-shadow: var(--shadow);
  transform: translateY(-160%);
}

.skip-link:focus {
  transform: translateY(0);
}

button,
input,
select,
textarea {
  font: inherit;
}

button {
  border: 0;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

:where(a, button, input, select, [tabindex]):focus-visible {
  outline: 3px solid #ffffff;
  outline-offset: 2px;
  box-shadow: 0 0 0 5px #1d4ed8;
}

.app {
  min-height: 100vh;
}

.boot {
  min-height: 100vh;
  display: grid;
  place-content: center;
  gap: 16px;
  text-align: center;
  color: var(--muted);
}

.logo-mark {
  width: 58px;
  height: 58px;
  display: grid;
  place-items: center;
  position: relative;
  margin: 0 auto;
  color: #fff;
  background: linear-gradient(135deg, var(--primary), #2563eb);
  border-radius: 14px 14px 18px 14px;
  box-shadow: 0 12px 28px rgba(15, 118, 110, 0.24);
}

.logo-mark::after {
  content: "1";
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  position: absolute;
  right: -7px;
  bottom: -7px;
  border: 2px solid #fff;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  font-weight: 800;
}

.logo-mark span {
  font-size: 30px;
  font-weight: 900;
  line-height: 1;
}

.login-screen {
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(360px, 440px);
}

.login-intro {
  display: grid;
  align-content: center;
  gap: 24px;
  padding: 56px;
  background:
    linear-gradient(115deg, rgba(15, 118, 110, 0.9), rgba(37, 99, 235, 0.82)),
    repeating-linear-gradient(0deg, rgba(255,255,255,0.16) 0 1px, transparent 1px 32px),
    repeating-linear-gradient(90deg, rgba(255,255,255,0.14) 0 1px, transparent 1px 32px);
  color: #fff;
}

.login-copy {
  max-width: 650px;
}

.eyebrow {
  margin: 0 0 12px;
  color: rgba(255, 255, 255, 0.78);
  font-size: 14px;
  font-weight: 700;
}

h1,
h2,
h3,
p {
  margin-top: 0;
}

h1 {
  margin-bottom: 16px;
  font-size: clamp(36px, 6vw, 68px);
  line-height: 1.04;
  letter-spacing: 0;
}

.login-copy p:last-child {
  margin-bottom: 0;
  max-width: 52ch;
  color: rgba(255, 255, 255, 0.86);
  font-size: 18px;
  line-height: 1.8;
}

.login-panel {
  display: grid;
  align-content: center;
  padding: 42px;
  background: var(--surface);
}

.panel-heading {
  margin-bottom: 28px;
}

.panel-heading h2 {
  margin-bottom: 8px;
  font-size: 26px;
}

.panel-heading p {
  color: var(--muted);
  line-height: 1.7;
}

.form {
  display: grid;
  gap: 16px;
}

.field {
  display: grid;
  gap: 8px;
}

.field label {
  font-size: 14px;
  font-weight: 700;
}

.field input,
.field select {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
}

.field input:focus,
.field select:focus {
  outline: 3px solid rgba(15, 118, 110, 0.18);
  border-color: var(--primary);
}

.primary-button,
.secondary-button,
.danger-button {
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 0 16px;
  border-radius: 8px;
  font-weight: 800;
}

.primary-button {
  background: var(--primary);
  color: #fff;
}

.primary-button:hover {
  background: var(--primary-strong);
}

.secondary-button {
  border: 1px solid var(--border);
  background: #fff;
  color: var(--text);
}

.danger-button {
  border: 1px solid #fda29b;
  background: #fff;
  color: var(--danger);
}

.compact-button {
  min-height: 44px;
  padding: 0 12px;
  font-size: 13px;
}

.field-error {
  color: var(--danger);
  font-size: 13px;
  font-weight: 700;
}

.error-box,
.notice-box,
.warning-box {
  display: none;
  padding: 12px;
  border-radius: 8px;
  line-height: 1.6;
  font-size: 14px;
}

.error-box {
  border: 1px solid #fda29b;
  background: #fff1f0;
  color: var(--danger);
}

.notice-box {
  border: 1px solid #a7f3d0;
  background: #ecfdf3;
  color: #05603a;
}

.warning-box {
  border: 1px solid #f2c94c;
  background: #fff8db;
  color: #6b4f00;
}

.show {
  display: block;
}

.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 248px minmax(0, 1fr);
}

.sidebar {
  display: grid;
  grid-template-rows: auto 1fr auto;
  min-height: 100vh;
  padding: 22px;
  border-right: 1px solid var(--border);
  background: #111827;
  color: #fff;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-weight: 900;
}

.brand .logo-mark {
  width: 44px;
  height: 44px;
  margin: 0;
}

.brand .logo-mark span {
  font-size: 22px;
}

.nav {
  display: grid;
  align-content: start;
  gap: 8px;
  margin-top: 28px;
}

.nav-item {
  min-height: 44px;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.76);
  text-decoration: none;
}

a.nav-item:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
}

.nav-item[aria-disabled="true"] {
  justify-content: space-between;
  cursor: not-allowed;
}

.nav-status {
  padding: 2px 6px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  border-radius: 999px;
  font-size: 11px;
  font-weight: 800;
}

.nav-item.active {
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
}

.user-box {
  display: grid;
  gap: 10px;
  color: rgba(255, 255, 255, 0.72);
  font-size: 13px;
  overflow-wrap: anywhere;
}

.main {
  min-width: 0;
  padding: 28px;
}

.topbar {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 24px;
}

.topbar h1 {
  margin-bottom: 6px;
  font-size: 28px;
}

.topbar p {
  margin-bottom: 0;
  color: var(--muted);
}

.dashboard-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 360px;
  gap: 20px;
}

.section,
.workspace-form {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.section {
  overflow: hidden;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 18px 20px;
  border-bottom: 1px solid var(--border);
}

.section-header h3 {
  margin-bottom: 0;
  font-size: 17px;
}

.section-header h2 {
  margin-bottom: 0;
  font-size: 17px;
}

.workspace-selector {
  padding: 18px 20px 4px;
}

.table-scroll {
  overflow-x: auto;
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
}

.table th,
.table td {
  padding: 14px 20px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
}

.table th {
  color: var(--muted);
  font-size: 14px;
  font-weight: 800;
}

.table tr:last-child td {
  border-bottom: 0;
}

.workspace-name {
  font-weight: 800;
  overflow-wrap: anywhere;
}

.badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 8px;
  border-radius: 999px;
  background: var(--surface-strong);
  color: #344054;
  font-size: 12px;
  font-weight: 800;
}

.empty {
  padding: 36px 20px;
  color: var(--muted);
  text-align: center;
}

.workspace-form {
  padding: 20px;
}

.workspace-form h2 {
  margin-bottom: 8px;
}

.workspace-form p {
  color: var(--muted);
  line-height: 1.7;
}

.muted {
  color: var(--muted);
}

.join-code-section > .warning-box,
.join-code-section > .notice-box,
.join-code-section > .error-box,
.join-code-section > button,
.join-code-section > .muted {
  margin: 18px 20px;
}

#workspace-join-code {
  display: block;
  max-width: 100%;
  overflow-wrap: anywhere;
  padding: 8px;
  user-select: all;
  white-space: normal;
}

.context-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin: 12px 0 0;
}

.members-section {
  grid-column: 1 / -1;
}

.members-section > p,
.members-section > button,
.permission-note {
  margin: 18px 20px;
}

.member-header-actions,
.member-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}

.inline-select {
  min-height: 44px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
}

.member-add-form {
  display: grid;
  gap: 8px;
  padding: 20px;
  border-top: 1px solid var(--border);
}

.member-add-form h3,
.member-add-form p {
  margin-bottom: 0;
}

.member-add-grid {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) minmax(140px, 220px) auto;
  align-items: end;
  gap: 12px;
}


.nav-button {
  width: 100%;
  justify-content: flex-start;
  background: transparent;
  text-align: left;
}

.manual-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 380px);
  gap: 20px;
}

.manual-layout > .section,
.manual-layout > .workspace-form {
  min-width: 0;
}

.manual-list {
  display: grid;
  gap: 10px;
  padding: 16px;
}

.manual-list-item {
  width: 100%;
  min-height: 64px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
  text-align: left;
}

.manual-list-item:hover {
  border-color: var(--primary);
  background: #f0fdfa;
}

.manual-list-item-title {
  display: block;
  margin-bottom: 4px;
  font-weight: 800;
  overflow-wrap: anywhere;
}

.manual-form,
.manual-detail-form,
.manual-step-form {
  display: grid;
  gap: 14px;
}

.manual-form,
.manual-detail-form {
  padding: 20px;
}

.manual-form textarea,
.manual-detail-form textarea,
.manual-step-form textarea {
  min-height: 112px;
  resize: vertical;
}

.manual-detail-grid {
  display: grid;
  gap: 20px;
}

.manual-step-list {
  display: grid;
  gap: 14px;
  padding: 16px;
}

.manual-step-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  overflow: hidden;
}

.manual-step-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-strong);
}

.manual-step-card-header h3 {
  margin-bottom: 0;
  font-size: 16px;
  overflow-wrap: anywhere;
}

.manual-step-form,
.manual-step-view {
  padding: 16px;
}

.manual-step-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.manual-step-actions,
.manual-page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.manual-step-view dl {
  display: grid;
  grid-template-columns: minmax(110px, auto) minmax(0, 1fr);
  gap: 8px 14px;
  margin: 0;
}

.manual-step-view dt {
  color: var(--muted);
  font-weight: 800;
}

.manual-step-view dd {
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.manual-back-button {
  margin-bottom: 14px;
}

.manual-warning {
  margin: 16px 20px;
}

.manual-reading-preview {
  width: min(640px, calc(100% - 40px));
  max-width: 640px;
  max-height: calc(100vh - 40px);
  margin: auto;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: var(--shadow);
}

.manual-reading-preview::backdrop {
  background: rgba(22, 32, 51, 0.58);
}

.manual-reading-preview-panel {
  width: 100%;
  max-height: calc(100vh - 40px);
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  overflow: hidden;
}

.manual-reading-preview-panel > * {
  min-width: 0;
}

.manual-reading-preview-header,
.manual-reading-preview-footer {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  padding: 16px 20px;
}

.manual-reading-preview-header {
  border-bottom: 1px solid var(--border);
  background: var(--surface-strong);
}

.manual-reading-preview-header .eyebrow {
  color: var(--text);
}

.manual-reading-preview-header h2 {
  margin-bottom: 4px;
  overflow-wrap: anywhere;
}

.manual-reading-preview-content {
  overflow: auto;
  padding: 20px;
}

.manual-reading-preview-content h3,
.manual-reading-preview-content p {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.manual-reading-preview-description {
  margin-bottom: 20px;
  color: var(--muted);
}

.manual-reading-preview-steps {
  display: grid;
  gap: 12px;
}

.manual-reading-preview-step {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
}

.manual-reading-preview-step h3 {
  margin-bottom: 8px;
  font-size: 16px;
}

.manual-reading-preview-step dl {
  display: grid;
  grid-template-columns: minmax(90px, auto) minmax(0, 1fr);
  gap: 6px 12px;
  margin: 0;
}

.manual-reading-preview-step dt {
  color: var(--muted);
  font-weight: 800;
}

.manual-reading-preview-step dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.manual-reading-preview-footer {
  justify-content: flex-end;
  border-top: 1px solid var(--border);
}

@media (max-width: 900px) {
  .manual-layout,
  .manual-step-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .login-screen,
  .shell,
  .dashboard-grid {
    grid-template-columns: 1fr;
  }

  .login-intro,
  .login-panel,
  .main {
    padding: 24px;
  }

  .login-intro {
    min-height: 34vh;
  }

  .sidebar {
    min-height: auto;
    grid-template-rows: auto;
    gap: 18px;
  }

  .nav {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 0;
  }

  .topbar {
    display: grid;
  }

  .member-add-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .login-intro,
  .login-panel,
  .main,
  .sidebar {
    padding: 16px;
  }

  .nav {
    grid-template-columns: 1fr;
  }

  .topbar,
  .section-header {
    align-items: stretch;
  }

  .topbar > button,
  .member-header-actions > button {
    width: 100%;
  }

  .table th,
  .table td {
    padding: 12px;
  }

  .manual-reading-preview {
    width: calc(100% - 20px);
    max-height: calc(100vh - 20px);
  }

  .manual-reading-preview-panel {
    max-height: calc(100vh - 20px);
  }

  .manual-reading-preview-header,
  .manual-reading-preview-content,
  .manual-reading-preview-footer {
    padding: 14px;
  }
}

@media (forced-colors: active) {
  .logo-mark,
  .badge,
  .nav-item.active {
    border: 1px solid CanvasText;
  }
}
`;

export const APP_JS = `
const app = document.getElementById("app");
let currentSession = null;
let sessionGeneration = 0;
let sessionReloadSequence = 0;
let currentWorkspaceSelection = null;
let uncertainWorkspaceCreation = null;
let workspaceCreationInFlight = null;
let workspaceMembersState = null;
let workspaceMemberRequestSequence = 0;
let pendingWorkspaceMemberMutation = null;
let workspaceJoinCodeState = { status: "idle", joinCode: "", expiresAt: "", message: "" };

let currentScreen = "workspace";
let manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };
const manualCreateReconciliationByWorkspace = new Map();
let manualDetailState = { workspaceId: "", manualId: "", status: "idle", value: null, message: "", messageKind: "notice" };
let manualRequestSequence = 0;
let manualMutationInFlight = false;
let manualReadingPreview = null;

function manualMigrationInProgress(session = currentSession) {
  return session?.manuals?.status === "migration";
}
function memberMigrationInProgress(session = currentSession) {
  return session?.members?.status === "migration";
}
const manualStatusLabels = {
  draft: "ä¸‹æ›¸ã",
  reviewing: "ç¢ºèªä¸­",
  published: "å…¬é–‹æ¸ˆã¿",
  stale: "è¦æ›´æ–°",
  archived: "ã‚¢ãƒ¼ã‚«ã‚¤ãƒ–"
};
const manualStepTypeLabels = {
  action: "æ“ä½œ",
  note: "è£œè¶³",
  decision: "åˆ¤æ–­",
  warning: "æ³¨æ„"
};
const manualActionTypeLabels = {
  click: "ã‚¯ãƒªãƒƒã‚¯",
  input: "å…¥åŠ›",
  select: "é¸æŠž",
  navigate: "ç§»å‹•",
  wait: "å¾…æ©Ÿ",
  other: "ãã®ä»–"
};

function resetManualUiState() {
  closeManualReadingPreview(false);
  currentScreen = "workspace";
  manualsState = { workspaceId: "", status: "idle", items: [], message: "", messageKind: "notice" };
  manualCreateReconciliationByWorkspace.clear();
  manualDetailState = { workspaceId: "", manualId: "", status: "idle", value: null, message: "", messageKind: "notice" };
  manualRequestSequence += 1;
  manualMutationInFlight = false;
}

let pendingWorkspaceJoinCodeIssuance = null;
let workspaceJoinCodeExpiryTimer = null;
const currentWorkspaceStorageKey = "meccha-manual-current-workspace";
const uncertainWorkspaceStorageKey = "meccha-manual-uncertain-workspace";
const authenticationChannel = typeof BroadcastChannel === "function"
  ? new BroadcastChannel("meccha-manual-authentication")
  : null;
const authenticationVersionKey = "meccha-manual-authentication-version";
const workspaceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function replaceCurrentSession(nextSession) {
  if (currentSession?.user?.id && currentSession.user.id !== nextSession?.user?.id) {
    currentWorkspaceSelection = null;
    uncertainWorkspaceCreation = null;
    workspaceCreationInFlight = null;
    workspaceMembersState = null;
    workspaceMemberRequestSequence += 1;
    resetManualUiState();
    pendingWorkspaceMemberMutation = null;
    pendingWorkspaceJoinCodeIssuance = null;
    if (workspaceJoinCodeExpiryTimer !== null) clearTimeout(workspaceJoinCodeExpiryTimer);
    workspaceJoinCodeExpiryTimer = null;
    workspaceJoinCodeState = { status: "idle", joinCode: "", expiresAt: "", message: "" };
    try {
      sessionStorage.removeItem(currentWorkspaceStorageKey);
      sessionStorage.removeItem(uncertainWorkspaceStorageKey);
    } catch {
      // èªå¯ã¯ã‚µãƒ¼ãƒãƒ¼ã¨æœ€æ–°ä¸€è¦§ã§è¡Œã†ãŸã‚ã€å‰Šé™¤ä¸èƒ½ã§ã‚‚æ¨©é™å¢ƒç•Œã«ã¯ä½¿ã‚ãªã„ã€‚
    }
  }
  currentSession = nextSession;
  sessionGeneration += 1;
}

function restoreUncertainWorkspaceCreation(userId) {
  if (uncertainWorkspaceCreation?.userId === userId) return;
  try {
    const stored = JSON.parse(sessionStorage.getItem(uncertainWorkspaceStorageKey) || "null");
    if (stored?.userId === userId && typeof stored.slug === "string" && /^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(stored.slug)) {
      uncertainWorkspaceCreation = { userId, name: "", slug: stored.slug };
      return;
    }
    sessionStorage.removeItem(uncertainWorkspaceStorageKey);
  } catch {
    // ä¿å­˜å†…å®¹ã‚’èª­ã‚ãªã„å ´åˆã‚‚èªå¯ã¸åˆ©ç”¨ã›ãšã€ç¾åœ¨ã‚¿ãƒ–ã®ãƒ¡ãƒ¢ãƒªã ã‘ã‚’ä½¿ã†ã€‚
  }
}

function saveUncertainWorkspaceCreation(value) {
  uncertainWorkspaceCreation = value;
  try {
    sessionStorage.setItem(uncertainWorkspaceStorageKey, JSON.stringify({
      userId: value.userId,
      slug: value.slug
    }));
  } catch {
    // ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹åã¯ä¿å­˜ã›ãšã€ä¿å­˜ä¸èƒ½æ™‚ã¯ç¾åœ¨ãƒšãƒ¼ã‚¸å†…ã ã‘ã‚’å®‰å…¨å´ã§ãƒ­ãƒƒã‚¯ã™ã‚‹ã€‚
  }
}

function clearUncertainWorkspaceCreation() {
  uncertainWorkspaceCreation = null;
  try {
    sessionStorage.removeItem(uncertainWorkspaceStorageKey);
  } catch {
    // èªè¨¼ä¸»ä½“ã¨æœ€æ–°ä¸€è¦§ã®ç…§åˆã‚’å„ªå…ˆã™ã‚‹ã€‚
  }
}

function announceAuthenticationChange() {
  authenticationChannel?.postMessage({ type: "authentication-changed" });
}

function readAuthenticationVersion() {
  try {
    let version = localStorage.getItem(authenticationVersionKey);
    if (!version) {
      version = crypto.randomUUID();
    }
    localStorage.setItem(authenticationVersionKey, version);
    return version;
  } catch {
    throw new AppRequestError(
      "ã“ã®ãƒ–ãƒ©ã‚¦ã‚¶ã§ã¯å®‰å…¨ã«ãƒ­ã‚°ã‚¤ãƒ³çŠ¶æ…‹ã‚’å¤‰æ›´ã§ãã¾ã›ã‚“ã€‚æœ€æ–°ç‰ˆã®Chromeã§ãŠè©¦ã—ãã ã•ã„ã€‚",
      0,
      "AUTH_COORDINATION_UNAVAILABLE"
    );
  }
}

function advanceAuthenticationVersion() {
  try {
    localStorage.setItem(authenticationVersionKey, crypto.randomUUID());
  } catch {
    throw new AppRequestError(
      "ã“ã®ãƒ–ãƒ©ã‚¦ã‚¶ã§ã¯å®‰å…¨ã«ãƒ­ã‚°ã‚¤ãƒ³çŠ¶æ…‹ã‚’å¤‰æ›´ã§ãã¾ã›ã‚“ã€‚æœ€æ–°ç‰ˆã®Chromeã§ãŠè©¦ã—ãã ã•ã„ã€‚",
      0,
      "AUTH_COORDINATION_UNAVAILABLE"
    );
  }
}

function announceTerminalAuthenticationChange() {
  try {
    advanceAuthenticationVersion();
  } finally {
    announceAuthenticationChange();
  }
}

async function withAuthenticationLock(operation) {
  if (!navigator.locks?.request) {
    throw new AppRequestError(
      "ã“ã®ãƒ–ãƒ©ã‚¦ã‚¶ã§ã¯å®‰å…¨ã«ãƒ­ã‚°ã‚¤ãƒ³çŠ¶æ…‹ã‚’å¤‰æ›´ã§ãã¾ã›ã‚“ã€‚æœ€æ–°ç‰ˆã®Chromeã§ãŠè©¦ã—ãã ã•ã„ã€‚",
      0,
      "AUTH_LOCK_UNAVAILABLE"
    );
  }
  return navigator.locks.request("meccha-manual-authentication", { mode: "exclusive" }, operation);
}

async function loginWithAuthenticationLock(options) {
  return withAuthenticationLock(async () => {
    readAuthenticationVersion();
    const result = await requestJson("/api/auth/login", options, false);
    advanceAuthenticationVersion();
    announceAuthenticationChange();
    return result;
  });
}

function isReadRequest(options) {
  return !options.method || String(options.method).toUpperCase() === "GET";
}

function reconcileAuthenticationVersion(expectedVersion, options) {
  const currentVersion = readAuthenticationVersion();
  if (currentVersion === expectedVersion) return expectedVersion;
  if (isReadRequest(options)) return currentVersion;
  throw new AppRequestError(
    "ãƒ­ã‚°ã‚¤ãƒ³çŠ¶æ…‹ãŒåˆ¥ã®ã‚¿ãƒ–ã§å¤‰æ›´ã•ã‚ŒãŸãŸã‚ã€ã“ã®æ“ä½œã¯å®Ÿè¡Œã—ã¾ã›ã‚“ã§ã—ãŸã€‚ç”»é¢ã‚’ç¢ºèªã—ã¦ã€ã‚‚ã†ä¸€åº¦ãŠè©¦ã—ãã ã•ã„ã€‚",
    409,
    "AUTHENTICATION_CHANGED"
  );
}

async function retryAfterRefreshWithAuthenticationLock(expectedVersion, path, options) {
  return withAuthenticationLock(async () => {
    expectedVersion = reconcileAuthenticationVersion(expectedVersion, options);

    try {
      return await requestJsonOnce(path, options);
    } catch (error) {
      if (error.code !== "SESSION_REFRESH_REQUIRED") throw error;
    }

    expectedVersion = reconcileAuthenticationVersion(expectedVersion, options);
    try {
      await requestJson("/api/auth/refresh", { method: "POST", body: "{}" }, false);
    } catch (error) {
      if (isTerminalSessionError(error)) announceTerminalAuthenticationChange();
      throw error;
    }
    reconcileAuthenticationVersion(expectedVersion, options);
    return requestJsonOnce(path, options);
  });
}

async function logoutWithAuthenticationLock(expectedVersion) {
  return withAuthenticationLock(async () => {
    if (readAuthenticationVersion() !== expectedVersion) return false;
    advanceAuthenticationVersion();
    try {
      const logoutSent = await requestJson("/api/auth/logout", { method: "POST", body: "{}" }, false);
      announceAuthenticationChange();
      return logoutSent;
    } catch (error) {
      if (error.code === "LOGOUT_REVOKE_FAILED") announceAuthenticationChange();
      throw error;
    }
  });
}

function renderAuthenticationReload() {
  app.innerHTML =
    '<section id="screen-content" class="boot" tabindex="-1" role="status" aria-live="polite">' +
      '<div class="logo-mark" aria-hidden="true"><span>ã‚</span></div>' +
      '<p>ãƒ­ã‚°ã‚¤ãƒ³çŠ¶æ…‹ã‚’æ›´æ–°ã—ã¦ã„ã¾ã™</p>' +
    '</section>';
}

authenticationChannel?.addEventListener("message", (event) => {
  if (event.data?.type !== "authentication-changed") return;
  // æ¬¡ã®sessionã‚’å–å¾—ã™ã‚‹ã¾ã§ã¯åŒä¸€ãƒ¦ãƒ¼ã‚¶ãƒ¼ã®å†ãƒ­ã‚°ã‚¤ãƒ³ã‹åˆ¤å®šã§ããªã„ã€‚
  // è¡¨ç¤ºã¨é€²è¡Œä¸­å¿œç­”ã ã‘ã‚’ç„¡åŠ¹åŒ–ã—ã€ãƒ¦ãƒ¼ã‚¶ãƒ¼å›ºæœ‰ã®é¸æŠžãƒ»çµæžœä¸æ˜Žãƒ­ãƒƒã‚¯ã¯
  // replaceCurrentSessionã§ä¸»ä½“å¤‰æ›´ã‚’ç¢ºèªã§ããŸå ´åˆã«ã ã‘ç ´æ£„ã™ã‚‹ã€‚
  sessionGeneration += 1;
  sessionReloadSequence += 1;
  workspaceMemberRequestSequence += 1;
  manualRequestSequence += 1;
  if (pendingWorkspaceMemberMutation) pendingWorkspaceMemberMutation.authReconciled = false;
  if (pendingWorkspaceJoinCodeIssuance) pendingWorkspaceJoinCodeIssuance.authReconciled = false;
  renderAuthenticationReload();
  loadSession({ focusId: "workspace-heading" });
});

class AppRequestError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = "AppRequestError";
    this.status = status;
    this.code = code;
  }
}

const workspaceStatusLabels = {
  active: "åˆ©ç”¨ä¸­",
  suspended: "åœæ­¢ä¸­",
  deleted: "å‰Šé™¤æ¸ˆã¿"
};

const workspaceRoleLabels = {
  owner: "ç®¡ç†è²¬ä»»è€…",
  admin: "ç®¡ç†è€…",
  editor: "ç·¨é›†è€…",
  viewer: "é–²è¦§è€…"
};

const workspaceMemberStatusLabels = {
  active: "åˆ©ç”¨ä¸­",
  invited: "æ‹›å¾…ä¸­",
  removed: "åœæ­¢æ¸ˆã¿"
};

function resolveCurrentWorkspace(session) {
  const activeWorkspaces = (session.workspaces || []).filter((workspace) => workspace.status === "active");
  if (!session.user?.id || activeWorkspaces.length === 0) {
    currentWorkspaceSelection = null;
    try {
      sessionStorage.removeItem(currentWorkspaceStorageKey);
    } catch {
      // ä¿å­˜é ˜åŸŸãŒä½¿ãˆãªãã¦ã‚‚é¸æŠžã¯èªå¯ã«åˆ©ç”¨ã—ãªã„ã€‚
    }
    return null;
  }

  let storedSelection = null;
  try {
    storedSelection = JSON.parse(sessionStorage.getItem(currentWorkspaceStorageKey) || "null");
  } catch {
    storedSelection = null;
  }
  const memoryId = currentWorkspaceSelection?.userId === session.user.id
    ? currentWorkspaceSelection.workspaceId
    : null;
  const storedId = storedSelection?.userId === session.user.id ? storedSelection.workspaceId : null;
  const selected = activeWorkspaces.find((workspace) => workspace.id === memoryId) ||
    activeWorkspaces.find((workspace) => workspace.id === storedId) || activeWorkspaces[0];
  currentWorkspaceSelection = { userId: session.user.id, workspaceId: selected.id };
  try {
    sessionStorage.setItem(currentWorkspaceStorageKey, JSON.stringify({
      userId: session.user.id,
      workspaceId: selected.id
    }));
  } catch {
    // é¸æŠžã¯ã‚¿ãƒ–å†…ãƒ¡ãƒ¢ãƒªã§ã‚‚ç¶­æŒã§ãã‚‹ãŸã‚ã€ä¿å­˜ä¸èƒ½ã‚’ç”»é¢å…¨ä½“ã®å¤±æ•—ã«ã—ãªã„ã€‚
  }
  return selected;
}

function selectedActiveWorkspace() {
  const workspaceId = currentWorkspaceSelection?.workspaceId;
  if (!workspaceId) return null;
  return (currentSession?.workspaces || []).find(
    (workspace) => workspace.id === workspaceId && workspace.status === "active"
  ) || null;
}

function selectCurrentWorkspace(event) {
  const workspaceId = event.currentTarget.value;
  const selected = (currentSession?.workspaces || []).find(
    (workspace) => workspace.id === workspaceId && workspace.status === "active"
  );
  if (!selected || !currentSession?.user?.id) return;
  currentWorkspaceSelection = { userId: currentSession.user.id, workspaceId: selected.id };
  workspaceMembersState = null;
  workspaceMemberRequestSequence += 1;
  const pendingManualCreate = manualCreateReconciliationByWorkspace.get(selected.id);
  manualsState = {
    workspaceId: selected.id,
    status: "idle",
    items: [],
    message: pendingManualCreate?.message || "",
    messageKind: pendingManualCreate?.messageKind || "notice"
  };
  manualDetailState = { workspaceId: selected.id, manualId: "", status: "idle", value: null, message: "", messageKind: "notice" };
  manualRequestSequence += 1;
  try {
    sessionStorage.setItem(currentWorkspaceStorageKey, JSON.stringify({
      userId: currentSession.user.id,
      workspaceId: selected.id
    }));
  } catch {
    // ã‚¿ãƒ–å†…ãƒ¡ãƒ¢ãƒªã§ç¾åœ¨ç”»é¢ã¨å†æç”»å¾Œã®é¸æŠžã‚’ç¶­æŒã™ã‚‹ã€‚
  }
  renderShell(currentSession, "ç¾åœ¨ã®ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹ã‚’ã€Œ" + selected.name + "ã€ã«å¤‰æ›´ã—ã¾ã—ãŸã€‚");
  document.getElementById("current-workspace")?.focus();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setBox(id, message, kind, shouldFocus = true) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = message || "";
  box.className = kind === "notice" ? "notice-box show" : "error-box show";
  box.setAttribute("role", kind === "notice" ? "status" : "alert");
  box.setAttribute("aria-live", kind === "notice" ? "polite" : "assertive");
  box.setAttribute("aria-atomic", "true");
  if (kind !== "notice" && shouldFocus) box.focus();
}

function clearBox(id) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = "";
  box.className = box.className.includes("notice") ? "notice-box" : "error-box";
}

async function requestJsonOnce(path, options = {}) {
  let response;
  try {
    response = await fetch(path, {
      ...options,
      headers: {
        "content-type": "application/json",
        ...(options.headers || {})
      }
    });
  } catch {
    throw new AppRequestError(
      "ã‚µãƒ¼ãƒãƒ¼ã«æŽ¥ç¶šã§ãã¾ã›ã‚“ã§ã—ãŸã€‚é€šä¿¡ç’°å¢ƒã‚’ç¢ºèªã—ã¦ã€ã‚‚ã†ä¸€åº¦ãŠè©¦ã—ãã ã•ã„ã€‚",
      0,
      "NETWORK_ERROR"
    );
  }

  const responseMediaType = (response.headers.get("content-type") || "")
    .split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (responseMediaType !== "application/json") {
    throw new AppRequestError(
      "ã‚µãƒ¼ãƒãƒ¼ã‹ã‚‰æ­£ã—ã„å¿œç­”ã‚’å—ã‘å–ã‚Œã¾ã›ã‚“ã§ã—ãŸã€‚æ™‚é–“ã‚’ãŠã„ã¦ã€ã‚‚ã†ä¸€åº¦ãŠè©¦ã—ãã ã•ã„ã€‚",
      response.status,
      "INVALID_RESPONSE"
    );
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw new AppRequestError(
      "ã‚µãƒ¼ãƒãƒ¼ã‹ã‚‰æ­£ã—ã„å¿œç­”ã‚’å—ã‘å–ã‚Œã¾ã›ã‚“ã§ã—ãŸã€‚æ™‚é–“ã‚’ãŠã„ã¦ã€ã‚‚ã†ä¸€åº¦ãŠè©¦ã—ãã ã•ã„ã€‚",
      response.status,
      "INVALID_RESPONSE"
    );
  }
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new AppRequestError(
      "ã‚µãƒ¼ãƒãƒ¼ã‹ã‚‰æ­£ã—ã„å¿œç­”ã‚’å—ã‘å–ã‚Œã¾ã›ã‚“ã§ã—ãŸã€‚æ™‚é–“ã‚’ãŠã„ã¦ã€ã‚‚ã†ä¸€åº¦ãŠè©¦ã—ãã ã•ã„ã€‚",
      response.status,
      "INVALID_RESPONSE"
    );
  }
  if (!response.ok) {
    throw new AppRequestError(
      payload.message || "å‡¦ç†ã«å¤±æ•—ã—ã¾ã—ãŸã€‚",
      response.status,
      payload.code || "REQUEST_FAILED"
    );
  }
  return payload;
}

async function requestJson(path, options = {}, allowSessionRefresh = true) {
  let expectedVersion = null;
  let coordinationError = null;
  if (allowSessionRefresh) {
    try {
      expectedVersion = readAuthenticationVersion();
    } catch (error) {
      coordinationError = error;
    }
  }

  try {
    return await requestJsonOnce(path, options);
  } catch (error) {
    if (!allowSessionRefresh || error.code !== "SESSION_REFRESH_REQUIRED") throw error;
    if (coordinationError) throw coordinationError;
    return retryAfterRefreshWithAuthenticationLock(expectedVersion, path, options);
  }
}

const terminalSessionCodes = new Set([
  "SESSION_REQUIRED",
  "SESSION_INVALID",
  "SESSION_EXPIRED",
  "SESSION_REFRESH_INVALID"
]);

function isTerminalSessionError(error) {
  return error.status === 401 && terminalSessionCodes.has(error.code);
}

function validateLoginForm(form) {
  const email = form.elements.email;
  const password = form.elements.password;
  if (!email.value.trim()) return "ãƒ¡ãƒ¼ãƒ«ã‚¢ãƒ‰ãƒ¬ã‚¹ã‚’å…¥åŠ›ã—ã¦ãã ã•ã„ã€‚";
  if (email.validity.typeMismatch) {
    return "ãƒ¡ãƒ¼ãƒ«ã‚¢ãƒ‰ãƒ¬ã‚¹ã®å½¢å¼ã‚’ç¢ºèªã—ã¦ãã ã•ã„ã€‚";
  }
  if (!password.value) return "ãƒ‘ã‚¹ãƒ¯ãƒ¼ãƒ‰ã‚’å…¥åŠ›ã—ã¦ãã ã•ã„ã€‚";
  return "";
}

function clearLoginFieldError(field) {
  field.removeAttribute("aria-invalid");
  field.removeAttribute("aria-describedby");
}

function clearWorkspaceFieldError(field) {
  field?.removeAttribute?.("aria-invalid");
  const describedBy = field?.getAttribute?.("aria-describedby") || field?.["aria-describedby"] || "";
  const remaining = describedBy.split(/\\s+/).filter((id) => id && id !== "workspace-message").join(" ");
  if (remaining) field.setAttribute?.("aria-describedby", remaining);
  else field?.removeAttribute?.("aria-describedby");
}

function clearWorkspaceLimitMessage(message) {
  const box = document.getElementById("workspace-message");
  if (box?.textContent === message) clearBox("workspace-message");
}

function setWorkspaceLimitError(field, message) {
  clearWorkspaceFieldError(document.getElementById("workspace-name"));
  clearWorkspaceFieldError(document.getElementById("workspace-slug"));
  field.setAttribute?.("aria-invalid", "true");
  const describedBy = field.getAttribute?.("aria-describedby") || field["aria-describedby"] || "";
  field.setAttribute?.(
    "aria-describedby",
    [describedBy, "workspace-message"].filter(Boolean).join(" ")
  );
  setBox("workspace-message", message, "error", false);
}

function workspaceNameLength(value) {
  return Array.from(value).length;
}

function limitWorkspaceNameCodePoints(field) {
  const rawValue = String(field?.value || "");
  const normalizedValue = rawValue.trim();
  const codePoints = Array.from(normalizedValue);
  if (codePoints.length <= 64) return false;
  const leadingWhitespace = rawValue.match(/^\\s*/u)?.[0] || "";
  const trailingWhitespace = rawValue.match(/\\s*$/u)?.[0] || "";
  field.value = leadingWhitespace + codePoints.slice(0, 64).join("") + trailingWhitespace;
  setWorkspaceLimitError(field, "ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹åã¯64æ–‡å­—ä»¥å†…ã§å…¥åŠ›ã—ã¦ãã ã•ã„ã€‚");
  return true;
}

function limitWorkspaceSlugLength(field) {
  const rawValue = String(field?.value || "");
  const normalizedValue = rawValue.trim();
  if (normalizedValue.length <= 63) return false;
  const leadingWhitespace = rawValue.match(/^\\s*/u)?.[0] || "";
  const trailingWhitespace = rawValue.match(/\\s*$/u)?.[0] || "";
  field.value = leadingWhitespace + normalizedValue.slice(0, 63) + trailingWhitespace;
  setWorkspaceLimitError(field, "URLç”¨IDã¯63æ–‡å­—ä»¥å†…ã§å…¥åŠ›ã—ã¦ãã ã•ã„ã€‚");
  return true;
}

function validateWorkspaceForm(form) {
  const name = String(form.elements.name?.value || "").trim();
  const slug = String(form.elements.slug?.value || "").trim().toLowerCase();
  if (!name || workspaceNameLength(name) > 64) {
    return { field: form.elements.name, message: "ãƒ¯ãƒ¼ã‚¯ã‚¹ãƒšãƒ¼ã‚¹åã¯1ã€œ64æ–‡å­—ã§å…¥åŠ›ã—ã¦ãã ã•ã„ã€‚" };
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) {
    return { field: form.elements.slug, message: "URLç”¨IDã¯åŠè§’è‹±æ•°å­—ã¨ãƒã‚¤ãƒ•ãƒ³ã§3ã€œ63æ–‡å­—ã«ã—ã¦ãã ã•ã„ã€‚" };
  }
  return null;
}

function updateWorkspaceFieldErrors(form, validationError) {
  clearWorkspaceFieldError(form.elements.name);
  clearWorkspaceFieldError(form.elements.slug);
  if (!validationError) return;
  validationError.field?.setAttribute?.("aria-invalid", "true");
  const describedBy = validationError.field?.getAttribute?.("aria-describedby") || validationError.field?.["aria-describedby"] || "";
  validationError.field?.setAttribute?.(
    "aria-describedby",
    [describedBy, "workspace-message"].filter(Boolean).join(" ")
  );
}

function updateLoginFieldErrors(form, validationMessage) {
  const email = form.elements.email;
  const password = form.elements.password;
  clearLoginFieldError(email);
  clearLoginFieldError(password);
  if (!validationMessage) return;

  const invalidField = validationMessage.includes("ãƒ¡ãƒ¼ãƒ«ã‚¢ãƒ‰ãƒ¬ã‚¹") ? email : password;
  invalidField.setAttribute("aria-invalid", "true");
  invalidField.setAttribute("aria-describedby", "login-message");
}

function renderLogin(message = "") {
  app.innerHTML =
    '<section id="screen-content" class="login-screen" aria-labelledby="service-title" tabindex="-1">' +
      '<div class="login-intro">' +
        '<div class="login-copy">' +
          '<div class="logo-mark" aria-hidden="true"><span>ã‚</span></div>' +
          '<p class="eyebrow">æ—¥æœ¬ã®ã‚ªãƒ•ã‚£ã‚¹ãƒ¯ãƒ¼ã‚«ãƒ¼å°‚ç”¨</p>' +
          '<h1 id="service-title">ã‚ã£ã¡ã‚ƒãƒžãƒ‹ãƒ¥ã‚¢ãƒ«</h1>' +
          '<p>æ¥­å‹™ã®æ‰‹é †ã‚’ã‚ã‹ã‚Šã‚„ã™ãæ•´ç†ã—ã€ãƒãƒ¼ãƒ ã§å…±æœ‰ã™ã‚‹ãŸã‚ã®ã‚µãƒ¼ãƒ“ã‚¹ã§ã™ã€‚</p>' +
        '</div>' +
      '</div>' +
      '<div class="login-panel">' +
        '<div class="panel-heading">' +
          '<h2>ãƒ­ã‚°ã‚¤ãƒ³</h2>' +
          '<p>ç™»éŒ²æ¸ˆã¿ã®ãƒ¡ãƒ¼ãƒ«ã‚¢ãƒ‰ãƒ¬ã‚¹ã¨ãƒ‘ã‚¹ãƒ¯ãƒ¼ãƒ‰ã‚’å…¥åŠ›ã—ã¦ãã ã•ã„ã€‚</p>' +
        '</div>' +
        '<form id="login-form" class="form" novalidate>' +
          '<div id="login-message" class="error-box' + (message ? ' show' : '') + '" role="alert" aria-live="assertive" aria-atomic="true" tabindex="-1">' + escapeHtml(message) + '</div>' +
          '<div class="field">' +
            '<label for="email">ãƒ¡ãƒ¼ãƒ«ã‚¢ãƒ‰ãƒ¬ã‚¹</label>' +
            '<input id="email" name="email" type="email" autocomplete="email" maxlength="254" required>' +
          '</div>' +
          '<div class="field">' +
            '<label for="password">ãƒ‘ã‚¹ãƒ¯ãƒ¼ãƒ‰</label>' +
            '<input id="password" name="password" type="password" autocomplete="current-password" required>' +
          '</div>' +
          '<button class="primary-button" type="submit">ãƒ­ã‚°ã‚¤ãƒ³</button>' +
        '</form>' +
      '</div>' +
    '</section>';

  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    clearBox("login-message");
    const button = event.currentTarget.querySelector("button");
    const validationMessage = validateLoginForm(event.currentTarget);
    updateLoginFieldErrors(event.currentTarget, validationMessage);
    if (validationMessage) {
      setBox("login-message", validationMessage, "error");
      return;
    }
    button.disabled = true;
    button.textContent = "ãƒ­ã‚°ã‚¤ãƒ³ä¸­";
    event.currentTarget.setAttribute("aria-busy", "true");
    try {
      const form = new FormData(event.currentTarget);
      await loginWithAuthenticationLock({
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password")
        })
      });
      await loadSession({ focusId: "workspace-heading" });
    } catch (error) {
      setBox("login-message", error.message, "error");
    } finally {
      button.disabled = false;
      button.textContent = "ãƒ­ã‚°ã‚¤ãƒ³";
      event.currentTarget.removeAttribute("aria-busy");
    }
  });
  for (const field of [document.getElementById("email"), document.getElementById("password")]) {
    field.addEventListener("input", () => clearLoginFieldError(field));
  }
  if (message) {
    document.getElementById("login-message").focus();
  } else {
    document.getElementById("email").focus();
  }
}

function renderLoadFailure(title, message) {
  app.innerHTML =
    '<section id="screen-content" class="boot" role="alert" aria-live="assertive" tabindex="-1">' +
      '<div class="logo-mark" aria-hidden="true"><span>ã‚</span></div>' +
      '<h1>' + escapeHtml(title) + '</h1>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<button id="retry-button" class="primary-button" type="button">ã‚‚ã†ä¸€åº¦èª­ã¿è¾¼ã‚€</button>' +
    '</section>';
  const retryButton = document.getElementById("retry-button");
  retryButton.addEventListener("click", async () => {
    retryButton.disabled = true;
    retryButton.textContent = "èª­ã¿è¾¼ã¿ä¸­";
    retryButton.setAttribute("aria-busy", "true");
    await loadSession({ focusId: "workspace-heading" });
  });
  retryButton.focus();
}

function prepareWorkspaceMembersState(session, currentWorkspace) {
  if (!session.user?.id || !currentWorkspace) {
    workspaceMembersState = null;
    return false;
  }
  if (
    workspaceMembersState?.userId === session.user.id &&
    workspaceMembersState.workspaceId === currentWorkspace.id
  ) {
    return false;
  }
  workspaceMembersState = {
    userId: session.user.id,
    workspaceId: currentWorkspace.id,
    status: "idle",
    currentUserRole: null,
    members: [],
    message: "",
    addDraftJoinCode: "",
    addJoinCodeError: ""
  };
  return true;
}

function validWorkspaceMembersPayload(payload, workspaceId) {
  const validRoles = new Set(["owner", "admin", "editor", "viewer"]);
  const validStatuses = new Set(["active", "invited", "removed"]);
  return payload?.workspaceId === workspaceId &&
    validRoles.has(payload.currentUserRole) &&
    Array.isArray(payload.members) &&
    payload.members.length <= 1000 &&
    new Set(payload.members.map((member) => member?.userId)).size === payload.members.length &&
    payload.members.every((member) =>
      member && workspaceIdPattern.test(member.userId) &&
      typeof member.displayName === "string" && member.displayName.trim() &&
      validRoles.has(member.role) && validStatuses.has(member.status) &&
      (member.joinenxÛ¾-¢G§²ÚîÆ­yÜ™ÙXX›HOOH[™Yš[™YBˆÈº*"9ë¥ù.+HƒBˆˆ‹›Y\™ÙXX›HÈ¹cëú ïHˆˆ¹.#ycëÈŽÃBˆÛÛœÝÚXÚÔÝ]HHÝ]\ÏËœÝ]H¹§*¹cå¹o¥ÈŽÃBˆÛÛœÝÝ[ÚXÚÜÈH\[ÙˆÝ]\ÏËÝ[ØÛÝ[OOH›[X™\ˆˆÈ	ÜÝ]\ËÝ[ØÛÝ[y.í˜ˆ¹.#y¦#ˆŽÃBƒBˆ™]\›ˆÃBˆˆÉÜ‹›[X™\ŸNˆ	Ü‹]H¹á(zhcŸXBˆ‹š[Ý\›ˆ‹Bˆˆ‹BˆH9â­¹¡bÎˆ	Ü‹œÝ]H¹.#y¦#ˆŸIÜ‹™˜YÈˆÈ˜YˆˆˆŸIÜ‹›Y\™ÙYÈˆÈY\™ÙYˆˆˆŸXBˆH˜\ÙNˆ	Ü‹˜˜\ÙOËœ™Yˆ¹.#y¦#ˆŸXBˆHXYˆ	Ü‹šXYËœ™Yˆ¹.#y¦#ˆŸXBˆHY\™ÙXX›Nˆ	ÛY\™ÙXX›SX™[XBˆHÚXÚÜÎˆ	ØÚXÚÔÝ]_H
	ÝÝ[ÚXÚÜßJXBˆˆ‹Bˆ‹›Y\™ÙYBˆÈ¸àdøàk”¸àkøàfxàiøàjÛY\™Ùy®"8àoøàiøàfxà ˆƒBˆˆ¹k§ÛY\™ÙxàkÑÚ]X¹."¸àk¹oázh"ÚXÚøà xàë8àäøàéxàï8à [ÝÛ™\¹¢oú*£xà¤¹è®º*£xàeøài¸àbøà¢z(c8àa8ào¸àfxà ˆƒBˆK™š[\Š›ÛÛX[ŠKš›Ú[Š—ˆŠNÃBŸCBƒB™[˜Ý[Ûˆ\ØÛÜ™™\]Y\Ý\Š[\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[ÛŠNˆÈYˆÝš[™ÎÈ˜[YNˆÝš[™ÈHÃBˆÛÛœÝ\Ù\ˆH[\˜XÝ[Û‹›Y[X™\Ë\Ù\ˆÏÈ[\˜XÝ[Û‹\Ù\ŽÃBˆ™]\›ˆÃBˆYˆ\Ù\ËšY[šÛ›ÝÛˆ‹Bˆ˜[YNˆ\Ù\Ë™ÛØ˜[Û˜[YH\Ù\Ë\Ù\›˜[YH[šÛ›ÝÛˆƒBˆNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆYÚ]X”“X™[Ê[Žˆ[‹ÝÛ™\ŽˆÝš[™Ë™\ÎˆÝš[™Ë[X™\Žˆ[X™\‹X™[ÎˆÝš[™Ö×JNˆ›ÛZ\ÙO›ÛÛX[ˆÃBˆžHÃBˆ]ØZ]Ú]X\OÈX™[ÏÎˆ[šÛ›ÝÛ–×HOŠBˆ[‹BˆÜ™\ÜËÉÛÝÛ™\ŸKÉÜ™\ßKÚ\ÜÝY\ËÉÛ[X™\ŸKÛX™[ØBˆÃBˆY]Ùˆ”ÔÕ‹Bˆ›ÙNˆ”ÓÓ‹œÝš[™ÚYžJÈX™[ÈJCBˆKBˆYCBˆ
NÃBˆ™]\›ˆYNÃBˆHØ]ÚÃBˆ™]\›ˆ˜[ÙNÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÜ™X]QÚ]X”ÛÛ[Y[
[Žˆ[‹ÝÛ™\ŽˆÝš[™Ë™\ÎˆÝš[™Ë[X™\Žˆ[X™\‹›ÙNˆÝš[™ÊNˆ›ÛZ\ÙO›ÚYˆÃBˆ]ØZ]Ú]X\OÈ[Ý\›ÎˆÝš[™ÈOŠBˆ[‹BˆÜ™\ÜËÉÛÝÛ™\ŸKÉÜ™\ßKÚ\ÜÝY\ËÉÛ[X™\ŸKØÛÛ[Y[ØBˆÃBˆY]Ùˆ”ÔÕ‹Bˆ›ÙNˆ”ÓÓ‹œÝš[™ÚYžJÈ›ÙHJCBˆKBˆYCBˆ
NÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™\]Y\ÝÚ]X”“Y\™ÙJ[Žˆ[‹[\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[Û‹XÝ[ÛŽˆÚ]X”XÝ[Û‹ŽˆÚ]X”[™\]Y\Ý™\ÜÛœÙJNˆ›ÛZ\ÙOÝš[™ÏˆÃBˆÛÛœÝÈÝÛ™\‹™\ÈHH\ÜÙ\”™\ÜÚ]ÜžP[ÝÙY
[‹XÝ[ÛŠNÃBˆÛÛœÝ™\]Y\Ý\ˆH\ØÛÜ™™\]Y\Ý\Š[\˜XÝ[ÛŠNÃBˆÛÛœÝX™[\YYH]ØZ]YÚ]X”“X™[Ê[‹ÝÛ™\‹™\ËXÝ[Û‹›[X™\‹ÑÒUP—ÓQT‘ÑWÔ‘TUQTÕÓP‘SJNÃBˆÛÛœÝÛÛ[Y[›ÙHHÃBˆ‘\ØÛÜ™8àbøà¢xàç¸àï8à®9/§zh/8àc:*&:c,¸àexà£8ào¸àeøàgøà ˆ‹Bˆˆ‹BˆˆÈÈ™\]Y\Ý\ˆ‹Bˆˆ‹BˆH\ØÛÜ™Ý\Ù\Žˆ	Ü™\]Y\Ý\‹›˜[Y_XBˆH\ØÛÜ™Ý\Ù\—ÚYˆ	Ü™\]Y\Ý\‹šYXBˆHÝZ[ÚYˆ	Ú[\˜XÝ[Û‹™ÝZ[ÚYÏÈ[šÛ›ÝÛˆŸXBˆHÚ[›™[ÚYˆ	Ú[\˜XÝ[Û‹˜Ú[›™[ÚYÏÈ[šÛ›ÝÛˆŸXBˆH[\˜XÝ[Û—ÚYˆ	Ú[\˜XÝ[Û‹šYÏÈ[šÛ›ÝÛˆŸXBˆˆ‹BˆˆÈÈ[\È‹Bˆˆ‹Bˆ‹H8àdøàk¸à¬øàèxàìøàâ8àkÛY\™Ùy/§zh/8àkº*&:c,¸àiøà`¸à¢¸à Q\ØÛÜ™8àç8à¯øàìøàh8àdxàiøàkÛY\™Ùxàeøào¸àføà¤øà ˆ‹Bˆ‹HÚ]X¹."¸àiùoázh"ÚXÚøà XÛÛ™›XÝ8à Y˜Y8à xàë8àäøàéxàï8à [ÝÛ™\¹¢oú*£xà¤¹è®º*£xàeøài¸àbøà¢[Y\™Ùxàeøào¸àfxà ˆƒBˆKš›Ú[Š—ˆŠNÃBƒBˆ]ØZ]Ü™X]QÚ]X”ÛÛ[Y[
[‹ÝÛ™\‹™\ËXÝ[Û‹›[X™\‹ÛÛ[Y[›ÙJNÃBƒBˆ™]\›ˆÃBˆˆÉÜ‹›[X™\ŸH8àjøàç¸àï8à®9/§zh/8à¤º*&:c,¸àeøào¸àeøàgøà ˜Bˆ‹š[Ý\›ˆ‹BˆX™[\YYBˆÈ	ÑÒUP—ÓQT‘ÑWÔ‘TUQTÕÓP‘SWX™[8à¤¹.æ8àdxào¸àeøàgøà ˜Bˆˆ	ÑÒUP—ÓQT‘ÑWÔ‘TUQTÕÓP‘SWX™[9.æ9.#¸àkùi,y¥eøàeøào¸àeøàgøàc8à T¸à¬øàèxàìøàâ8àkù«¢øàeøào¸àeøàgøà ˜Bˆ¹k§ÛY\™ÙxàkÑÚ]X¹."¸àiùè®º*£xàeøài¸àbøà¢z(c8àa8ào¸àfxà ˆƒBˆK™š[\Š›ÛÛX[ŠKš›Ú[Š—ˆŠNÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ›ØÙ\ÜÑ\ØÛÜ™ÛÛ\Û™[
[Žˆ[‹[\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[ÛŠNˆ›ÛZ\ÙO›ÚYˆÃBˆÛÛœÝXÝ[ÛˆH\œÙQÚ]X”XÝ[ÛŠ[\˜XÝ[Û‹™]OË˜Ý\ÝÛWÚY
NÃBˆÛÛœÝ^\Ý[™ÈH]ØZ]™\Ù\™Q\ØÛÜ™[\˜XÝ[ÛŠ[‹[\˜XÝ[Û‹šYÏÈ[
NÃBƒBˆYˆ
^\Ý[™ÈOOHœ[™[™ÈŠHÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙTØY™J[\˜XÝ[Û‹•\È\ØÛÜ™™\]Y\Ý\È[™XYH™Z[™È›ØÙ\ÜÙYˆŠNÃBˆ™]\›ŽÃBˆCBƒBˆYˆ
^\Ý[™È	‰ˆ^\Ý[™ÈOOH™˜Z[YŠHÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙTØY™J[\˜XÝ[Û‹^\Ý[™ÊNÃBˆ™]\›ŽÃBˆCBƒBˆžHÃBˆÛÛœÝˆH]ØZ]™]ÚÚ]X”[™\]Y\Ý
[‹XÝ[ÛŠNÃBƒBˆYˆ
XÝ[Û‹šÚ[™OOHœÝ]\ÈŠHÃBˆÛÛœÝÈÝÛ™\‹™\ÈHH\ÜÙ\”™\ÜÚ]ÜžP[ÝÙY
[‹XÝ[ÛŠNÃBˆÛÛœÝÝ]\ÈH]ØZ]™]ÚÚ]XÛÛXš[™YÝ]\Ê[‹ÝÛ™\‹™\Ë‹šXYËœÚJNÃBˆÛÛœÝY\ÜØYÙHHÚ]X””Ý]\Õ^
‹Ý]\ÊNÃBˆ]ØZ]ÛÛ\]Q\ØÛÜ™[\˜XÝ[ÛŠ[‹[\˜XÝ[Û‹šYÏÈ[Y\ÜØYÙJNÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙJ[\˜XÝ[Û‹Y\ÜØYÙJNÃBˆ™]\›ŽÃBˆCBƒBˆÛÛœÝY\ÜØYÙHH]ØZ]™\]Y\ÝÚ]X”“Y\™ÙJ[‹[\˜XÝ[Û‹XÝ[Û‹ŠNÃBˆ]ØZ]ÛÛ\]Q\ØÛÜ™[\˜XÝ[ÛŠ[‹[\˜XÝ[Û‹šYÏÈ[Y\ÜØYÙJNÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙJ[\˜XÝ[Û‹Y\ÜØYÙJNÃBˆHØ]Ú
\œ›ÜŠHÃBˆ]ØZ]ÛÛ\]Q\ØÛÜ™[\˜XÝ[ÛŠ[‹[\˜XÝ[Û‹šYÏÈ[™˜Z[YŠNÃBˆ›ÝÈ\œ›ÜŽÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™XY\ØÛÜ™›ÙJ™\]Y\Ýˆ™\]Y\Ý
Nˆ›ÛZ\ÙOÝš[™ÏˆÃBˆ™]\›ˆ™XY›ÙU^[Z]Y
Bˆ™\]Y\ÝBˆPVÑTÐÓÔ‘Ð“ÑWÐ–UTËBˆ‘TÐÓÔ‘Ð“ÑWÕÓ×ÓT‘ÑH‹Bˆ‘\ØÛÜ™™\]Y\Ý›ÙH\ÈÛÈ\™ÙKˆƒBˆ
NÃBŸCBƒB™[˜Ý[Ûˆ[\˜XÝ[Û”™\^RÙ^J[\˜XÝ[Û’YˆÝš[™ÊNˆÝš[™ÈÃBˆ™]\›ˆ\ØÛÜ™Z[\˜XÝ[ÛŽ‰Ú[\˜XÝ[Û’YXÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™\Ù\™Q\ØÛÜ™[\˜XÝ[ÛŠ[Žˆ[‹[\˜XÝ[Û’YˆÝš[™È[
Nˆ›ÛZ\ÙOÝš[™È[ˆÃBˆYˆ
Z[\˜XÝ[Û’Y
H™]\›ˆ[ÃBƒBˆÛÛœÝÝÜ™HH™\]Z\™Q\ØÛÜ™[\˜XÝ[Û”ÝÜ™J[ŠNÃBˆÛÛœÝÙ^HH[\˜XÝ[Û”™\^RÙ^J[\˜XÝ[Û’Y
NÃBˆÛÛœÝ^\Ý[™ÈH]ØZ]ÝÜ™K™Ù]
Ù^JNÃBˆYˆ
^\Ý[™ÊH™]\›ˆ^\Ý[™ÎÃBƒBˆ]ØZ]ÝÜ™Kœ]
Ù^Kœ[™[™È‹È^\˜][Û•ˆTÐÓÔ‘Ô‘TVWÕÔÑPÓÓ‘ÈJNÃBˆ™]\›ˆ[ÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÛÛ\]Q\ØÛÜ™[\˜XÝ[ÛŠ[Žˆ[‹[\˜XÝ[Û’YˆÝš[™È[˜[YNˆÝš[™ÊNˆ›ÛZ\ÙO›ÚYˆÃBˆYˆ
Z[\˜XÝ[Û’Y
H™]\›ŽÃBƒBˆÛÛœÝÝÜ™HH™\]Z\™Q\ØÛÜ™[\˜XÝ[Û”ÝÜ™J[ŠNÃBˆ]ØZ]ÝÜ™Kœ]
[\˜XÝ[Û”™\^RÙ^J[\˜XÝ[Û’Y
K˜[YKÈ^\˜][Û•ˆTÐÓÔ‘Ô‘TVWÕÔÑPÓÓ‘ÈJNÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙJ[\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[Û‹ÛÛ[ˆÝš[™ÊNˆ›ÛZ\ÙO›ÚYˆÃBˆYˆ
Z[\˜XÝ[Û‹˜\XØ][Û—ÚYZ[\˜XÝ[Û‹ÚÙ[ŠHÃBˆ›ÝÈ™]È\\œ›ÜŠL‘TÐÓÔ‘Ñ“ÓÕÕTÐÓÓ•VÓRTÔÒS‘È‹‘\ØÛÜ™›ÛÝÝ\ÛÛ^\ÈZ\ÜÚ[™ËˆŠNÃBˆCBƒBˆÛÛœÝ™\ÜÛœÙHH]ØZ]™]Ú
BˆÎ‹ËÙ\ØÛÜ™˜ÛÛKØ\KÝŒLÝÙXšÛÚÜËÉÚ[\˜XÝ[Û‹˜\XØ][Û—ÚYKÉÚ[\˜XÝ[Û‹ÚÙ[ŸKÛY\ÜØYÙ\ËÐÜšYÚ[˜[BˆÃBˆY]Ùˆ”UÒ‹BˆXY\œÎˆÃBˆ˜ÛÛ[]\HŽˆ˜\XØ][Û‹ÚœÛÛˆƒBˆKBˆ›ÙNˆ”ÓÓ‹œÝš[™ÚYžJÈÛÛ[JCBˆCBˆ
NÃBƒBˆYˆ
\™\ÜÛœÙK›ÚÊHÃBˆ›ÝÈ™]È\\œ›ÜŠ™\ÜÛœÙKœÝ]\Ë‘TÐÓÔ‘Ñ“ÓÕÕTÑRSQ‹‘\ØÛÜ™›ÛÝÝ\˜Z[YˆŠNÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ›ØÙ\ÜÑ\ØÛÜ™\ÚÊ[Žˆ[‹[\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[Û‹ÛÛ[X[™ˆ\ØÛÜ™\ÚÐÛÛ[X[™
Nˆ›ÛZ\ÙO›ÚYˆÃBˆžHÃBˆÛÛœÝ\ÜÝYU\›H]ØZ]Ü™X]QÚ]X’\ÜÝYJ[‹ÛÛ[X[™
NÃBˆ]ØZ]ÛÛ\]Q\ØÛÜ™[\˜XÝ[ÛŠ[‹ÛÛ[X[™š[\˜XÝ[Û’Y\ÜÝYU\›
NÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙJ[\˜XÝ[Û‹Ú]Xˆ\ÜÝYHÜ™X]Yˆ	Ú\ÜÝYU\›X
NÃBˆHØ]ÚÃBˆ]ØZ]ÛÛ\]Q\ØÛÜ™[\˜XÝ[ÛŠ[‹ÛÛ[X[™š[\˜XÝ[Û’Y™˜Z[YŠNÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙJ[\˜XÝ[Û‹‘˜Z[YÈÜ™X]HÚ]Xˆ\ÜÝYKˆÚXÚÈÛÜšÙ\ˆÙÜËˆŠNÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙTØY™J[\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[Û‹ÛÛ[ˆÝš[™ÊNˆ›ÛZ\ÙO›ÚYˆÃBˆžHÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙJ[\˜XÝ[Û‹ÛÛ[
NÃBˆHØ]ÚÃBˆËÈ\ØÛÜ™›ÛÝÝ\˜Z[\™\ÈÚÝ[›ÝXZÙHH[š]X[[\˜XÝ[Ûˆ[Y[Ý]ƒBˆCBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ›ØÙ\ÜÑ\ØÛÜ™[\˜XÝ[ÛŠ[Žˆ[‹[\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[ÛŠNˆ›ÛZ\ÙO›ÚYˆÃBˆžHÃBˆ\ÜÙ\\ØÛÜ™[ÝÙY
[\˜XÝ[Û‹[ŠNÃBƒBˆYˆ
[\˜XÝ[Û‹\HOOHTÐÓÔ‘ÒS•TPÕSÓ—ÕTWÓQTÔÐQÑWÐÓÓTÓ‘S•
HÃBˆ]ØZ]›ØÙ\ÜÑ\ØÛÜ™ÛÛ\Û™[
[‹[\˜XÝ[ÛŠNÃBˆ™]\›ŽÃBˆCBƒBˆÛÛœÝÛÛ[X[™H\œÙQ\ØÛÜ™\ÚÐÛÛ[X[™
[\˜XÝ[ÛŠNÃBˆÛÛœÝ^\Ý[™ÈH]ØZ]™\Ù\™Q\ØÛÜ™[\˜XÝ[ÛŠ[‹ÛÛ[X[™š[\˜XÝ[Û’Y
NÃBƒBˆYˆ
^\Ý[™ÈOOHœ[™[™ÈŠHÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙTØY™J[\˜XÝ[Û‹•\È\ØÛÜ™™\]Y\Ý\È[™XYH™Z[™È›ØÙ\ÜÙYˆŠNÃBˆ™]\›ŽÃBˆCBƒBˆYˆ
^\Ý[™È	‰ˆ^\Ý[™ÈOOH™˜Z[YŠHÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙTØY™J[\˜XÝ[Û‹Ú]Xˆ\ÜÝYH[™XYH^\ÝÎˆ	Ù^\Ý[™ßX
NÃBˆ™]\›ŽÃBˆCBƒBˆ]ØZ]›ØÙ\ÜÑ\ØÛÜ™\ÚÊ[‹[\˜XÝ[Û‹ÛÛ[X[™
NÃBˆHØ]Ú
\œ›ÜŠHÃBˆÛÛœÝY\ÜØYÙHH\œ›Üˆ[œÝ[˜Ù[Ùˆ\\œ›Üˆ	‰ˆ\œ›Ü‹œÝ]\ÈLBˆÈ\œ›Ü‹›Y\ÜØYÙCBˆˆ‘˜Z[YÈ›ØÙ\ÜÈ\ØÛÜ™™\]Y\ÝˆÚXÚÈÛÜšÙ\ˆÙÜËˆŽÃBˆ]ØZ]\]Q\ØÛÜ™ÜšYÚ[˜[™\ÜÛœÙTØY™J[\˜XÝ[Û‹Y\ÜØYÙJNÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ\ØÛÜ™[\˜XÝ[ÛœÊ™\]Y\Ýˆ™\]Y\Ý[Žˆ[‹ÝÎˆ^XÝ][ÛÛÛ^
Nˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕŠHÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈÛÙNˆ“QUÑÓ“ÕÐSÕÑQˆKÈÝ]\ÎˆHJNÃBˆCBƒBˆÛÛœÝ›ÙU^H]ØZ]™XY\ØÛÜ™›ÙJ™\]Y\Ý
NÃBˆ]ØZ]™\šYžQ\ØÛÜ™ÚYÛ˜]\™J™\]Y\Ý[‹›ÙU^
NÃBƒBˆ][\˜XÝ[ÛŽˆ\ØÛÜ™[\˜XÝ[ÛŽÃBˆžHÃBˆ[\˜XÝ[ÛˆH”ÓÓ‹œ\œÙJ›ÙU^
H\È\ØÛÜ™[\˜XÝ[ÛŽÃBˆHØ]ÚÃBˆ™]\›ˆ\ØÛÜ™™\ÜÛœÙJ’[˜[Y\ØÛÜ™™\]Y\Ý›ÙKˆ‹
NÃBˆCBˆYˆ
[\˜XÝ[Û‹\HOOHTÐÓÔ‘ÒS•TPÕSÓ—ÕTWÔS‘ÊHÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈ\NˆTÐÓÔ‘Ô‘TÔÓ”ÑWÕTWÔÓ‘ÈJNÃBˆCBƒBˆYˆ
Bˆ[\˜XÝ[Û‹\HOOHTÐÓÔ‘ÒS•TPÕSÓ—ÕTWÐTPÐUSÓ—ÐÓÓSPS‘	‰ƒBˆ[\˜XÝ[Û‹\HOOHTÐÓÔ‘ÒS•TPÕSÓ—ÕTWÓQTÔÐQÑWÐÓÓTÓ‘S•Bˆ
HÃBˆ™]\›ˆ\ØÛÜ™™\ÜÛœÙJ•[œÝ\ÜY\ØÛÜ™[\˜XÝ[Ûˆ\Kˆ‹
NÃBˆCBƒBˆYˆ
XÝ
HÃBˆ]ØZ]›ØÙ\ÜÑ\ØÛÜ™[\˜XÝ[ÛŠ[‹[\˜XÝ[ÛŠNÃBˆ™]\›ˆ\ØÛÜ™™\ÜÛœÙJ‘\ØÛÜ™™\]Y\Ý›ØÙ\ÜÚ[™Èš[š\ÚYˆŠNÃBˆCBƒBˆÝØZ][[
›ØÙ\ÜÑ\ØÛÜ™[\˜XÝ[ÛŠ[‹[\˜XÝ[ÛŠJNÃBˆ™]\›ˆ\ØÛÜ™Y™\œ™Y™\ÜÛœÙJ
NÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙNˆ™\ÜÛœÙKX^ž]\ÈHPVÔÕTPTÑWÒ”ÓÓ—Ð–UTÊNˆ›ÛZ\ÙO[šÛ›ÝÛˆÃBˆÛÛœÝÛÛ[[™ÝH™\ÜÛœÙKšXY\œË™Ù]
˜ÛÛ[[[™ÝŠNÃBˆYˆ
ÛÛ[[™Ý	‰ˆ[X™\ŠÛÛ[[™Ý
HˆX^ž]\ÊHÃBˆ›ÝÈ™]È\œ›ÜŠ”Ý\X˜\ÙH™\ÜÛœÙH›ÙH\ÈÛÈ\™ÙKˆŠNÃBˆCBˆYˆ
\™\ÜÛœÙK˜›ÙJH™]\›ˆ[ÃBƒBˆÛÛœÝ™XY\ˆH™\ÜÛœÙK˜›ÙK™Ù]™XY\Š
NÃBˆÛÛœÝÚ[šÜÎˆZ[\œ˜^V×HH×NÃBˆ]Ý[ž]\ÈHÃBˆžHÃBˆÚ[H
YJHÃBˆÛÛœÝÈÛ™K˜[YHHH]ØZ]™XY\‹œ™XY

NÃBˆYˆ
Û™JHœ™XZÎÃBˆÝ[ž]\È
ÏH˜[YK˜ž]S[™ÝÃBˆYˆ
Ý[ž]\ÈˆX^ž]\ÊHÃBˆ]ØZ]™XY\‹˜Ø[˜Ù[
œ™\ÜÛœÙH›ÙHÛÈ\™ÙHŠK˜Ø]Ú


HOˆ[™Yš[™Y
NÃBˆ›ÝÈ™]È\œ›ÜŠ”Ý\X˜\ÙH™\ÜÛœÙH›ÙH\ÈÛÈ\™ÙKˆŠNÃBˆCBˆÚ[šÜËœ\Ú
˜[YJNÃBˆCBˆHš[˜[HÃBˆ™XY\‹œ™[X\ÙSØÚÊ
NÃBˆCBƒBˆÛÛœÝž]\ÈH™]ÈZ[\œ˜^JÝ[ž]\ÊNÃBˆ]Ù™œÙ]HÃBˆ›Üˆ
ÛÛœÝÚ[šÈÙˆÚ[šÜÊHÃBˆž]\ËœÙ]
Ú[šËÙ™œÙ]
NÃBˆÙ™œÙ]
ÏHÚ[šË˜ž]S[™ÝÃBˆCBˆÛÛœÝ^H™]È^XÛÙ\Š
K™XÛÙJž]\ÊNÃBˆYˆ
]^
H™]\›ˆ[ÃBƒBˆžHÃBˆ™]\›ˆ”ÓÓ‹œ\œÙJ^
NÃBˆHØ]ÚÃBˆ™]\›ˆ^ÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ\ÜÙ\Ý\X˜\ÙSÚÊ™\ÜÛœÙNˆ™\ÜÛœÙK˜[˜XÚÐÛÙNˆÝš[™Ë˜[˜XÚÓY\ÜØYÙNˆÝš[™ÊNˆ›ÛZ\ÙO[šÛ›ÝÛˆÃBˆÛÛœÝ^[ØYH]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJNÃBƒBˆYˆ
™\ÜÛœÙK›ÚÊH™]\›ˆ^[ØYÃBƒBˆ›ÝÈ™]È\\œ›ÜŠ™\ÜÛœÙKœÝ]\Ë˜[˜XÚÐÛÙK˜[˜XÚÓY\ÜØYÙJNÃBŸCBƒB™[˜Ý[Ûˆ\œÙP]]ÚÙ[”™\ÜÛœÙJBˆ^[ØYˆ[šÛ›ÝÛ‹Bˆ[˜[YÛÙNˆÝš[™ËBˆ[˜[YY\ÜØYÙNˆÝš[™ËBˆ[˜[YÝ]\ÈHLƒBŠNˆÝ\X˜\ÙP]]ÚÙ[”™\ÜÛœÙHÃBˆYˆ
\^[ØY\[Ùˆ^[ØYOOH›Øš™XÝŠHÃBˆ›ÝÈ™]È\\œ›ÜŠ[˜[YÝ]\Ë[˜[YÛÙK[˜[YY\ÜØYÙJNÃBˆCBƒBˆÛÛœÝ]]H^[ØY\È\X[Ý\X˜\ÙP]]ÚÙ[”™\ÜÛœÙOŽÃBˆÛÛœÝ^\™\Ò[ˆH]]™^\™\×Ú[ŽÃBˆYˆ
Bˆ\[Ùˆ]]˜XØÙ\Ü×ÝÚÙ[ˆOOHœÝš[™ÈˆX]]˜XØÙ\Ü×ÝÚÙ[ˆBˆ\[Ùˆ]]œ™Yœ™\ÚÝÚÙ[ˆOOHœÝš[™ÈˆX]]œ™Yœ™\ÚÝÚÙ[ˆBˆX]]\Ù\ˆ\[Ùˆ]]\Ù\‹šYOOHœÝš[™ÈˆX]]\Ù\‹šYBˆ\[Ùˆ^\™\Ò[ˆOOH›[X™\ˆˆS[X™\‹š\ÔØY™R[YÙ\Š^\™\Ò[ŠH^\™\Ò[ˆHBˆ
HÃBˆ›ÝÈ™]È\\œ›ÜŠ[˜[YÝ]\Ë[˜[YÛÙK[˜[YY\ÜØYÙJNÃBˆCBƒBˆ™]\›ˆÃBˆXØÙ\Ü×ÝÚÙ[Žˆ]]˜XØÙ\Ü×ÝÚÙ[‹Bˆ™Yœ™\ÚÝÚÙ[Žˆ]]œ™Yœ™\ÚÝÚÙ[‹Bˆ^\™\×Ú[ŽˆX]›Z[ŠX]™›ÛÜŠ^\™\Ò[ŠKPVÐPÐÑTÔ×ÐÓÓÒÒQWÐQÑWÔÑPÓÓ‘ÊKBˆ\Ù\Žˆ]]\Ù\ƒBˆNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÙÚ[Š™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆÛÛœÝ›ÙHH]ØZ]™XYœÛÛ›ÙOÈ[XZ[ÎˆÝš[™ÎÈ\ÜÝÛÜ™ÎˆÝš[™ÈOŠ™\]Y\Ý
NÃBˆÛÛœÝ[XZ[HÝš[™Ê›ÙK™[XZ[ÏÈˆŠKš[J
NÃBˆÛÛœÝ\ÜÝÛÜ™HÝš[™Ê›ÙKœ\ÜÝÛÜ™ÏÈˆŠNÃBƒBˆYˆ
Y[XZ[\\ÜÝÛÜ™
HÃBˆ›ÝÈ™]È\\œ›ÜŠ“ÑÒS—ÒS”UÔ‘TURT‘Q‹¸àèxàï8àêøà¨¸àâxàë8à®xàj8àäxà®xàëøàï8àâxà¤¹aiyb¦øàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBƒBˆ]™\ÜÛœÙNˆ™\ÜÛœÙNÃBˆžHÃBˆ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹‹Ø]]ÝŒKÝÚÙ[ÙÜ˜[Ý\O\\ÜÝÛÜ™‹ÃBˆY]Ùˆ”ÔÕ‹Bˆ›ÙNˆ”ÓÓ‹œÝš[™ÚYžJÈ[XZ[\ÜÝÛÜ™JCBˆJNÃBˆHØ]ÚÃBˆ›ÝÈ™]È\\œ›ÜŠBˆL‹Bˆ“ÑÒS—ÔÑT•’PÑWÕSURSP“H‹Bˆº*£z*/8à­xàï8àäøà®xàjù£©yí¦¸àiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆƒBˆ
NÃBˆCBƒBˆYˆ
\™\ÜÛœÙK›ÚÊHÃBˆ]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJK˜Ø]Ú


HOˆ[
NÃBˆYˆ
ÍKŒ—Kš[˜ÛY\Ê™\ÜÛœÙKœÝ]\ÊJHÃBˆ›ÝÈ™]È\\œ›ÜŠBˆBˆ“ÑÒS—ÑRSQ‹Bˆ¸àèxàï8àêøà¨¸àâxàë8à®xào¸àgøàkøàäxà®xàëøàï8àâxà¤¹è®º*£xàeøài¸à xà ¸àa¹. 9n©¸àëxà¬8à©8àìøàeøài¸àcøàh8àexàa8à ˆƒBˆ
NÃBˆCBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHŽJHÃBˆ›ÝÈ™]È\\œ›ÜŠŽK“ÑÒS—ÔUWÓSRUQ‹¸àëxà¬8à©8àìú*iº(c8àc9i&¸àfxàc¸ào¸àfxà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆ›ÝÈ™]È\\œ›ÜŠBˆL‹Bˆ“ÑÒS—ÔÑT•’PÑWÕSURSP“H‹Bˆº*£z*/8à­xàï8àäøà®xà¤¹b*yå*8àiøàcxào¸àføà¤øà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆƒBˆ
NÃBˆCBƒBˆÛÛœÝ]]H\œÙP]]ÚÙ[”™\ÜÛœÙJBˆ]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJKBˆ“ÑÒS—Ô‘TÔÓ”ÑWÒS•SQ‹Bˆº*£z*/8àë8à®xàçxàìøà®xà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆƒBˆ
NÃBƒBˆÛÛœÝÛÛÚÚY\ÈHÃBˆÙ\ÜÚ[ÛÛÛÚÚYJÓÓÒÒQWÐPÐÑTÔ×ÕÒÑS‹]]˜XØÙ\Ü×ÝÚÙ[‹]]™^\™\×Ú[ŠKBˆÙ\ÜÚ[ÛÛÛÚÚYJÓÓÒÒQWÔ‘Q”‘TÒÕÒÑS‹]]œ™Yœ™\ÚÝÚÙ[‹Œ
ˆŒ
ˆ
ˆÌ
CBˆNÃBƒBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈ\Ù\ŽˆØ[š]^™U\Ù\Š]]\Ù\ŠHK[™Yš[™YÛÛÚÚY\ÊNÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™Yœ™\ÚÙ\ÜÚ[ÛŠ[Žˆ[‹™Yœ™\ÚÚÙ[ŽˆÝš[™ÊNˆ›ÛZ\ÙOÙ\ÜÚ[Û”™\Ý[ˆÃBˆ]™\ÜÛœÙNˆ™\ÜÛœÙNÃBˆžHÃBˆ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹‹Ø]]ÝŒKÝÚÙ[ÙÜ˜[Ý\O\™Yœ™\ÚÝÚÙ[ˆ‹ÃBˆY]Ùˆ”ÔÕ‹Bˆ›ÙNˆ”ÓÓ‹œÝš[™ÚYžJÈ™Yœ™\ÚÝÚÙ[Žˆ™Yœ™\ÚÚÙ[ˆJCBˆJNÃBˆHØ]ÚÃBˆ›ÝÈ™]È\\œ›ÜŠL‹”ÑTÔÒSÓ—Ô‘Q”‘TÒÑRSQ‹¸à®øààøà­øàéøàìùâ­¹¡bøà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
\™\ÜÛœÙK›ÚÊHÃBˆYˆ
ÍWKš[˜ÛY\Ê™\ÜÛœÙKœÝ]\ÊJHÃBˆ›ÝÈ™]È\\œ›ÜŠBˆKBˆ”ÑTÔÒSÓ—ÑVT‘Q‹Bˆ¸à®øààøà­øàéøàìøàk¹§"yb®y§'úfd8àc9b!øà£8ào¸àeøàgøà ¸à ¸àa¹. 9n©¸àëxà¬8à©8àìøàeøài¸àcøàh8àexàa8à ˆ‹BˆÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
CBˆ
NÃBˆCBˆ›ÝÈ™]È\\œ›ÜŠL‹”ÑTÔÒSÓ—Ô‘Q”‘TÒÑRSQ‹¸à®øààøà­øàéøàìùâ­¹¡bøà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆ]]]ˆÝ\X˜\ÙP]]ÚÙ[”™\ÜÛœÙNÃBˆžHÃBˆ]]H\œÙP]]ÚÙ[”™\ÜÛœÙJBˆ]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJKBˆ”ÑTÔÒSÓ—Ô‘Q”‘TÒÒS•SQ‹Bˆ¸à®øààøà­øàéøàìøàk¹§"yb®y§'úfd8àc9b!øà£8ào¸àeøàgøà ¸à ¸àa¹. 9n©¸àëxà¬8à©8àìøàeøài¸àcøàh8àexàa8à ˆ‹BˆCBˆ
NÃBˆHØ]Ú
\œ›ÜŠHÃBˆYˆ
\œ›Üˆ[œÝ[˜Ù[Ùˆ\\œ›Üˆ	‰ˆ\œ›Ü‹˜ÛÙHOOH”ÑTÔÒSÓ—Ô‘Q”‘TÒÒS•SQŠHÃBˆ\œ›Ü‹œ™\ÜÛœÙPÛÛÚÚY\ÈHÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
NÃBˆCBˆ›ÝÈ\œ›ÜŽÃBˆCBƒBˆ™]\›ˆÃBˆ\Ù\Žˆ]]\Ù\‹BˆXØÙ\ÜÕÚÙ[Žˆ]]˜XØÙ\Ü×ÝÚÙ[‹Bˆ™\ÜÛœÙPÛÛÚÚY\ÎˆÃBˆÙ\ÜÚ[ÛÛÛÚÚYJÓÓÒÒQWÐPÐÑTÔ×ÕÒÑS‹]]˜XØÙ\Ü×ÝÚÙ[‹]]™^\™\×Ú[ŠKBˆÙ\ÜÚ[ÛÛÛÚÚYJÓÓÒÒQWÔ‘Q”‘TÒÕÒÑS‹]]œ™Yœ™\ÚÝÚÙ[‹Œ
ˆŒ
ˆ
ˆÌ
CBˆCBˆNÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™\]Z\™TÙ\ÜÚ[ÛŠBˆ™\]Y\Ýˆ™\]Y\ÝBˆ[Žˆ[‹BˆÛÛÚÚY\ÏÎˆX\Ýš[™ËÝš[™Ï‹Bˆ[ÝÔ™Yœ™\ÚH˜[ÙCBŠNˆ›ÛZ\ÙOÙ\ÜÚ[Û”™\Ý[ˆÃBˆÛÛœÝÙ\ÜÚ[ÛÛÛÚÚY\ÈHÛÛÚÚY\ÈÏÈ\œÙPÛÛÚÚY\Ê™\]Y\Ý˜[ÙK[ÝÔ™Yœ™\Ú
NÃBˆÛÛœÝXØÙ\ÜÕÚÙ[ˆHÙ\ÜÚ[ÛÛÛÚÚY\Ë™Ù]
ÓÓÒÒQWÐPÐÑTÔ×ÕÒÑSŠNÃBˆÛÛœÝ™Yœ™\ÚÚÙ[ˆHÙ\ÜÚ[ÛÛÛÚÚY\Ë™Ù]
ÓÓÒÒQWÔ‘Q”‘TÒÕÒÑSŠNÃBƒBˆYˆ
XXØÙ\ÜÕÚÙ[ˆ	‰ˆ\™Yœ™\ÚÚÙ[ŠHÃBˆ›ÝÈ™]È\\œ›ÜŠK”ÑTÔÒSÓ—Ô‘TURT‘Q‹¸àëxà¬8à©8àìøàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBƒBˆYˆ
XØÙ\ÜÕÚÙ[ŠHÃBˆ]™\ÜÛœÙNˆ™\ÜÛœÙNÃBˆžHÃBˆ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹‹Ø]]ÝŒKÝ\Ù\ˆ‹ÈY]Ùˆ‘ÑUˆKXØÙ\ÜÕÚÙ[ŠNÃBˆHØ]ÚÃBˆ›ÝÈ™]È\\œ›ÜŠL‹”ÑTÔÒSÓ—Õ‘T’Q–WÑRSQ‹¸à®øààøà­øàéøàìùâ­¹¡bøà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
™\ÜÛœÙK›ÚÊHÃBˆÛÛœÝ\Ù\ˆH]ØZ]™\ÜÛœÙKšœÛÛŠ
K˜Ø]Ú


HOˆ[
H\ÈÝ\X˜\ÙU\Ù\ˆ[ÃBˆYˆ
]\Ù\ˆ\[Ùˆ\Ù\‹šYOOHœÝš[™Èˆ]\Ù\‹šY
HÃBˆ›ÝÈ™]È\\œ›ÜŠL‹”ÑTÔÒSÓ—Õ‘T’Q–WÑRSQ‹¸à®øààøà­øàéøàìùâ­¹¡bøà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆ™]\›ˆÈ\Ù\‹XØÙ\ÜÕÚÙ[‹™\ÜÛœÙPÛÛÚÚY\Îˆ×HNÃBˆCBˆYˆ
™\ÜÛœÙKœÝ]\ÈHL™\ÜÛœÙKœÝ]\ÈOOHŽJHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹”ÑTÔÒSÓ—Õ‘T’Q–WÑRSQ‹¸à®øààøà­øàéøàìùâ­¹¡bøà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆCBƒBˆYˆ
™Yœ™\ÚÚÙ[ŠHÃBˆYˆ
X[ÝÔ™Yœ™\Ú
HÃBˆ›ÝÈ™]È\\œ›ÜŠK”ÑTÔÒSÓ—Ô‘Q”‘TÒÔ‘TURT‘Q‹¸àëxà¬8à©8àìùâ­¹¡bøà¤¹¦í9¥¬8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆ™]\›ˆ™Yœ™\ÚÙ\ÜÚ[ÛŠ[‹™Yœ™\ÚÚÙ[ŠNÃBˆCBƒBˆ›ÝÈ™]È\\œ›ÜŠBˆKBˆ”ÑTÔÒSÓ—ÑVT‘Q‹Bˆ¸à®øààøà­øàéøàìøàk¹§"yb®y§'úfd8àc9b!øà£8ào¸àeøàgøà ˆ‹Bˆ[ÝÔ™Yœ™\ÚÈÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
Hˆ×CBˆ
NÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™Yœ™\Ú]][XØ][ÛŠ™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆ]ØZ]™XYœÛÛ›ÙO™XÛÜ™Ýš[™Ë™]™\Š™\]Y\Ý
NÃBˆÛÛœÝÛÛÚÚY\ÈH\œÙPÛÛÚÚY\Ê™\]Y\Ý˜[ÙKYJNÃBˆÛÛœÝ™Yœ™\ÚÚÙ[ˆHÛÛÚÚY\Ë™Ù]
ÓÓÒÒQWÔ‘Q”‘TÒÕÒÑSŠNÃBˆYˆ
\™Yœ™\ÚÚÙ[ŠHÃBˆ›ÝÈ™]È\\œ›ÜŠK”ÑTÔÒSÓ—ÑVT‘Q‹¸à®øààøà­øàéøàìøàk¹§"yb®y§'úfd8àc9b!øà£8ào¸àeøàgøà ¸à ¸àa¹. 9n©¸àëxà¬8à©8àìøàeøài¸àcøàh8àexàa8à ˆ‹ÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
JNÃBˆCBƒBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™Yœ™\ÚÙ\ÜÚ[ÛŠ[‹™Yœ™\ÚÚÙ[ŠNÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈÝ]\Îˆ›ÚÈ‹\Ù\ŽˆØ[š]^™U\Ù\ŠÙ\ÜÚ[Û‹\Ù\ŠHK[™Yš[™YÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÃBŸCBƒB™[˜Ý[ÛˆØ[š]^™U\Ù\Š\Ù\ŽˆÝ\X˜\ÙU\Ù\ŠNˆÝ\X˜\ÙU\Ù\ˆÃBˆ™]\›ˆÃBˆYˆ\Ù\‹šYBˆ[XZ[ˆ\Ù\‹™[XZ[BˆNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÙ]Ù\ÜÚ[ÛŠ™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠNÃBˆÛÛœÝÜ›Ùš[T™\Ý[ÛÜšÜÜXÙ\Ô™\Ý[HH]ØZ]›ÛZ\ÙK˜[Ù]Y
ÃBˆ™]Ú›Ùš[J[‹Ù\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[‹Ù\ÜÚ[Û‹\Ù\‹šY
KBˆ™]ÚÛÜšÜÜXÙ\Ê[‹Ù\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[ŠCBˆJNÃBƒBˆ›Üˆ
ÛÛœÝ™\Ý[ÙˆÜ›Ùš[T™\Ý[ÛÜšÜÜXÙ\Ô™\Ý[JHÃBˆYˆ
™\Ý[œÝ]\ÈOOHœ™Z™XÝYˆ	‰ˆ™\Ý[œ™X\ÛÛˆ[œÝ[˜Ù[Ùˆ\\œ›Üˆ	‰ˆ™\Ý[œ™X\ÛÛ‹˜ÛÙHOOH”ÑTÔÒSÓ—Ô‘Q”‘TÒÔ‘TURT‘QŠHÃBˆ›ÝÈ™\Ý[œ™X\ÛÛŽÃBˆCBˆCBˆYˆ
›Ùš[T™\Ý[œÝ]\ÈOOHœ™Z™XÝYŠH›ÝÈ›Ùš[T™\Ý[œ™X\ÛÛŽÃBˆYˆ
ÛÜšÜÜXÙ\Ô™\Ý[œÝ]\ÈOOHœ™Z™XÝYŠH›ÝÈÛÜšÜÜXÙ\Ô™\Ý[œ™X\ÛÛŽÃBƒBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆ\Ù\ŽˆØ[š]^™U\Ù\ŠÙ\ÜÚ[Û‹\Ù\ŠKBˆ›Ùš[Nˆ›Ùš[T™\Ý[˜[YKBˆÛÜšÜÜXÙ\ÎˆÛÜšÜÜXÙ\Ô™\Ý[˜[YCBˆK[™Yš[™YÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÚ]Ý\X˜\ÙT™XY[Y[Ý]ŠBˆÜ\˜][ÛŽˆ
ÚYÛ˜[ˆX›ÜÚYÛ˜[
HOˆ›ÛZ\ÙO‹Bˆ˜[˜XÚÐÛÙNˆÝš[™ËBˆ˜[˜XÚÓY\ÜØYÙNˆÝš[™ÃBŠNˆ›ÛZ\ÙOˆÃBˆÛÛœÝÛÛ›Û\ˆH™]ÈX›ÜÛÛ›Û\Š
NÃBˆ][Y[Ý]Yˆ™]\›•\O\[ÙˆÙ][Y[Ý]ˆ[™Yš[™YÃBˆÛÛœÝ[Y[Ý]H™]È›ÛZ\ÙO™]™\Š
Ë™Z™XÝ
HOˆÃBˆ[Y[Ý]YHÙ][Y[Ý]


HOˆÃBˆÛÛ›Û\‹˜X›Ü

NÃBˆ™Z™XÝ
™]È\\œ›ÜŠL‹˜[˜XÚÐÛÙK˜[˜XÚÓY\ÜØYÙJJNÃBˆKÕTPTÑWÔ‘PQÕSQSÕUÓTÊNÃBˆJNÃBˆžHÃBˆ™]\›ˆ]ØZ]›ÛZ\ÙKœ˜XÙJÛÜ\˜][ÛŠÛÛ›Û\‹œÚYÛ˜[
K[Y[Ý]JNÃBˆHØ]Ú
\œ›ÜŠHÃBˆYˆ
\œ›Üˆ[œÝ[˜Ù[Ùˆ\\œ›ÜŠH›ÝÈ\œ›ÜŽÃBˆ›ÝÈ™]È\\œ›ÜŠL‹˜[˜XÚÐÛÙK˜[˜XÚÓY\ÜØYÙJNÃBˆHš[˜[HÃBˆYˆ
[Y[Ý]YOOH[™Yš[™Y
HÛX\•[Y[Ý]
[Y[Ý]Y
NÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™]Ú›Ùš[J[Žˆ[‹XØÙ\ÜÕÚÙ[ŽˆÝš[™Ë\Ù\’YˆÝš[™ÊNˆ›ÛZ\ÙO[šÛ›ÝÛˆÃBˆÛÛœÝ]Y\žHHÜ™\ÝÝŒKÜ›Ùš[\ÏÜÙ[XÝZY\Ü^WÛ˜[YKØØ[K[Y^›Û™IšYY\K‰Ù[˜ÛÙUT’PÛÛ\Û™[
\Ù\’Y
_I›[Z]LXÃBˆÛÛœÝ˜[˜XÚÓY\ÜØYÙHH¸àåøàëxàåxà¨øàï8àêøà¤¹cå¹o¥øàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŽÃBˆ™]\›ˆÚ]Ý\X˜\ÙT™XY[Y[Ý]
\Þ[˜È
ÚYÛ˜[
HOˆÃBˆÛÛœÝ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹]Y\žKÈY]Ùˆ‘ÑU‹ÚYÛ˜[KXØÙ\ÜÕÚÙ[ŠNÃBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHJHÃBˆ›ÝÈ™]È\\œ›ÜŠK”ÑTÔÒSÓ—Ô‘Q”‘TÒÔ‘TURT‘Q‹¸àëxà¬8à©8àìùâ­¹¡bøà¤¹¦í9¥¬8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHÊHÃBˆ›ÝÈ™]È\\œ›ÜŠË”“Ñ’SWÐPÐÑTÔ×ÑS’QQ‹¸àåøàëxàåxà¨øàï8àêøà¤º(j9é.¸àfxà¢ùª*zfd8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¸à ¸àa¹. 9n©¸àëxà¬8à©8àìøàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
\™\ÜÛœÙK›ÚÊH›ÝÈ™]È\\œ›ÜŠL‹”“Ñ’SWÑ‘UÒÑRSQ‹˜[˜XÚÓY\ÜØYÙJNÃBˆÛÛœÝ^[ØYH]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJNÃBˆ™]\›ˆ\œ˜^Kš\Ð\œ˜^J^[ØY
HÈ^[ØYÌHÏÈ[ˆ[ÃBˆK”“Ñ’SWÑ‘UÒÑRSQ‹˜[˜XÚÓY\ÜØYÙJNÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ™]ÚÛÜšÜÜXÙ\Ê[Žˆ[‹XØÙ\ÜÕÚÙ[ŽˆÝš[™ÊNˆ›ÛZ\ÙOÛÜšÜÜXÙTÝ[[X\žV×OˆÃBˆÛÛœÝ]Y\žHHÜ™\ÝÝŒKÝÛÜšÜÜXÙ\ÏÜÙ[XÝZY˜[YKÛYËÝ]\ËÜ™X]YØ]	œÝ]\Ï[™\K™[]Y	›Ü™\XÜ™X]YØ]™\ØÉ›[Z]IÓPVÕÓÔ’ÔÔPÑWÓTÕÒUSTÈ
È_XÃBˆÛÛœÝ˜[˜XÚÓY\ÜØYÙHH¸àëøàï8à«øà®xàæ¸àï8à®xà¤¹cå¹o¥øàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŽÃBˆ™]\›ˆÚ]Ý\X˜\ÙT™XY[Y[Ý]
\Þ[˜È
ÚYÛ˜[
HOˆÃBˆÛÛœÝ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹]Y\žKÃBˆY]Ùˆ‘ÑU‹BˆXY\œÎˆÈ™Y™\Žˆ˜ÛÝ[Y^XÝˆKBˆÚYÛ˜[BˆKXØÙ\ÜÕÚÙ[ŠNÃBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHJHÃBˆ›ÝÈ™]È\\œ›ÜŠK”ÑTÔÒSÓ—Ô‘Q”‘TÒÔ‘TURT‘Q‹¸àëxà¬8à©8àìùâ­¹¡bøà¤¹¦í9¥¬8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHÊHÃBˆ›ÝÈ™]È\\œ›ÜŠË•ÓÔ’ÔÔPÑT×ÐPÐÑTÔ×ÑS’QQ‹¸àëøàï8à«øà®xàæ¸àï8à®xà¤º(j9é.¸àfxà¢ùª*zfd8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¸à ¸àa¹. 9n©¸àëxà¬8à©8àìøàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
\™\ÜÛœÙK›ÚÊH›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑT×Ñ‘UÒÑRSQ‹˜[˜XÚÓY\ÜØYÙJNÃBˆÛÛœÝ^[ØYH]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJNÃBˆYˆ
P\œ˜^Kš\Ð\œ˜^J^[ØY
H\^[ØY™]™\žJ\ÕÛÜšÜÜXÙTÝ[[X\žJH™]ÈÙ]
^[ØY›X\

ÛÜšÜÜXÙJHOˆÛÜšÜÜXÙKšY
JKœÚ^™HOOH^[ØY›[™Ý
HÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑT×Ô‘TÔÓ”ÑWÒS•SQ‹¸àëøàï8à«øà®xàæ¸àï8à®y. :)©øà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝÛÛ[˜[™ÙHH™\ÜÛœÙKšXY\œË™Ù]
˜ÛÛ[\˜[™ÙHŠHÏÈˆŽÃBˆÛÛœÝÜ[]Y˜[™ÙHHÛÛ[˜[™ÙK›X]Ú
×Š
ÊKJ
ÊWÊ
ÊIÊNÃBˆÛÛœÝ[\T˜[™ÙHHÛÛ[˜[™ÙK›X]Ú
×—
—Ê
ÊIÊNÃBˆÛÛœÝ˜[™ÙTÝ\HÜ[]Y˜[™ÙHÈ[X™\ŠÜ[]Y˜[™ÙVÌWJHˆ[ÃBˆÛÛœÝ˜[™ÙQ[™HÜ[]Y˜[™ÙHÈ[X™\ŠÜ[]Y˜[™ÙVÌ—JHˆ[ÃBˆÛÛœÝ^XÝÝ[HÜ[]Y˜[™ÙHÈ[X™\ŠÜ[]Y˜[™ÙVÌ×JHˆ[\T˜[™ÙHÈ[X™\Š[\T˜[™ÙVÌWJHˆ[ÃBˆÛÛœÝ˜[™ÙR\Õ˜[YH^[ØY›[™ÝOOHBˆÈ[\T˜[™ÙHOOH[	‰ˆ^XÝÝ[OOHBˆˆÜ[]Y˜[™ÙHOOH[	‰ƒBˆ\[Ùˆ˜[™ÙTÝ\OOH›[X™\ˆˆ	‰ƒBˆ\[Ùˆ˜[™ÙQ[™OOH›[X™\ˆˆ	‰ƒBˆ˜[™ÙTÝ\OOH	‰ƒBˆ[X™\‹š\ÔØY™R[YÙ\Š˜[™ÙQ[™
H	‰ƒBˆ˜[™ÙQ[™H˜[™ÙTÝ\
ÈHOOH^[ØY›[™Ý	‰ƒBˆ\[Ùˆ^XÝÝ[OOH›[X™\ˆˆ	‰ƒBˆ[X™\‹š\ÔØY™R[YÙ\Š^XÝÝ[
H	‰ƒBˆ^XÝÝ[H^[ØY›[™ÝÃBˆYˆ
\˜[™ÙR\Õ˜[Y^XÝÝ[OOH[S[X™\‹š\ÔØY™R[YÙ\Š^XÝÝ[
JHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑT×Ô‘TÔÓ”ÑWÒS•SQ‹¸àëøàï8à«øà®xàæ¸àï8à®y. :)©øà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝ˜[Y]Y^XÝÝ[H^XÝÝ[ÃBˆYˆ
Bˆ^[ØY›[™ÝˆPVÕÓÔ’ÔÔPÑWÓTÕÒUSTÈBˆ˜[Y]Y^XÝÝ[ˆPVÕÓÔ’ÔÔPÑWÓTÕÒUSTÃBˆ
HÃBˆ›ÝÈ™]È\\œ›ÜŠK•ÓÔ’ÔÔPÑT×ÓSRUÑVÑQQQ‹¹¢`9lg¸àëøàï8à«øà®xàæ¸àï8à®xàc9i&¸àa8àgøà y. :)©øà¤º(j9é.¸àiøàcxào¸àføà¤øà ¹ë¨yä!º !xàjù¥m9ä!¸à¤¹/§zh/8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
˜[Y]Y^XÝÝ[OOH^[ØY›[™Ý
HÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑT×Ô‘TÔÓ”ÑWÒS•SQ‹¸àëøàï8à«øà®xàæ¸àï8à®y. :)©øà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆ™]\›ˆ^[ØYÃBˆK•ÓÔ’ÔÔPÑT×Ñ‘UÒÑRSQ‹˜[˜XÚÓY\ÜØYÙJNÃBŸCBƒB™[˜Ý[Ûˆ\ÕÛÜšÜÜXÙTÝ[[X\žJ˜[YNˆ[šÛ›ÝÛŠNˆ˜[YH\ÈÛÜšÜÜXÙTÝ[[X\žHÃBˆYˆ
]˜[YH\[Ùˆ˜[YHOOH›Øš™XÝŠH™]\›ˆ˜[ÙNÃBˆÛÛœÝÛÜšÜÜXÙHH˜[YH\È\X[ÛÜšÜÜXÙTÝ[[X\žOŽÃBˆ™]\›ˆ
Bˆ\[ÙˆÛÜšÜÜXÙKšYOOHœÝš[™Èˆ	‰ˆURQÔUT“‹\Ý
ÛÜšÜÜXÙKšY
H	‰ƒBˆ\[ÙˆÛÜšÜÜXÙK›˜[YHOOHœÝš[™Èˆ	‰ˆÛÜšÜÜXÙK›˜[YKš[J
K›[™Ýˆ	‰ˆ\œ˜^K™œ›ÛJÛÜšÜÜXÙK›˜[YJK›[™ÝH	‰ƒBˆ\[ÙˆÛÜšÜÜXÙKœÛYÈOOHœÝš[™Èˆ	‰ˆ×–ØK^ŒNWVØK^ŒNKW^ÌKŒ_VØK^ŒNWIË\Ý
ÛÜšÜÜXÙKœÛYÊH	‰ƒBˆ
ÛÜšÜÜXÙKœÝ]\ÈOOH˜XÝ]™HˆÛÜšÜÜXÙKœÝ]\ÈOOHœÝ\Ü[™YŠH	‰ƒBˆ\[ÙˆÛÜšÜÜXÙK˜Ü™X]YØ]OOHœÝš[™Èˆ	‰ˆS[X™\‹š\Ó˜SŠ]Kœ\œÙJÛÜšÜÜXÙK˜Ü™X]YØ]
JCBˆ
NÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÜ™X]UÛÜšÜÜXÙJ™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠNÃBˆÛÛœÝ›ÙHH]ØZ]™XYœÛÛ›ÙOÈ˜[YOÎˆÝš[™ÎÈÛYÏÎˆÝš[™ÈOŠ™\]Y\Ý
NÃBˆYˆ
\[Ùˆ›ÙK›˜[YHOOHœÝš[™Èˆ\[Ùˆ›ÙKœÛYÈOOHœÝš[™ÈŠHÃBˆ›ÝÈ™]È\\œ›ÜŠ•ÓÔ’ÔÔPÑWÒS”UÒS•SQ‹¸àëøàï8à«øà®xàæ¸àï8à®yd#xàjT“9å*Q8à¤¹¥¡ùkeøàiùaiyb¦øàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝ˜[YHH›ÙK›˜[YKš[J
NÃBˆÛÛœÝÛYÈH›ÙKœÛYËš[J
KÓÝÙ\Ø\ÙJ
NÃBƒBˆYˆ
\œ˜^K™œ›ÛJ˜[YJK›[™ÝH\œ˜^K™œ›ÛJ˜[YJK›[™Ýˆ
HÃBˆ›ÝÈ™]È\\œ›ÜŠ•ÓÔ’ÔÔPÑWÓSQWÒS•SQ‹¸àëøàï8à«øà®xàæ¸àï8à®yd#xàkÌxà'9¥¡ùkeøàiùaiyb¦øàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBƒBˆYˆ
K×–ØK^ŒNWVØK^ŒNKW^ÌKŒ_VØK^ŒNWIË\Ý
ÛYÊJHÃBˆ›ÝÈ™]È\\œ›ÜŠ•ÓÔ’ÔÔPÑWÔÓQ×ÒS•SQ‹•T“9å*Q8àkùcbº)äº"ìy¥l9keøàj8àãøà©8àåxàìøàiÌøà'Œù¥¡ùkeøàjøàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBƒBˆ]™\ÜÛœÙNˆ™\ÜÛœÙNÃBˆžHÃBˆ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹‹Ü™\ÝÝŒKÜœËØÜ™X]WÝÛÜšÜÜXÙH‹ÃBˆY]Ùˆ”ÔÕ‹Bˆ›ÙNˆ”ÓÓ‹œÝš[™ÚYžJÃBˆÛÜšÜÜXÙWÛ˜[YNˆ˜[YKBˆÛÜšÜÜXÙWÜÛYÎˆÛYÃBˆJCBˆKÙ\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[ŠNÃBˆHØ]ÚÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÐÔ‘PUWÔ‘TÕSÕS’Ó“ÕÓˆ‹¹/g9¢$9aé¹ä!¸àk¹íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ºaãxàkxài¹/g9¢$8àføàf¸à y. :)©øà¤¹¦í9¥¬8àeøài¹è®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHJHÃBˆ›ÝÈ™]È\\œ›ÜŠK”ÑTÔÒSÓ—Ô‘Q”‘TÒÔ‘TURT‘Q‹¸àëxà¬8à©8àìùâ­¹¡bøà¤¹¦í9¥¬8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHÊHÃBˆ›ÝÈ™]È\\œ›ÜŠË•ÓÔ’ÔÔPÑWÐÔ‘PUWÑ“Ô’QSˆ‹¸àëøàï8à«øà®xàæ¸àï8à®xà¤¹/g9¢$8àfxà¢ùª*zfd8àc8à`¸à¢¸ào¸àføà¤øà ¹ë¨yä!º !xàjùè®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
\™\ÜÛœÙK›ÚÊHÃBˆYˆ
™\ÜÛœÙKœÝ]\ÈHL
HÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÐÔ‘PUWÔ‘TÕSÕS’Ó“ÕÓˆ‹¹/g9¢$9aé¹ä!¸àk¹íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ºaãxàkxài¹/g9¢$8àføàf¸à y. :)©øà¤¹¦í9¥¬8àeøài¹è®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHŽJHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÐÔ‘PUWÑRSQ‹¸àëøàï8à«øà®xàæ¸àï8à®xà¤¹/g9¢$8àiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆ]\Ý™X[PÛÙHHˆŽÃBˆžHÃBˆÛÛœÝ\Ý™X[Q\œ›ÜˆH]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJNÃBˆYˆ
\Ý™X[Q\œ›Üˆ	‰ˆ\[Ùˆ\Ý™X[Q\œ›ÜˆOOH›Øš™XÝˆ	‰ˆ˜ÛÙHˆ[ˆ\Ý™X[Q\œ›ÜŠHÃBˆ\Ý™X[PÛÙHHÝš[™Ê\Ý™X[Q\œ›Ü‹˜ÛÙJNÃBˆCBˆHØ]ÚÃBˆËÈ9.#y«høàj¹."¹­`xàª8àêxàï9§+9¥¡øàkùaiyb¦ù.#y«høàj9¬n¸à xài8àdxàf¸à xà­xàï8àäøà®zf§9k¬øàj8àeøài¹¢lxàa¸à ƒBˆCBˆYˆ

™\ÜÛœÙKœÝ]\ÈOOH™\ÜÛœÙKœÝ]\ÈOOHJH	‰ˆÓÔ’ÔÔPÑWÒS”UÑT”“Ô—ÐÓÑTËš\Ê\Ý™X[PÛÙJJHÃBˆ›ÝÈ™]È\\œ›ÜŠ•ÓÔ’ÔÔPÑWÐÔ‘PUWÑRSQ‹¸àëøàï8à«øà®xàæ¸àï8à®xà¤¹/g9¢$8àiøàcxào¸àføà¤øàiøàeøàgøà ¹aiyb¦ùa¡yk®xà¤¹è®º*£xàeøài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÐÔ‘PUWÔÑT•’PÑWÕSURSP“H‹¸àëøàï8à«øà®xàæ¸àï8à®y/g9¢$8à­xàï8àäøà®xà¤¹b*yå*8àiøàcxào¸àføà¤øà ¹aiyb¦øà¤¹i"xàb8àf¸à yë¨yä!º !xàjùè®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBƒBˆ]ÛÜšÜÜXÙRYˆ[šÛ›ÝÛŽÃBˆžHÃBˆÛÜšÜÜXÙRYH]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJNÃBˆHØ]ÚÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÐÔ‘PUWÔ‘TÕSÕS’Ó“ÕÓˆ‹¹/g9¢$9aé¹ä!¸àk¹íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ºaãxàkxài¹/g9¢$8àføàf¸à y. :)©øà¤¹¦í9¥¬8àeøài¹è®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
\[ÙˆÛÜšÜÜXÙRYOOHœÝš[™ÈˆUURQÔUT“‹\Ý
ÛÜšÜÜXÙRY
JHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÐÔ‘PUWÔ‘TÕSÕS’Ó“ÕÓˆ‹¹/g9¢$9aé¹ä!¸àk¹íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ºaãxàkxài¹/g9¢$8àføàf¸à y. :)©øà¤¹¦í9¥¬8àeøài¹è®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBƒBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÛÜšÜÜXÙRYBˆKÈÝ]\ÎˆŒHKÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÃBŸCBƒB™[˜Ý[Ûˆ\ÕÛÜšÜÜXÙT›ÛJ˜[YNˆ[šÛ›ÝÛŠNˆ˜[YH\ÈÛÜšÜÜXÙT›ÛHÃBˆ™]\›ˆÈ›ÝÛ™\ˆ‹˜YZ[ˆ‹™Y]Üˆ‹šY]Ù\ˆ—Kš[˜ÛY\ÊÝš[™Ê˜[YJJNÃBŸCBƒB™[˜Ý[Ûˆ\ÕÛÜšÜÜXÙSY[X™\”Ý]\Ê˜[YNˆ[šÛ›ÝÛŠNˆ˜[YH\ÈÛÜšÜÜXÙSY[X™\”Ý]\ÈÃBˆ™]\›ˆÈ˜XÝ]™H‹š[š]Y‹œ™[[Ý™Y—Kš[˜ÛY\ÊÝš[™Ê˜[YJJNÃBŸCBƒB™[˜Ý[Ûˆ\œÙUÛÜšÜÜXÙSY[X™\”›ÝÊ˜[YNˆ[šÛ›ÝÛŠNˆÛÜšÜÜXÙSY[X™\”œÔ›ÝÈ[ÃBˆYˆ
]˜[YH\[Ùˆ˜[YHOOH›Øš™XÝŠH™]\›ˆ[ÃBˆÛÛœÝY[X™\ˆH˜[YH\È\X[ÛÜšÜÜXÙSY[X™\”œÔ›ÝÏŽÃBˆYˆ
Bˆ\[ÙˆY[X™\‹\Ù\—ÚYOOHœÝš[™ÈˆUURQÔUT“‹\Ý
Y[X™\‹\Ù\—ÚY
HBˆ\[ÙˆY[X™\‹™\Ü^WÛ˜[YHOOHœÝš[™ÈˆY[X™\‹™\Ü^WÛ˜[YKš[J
K›[™ÝOOHBˆ\œ˜^K™œ›ÛJY[X™\‹™\Ü^WÛ˜[YJK›[™ÝˆBˆZ\ÕÛÜšÜÜXÙT›ÛJY[X™\‹œ›ÛJHBˆZ\ÕÛÜšÜÜXÙSY[X™\”Ý]\ÊY[X™\‹œÝ]\ÊHBˆ
Y[X™\‹š›Ú[™YØ]OOH[	‰ˆ
Bˆ\[ÙˆY[X™\‹š›Ú[™YØ]OOHœÝš[™Èˆ[X™\‹š\Ó˜SŠ]Kœ\œÙJY[X™\‹š›Ú[™YØ]
JCBˆ
JCBˆ
HÃBˆ™]\›ˆ[ÃBˆCBˆ™]\›ˆY[X™\ˆ\ÈÛÜšÜÜXÙSY[X™\”œÔ›ÝÎÃBŸCBƒB™[˜Ý[ÛˆÛÜšÜÜXÙSY[X™\”Ý[[X\žJY[X™\ŽˆÛÜšÜÜXÙSY[X™\”œÔ›ÝÊNˆÛÜšÜÜXÙSY[X™\”Ý[[X\žHÃBˆ™]\›ˆÃBˆ\Ù\’YˆY[X™\‹\Ù\—ÚYBˆ\Ü^S˜[YNˆY[X™\‹™\Ü^WÛ˜[YKBˆ›ÛNˆY[X™\‹œ›ÛKBˆÝ]\ÎˆY[X™\‹œÝ]\ËBˆ›Ú[™Y]ˆY[X™\‹š›Ú[™YØ]BˆNÃBŸCBƒB™[˜Ý[ÛˆY[X™\”œÓY\ÜØYÙJ^[ØYˆ[šÛ›ÝÛŠNˆÝš[™ÈÃBˆYˆ
\^[ØY\[Ùˆ^[ØYOOH›Øš™XÝˆJ›Y\ÜØYÙHˆ[ˆ^[ØY
JH™]\›ˆˆŽÃBˆ™]\›ˆ\[Ùˆ^[ØY›Y\ÜØYÙHOOHœÝš[™ÈˆÈ^[ØY›Y\ÜØYÙHˆˆŽÃBŸCBƒB™[˜Ý[Ûˆ›ÝÓY[X™\”œÑ˜Z[\™JBˆ^[ØYˆ[šÛ›ÝÛ‹Bˆ]]][ÛŽˆ›ÛÛX[‹Bˆ˜[˜XÚÏÎˆÈÛÙNˆÝš[™ÎÈY\ÜØYÙNˆÝš[™ÈCBŠNˆ™]™\ˆÃBˆÛÛœÝY\ÜØYÙHHY[X™\”œÓY\ÜØYÙJ^[ØY
NÃBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÕÓÔ’ÔÔPÑWÓQSP‘T”×Ó“ÕÑ“ÕS‘ŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠ•ÓÔ’ÔÔPÑWÓQSP‘T”×Ó“ÕÑ“ÕS‘‹¸àëøàï8à«øà®xàæ¸àï8à®xào¸àgøàkøàèxàìøàä8àï9 áyh,xà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ˆŠNÃBˆCBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÓQSP‘T—ÓPSQÑWÑ“Ô’QSˆŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠË“QSP‘T—ÓPSQÑWÑ“Ô’QSˆ‹¸àèxàìøàä8àï8à¤¹i"y¦í8àfxà¢ùª*zfd8àc8à`¸à¢¸ào¸àføà¤øà ˆŠNÃBˆCBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÓÕÓ‘T—ÕS”Ñ‘T—Ô‘TURT‘QŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠK“ÕÓ‘T—ÕS”Ñ‘T—Ô‘TURT‘Q‹¹ë¨yä!º,«9.îú !xàk¹i"y¦í8àîù`g9«h¸àkøà yl ¹å*8àk¹éîùë¨y¢bùí¦¸àcxàc9b*yå*8àiøàcxà¢øào¸àiú(c8àb8ào¸àføà¤øà ˆŠNÃBˆCBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÒ“ÒS—ÐÓÑWÕSURSP“HŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠK’“ÒS—ÐÓÑWÕSURSP“H‹¹cà¹b¨8à¬øàï8àâxà¤¹b*yå*8àiøàcxào¸àføà¤øà ¹§"yb®y§'úfd8ào¸àgøàkùaiyb¦ùa¡yk®xà¤¹è®º*£xàeøà y§+9.®¸àjùa£yænº(c8à¤¹/§zh/8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÒ“ÒS—ÐÓÑWÐÔ‘PUWÑRSQŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹’“ÒS—ÐÓÑWÐÔ‘PUWÔ‘TÕSÕS’Ó“ÕÓˆ‹¹cà¹b¨8à¬øàï8àâxà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¸à ¸àa¹. 9n©¹ænº(c8àfxà¢øàj8à y.éybcxàk¸à¬øàï8àâxàkùá(yb®xàjøàj¸à¢¸ào¸àfxà ˆŠNÃBˆCBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÓQSP‘T—ÕTUWÕSURSP“HŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠK“QSP‘T—ÕTUWÕSURSP“H‹¹kïº,hxàèxàìøàä8àï8àk¹â­¹¡bøàc9i"xà£øàhøàgøàgøà y¦í9¥¬8àiøàcxào¸àføà¤øàiøàeøàgøà ¹. :)©øà¤¹¦í9¥¬8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÓQSP‘T—ÔÕUT×ÒS•SQŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠ“QSP‘T—ÔÕUT×ÒS•SQ‹¸àèxàìøàä8àï9â­¹¡bøàk¹£!ùk¦¸àc9«høàeøàcøà`¸à¢¸ào¸àføà¤øà ˆŠNÃBˆCBˆYˆ
Y\ÜØYÙKš[˜ÛY\Ê“SWÕÓÔ’ÔÔPÑWÓQSP‘T”×ÓSRUÑVÑQQQŠJHÃBˆ›ÝÈ™]È\\œ›ÜŠK•ÓÔ’ÔÔPÑWÓQSP‘T”×ÓSRUÑVÑQQQ‹¸àèxàìøàä8àï8àc9i&¸àa8àgøà y. :)©øà¤º(j9é.¸àiøàcxào¸àføà¤øà ¹ë¨yä!º !xàjù¥m9ä!¸à¤¹/§zh/8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆYˆ
]]][ÛŠHÃBˆ›ÝÈ™]È\\œ›ÜŠBˆL‹Bˆ˜[˜XÚÏË˜ÛÙHÏÈ“QSP‘T—ÐÒS‘ÑWÔ‘TÕSÕS’Ó“ÕÓˆ‹Bˆ˜[˜XÚÏË›Y\ÜØYÙHÏÈ¹i"y¦í9íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹. :)©øà¤¹¦í9¥¬8àeøài¹â­¹¡bøà¤¹è®º*£xàeøài¸àcøàh8àexàa8à ˆƒBˆ
NÃBˆCBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÓQSP‘T”×Ñ‘UÒÑRSQ‹¸àèxàìøàä8àï9. :)©øà¤¹cå¹o¥øàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆØ[ÛÜšÜÜXÙSY[X™\”œÊBˆ[Žˆ[‹BˆXØÙ\ÜÕÚÙ[ŽˆÝš[™ËBˆœÓ˜[YNˆÝš[™ËBˆ›ÙNˆ™XÛÜ™Ýš[™Ë[šÛ›ÝÛ‹Bˆ]]][ÛŽˆ›ÛÛX[‹Bˆ˜[˜XÚÏÎˆÈÛÙNˆÝš[™ÎÈY\ÜØYÙNˆÝš[™ÈCBŠNˆ›ÛZ\ÙO[šÛ›ÝÛˆÃBˆÛÛœÝ˜[˜XÚÐÛÙHH˜[˜XÚÏË˜ÛÙHÏÈ
]]][ÛˆÈ“QSP‘T—ÐÒS‘ÑWÔ‘TÕSÕS’Ó“ÕÓˆˆˆ•ÓÔ’ÔÔPÑWÓQSP‘T”×Ñ‘UÒÑRSQŠNÃBˆÛÛœÝ˜[˜XÚÓY\ÜØYÙHH˜[˜XÚÏË›Y\ÜØYÙHÏÈ
]]][ÛƒBˆÈ¹i"y¦í9íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹. :)©øà¤¹¦í9¥¬8àeøài¹â­¹¡bøà¤¹è®º*£xàeøài¸àcøàh8àexàa8à ˆƒBˆˆ¸àèxàìøàä8àï9. :)©øà¤¹cå¹o¥øàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆ™]\›ˆÚ]Ý\X˜\ÙT™XY[Y[Ý]
\Þ[˜È
ÚYÛ˜[
HOˆÃBˆÛÛœÝ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹Ü™\ÝÝŒKÜœËÉÜœÓ˜[Y_XÃBˆY]Ùˆ”ÔÕ‹Bˆ›ÙNˆ”ÓÓ‹œÝš[™ÚYžJ›ÙJKBˆÚYÛ˜[BˆKXØÙ\ÜÕÚÙ[ŠNÃBˆYˆ
™\ÜÛœÙKœÝ]\ÈOOHJHÃBˆ›ÝÈ™]È\\œ›ÜŠK”ÑTÔÒSÓ—Ô‘Q”‘TÒÔ‘TURT‘Q‹¸àëxà¬8à©8àìùâ­¹¡bøà¤¹¦í9¥¬8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆ]^[ØYˆ[šÛ›ÝÛŽÃBˆžHÃBˆ^[ØYH]ØZ]™XYÝ\X˜\ÙRœÛÛŠ™\ÜÛœÙJNÃBˆHØ]ÚÃBˆ›ÝÈ™]È\\œ›ÜŠL‹˜[˜XÚÐÛÙK˜[˜XÚÓY\ÜØYÙJNÃBˆCBˆYˆ
\™\ÜÛœÙK›ÚÊH›ÝÓY[X™\”œÑ˜Z[\™J^[ØY]]][Û‹˜[˜XÚÊNÃBˆ™]\›ˆ^[ØYÃBˆK˜[˜XÚÐÛÙK˜[˜XÚÓY\ÜØYÙJNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÜ™X]UÛÜšÜÜXÙR›Ú[ÛÙJ™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠNÃBˆ]ØZ]™XYœÛÛ›ÙO™XÛÜ™Ýš[™Ë™]™\Š™\]Y\Ý
NÃBˆÛÛœÝ[šÛ›ÝÛˆHÃBˆÛÙNˆ’“ÒS—ÐÓÑWÐÔ‘PUWÔ‘TÕSÕS’Ó“ÕÓˆ‹BˆY\ÜØYÙNˆ¹cà¹b¨8à¬øàï8àâxà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¸à ¸àa¹. 9n©¹ænº(c8àfxà¢øàj8à y.éybcxàk¸à¬øàï8àâxàkùá(yb®xàjøàj¸à¢¸ào¸àfxà ˆƒBˆNÃBˆÛÛœÝ^[ØYH]ØZ]Ø[ÛÜšÜÜXÙSY[X™\”œÊBˆ[‹BˆÙ\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[‹Bˆ˜Ü™X]WÝÛÜšÜÜXÙWÚ›Ú[—ØÛÙH‹BˆßKBˆYKBˆ[šÛ›ÝÛƒBˆ
NÃBˆYˆ
P\œ˜^Kš\Ð\œ˜^J^[ØY
H^[ØY›[™ÝOOHJHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹[šÛ›ÝÛ‹˜ÛÙK[šÛ›ÝÛ‹›Y\ÜØYÙJNÃBˆCBˆÛÛœÝ›ÝÈH^[ØYÌNÃBˆYˆ
\›ÝÈ\[Ùˆ›ÝÈOOH›Øš™XÝŠHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹[šÛ›ÝÛ‹˜ÛÙK[šÛ›ÝÛ‹›Y\ÜØYÙJNÃBˆCBˆÛÛœÝØ[™Y]HH›ÝÈ\ÈÈ›Ú[—ØÛÙOÎˆ[šÛ›ÝÛŽÈ^\™\×Ø]Îˆ[šÛ›ÝÛˆNÃBˆÛÛœÝ^\™\Ð]H\[ÙˆØ[™Y]K™^\™\×Ø]OOHœÝš[™ÈˆÈ]Kœ\œÙJØ[™Y]K™^\™\×Ø]
Hˆ[X™\‹“˜SŽÃBˆÛÛœÝ›ÝÈH]K››ÝÊ
NÃBˆYˆ
Bˆ\[ÙˆØ[™Y]Kš›Ú[—ØÛÙHOOHœÝš[™ÈˆR“ÒS—ÐÓÑWÔUT“‹\Ý
Ø[™Y]Kš›Ú[—ØÛÙJHBˆS[X™\‹š\Ñš[š]J^\™\Ð]
H^\™\Ð]H›ÝÈ^\™\Ð]ˆ›ÝÈ
ÈLH
ˆŒ
ˆLBˆ
HÃBˆ›ÝÈ™]È\\œ›ÜŠL‹[šÛ›ÝÛ‹˜ÛÙK[šÛ›ÝÛ‹›Y\ÜØYÙJNÃBˆCBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆ›Ú[ÛÙNˆØ[™Y]Kš›Ú[—ØÛÙKBˆ^\™\Ð]ˆØ[™Y]K™^\™\×Ø]BˆKÈÝ]\ÎˆŒHKÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÃBŸCBƒB™[˜Ý[Ûˆ™\]Z\™UÛÜšÜÜXÙRY
ÛÜšÜÜXÙRYˆÝš[™ÊNˆ›ÚYÃBˆYˆ
UURQÔUT“‹\Ý
ÛÜšÜÜXÙRY
JHÃBˆ›ÝÈ™]È\\œ›ÜŠ•ÓÔ’ÔÔPÑWÓQSP‘T”×Ó“ÕÑ“ÕS‘‹¸àëøàï8à«øà®xàæ¸àï8à®xào¸àgøàkøàèxàìøàä8àï9 áyh,xà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ˆŠNÃBˆCBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÙ]ÛÜšÜÜXÙSY[X™\œÊ™\]Y\Ýˆ™\]Y\Ý[Žˆ[‹ÛÜšÜÜXÙRYˆÝš[™ÊNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆ™\]Z\™UÛÜšÜÜXÙRY
ÛÜšÜÜXÙRY
NÃBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠNÃBˆÛÛœÝ^[ØYH]ØZ]Ø[ÛÜšÜÜXÙSY[X™\”œÊBˆ[‹BˆÙ\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[‹Bˆ›\ÝÝÛÜšÜÜXÙWÛY[X™\œÈ‹BˆÈ\™Ù]ÝÛÜšÜÜXÙWÚYˆÛÜšÜÜXÙRYKBˆ˜[ÙCBˆ
NÃBˆYˆ
P\œ˜^Kš\Ð\œ˜^J^[ØY
H^[ØY›[™ÝOOH^[ØY›[™ÝˆPVÕÓÔ’ÔÔPÑWÓQSP‘T—ÓTÕÒUSTÊHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÓQSP‘T”×Ô‘TÔÓ”ÑWÒS•SQ‹¸àèxàìøàä8àï9. :)©øà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝ›ÝÜÈH^[ØY›X\
\œÙUÛÜšÜÜXÙSY[X™\”›ÝÊNÃBˆYˆ
›ÝÜËœÛÛYJ
Y[X™\ŠHOˆY[X™\ˆOOH[
JHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÓQSP‘T”×Ô‘TÔÓ”ÑWÒS•SQ‹¸àèxàìøàä8àï9. :)©øà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝY[X™\œÈH›ÝÜÈ\ÈÛÜšÜÜXÙSY[X™\”œÔ›ÝÖ×NÃBˆÛÛœÝXÝÜ”›ÛHHY[X™\œÖÌOË˜XÝÜ—Ü›ÛNÃBˆÛÛœÝÝ[ÛÝ[HY[X™\œÖÌOËÝ[ØÛÝ[ÃBˆYˆ
BˆZ\ÕÛÜšÜÜXÙT›ÛJXÝÜ”›ÛJHBˆ\[ÙˆÝ[ÛÝ[OOH›[X™\ˆˆS[X™\‹š\ÔØY™R[YÙ\ŠÝ[ÛÝ[
HÝ[ÛÝ[OOHY[X™\œË›[™ÝBˆY[X™\œËœÛÛYJ
Y[X™\ŠHOˆY[X™\‹œÝ]\ÈOOH˜XÝ]™HŠHBˆY[X™\œËœÛÛYJ
Y[X™\ŠHOˆY[X™\‹˜XÝÜ—Ü›ÛHOOHXÝÜ”›ÛHY[X™\‹Ý[ØÛÝ[OOHÝ[ÛÝ[
HBˆ™]ÈÙ]
Y[X™\œË›X\

Y[X™\ŠHOˆY[X™\‹\Ù\—ÚY
JKœÚ^™HOOHY[X™\œË›[™ÝBˆ
HÃBˆ›ÝÈ™]È\\œ›ÜŠL‹•ÓÔ’ÔÔPÑWÓQSP‘T”×Ô‘TÔÓ”ÑWÒS•SQ‹¸àèxàìøàä8àï9. :)©øà¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹¦`ºe¤øà¤¸àb¸àa8ài¸à xà ¸àa¹. 9n©¸àbº*i¸àeøàcøàh8àexàa8à ˆŠNÃBˆCBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÛÜšÜÜXÙRYBˆÝ\œ™[\Ù\”›ÛNˆXÝÜ”›ÛKBˆY[X™\œÎˆY[X™\œË›X\
ÛÜšÜÜXÙSY[X™\”Ý[[X\žJCBˆK[™Yš[™YÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÃBŸCBƒB™[˜Ý[Ûˆ™\]Z\™SX[˜YÙXX›T›ÛJ˜[YNˆ[šÛ›ÝÛŠNˆ˜YZ[ˆˆ™Y]ÜˆˆšY]Ù\ˆˆÃBˆYˆ
˜[YHOOH˜YZ[ˆˆ	‰ˆ˜[YHOOH™Y]Üˆˆ	‰ˆ˜[YHOOHšY]Ù\ˆŠHÃBˆYˆ
˜[YHOOH›ÝÛ™\ˆŠHÃBˆ›ÝÈ™]È\\œ›ÜŠK“ÕÓ‘T—ÕS”Ñ‘T—Ô‘TURT‘Q‹¹ë¨yä!º,«9.îú !xàk¹i"y¦í8àîù`g9«h¸àkøà yl ¹å*8àk¹éîùë¨y¢bùí¦¸àcxàc9b*yå*8àiøàcxà¢øào¸àiú(c8àb8ào¸àføà¤øà ˆŠNÃBˆCBˆ›ÝÈ™]È\\œ›ÜŠ“QSP‘T—Ô“ÓWÒS•SQ‹¹ª*zfd8àkùë¨yä!º !xàîùíê:fáº !xàîúe¬º)©ú !xàbøà¢z`n9¢§¸àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆ™]\›ˆ˜[YNÃBŸCBƒB™[˜Ý[Ûˆ™\]Z\™SY[X™\“]]][Û”™\Ý[
Bˆ^[ØYˆ[šÛ›ÝÛ‹Bˆ^XÝYˆÈ\Ù\’YÎˆÝš[™ÎÈ›ÛNˆ˜YZ[ˆˆ™Y]ÜˆˆšY]Ù\ˆŽÈÝ]\Îˆ˜XÝ]™Hˆœ™[[Ý™YˆCBŠNˆÛÜšÜÜXÙSY[X™\”Ý[[X\žHÃBˆYˆ
P\œ˜^Kš\Ð\œ˜^J^[ØY
H^[ØY›[™ÝOOHJHÃBˆ›ÝÈ™]È\\œ›ÜŠL‹“QSP‘T—ÐÒS‘ÑWÔ‘TÕSÕS’Ó“ÕÓˆ‹¹i"y¦í9íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹. :)©øà¤¹¦í9¥¬8àeøài¹â­¹¡bøà¤¹è®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝY[X™\ˆH\œÙUÛÜšÜÜXÙSY[X™\”›ÝÊ^[ØYÌJNÃBˆYˆ
Bˆ[Y[X™\ˆBˆ
^XÝY\Ù\’YOOH[™Yš[™Y	‰ˆY[X™\‹\Ù\—ÚYOOH^XÝY\Ù\’Y
HBˆY[X™\‹œ›ÛHOOH^XÝYœ›ÛHBˆY[X™\‹œÝ]\ÈOOH^XÝYœÝ]\ÃBˆ
HÃBˆ›ÝÈ™]È\\œ›ÜŠL‹“QSP‘T—ÐÒS‘ÑWÔ‘TÕSÕS’Ó“ÕÓˆ‹¹i"y¦í9íd9§§8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¹. :)©øà¤¹¦í9¥¬8àeøài¹â­¹¡bøà¤¹è®º*£xàeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆ™]\›ˆÛÜšÜÜXÙSY[X™\”Ý[[X\žJY[X™\ŠNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆYÛÜšÜÜXÙSY[X™\Š™\]Y\Ýˆ™\]Y\Ý[Žˆ[‹ÛÜšÜÜXÙRYˆÝš[™ÊNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆ™\]Z\™UÛÜšÜÜXÙRY
ÛÜšÜÜXÙRY
NÃBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠNÃBˆÛÛœÝ›ÙHH]ØZ]™XYœÛÛ›ÙOÈ›Ú[ÛÙOÎˆÝš[™ÎÈ›ÛOÎˆÝš[™ÈOŠ™\]Y\Ý
NÃBˆYˆ
\[Ùˆ›ÙKš›Ú[ÛÙHOOHœÝš[™ÈˆR“ÒS—ÐÓÑWÔUT“‹\Ý
›ÙKš›Ú[ÛÙKš[J
JJHÃBˆ›ÝÈ™]È\\œ›ÜŠK’“ÒS—ÐÓÑWÕSURSP“H‹¹cà¹b¨8à¬øàï8àâxà¤¹b*yå*8àiøàcxào¸àføà¤øà ¹§"yb®y§'úfd8ào¸àgøàkùaiyb¦ùa¡yk®xà¤¹è®º*£xàeøà y§+9.®¸àjùa£yænº(c8à¤¹/§zh/8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝ›Ú[ÛÙHH›ÙKš›Ú[ÛÙKš[J
NÃBˆÛÛœÝ›ÛHH™\]Z\™SX[˜YÙXX›T›ÛJ›ÙKœ›ÛJNÃBˆÛÛœÝ^[ØYH]ØZ]Ø[ÛÜšÜÜXÙSY[X™\”œÊBˆ[‹BˆÙ\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[‹Bˆœ™YY[WÝÛÜšÜÜXÙWÚ›Ú[—ØÛÙH‹BˆÈ\™Ù]ÝÛÜšÜÜXÙWÚYˆÛÜšÜÜXÙRY›Ú[—ØÛÙNˆ›Ú[ÛÙK\™Ù]Ü›ÛNˆ›ÛHKBˆYCBˆ
NÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆY[X™\Žˆ™\]Z\™SY[X™\“]]][Û”™\Ý[
^[ØYÈ›ÛKÝ]\Îˆ˜XÝ]™HˆJCBˆKÈÝ]\ÎˆŒHKÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÃBŸCBƒB˜\Þ[˜È[˜Ý[Ûˆ\]UÛÜšÜÜXÙSY[X™\ŠBˆ™\]Y\Ýˆ™\]Y\ÝBˆ[Žˆ[‹BˆÛÜšÜÜXÙRYˆÝš[™ËBˆ\Ù\’YˆÝš[™ÃBŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆ™\]Z\™UÛÜšÜÜXÙRY
ÛÜšÜÜXÙRY
NÃBˆYˆ
UURQÔUT“‹\Ý
\Ù\’Y
JHÃBˆ›ÝÈ™]È\\œ›ÜŠK“QSP‘T—ÕTUWÕSURSP“H‹¹kïº,hxàèxàìøàä8àï8àk¹â­¹¡bøàc9i"xà£øàhøàgøàgøà y¦í9¥¬8àiøàcxào¸àføà¤øàiøàeøàgøà ¹. :)©øà¤¹¦í9¥¬8àeøài¸àcøàh8àexàa8à ˆŠNÃBˆCBˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠNÃBˆÛÛœÝ›ÙHH]ØZ]™XYœÛÛ›ÙOÈ›ÛOÎˆÝš[™ÎÈÝ]\ÏÎˆÝš[™ÈOŠ™\]Y\Ý
NÃBˆÛÛœÝ›ÛHH™\]Z\™SX[˜YÙXX›T›ÛJ›ÙKœ›ÛJNÃBˆYˆ
›ÙKœÝ]\ÈOOH˜XÝ]™Hˆ	‰ˆ›ÙKœÝ]\ÈOOHœ™[[Ý™YŠHÃBˆ›ÝÈ™]È\\œ›ÜŠ“QSP‘T—ÔÕUT×ÒS•SQ‹¸àèxàìøàä8àï9â­¹¡bøàk¹£!ùk¦¸àc9«høàeøàcøà`¸à¢¸ào¸àføà¤øà ˆŠNÃBˆCBˆÛÛœÝ^[ØYH]ØZ]Ø[ÛÜšÜÜXÙSY[X™\”œÊBˆ[‹BˆÙ\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[‹Bˆ\]WÝÛÜšÜÜXÙWÛY[X™\ˆ‹BˆÃBˆ\™Ù]ÝÛÜšÜÜXÙWÚYˆÛÜšÜÜXÙRYBˆ\™Ù]Ý\Ù\—ÚYˆ\Ù\’YBˆ\™Ù]Ü›ÛNˆ›ÛKBˆ\™Ù]ÜÝ]\Îˆ›ÙKœÝ]\ÃBˆKBˆYCBˆ
NÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆY[X™\Žˆ™\]Z\™SY[X™\“]]][Û”™\Ý[
^[ØYÃBˆ\Ù\’YBˆ›ÛKBˆÝ]\Îˆ›ÙKœÝ]\ÃBˆJCBˆK[™Yš[™YÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÙÛÝ]
™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÂˆ]ØZ]™XYœÛÛ›ÙO™XÛÜ™Ýš[™Ë™]™\Š™\]Y\Ý
NÃBˆÛÛœÝÛÛÚÚY\ÈH\œÙPÛÛÚÚY\Ê™\]Y\ÝYJNÃBˆYˆ
XÛÛÚÚY\Ëš\ÊÓÓÒÒQWÐPÐÑTÔ×ÕÒÑSŠH	‰ˆXÛÛÚÚY\Ëš\ÊÓÓÒÒQWÔ‘Q”‘TÒÕÒÑSŠJHÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈÝ]\Îˆ›ÚÈˆK[™Yš[™YÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
JNÃBˆCBƒBˆ]Ù\ÜÚ[ÛŽˆÙ\ÜÚ[Û”™\Ý[ÃBˆžHÃBˆÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[‹ÛÛÚÚY\ËYJNÃBˆHØ]Ú
\œ›ÜŠHÃBˆYˆ
\œ›Üˆ[œÝ[˜Ù[Ùˆ\\œ›Üˆ	‰ˆ\œ›Ü‹˜ÛÙHOOH”ÑTÔÒSÓ—ÑVT‘QŠHÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈÝ]\Îˆ›ÚÈˆK[™Yš[™YÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
JNÃBˆCBˆ™]\›ˆÙÛÝ]™]›ÚÙQ˜Z[\™T™\ÜÛœÙJ
NÃBˆCBƒBˆ]™\ÜÛœÙNˆ™\ÜÛœÙNÃBˆžHÃBˆ™\ÜÛœÙHH]ØZ]Ý\X˜\ÙQ™]Ú
[‹‹Ø]]ÝŒKÛÙÛÝ]ÜØÛÜO[ØØ[‹ÃBˆY]Ùˆ”ÔÕƒBˆKÙ\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[ŠNÃBˆHØ]ÚÃBˆ™]\›ˆÙÛÝ]™]›ÚÙQ˜Z[\™T™\ÜÛœÙJ
NÃBˆCBƒBˆYˆ
\™\ÜÛœÙK›ÚÊHÃBˆ™]\›ˆÙÛÝ]™]›ÚÙQ˜Z[\™T™\ÜÛœÙJ
NÃBˆCBƒBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈÝ]\Îˆ›ÚÈˆK[™Yš[™YÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
JNÂŸB‚˜\Þ[˜È[˜Ý[ÛˆXØÙ\ÜÓÙÛÝ]
™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÂˆ]ØZ]™XYœÛÛ›ÙO™XÛÜ™Ýš[™Ë™]™\Š™\]Y\Ý
NÂˆžHÂˆ™\]Z\™R[X[XÝÜŠ]ØZ]™\šYžPXØÙ\ÜÒÝ
™\]Y\Ý[ŠJNÂˆHØ]Ú
\œ›ÜŠHÂˆ›ÝÈX\XØÙ\ÜÒY[]Q\œ›ÜŠ\œ›ÜŠNÂˆBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈÝ]\Îˆ›ÚÈ‹™Y\™XÝ\›ˆ‹ØÙ‹XÙÚKØXØÙ\ÜËÛÙÛÝ]ˆJNÂŸBƒB™[˜Ý[ÛˆÙÛÝ]™]›ÚÙQ˜Z[\™T™\ÜÛœÙJ
Nˆ™\ÜÛœÙHÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÛÙNˆ“ÑÓÕUÔ‘U“ÒÑWÑRSQ‹BˆY\ÜØYÙNˆ¸àdøàk¹êëù§*øàk¸àëxà¬8à©8àìù áyh,xàkùbbºfi8àeøào¸àeøàgøàc8à z*£z*/8à­xàï8àä8àï9`m8àk¸àëxà¬8à¨¸à©¸àâ8à¤¹è®º*£xàiøàcxào¸àføà¤øàiøàeøàgøà ¸à ¸àa¹. 9n©¸àëxà¬8à©8àìøàeøài¸àbøà¢xàëxà¬8à¨¸à©¸àâ8àeøài¸àcøàh8àexàa8à ˆƒBˆKÈÝ]\ÎˆLˆKÛX\”Ù\ÜÚ[ÛÛÛÚÚY\Ê
JNÃBŸCBƒB˜\Þ[˜È[˜Ý[ÛˆÛÛ™šYÒX[
™\]Y\Ýˆ™\]Y\Ý[Žˆ[ŠNˆ›ÛZ\ÙO™\ÜÛœÙOˆÂˆYˆ
\ÙPXØÙ\ÜÑT›Ý]\Ê[ŠJHÂˆ]]]ÂˆžHÂˆ]]H]ØZ]]][XØ]P\XØ][Û”™\]Y\Ý
™\]Y\Ý[‹RY[]T™\ÜÚ]ÜžJ[ŠJNÂˆHØ]Ú
\œ›ÜŠHÂˆ›ÝÈX\XØÙ\ÜÒY[]Q\œ›ÜŠ\œ›ÜŠNÂˆBˆYˆ
]]šÚ[™OOH›XXÚ[™HˆZ[œÜXÝXØÙ\ÜÒX[Ù\šXÙUÚÙ[“˜[Y\Ê[ŠKš\Ê]]˜XÝÜ‹˜ÛÛ[[Û“˜[YJJHÂˆ›ÝÈ™]È\\œ›ÜŠËPÐÑTÔ×Ñ“Ô’QSˆ‹¸àdøàk¹¤ãy/g8à¤º(c8àa¹ª*zfd8àc8à`¸à¢¸ào¸àføà¤øà ˆŠNÂˆBˆBˆÛÛœÝÝ\X˜\ÙHH[œÜXÝÝ\X˜\ÙPÛÛ™šYÊ[ŠNÂˆÛÛœÝÈ\Õ\›\Ð[›Û’Ù^HHHÝ\X˜\ÙNÃBˆÛÛœÝ\Ð[ÝÙYÝZ[YÈHÜ]ÜÝŠ[‹‘TÐÓÔ‘ÐSÕÑQÑÕRSÒQÊKœÚ^™HˆÃBˆÛÛœÝ\Ð[ÝÙYÚ[›™[YÈHÜ]ÜÝŠ[‹‘TÐÓÔ‘ÐSÕÑQÐÒS“‘SÒQÊKœÚ^™HˆÃBˆÛÛœÝ[ÝÕ[œØÛÜYÛÛ[X[™ÈH[ÝÕ[œØÛÜY\ØÛÜ™ÛÛ[X[™Ê[ŠNÃBˆÛÛœÝ\ØÛÜ™\ÜÝYPœšYÙPÛÛ™šYÝ\™YH›ÛÛX[ŠBˆ[‹‘TÐÓÔ‘ÔP“P×ÒÑVH	‰ƒBˆ[‹‘ÒUP—ÒTÔÕQWÕÒÑSˆ	‰ƒBˆ[‹‘TÐÓÔ‘ÒS•TPÕSÓ—ÔÕÔ‘H	‰ƒBˆ
[ÝÕ[œØÛÜYÛÛ[X[™È
\Ð[ÝÙYÝZ[YÈ	‰ˆ\Ð[ÝÙYÚ[›™[YÊJCBˆ
NÃBƒBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÙ\šXÙNˆ›YXØÚK[X[X[‹BˆÝ]\Îˆ›ÚÈ‹Bˆ\ÙNˆœ\ÙKLKX]]]ÛÜšÜÜXÙKZ\›™\ÜÈ‹Bˆ[Y\Ý[\ˆ™]È]J
KÒTÓÔÝš[™Ê
KBˆÛÛ™šYÎˆÃBˆÝ\X˜\ÙNˆÃBˆÛÛ™šYÝ\™YˆÝ\X˜\ÙK˜ÛÛ™šYÝ\™YBˆ\Õ\›Bˆ\Ð[›Û’Ù^KBˆ›Ú™XÝ™YŽˆÝ\X˜\ÙKœ›Ú™XÝ™YƒBˆKBˆ\ØÛÜ™ˆÃBˆ\ÜÝYPœšYÙPÛÛ™šYÝ\™Yˆ\ØÛÜ™\ÜÝYPœšYÙPÛÛ™šYÝ\™YBˆ\ÔX›XÒÙ^Nˆ›ÛÛX[Š[‹‘TÐÓÔ‘ÔP“P×ÒÑVJKBˆ\Ò\ÜÝYUÚÙ[Žˆ›ÛÛX[Š[‹‘ÒUP—ÒTÔÕQWÕÒÑSŠKBˆ\Ò\ÜÝYT™\ÜÚ]ÜžNˆ›ÛÛX[Š[‹‘ÒUP—ÒTÔÕQWÔ‘TÔÒUÔ–JKBˆ\Ò[\˜XÝ[Û”ÝÜ™Nˆ›ÛÛX[Š[‹‘TÐÓÔ‘ÒS•TPÕSÓ—ÔÕÔ‘JKBˆ\Ð[ÝÙYÝZ[YËBˆ\Ð[ÝÙYÚ[›™[YËBˆ[ÝÕ[œØÛÜYÛÛ[X[™ÃBˆCBˆCBˆHØ]\ÙšY\ÈÛÛ™šYÒX[™\ÜÛœÙJNÃBŸCBƒB™[˜Ý[Ûˆ˜\ÚXÒX[

Nˆ™\ÜÛœÙHÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÙ\šXÙNˆ›YXØÚK[X[X[‹BˆÝ]\Îˆ›ÚÈ‹Bˆ\ÙNˆœ\ÙKLKX]]]ÛÜšÜÜXÙKZ\›™\ÜÈ‹Bˆ[Y\Ý[\ˆ™]È]J
KÒTÓÔÝš[™Ê
CBˆHØ]\ÙšY\ÈX[™\ÜÛœÙJNÃBŸCBƒB™[˜Ý[ÛˆØ[˜XÚÓZYÜ˜][Û”™\ÜÛœÙJ
Nˆ™\ÜÛœÙHÂˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÛÙNˆÐSPÒ×ÓRQÔUSÓ—ÐÓÑKBˆY\ÜØYÙNˆ¹i%º`ê:`(ù¤.¸àkùéîú(c9.+xàk¸àgøà yãï¹g*9b*yå*8àiøàcxào¸àføà¤øà ˆƒBˆKÈÝ]\ÎˆLÈJNÃBŸB‚™[˜Ý[ÛˆXØÙ\ÜÓYØXÞT›Ý]SZYÜ˜][Û”™\ÜÛœÙJ
Nˆ™\ÜÛœÙHÂˆ™]\›ˆœÛÛ”™\ÜÛœÙJÂˆÛÙNˆPÐÑTÔ×ÓQÐPÖWÔ“ÕUWÓRQÔUSÓ—ÐÓÑKˆY\ÜØYÙNˆº*£z*/8àîøàèxàìøàä8àï9ªgú ïxàkùéîú(c9.+xàk¸àgøà xà yãï¹g*9b*yå*8àiøàcxào¸àføà¤øà ˆ‚ˆKÈÝ]\ÎˆLÈJNÂŸB‚™[˜Ý[Ûˆ\ÓYØXÞTÝ\X˜\ÙT›ÝXÝY›Ý]J]˜[YNˆÝš[™ÊNˆ›ÛÛX[ˆÂˆ™]\›ˆ
ˆ×—Ø\WØ]]ÊÎ›ÙÚ[Ÿ™Yœ™\Ú
IË\Ý
]˜[YJHˆ×—Ø\WÝÛÜšÜÜXÙ\×Ö×‹×J×ÛY[X™\œÊÎ—Ö×‹×JÊOÉË\Ý
]˜[YJBˆ
NÂŸB‚˜\Þ[˜È[˜Ý[Ûˆ›Ý]J™\]Y\Ýˆ™\]Y\Ý[Žˆ[‹ÝÎˆ^XÝ][ÛÛÛ^
Nˆ›ÛZ\ÙO™\ÜÛœÙOˆÂˆÛÛœÝ\›H™]ÈT“
™\]Y\Ý\›
NÂˆYˆ
\ÙPXØÙ\ÜÑT›Ý]\Ê[ŠH	‰ˆ\ÓYØXÞTÝ\X˜\ÙT›ÝXÝY›Ý]J\›œ]˜[YJJHÂˆ™]\›ˆXØÙ\ÜÓYØXÞT›Ý]SZYÜ˜][Û”™\ÜÛœÙJ
NÂˆBˆYˆ
TÐP“QÐÐSPÒ×ÔUËš\Ê\›œ]˜[YJJHÂˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕŠH™]\›ˆØ[˜XÚÓZYÜ˜][Û”™\ÜÛœÙJ
NÃBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÛÙNˆ“QUÑÓ“ÕÐSÕÑQ‹BˆY\ÜØYÙNˆ¸àdøàk¹¤ãy/g8àjøàkùkï¹oç8àeøài¸àa8ào¸àføà¤øà ˆƒBˆKÈÝ]\ÎˆHJNÃBˆCBˆÛÛœÝ\ÐÝ\œ™[\ÜÙ]™\œÚ[ÛˆH\›œÙX\˜Ú\˜[\Ë™Ù]
ˆŠHOOHTÐTÔÑUÕ‘T”ÒSÓŽÃBˆÛÛœÝÛÜšÜÜXÙSY[X™\œÓX]ÚH\›œ]˜[YK›X]Ú
×—Ø\WÝÛÜšÜÜXÙ\×Ê×‹×JÊWÛY[X™\œÉÊNÃBˆÛÛœÝÛÜšÜÜXÙSY[X™\“X]ÚH\›œ]˜[YK›X]Ú
×—Ø\WÝÛÜšÜÜXÙ\×Ê×‹×JÊWÛY[X™\œ×Ê×‹×JÊIÊNÃBƒBˆ™\šYžTØ[YSÜšYÚ[•Üš]J™\]Y\Ý
NÃBƒBˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆ\›œ]˜[YHOOH‹ÈŠH™]\›ˆ[™\ÜÛœÙJTÒS
NÃBˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆ\›œ]˜[YHOOH‹Ø\ÜÙ]ËØ\˜ÜÜÈŠHÃBˆ™]\›ˆ\ÜÙ]™\ÜÛœÙJTÐÔÔË^ØÜÜÎÈÚ\œÙ]]]‹N‹\ÐÝ\œ™[\ÜÙ]™\œÚ[ÛŠNÃBˆCBˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆ\›œ]˜[YHOOH‹Ø\ÜÙ]ËØ\šœÈŠHÃBˆ™]\›ˆ\ÜÙ]™\ÜÛœÙJTÒ”Ë˜\XØ][Û‹Ú˜]˜\ØÜš\ÈÚ\œÙ]]]‹N‹\ÐÝ\œ™[\ÜÙ]™\œÚ[ÛŠNÃBˆCBˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆ\›œ]˜[YHOOH‹ÚX[ŠH™]\›ˆ˜\ÚXÒX[

NÃBˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆ\›œ]˜[YHOOH‹ÚX[ØÛÛ™šYÈŠH™]\›ˆÛÛ™šYÒX[
™\]Y\Ý[ŠNÂˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆ\›œ]˜[YHOOH‹Ø\KÜÙ\ÜÚ[ÛˆŠHÂˆ™]\›ˆ\ÙPXØÙ\ÜÑT›Ý]\Ê[ŠHÈÙ]TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠHˆÙ]Ù\ÜÚ[ÛŠ™\]Y\Ý[ŠNÂˆBˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕˆ	‰ˆ\›œ]˜[YHOOH‹Ø\KØ]]ÛÙÚ[ˆŠH™]\›ˆÙÚ[Š™\]Y\Ý[ŠNÃBˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕˆ	‰ˆ\›œ]˜[YHOOH‹Ø\KØ]]Ü™Yœ™\ÚŠH™]\›ˆ™Yœ™\Ú]][XØ][ÛŠ™\]Y\Ý[ŠNÃBˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕˆ	‰ˆ\›œ]˜[YHOOH‹Ø\KØ]]ÛÙÛÝ]ŠHÂˆ™]\›ˆ\ÙPXØÙ\ÜÑT›Ý]\Ê[ŠHÈXØÙ\ÜÓÙÛÝ]
™\]Y\Ý[ŠHˆÙÛÝ]
™\]Y\Ý[ŠNÂˆBˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆ\›œ]˜[YHOOH‹Ø\KÝÛÜšÜÜXÙ\ÈŠHÂˆYˆ
\ÙPXØÙ\ÜÑT›Ý]\Ê[ŠJH™]\›ˆ\ÝUÛÜšÜÜXÙ\Ê™\]Y\Ý[ŠNÂˆÛÛœÝÙ\ÜÚ[ÛˆH]ØZ]™\]Z\™TÙ\ÜÚ[ÛŠ™\]Y\Ý[ŠNÂˆ™]\›ˆœÛÛ”™\ÜÛœÙJÈÛÜšÜÜXÙ\Îˆ]ØZ]™]ÚÛÜšÜÜXÙ\Ê[‹Ù\ÜÚ[Û‹˜XØÙ\ÜÕÚÙ[ŠHK[™Yš[™YÙ\ÜÚ[Û‹œ™\ÜÛœÙPÛÛÚÚY\ÊNÂˆBˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕˆ	‰ˆ\›œ]˜[YHOOH‹Ø\KÝÛÜšÜÜXÙ\ÈŠHÂˆ™]\›ˆ\ÙPXØÙ\ÜÑT›Ý]\Ê[ŠHÈÜ™X]QUÛÜšÜÜXÙJ™\]Y\Ý[ŠHˆÜ™X]UÛÜšÜÜXÙJ™\]Y\Ý[ŠNÂˆBˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕˆ	‰ˆ\›œ]˜[YHOOH‹Ø\KÛY[X™\‹Z›Ú[‹XÛÙHŠHÂˆ™]\›ˆ\ÙPXØÙ\ÜÑT›Ý]\Ê[ŠHÈÜ™X]QUÛÜšÜÜXÙR›Ú[ÛÙJ™\]Y\Ý[ŠHˆÜ™X]UÛÜšÜÜXÙR›Ú[ÛÙJ™\]Y\Ý[ŠNÂˆBˆYˆ
™\]Y\Ý›Y]ÙOOH‘ÑUˆ	‰ˆÛÜšÜÜXÙSY[X™\œÓX]ÚË–ÌWJHÃBˆ™]\›ˆÙ]ÛÜšÜÜXÙSY[X™\œÊ™\]Y\Ý[‹ÛÜšÜÜXÙSY[X™\œÓX]ÚÌWJNÃBˆCBˆYˆ
™\]Y\Ý›Y]ÙOOH”ÔÕˆ	‰ˆÛÜšÜÜXÙSY[X™\œÓX]ÚË–ÌWJHÃBˆ™]\›ˆYÛÜšÜÜXÙSY[X™\Š™\]Y\Ý[‹ÛÜšÜÜXÙSY[X™\œÓX]ÚÌWJNÃBˆCBˆYˆ
™\]Y\Ý›Y]ÙOOH”UÒˆ	‰ˆÛÜšÜÜXÙSY[X™\“X]ÚË–ÌWH	‰ˆÛÜšÜÜXÙSY[X™\“X]ÚÌ—JHÃBˆ™]\›ˆ\]UÛÜšÜÜXÙSY[X™\Š™\]Y\Ý[‹ÛÜšÜÜXÙSY[X™\“X]ÚÌWKÛÜšÜÜXÙSY[X™\“X]ÚÌ—JNÃBˆCBƒBˆ™]\›ˆœÛÛ”™\ÜÛœÙJÃBˆÛÙNˆ““ÕÑ“ÕS‘‹BˆY\ÜØYÙNˆ¹£!ùk¦¸àexà£8àgøàæ¸àï8à®8ào¸àgøàkÐTxàc:)¢øài8àbøà¢¸ào¸àføà¤øà ˆƒBˆKÈÝ]\ÎˆJNÃBŸCBƒB™^ÜY˜][ÃBˆ\Þ[˜È™]Ú
™\]Y\Ýˆ™\]Y\Ý[Žˆ[‹Ýˆ^XÝ][ÛÛÛ^
Nˆ›ÛZ\ÙO™\ÜÛœÙOˆÃBˆžHÃBˆ™]\›ˆ]ØZ]›Ý]J™\]Y\Ý[‹Ý
NÃBˆHØ]Ú
\œ›ÜŠHÃBˆ™]\›ˆ\œ›Ü”™\ÜÛœÙJ\œ›ÜŠNÃBˆCBˆCBŸHØ]\ÙšY\È^ÜY[™\[ŽÃB