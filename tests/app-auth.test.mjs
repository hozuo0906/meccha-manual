import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";
import vm from "node:vm";

import { APP_JS } from "../apps/worker/src/app-assets.ts";

function createHarness({ fetch, beforeLock, disableLocks = false, enableBroadcast = false } = {}) {
  const storage = new Map();
  const lockCalls = [];
  const broadcastMessages = [];
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
  isTerminalSessionError,
  readAuthenticationVersion,
  loadSession,
  logout,
  renderLogin,
  renderLoadFailure,
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
    broadcastMessages,
    lockCalls,
    storage
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
