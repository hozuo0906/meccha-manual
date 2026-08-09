export const APP_ASSET_VERSION = "sha256-d28f214afa1c8145";

export const APP_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>めっちゃマニュアル</title>
  <link rel="stylesheet" href="/assets/app.css?v=${APP_ASSET_VERSION}">
</head>
<body>
  <main id="app" class="app">
    <section class="boot" role="status" aria-live="polite" aria-busy="true">
      <div class="logo-mark" aria-hidden="true"><span>め</span></div>
      <p>ワークスペースを読み込んでいます</p>
    </section>
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
}

button,
input {
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
.secondary-button {
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
    grid-auto-flow: column;
    overflow-x: auto;
    margin-top: 0;
  }

  .topbar {
    display: grid;
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
    '<section class="boot" role="status" aria-live="polite">' +
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
  renderAuthenticationReload();
  loadSession();
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

function selectCurrentWorkspace(event) {
  const workspaceId = event.currentTarget.value;
  const selected = (currentSession?.workspaces || []).find(
    (workspace) => workspace.id === workspaceId && workspace.status === "active"
  );
  if (!selected || !currentSession?.user?.id) return;
  currentWorkspaceSelection = { userId: currentSession.user.id, workspaceId: selected.id };
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

function setBox(id, message, kind) {
  const box = document.getElementById(id);
  if (!box) return;
  box.textContent = message || "";
  box.className = kind === "notice" ? "notice-box show" : "error-box show";
  if (kind !== "notice") box.focus();
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
  const remaining = describedBy.split(/\s+/).filter((id) => id && id !== "workspace-message").join(" ");
  if (remaining) field.setAttribute?.("aria-describedby", remaining);
  else field?.removeAttribute?.("aria-describedby");
}

function workspaceNameLength(value) {
  return Array.from(value).length;
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
    '<section class="login-screen">' +
      '<div class="login-intro">' +
        '<div class="login-copy">' +
          '<div class="logo-mark" aria-hidden="true"><span>め</span></div>' +
          '<p class="eyebrow">日本のオフィスワーカー専用</p>' +
          '<h1>めっちゃマニュアル</h1>' +
          '<p>業務の手順をわかりやすく整理し、チームで共有するためのサービスです。</p>' +
        '</div>' +
      '</div>' +
      '<div class="login-panel">' +
        '<div class="panel-heading">' +
          '<h2>ログイン</h2>' +
          '<p>登録済みのメールアドレスとパスワードを入力してください。</p>' +
        '</div>' +
        '<form id="login-form" class="form" novalidate>' +
          '<div id="login-message" class="error-box' + (message ? ' show' : '') + '" role="alert" aria-live="assertive" tabindex="-1">' + escapeHtml(message) + '</div>' +
          '<div class="field">' +
            '<label for="email">メールアドレス</label>' +
            '<input id="email" name="email" type="email" autocomplete="email" required>' +
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
      await loadSession();
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
    '<section class="boot" role="alert" aria-live="assertive">' +
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
    await loadSession();
  });
  retryButton.focus();
}

function renderShell(session, notice = "", noticeKind = "notice") {
  const workspaces = session.workspaces || [];
  restoreUncertainWorkspaceCreation(session.user?.id);
  const currentWorkspace = resolveCurrentWorkspace(session);
  const creationUncertain = uncertainWorkspaceCreation?.userId === session.user?.id;
  const creationInFlight = workspaceCreationInFlight?.userId === session.user?.id;
  const rows = workspaces.map((workspace) =>
    '<tr>' +
      '<td><div class="workspace-name">' + escapeHtml(workspace.name) + '</div><div class="muted">' + escapeHtml(workspace.slug) + '</div></td>' +
      '<td><span class="badge">' + escapeHtml(workspaceStatusLabels[workspace.status] || "状態不明") + '</span></td>' +
      '<td>' + escapeHtml(workspace.created_at ? workspace.created_at.slice(0, 10) : "") + '</td>' +
    '</tr>'
  ).join("");

  app.innerHTML =
    '<section class="shell">' +
      '<aside class="sidebar">' +
        '<div class="brand"><div class="logo-mark" aria-hidden="true"><span>め</span></div><span>めっちゃマニュアル</span></div>' +
        '<nav class="nav" aria-label="主要メニュー">' +
          '<div class="nav-item active" aria-current="page">ワークスペース</div>' +
          '<div class="nav-item" aria-disabled="true">手順書（準備中）</div>' +
          '<div class="nav-item" aria-disabled="true">操作を記録（準備中）</div>' +
        '</nav>' +
        '<div class="user-box">' +
          '<span>' + escapeHtml(session.user.email || "ログイン中") + '</span>' +
          '<button id="logout-button" class="secondary-button" type="button">ログアウト</button>' +
        '</div>' +
      '</aside>' +
      '<div class="main">' +
        '<header class="topbar">' +
          '<div><h1 id="workspace-heading" tabindex="-1">ワークスペース</h1><p>所属しているワークスペースだけが表示されます。</p></div>' +
          '<button id="reload-button" class="secondary-button" type="button">一覧を更新</button>' +
        '</header>' +
        '<div id="shell-message" class="' + (notice ? ((creationUncertain || noticeKind === 'warning') ? 'warning-box show' : 'notice-box show') : 'error-box') + '" role="status" aria-live="polite" tabindex="-1">' + escapeHtml(notice) + '</div>' +
        '<div class="dashboard-grid">' +
          '<section class="section">' +
            '<div class="section-header"><h2>所属ワークスペース</h2><span class="badge">' + workspaces.length + '件</span></div>' +
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
                '<div class="table-scroll" tabindex="0" aria-label="所属ワークスペース一覧">' +
                  '<table class="table"><caption class="visually-hidden">所属ワークスペース一覧</caption><thead><tr><th scope="col">名前</th><th scope="col">状態</th><th scope="col">作成日</th></tr></thead><tbody>' + rows + '</tbody></table>' +
                '</div>'
              : '<div class="empty"><strong>まだ所属しているワークスペースはありません。</strong><br>最初のワークスペースを作成してください。手順書はワークスペース内に保存されます。</div>') +
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
                  '<input id="workspace-name" name="name" required placeholder="例：営業部">' +
                '</div>' +
                '<div class="field">' +
                  '<label for="workspace-slug">URL用ID</label>' +
                  '<input id="workspace-slug" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]" aria-describedby="workspace-slug-help" placeholder="例：sales-team">' +
                  '<span id="workspace-slug-help" class="muted">半角英数字とハイフンを使い、3〜63文字で入力してください。</span>' +
                '</div>' +
                '<button class="primary-button" type="submit">ワークスペースを作成</button>' +
              '</form>') +
        '</div>' +
      '</div>' +
    '</section>';

  document.getElementById("logout-button").addEventListener("click", logout);
  document.getElementById("reload-button").addEventListener("click", reloadWorkspaces);
  document.getElementById("workspace-form")?.addEventListener("submit", createWorkspace);
  for (const field of [document.getElementById("workspace-name"), document.getElementById("workspace-slug")]) {
    field?.addEventListener("input", () => clearWorkspaceFieldError(field));
  }
  document.getElementById("current-workspace")?.addEventListener("change", selectCurrentWorkspace);
  if (notice) document.getElementById("shell-message").focus();
  else document.getElementById("workspace-heading")?.focus();
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
    restoreUncertainWorkspaceCreation(session.user?.id);
    let notice = "";
    if (uncertainWorkspaceCreation?.userId === session.user?.id) {
      const created = (session.workspaces || []).find(
        (workspace) => workspace.slug === uncertainWorkspaceCreation.slug
      );
      if (created) {
        clearUncertainWorkspaceCreation();
        notice = "作成済みのワークスペースを一覧で確認できました。";
      } else {
        notice = "作成結果をまだ一覧で確認できません。時間をおいて、もう一度一覧を更新してください。";
      }
    }
    if (!notice && options.preserveShell) notice = "一覧を更新しました。";
    renderShell(currentSession, notice);
    if (options.preserveShell) document.getElementById("reload-button")?.focus();
  } catch (error) {
    if (requestSessionGeneration !== sessionGeneration || requestReloadSequence !== sessionReloadSequence) return;
    if (options.preserveShell && currentSession && !isTerminalSessionError(error)) {
      const message = error.code === "WORKSPACES_LIMIT_EXCEEDED"
        ? "所属ワークスペースが多いため一覧を更新できませんでした。表示中の一覧は更新前です。管理者に整理を依頼してください。"
        : error.status === 403
          ? "一覧を更新する権限を確認できませんでした。表示中の一覧は更新前です。もう一度ログインするか、管理者に確認してください。"
          : "一覧を更新できませんでした。表示中の一覧は更新前です。通信環境を確認して、もう一度お試しください。";
      renderShell(currentSession, message, "warning");
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
    slug: event.currentTarget.elements.slug.value.trim().toLowerCase()
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
    if (created) clearUncertainWorkspaceCreation();
    renderShell(
      currentSession,
      created
        ? "ワークスペースを作成しました。"
        : "ワークスペースは作成されました。重ねて作成せず、一覧を更新して確認してください。",
      created ? "notice" : "warning"
    );
  } catch (error) {
    const resultUnknown = !workspaceCreated && (
      error.code === "WORKSPACE_CREATE_RESULT_UNKNOWN" ||
      error.code === "NETWORK_ERROR" ||
      error.code === "INVALID_RESPONSE" ||
      (error.status >= 500 && error.code !== "WORKSPACE_CREATE_FAILED")
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
