import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

import { APP_JS } from "../apps/worker/src/app-assets.ts";

function createHarness({ fetch, beforeLock, disableLocks = false, enableBroadcast = false, sessionStorageSetThrows = false } = {}) {
  const storage = new Map();
  const sessionStorageValues = new Map();
  const lockCalls = [];
  const broadcastMessages = [];
  let broadcastChannelInstance = null;
  const elements = new Map();
  let focusedId = null;
  let insideLock = false;
  let lockTail = Promise.resolve();

  class HarnessFormData {
    constructor(form) {
      this.form = form;
    }

    get(name) {
      return this.form?.elements?.[name]?.value ?? null;
    }
  }

  function element(id) {
    if (elements.has(id)) return elements.get(id);
    const value = {
      id,
      className: "",
      disabled: false,
      elements: {
        email: {
          value: "",
          validity: { typeMismatch: false },
          removeAttribute(name) { delete this[name]; },
          setAttribute(name, attributeValue) { this[name] = attributeValue; }
        },
        password: {
          value: "",
          validity: {},
          removeAttribute(name) { delete this[name]; },
          setAttribute(name, attributeValue) { this[name] = attributeValue; }
        }
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
  class HarnessBroadcastChannel {
    constructor(name) {
      this.name = name;
      this.listeners = new Map();
      broadcastChannelInstance = this;
    }

    addEventListener(type, listener) {
      this.listeners.set(type, listener);
    }

    postMessage(message) {
      broadcastMessages.push({ channel: this.name, message });
    }
  }

  const context = {
    BroadcastChannel: enableBroadcast ? HarnessBroadcastChannel : undefined,
    FormData: HarnessFormData,
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
    sessionStorage: {
      getItem(key) {
        return sessionStorageValues.get(key) ?? null;
      },
      setItem(key, value) {
        if (sessionStorageSetThrows) throw new Error("sessionStorage unavailable");
        sessionStorageValues.set(key, String(value));
      },
      removeItem(key) {
        sessionStorageValues.delete(key);
      }
    },
    navigator: disableLocks ? {} : {
      locks: {
        async request(name, options, operation) {
          lockCalls.push({ name, options });
          const previousLock = lockTail;
          let releaseLock;
          lockTail = new Promise((resolve) => {
            releaseLock = resolve;
          });
          await previousLock;
          beforeLock?.(storage);
          insideLock = true;
          try {
            return await operation();
          } finally {
            insideLock = false;
            releaseLock();
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
  validateWorkspaceForm,
  updateWorkspaceFieldErrors,
  isTerminalSessionError,
  readAuthenticationVersion,
  loadSession,
  logout,
  renderLogin,
  renderLoadFailure,
  renderShell,
  resolveCurrentWorkspace,
  selectCurrentWorkspace,
  restoreUncertainWorkspaceCreation,
  createWorkspace,
  reloadWorkspaces,
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
    broadcastMessages,
    lockCalls,
    storage,
    sessionStorageValues,
    sessionStorage: context.sessionStorage,
    emitBroadcast(data) {
      return broadcastChannelInstance?.listeners.get("message")?.({ data });
    }
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function waitForCondition(predicate, message) {
  for (let turn = 0; turn < 100; turn += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail(message);
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

test("同時2要求はFIFO Web Lockでrefreshを1回だけ実行する", async () => {
  const initialRequestsReady = deferred();
  const calls = [];
  let initialRequestCount = 0;
  let refreshed = false;
  const { api, lockCalls } = createHarness({
    fetch: async (path, options = {}, meta) => {
      calls.push({ path, insideLock: meta.insideLock });
      if (path === "/api/auth/refresh") {
        refreshed = true;
        return Response.json({ status: "ok" });
      }
      if (!meta.insideLock) {
        initialRequestCount += 1;
        if (initialRequestCount === 2) initialRequestsReady.resolve();
        await initialRequestsReady.promise;
        return Response.json({
          code: "SESSION_REFRESH_REQUIRED",
          message: "ログイン状態を更新してください。"
        }, { status: 401 });
      }
      if (!refreshed) {
        return Response.json({
          code: "SESSION_REFRESH_REQUIRED",
          message: "ログイン状態を更新してください。"
        }, { status: 401 });
      }
      return Response.json({ user: { id: "user-1" }, workspaces: [] });
    }
  });

  const [first, second] = await Promise.all([
    api.requestJson("/api/session"),
    api.requestJson("/api/session")
  ]);

  assert.equal(first.user.id, "user-1");
  assert.equal(second.user.id, "user-1");
  assert.equal(calls.filter(({ path }) => path === "/api/auth/refresh").length, 1);
  assert.equal(lockCalls.length, 2);
  assert.equal(calls.filter(({ insideLock }) => insideLock).length, 4);
});

test("refreshが終端的に失敗したら認証世代を更新して他タブへ通知する", async () => {
  for (const terminalCode of ["SESSION_EXPIRED", "SESSION_REFRESH_INVALID"]) {
    const { api, broadcastMessages, storage } = createHarness({
      enableBroadcast: true,
      fetch: async (path) => {
        if (path === "/api/auth/refresh") {
          return Response.json({
            code: terminalCode,
            message: "セッションの有効期限が切れました。"
          }, { status: 401 });
        }
        return Response.json({
          code: "SESSION_REFRESH_REQUIRED",
          message: "ログイン状態を更新してください。"
        }, { status: 401 });
      }
    });
    const versionKey = "meccha-manual-authentication-version";
    storage.set(versionKey, `before-${terminalCode}`);

    await assert.rejects(
      api.requestJson("/api/session"),
      (error) => error.code === terminalCode && error.status === 401
    );

    assert.notEqual(storage.get(versionKey), `before-${terminalCode}`, terminalCode);
    assert.equal(broadcastMessages.length, 1, terminalCode);
    assert.equal(broadcastMessages[0].channel, "meccha-manual-authentication", terminalCode);
    assert.equal(broadcastMessages[0].message.type, "authentication-changed", terminalCode);
  }
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

test("失敗logout後の待機GETは新しい認証世代で1回だけrefreshを再調整する", async () => {
  const firstSessionResponse = deferred();
  const firstSessionStarted = deferred();
  const logoutRelease = deferred();
  const logoutStarted = deferred();
  const calls = [];
  let sessionCalls = 0;
  let refreshCalls = 0;
  const { api, lockCalls, storage } = createHarness({
    fetch: async (path, options = {}, meta) => {
      calls.push({ path, insideLock: meta.insideLock });
      if (path === "/api/auth/logout") {
        logoutStarted.resolve();
        await logoutRelease.promise;
        throw new Error("logout network failure");
      }
      if (path === "/api/auth/refresh") {
        refreshCalls += 1;
        return Response.json({ status: "ok" });
      }
      sessionCalls += 1;
      if (sessionCalls === 1) {
        firstSessionStarted.resolve();
        await firstSessionResponse.promise;
      }
      if (sessionCalls <= 2) {
        return Response.json({
          code: "SESSION_REFRESH_REQUIRED",
          message: "ログイン状態を更新してください。"
        }, { status: 401 });
      }
      return Response.json({ user: { id: "user-1" }, workspaces: [] });
    }
  });
  const versionKey = "meccha-manual-authentication-version";
  storage.set(versionKey, "before-failed-logout");
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);

  const readRequest = api.requestJson("/api/session");
  await firstSessionStarted.promise;
  const logoutRequest = api.logout();
  await logoutStarted.promise;
  firstSessionResponse.resolve();
  await waitForCondition(
    () => lockCalls.length === 2,
    "GETがlogoutの後ろでWeb Lockを待機する"
  );
  logoutRelease.resolve();

  await logoutRequest;
  const payload = await readRequest;

  assert.equal(payload.user.id, "user-1");
  assert.equal(refreshCalls, 1);
  assert.deepEqual(calls.map(({ path }) => path), [
    "/api/session",
    "/api/auth/logout",
    "/api/session",
    "/api/auth/refresh",
    "/api/session"
  ]);
  assert.notEqual(storage.get(versionKey), "before-failed-logout");
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

test("JSON以外のContent-Typeは本文がJSON形式でも拒否する", async () => {
  const { api } = createHarness({
    fetch: async () => new Response('{"user":{"id":"user-1"}}', {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" }
    })
  });

  await assert.rejects(
    api.requestJson("/api/session", {}, false),
    (error) => error.code === "INVALID_RESPONSE" && error.status === 200
  );
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

test("ログイン入力エラーを該当欄へ関連付けて再送時に解除する", async () => {
  const { api, element } = createHarness();
  api.renderLogin();
  const form = element("login-form");
  const email = element("email");
  const password = element("password");
  email.value = "";
  email.validity = { typeMismatch: false };
  password.value = "";
  password.validity = {};
  form.elements.email = email;
  form.elements.password = password;

  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  assert.equal(email["aria-invalid"], "true");
  assert.equal(email["aria-describedby"], "login-message");
  assert.equal(password["aria-invalid"], undefined);

  email.listeners.get("input")();
  assert.equal(email["aria-invalid"], undefined);
  assert.equal(email["aria-describedby"], undefined);

  email.value = "user@example.invalid";
  password.value = "password";
  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  assert.equal(email["aria-invalid"], undefined);
  assert.equal(email["aria-describedby"], undefined);
});

test("ログイン処理中状態を表示し完了後に解除する", async () => {
  const loginPending = deferred();
  const { api, element } = createHarness({
    fetch: async (path) => {
      if (path === "/api/auth/login") {
        await loginPending.promise;
        return Response.json({ user: { id: "user-1" } });
      }
      return Response.json({ user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] });
    }
  });
  api.renderLogin();
  const form = element("login-form");
  const button = element("login-form-button");
  form.elements.email.value = "user@example.invalid";
  form.elements.password.value = "password";

  const submit = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "ログイン中");
  assert.equal(form["aria-busy"], "true");
  loginPending.resolve();
  await submit;
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "ログイン");
  assert.equal(form["aria-busy"], undefined);
});

test("障害画面の再読込は処理中表示にして多重操作を防ぐ", async () => {
  let releaseRequest;
  const requestPending = new Promise((resolve) => {
    releaseRequest = resolve;
  });
  const { api, element } = createHarness({
    fetch: async () => {
      await requestPending;
      return Response.json({ code: "UPSTREAM_UNAVAILABLE", message: "一時的な障害です。" }, { status: 503 });
    }
  });
  api.renderLoadFailure("読み込めませんでした", "時間をおいて再試行してください。");
  const retryButton = element("retry-button");

  const retry = retryButton.listeners.get("click")();
  assert.equal(retryButton.disabled, true);
  assert.equal(retryButton.textContent, "読み込み中");
  assert.equal(retryButton["aria-busy"], "true");
  releaseRequest();
  await retry;
});

test("ログインsubmit成功後にsessionを取得して所属workspaceを表示する", async () => {
  const calls = [];
  const { api, app, element } = createHarness({
    fetch: async (path) => {
      calls.push(path);
      if (path === "/api/auth/login") {
        return Response.json({ user: { id: "user-1", email: "user@example.invalid" } });
      }
      return Response.json({
        user: { id: "user-1", email: "user@example.invalid" },
        profile: null,
        workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales", status: "active" }]
      });
    }
  });
  api.renderLogin();
  const form = element("login-form");
  form.elements.email.value = "user@example.invalid";
  form.elements.password.value = "password";

  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

  assert.deepEqual(calls, ["/api/auth/login", "/api/session"]);
  assert.match(app.innerHTML, /class="shell"/);
  assert.match(app.innerHTML, /営業部/);
});

test("ログインsubmitの認証失敗は日本語エラーを表示してfocusする", async () => {
  const { api, element, focusedId } = createHarness({
    fetch: async () => Response.json({
      code: "LOGIN_FAILED",
      message: "メールアドレスまたはパスワードを確認して、もう一度ログインしてください。"
    }, { status: 400 })
  });
  api.renderLogin();
  const form = element("login-form");
  form.elements.email.value = "user@example.invalid";
  form.elements.password.value = "wrong-password";

  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

  assert.match(element("login-message").textContent, /メールアドレスまたはパスワード/);
  assert.equal(focusedId(), "login-message");
});

test("期限切れ表示から再ログインして利用を再開できる", async () => {
  let sessionRequests = 0;
  const { api, app, element } = createHarness({
    fetch: async (path) => {
      if (path === "/api/auth/login") return Response.json({ user: { id: "user-1" } });
      sessionRequests += 1;
      if (sessionRequests === 1) {
        return Response.json({ code: "SESSION_EXPIRED", message: "セッションの有効期限が切れました。" }, { status: 401 });
      }
      return Response.json({
        user: { id: "user-1", email: "user@example.invalid" },
        workspaces: [{ name: "再開後ワークスペース", slug: "restored", status: "active" }]
      });
    }
  });

  await api.loadSession();
  const form = element("login-form");
  form.elements.email.value = "user@example.invalid";
  form.elements.password.value = "password";
  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

  assert.match(app.innerHTML, /class="shell"/);
  assert.match(app.innerHTML, /再開後ワークスペース/);
  assert.equal(api.getCurrentSession().user.id, "user-1");
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

test("ログアウト成功で保護sessionを消去してログイン表示へ戻る", async () => {
  const { api, app, element } = createHarness({
    fetch: async () => Response.json({ status: "ok" })
  });
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);

  await element("logout-button").listeners.get("click")();

  assert.equal(api.getCurrentSession(), null);
  assert.match(app.innerHTML, /class="login-screen"/);
});

test("ログアウト処理中状態を表示し完了後に解除する", async () => {
  const logoutPending = deferred();
  const { api, element } = createHarness({
    fetch: async () => {
      await logoutPending.promise;
      return Response.json({ status: "ok" });
    }
  });
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const button = element("logout-button");

  const logoutRequest = button.listeners.get("click")();
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "ログアウト中");
  assert.equal(button["aria-busy"], "true");
  logoutPending.resolve();
  await logoutRequest;
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "ログアウト");
  assert.equal(button["aria-busy"], undefined);
});

test("LOGOUT_REVOKE_FAILEDでも保護sessionを消去して警告付きログインを表示する", async () => {
  const { api, app, element, focusedId } = createHarness({
    fetch: async () => Response.json({
      code: "LOGOUT_REVOKE_FAILED",
      message: "この端末のログイン情報は削除しましたが、認証サーバー側のログアウトを確認できませんでした。"
    }, { status: 502 })
  });
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);

  await element("logout-button").listeners.get("click")();

  assert.equal(api.getCurrentSession(), null);
  assert.match(app.innerHTML, /認証サーバー側のログアウトを確認できません/);
  assert.equal(focusedId(), "login-message");
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

test("現在workspaceは最新のactive所属一覧にあるIDだけを復元する", () => {
  const { api, sessionStorageValues } = createHarness();
  const session = {
    user: { id: "user-1", email: "user@example.invalid" },
    workspaces: [
      { id: "workspace-1", name: "営業部", status: "active" },
      { id: "workspace-2", name: "停止中", status: "suspended" }
    ]
  };

  sessionStorageValues.set("meccha-manual-current-workspace", JSON.stringify({
    userId: "user-1",
    workspaceId: "other-tenant-workspace"
  }));
  const selected = api.resolveCurrentWorkspace(session);

  assert.equal(selected.id, "workspace-1");
  assert.deepEqual(JSON.parse(sessionStorageValues.get("meccha-manual-current-workspace")), {
    userId: "user-1",
    workspaceId: "workspace-1"
  });
});

test("別ユーザーのworkspace選択は復元せず最新所属の先頭へ置き換える", () => {
  const { api, sessionStorageValues } = createHarness();
  sessionStorageValues.set("meccha-manual-current-workspace", JSON.stringify({
    userId: "old-user",
    workspaceId: "old-workspace"
  }));
  const selected = api.resolveCurrentWorkspace({
    user: { id: "new-user" },
    workspaces: [{ id: "new-workspace", name: "新しい所属", status: "active" }]
  });

  assert.equal(selected.id, "new-workspace");
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-current-workspace")).userId, "new-user");
});

test("workspace選択操作はactive所属だけをタブ内へ保存する", () => {
  const { api, sessionStorageValues } = createHarness();
  const session = {
    user: { id: "user-1", email: "user@example.invalid" },
    workspaces: [
      { id: "workspace-1", name: "営業部", status: "active" },
      { id: "workspace-2", name: "開発部", status: "active" }
    ]
  };
  api.replaceCurrentSession(session);
  api.selectCurrentWorkspace({ currentTarget: { value: "workspace-2" } });

  assert.deepEqual(JSON.parse(sessionStorageValues.get("meccha-manual-current-workspace")), {
    userId: "user-1",
    workspaceId: "workspace-2"
  });
});

test("workspace作成中は多重送信を防ぎ成功後に現在sessionだけを再取得する", async () => {
  const createResponse = deferred();
  const calls = [];
  const { api, element, app } = createHarness({
    fetch: async (path, options = {}) => {
      calls.push({ path, method: options.method ?? "GET" });
      if (path === "/api/workspaces") return createResponse.promise;
      if (path === "/api/session") {
        return Response.json({
          user: { id: "user-1", email: "user@example.invalid" },
          workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales-team", status: "active", created_at: "2026-08-10" }]
        });
      }
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };
  const button = form.querySelector("button");

  const pending = api.createWorkspace({ preventDefault() {}, currentTarget: form });
  assert.equal(button.disabled, true);
  assert.equal(button.textContent, "作成中");
  assert.equal(form["aria-busy"], "true");
  createResponse.resolve(Response.json({ workspaceId: "11111111-1111-4111-8111-111111111111" }, { status: 201 }));
  await pending;

  assert.deepEqual(calls, [
    { path: "/api/workspaces", method: "POST" },
    { path: "/api/session", method: "GET" }
  ]);
  assert.match(app.innerHTML, /ワークスペースを作成しました/);
  assert.match(app.innerHTML, /営業部/);
});

test("workspace作成確定後の一覧再取得失敗は作成失敗と表示しない", async () => {
  const { api, element, app } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") return Response.json({ workspaceId: "11111111-1111-4111-8111-111111111111" }, { status: 201 });
      if (path === "/api/session") throw new Error("offline");
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };

  await api.createWorkspace({ preventDefault() {}, currentTarget: form });

  assert.match(app.innerHTML, /ワークスペースは作成されました/);
  assert.match(app.innerHTML, /一覧を更新/);
  assert.doesNotMatch(app.innerHTML, /ワークスペースを作成できませんでした/);
});

test("workspace作成入力を日本語で検証し該当欄へ関連付ける", () => {
  const { api, element } = createHarness();
  const form = element("workspace-form");
  form.elements.name = element("workspace-name");
  form.elements.slug = element("workspace-slug");
  form.elements.name.value = "";
  form.elements.slug.value = "Invalid Slug";

  let error = api.validateWorkspaceForm(form);
  api.updateWorkspaceFieldErrors(form, error);
  assert.match(error.message, /ワークスペース名/);
  assert.equal(form.elements.name["aria-invalid"], "true");
  assert.match(form.elements.name["aria-describedby"], /workspace-message/);

  form.elements.name.value = "営業部";
  error = api.validateWorkspaceForm(form);
  api.updateWorkspaceFieldErrors(form, error);
  assert.match(error.message, /URL用ID/);
  assert.equal(form.elements.name["aria-invalid"], undefined);
  assert.equal(form.elements.slug["aria-invalid"], "true");
});

test("workspace名の64文字上限はUnicode code pointで検証する", () => {
  const { api } = createHarness();
  const form = {
    elements: {
      name: { value: "😀".repeat(64) },
      slug: { value: "emoji-team" }
    }
  };
  assert.equal(api.validateWorkspaceForm(form), null);
  form.elements.name.value = "😀".repeat(65);
  assert.match(api.validateWorkspaceForm(form).message, /1〜64文字/);
});

test("sessionStorageが使えなくても選択したworkspaceを現在タブで維持する", () => {
  const { api, sessionStorage } = createHarness();
  const session = {
    user: { id: "user-1", email: "user@example.invalid" },
    workspaces: [
      { id: "workspace-1", name: "営業部", status: "active" },
      { id: "workspace-2", name: "開発部", status: "active" }
    ]
  };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  sessionStorage.getItem = () => { throw new Error("blocked"); };
  sessionStorage.setItem = () => { throw new Error("blocked"); };

  api.selectCurrentWorkspace({ currentTarget: { value: "workspace-2" } });

  assert.equal(api.resolveCurrentWorkspace(session).id, "workspace-2");
});

test("active所属がなくなったら保存済みworkspace選択を削除する", () => {
  const { api, sessionStorageValues } = createHarness();
  sessionStorageValues.set("meccha-manual-current-workspace", JSON.stringify({ userId: "user-1", workspaceId: "workspace-1" }));
  const selected = api.resolveCurrentWorkspace({
    user: { id: "user-1" },
    workspaces: [{ id: "workspace-1", name: "停止中", status: "suspended" }]
  });
  assert.equal(selected, null);
  assert.equal(sessionStorageValues.has("meccha-manual-current-workspace"), false);
});

test("一覧更新失敗では表示済み一覧・選択・入力内容を保持する", async () => {
  const { api, element, app } = createHarness({
    fetch: async () => { throw new Error("offline"); }
  });
  const session = {
    user: { id: "user-1", email: "user@example.invalid" },
    workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales", status: "active", created_at: "2026-08-10" }]
  };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "入力途中の名前" };
  form.elements.slug = { value: "draft-slug" };

  await api.reloadWorkspaces({ currentTarget: element("reload-button") });

  assert.match(app.innerHTML, /営業部/);
  assert.match(app.innerHTML, /表示中の一覧は更新前/);
  assert.equal(form.elements.name.value, "入力途中の名前");
  assert.equal(form.elements.slug.value, "draft-slug");
});

test("workspace作成結果不明は再作成させず一覧確認を案内する", async () => {
  let postCalls = 0;
  const { api, element, app } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return Response.json({
          code: "WORKSPACE_CREATE_RESULT_UNKNOWN",
          message: "作成処理の結果を確認できませんでした。重ねて作成せず、一覧を更新して確認してください。"
        }, { status: 502 });
      }
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1", email: "user@example.invalid" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };

  await api.createWorkspace({ preventDefault() {}, currentTarget: form });

  assert.match(app.innerHTML, /重ねて作成せず/);
  assert.match(app.innerHTML, /一覧を更新/);
  assert.match(app.innerHTML, /一覧で結果を確認してください/);
  await api.createWorkspace({ preventDefault() {}, currentTarget: form });
  assert.equal(postCalls, 1);
});

test("workspace作成中の再submitはRPCを重複送信しない", async () => {
  const response = deferred();
  let postCalls = 0;
  const { api, element } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return response.promise;
      }
      if (path === "/api/session") return Response.json({ user: { id: "user-1" }, workspaces: [] });
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };

  const first = api.createWorkspace({ preventDefault() {}, currentTarget: form });
  await api.createWorkspace({ preventDefault() {}, currentTarget: form });
  assert.equal(postCalls, 1);
  response.resolve(Response.json({ workspaceId: "11111111-1111-4111-8111-111111111111" }, { status: 201 }));
  await first;
});

test("一覧の権限不足は接続失敗と区別して案内する", async () => {
  const { api, app } = createHarness({
    fetch: async () => Response.json({
      code: "WORKSPACES_ACCESS_DENIED",
      message: "権限を確認できませんでした。"
    }, { status: 403 })
  });

  await api.loadSession();

  assert.match(app.innerHTML, /ワークスペースを表示できません/);
  assert.match(app.innerHTML, /管理者に確認/);
  assert.doesNotMatch(app.innerHTML, /サーバーに接続できません/);
});

test("結果不明ロックはページ再読込相当でもslugだけを復元する", () => {
  const { api, app, sessionStorageValues } = createHarness();
  sessionStorageValues.set("meccha-manual-uncertain-workspace", JSON.stringify({
    userId: "user-1",
    slug: "sales-team"
  }));
  const session = { user: { id: "user-1" }, workspaces: [] };

  api.restoreUncertainWorkspaceCreation("user-1");
  api.renderShell(session);

  assert.match(app.innerHTML, /sales-team/);
  assert.match(app.innerHTML, /一覧で結果を確認してください/);
  assert.equal(sessionStorageValues.get("meccha-manual-uncertain-workspace").includes("営業部"), false);
});

test("認証変更通知で旧workspace選択と結果不明ロックを即時破棄する", async () => {
  const { api, element, app, sessionStorageValues, emitBroadcast } = createHarness({
    enableBroadcast: true,
    fetch: async () => Response.json({ user: { id: "new-user" }, workspaces: [] })
  });
  const oldSession = { user: { id: "old-user" }, workspaces: [] };
  api.replaceCurrentSession(oldSession);
  api.renderShell(oldSession);
  const form = element("workspace-form");
  form.elements.name = { value: "旧ワークスペース" };
  form.elements.slug = { value: "old-workspace" };
  sessionStorageValues.set("meccha-manual-uncertain-workspace", JSON.stringify({ userId: "old-user", slug: "old-workspace" }));

  emitBroadcast({ type: "authentication-changed" });
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(sessionStorageValues.has("meccha-manual-uncertain-workspace"), false);
  assert.doesNotMatch(app.innerHTML, /旧ワークスペース|old-workspace/);
});

test("非所属または停止中workspaceの選択操作は保存値を変更しない", () => {
  const { api, sessionStorageValues } = createHarness();
  const session = {
    user: { id: "user-1" },
    workspaces: [
      { id: "workspace-1", name: "営業部", status: "active" },
      { id: "workspace-2", name: "停止中", status: "suspended" }
    ]
  };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const before = sessionStorageValues.get("meccha-manual-current-workspace");

  api.selectCurrentWorkspace({ currentTarget: { value: "workspace-2" } });
  api.selectCurrentWorkspace({ currentTarget: { value: "other-tenant" } });

  assert.equal(sessionStorageValues.get("meccha-manual-current-workspace"), before);
});

test("同一ユーザーの認証変更通知では結果不明ロックと現在workspaceを維持する", async () => {
  const session = {
    user: { id: "user-1" },
    workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales-team", status: "active", created_at: "2026-08-10" }]
  };
  const { api, sessionStorageValues, emitBroadcast } = createHarness({
    enableBroadcast: true,
    fetch: async () => Response.json(session)
  });
  sessionStorageValues.set("meccha-manual-uncertain-workspace", JSON.stringify({ userId: "user-1", slug: "pending-team" }));
  sessionStorageValues.set("meccha-manual-current-workspace", JSON.stringify({ userId: "user-1", workspaceId: "workspace-1" }));
  api.replaceCurrentSession(session);
  api.renderShell(session);

  emitBroadcast({ type: "authentication-changed" });
  await waitForCondition(() => api.getCurrentSession()?.user?.id === "user-1", "同じユーザーのsessionを再取得する");

  assert.deepEqual(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")), {
    userId: "user-1",
    slug: "pending-team"
  });
  assert.deepEqual(JSON.parse(sessionStorageValues.get("meccha-manual-current-workspace")), {
    userId: "user-1",
    workspaceId: "workspace-1"
  });
});

test("同一ユーザーの認証変更後にsession再取得が一時失敗しても固有状態を維持する", async () => {
  let sessionCalls = 0;
  const session = {
    user: { id: "user-1" },
    workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales-team", status: "active", created_at: "2026-08-10" }]
  };
  const { api, app, sessionStorageValues, emitBroadcast } = createHarness({
    enableBroadcast: true,
    fetch: async () => {
      sessionCalls += 1;
      if (sessionCalls === 1) {
        return Response.json({ code: "WORKSPACES_FETCH_FAILED", message: "一時障害" }, { status: 502 });
      }
      return Response.json(session);
    }
  });
  sessionStorageValues.set("meccha-manual-uncertain-workspace", JSON.stringify({ userId: "user-1", slug: "pending-team" }));
  sessionStorageValues.set("meccha-manual-current-workspace", JSON.stringify({ userId: "user-1", workspaceId: "workspace-1" }));
  api.replaceCurrentSession(session);
  api.renderShell(session);

  emitBroadcast({ type: "authentication-changed" });
  await waitForCondition(() => /サービスを読み込めません/.test(app.innerHTML), "一時障害を表示する");
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "pending-team");
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-current-workspace")).workspaceId, "workspace-1");

  await api.loadSession();
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "pending-team");
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-current-workspace")).workspaceId, "workspace-1");
});

test("保留中workspace POSTと同一ユーザー認証通知が競合しても結果不明を保存する", async () => {
  const createResponse = deferred();
  let sessionCalls = 0;
  let postCalls = 0;
  const session = { user: { id: "user-1" }, workspaces: [] };
  const { api, element, sessionStorageValues, emitBroadcast } = createHarness({
    enableBroadcast: true,
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return createResponse.promise;
      }
      if (path === "/api/session") {
        sessionCalls += 1;
        return Response.json(session);
      }
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };
  const pending = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

  emitBroadcast({ type: "authentication-changed" });
  await waitForCondition(() => sessionCalls >= 1, "認証通知後のsessionを取得する");
  createResponse.resolve(Response.json({ code: "WORKSPACE_CREATE_RESULT_UNKNOWN", message: "結果不明" }, { status: 502 }));
  await pending;
  await waitForCondition(() => sessionCalls >= 2, "結果不明保存後に現在sessionで再描画する");

  assert.equal(postCalls, 1);
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "sales-team");
});

test("workspace作成成功と同一ユーザー認証通知が競合しても最新一覧を再取得する", async () => {
  const createResponse = deferred();
  let sessionCalls = 0;
  let postCalls = 0;
  const initialSession = { user: { id: "user-1" }, workspaces: [] };
  const createdSession = {
    user: { id: "user-1" },
    workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales-team", status: "active", created_at: "2026-08-10" }]
  };
  const { api, app, element, emitBroadcast } = createHarness({
    enableBroadcast: true,
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return createResponse.promise;
      }
      if (path === "/api/session") {
        sessionCalls += 1;
        return Response.json(sessionCalls === 1 ? initialSession : createdSession);
      }
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  api.replaceCurrentSession(initialSession);
  api.renderShell(initialSession);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };
  const pending = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

  emitBroadcast({ type: "authentication-changed" });
  await waitForCondition(() => sessionCalls === 1, "認証通知後の旧一覧を取得する");
  await waitForCondition(() => /ワークスペースを作成中/.test(app.innerHTML), "再描画後も作成中を表示する");
  await api.createWorkspace({ preventDefault() {}, currentTarget: {} });
  assert.equal(postCalls, 1);
  createResponse.resolve(Response.json({ workspaceId: "11111111-1111-4111-8111-111111111111" }, { status: 201 }));
  await pending;
  await waitForCondition(() => sessionCalls === 2, "作成成功後に最新一覧を再取得する");
  await waitForCondition(() => /sales-team/.test(app.innerHTML), "作成済みworkspaceを表示する");
});

test("workspace作成POST直後に再読込しても永続ロックで再送を防ぐ", async () => {
  const createResponse = deferred();
  let postCalls = 0;
  const session = { user: { id: "user-1" }, workspaces: [] };
  const first = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return createResponse.promise;
      }
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  first.api.replaceCurrentSession(session);
  first.api.renderShell(session);
  const form = first.element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };
  const pending = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  const storedLock = first.sessionStorageValues.get("meccha-manual-uncertain-workspace");
  assert.equal(JSON.parse(storedLock).slug, "sales-team");

  const reloaded = createHarness({
    fetch: async () => {
      postCalls += 1;
      return Response.json({ workspaceId: "22222222-2222-4222-8222-222222222222" }, { status: 201 });
    }
  });
  reloaded.sessionStorageValues.set("meccha-manual-uncertain-workspace", storedLock);
  reloaded.api.replaceCurrentSession(session);
  reloaded.api.renderShell(session);
  assert.match(reloaded.app.innerHTML, /作成結果を確認中/);
  await reloaded.api.createWorkspace({ preventDefault() {}, currentTarget: {} });
  assert.equal(postCalls, 1);

  createResponse.resolve(Response.json({ code: "WORKSPACE_CREATE_RESULT_UNKNOWN", message: "結果不明" }, { status: 502 }));
  await pending;
});

test("workspace作成POSTの曖昧な応答失敗は実listener経路で結果不明ロックにする", async () => {
  const cases = [
    ["fetch reject", async () => { throw new Error("connection reset after commit"); }],
    ["body abort", async () => new Response(new ReadableStream({
      start(controller) { controller.error(new Error("body lost")); }
    }), { status: 201, headers: { "content-type": "application/json" } })],
    ["non-json 502", async () => new Response("bad gateway", {
      status: 502,
      headers: { "content-type": "text/html" }
    })],
    ["generic json 502", async () => Response.json({ message: "proxy failed" }, { status: 502 })],
    ["empty json 201", async () => Response.json({}, { status: 201 })],
    ["nested workspace 201", async () => Response.json({ workspace: { id: "11111111-1111-4111-8111-111111111111" } }, { status: 201 })],
    ["non-UUID workspaceId 201", async () => Response.json({ workspaceId: "workspace-1" }, { status: 201 })]
  ];

  for (const [label, workspaceResponse] of cases) {
    let postCalls = 0;
    const { api, element, app, sessionStorageValues } = createHarness({
      fetch: async (path) => {
        if (path === "/api/workspaces") {
          postCalls += 1;
          return workspaceResponse();
        }
        throw new Error(`unexpected fetch: ${path}`);
      }
    });
    const session = { user: { id: "user-1" }, workspaces: [] };
    api.replaceCurrentSession(session);
    api.renderShell(session);
    const form = element("workspace-form");
    form.elements.name = { value: "営業部" };
    form.elements.slug = { value: "sales-team" };

    await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
    await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

    assert.equal(postCalls, 1, label);
    assert.deepEqual(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")), {
      userId: "user-1",
      slug: "sales-team"
    }, label);
    assert.match(app.innerHTML, /重ねて作成せず/, label);
    assert.match(app.innerHTML, /一覧で結果を確認してください/, label);
  }
});

test("作成中の一覧更新と結果不明応答が競合してもロックを保存する", async () => {
  const createResponse = deferred();
  let postCalls = 0;
  const { api, element, app, sessionStorageValues } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return createResponse.promise;
      }
      if (path === "/api/session") return Response.json({ user: { id: "user-1" }, workspaces: [] });
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };

  const createPending = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  await element("reload-button").listeners.get("click")({ currentTarget: element("reload-button") });
  createResponse.resolve(Response.json({
    code: "WORKSPACE_CREATE_RESULT_UNKNOWN",
    message: "結果不明"
  }, { status: 502 }));
  await createPending;
  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

  assert.equal(postCalls, 1);
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "sales-team");
  assert.match(app.innerHTML, /一覧で結果を確認してください/);
});

