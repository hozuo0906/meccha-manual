export const APP_ASSET_VERSION = "sha256-39c1cb087bfba340";

export const APP_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>めっちゃマニュアル</title>
  <link rel="stylesheet" href="/assets/app.css?v=${APP_ASSET_VERSION}">
</head>
<body>
  <a class="skip-link" href="#screen-content">本文へ移動</a>
  <main class="app">
    <div id="app">
    <section id="screen-content" class="boot" role="status" aria-live="polite" aria-busy="true" tabindex="-1">
      <div class="logo-mark" aria-hidden="true"><span>め</span></div>
      <p>ワークスペースを読み込んでいます</p>
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
const manualStatusLabels = {
  draft: "下書き",
  reviewing: "確認中",
  published: "公開済み",
  stale: "要更新",
  archived: "アーカイブ"
};
const manualStepTypeLabels = {
  action: "操作",
  note: "補足",
  decision: "判断",
  warning: "注意"
};
const manualActionTypeLabels = {
  click: "クリック",
  input: "入力",
  select: "選択",
  navigate: "移動",
  wait: "待機",
  other: "その他"
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
      // 認可はサーバーと最新一覧で行うため、削除不能でも権限境界には使わない。
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
    // 保存内容を読めない場合も認可へ利用せず、現在タブのメモリだけを使う。
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
    // ワークスペース名は保存せず、保存不能時は現在ページ内だけを安全側でロックする。
  }
}

function clearUncertainWorkspaceCreation() {
  uncertainWorkspaceCreation = null;
  try {
    sessionStorage.removeItem(uncertainWorkspaceStorageKey);
  } catch {
    // 認証主体と最新一覧の照合を優先する。
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
      "このブラウザでは安全にログイン状態を変更できません。最新版のChromeでお試しください。",
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
      "このブラウザでは安全にログイン状態を変更できません。最新版のChromeでお試しください。",
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
      "このブラウザでは安全にログイン状態を変更できません。最新版のChromeでお試しください。",
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
    "ログイン状態が別のタブで変更されたため、この操作は実行しませんでした。画面を確認して、もう一度お試しください。",
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
      await requestJson("/api/auth/logout", { method: "POST", body: "{}" }, false);
      announceAuthenticationChange();
      return true;
    } catch (error) {
      if (error.code === "LOGOUT_REVOKE_FAILED") announceAuthenticationChange();
      throw error;
    }
  });
}

function renderAuthenticationReload() {
  app.innerHTML =
    '<section id="screen-content" class="boot" tabindex="-1" role="status" aria-live="polite">' +
      '<div class="logo-mark" aria-hidden="true"><span>め</span></div>' +
      '<p>ログイン状態を更新しています</p>' +
    '</section>';
}

