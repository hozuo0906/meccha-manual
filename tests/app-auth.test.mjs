import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

import { APP_JS } from "../apps/worker/src/app-assets.ts";

function createHarness({ fetch, beforeLock, disableLocks = false } = {}) {
  const storage = new Map();
  const lockCalls = [];
  const elements = new Map();
  let focusedId = null;
  let insideLock = false;

  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const value = {
      id,
      className: "",
      disabled: false,
      elements: {
        email: { value: "", validity: { typeMismatch: false } },
        password: { value: "", validity: {} }
      },
      listeners: new Map(),
      textContent: "",
      addEventListener(type, listener) {
        this.listeners.set(type, listener);
      },
      focus() {
        focusedId = id;
      },
      querySelector() {
        return element(`${id}-button`);
      },
      removeAttribute(name) {
        delete this[name];
      },
      setAttribute(name, attributeValue) {
        this[name] = attributeValue;
      }
    };
    elements.set(id, value);
    return value;
  }

  const app = element("app");
  const context = {
    BroadcastChannel: undefined,
    FormData,
    Set,
    URL,
    crypto: webcrypto,
    document: {
      getElementById(id) {
        return element(id);
      }
    },
    fetch: (...args) => (fetch ?? (async () => Response.json({})))(...args, { insideLock, storage }),
    localStorage: {
      getItem(key) {
        return storage.get(key) ?? null;
      },
      setItem(key, value) {
        storage.set(key, String(value));
      }
    },
    navigator: disableLocks ? {} : {
      locks: {
        async request(name, options, operation) {
          lockCalls.push({ name, options });
          beforeLock?.(storage);
          insideLock = true;
          try {
            return await operation();
          } finally {
            insideLock = false;
          }
        }
      }
    }
  };
  context.globalThis = context;

  const source = APP_JS.replace(/\nloadSession\(\);\s*$/, "") + `
globalThis.__appAuthTest = {
  requestJson,
  validateLoginForm,
  isTerminalSessionError,
  readAuthenticationVersion,
  loadSession,
  logout,
  renderLogin,
  renderShell,
  replaceCurrentSession,
  setBox,
  getCurrentSession: () => currentSession
};`;
  vm.runInNewContext(source, context);
  return {
    api: context.__appAuthTest,
    app,
    element,
    focusedId: () => focusedId,
    lockCalls,
    storage
  };
}

test("refresh要求は認証Web Lock内で現Cookieを再確認してから専用POSTと再送を行う", async () => {
  const calls = [];
  const { api, lockCalls } = createHarness({
    fetch: async (path, options = {}, meta) => {
      calls.push({ path, method: options.method ?? "GET", insideLock: meta.insideLock });
      if (calls.length <= 2) {
        return Response.json({ code: "SESSION_REFRESH_REQUIRED", message: "ログイン状態を更新してください。" }, { status: 401 });
      }
      if (path === "/api/auth/refresh") return Response.json({ status: "ok" });
      return Response.json({ user: { id: "user-1" }, workspaces: [] });
    }
  });

  const payload = await api.requestJson("/api/session");

  assert.equal(payload.user.id, "user-1");
  assert.deepEqual(calls.map(({ path, method }) => [path, method]), [
    ["/api/session", "GET"],
    ["/api/session", "GET"],
    ["/api/auth/refresh", "POST"],
    ["/api/session", "GET"]
  ]);
  assert.equal(lockCalls.length, 1);
  assert.equal(lockCalls[0].name, "meccha-manual-authentication");
  assert.equal(calls[0].insideLock, false);
  assert.equal(calls[1].insideLock, true);
  assert.equal(calls[2].insideLock, true);
  assert.equal(calls[3].insideLock, true);
});

test("lock待機中に別要求がrefresh済みなら追加refreshを送信しない", async () => {
  const calls = [];
  const { api } = createHarness({
    fetch: async (path, options = {}, meta) => {
      calls.push({ path, method: options.method ?? "GET", insideLock: meta.insideLock });
      if (calls.length === 1) {
        return Response.json({ code: "SESSION_REFRESH_REQUIRED", message: "ログイン状態を更新してください。" }, { status: 401 });
      }
      return Response.json({ user: { id: "user-1" }, workspaces: [] });
    }
  });

  const payload = await api.requestJson("/api/session");

  assert.equal(payload.user.id, "user-1");
  assert.deepEqual(calls.map(({ path }) => path), ["/api/session", "/api/session"]);
  assert.equal(calls[1].insideLock, true);
});

test("lock待機中に認証世代が変わったら古いrefreshを送信しない", async () => {
  const calls = [];
  const { api } = createHarness({
    beforeLock(storage) {
      storage.set("meccha-manual-authentication-version", "new-login-version");
    },
    fetch: async (path) => {
      calls.push(path);
      if (calls.length === 1) {
        return Response.json({ code: "SESSION_REFRESH_REQUIRED", message: "ログイン状態を更新してください。" }, { status: 401 });
      }
      return Response.json({ user: { id: "new-user" }, workspaces: [] });
    }
  });

  const payload = await api.requestJson("/api/session");

  assert.equal(payload.user.id, "new-user");
  assert.deepEqual(calls, ["/api/session", "/api/session"]);
});