test("保留中POSTを一覧で確認できたら遅延した結果不明応答で再ロックしない", async () => {
  const createResponse = deferred();
  const createdSession = {
    user: { id: "user-1" },
    workspaces: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "営業部",
      slug: "sales-team",
      status: "active",
      created_at: "2026-08-10T00:00:00Z"
    }]
  };
  const { api, element, app, sessionStorageValues } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") return createResponse.promise;
      if (path === "/api/session") return Response.json(createdSession);
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };

  const createPending = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  await element("reload-button").listeners.get("click")({ currentTarget: element("reload-button") });

  assert.match(app.innerHTML, /作成済みのワークスペースを一覧で確認できました/);
  assert.doesNotMatch(app.innerHTML, /ワークスペースを作成中|作成結果を確認中/);
  assert.equal(sessionStorageValues.has("meccha-manual-uncertain-workspace"), false);

  createResponse.resolve(Response.json({
    code: "WORKSPACE_CREATE_RESULT_UNKNOWN",
    message: "遅延した結果不明"
  }, { status: 502 }));
  await createPending;

  assert.equal(sessionStorageValues.has("meccha-manual-uncertain-workspace"), false);
  assert.doesNotMatch(app.innerHTML, /重ねて作成せず|作成結果を確認中/);
  assert.match(app.innerHTML, /sales-team/);
});