authenticationChannel?.addEventListener("message", (event) => {
  if (event.data?.type !== "authentication-changed") return;
  // 次のsessionを取得するまでは同一ユーザーの再ログインか判定できない。
  // 表示と進行中応答だけを無効化し、ユーザー固有の選択・結果不明ロックは
  // replaceCurrentSessionで主体変更を確認できた場合にだけ破棄する。
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
  active: "利用中",
  suspended: "停止中",
  deleted: "削除済み"
};

const workspaceRoleLabels = {
  owner: "管理責任者",
  admin: "管理者",
  editor: "編集者",
  viewer: "閲覧者"
};

const workspaceMemberStatusLabels = {
  active: "利用中",
  invited: "招待中",
  removed: "停止済み"
};

function resolveCurrentWorkspace(session) {
  const activeWorkspaces = (session.workspaces || []).filter((workspace) => workspace.status === "active");
  if (!session.user?.id || activeWorkspaces.length === 0) {
    currentWorkspaceSelection = null;
    try {
      sessionStorage.removeItem(currentWorkspaceStorageKey);
    } catch {
      // 保存領域が使えなくても選択は認可に利用しない。
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
    // 選択はタブ内メモリでも維持できるため、保存不能を画面全体の失敗にしない。
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
    // タブ内メモリで現在画面と再描画後の選択を維持する。
  }
  renderShell(currentSession, "現在のワークスペースを「" + selected.name + "」に変更しました。");
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
      "サーバーに接続できませんでした。通信環境を確認して、もう一度お試しください。",
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
      "サーバーから正しい応答を受け取れませんでした。時間をおいて、もう一度お試しください。",
      response.status,
      "INVALID_RESPONSE"
    );
  }

  let text;
  try {
    text = await response.text();
  } catch {
    throw new AppRequestError(
      "サーバーから正しい応答を受け取れませんでした。時間をおいて、もう一度お試しください。",
      response.status,
      "INVALID_RESPONSE"
    );
  }
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    throw new AppRequestError(
      "サーバーから正しい応答を受け取れませんでした。時間をおいて、もう一度お試しください。",
      response.status,
      "INVALID_RESPONSE"
    );
  }
  if (!response.ok) {
    throw new AppRequestError(
      payload.message || "処理に失敗しました。",
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
  if (!email.value.trim()) return "メールアドレスを入力してください。";
  if (email.validity.typeMismatch) {
    return "メールアドレスの形式を確認してください。";
  }
  if (!password.value) return "パスワードを入力してください。";
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
  setWorkspaceLimitError(field, "ワークスペース名は64文字以内で入力してください。");
  return true;
}

function limitWorkspaceSlugLength(field) {
  const rawValue = String(field?.value || "");
  const normalizedValue = rawValue.trim();
  if (normalizedValue.length <= 63) return false;
  const leadingWhitespace = rawValue.match(/^\\s*/u)?.[0] || "";
  const trailingWhitespace = rawValue.match(/\\s*$/u)?.[0] || "";
  field.value = leadingWhitespace + normalizedValue.slice(0, 63) + trailingWhitespace;
  setWorkspaceLimitError(field, "URL用IDは63文字以内で入力してください。");
  return true;
}

function validateWorkspaceForm(form) {
  const name = String(form.elements.name?.value || "").trim();
  const slug = String(form.elements.slug?.value || "").trim().toLowerCase();
  if (!name || workspaceNameLength(name) > 64) {
    return { field: form.elements.name, message: "ワークスペース名は1〜64文字で入力してください。" };
  }
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(slug)) {
    return { field: form.elements.slug, message: "URL用IDは半角英数字とハイフンで3〜63文字にしてください。" };
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

  const invalidField = validationMessage.includes("メールアドレス") ? email : password;
  invalidField.setAttribute("aria-invalid", "true");
  invalidField.setAttribute("aria-describedby", "login-message");
}

function renderLogin(message = "") {
  app.innerHTML =
    '<section id="screen-content" class="login-screen" aria-labelledby="service-title" tabindex="-1">' +
      '<div class="login-intro">' +
        '<div class="login-copy">' +
          '<div class="logo-mark" aria-hidden="true"><span>め</span></div>' +
          '<p class="eyebrow">日本のオフィスワーカー専用</p>' +
          '<h1 id="service-title">めっちゃマニュアル</h1>' +
          '<p>業務の手順をわかりやすく整理し、チームで共有するためのサービスです。</p>' +
        '</div>' +
      '</div>' +
      '<div class="login-panel">' +
        '<div class="panel-heading">' +
          '<h2>ログイン</h2>' +
          '<p>登録済みのメールアドレスとパスワードを入力してください。</p>' +
        '</div>' +
        '<form id="login-form" class="form" novalidate>' +
          '<div id="login-message" class="error-box' + (message ? ' show' : '') + '" role="alert" aria-live="assertive" aria-atomic="true" tabindex="-1">' + escapeHtml(message) + '</div>' +
          '<div class="field">' +
            '<label for="email">メールアドレス</label>' +
            '<input id="email" name="email" type="email" autocomplete="email" maxlength="254" required>' +
          '</div>' +
          '<div class="field">' +
            '<label for="password">パスワード</label>' +
            '<input id="password" name="password" type="password" autocomplete="current-password" required>' +
          '</div>' +
          '<button class="primary-button" type="submit">ログイン</button>' +
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
    button.textContent = "ログイン中";
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
      button.textContent = "ログイン";
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
      '<div class="logo-mark" aria-hidden="true"><span>め</span></div>' +
      '<h1>' + escapeHtml(title) + '</h1>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<button id="retry-button" class="primary-button" type="button">もう一度読み込む</button>' +
    '</section>';
  const retryButton = document.getElementById("retry-button");
  retryButton.addEventListener("click", async () => {
    retryButton.disabled = true;
    retryButton.textContent = "読み込み中";
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
      (member.joinedAt === null || (typeof member.joinedAt === "string" && !Number.isNaN(Date.parse(member.joinedAt))))
    );
}

function memberMessageHtml(state) {
  if (!state?.message) return '<div id="members-message" class="error-box" role="status" aria-live="polite" tabindex="-1"></div>';
  const className = state.messageKind === "error" ? "error-box show" :
    state.messageKind === "warning" ? "warning-box show" : "notice-box show";
  const role = state.messageKind === "error" ? "alert" : "status";
  return '<div id="members-message" class="' + className + '" role="' + role + '" aria-live="' + (state.messageKind === "error" ? "assertive" : "polite") + '" aria-atomic="true" tabindex="-1">' + escapeHtml(state.message) + '</div>';
}

function clearExpiredWorkspaceJoinCode() {
  if (!workspaceJoinCodeState.joinCode || !workspaceJoinCodeState.expiresAt) return false;
  if (Date.parse(workspaceJoinCodeState.expiresAt) > Date.now()) return false;
  workspaceJoinCodeState = {
    status: "expired",
    joinCode: "",
    expiresAt: "",
    message: "参加コードの有効期限が切れました。新しいコードを発行してください。"
  };
  if (workspaceJoinCodeExpiryTimer !== null) clearTimeout(workspaceJoinCodeExpiryTimer);
  workspaceJoinCodeExpiryTimer = null;
  return true;
}

function scheduleWorkspaceJoinCodeExpiry() {
  if (workspaceJoinCodeExpiryTimer !== null) clearTimeout(workspaceJoinCodeExpiryTimer);
  workspaceJoinCodeExpiryTimer = null;
  if (!workspaceJoinCodeState.joinCode || !workspaceJoinCodeState.expiresAt) return;
  const delay = Math.max(0, Date.parse(workspaceJoinCodeState.expiresAt) - Date.now());
  workspaceJoinCodeExpiryTimer = setTimeout(() => {
    workspaceJoinCodeExpiryTimer = null;
    if (clearExpiredWorkspaceJoinCode()) renderShell(currentSession, "", "notice", "join-code-message");
  }, delay);
}

function renderWorkspaceJoinCodeIssuer() {
  clearExpiredWorkspaceJoinCode();
  const state = workspaceJoinCodeState;
  const issuing = state.status === "issuing";
  const code = state.joinCode
    ? '<div class="notice-box show" role="status"><p><strong>参加コード</strong></p><p><code id="workspace-join-code">' + escapeHtml(state.joinCode) + '</code></p><p class="muted">有効期限：' + escapeHtml(new Date(state.expiresAt).toLocaleString("ja-JP")) + '</p><button id="copy-join-code-button" class="secondary-button compact-button" type="button">コードをコピー</button></div>'
    : '';
  const message = state.message
    ? '<div id="join-code-message" class="' + (state.status === "error" ? 'error-box show' : state.status === "expired" ? 'warning-box show' : 'notice-box show') + '" role="' + (state.status === "error" ? 'alert' : 'status') + '" aria-live="' + (state.status === "error" ? 'assertive' : 'polite') + '" aria-atomic="true" tabindex="-1">' + escapeHtml(state.message) + '</div>'
    : '<div id="join-code-message" class="notice-box" role="status" tabindex="-1"></div>';
  return '<section class="section join-code-section" aria-labelledby="join-code-heading" aria-describedby="join-code-warning"' + (issuing ? ' aria-busy="true"' : '') + '>' +
    '<div class="section-header"><div><h2 id="join-code-heading">自分の参加コード</h2><p class="muted">ワークスペースへ参加するときに発行します。コードは10分間・1回だけ有効です。</p></div></div>' +
    '<div id="join-code-warning" class="warning-box show"><strong>参加コードは秘密情報です。</strong>コードを受け取った管理者は、その管理者が管理する任意のワークスペースへ、あなたを選択した権限で1回追加できます。参加先を確認し、信頼できる管理者1人へ安全な1対1の方法で渡してください。グループチャットや共有チャンネルには送らないでください。</div>' +
    message + code +
    '<button id="issue-join-code-button" class="secondary-button" type="button"' + (issuing ? ' disabled' : '') + '>' + (issuing ? '発行中' : state.joinCode ? '新しいコードを発行' : '参加コードを発行') + '</button>' +
    (state.joinCode ? '<p class="muted">新しく発行すると、現在のコードは無効になります。</p>' : '') +
  '</section>';
}

function workspaceMemberRows(state) {
  const canManage = state.currentUserRole === "owner" || state.currentUserRole === "admin";
  const saving = state.status === "saving";
  return state.members.map((member) => {
    const stopControl = member.userId === currentSession?.user?.id
      ? '<span class="muted">自分自身の利用停止はできません</span>'
      : '<button id="member-stop-' + escapeHtml(member.userId) + '" class="danger-button compact-button" type="button"' + (saving ? ' disabled' : '') + '><span class="visually-hidden">' + escapeHtml(member.displayName) + 'さんの</span>利用を停止</button>';
    const roleControl = canManage && member.role !== "owner" && member.status === "active"
      ? '<div class="member-actions">' +
          '<label class="visually-hidden" for="member-role-' + escapeHtml(member.userId) + '">' + escapeHtml(member.displayName) + 'さんの権限</label>' +
          '<select id="member-role-' + escapeHtml(member.userId) + '" class="inline-select" aria-describedby="member-role-help"' + (saving ? ' disabled' : '') + '>' +
            ['admin', 'editor', 'viewer'].map((role) =>
              '<option value="' + role + '"' + (member.role === role ? ' selected' : '') + '>' + escapeHtml(workspaceRoleLabels[role]) + '</option>'
            ).join('') +
          '</select>' +
          '<button id="member-save-' + escapeHtml(member.userId) + '" class="secondary-button compact-button" type="button"' + (saving ? ' disabled' : '') + '><span class="visually-hidden">' + escapeHtml(member.displayName) + 'さんの</span>権限を保存</button>' +
          stopControl +
        '</div>'
      : '<span class="muted">' + (member.role === "owner" ? '専用の移管手続きが必要です' : '変更できません') + '</span>';
    return '<tr>' +
      '<td><div class="workspace-name">' + escapeHtml(member.displayName) + '</div>' +
        (member.userId === currentSession?.user?.id ? '<span class="muted">あなた</span>' : '') + '</td>' +
      '<td><span class="badge">' + escapeHtml(workspaceRoleLabels[member.role] || "権限不明") + '</span></td>' +
      '<td><span class="badge">' + escapeHtml(workspaceMemberStatusLabels[member.status] || "状態不明") + '</span></td>' +
      '<td>' + roleControl + '</td>' +
    '</tr>';
  }).join('');
}

function renderWorkspaceMembers(currentWorkspace) {
  if (!currentWorkspace || !workspaceMembersState) {
    return '<section class="section members-section" aria-labelledby="members-heading">' +
      '<div class="section-header"><h2 id="members-heading" tabindex="-1">メンバー管理</h2></div>' +
      '<div class="empty">利用中のワークスペースを選択するとメンバーを確認できます。</div>' +
    '</section>';
  }
  const state = workspaceMembersState;
  if (state.status === "idle") {
    return '<section class="section members-section" aria-labelledby="members-heading">' +
      '<div class="section-header"><div><h2 id="members-heading" tabindex="-1">メンバー管理</h2><p class="muted">現在のワークスペース：' + escapeHtml(currentWorkspace.name) + '</p></div></div>' +
      '<p>所属メンバーと権限を確認します。</p>' +
      '<button id="members-reload-button" class="secondary-button" type="button">メンバー一覧を表示</button>' +
    '</section>';
  }
  if (state.status === "loading") {
    return '<section class="section members-section" aria-labelledby="members-heading" aria-busy="true">' +
      '<div class="section-header"><h2 id="members-heading" tabindex="-1">メンバー管理</h2></div>' +
      '<div id="members-loading-status" class="empty" role="status" aria-live="polite" aria-atomic="true" tabindex="-1">メンバーを読み込んでいます。</div>' +
    '</section>';
  }
  if (state.status === "error") {
    return '<section class="section members-section" aria-labelledby="members-heading">' +
      '<div class="section-header"><h2 id="members-heading" tabindex="-1">メンバー管理</h2></div>' +
      memberMessageHtml(state) +
      '<button id="members-reload-button" class="secondary-button" type="button">もう一度読み込む</button>' +
    '</section>';
  }
  const canManage = state.currentUserRole === "owner" || state.currentUserRole === "admin";
  const saving = state.status === "saving";
  const rows = workspaceMemberRows(state);
  const addDraftJoinCode = escapeHtml(state.addDraftJoinCode || "");
  const addJoinCodeError = state.addJoinCodeError || "";
  const roleHelp = '<p id="member-role-help" class="muted permission-note">管理者：メンバー管理と設定ができます。編集者：手順書を作成・編集できます。閲覧者：手順書の閲覧だけができます。</p>';
  return '<section class="section members-section" aria-labelledby="members-heading"' + (saving ? ' aria-busy="true"' : '') + '>' +
    '<div class="section-header"><div><h2 id="members-heading" tabindex="-1">メンバー管理</h2><p class="muted">現在のワークスペース：' + escapeHtml(currentWorkspace.name) + '</p></div>' +
      '<div class="member-header-actions"><span class="badge">' + state.members.length + '件</span><button id="members-reload-button" class="secondary-button compact-button" type="button"' + (saving ? ' disabled' : '') + '>一覧を更新</button></div></div>' +
    memberMessageHtml(state) +
    (canManage ? roleHelp : '') +
    (state.members.length
      ? '<div class="table-scroll" role="region" tabindex="0" aria-label="ワークスペースメンバー一覧"><table class="table"><caption class="visually-hidden">ワークスペースメンバー一覧</caption><thead><tr><th scope="col">名前</th><th scope="col">権限</th><th scope="col">状態</th><th scope="col">操作</th></tr></thead><tbody>' + rows + '</tbody></table></div>'
      : '<div class="empty">メンバーがいません。</div>') +
    (canManage
      ? '<form id="member-add-form" class="member-add-form" novalidate>' +
          '<h3>参加コードでメンバーを追加</h3>' +
          '<p class="muted">追加する本人が発行した10分間有効の参加コードを入力してください。コードは成功時に1回だけ使用されます。</p>' +
          '<div class="member-add-grid">' +
            '<div class="field"><label for="member-join-code">参加コード</label><input id="member-join-code" name="memberJoinCode" type="text" autocomplete="off" spellcheck="false" data-max-normalized-length="47" required value="' + addDraftJoinCode + '"' + (addJoinCodeError ? ' aria-invalid="true" aria-describedby="member-join-code-error"' : '') + (saving ? ' disabled' : '') + '><span id="member-join-code-error" class="field-error" role="alert" aria-live="assertive" aria-atomic="true"' + (addJoinCodeError ? '' : ' hidden') + '>' + escapeHtml(addJoinCodeError) + '</span></div>' +
            '<div class="field"><label for="member-role">権限</label><select id="member-role" name="memberRole" aria-describedby="member-role-help"' + (saving ? ' disabled' : '') + '><option value="editor">編集者</option><option value="viewer">閲覧者</option><option value="admin">管理者</option></select></div>' +
            '<button class="primary-button" type="submit"' + (saving ? ' disabled' : '') + '>' + (saving ? '保存中' : 'メンバーを追加') + '</button>' +
          '</div>' +
        '</form>'
      : '<p class="muted permission-note">現在の権限は「' + escapeHtml(workspaceRoleLabels[state.currentUserRole]) + '」です。メンバーの変更は管理責任者または管理者へ依頼してください。</p>') +
  '</section>';
}

async function loadWorkspaceMembers(workspaceId, options = {}) {
  const userId = currentSession?.user?.id;
  if (!userId || currentWorkspaceSelection?.workspaceId !== workspaceId) return;
  const requestGeneration = sessionGeneration;
  const requestSequence = ++workspaceMemberRequestSequence;
  const previousMembers = workspaceMembersState?.workspaceId === workspaceId ? workspaceMembersState.members : [];
  workspaceMembersState = {
    userId,
    workspaceId,
    status: "loading",
    currentUserRole: workspaceMembersState?.currentUserRole || null,
    members: previousMembers,
    message: "",
    addDraftJoinCode: workspaceMembersState?.addDraftJoinCode || "",
    addJoinCodeError: workspaceMembersState?.addJoinCodeError || ""
  };
  if (!options.alreadyRendered) renderShell(currentSession, "", "notice", "members-loading-status");
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/members");
    if (
      requestGeneration !== sessionGeneration || requestSequence !== workspaceMemberRequestSequence ||
      currentSession?.user?.id !== userId || currentWorkspaceSelection?.workspaceId !== workspaceId
    ) return;
    if (!validWorkspaceMembersPayload(payload, workspaceId)) {
      throw new AppRequestError("メンバー一覧を確認できませんでした。時間をおいて、もう一度お試しください。", 502, "WORKSPACE_MEMBERS_RESPONSE_INVALID");
    }
    workspaceMembersState = {
      userId,
      workspaceId,
      status: "loaded",
      currentUserRole: payload.currentUserRole,
      members: payload.members,
      message: options.message || "",
      messageKind: options.messageKind || "notice",
      addDraftJoinCode: workspaceMembersState?.addDraftJoinCode || "",
      addJoinCodeError: workspaceMembersState?.addJoinCodeError || ""
    };
    if (
      pendingWorkspaceMemberMutation?.userId === userId &&
      pendingWorkspaceMemberMutation.workspaceId === workspaceId
    ) {
      pendingWorkspaceMemberMutation = null;
    }
    renderShell(currentSession, "", "notice", options.focusId || null);
  } catch (error) {
    if (requestGeneration !== sessionGeneration || requestSequence !== workspaceMemberRequestSequence) return;
    if (isTerminalSessionError(error)) {
      await loadSession();
      return;
    }
    const preserveKnownRole = error.status === 0 || error.status === 429 || error.status >= 500;
    workspaceMembersState = {
      userId,
      workspaceId,
      status: "error",
      currentUserRole: preserveKnownRole ? workspaceMembersState?.currentUserRole || null : null,
      members: [],
      message: error.status === 404
        ? "ワークスペースへの所属を確認できませんでした。一覧を更新してください。"
        : error.message,
      messageKind: "error",
      addDraftJoinCode: workspaceMembersState?.addDraftJoinCode || "",
      addJoinCodeError: workspaceMembersState?.addJoinCodeError || ""
    };
    renderShell(currentSession, "", "notice", "members-message");
  }
}

async function addWorkspaceMember(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const workspaceId = workspaceMembersState?.workspaceId;
  const joinCodeField = form.elements.memberJoinCode;
  const roleField = form.elements.memberRole;
  const joinCode = String(joinCodeField?.value || "").trim();
  workspaceMembersState.addDraftJoinCode = String(joinCodeField?.value || "");
  if (!/^mmj_[A-Za-z0-9_-]{43}$/.test(joinCode)) {
    workspaceMembersState.addJoinCodeError = "参加コードの形式を確認してください。";
    workspaceMembersState.message = "入力内容を確認してください。";
    workspaceMembersState.messageKind = "error";
    renderShell(currentSession, "", "notice", "member-join-code");
    return;
  }
  workspaceMembersState.addJoinCodeError = "";
  if (roleField.value === "admin" && !confirm("管理者はメンバーの追加・権限変更・利用停止を行えます。この権限で追加しますか？")) return;
  // A join code is a bearer secret. Remove it from the DOM/state before any
  // network result, including ambiguous or failed redemption.
  workspaceMembersState.addDraftJoinCode = "";
  await changeWorkspaceMember(
    workspaceId,
    "/api/workspaces/" + encodeURIComponent(workspaceId) + "/members",
    { method: "POST", body: JSON.stringify({ joinCode, role: roleField.value }) },
    "メンバーを追加しました。"
  );
}

function clearWorkspaceMemberJoinCodeError(field) {
  if (!workspaceMembersState) return;
  workspaceMembersState.addDraftJoinCode = String(field?.value || "");
  workspaceMembersState.addJoinCodeError = "";
  field?.removeAttribute?.("aria-invalid");
  field?.removeAttribute?.("aria-describedby");
  const error = document.getElementById("member-join-code-error");
  if (error) {
    error.textContent = "";
    error.hidden = true;
  }
}

function limitWorkspaceMemberJoinCodeLength(field) {
  const rawValue = String(field?.value || "");
  const normalizedValue = rawValue.trim();
  if (normalizedValue.length <= 47) return false;
  const leadingWhitespace = rawValue.match(/^\\s*/u)?.[0] || "";
  const trailingWhitespace = rawValue.match(/\\s*$/u)?.[0] || "";
  field.value = leadingWhitespace + normalizedValue.slice(0, 47) + trailingWhitespace;
  if (workspaceMembersState) {
    workspaceMembersState.addDraftJoinCode = field.value;
    workspaceMembersState.addJoinCodeError = "参加コードは47文字以内で入力してください。";
  }
  field.setAttribute?.("aria-invalid", "true");
  field.setAttribute?.("aria-describedby", "member-join-code-error");
  const error = document.getElementById("member-join-code-error");
  if (error) {
    error.textContent = "参加コードは47文字以内で入力してください。";
    error.hidden = false;
    error.setAttribute?.("role", "alert");
    error.setAttribute?.("aria-live", "assertive");
    error.setAttribute?.("aria-atomic", "true");
  }
  return true;
}

async function finalizeWorkspaceJoinCodeIssuance(issuance) {
  if (
    pendingWorkspaceJoinCodeIssuance !== issuance ||
    issuance.authReconciled !== true ||
    currentSession?.user?.id !== issuance.userId
  ) {
    if (pendingWorkspaceJoinCodeIssuance !== issuance) issuance.payload = null;
    return;
  }
  pendingWorkspaceJoinCodeIssuance = null;
  if (issuance.error) {
    if (isTerminalSessionError(issuance.error)) {
      workspaceJoinCodeState = { status: "idle", joinCode: "", expiresAt: "", message: "" };
      await loadSession();
      return;
    }
    workspaceJoinCodeState = { status: "error", joinCode: "", expiresAt: "", message: issuance.error.message };
    renderShell(currentSession, "", "notice", "join-code-message");
    return;
  }
  const payload = issuance.payload;
  issuance.payload = null;
  if (
    !payload || typeof payload.joinCode !== "string" || !/^mmj_[A-Za-z0-9_-]{43}$/.test(payload.joinCode) ||
    typeof payload.expiresAt !== "string" || Number.isNaN(Date.parse(payload.expiresAt))
  ) {
    workspaceJoinCodeState = {
      status: "error",
      joinCode: "",
      expiresAt: "",
      message: "参加コードを確認できませんでした。もう一度発行すると、以前のコードは無効になります。"
    };
    renderShell(currentSession, "", "notice", "join-code-message");
    return;
  }
  workspaceJoinCodeState = {
    status: "ready",
    joinCode: payload.joinCode,
    expiresAt: payload.expiresAt,
    message: "参加コードを発行しました。参加したいワークスペースの信頼できる管理者へ、1対1で渡してください。"
  };
  scheduleWorkspaceJoinCodeExpiry();
  renderShell(currentSession, "", "notice", "join-code-message");
}

async function issueWorkspaceJoinCode() {
  if (workspaceJoinCodeState.status === "issuing") return;
  if (
    workspaceJoinCodeState.joinCode &&
    !confirm("新しい参加コードを発行すると、現在のコードはすぐに無効になります。新しく発行しますか？")
  ) return;
  const userId = currentSession?.user?.id;
  if (!userId) return;
  const issuance = { userId, settled: false, authReconciled: true, payload: null, error: null };
  pendingWorkspaceJoinCodeIssuance = issuance;
  if (workspaceJoinCodeExpiryTimer !== null) clearTimeout(workspaceJoinCodeExpiryTimer);
  workspaceJoinCodeExpiryTimer = null;
  workspaceJoinCodeState = { status: "issuing", joinCode: "", expiresAt: "", message: "参加コードを発行しています。" };
  renderShell(currentSession, "", "notice", "join-code-message");
  try {
    issuance.payload = await requestJson("/api/member-join-code", { method: "POST", body: "{}" });
  } catch (error) {
    issuance.error = error;
  }
  issuance.settled = true;
  await finalizeWorkspaceJoinCodeIssuance(issuance);
}

async function copyWorkspaceJoinCode() {
  if (clearExpiredWorkspaceJoinCode()) {
    renderShell(currentSession, "", "notice", "join-code-message");
    return;
  }
  const joinCode = workspaceJoinCodeState.joinCode;
  if (!joinCode) return;
  try {
    await navigator.clipboard.writeText(joinCode);
    workspaceJoinCodeState.message = "参加コードをコピーしました。";
    renderShell(currentSession, "", "notice", "join-code-message");
  } catch {
    workspaceJoinCodeState.message = "コピーできませんでした。表示中のコードを選択してコピーしてください。";
    workspaceJoinCodeState.status = "error";
    renderShell(currentSession, "", "notice", "join-code-message");
  }
}

async function updateWorkspaceMemberFromUi(userId, stop) {
  const workspaceId = workspaceMembersState?.workspaceId;
  const member = workspaceMembersState?.members.find((item) => item.userId === userId);
  if (!workspaceId || !member || member.role === "owner" || member.status !== "active") return;
  if (stop && member.userId === currentSession?.user?.id) {
    workspaceMembersState.message = "自分自身の利用は停止できません。管理責任者または別の管理者へ依頼してください。";
    workspaceMembersState.messageKind = "error";
    renderShell(currentSession, "", "notice", "members-message");
    return;
  }
  const roleField = document.getElementById("member-role-" + userId);
  const role = stop ? member.role : roleField?.value;
  if (stop && !confirm("「" + member.displayName + "」さんの利用を停止します。停止後は一覧から表示されなくなります。よろしいですか？")) return;
  if (!stop && member.role !== "admin" && role === "admin" && !confirm("「" + member.displayName + "」さんを管理者に変更します。管理者はメンバーの追加・権限変更・利用停止を行えます。よろしいですか？")) return;
  await changeWorkspaceMember(
    workspaceId,
    "/api/workspaces/" + encodeURIComponent(workspaceId) + "/members/" + encodeURIComponent(userId),
    { method: "PATCH", body: JSON.stringify({ role, status: stop ? "removed" : "active" }) },
    stop ? "メンバーの利用を停止しました。" : "メンバーの権限を変更しました。"
  );
}

async function reconcilePendingWorkspaceMemberMutation(mutation) {
  if (
    pendingWorkspaceMemberMutation !== mutation ||
    mutation.authReconciled !== true ||
    mutation.reconciling === true ||
    currentSession?.user?.id !== mutation.userId ||
    !(currentSession.workspaces || []).some((workspace) =>
      workspace.id === mutation.workspaceId && workspace.status === "active"
    )
  ) return;
  mutation.reconciling = true;
  currentWorkspaceSelection = { userId: mutation.userId, workspaceId: mutation.workspaceId };
  try {
    await loadWorkspaceMembers(mutation.workspaceId, {
      message: "認証状態が更新されたため、変更結果を最新の一覧で確認しました。",
      messageKind: "warning",
      focusId: "members-message"
    });
  } finally {
    mutation.reconciling = false;
  }
}

async function changeWorkspaceMember(workspaceId, path, requestOptions, successMessage) {
  const userId = currentSession?.user?.id;
  const requestGeneration = sessionGeneration;
  const previous = workspaceMembersState;
  if (!workspaceId || !userId || previous?.status === "saving") return;
  const mutation = { userId, workspaceId, settled: false, authReconciled: true, reconciling: false };
  pendingWorkspaceMemberMutation = mutation;
  workspaceMembersState = { ...previous, status: "saving", message: "保存しています。", messageKind: "notice" };
  renderShell(currentSession, "", "notice", "members-message");
  try {
    await requestJson(path, requestOptions);
    mutation.settled = true;
    if (pendingWorkspaceMemberMutation !== mutation) return;
    if (requestGeneration !== sessionGeneration || currentSession?.user?.id !== userId) {
      await reconcilePendingWorkspaceMemberMutation(mutation);
      return;
    }
    await loadWorkspaceMembers(workspaceId, { message: successMessage, focusId: "members-message" });
  } catch (error) {
    mutation.settled = true;
    if (pendingWorkspaceMemberMutation !== mutation) return;
    if (requestGeneration !== sessionGeneration) {
      await reconcilePendingWorkspaceMemberMutation(mutation);
      return;
    }
    if (isTerminalSessionError(error)) {
      await loadSession();
      return;
    }
    if (
      error.code === "MEMBER_CHANGE_RESULT_UNKNOWN" ||
      error.code === "NETWORK_ERROR" ||
      error.code === "INVALID_RESPONSE"
    ) {
      await loadWorkspaceMembers(workspaceId, {
        message: "変更結果を一覧で確認してください。",
        messageKind: "warning",
        focusId: "members-message"
      });
      return;
    }
    const accessRejected = error.status === 403 || error.status === 404;
    workspaceMembersState = accessRejected
      ? {
          ...previous,
          status: "error",
          currentUserRole: null,
          members: [],
          message: error.message,
          messageKind: "error"
        }
      : {
          ...previous,
          status: "loaded",
          message: error.message,
          messageKind: "error"
        };
    pendingWorkspaceMemberMutation = null;
    renderShell(currentSession, "", "notice", "members-message");
  }
}



function manualDetailFormKey(form) {
  if (!form) return "";
  if (form.id === "manual-draft-form") return "draft";
  if (form.id === "manual-step-add-form") return "new-step";
  if (form.classList.contains("manual-step-form") && form.dataset.stepId) return "step:" + form.dataset.stepId;
  return "";
}

function manualDetailBaselineValue(key, name) {
  const detail = manualDetailState.value;
  if (!detail) return "";
  if (key === "draft") {
    if (name === "title") return String(detail.draft?.title || "");
    if (name === "description") return String(detail.draft?.description || "");
    return "";
  }
  if (key === "new-step") {
    if (name === "type") return "action";
    if (name === "actionType") return "click";
    return "";
  }
  if (!key.startsWith("step:")) return "";
  const step = (detail.steps || []).find((item) => item.id === key.slice(5));
  if (!step) return "";
  const values = {
    type: step.type,
    title: step.title,
    actionType: step.actionType,
    targetText: step.targetText,
    instruction: step.instruction,
    url: step.url
  };
  return String(values[name] ?? "");
}

function captureManualDetailDrafts(excludedKeys = []) {
  const excluded = new Set(excludedKeys);
  const drafts = {};
  const forms = document.querySelectorAll("#manual-draft-form, #manual-step-add-form, .manual-step-form");
  for (const form of forms) {
    const key = manualDetailFormKey(form);
    if (!key || excluded.has(key)) continue;
    const changed = {};
    for (const field of form.querySelectorAll("input[name], select[name], textarea[name]")) {
      const value = String(field.value ?? "");
      if (value !== manualDetailBaselineValue(key, field.name)) changed[field.name] = value;
    }
    if (Object.keys(changed).length > 0) {
      drafts[key] = {
        values: changed,
        stepUpdatedAt: key.startsWith("step:") ? String(form.dataset.stepUpdatedAt || "") : "",
        draftUpdatedAt: key === "draft" ? String(form.dataset.draftUpdatedAt || "") : ""
      };
    }
  }
  return drafts;
}

function findManualDetailForm(key) {
  if (key === "draft") return document.getElementById("manual-draft-form");
  if (key === "new-step") return document.getElementById("manual-step-add-form");
  if (!key.startsWith("step:")) return null;
  const stepId = key.slice(5);
  return [...document.querySelectorAll(".manual-step-form")].find((form) => form.dataset.stepId === stepId) || null;
}

function restoreManualDetailDrafts(drafts) {
  if (!drafts || typeof drafts !== "object") return;
  for (const [key, draft] of Object.entries(drafts)) {
    const form = findManualDetailForm(key);
    if (!form) continue;
    const values = draft && typeof draft === "object" && "values" in draft ? draft.values : draft;
    const stepUpdatedAt = draft && typeof draft === "object" && "stepUpdatedAt" in draft
      ? String(draft.stepUpdatedAt || "")
      : "";
    const draftUpdatedAt = draft && typeof draft === "object" && "draftUpdatedAt" in draft
      ? String(draft.draftUpdatedAt || "")
      : "";
    if (key.startsWith("step:") && stepUpdatedAt) form.dataset.stepUpdatedAt = stepUpdatedAt;
    if (key === "draft" && draftUpdatedAt) form.dataset.draftUpdatedAt = draftUpdatedAt;
    for (const [name, value] of Object.entries(values || {})) {
      const field = form.elements.namedItem(name);
      if (field && typeof field.value !== "undefined") field.value = value;
    }
  }
}

function setManualMutationBusyState(isBusy, messageId = "", message = "") {
  manualMutationInFlight = isBusy;
  const screen = document.getElementById("screen-content");
  if (isBusy) screen?.setAttribute("aria-busy", "true");
  else screen?.removeAttribute("aria-busy");
  const forms = document.querySelectorAll("#manual-create-form, #manual-draft-form, #manual-step-add-form, .manual-step-form");
  for (const form of forms) {
    for (const control of form.querySelectorAll("button, input, select, textarea")) {
      if (isBusy) {
        if (!control.hasAttribute("data-manual-disabled-before")) {
          control.setAttribute("data-manual-disabled-before", control.disabled ? "true" : "false");
        }
        control.disabled = true;
      } else if (control.hasAttribute("data-manual-disabled-before")) {
        control.disabled = control.getAttribute("data-manual-disabled-before") === "true";
        control.removeAttribute("data-manual-disabled-before");
      }
    }
  }
  for (const control of document.querySelectorAll("#manual-publish-button, #manual-create-draft-button, #manual-archive-button, #manual-reading-preview-button")) {
    if (isBusy) {
      if (!control.hasAttribute("data-manual-disabled-before")) {
        control.setAttribute("data-manual-disabled-before", control.disabled ? "true" : "false");
      }
      control.disabled = true;
    } else if (control.hasAttribute("data-manual-disabled-before")) {
      control.disabled = control.getAttribute("data-manual-disabled-before") === "true";
      control.removeAttribute("data-manual-disabled-before");
    }
  }
  if (!isBusy) {
    for (const control of document.querySelectorAll('[data-manual-busy-rendered="true"]')) {
      control.disabled = false;
      control.removeAttribute("data-manual-busy-rendered");
    }
  }
  if (messageId && message) setBox(messageId, message, "notice", false);
}

function manualCanEdit(currentWorkspace) {
  if (!currentWorkspace || workspaceMembersState?.workspaceId !== currentWorkspace.id) return false;
  return ["owner", "admin", "editor"].includes(workspaceMembersState.currentUserRole);
}

function manualSidebarHtml(session, activeScreen) {
  return '<aside class="sidebar" aria-label="アプリメニュー">' +
    '<div class="brand"><div class="logo-mark" aria-hidden="true"><span>め</span></div><span>めっちゃマニュアル</span></div>' +
    '<nav class="nav" aria-label="主要メニュー">' +
      '<button id="workspace-nav-button" class="nav-item nav-button' + (activeScreen === "workspace" ? ' active' : '') + '" type="button"' + (activeScreen === "workspace" ? ' aria-current="page"' : '') + '>ワークスペース</button>' +
      '<button id="members-nav-button" class="nav-item nav-button" type="button">メンバー管理</button>' +
      '<button id="manual-nav-button" class="nav-item nav-button' + (activeScreen !== "workspace" ? ' active' : '') + '" type="button"' + (activeScreen !== "workspace" ? ' aria-current="page"' : '') + '>手順書</button>' +
      '<span class="nav-item" aria-disabled="true"><span>操作を記録</span><span class="nav-status">準備中</span></span>' +
    '</nav>' +
    '<div class="user-box">' +
      '<span>ログイン中：' + escapeHtml(session.user.email || "メールアドレス未設定") + '</span>' +
      '<button id="logout-button" class="secondary-button" type="button">ログアウト</button>' +
    '</div>' +
  '</aside>';
}

function wireManualNavigation(currentWorkspace) {
  document.getElementById("workspace-nav-button")?.addEventListener("click", () => {
    currentScreen = "workspace";
    renderShell(currentSession, "", "notice", "workspace-heading");
  });
  document.getElementById("members-nav-button")?.addEventListener("click", () => {
    currentScreen = "workspace";
    renderShell(currentSession, "", "notice", "members-heading");
    document.getElementById("members-heading")?.scrollIntoView({ block: "start" });
  });
  document.getElementById("manual-nav-button")?.addEventListener("click", () => openManualList(currentWorkspace));
}

function openManualList(currentWorkspace, message = "", messageKind = "notice") {
  if (!currentWorkspace) {
    currentScreen = "workspace";
    renderShell(currentSession, "利用中のワークスペースを選択してください。", "error", "shell-message");
    return;
  }
  currentScreen = "manuals";
  manualDetailState = { workspaceId: currentWorkspace.id, manualId: "", status: "idle", value: null, message: "", messageKind: "notice" };
  if (message) {
    manualsState = { ...manualsState, workspaceId: currentWorkspace.id, message, messageKind };
  }
  renderShell(currentSession, "", "notice", "manuals-heading");
  if (workspaceMembersState?.status === "idle") {
    loadWorkspaceMembers(currentWorkspace.id, { alreadyRendered: true });
  }
  if (manualsState.workspaceId !== currentWorkspace.id || manualsState.status === "idle") {
    loadManuals(currentWorkspace.id);
  }
}

function wireManualCodePointLimit(field) {
  const maxLength = Number(field?.dataset?.codePointMax || 0);
  if (!Number.isSafeInteger(maxLength) || maxLength < 1) return;
  let composing = false;
  let acceptedValue = String(field.value || "");
  let acceptedSelectionStart = typeof field.selectionStart === "number" ? field.selectionStart : acceptedValue.length;
  let acceptedSelectionEnd = typeof field.selectionEnd === "number" ? field.selectionEnd : acceptedSelectionStart;

  const rememberAccepted = () => {
    const value = String(field.value || "");
    if (Array.from(value).length > maxLength) return false;
    acceptedValue = value;
    acceptedSelectionStart = typeof field.selectionStart === "number" ? field.selectionStart : value.length;
    acceptedSelectionEnd = typeof field.selectionEnd === "number" ? field.selectionEnd : acceptedSelectionStart;
    return true;
  };
  const rejectOverflow = () => {
    if (rememberAccepted()) return false;
    field.value = acceptedValue;
    if (typeof field.setSelectionRange === "function") {
      field.setSelectionRange(acceptedSelectionStart, acceptedSelectionEnd);
    }
    return true;
  };

  field.addEventListener("beforeinput", () => {
    if (!composing) rememberAccepted();
  });
  field.addEventListener("compositionstart", () => {
    rememberAccepted();
    composing = true;
  });
  field.addEventListener("compositionend", () => {
    composing = false;
    rejectOverflow();
  });
  field.addEventListener("input", () => {
    if (!composing) rejectOverflow();
  });
  rejectOverflow();
}

function manualMessageHtml(state, id) {
  const kind = state.messageKind || "notice";
  const className = state.message
    ? kind === "error" ? "error-box show" : kind === "warning" ? "warning-box show" : "notice-box show"
    : "notice-box";
  return '<div id="' + id + '" class="' + className + '" role="' + (kind === "error" ? 'alert' : 'status') + '" aria-live="' + (kind === "error" ? 'assertive' : 'polite') + '" aria-atomic="true" tabindex="-1">' + escapeHtml(state.message || "") + '</div>';
}

function manualListHtml(currentWorkspace) {
  const state = manualsState;
  const canEdit = manualCanEdit(currentWorkspace);
  const roleKnown = workspaceMembersState?.workspaceId === currentWorkspace.id && Boolean(workspaceMembersState.currentUserRole);
  let body = "";
  if (state.status === "idle" || state.status === "loading") {
    body = '<div class="empty" role="status" aria-live="polite" aria-busy="true">手順書を読み込んでいます。</div>';
  } else if (state.status === "error") {
    body = '<div class="empty"><p>手順書一覧を表示できませんでした。</p><button id="manuals-retry-button" class="secondary-button" type="button">もう一度読み込む</button></div>';
  } else if (state.items.length === 0) {
    body = '<div class="empty" role="status"><strong>手順書はまだありません。</strong><br>' + (canEdit ? '右側のフォームから最初の手順書を作成できます。' : '編集者以上の権限を持つメンバーが作成できます。') + '</div>';
  } else {
    body = '<div class="manual-list" role="list">' + state.items.map((manual) =>
      '<div role="listitem"><button class="manual-list-item" type="button" data-manual-id="' + escapeHtml(manual.id) + '">' +
        '<span><span class="manual-list-item-title">' + escapeHtml(manual.title) + '</span><span class="muted">更新：' + escapeHtml(new Date(manual.updatedAt).toLocaleString("ja-JP")) + '</span></span>' +
        '<span class="badge">' + escapeHtml(manualStatusLabels[manual.status] || manual.status) + '</span>' +
      '</button></div>'
    ).join("") + '</div>';
  }
  const createPanel = canEdit
    ? '<form id="manual-create-form" class="workspace-form manual-form" novalidate>' +
        '<h2>新しい手順書</h2><p>タイトルだけでも作成できます。説明は後から変更できます。</p>' +
        '<div class="field"><label for="manual-create-title">タイトル</label><input id="manual-create-title" name="title" data-code-point-max="64" required></div>' +
        '<div class="field"><label for="manual-create-description">説明</label><textarea id="manual-create-description" name="description" data-code-point-max="10000"></textarea></div>' +
        '<button class="primary-button" type="submit"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>' + (manualMutationInFlight ? '作成中' : '手順書を作成') + '</button>' +
      '</form>'
    : '<section class="workspace-form" aria-labelledby="manual-permission-heading"><h2 id="manual-permission-heading">作成権限</h2><p>' + (roleKnown ? '現在の権限では手順書を作成・編集できません。閲覧はできます。' : 'メンバー権限を確認しています。') + '</p></section>';
  return '<div class="manual-layout">' +
    '<section class="section" aria-labelledby="manual-list-heading">' +
      '<div class="section-header"><h2 id="manual-list-heading">手順書一覧</h2><span class="badge">' + (state.status === "loaded" ? state.items.length : "-") + '件</span></div>' +
      body +
    '</section>' + createPanel +
  '</div>';
}

function stepTypeOptions(value) {
  return Object.entries(manualStepTypeLabels).map(([key, label]) => '<option value="' + key + '"' + (value === key ? ' selected' : '') + '>' + label + '</option>').join("");
}

function actionTypeOptions(value) {
  return '<option value="">操作なし</option>' + Object.entries(manualActionTypeLabels).map(([key, label]) => '<option value="' + key + '"' + (value === key ? ' selected' : '') + '>' + label + '</option>').join("");
}

function manualStepHtml(step, index, count, canEdit) {
  const heading = '手順 ' + (index + 1) + '：' + step.title;
  const header = '<div class="manual-step-card-header"><h3 id="step-heading-' + escapeHtml(step.id) + '">' + escapeHtml(heading) + '</h3><span class="badge">' + escapeHtml(manualStepTypeLabels[step.type] || step.type) + '</span></div>';
  if (!canEdit) {
    return '<article class="manual-step-card" aria-labelledby="step-heading-' + escapeHtml(step.id) + '">' + header +
      '<div class="manual-step-view"><dl>' +
        '<dt>手順文</dt><dd>' + escapeHtml(step.instruction || "未入力") + '</dd>' +
        '<dt>操作対象</dt><dd>' + escapeHtml(step.targetText || "-") + '</dd>' +
        '<dt>URL</dt><dd>' + escapeHtml(step.url || "-") + '</dd>' +
      '</dl></div></article>';
  }
  return '<article class="manual-step-card" aria-labelledby="step-heading-' + escapeHtml(step.id) + '">' + header +
    '<form class="manual-step-form" data-step-id="' + escapeHtml(step.id) + '" data-step-updated-at="' + escapeHtml(step.updatedAt) + '">' +
      '<div class="manual-step-grid">' +
        '<div class="field"><label for="step-type-' + escapeHtml(step.id) + '">種類</label><select id="step-type-' + escapeHtml(step.id) + '" name="type">' + stepTypeOptions(step.type) + '</select></div>' +
        '<div class="field"><label for="step-action-' + escapeHtml(step.id) + '">操作</label><select id="step-action-' + escapeHtml(step.id) + '" name="actionType">' + actionTypeOptions(step.actionType) + '</select></div>' +
      '</div>' +
      '<div class="field"><label for="step-title-' + escapeHtml(step.id) + '">見出し</label><input id="step-title-' + escapeHtml(step.id) + '" name="title" data-code-point-max="128" required value="' + escapeHtml(step.title) + '"></div>' +
      '<div class="field"><label for="step-target-' + escapeHtml(step.id) + '">操作対象</label><input id="step-target-' + escapeHtml(step.id) + '" name="targetText" data-code-point-max="256" value="' + escapeHtml(step.targetText || "") + '"></div>' +
      '<div class="field"><label for="step-instruction-' + escapeHtml(step.id) + '">手順文</label><textarea id="step-instruction-' + escapeHtml(step.id) + '" name="instruction" data-code-point-max="4000">' + escapeHtml(step.instruction || "") + '</textarea><span class="muted">保存済みの手順文は、操作対象を変えても自動で上書きしません。</span></div>' +
      '<div class="field"><label for="step-url-' + escapeHtml(step.id) + '">URL</label><input id="step-url-' + escapeHtml(step.id) + '" name="url" data-code-point-max="2048" inputmode="url" value="' + escapeHtml(step.url || "") + '"></div>' +
      '<div class="manual-step-actions">' +
        '<button class="secondary-button" type="submit"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>手順を保存</button>' +
        '<button class="secondary-button compact-button manual-step-up" type="button" data-step-id="' + escapeHtml(step.id) + '"' + (index === 0 ? ' disabled' : manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '><span class="visually-hidden">' + escapeHtml(step.title) + 'を</span>上へ</button>' +
        '<button class="secondary-button compact-button manual-step-down" type="button" data-step-id="' + escapeHtml(step.id) + '"' + (index === count - 1 ? ' disabled' : manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '><span class="visually-hidden">' + escapeHtml(step.title) + 'を</span>下へ</button>' +
        '<button class="danger-button compact-button manual-step-delete" type="button" data-step-id="' + escapeHtml(step.id) + '" data-step-title="' + escapeHtml(step.title) + '"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>手順を削除</button>' +
      '</div>' +
    '</form></article>';
}

function manualRevisionState(value) {
  const revisionState = value?.draft?.state;
  if (revisionState === "draft" || revisionState === "published") return revisionState;
  return value?.manual?.currentPublishedRevisionId ? "published" : "";
}

function manualRevisionReadOnlyLabel(value) {
  const revisionState = manualRevisionState(value);
  if (revisionState === "draft") return "下書き（読み取り専用）";
  if (revisionState === "published") return "公開版（読み取り専用）";
  return "保存済み内容（読み取り専用）";
}

function closeManualReadingPreview(restoreFocus = true) {
  const preview = manualReadingPreview;
  if (!preview) return;
  manualReadingPreview = null;
  if (preview.element.open) preview.element.close();
  preview.element.remove();
  if (restoreFocus && preview.opener?.isConnected) preview.opener.focus();
}

function openManualReadingPreview() {
  const value = manualDetailState.value;
  const opener = document.getElementById("manual-reading-preview-button");
  if (!value || !opener) return;
  closeManualReadingPreview(false);
  const revisionState = manualRevisionState(value);
  const title = value.draft?.title || value.manual?.title || "手順書";
  const description = value.draft?.description || "";
  const steps = Array.isArray(value.steps) ? value.steps : [];
  const stepsHtml = steps.length
    ? steps.map((step, index) => '<article class="manual-reading-preview-step"><h3>' + escapeHtml((index + 1) + ". " + (step.title || "手順")) + '</h3><dl><dt>種類</dt><dd>' + escapeHtml(manualStepTypeLabels[step.type] || step.type || "-") + '</dd><dt>手順</dt><dd>' + escapeHtml(step.instruction || "手順文なし") + '</dd><dt>操作対象</dt><dd>' + escapeHtml(step.targetText || "-") + '</dd>' + (step.url ? '<dt>URL</dt><dd>' + escapeHtml(step.url) + '</dd>' : '') + '</dl></article>').join("")
    : '<p role="status">手順はまだありません。</p>';
  const overlay = document.createElement("dialog");
  overlay.className = "manual-reading-preview";
  overlay.setAttribute("aria-modal", "true");
  overlay.setAttribute("aria-labelledby", "manual-reading-preview-title");
  overlay.innerHTML = '<div class="manual-reading-preview-panel">' +
    '<header class="manual-reading-preview-header"><div><p class="eyebrow">保存済み内容のみ</p><h2 id="manual-reading-preview-title">' + escapeHtml(title) + '</h2><span class="badge">' + escapeHtml(revisionState === "draft" ? "下書き" : revisionState === "published" ? "公開版" : "保存済み") + '</span></div><button id="manual-reading-preview-close" class="secondary-button" type="button">閉じる</button></header>' +
    '<div class="manual-reading-preview-content"><p class="manual-reading-preview-description">' + escapeHtml(description || "説明はありません。") + '</p><div class="manual-reading-preview-steps">' + stepsHtml + '</div></div>' +
    '<footer class="manual-reading-preview-footer"><button id="manual-reading-preview-close-footer" class="primary-button" type="button">' + (value.permissions?.canEdit ? "編集画面へ戻る" : "手順書へ戻る") + '</button></footer>' +
    '</div>';
  app.appendChild(overlay);
  const close = () => closeManualReadingPreview(true);
  manualReadingPreview = { element: overlay, opener };
  overlay.querySelector("#manual-reading-preview-close")?.addEventListener("click", close);
  overlay.querySelector("#manual-reading-preview-close-footer")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  overlay.addEventListener("close", () => {
    if (manualReadingPreview?.element === overlay) close();
  });
  overlay.showModal();
  overlay.querySelector("#manual-reading-preview-close")?.focus();
}

function manualDetailHtml(currentWorkspace) {
  const state = manualDetailState;
  if (state.status === "idle" || state.status === "loading") {
    return '<section class="section"><div class="empty" role="status" aria-live="polite" aria-busy="true">手順書を読み込んでいます。</div></section>';
  }
  if (state.status === "error" || !state.value) {
    return '<section class="section"><div class="empty"><p>手順書を表示できませんでした。</p><button id="manual-detail-retry-button" class="secondary-button" type="button">もう一度読み込む</button></div></section>';
  }
  const value = state.value;
  const canEdit = Boolean(value.permissions?.canEdit);
  const draft = value.draft;
  const hasEditableDraft = draft?.state === "draft";
  const steps = value.steps || [];
  const metadata = draft
    ? canEdit && hasEditableDraft
      ? '<form id="manual-draft-form" class="manual-detail-form" data-draft-updated-at="' + escapeHtml(draft.updatedAt) + '" novalidate>' +
          '<div class="field"><label for="manual-draft-title">タイトル</label><input id="manual-draft-title" name="title" data-code-point-max="64" required value="' + escapeHtml(draft.title) + '"></div>' +
          '<div class="field"><label for="manual-draft-description">説明</label><textarea id="manual-draft-description" name="description" data-code-point-max="10000">' + escapeHtml(draft.description || "") + '</textarea></div>' +
          '<button class="primary-button" type="submit"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>基本情報を保存</button>' +
        '</form>'
      : '<div class="manual-step-view"><dl><dt>説明</dt><dd>' + escapeHtml(draft.description || "未入力") + '</dd><dt>状態</dt><dd>' + escapeHtml(manualRevisionReadOnlyLabel(value)) + '</dd></dl>' +
          (canEdit && draft.state === "published" ? '<button id="manual-create-draft-button" class="primary-button" type="button"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>編集用下書きを作成</button>' : '') +
        '</div>'
    : '<div class="empty"><strong>編集できる下書きがありません。</strong><br>' +
        (canEdit && value.manual.currentPublishedRevisionId
          ? '<button id="manual-create-draft-button" class="primary-button" type="button"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>編集用下書きを作成</button>'
          : '公開済みの内容は閲覧できます。') +
      '</div>';
  const publicationActions = canEdit && hasEditableDraft
    ? '<section class="workspace-form" aria-labelledby="manual-publication-heading"><h2 id="manual-publication-heading">公開</h2>' +
        '<p>現在の下書きを変更できない公開版にします。公開前に機密情報とマスキングを確認してください。</p>' +
        '<label><input id="manual-sensitive-review-confirmation" type="checkbox"> 機密情報が含まれず、必要なマスキングが完了していることを確認しました</label>' +
        '<button id="manual-publish-button" class="primary-button" type="button"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>この内容を公開</button>' +
      '</section>'
    : '';
  const archiveActions = canEdit
    ? '<section class="workspace-form" aria-labelledby="manual-archive-heading"><h2 id="manual-archive-heading">アーカイブ</h2>' +
        '<p>手順書を一覧から非表示にします。下書き・公開版・手順は削除せず保持します。</p>' +
        '<button id="manual-archive-button" class="danger-button" type="button"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>手順書をアーカイブ</button>' +
      '</section>'
    : '';
  const stepsHtml = steps.length
    ? '<div class="manual-step-list">' + steps.map((step, index) => manualStepHtml(step, index, steps.length, canEdit && hasEditableDraft)).join("") + '</div>'
    : '<div class="empty" role="status">手順はまだありません。</div>';
  const addForm = canEdit && hasEditableDraft
    ? '<form id="manual-step-add-form" class="workspace-form manual-form" novalidate>' +
        '<h2>手順を追加</h2><p>入力した値やパスワードは記録せず、操作対象名だけを入力してください。</p>' +
        '<div class="manual-step-grid"><div class="field"><label for="new-step-type">種類</label><select id="new-step-type" name="type">' + stepTypeOptions("action") + '</select></div><div class="field"><label for="new-step-action">操作</label><select id="new-step-action" name="actionType">' + actionTypeOptions("click") + '</select></div></div>' +
        '<div class="field"><label for="new-step-title">見出し</label><input id="new-step-title" name="title" data-code-point-max="128" required></div>' +
        '<div class="field"><label for="new-step-target">操作対象</label><input id="new-step-target" name="targetText" data-code-point-max="256" placeholder="例：保存ボタン"></div>' +
        '<div class="field"><label for="new-step-instruction">手順文（任意）</label><textarea id="new-step-instruction" name="instruction" data-code-point-max="4000"></textarea><span class="muted">空欄の場合は操作対象からローカルで候補を作成します。外部AIは使用しません。</span></div>' +
        '<div class="field"><label for="new-step-url">URL（任意）</label><input id="new-step-url" name="url" data-code-point-max="2048" inputmode="url"></div>' +
        '<button class="primary-button" type="submit"' + (steps.length >= 200 ? ' disabled' : manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>' + (steps.length >= 200 ? '手順は200件までです' : '手順を追加') + '</button>' +
      '</form>'
    : '<section class="workspace-form"><h2>編集権限</h2><p>' + (canEdit ? '編集できる下書きがありません。' : '現在の権限では閲覧のみ利用できます。') + '</p></section>';
  return '<div class="manual-detail-grid">' +
    '<section class="section" aria-labelledby="manual-metadata-heading"><div class="section-header"><div><h2 id="manual-metadata-heading">基本情報</h2><p class="muted">状態：' + escapeHtml(manualStatusLabels[value.manual.status] || value.manual.status) + '</p></div><button id="manual-reading-preview-button" class="secondary-button" type="button"' + (manualMutationInFlight ? ' disabled data-manual-busy-rendered="true"' : '') + '>保存済み内容を閲覧プレビュー</button></div>' + metadata + '</section>' +
    '<div class="manual-layout"><section class="section" aria-labelledby="manual-steps-heading"><div class="section-header"><h2 id="manual-steps-heading">手順</h2><span class="badge">' + steps.length + '件</span></div>' + stepsHtml + '</section>' + addForm + publicationActions + archiveActions + '</div>' +
  '</div>';
}

function renderManualShell(session, notice = "", noticeKind = "notice", focusId = null) {
  closeManualReadingPreview(false);
  const currentWorkspace = resolveCurrentWorkspace(session);
  prepareWorkspaceMembersState(session, currentWorkspace);
  if (!currentWorkspace) {
    currentScreen = "workspace";
    renderShell(session, "利用中のワークスペースを選択してください。", "error", "shell-message");
    return;
  }
  const isDetail = currentScreen === "manual-detail";
  const heading = isDetail && manualDetailState.value?.manual?.title ? manualDetailState.value.manual.title : "手順書";
  const subheading = isDetail ? "下書きと手順を編集します。" : "ワークスペース内の手順書を確認・作成します。";
  const state = isDetail ? manualDetailState : manualsState;
  if (notice) {
    state.message = notice;
    state.messageKind = noticeKind;
  }
  app.innerHTML = '<section class="shell">' + manualSidebarHtml(session, isDetail ? "manual-detail" : "manuals") +
    '<div id="screen-content" class="main" tabindex="-1">' +
      '<header class="topbar"><div>' +
        (isDetail ? '<button id="manual-back-button" class="secondary-button compact-button manual-back-button" type="button">手順書一覧へ戻る</button>' : '') +
        '<h1 id="' + (isDetail ? 'manual-detail-heading' : 'manuals-heading') + '" tabindex="-1">' + escapeHtml(heading) + '</h1><p>' + escapeHtml(subheading) + '</p>' +
        '<div class="context-summary"><span class="badge">' + escapeHtml(currentWorkspace.name) + '</span>' +
          (workspaceMembersState?.currentUserRole ? '<span class="badge">' + escapeHtml(workspaceRoleLabels[workspaceMembersState.currentUserRole]) + '</span>' : '') + '</div>' +
      '</div><div class="manual-page-actions"><button id="manual-reload-button" class="secondary-button" type="button">再読み込み</button></div></header>' +
      manualMessageHtml(state, isDetail ? "manual-detail-message" : "manuals-message") +
      (isDetail ? manualDetailHtml(currentWorkspace) : manualListHtml(currentWorkspace)) +
    '</div></section>';
  document.getElementById("logout-button")?.addEventListener("click", logout);
  wireManualNavigation(currentWorkspace);
  document.getElementById("manual-back-button")?.addEventListener("click", () => openManualList(currentWorkspace));
  document.getElementById("manual-reload-button")?.addEventListener("click", () => {
    if (isDetail) loadManualDetail(currentWorkspace.id, manualDetailState.manualId, { focusId: "manual-detail-message" });
    else loadManuals(currentWorkspace.id, { focusId: "manuals-message" });
  });
  document.getElementById("manuals-retry-button")?.addEventListener("click", () => loadManuals(currentWorkspace.id));
  document.getElementById("manual-detail-retry-button")?.addEventListener("click", () => loadManualDetail(currentWorkspace.id, manualDetailState.manualId));
  document.getElementById("manual-reading-preview-button")?.addEventListener("click", () => {
    if (!manualMutationInFlight) openManualReadingPreview();
  });
  for (const button of document.querySelectorAll("[data-manual-id]")) {
    button.addEventListener("click", () => openManualDetail(currentWorkspace.id, button.dataset.manualId));
  }
  document.getElementById("manual-create-form")?.addEventListener("submit", createManualFromUi);
  document.getElementById("manual-draft-form")?.addEventListener("submit", updateManualDraftFromUi);
  document.getElementById("manual-publish-button")?.addEventListener("click", publishManualFromUi);
  document.getElementById("manual-archive-button")?.addEventListener("click", archiveManualFromUi);
  document.getElementById("manual-create-draft-button")?.addEventListener("click", createManualDraftFromUi);
  document.getElementById("manual-step-add-form")?.addEventListener("submit", addManualStepFromUi);
  for (const form of document.querySelectorAll(".manual-step-form")) form.addEventListener("submit", updateManualStepFromUi);
  for (const button of document.querySelectorAll(".manual-step-delete")) button.addEventListener("click", deleteManualStepFromUi);
  for (const button of document.querySelectorAll(".manual-step-up, .manual-step-down")) button.addEventListener("click", reorderManualStepFromUi);
  for (const field of document.querySelectorAll("[data-code-point-max]")) wireManualCodePointLimit(field);
  if (focusId) document.getElementById(focusId)?.focus();
  else document.getElementById(isDetail ? "manual-detail-heading" : "manuals-heading")?.focus();
}

async function loadManuals(workspaceId, options = {}) {
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const sequence = ++manualRequestSequence;
  const pendingManualCreate = manualCreateReconciliationByWorkspace.get(workspaceId);
  const carriedMessage = options.message ?? pendingManualCreate?.message ?? (
    manualsState.workspaceId === workspaceId && manualsState.status === "idle"
      ? manualsState.message
      : ""
  );
  const carriedMessageKind = options.messageKind ?? pendingManualCreate?.messageKind ?? (
    manualsState.workspaceId === workspaceId && manualsState.status === "idle"
      ? manualsState.messageKind
      : "notice"
  );
  manualsState = {
    workspaceId,
    status: "loading",
    items: manualsState.workspaceId === workspaceId ? manualsState.items : [],
    message: carriedMessage,
    messageKind: carriedMessageKind
  };
  renderShell(currentSession, "", "notice", options.focusId || null);
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals");
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence || currentWorkspaceSelection?.workspaceId !== workspaceId
    ) return;
    if (!Array.isArray(payload.manuals)) throw new AppRequestError("手順書一覧を確認できませんでした。", 502, "MANUALS_RESPONSE_INVALID");
    const currentPendingManualCreate = manualCreateReconciliationByWorkspace.get(workspaceId);
    if (currentPendingManualCreate && currentPendingManualCreate !== pendingManualCreate) {
      manualsState = {
        workspaceId,
        status: "idle",
        items: payload.manuals,
        message: currentPendingManualCreate.message,
        messageKind: currentPendingManualCreate.messageKind
      };
      if (currentScreen === "manuals") {
        renderShell(currentSession, "", "notice", options.focusId || null);
        await loadManuals(workspaceId, {
          message: currentPendingManualCreate.message,
          messageKind: currentPendingManualCreate.messageKind,
          focusId: options.focusId || "manuals-message"
        });
      }
      return;
    }
    manualsState = { workspaceId, status: "loaded", items: payload.manuals, message: carriedMessage, messageKind: carriedMessageKind };
    if (manualCreateReconciliationByWorkspace.get(workspaceId) === pendingManualCreate) {
      manualCreateReconciliationByWorkspace.delete(workspaceId);
    }
    renderShell(currentSession, "", "notice", options.focusId || null);
  } catch (error) {
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence
    ) return;
    if (isTerminalSessionError(error)) return loadSession();
    manualsState = { workspaceId, status: "error", items: [], message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manuals-message");
  }
}

function openManualDetail(workspaceId, manualId) {
  currentScreen = "manual-detail";
  manualDetailState = { workspaceId, manualId, status: "loading", value: null, message: "", messageKind: "notice" };
  renderShell(currentSession, "", "notice", "manual-detail-heading");
  loadManualDetail(workspaceId, manualId);
}

async function loadManualDetail(workspaceId, manualId, options = {}) {
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const sequence = ++manualRequestSequence;
  manualDetailState = { ...manualDetailState, workspaceId, manualId, status: "loading", message: "", messageKind: "notice" };
  if (!options.preserveDomUntilLoaded) renderShell(currentSession, "", "notice", options.focusId || null);
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId));
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence || currentWorkspaceSelection?.workspaceId !== workspaceId
    ) {
      if (options.finishMutation) {
        setManualMutationBusyState(false);
        loadSession({ focusId: "workspace-heading" });
      }
      return;
    }
    if (options.finishMutation) manualMutationInFlight = false;
    manualDetailState = { workspaceId, manualId, status: "loaded", value: payload, message: options.message || "", messageKind: options.messageKind || "notice" };
    renderShell(currentSession, "", "notice", options.focusId || null);
    restoreManualDetailDrafts(options.restoreDrafts);
  } catch (error) {
    if (
      requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id ||
      sequence !== manualRequestSequence
    ) {
      if (options.finishMutation) {
        setManualMutationBusyState(false);
        loadSession({ focusId: "workspace-heading" });
      }
      return;
    }
    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (isManualPermissionRevocation(error)) {
      setManualMutationBusyState(false);
      if (workspaceMembersState?.workspaceId === workspaceId) {
        workspaceMembersState = {
          ...workspaceMembersState,
          status: "loading",
          currentUserRole: null,
          members: [],
          message: error.message,
          messageKind: "error"
        };
      }
      const currentDetail =
        currentScreen === "manual-detail" &&
        currentWorkspaceSelection?.workspaceId === workspaceId &&
        manualDetailState.workspaceId === workspaceId &&
        manualDetailState.manualId === manualId;
      if (currentDetail) {
        if (manualDetailState.value) {
          manualDetailState = {
            ...manualDetailState,
            status: "loaded",
            value: {
              ...manualDetailState.value,
              permissions: { ...(manualDetailState.value.permissions || {}), canEdit: false }
            },
            message: error.message,
            messageKind: "error"
          };
        } else {
          manualDetailState = {
            workspaceId,
            manualId,
            status: "error",
            value: null,
            message: error.message,
            messageKind: "error"
          };
        }
        renderShell(currentSession, "", "notice", "manual-detail-message");
        await loadWorkspaceMembers(workspaceId, {
          message: error.message,
          messageKind: "error",
          focusId: "manual-detail-message",
          alreadyRendered: true
        });
      } else if (currentWorkspaceSelection?.workspaceId === workspaceId) {
        const focusId = currentScreen === "manuals" ? "manuals-message" : "shell-message";
        renderShell(currentSession, error.message, "error", focusId);
        await loadWorkspaceMembers(workspaceId, {
          message: error.message,
          messageKind: "error",
          focusId,
          alreadyRendered: true
        });
      }
      return;
    }
    if (
      options.preserveDomOnError && currentScreen === "manual-detail" &&
      manualDetailState.workspaceId === workspaceId && manualDetailState.manualId === manualId && manualDetailState.value
    ) {
      manualDetailState = { ...manualDetailState, status: "loaded", message: error.message, messageKind: "error" };
      setManualMutationBusyState(false);
      setBox("manual-detail-message", error.message, "error");
      return;
    }
    if (options.finishMutation) manualMutationInFlight = false;
    manualDetailState = { workspaceId, manualId, status: "error", value: null, message: error.message, messageKind: "error" };
    renderShell(currentSession, "", "notice", "manual-detail-message");
  }
}

