import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import worker from "../apps/worker/src/index.ts";

const originalFetch = globalThis.fetch;
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key"
};
const ctx = { waitUntil() {} };

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function appRequest(path, init = {}) {
  return new Request(`https://app.example${path}`, init);
}

function sessionCookie(access = "access-token", refresh = "refresh-token") {
  return `__Host-mm_access=${access}; __Host-mm_refresh=${refresh}`;
}

test("状態変更APIは異なるoriginを拒否する", async () => {
  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://evil.example"
    },
    body: "{}"
  }), env, ctx);

  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, "ORIGIN_MISMATCH");
});

test("壊れたCookieは500にせず再ログインを求める", async () => {
  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: "__Host-mm_access=%E0%A4%A" }
  }), env, ctx);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "SESSION_INVALID");
});

test("壊れたCookieでもログアウト時に端末Cookieを削除する", async () => {
  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": "__Host-mm_access=%E0%A4%A"
    },
    body: "{}"
  }), env, ctx);

  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "ok");
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_access=.*Max-Age=0/);
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_refresh=.*Max-Age=0/);
});

test("refresh Cookieだけ壊れていても正常なaccess tokenでセッションを失効する", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: "00000000-0000-4000-8000-000000000001" });
    }
    if (String(url).endsWith("/auth/v1/logout?scope=local")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": "__Host-mm_access=access-token; __Host-mm_refresh=%E0%A4%A"
    },
    body: "{}"
  }), env, ctx);

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.match(calls[1], /\/auth\/v1\/logout\?scope=local$/);
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});

test("認証サービスの詳細エラーをログイン画面へ露出しない", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    message: "User with supplied email does not exist"
  }), { status: 400, headers: { "content-type": "application/json" } });

  const response = await worker.fetch(appRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example"
    },
    body: JSON.stringify({ email: "nobody@example.invalid", password: "invalid" })
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(payload.code, "LOGIN_FAILED");
  assert.equal(payload.message, "ログインに失敗しました。");
  assert.doesNotMatch(payload.message, /supplied email|does not exist/i);
});

test("ログアウトはSupabaseの現在セッションを失効してCookieを削除する", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: "00000000-0000-4000-8000-000000000001", email: "user@example.invalid" });
    }
    if (String(url).endsWith("/auth/v1/logout?scope=local")) {
      return new Response(null, { status: 204 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);

  assert.equal(response.status, 200);
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /\/auth\/v1\/logout\?scope=local$/);
  assert.equal(calls[1].init.headers.get("authorization"), "Bearer access-token");
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_access=.*Max-Age=0/);
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_refresh=.*Max-Age=0/);
});

test("認証サーバーのログアウト失敗時も端末Cookieを削除して警告する", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: "00000000-0000-4000-8000-000000000001" });
    }
    return Response.json({ message: "temporary failure" }, { status: 503 });
  };

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGOUT_REVOKE_FAILED");
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});

test("ログアウト失敗レスポンスの本文が壊れていても端末Cookieを削除して警告する", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: "00000000-0000-4000-8000-000000000001" });
    }
    return new Response(new ReadableStream({
      start(controller) {
        controller.error(new Error("response body aborted"));
      }
    }), { status: 503 });
  };

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGOUT_REVOKE_FAILED");
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_access=.*Max-Age=0/);
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_refresh=.*Max-Age=0/);
});

test("認証サーバーへのログアウト通信が失敗しても端末Cookieを削除して警告する", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: "00000000-0000-4000-8000-000000000001" });
    }
    throw new Error("network unavailable");
  };

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGOUT_REVOKE_FAILED");
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_access=.*Max-Age=0/);
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_refresh=.*Max-Age=0/);
});

test("ログアウト時のrefresh成功レスポンスが不正なら失効未確認として警告する", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ message: "invalid JWT" }, { status: 401 });
    }
    if (String(url).includes("grant_type=refresh_token")) {
      return Response.json({ user: { id: "00000000-0000-4000-8000-000000000001" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGOUT_REVOKE_FAILED");
  assert.equal(calls.length, 2);
  assert.doesNotMatch(calls.join("\n"), /\/auth\/v1\/logout/);
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});

test("更新トークン拒否は期限切れ401として扱う", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ message: "invalid JWT" }, { status: 401 });
    }
    if (String(url).includes("grant_type=refresh_token")) {
      return Response.json({ message: "refresh token not found" }, { status: 400 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, "SESSION_EXPIRED");
});

test("更新トークン拒否の本文が壊れていても期限切れ401として扱う", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ message: "invalid JWT" }, { status: 401 });
    }
    if (String(url).includes("grant_type=refresh_token")) {
      return new Response(new ReadableStream({
        start(controller) {
          controller.error(new Error("response body aborted"));
        }
      }), { status: 400 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, "SESSION_EXPIRED");
});

test("認証サーバー障害を期限切れとして誤表示しない", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ message: "invalid JWT" }, { status: 401 });
    }
    return Response.json({ message: "temporary failure" }, { status: 503 });
  };

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "SESSION_REFRESH_FAILED");
  assert.match(payload.message, /時間をおいて/);
});

test("セッション確認APIの障害も期限切れとして誤表示しない", async () => {
  globalThis.fetch = async () => Response.json({ message: "temporary failure" }, { status: 503 });

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "SESSION_VERIFY_FAILED");
  assert.match(payload.message, /時間をおいて/);
});

test("セッション確認APIの障害本文が壊れていても再試行可能な502として扱う", async () => {
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.error(new Error("response body aborted"));
    }
  }), { status: 503 });

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "SESSION_VERIFY_FAILED");
  assert.match(payload.message, /時間をおいて/);
});

test("ログアウト前のセッション確認障害を成功扱いにしない", async () => {
  globalThis.fetch = async () => Response.json({ message: "temporary failure" }, { status: 503 });

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGOUT_REVOKE_FAILED");
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});

test("access Cookieだけの場合も認証サーバー障害をログアウト成功扱いにしない", async () => {
  globalThis.fetch = async () => Response.json({ message: "temporary failure" }, { status: 503 });

  const response = await worker.fetch(appRequest("/api/auth/logout", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": "__Host-mm_access=access-token"
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGOUT_REVOKE_FAILED");
  assert.match(response.headers.get("set-cookie") || "", /Max-Age=0/);
});