test("確認済みPOST Aの遅延失敗は後続POST Bの結果確認ロックを消さない", async () => {
  const responseA = deferred();
  const responseB = deferred();
  let postCalls = 0;
  const createdSession = {
    user: { id: "user-1" },
    workspaces: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "営業部",
      slug: "sales-team",
      status: "active",
      created_at: "2026-08-10T00:00:00Z"
    }]
  };
  const { api, element, sessionStorageValues } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return postCalls === 1 ? responseA.promise : responseB.promise;
      }
      if (path === "/api/session") return Response.json(createdSession);
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const formA = element("workspace-form");
  formA.elements.name = { value: "営業部" };
  formA.elements.slug = { value: "sales-team" };

  const pendingA = formA.listeners.get("submit")({ preventDefault() {}, currentTarget: formA });
  await element("reload-button").listeners.get("click")({ currentTarget: element("reload-button") });

  const formB = element("workspace-form");
  formB.removeAttribute("aria-busy");
  formB.elements.name = { value: "サポート部" };
  formB.elements.slug = { value: "support-team" };
  const pendingB = formB.listeners.get("submit")({ preventDefault() {}, currentTarget: formB });
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "support-team");

  responseA.resolve(Response.json({ code: "WORKSPACE_CREATE_RESULT_UNKNOWN", message: "Aの遅延失敗" }, { status: 502 }));
  await pendingA;

  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "support-team");

  responseB.resolve(Response.json({ code: "WORKSPACE_CREATE_RESULT_UNKNOWN", message: "Bは結果不明" }, { status: 502 }));
  await pendingB;
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "support-team");
});