function manualMutationUnknown(error) {
  return error.code === "NETWORK_ERROR" || error.code === "INVALID_RESPONSE" || String(error.code || "").endsWith("_RESULT_UNKNOWN");
}

async function createManualFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const workspaceId = currentWorkspaceSelection?.workspaceId;
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  if (!workspaceId) {
    const message = "利用中のワークスペースを選択してください。";
    manualsState = { ...manualsState, message, messageKind: "error" };
    setBox("manuals-message", message, "error");
    return;
  }
  if (!title || Array.from(title).length > 64 || Array.from(description).length > 10000) {
    const message = "タイトルは1〜64文字、説明は10,000文字以内で入力してください。";
    manualsState = { ...manualsState, message, messageKind: "error" };
    setBox("manuals-message", message, "error");
    const invalidField = !title || Array.from(title).length > 64 ? form.elements.title : form.elements.description;
    invalidField.setAttribute("aria-invalid", "true");
    invalidField.focus();
    return;
  }
  form.elements.title.removeAttribute("aria-invalid");
  form.elements.description.removeAttribute("aria-invalid");
  setManualMutationBusyState(true, "manuals-message", "手順書を作成しています。");
  try {
    const payload = await requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals", { method: "POST", body: JSON.stringify({ title, description, folderId: null }) });
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    manualCreateReconciliationByWorkspace.delete(workspaceId);
    if (manualsState.workspaceId === workspaceId) {
      manualsState = { ...manualsState, workspaceId, status: "idle", message: "", messageKind: "notice" };
    }
    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    setManualMutationBusyState(false);
    openManualDetail(workspaceId, payload.manualId);
  } catch (error) {
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    const resultUnknown = manualMutationUnknown(error);
    if (resultUnknown) {
      const warning = {
        message: "作成結果を一覧で確認してください。重ねて作成しないでください。",
        messageKind: "warning"
      };
      manualCreateReconciliationByWorkspace.set(workspaceId, warning);
      if (manualsState.workspaceId === workspaceId) {
        manualsState = { ...manualsState, status: "idle", ...warning };
      }
    }
    if (currentWorkspaceSelection?.workspaceId !== workspaceId || currentScreen !== "manuals") {
      setManualMutationBusyState(false);
      return;
    }
    if (error.status === 403 || error.status === 404) {
      manualsState = { ...manualsState, message: error.message, messageKind: "error" };
      if (workspaceMembersState?.workspaceId === workspaceId) {
        workspaceMembersState = {
          ...workspaceMembersState,
          status: "loading",
          currentUserRole: null,
          members: [],
          message: error.message,
          messageKind: "error"
        };
      }
      setManualMutationBusyState(false);
      renderShell(currentSession, "", "notice", "manuals-message");
      await loadWorkspaceMembers(workspaceId, {
        message: error.message,
        messageKind: "error",
        focusId: "manuals-message",
        alreadyRendered: true
      });
      return;
    }
    if (resultUnknown) {
      setManualMutationBusyState(false);
      await loadManuals(workspaceId, { message: "作成結果を一覧で確認してください。重ねて作成しないでください。", messageKind: "warning", focusId: "manuals-message" });
      return;
    }
    manualsState = { ...manualsState, message: error.message, messageKind: "error" };
    setManualMutationBusyState(false);
    setBox("manuals-message", error.message, "error");
  }
}