test("初回要求中に認証世代が変わった状態変更はrefreshも再送もしない", async () => {
  const calls = [];
  const { api } = createHarness({
    fetch: async (path, options, meta) => {
      calls.push(path);
      if (calls.length === 1) {
        meta.storage.set("meccha-manual-authentication-version", "other-user-login");
        return Response.json({ code: "SESSION_REFRESH_REQUIRED", message: "ログイン状態を更新してください。" }, { status: 401 });
      }
      throw new Error("状態変更要求を再送してはいけません");
    }
  });

  await assert.rejects(
    api.requestJson("/api/workspaces", { method: "POST", body: "{}" }),
    (error) => error.code === "AUTHENTICATION_CHANGED" && error.status === 409
  );
  assert.deepEqual(calls, ["/api/workspaces"]);
});

test("既知のセッション401だけを再ログイン状態として扱う", () => {
  const { api } = createHarness();

  assert.equal(api.isTerminalSessionError({ status: 401, code: "SESSION_EXPIRED" }), true);
  assert.equal(api.isTerminalSessionError({ status: 401, code: "SESSION_INVALID" }), true);
  assert.equal(api.isTerminalSessionError({ status: 401, code: "INVALID_RESPONSE" }), false);
  assert.equal(api.isTerminalSessionError({ status: 401, code: "UNKNOWN_PROXY_ERROR" }), false);
  assert.equal(api.isTerminalSessionError({ status: 502, code: "SESSION_EXPIRED" }), false);
});

test("ログイン入力の未入力とメール形式不正を日本語で区別する", () => {
  const { api } = createHarness();
  const form = {
    elements: {
      email: { value: "", validity: { typeMismatch: false } },
      password: { value: "", validity: {} }
    }
  };

  assert.equal(api.validateLoginForm(form), "メールアドレスを入力してください。");
  form.elements.email.value = "not-an-email";
  form.elements.email.validity.typeMismatch = true;
  form.elements.password.value = "password";
  assert.equal(api.validateLoginForm(form), "メールアドレスの形式を確認してください。");
  form.elements.email.value = "user@example.invalid";
  form.elements.email.validity.typeMismatch = false;
  form.elements.password.value = "";
  assert.equal(api.validateLoginForm(form), "パスワードを入力してください。");
  form.elements.password.value = "password";
  assert.equal(api.validateLoginForm(form), "");
});

test("正常なsession取得で保護shellと所属ワークスペースを表示する", async () => {
  const { api, app } = createHarness({
    fetch: async () => Response.json({
      user: { id: "user-1", email: "user@example.invalid" },
      profile: null,
      workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales", status: "active", created_at: "2026-08-09T00:00:00Z" }]
    })
  });

  await api.loadSession();

  assert.match(app.innerHTML, /class="shell"/);
  assert.match(app.innerHTML, /user@example\.invalid/);
  assert.match(app.innerHTML, /営業部/);
  assert.equal(api.getCurrentSession().user.id, "user-1");
});

test("期限切れでは保護sessionを消去して警告へフォーカスする", async () => {
  const { api, app, focusedId } = createHarness({
    fetch: async () => Response.json({
      code: "SESSION_EXPIRED",
      message: "セッションの有効期限が切れました。"
    }, { status: 401 })
  });
  api.replaceCurrentSession({ user: { id: "old-user" }, workspaces: [{ name: "機密ワークスペース" }] });
  app.innerHTML = "機密ワークスペース";

  await api.loadSession();

  assert.equal(api.getCurrentSession(), null);
  assert.doesNotMatch(app.innerHTML, /機密ワークスペース/);
  assert.match(app.innerHTML, /セッションの有効期限が切れました/);
  assert.equal(focusedId(), "login-message");
});

test("エラー表示はalert領域へフォーカスを移す", () => {
  const { api, element, focusedId } = createHarness();
  api.setBox("login-message", "入力を確認してください。", "error");
  assert.equal(element("login-message").textContent, "入力を確認してください。");
  assert.equal(focusedId(), "login-message");
});

test("ログアウト通信失敗ではshellを維持して再試行を案内する", async () => {
  const { api, app, element } = createHarness({
    fetch: async () => {
      throw new Error("offline");
    }
  });
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);

  await api.logout();

  assert.match(app.innerHTML, /class="shell"/);
  assert.equal(api.getCurrentSession().user.id, "user-1");
  assert.match(element("shell-message").textContent, /ログアウトを完了できませんでした/);
});

test("refreshにWeb Lockを使えないブラウザはサーバー障害と誤表示しない", async () => {
  const { api, app } = createHarness({
    disableLocks: true,
    fetch: async () => Response.json({
      code: "SESSION_REFRESH_REQUIRED",
      message: "ログイン状態を更新してください。"
    }, { status: 401 })
  });

  await api.loadSession();

  assert.match(app.innerHTML, /このブラウザでは安全に続行できません/);
  assert.doesNotMatch(app.innerHTML, /サーバーに接続できません/);
  assert.match(app.innerHTML, /最新版のChrome/);
});