test("確認済みPOST Aの遅延成功と一覧再取得は後続POST Bのロックを消さない", async () => {
  const responseA = deferred();
  const responseB = deferred();
  let postCalls = 0;
  const createdSession = {
    user: { id: "user-1" },
    workspaces: [{
      id: "11111111-1111-4111-8111-111111111111",
      name: "営業部",
      slug: "sales-team",
      status: "active",
      created_at: "2026-08-10T00:00:00Z"
    }]
  };
  const { api, element, sessionStorageValues } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return postCalls === 1 ? responseA.promise : responseB.promise;
      }
      if (path === "/api/session") return Response.json(createdSession);
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const formA = element("workspace-form");
  formA.elements.name = { value: "営業部" };
  formA.elements.slug = { value: "sales-team" };

  const pendingA = formA.listeners.get("submit")({ preventDefault() {}, currentTarget: formA });
  await element("reload-button").listeners.get("click")({ currentTarget: element("reload-button") });

  const formB = element("workspace-form");
  formB.removeAttribute("aria-busy");
  formB.elements.name = { value: "サポート部" };
  formB.elements.slug = { value: "support-team" };
  const pendingB = formB.listeners.get("submit")({ preventDefault() {}, currentTarget: formB });

  responseA.resolve(Response.json({
    workspaceId: "11111111-1111-4111-8111-111111111111"
  }, { status: 201 }));
  await pendingA;

  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "support-team");

  responseB.resolve(Response.json({ code: "WORKSPACE_CREATE_RESULT_UNKNOWN", message: "Bは結果不明" }, { status: 502 }));
  await pendingB;
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-uncertain-workspace")).slug, "support-team");
});