function isCurrentManualDetailContext(workspaceId, manualId) {
  return currentScreen === "manual-detail" &&
    currentWorkspaceSelection?.workspaceId === workspaceId &&
    manualDetailState.workspaceId === workspaceId &&
    manualDetailState.manualId === manualId;
}

function isManualPermissionRevocation(error) {
  return error?.code === "MANUAL_EDIT_FORBIDDEN" || error?.code === "MANUALS_NOT_FOUND";
}

async function runDetailMutation(operation, successMessage, options = {}) {
  const workspaceId = manualDetailState.workspaceId;
  const manualId = manualDetailState.manualId;
  const requestGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const retainedDrafts = captureManualDetailDrafts(options.excludeDraftKeys || []);
  setManualMutationBusyState(true, "manual-detail-message", "保存しています。");
  try {
    await operation(workspaceId, manualId);
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    if (options.invalidateManuals && manualsState.workspaceId === workspaceId) {
      manualsState = { ...manualsState, status: "idle" };
    }
    if (!isCurrentManualDetailContext(workspaceId, manualId)) {
      setManualMutationBusyState(false);
      return;
    }
    if (options.returnToListOnSuccess) {
      setManualMutationBusyState(false);
      openManualList(selectedActiveWorkspace(), successMessage, "notice");
      return;
    }
    await loadManualDetail(workspaceId, manualId, {
      message: successMessage,
      messageKind: "notice",
      focusId: "manual-detail-message",
      preserveDomUntilLoaded: true,
      preserveDomOnError: true,
      finishMutation: true,
      restoreDrafts: retainedDrafts
    });
  } catch (error) {
    if (requestGeneration !== sessionGeneration || requestUserId !== currentSession?.user?.id) {
      setManualMutationBusyState(false);
      await loadSession({ focusId: "workspace-heading" });
      return;
    }
    if (isTerminalSessionError(error)) {
      setManualMutationBusyState(false);
      return loadSession();
    }
    if (isManualPermissionRevocation(error)) {
      setManualMutationBusyState(false);
      if (workspaceMembersState?.workspaceId === workspaceId) {
        workspaceMembersState = {
          ...workspaceMembersState,
          status: "loading",
          currentUserRole: null,
          members: [],
          message: error.message,
          messageKind: "error"
        };
      }
      const activeManualId =
        currentScreen === "manual-detail" &&
        currentWorkspaceSelection?.workspaceId === workspaceId &&
        manualDetailState.workspaceId === workspaceId
          ? manualDetailState.manualId
          : "";
      if (activeManualId && manualDetailState.value) {
        const safeValue = {
          ...manualDetailState.value,
          permissions: { ...(manualDetailState.value.permissions || {}), canEdit: false }
        };
        manualDetailState = { ...manualDetailState, status: "loaded", value: safeValue, message: error.message, messageKind: "error" };
      } else if (currentScreen === "manuals" && currentWorkspaceSelection?.workspaceId === workspaceId) {
        manualsState = { ...manualsState, message: error.message, messageKind: "error" };
      }
      const focusId = activeManualId
        ? "manual-detail-message"
        : currentScreen === "manuals"
          ? "manuals-message"
          : null;
      renderShell(currentSession, "", "notice", focusId);
      await loadWorkspaceMembers(workspaceId, {
        message: error.message,
        messageKind: "error",
        focusId,
        alreadyRendered: true
      });
      if (activeManualId && isCurrentManualDetailContext(workspaceId, activeManualId)) {
        await loadManualDetail(workspaceId, activeManualId, { message: error.message, messageKind: "error", focusId: "manual-detail-message" });
      }
      return;
    }
    if (error.status === 404) {
      if (!isCurrentManualDetailContext(workspaceId, manualId)) {
        setManualMutationBusyState(false);
        return;
      }
      await loadManualDetail(workspaceId, manualId, {
        message: error.message,
        messageKind: "error",
        focusId: "manual-detail-message",
        preserveDomUntilLoaded: true,
        preserveDomOnError: true,
        finishMutation: true,
        restoreDrafts: retainedDrafts
      });
      return;
    }
    const resultUnknown = manualMutationUnknown(error);
    if (resultUnknown && options.invalidateManuals && manualsState.workspaceId === workspaceId) {
      manualsState = { ...manualsState, status: "idle" };
    }
    if (!isCurrentManualDetailContext(workspaceId, manualId)) {
      setManualMutationBusyState(false);
      return;
    }
    if (resultUnknown) {
      if (options.resultUnknownToList) {
        setManualMutationBusyState(false);
        openManualList(selectedActiveWorkspace(), "アーカイブ結果を一覧で確認してください。重ねて操作しないでください。", "warning");
        return;
      }
      await loadManualDetail(workspaceId, manualId, {
        message: "処理結果を詳細で確認してください。重ねて操作しないでください。",
        messageKind: "warning",
        focusId: "manual-detail-message",
        preserveDomUntilLoaded: true,
        preserveDomOnError: true,
        finishMutation: true,
        restoreDrafts: retainedDrafts
      });
      return;
    }
    manualDetailState = { ...manualDetailState, status: "loaded", message: error.message, messageKind: "error" };
    setManualMutationBusyState(false);
    setBox("manual-detail-message", error.message, "error");
  }
}

function updateManualDraftFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = String(form.elements.title.value || "").trim();
  const description = String(form.elements.description.value || "");
  const expectedUpdatedAt = String(form.dataset.draftUpdatedAt || "");
  if (!title || Array.from(title).length > 64 || Array.from(description).length > 10000) {
    const message = "タイトルは1〜64文字、説明は10,000文字以内で入力してください。";
    manualDetailState = { ...manualDetailState, status: "loaded", message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    const invalidField = !title || Array.from(title).length > 64 ? form.elements.title : form.elements.description;
    invalidField.setAttribute("aria-invalid", "true");
    invalidField.focus();
    return;
  }
  if (!expectedUpdatedAt) {
    const message = "基本情報を再読み込みしてから保存してください。";
    manualDetailState = { ...manualDetailState, status: "loaded", message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    return;
  }
  form.elements.title.removeAttribute("aria-invalid");
  form.elements.description.removeAttribute("aria-invalid");
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "PATCH", body: JSON.stringify({ title, description, expectedUpdatedAt }) }), "基本情報を保存しました。", { excludeDraftKeys: ["draft"], invalidateManuals: true });
}

function publishManualFromUi() {
  const unsaved = captureManualDetailDrafts();
  if (Object.keys(unsaved).length > 0) {
    const message = "未保存の変更があります。すべて保存するか入力を元に戻してから公開してください。";
    manualDetailState = { ...manualDetailState, message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    return;
  }
  const confirmedSensitiveDataReview = document.getElementById("manual-sensitive-review-confirmation")?.checked === true;
  if (!confirmedSensitiveDataReview) {
    const message = "機密情報とマスキングの確認にチェックしてください。";
    manualDetailState = { ...manualDetailState, message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    return;
  }
  if (!window.confirm("確認済みの現在の下書きを公開しますか？ 公開版は後から直接変更できません。")) return;
  const expectedDraftRevisionId = manualDetailState.value?.draft?.id;
  const expectedContentVersion = manualDetailState.value?.draft?.contentVersion;
  if (!expectedDraftRevisionId || !expectedContentVersion) return;
  return runDetailMutation(
    (workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/publish", { method: "POST", body: JSON.stringify({ expectedDraftRevisionId, expectedContentVersion, confirmedSensitiveDataReview }) }),
    "手順書を公開しました。",
    { invalidateManuals: true }
  );
}

function archiveManualFromUi() {
  const unsaved = captureManualDetailDrafts();
  if (Object.keys(unsaved).length > 0) {
    const message = "未保存の変更があります。すべて保存するか入力を元に戻してからアーカイブしてください。";
    manualDetailState = { ...manualDetailState, message, messageKind: "error" };
    setBox("manual-detail-message", message, "error");
    return;
  }
  const expectedUpdatedAt = manualDetailState.value?.manual?.updatedAt;
  if (!expectedUpdatedAt) return;
  if (!window.confirm("この手順書をアーカイブしますか？ 一覧から非表示になりますが、下書き・公開版・手順は削除されません。")) return;
  return runDetailMutation(
    (workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/archive", { method: "POST", body: JSON.stringify({ expectedUpdatedAt }) }),
    "手順書をアーカイブしました。",
    { invalidateManuals: true, returnToListOnSuccess: true, resultUnknownToList: true }
  );
}

function createManualDraftFromUi() {
  const expectedPublishedRevisionId = manualDetailState.value?.manual?.currentPublishedRevisionId;
  if (!expectedPublishedRevisionId) return;
  return runDetailMutation(
    (workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/draft", { method: "POST", body: JSON.stringify({ expectedPublishedRevisionId }) }),
    "編集用の下書きを作成しました。",
    { invalidateManuals: true }
  );
}

function stepPayloadFromForm(form, isNew) {
  const type = form.elements.type.value;
  const isAction = type === "action";
  const payload = {
    type,
    title: String(form.elements.title.value || "").trim(),
    actionType: isAction ? form.elements.actionType.value || null : null,
    targetText: isAction ? String(form.elements.targetText.value || "").trim() || null : null,
    url: String(form.elements.url.value || "").trim() || null
  };
  const instruction = String(form.elements.instruction.value || "");
  if (!isNew || instruction) payload.instruction = instruction;
  if (!isNew) payload.expectedUpdatedAt = String(form.dataset.stepUpdatedAt || "");
  return payload;
}

function addManualStepFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const payload = stepPayloadFromForm(form, true);
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps", { method: "POST", body: JSON.stringify(payload) }), "手順を追加しました。", { excludeDraftKeys: ["new-step"] });
}

function updateManualStepFromUi(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const stepId = form.dataset.stepId;
  const payload = stepPayloadFromForm(form, false);
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "PATCH", body: JSON.stringify(payload) }), "手順を保存しました。", { excludeDraftKeys: ["step:" + stepId] });
}

function deleteManualStepFromUi(event) {
  const button = event.currentTarget;
  const stepId = button.dataset.stepId;
  const title = button.dataset.stepTitle || "この手順";
  if (!window.confirm("「" + title + "」を削除しますか？")) return;
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/" + encodeURIComponent(stepId), { method: "DELETE" }), "手順を削除しました。", { excludeDraftKeys: ["step:" + stepId] });
}

function reorderManualStepFromUi(event) {
  const button = event.currentTarget;
  const stepId = button.dataset.stepId;
  const steps = [...(manualDetailState.value?.steps || [])];
  const index = steps.findIndex((step) => step.id === stepId);
  const direction = button.classList.contains("manual-step-up") ? -1 : 1;
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= steps.length) return;
  [steps[index], steps[targetIndex]] = [steps[targetIndex], steps[index]];
  return runDetailMutation((workspaceId, manualId) => requestJson("/api/workspaces/" + encodeURIComponent(workspaceId) + "/manuals/" + encodeURIComponent(manualId) + "/steps/reorder", { method: "POST", body: JSON.stringify({ orderedStepIds: steps.map((step) => step.id) }) }), "手順の順番を変更しました。");
}

