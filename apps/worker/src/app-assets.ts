export const APP_HTML = `<!doctype html>
<html lang="ja">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>めっちゃマニュアル</title>
  <link rel="stylesheet" href="/assets/app.css">
</head>
<body>
  <main id="app" class="app">
    <section class="boot">
      <div class="logo-mark" aria-hidden="true"><span>め</span></div>
      <p>読み込み中</p>
    </section>
  </main>
  <script src="/assets/app.js" defer></script>
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

.field input {
  width: 100%;
  min-height: 46px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #fff;
  color: var(--text);
}

.field input:focus {
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
.notice-box {
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

.topbar h2 {
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

.workspace-form h3 {
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

async function requestJson(path, options = {}) {
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

  const text = await response.text();
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
        '<form id="login-form" class="form">' +
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
    button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      await requestJson("/api/auth/login", {
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
    }
  });
  if (message) document.getElementById("login-message").focus();
}

function renderLoadFailure(title, message) {
  app.innerHTML =
    '<section class="boot" role="alert" aria-live="assertive">' +
      '<div class="logo-mark" aria-hidden="true"><span>め</span></div>' +
      '<h1>' + escapeHtml(title) + '</h1>' +
      '<p>' + escapeHtml(message) + '</p>' +
      '<button id="retry-button" class="primary-button" type="button">もう一度読み込む</button>' +
    '</section>';
  document.getElementById("retry-button").addEventListener("click", loadSession);
  document.getElementById("retry-button").focus();
}

function renderShell(session, notice = "") {
  const workspaces = session.workspaces || [];
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
          '<div><h2>ワークスペース</h2><p>所属しているワークスペースだけが表示されます。</p></div>' +
          '<button id="reload-button" class="secondary-button" type="button">一覧を更新</button>' +
        '</header>' +
        '<div id="shell-message" class="' + (notice ? 'notice-box show' : 'error-box') + '" role="status" aria-live="polite" tabindex="-1">' + escapeHtml(notice) + '</div>' +
        '<div class="dashboard-grid">' +
          '<section class="section">' +
            '<div class="section-header"><h3>一覧</h3><span class="badge">' + workspaces.length + '件</span></div>' +
            (workspaces.length > 0
              ? '<table class="table"><thead><tr><th>名前</th><th>状態</th><th>作成日</th></tr></thead><tbody>' + rows + '</tbody></table>'
              : '<div class="empty">まだワークスペースがありません。</div>') +
          '</section>' +
          '<form id="workspace-form" class="workspace-form">' +
            '<h3>ワークスペース作成</h3>' +
            '<p>作成したユーザーが管理責任者になります。</p>' +
            '<div id="workspace-message" class="error-box" role="alert" aria-live="assertive" tabindex="-1"></div>' +
            '<div class="field">' +
              '<label for="workspace-name">名前</label>' +
              '<input id="workspace-name" name="name" required maxlength="64" placeholder="例：営業部">' +
            '</div>' +
            '<div class="field">' +
              '<label for="workspace-slug">URL用ID</label>' +
              '<input id="workspace-slug" name="slug" required pattern="[a-z0-9][a-z0-9-]{1,61}[a-z0-9]" aria-describedby="workspace-slug-help" placeholder="例：sales-team">' +
              '<span id="workspace-slug-help" class="muted">半角英数字とハイフンを使い、3〜63文字で入力してください。</span>' +
            '</div>' +
            '<button class="primary-button" type="submit">ワークスペースを作成</button>' +
          '</form>' +
        '</div>' +
      '</div>' +
    '</section>';

  document.getElementById("logout-button").addEventListener("click", logout);
  document.getElementById("reload-button").addEventListener("click", loadSession);
  document.getElementById("workspace-form").addEventListener("submit", createWorkspace);
  if (notice) document.getElementById("shell-message").focus();
}

async function loadSession() {
  try {
    currentSession = await requestJson("/api/session");
    renderShell(currentSession);
  } catch (error) {
    currentSession = null;
    if (error.status === 401) {
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
      renderLoadFailure("サーバーに接続できません", error.message);
      return;
    }
    renderLoadFailure("サービスを読み込めません", error.message);
  }
}

async function createWorkspace(event) {
  event.preventDefault();
  clearBox("workspace-message");
  const button = event.currentTarget.querySelector("button");
  button.disabled = true;
  try {
    const form = new FormData(event.currentTarget);
    const result = await requestJson("/api/workspaces", {
      method: "POST",
      body: JSON.stringify({
        name: form.get("name"),
        slug: form.get("slug")
      })
    });
    currentSession = { ...currentSession, workspaces: result.workspaces || [] };
    renderShell(currentSession, "ワークスペースを作成しました。");
  } catch (error) {
    setBox("workspace-message", error.message, "error");
  } finally {
    button.disabled = false;
  }
}

async function logout() {
  clearBox("shell-message");
  const button = document.getElementById("logout-button");
  button.disabled = true;
  try {
    await requestJson("/api/auth/logout", { method: "POST", body: "{}" });
    currentSession = null;
    renderLogin();
  } catch (error) {
    if (error.code !== "LOGOUT_REVOKE_FAILED") {
      setBox("shell-message", "ログアウトを完了できませんでした。通信環境を確認して、もう一度お試しください。", "error");
      return;
    }
    currentSession = null;
    renderLogin(error.message);
  } finally {
    const activeButton = document.getElementById("logout-button");
    if (activeButton) activeButton.disabled = false;
  }
}

loadSession();
`;