test("結果不明ロックはsessionStorageへ保存できなくてもページ内で再送を防ぐ", async () => {
  let postCalls = 0;
  const { api, element, app } = createHarness({
    sessionStorageSetThrows: true,
    fetch: async (path) => {
      if (path === "/api/workspaces") {
        postCalls += 1;
        return Response.json({ code: "WORKSPACE_CREATE_RESULT_UNKNOWN", message: "結果不明" }, { status: 502 });
      }
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };

  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

  assert.equal(postCalls, 1);
  assert.match(app.innerHTML, /一覧で結果を確認してください/);
});

test("一覧更新と確定作成失敗が競合しても同じreloadボタンを再有効化する", async () => {
  const createResponse = deferred();
  const { api, app, element } = createHarness({
    fetch: async (path) => {
      if (path === "/api/session") return Response.json(session);
      if (path === "/api/workspaces") return createResponse.promise;
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  const session = { user: { id: "user-1" }, workspaces: [] };
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };

  const createPending = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  const reloadButton = element("reload-button");
  await reloadButton.listeners.get("click")({ currentTarget: reloadButton });
  assert.match(app.innerHTML, /ワークスペースを作成中/);
  createResponse.resolve(Response.json({ code: "WORKSPACE_CREATE_FORBIDDEN", message: "作成権限がありません。" }, { status: 403 }));
  await createPending;

  assert.equal(reloadButton.disabled, false);
  assert.equal(reloadButton.textContent, "一覧を更新");
  assert.equal(reloadButton["aria-busy"], undefined);
  assert.doesNotMatch(app.innerHTML, /ワークスペースを作成中/);
  assert.match(app.innerHTML, /作成権限がありません/);
  assert.equal(typeof element("workspace-form").listeners.get("submit"), "function");
});

test("一覧更新とworkspace作成401が競合しても再ログイン画面へ戻る", async () => {
  const createResponse = deferred();
  let sessionCalls = 0;
  const session = { user: { id: "user-1" }, workspaces: [] };
  const { api, app, element, sessionStorageValues } = createHarness({
    fetch: async (path) => {
      if (path === "/api/workspaces") return createResponse.promise;
      if (path === "/api/session") {
        sessionCalls += 1;
        if (sessionCalls === 1) return Response.json(session);
        return Response.json({ code: "SESSION_EXPIRED", message: "期限切れ" }, { status: 401 });
      }
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  api.replaceCurrentSession(session);
  api.renderShell(session);
  const form = element("workspace-form");
  form.elements.name = { value: "営業部" };
  form.elements.slug = { value: "sales-team" };
  const createPending = form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
  const reloadButton = element("reload-button");
  await reloadButton.listeners.get("click")({ currentTarget: reloadButton });

  createResponse.resolve(Response.json({ code: "SESSION_EXPIRED", message: "期限切れ" }, { status: 401 }));
  await createPending;

  assert.match(app.innerHTML, /ログイン/);
  assert.doesNotMatch(app.innerHTML, /所属ワークスペース/);
  assert.equal(sessionStorageValues.has("meccha-manual-uncertain-workspace"), false);
});

test("workspace主要操作はrenderShellが登録したlistener経路で動作する", async () => {
  const calls = [];
  const session = {
    user: { id: "user-1" },
    workspaces: [
      { id: "workspace-1", name: "営業部", slug: "sales", status: "active", created_at: "2026-08-10" },
      { id: "workspace-2", name: "営業部", slug: "support", status: "active", created_at: "2026-08-10" }
    ]
  };
  const { api, element, app, focusedId, sessionStorageValues } = createHarness({
    fetch: async (path, options = {}) => {
      calls.push([path, options.method ?? "GET"]);
      if (path === "/api/workspaces") return Response.json({ workspaceId: "22222222-2222-4222-8222-222222222222" }, { status: 201 });
      if (path === "/api/session") return Response.json(session);
      throw new Error(`unexpected fetch: ${path}`);
    }
  });
  api.replaceCurrentSession(session);
  api.renderShell(session);

  const selector = element("current-workspace");
  selector.value = "workspace-2";
  selector.listeners.get("change")({ currentTarget: selector });
  assert.equal(JSON.parse(sessionStorageValues.get("meccha-manual-current-workspace")).workspaceId, "workspace-2");
  assert.match(app.innerHTML, /営業部（sales）/);
  assert.match(app.innerHTML, /営業部（support）/);

  const reloadButton = element("reload-button");
  await reloadButton.listeners.get("click")({ currentTarget: reloadButton });
  assert.equal(focusedId(), "reload-button");
  assert.match(app.innerHTML, /一覧を更新しました/);

  assert.equal(typeof element("workspace-form").listeners.get("submit"), "function");
  assert.deepEqual(calls, [["/api/session", "GET"]]);
});

test("workspace作成の権限・実行前拒否・サービス障害は結果不明ロックを解除する", async () => {
  for (const [label, status, code] of [
    ["forbidden", 403, "WORKSPACE_CREATE_FORBIDDEN"],
    ["rate limited", 502, "WORKSPACE_CREATE_FAILED"],
    ["service unavailable", 502, "WORKSPACE_CREATE_SERVICE_UNAVAILABLE"]
  ]) {
    let postCalls = 0;
    const { api, element, sessionStorageValues } = createHarness({
      fetch: async (path) => {
        if (path !== "/api/workspaces") throw new Error(`unexpected fetch: ${path}`);
        postCalls += 1;
        return Response.json({ code, message: `${label} message` }, { status });
      }
    });
    const session = { user: { id: "user-1" }, workspaces: [] };
    api.replaceCurrentSession(session);
    api.renderShell(session);
    const form = element("workspace-form");
    form.elements.name = { value: "営業部" };
    form.elements.slug = { value: "sales-team" };

    await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });
    await form.listeners.get("submit")({ preventDefault() {}, currentTarget: form });

    assert.equal(postCalls, 2, label);
    assert.equal(sessionStorageValues.has("meccha-manual-uncertain-workspace"), false, label);
    assert.equal(element("workspace-message").textContent, `${label} message`, label);
  }
});

test("一覧上限超過の手動更新は既存一覧を保持して管理者整理を案内する", async () => {
  const session = {
    user: { id: "user-1" },
    workspaces: [{ id: "workspace-1", name: "営業部", slug: "sales-team", status: "active", created_at: "2026-08-10" }]
  };
  const { api, app, element } = createHarness({
    fetch: async () => Response.json({
      code: "WORKSPACES_LIMIT_EXCEEDED",
      message: "所属ワークスペースが多いため一覧を表示できません。管理者に整理を依頼してください。"
    }, { status: 409 })
  });
  api.replaceCurrentSession(session);
  api.renderShell(session);

  await element("reload-button").listeners.get("click")({ currentTarget: element("reload-button") });

  assert.match(app.innerHTML, /営業部/);
  assert.match(app.innerHTML, /管理者に整理を依頼/);
  assert.doesNotMatch(app.innerHTML, /通信環境を確認/);
});