function renderShell(session, notice = "", noticeKind = "notice", focusId = null) {
  if (currentScreen === "manuals" || currentScreen === "manual-detail") {
    renderManualShell(session, notice, noticeKind, focusId);
    return;
  }
  const workspaces = session.workspaces || [];
  restoreUncertainWorkspaceCreation(session.user?.id);
  const currentWorkspace = resolveCurrentWorkspace(session);
  prepareWorkspaceMembersState(session, currentWorkspace);
  const currentRole = currentWorkspace && workspaceMembersState &&
    workspaceMembersState.workspaceId === currentWorkspace.id
    ? workspaceMembersState.currentUserRole
    : null;
  const creationUncertain = uncertainWorkspaceCreation?.userId === session.user?.id;
  const creationInFlight = workspaceCreationInFlight?.userId === session.user?.id;
  const rows = workspaces.map((workspace) =>
    '<tr>' +
      '<td><div class="workspace-name">' + escapeHtml(workspace.name) + '</div><div class="muted">' + escapeHtml(workspace.slug) + '</div></td>' +
      '<td><span class="badge">' + escapeHtml(workspaceStatusLabels[workspace.status] || "状態不明") + '</span></td>' +
      '<td>' + escapeHtml(workspace.created_at ? workspace.created_at.slice(0, 10) : "") + '</td>' +
    '</tr>'
  ).join("");
  const shellMessageClass = notice
    ? noticeKind === "error"
      ? "error-box show"
      : (creationUncertain || noticeKind === "warning")
        ? "warning-box show"
        : "notice-box show"
    : "notice-box";
  const shellMessageRole = noticeKind === "error" ? "alert" : "status";
  const shellMessageLive = noticeKind === "error" ? "assertive" : "polite";

  app.innerHTML =
    '<section class="shell">' +
      '<aside class="sidebar" aria-label="アプリメニュー">' +
        '<div class="brand"><div class="logo-mark" aria-hidden="true"><span>め</span></div><span>めっちゃマニュアル</span></div>' +
        '<nav class="nav" aria-label="主要メニュー">' +
          '<button id="workspace-nav-button" class="nav-item nav-button active" type="button" aria-current="page">ワークスペース</button>' +
          '<button id="members-nav-button" class="nav-item nav-button" type="button">メンバー管理</button>' +
          '<button id="manual-nav-button" class="nav-item nav-button" type="button">手順書</button>' +
          '<span class="nav-item" aria-disabled="true"><span>操作を記録</span><span class="nav-status">準備中</span></span>' +
        '</nav>' +
        '<div class="user-box">' +
          '<span>ログイン中：' + escapeHtml(session.user.email || "メールアドレス未設定") + '</span>' +
          '<button id="logout-button" class="secondary-button" type="button">ログアウト</button>' +
        '</div>' +
      '</aside>' +
      '<div id="screen-content" class="main" tabindex="-1">' +
        '<header class="topbar">' +
          '<div><h1 id="workspace-heading" tabindex="-1">ワークスペース</h1><p>所属しているワークスペースだけが表示されます。</p>' +
            '<div class="context-summary" aria-label="現在の利用状況">' +
              (currentWorkspace ? '<span class="badge">選択中：' + escapeHtml(currentWorkspace.name) + '</span>' : '<span class="badge">ワークスペース未選択</span>') +
              (currentRole
                ? '<span class="badge">' + (workspaceMembersState?.status === "error" ? '前回確認した権限：' : '現在の権限：') + escapeHtml(workspaceRoleLabels[currentRole]) + '</span>'
                : currentWorkspace
                  ? '<span class="badge">現在の権限：' + (workspaceMembersState?.status === "error" ? '確認できません' : 'メンバー一覧で確認') + '</span>'
                  : '') +
            '</div>' +
          '</div>' +
          '<button id="reload-button" class="secondary-button" type="button">一覧を更新</button>' +
        '</header>' +
        '<div id="shell-message" class="' + shellMessageClass + '" role="' + shellMessageRole + '" aria-live="' + shellMessageLive + '" aria-atomic="true" tabindex="-1">' + escapeHtml(notice) + '</div>' +
        '<div class="dashboard-grid">' +
          '<section id="workspace-overview" class="section" aria-labelledby="workspace-list-heading">' +
            '<div class="section-header"><h2 id="workspace-list-heading">所属ワークスペース</h2><span class="badge">' + workspaces.length + '件</span></div>' +
            (workspaces.length > 0
              ? '<div class="workspace-selector field">' +
                  '<label for="current-workspace">現在のワークスペース</label>' +
                  '<select id="current-workspace"' + (currentWorkspace ? '' : ' disabled') + '>' +
                    workspaces.map((workspace) =>
                      '<option value="' + escapeHtml(workspace.id) + '"' +
                        (workspace.id === currentWorkspace?.id ? ' selected' : '') +
                        (workspace.status !== 'active' ? ' disabled' : '') + '>' +
                        escapeHtml(workspace.name + '（' + workspace.slug + '）' + (workspace.status === 'active' ? '' : '（停止中）')) +
                      '</option>'
                    ).join('') +
                  '</select>' +
                  (currentWorkspace
                    ? '<p class="muted">現在選択中：' + escapeHtml(currentWorkspace.name) + '</p>'
                    : '<p class="muted">利用中のワークスペースがありません。管理者に確認してください。</p>') +
                '</div>' +
                '<div class="table-scroll" role="region" tabindex="0" aria-label="所属ワークスペース一覧">' +
                  '<table class="table"><caption class="visually-hidden">所属ワークスペース一覧</caption><thead><tr><th scope="col">名前</th><th scope="col">状態</th><th scope="col">作成日</th></tr></thead><tbody>' + rows + '</tbody></table>' +
                '</div>'
              : '<div class="empty" role="status"><strong>まだ所属しているワークスペースはありません。</strong><br>最初のワークスペースを作成してください。手順書はワークスペース内に保存されます。</div>') +
          '</section>' +
          (creationInFlight
            ? '<section class="workspace-form" aria-labelledby="workspace-creating-title" aria-busy="true">' +
                '<h2 id="workspace-creating-title">ワークスペースを作成中</h2>' +
                '<p>URL用ID「' + escapeHtml(workspaceCreationInFlight.slug) + '」を作成しています。完了するまでお待ちください。</p>' +
                '<p class="notice-box show" role="status" aria-live="polite">重複を防ぐため、新しい作成は一時停止しています。</p>' +
              '</section>'
            : creationUncertain
              ? '<section class="workspace-form" aria-labelledby="workspace-uncertain-title">' +
                '<h2 id="workspace-uncertain-title">作成結果を確認中</h2>' +
                '<p>URL用ID「' + escapeHtml(uncertainWorkspaceCreation.slug) + '」の処理結果をまだ確認できません。</p>' +
                '<p class="warning-box show">重複を防ぐため、新しい作成は停止しています。「一覧を更新」を押し、一覧で結果を確認してください。</p>' +
              '</section>'
            : '<form id="workspace-form" class="workspace-form" novalidate>' +
                '<h2>ワークスペース作成</h2>' +
                '<p>作成したユーザーが管理責任者になります。</p>' +
                '<div id="workspace-message" class="error-box" role="alert" aria-live="assertive" tabindex="-1"></div>' +
                '<div class="field">' +
                  '<label for="workspace-name">名前</label>' +
                  '<input id="workspace-name" name="name" data-max-code-points="64" required placeholder="例：営業部">' +
                '</div>' +
                '<div class="field">' +
                  '<label for="workspace-slug">URL用ID</label>' +
                  '<input id="workspace-slug" name="slug" data-max-normalized-length="63" inputmode="url" autocapitalize="none" required pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]" aria-describedby="workspace-slug-help" placeholder="例：sales-team">' +
                  '<span id="workspace-slug-help" class="muted">半角英数字とハイフンを使い、3〜63文字で入力してください。</span>' +
                '</div>' +
                '<button class="primary-button" type="submit">ワークスペースを作成</button>' +
              '</form>') +
          renderWorkspaceJoinCodeIssuer() +
          renderWorkspaceMembers(currentWorkspace) +
        '</div>' +
      '</div>' +
    '</section>';

  document.getElementById("logout-button").addEventListener("click", logout);
  wireManualNavigation(currentWorkspace);
  document.getElementById("reload-button").addEventListener("click", reloadWorkspaces);
  document.getElementById("workspace-form")?.addEventListener("submit", createWorkspace);
  const workspaceNameField = document.getElementById("workspace-name");
  let workspaceNameComposing = false;
  const enforceWorkspaceNameLimit = () => {
    clearWorkspaceFieldError(workspaceNameField);
    if (!limitWorkspaceNameCodePoints(workspaceNameField)) {
      clearWorkspaceLimitMessage("ワークスペース名は64文字以内で入力してください。");
    }
  };
  workspaceNameField?.addEventListener("compositionstart", () => { workspaceNameComposing = true; });
  workspaceNameField?.addEventListener("compositionend", () => {
    workspaceNameComposing = false;
    enforceWorkspaceNameLimit();
  });
  workspaceNameField?.addEventListener("input", () => {
    if (!workspaceNameComposing) enforceWorkspaceNameLimit();
  });
  const workspaceSlugField = document.getElementById("workspace-slug");
  workspaceSlugField?.addEventListener("input", () => {
    clearWorkspaceFieldError(workspaceSlugField);
    if (!limitWorkspaceSlugLength(workspaceSlugField)) {
      clearWorkspaceLimitMessage("URL用IDは63文字以内で入力してください。");
    }
  });
  document.getElementById("current-workspace")?.addEventListener("change", selectCurrentWorkspace);
  document.getElementById("members-reload-button")?.addEventListener("click", () => {
    if (currentWorkspace?.id) loadWorkspaceMembers(currentWorkspace.id, { focusId: "members-reload-button" });
  });
  document.getElementById("member-add-form")?.addEventListener("submit", addWorkspaceMember);
  document.getElementById("member-join-code")?.addEventListener("input", (event) => {
    clearWorkspaceMemberJoinCodeError(event.currentTarget);
    limitWorkspaceMemberJoinCodeLength(event.currentTarget);
  });
  document.getElementById("issue-join-code-button")?.addEventListener("click", issueWorkspaceJoinCode);
  document.getElementById("copy-join-code-button")?.addEventListener("click", copyWorkspaceJoinCode);
  for (const member of workspaceMembersState?.members || []) {
    document.getElementById("member-save-" + member.userId)?.addEventListener("click", () => updateWorkspaceMemberFromUi(member.userId, false));
    document.getElementById("member-stop-" + member.userId)?.addEventListener("click", () => updateWorkspaceMemberFromUi(member.userId, true));
  }
  if (notice) document.getElementById("shell-message").focus();
  else if (focusId) document.getElementById(focusId)?.focus();
}

async function reloadWorkspaces(event) {
  const button = event.currentTarget;
  const form = document.getElementById("workspace-form");
  const workspaceDraft = {
    name: form?.elements?.name?.value || "",
    slug: form?.elements?.slug?.value || ""
  };
  button.disabled = true;
  button.textContent = "更新中";
  button.setAttribute("aria-busy", "true");
  try {
    await loadSession({ preserveShell: true, workspaceDraft });
  } finally {
    if (document.getElementById("reload-button") === button) {
      button.disabled = false;
      button.textContent = "一覧を更新";
      button.removeAttribute("aria-busy");
    }
  }
}

async function loadSession(options = {}) {
  const requestSessionGeneration = sessionGeneration;
  const requestReloadSequence = ++sessionReloadSequence;
  try {
    const session = await requestJson("/api/session");
    if (requestSessionGeneration !== sessionGeneration || requestReloadSequence !== sessionReloadSequence) return;
    if (currentSession?.user?.id !== session.user?.id) {
      replaceCurrentSession(session);
    } else {
      currentSession = session;
    }
    const pendingJoinCodeIssuance = pendingWorkspaceJoinCodeIssuance?.userId === session.user?.id
      ? pendingWorkspaceJoinCodeIssuance
      : null;
    if (pendingJoinCodeIssuance) pendingJoinCodeIssuance.authReconciled = true;
    const pendingMemberReconciliation = pendingWorkspaceMemberMutation?.userId === session.user?.id &&
      (session.workspaces || []).some((workspace) =>
        workspace.id === pendingWorkspaceMemberMutation.workspaceId && workspace.status === "active"
      )
      ? pendingWorkspaceMemberMutation
      : null;
    if (pendingMemberReconciliation) {
      pendingWorkspaceMemberMutation.authReconciled = true;
      currentWorkspaceSelection = {
        userId: session.user.id,
        workspaceId: pendingMemberReconciliation.workspaceId
      };
    } else if (pendingWorkspaceMemberMutation?.userId === session.user?.id) {
      pendingWorkspaceMemberMutation = null;
    }
    restoreUncertainWorkspaceCreation(session.user?.id);
    let notice = "";
    if (uncertainWorkspaceCreation?.userId === session.user?.id) {
      const created = (session.workspaces || []).find(
        (workspace) => workspace.slug === uncertainWorkspaceCreation.slug
      );
      if (created) {
        if (
          workspaceCreationInFlight?.userId === session.user?.id &&
          workspaceCreationInFlight.slug === created.slug
        ) {
          workspaceCreationInFlight.confirmed = true;
          workspaceCreationInFlight = null;
        }
        clearUncertainWorkspaceCreation();
        notice = "作成済みのワークスペースを一覧で確認できました。";
      } else {
        notice = "作成結果をまだ一覧で確認できません。時間をおいて、もう一度一覧を更新してください。";
      }
    }
    if (!notice && options.preserveShell) notice = "一覧を更新しました。";
    renderShell(currentSession, notice, "notice", options.focusId || null);
    if (pendingJoinCodeIssuance?.settled) await finalizeWorkspaceJoinCodeIssuance(pendingJoinCodeIssuance);
    if (pendingMemberReconciliation?.settled) await reconcilePendingWorkspaceMemberMutation(pendingMemberReconciliation);
    if (options.preserveShell) document.getElementById("reload-button")?.focus();
  } catch (error) {
    if (requestSessionGeneration !== sessionGeneration || requestReloadSequence !== sessionReloadSequence) return;
    if (options.preserveShell && currentSession && !isTerminalSessionError(error)) {
      const message = error.code === "WORKSPACES_LIMIT_EXCEEDED"
        ? "所属ワークスペースが多いため一覧を更新できませんでした。表示中の一覧は更新前です。管理者に整理を依頼してください。"
        : error.status === 403
          ? "一覧を更新する権限を確認できませんでした。表示中の一覧は更新前です。もう一度ログインするか、管理者に確認してください。"
          : "一覧を更新できませんでした。表示中の一覧は更新前です。通信環境を確認して、もう一度お試しください。";
      if (error.status === 403 && currentWorkspaceSelection?.workspaceId) {
        workspaceMemberRequestSequence += 1;
        pendingWorkspaceMemberMutation = null;
        workspaceMembersState = {
          userId: currentSession.user?.id,
          workspaceId: currentWorkspaceSelection.workspaceId,
          status: "error",
          currentUserRole: null,
          members: [],
          message: "現在の権限を確認できませんでした。もう一度ログインするか、管理者に確認してください。",
          messageKind: "error",
          addDraftJoinCode: "",
          addJoinCodeError: ""
        };
      }
      renderShell(currentSession, message, error.status === 403 ? "error" : "warning");
      const form = document.getElementById("workspace-form");
      if (form?.elements?.name && form?.elements?.slug && options.workspaceDraft) {
        form.elements.name.value = options.workspaceDraft.name;
        form.elements.slug.value = options.workspaceDraft.slug;
      }
      return;
    }
    if (isTerminalSessionError(error)) {
      replaceCurrentSession(null);
      let message = "";
      if (error.code === "SESSION_INVALID") {
        message = "ログイン状態を確認できません。もう一度ログインしてください。";
      } else if (error.code !== "SESSION_REQUIRED") {
        message = "セッションの有効期限が切れました。もう一度ログインしてください。";
      }
      renderLogin(message);
      return;
    }
    if (error.status === 0) {
      if (["AUTH_LOCK_UNAVAILABLE", "AUTH_COORDINATION_UNAVAILABLE"].includes(error.code)) {
        renderLoadFailure("このブラウザでは安全に続行できません", error.message);
        return;
      }
      renderLoadFailure("サーバーに接続できません", error.message);
      return;
    }
    if (error.status === 403) {
      renderLoadFailure("ワークスペースを表示できません", "表示する権限を確認できませんでした。もう一度ログインするか、管理者に確認してください。");
      return;
    }
    renderLoadFailure("サービスを読み込めません", error.message);
  }
}

async function createWorkspace(event) {
  event.preventDefault();
  if (uncertainWorkspaceCreation?.userId === currentSession?.user?.id) return;
  if (workspaceCreationInFlight?.userId === currentSession?.user?.id) return;
  if (event.currentTarget.getAttribute?.("aria-busy") === "true" || event.currentTarget["aria-busy"] === "true") return;
  clearBox("workspace-message");
  const validationError = validateWorkspaceForm(event.currentTarget);
  updateWorkspaceFieldErrors(event.currentTarget, validationError);
  if (validationError) {
    setBox("workspace-message", validationError.message, "error");
    validationError.field?.focus?.();
    return;
  }
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  button.textContent = "作成中";
  event.currentTarget.setAttribute("aria-busy", "true");
  const requestSessionGeneration = sessionGeneration;
  const requestUserId = currentSession?.user?.id;
  const submittedWorkspace = {
    userId: requestUserId,
    name: event.currentTarget.elements.name.value.trim(),
    slug: event.currentTarget.elements.slug.value.trim().toLowerCase(),
    confirmed: false
  };
  workspaceCreationInFlight = submittedWorkspace;
  saveUncertainWorkspaceCreation(submittedWorkspace);
  let workspaceCreated = false;
  let requestWorkspaceSequence = ++sessionReloadSequence;
  try {
    const creationResult = await requestJson("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({
        name: submittedWorkspace.name,
        slug: submittedWorkspace.slug
      })
    });
    if (!creationResult || typeof creationResult.workspaceId !== "string" || !workspaceIdPattern.test(creationResult.workspaceId)) {
      throw new AppRequestError(
        "作成処理の結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。",
        502,
        "WORKSPACE_CREATE_RESULT_UNKNOWN"
      );
    }
    workspaceCreated = true;
    if (requestSessionGeneration !== sessionGeneration) {
      if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
      if (currentSession?.user?.id === requestUserId) loadSession();
      return;
    }
    requestWorkspaceSequence = ++sessionReloadSequence;
    const session = await requestJson("/api/session");
    if (requestSessionGeneration !== sessionGeneration || requestWorkspaceSequence !== sessionReloadSequence) {
      if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
      if (currentSession?.user?.id === requestUserId) loadSession();
      return;
    }
    if (session.user?.id !== requestUserId) {
      replaceCurrentSession(session);
      renderShell(currentSession);
      return;
    }
    currentSession = session;
    if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
    const created = (session.workspaces || []).some((workspace) => workspace.slug === submittedWorkspace.slug);
    if (
      created &&
      uncertainWorkspaceCreation?.userId === submittedWorkspace.userId &&
      uncertainWorkspaceCreation.slug === submittedWorkspace.slug
    ) {
      clearUncertainWorkspaceCreation();
    }
    renderShell(
      currentSession,
      created
        ? "ワークスペースを作成しました。"
        : "ワークスペースは作成されました。重ねて作成せず、一覧を更新して確認してください。",
      created ? "notice" : "warning"
    );
  } catch (error) {
    if (submittedWorkspace.confirmed) {
      if (
        uncertainWorkspaceCreation?.userId === submittedWorkspace.userId &&
        uncertainWorkspaceCreation.slug === submittedWorkspace.slug
      ) {
        clearUncertainWorkspaceCreation();
      }
      return;
    }
    const resultUnknown = !workspaceCreated && (
      error.code === "WORKSPACE_CREATE_RESULT_UNKNOWN" ||
      error.code === "NETWORK_ERROR" ||
      error.code === "INVALID_RESPONSE" ||
      (error.status >= 500 && ![
        "WORKSPACE_CREATE_FAILED",
        "WORKSPACE_CREATE_SERVICE_UNAVAILABLE"
      ].includes(error.code))
    );
    if (resultUnknown) {
      if (currentSession?.user?.id === requestUserId) {
        saveUncertainWorkspaceCreation(submittedWorkspace);
        if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
        if (requestSessionGeneration !== sessionGeneration) {
          loadSession();
          return;
        }
        renderShell(
          currentSession,
          "作成処理の結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。"
        );
      }
      return;
    }
    if (!workspaceCreated && uncertainWorkspaceCreation?.userId === requestUserId && uncertainWorkspaceCreation.slug === submittedWorkspace.slug) {
      clearUncertainWorkspaceCreation();
    }
    if (error.status === 401) {
      if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
      await loadSession();
      return;
    }
    if (requestSessionGeneration !== sessionGeneration) {
      if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
      if (currentSession?.user?.id === requestUserId) renderShell(currentSession, error.message, "warning");
      return;
    }
    if (requestWorkspaceSequence !== sessionReloadSequence) {
      if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
      if (currentSession?.user?.id === requestUserId) renderShell(currentSession, error.message, "warning");
      return;
    }
    if (workspaceCreated) {
      if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
      renderShell(
        currentSession,
        "ワークスペースは作成されましたが、最新の一覧を取得できませんでした。「一覧を更新」をお試しください。",
        "warning"
      );
      return;
    }
    if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
    setBox("workspace-message", error.message, "error");
  } finally {
    if (workspaceCreationInFlight === submittedWorkspace) workspaceCreationInFlight = null;
    button.disabled = false;
    button.textContent = "ワークスペースを作成";
    event.currentTarget.removeAttribute?.("aria-busy");
  }
}

async function logout() {
  clearBox("shell-message");
  const button = document.getElementById("logout-button");
  button.disabled = true;
  button.textContent = "ログアウト中";
  button.setAttribute("aria-busy", "true");
  const requestSessionGeneration = ++sessionGeneration;
  try {
    const requestAuthenticationVersion = readAuthenticationVersion();
    const logoutSent = await logoutWithAuthenticationLock(requestAuthenticationVersion);
    if (!logoutSent) {
      renderAuthenticationReload();
      await loadSession();
      return;
    }
    if (requestSessionGeneration !== sessionGeneration) return;
    replaceCurrentSession(null);
    renderLogin();
  } catch (error) {
    if (requestSessionGeneration !== sessionGeneration) return;
    if (["AUTH_LOCK_UNAVAILABLE", "AUTH_COORDINATION_UNAVAILABLE"].includes(error.code)) {
      setBox("shell-message", error.message, "error");
      return;
    }
    if (error.code !== "LOGOUT_REVOKE_FAILED") {
      const message = error.code === "NETWORK_ERROR"
        ? "サーバーに接続できず、ログアウトを完了できませんでした。通信環境を確認して、もう一度お試しください。"
        : "サーバーの応答を確認できず、ログアウトを完了できませんでした。時間をおいて、もう一度お試しください。";
      setBox("shell-message", message, "error");
      return;
    }
    replaceCurrentSession(null);
    renderLogin(error.message);
  } finally {
    const activeButton = document.getElementById("logout-button");
    if (activeButton) {
      activeButton.disabled = false;
      activeButton.textContent = "ログアウト";
      activeButton.removeAttribute("aria-busy");
    }
  }
}

loadSession();
`;
