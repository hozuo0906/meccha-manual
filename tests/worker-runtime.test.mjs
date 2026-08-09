import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { afterEach, test } from "node:test";

import { APP_ASSET_VERSION, APP_CSS, APP_JS } from "../apps/worker/src/app-assets.ts";
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

function byteLength(value) {
  return new TextEncoder().encode(value).byteLength;
}

function jsonObjectAtByteLength(targetBytes, fill = "a") {
  const prefix = '{"padding":"';
  const suffix = '"}';
  const fillBytes = byteLength(fill);
  const availableBytes = targetBytes - byteLength(prefix) - byteLength(suffix);
  const fillCount = Math.floor(availableBytes / fillBytes);
  const asciiRemainder = availableBytes - fillCount * fillBytes;
  const value = `${prefix}${fill.repeat(fillCount)}${"a".repeat(asciiRemainder)}${suffix}`;
  assert.equal(byteLength(value), targetBytes);
  return value;
}

function streamRequest(path, body, headers = {}) {
  const bytes = new TextEncoder().encode(body);
  let offset = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset >= bytes.byteLength) {
        controller.close();
        return;
      }
      const end = Math.min(offset + 1024, bytes.byteLength);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
    cancel() {
      cancelled = true;
    }
  });
  return {
    request: appRequest(path, {
      method: "POST",
      headers,
      body: stream,
      duplex: "half"
    }),
    wasCancelled: () => cancelled,
    bytesRead: () => offset
  };
}

test("app HTMLはversion付きasset URLを参照してdeploy前cacheを再利用しない", async () => {
  const response = await worker.fetch(appRequest("/"), env, ctx);
  const html = await response.text();
  const cssVersion = html.match(/href="\/assets\/app\.css\?v=([^"]+)"/)?.[1];
  const jsVersion = html.match(/src="\/assets\/app\.js\?v=([^"]+)"/)?.[1];

  assert.equal(response.status, 200);
  assert.ok(cssVersion);
  assert.equal(jsVersion, cssVersion);
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("asset内容を変更したらversion更新が必須になる", () => {
  const expectedVersion = `sha256-${createHash("sha256")
    .update(APP_CSS)
    .update("\0")
    .update(APP_JS)
    .digest("hex")
    .slice(0, 16)}`;

  assert.equal(APP_ASSET_VERSION, expectedVersion);
});

test("現行version assetだけをimmutable cacheし旧URLはno-storeにする", async () => {
  const htmlResponse = await worker.fetch(appRequest("/"), env, ctx);
  const html = await htmlResponse.text();
  const version = html.match(/src="\/assets\/app\.js\?v=([^"]+)"/)?.[1];
  assert.ok(version);

  for (const path of ["/assets/app.js", "/assets/app.css?v=old-version"]) {
    const response = await worker.fetch(appRequest(path), env, ctx);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "no-store", path);
  }

  for (const path of [`/assets/app.js?v=${version}`, `/assets/app.css?v=${version}`]) {
    const response = await worker.fetch(appRequest(path), env, ctx);
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), "public, max-age=31536000, immutable", path);
  }
});

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
  assert.equal(response.headers.get("set-cookie"), null);
});

test("遅着した壊れたCookieのGET応答は別タブの後発ログインCookieを削除しない", async () => {
  const delayedGet = worker.fetch(appRequest("/api/session", {
    headers: { cookie: "__Host-mm_access=%E0%A4%A" }
  }), env, ctx);

  const loginResponse = new Response(null, {
    headers: { "set-cookie": "__Host-mm_access=new-login; Path=/; Secure; HttpOnly" }
  });
  assert.match(loginResponse.headers.get("set-cookie") || "", /new-login/);

  const response = await delayedGet;
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "SESSION_INVALID");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("期限切れaccess Cookieだけの保護GETもCookieを変更しない", async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /\/auth\/v1\/user$/);
    return Response.json({ message: "invalid JWT" }, { status: 401 });
  };

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: "__Host-mm_access=expired-access" }
  }), env, ctx);

  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "SESSION_EXPIRED");
  assert.equal(response.headers.get("set-cookie"), null);
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
  assert.equal(payload.message, "メールアドレスまたはパスワードを確認して、もう一度ログインしてください。");
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

test("保護GETはCookieを更新せず専用POSTへrefreshを要求する", async () => {
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ message: "invalid JWT" }, { status: 401 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, "SESSION_REFRESH_REQUIRED");
  assert.equal(response.headers.get("set-cookie"), null);
  assert.equal(calls.length, 1);
});

test("専用refreshで更新トークンが拒否されたらCookieを削除する", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).includes("grant_type=refresh_token")) {
      return Response.json({ message: "refresh token not found" }, { status: 400 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/auth/refresh", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 401);
  assert.equal(payload.code, "SESSION_EXPIRED");
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_access=.*Max-Age=0/);
  assert.match(response.headers.get("set-cookie") || "", /__Host-mm_refresh=.*Max-Age=0/);
});

test("専用refreshの認証サーバー障害を期限切れとして誤表示しない", async () => {
  globalThis.fetch = async (url) => {
    return Response.json({ message: "temporary failure" }, { status: 503 });
  };

  const response = await worker.fetch(appRequest("/api/auth/refresh", {
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
  assert.equal(payload.code, "SESSION_REFRESH_FAILED");
  assert.match(payload.message, /時間をおいて/);
});

test("専用refreshは回転済みCookieを先に返しtokenを本文へ露出しない", async () => {
  globalThis.fetch = async (url) => {
    assert.match(String(url), /grant_type=refresh_token/);
    return Response.json({
      access_token: "rotated-access",
      refresh_token: "rotated-refresh",
      expires_in: 7200,
      user: { id: "00000000-0000-4000-8000-000000000001", email: "user@example.invalid" }
    });
  };

  const response = await worker.fetch(appRequest("/api/auth/refresh", {
    method: "POST",
    headers: {
      "content-type": "application/json; charset=utf-8",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: "{}"
  }), env, ctx);
  const payload = await response.json();
  const setCookie = response.headers.get("set-cookie") || "";

  assert.equal(response.status, 200);
  assert.equal(payload.status, "ok");
  assert.equal(payload.access_token, undefined);
  assert.equal(payload.refresh_token, undefined);
  assert.match(setCookie, /__Host-mm_access=rotated-access/);
  assert.match(setCookie, /__Host-mm_refresh=rotated-refresh/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.match(setCookie, /Path=\//);
  assert.doesNotMatch(setCookie, /Domain=/i);
  assert.match(setCookie, /Max-Age=3600/);
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

test("ログイン成功は安全なCookieだけでtokenを本文へ返さない", async () => {
  globalThis.fetch = async () => Response.json({
    access_token: "login-access",
    refresh_token: "login-refresh",
    expires_in: 3600,
    user: { id: "00000000-0000-4000-8000-000000000001", email: "user@example.invalid" }
  });

  const response = await worker.fetch(appRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example"
    },
    body: JSON.stringify({ email: "user@example.invalid", password: "not-a-real-secret" })
  }), env, ctx);
  const payload = await response.json();
  const setCookie = response.headers.get("set-cookie") || "";

  assert.equal(response.status, 200);
  assert.deepEqual(payload, {
    user: { id: "00000000-0000-4000-8000-000000000001", email: "user@example.invalid" }
  });
  assert.doesNotMatch(JSON.stringify(payload), /login-access|login-refresh/);
  assert.match(setCookie, /__Host-mm_access=login-access/);
  assert.match(setCookie, /__Host-mm_refresh=login-refresh/);
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /Secure/);
  assert.match(setCookie, /SameSite=Lax/);
  assert.doesNotMatch(setCookie, /Domain=/i);
});

test("認証サービスへの接続失敗は再試行可能な502へ正規化する", async () => {
  globalThis.fetch = async () => {
    throw new Error("upstream connection reset");
  };

  const response = await worker.fetch(appRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example"
    },
    body: JSON.stringify({ email: "user@example.invalid", password: "not-a-real-secret" })
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGIN_SERVICE_UNAVAILABLE");
  assert.match(payload.message, /時間をおいて/);
  assert.doesNotMatch(JSON.stringify(payload), /connection reset|not-a-real-secret/);
});

test("認証サービスの5xxを資格情報エラーと誤表示しない", async () => {
  globalThis.fetch = async () => Response.json({ message: "database unavailable" }, { status: 503 });

  const response = await worker.fetch(appRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example"
    },
    body: JSON.stringify({ email: "user@example.invalid", password: "not-a-real-secret" })
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "LOGIN_SERVICE_UNAVAILABLE");
  assert.doesNotMatch(payload.message, /パスワードを確認/);
  assert.doesNotMatch(JSON.stringify(payload), /database unavailable/);
});

test("全認証POSTは偽のJSON MIMEを拒否する", async () => {
  const routes = [
    ["/api/auth/login", JSON.stringify({ email: "user@example.invalid", password: "not-a-real-secret" })],
    ["/api/auth/refresh", "{}"],
    ["/api/auth/logout", "{}"]
  ];
  for (const [path, body] of routes) {
    for (const contentType of ["application/jsonx", "text/application/json"]) {
      const response = await worker.fetch(appRequest(path, {
        method: "POST",
        headers: {
          "content-type": contentType,
          "origin": "https://app.example",
          "cookie": sessionCookie()
        },
        body
      }), env, ctx);
      assert.equal(response.status, 415, `${path} ${contentType}`);
      assert.equal((await response.json()).code, "JSON_CONTENT_TYPE_REQUIRED", `${path} ${contentType}`);
    }
  }
});

test("全認証POSTはContent-Length上限超過を外部通信前に拒否する", async () => {
  globalThis.fetch = async () => {
    throw new Error("上限超過時に外部通信してはいけません");
  };
  for (const path of ["/api/auth/login", "/api/auth/refresh", "/api/auth/logout"]) {
    const response = await worker.fetch(appRequest(path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(16 * 1024 + 1),
        "origin": "https://app.example",
        "cookie": sessionCookie()
      },
      body: "{}"
    }), env, ctx);
    assert.equal(response.status, 413, path);
    assert.equal((await response.json()).code, "JSON_BODY_TOO_LARGE", path);
  }
});

test("認証JSONはContent-Lengthなしでも16KB超過をstream途中で拒否する", async () => {
  const body = jsonObjectAtByteLength(16 * 1024 + 4096);
  const streamed = streamRequest("/api/auth/login", body, {
    "content-type": "application/json",
    "origin": "https://app.example"
  });

  const response = await worker.fetch(streamed.request, env, ctx);

  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "JSON_BODY_TOO_LARGE");
  assert.equal(streamed.wasCancelled(), true);
  assert.ok(streamed.bytesRead() < byteLength(body));
});

test("認証JSONはASCIIとUTF-8の16KB境界をbyte単位で受理する", async () => {
  for (const fill of ["a", "あ"]) {
    const body = jsonObjectAtByteLength(16 * 1024, fill);
    const response = await worker.fetch(appRequest("/api/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://app.example"
      },
      body
    }), env, ctx);

    assert.equal(response.status, 200, fill);
    assert.equal((await response.json()).status, "ok", fill);
  }
});

test("認証JSONはASCIIとUTF-8の16KB超過をbyte単位で拒否する", async () => {
  for (const fill of ["a", "あ"]) {
    const body = jsonObjectAtByteLength(16 * 1024 + 1, fill);
    const response = await worker.fetch(appRequest("/api/auth/logout", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://app.example"
      },
      body
    }), env, ctx);

    assert.equal(response.status, 413, fill);
    assert.equal((await response.json()).code, "JSON_BODY_TOO_LARGE", fill);
  }
});

test("認証JSONはnullと配列をplain objectではないとして400にする", async () => {
  for (const body of ["null", "[]"]) {
    const response = await worker.fetch(appRequest("/api/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://app.example"
      },
      body
    }), env, ctx);

    assert.equal(response.status, 400, body);
    assert.equal((await response.json()).code, "JSON_OBJECT_REQUIRED", body);
  }
});

test("Discord bodyはContent-Lengthなしでも64KB超過をstream途中で拒否する", async () => {
  const body = jsonObjectAtByteLength(64 * 1024 + 4096);
  const streamed = streamRequest("/v1/integrations/discord/interactions", body);

  const response = await worker.fetch(streamed.request, env, ctx);

  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "DISCORD_BODY_TOO_LARGE");
  assert.equal(streamed.wasCancelled(), true);
  assert.ok(streamed.bytesRead() < byteLength(body));
});

test("不正な認証成功payloadではCookieを発行しない", async () => {
  globalThis.fetch = async () => Response.json({
    access_token: "access-token",
    refresh_token: "refresh-token",
    expires_in: "not-a-number",
    user: { id: "00000000-0000-4000-8000-000000000001" }
  });

  const response = await worker.fetch(appRequest("/api/auth/login", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example"
    },
    body: JSON.stringify({ email: "user@example.invalid", password: "not-a-real-secret" })
  }), env, ctx);

  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "LOGIN_RESPONSE_INVALID");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("認証ユーザー応答が不正なら再試行可能な502にする", async () => {
  globalThis.fetch = async () => Response.json({ email: "missing-id@example.invalid" });

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();

  assert.equal(response.status, 502);
  assert.equal(payload.code, "SESSION_VERIFY_FAILED");
});

test("refresh通信失敗はCookieを残した再試行可能な502にする", async () => {
  globalThis.fetch = async () => {
    throw new Error("temporary refresh outage");
  };

  const response = await worker.fetch(appRequest("/api/auth/refresh", {
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
  assert.equal(payload.code, "SESSION_REFRESH_FAILED");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("ログアウト後のCookieなし保護APIは401になる", async () => {
  const response = await worker.fetch(appRequest("/api/session"), env, ctx);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "SESSION_REQUIRED");
});

test("所属ワークスペース一覧は認証済みtokenと固定fieldだけで取得する", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: "user-1", email: "user@example.invalid" });
    }
    if (String(url).includes("/rest/v1/profiles?")) {
      return Response.json([{ id: "user-1", display_name: "利用者", locale: "ja-JP", timezone: "Asia/Tokyo" }]);
    }
    if (String(url).includes("/rest/v1/workspaces?")) {
      return Response.json([{
        id: "11111111-1111-4111-8111-111111111111",
        name: "営業部",
        slug: "sales-team",
        status: "active",
        created_at: "2026-08-10T00:00:00Z"
      }], { headers: { "content-range": "0-0/1" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/session", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();
  const workspaceCall = calls.find((call) => call.url.includes("/rest/v1/workspaces?"));

  assert.equal(response.status, 200);
  assert.equal(payload.workspaces[0].id, "11111111-1111-4111-8111-111111111111");
  assert.match(workspaceCall.url, /select=id,name,slug,status,created_at/);
  assert.match(workspaceCall.url, /order=created_at.desc/);
  assert.equal(workspaceCall.init.headers.get("authorization"), "Bearer access-token");
  assert.equal(workspaceCall.init.headers.get("apikey"), "public-anon-key");
});

test("GET workspace routeは一覧wrapperだけを返しtokenを露出しない", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (String(url).includes("/rest/v1/workspaces?")) {
      return Response.json([{
        id: "11111111-1111-4111-8111-111111111111",
        name: "営業部",
        slug: "sales-team",
        status: "active",
        created_at: "2026-08-10T00:00:00Z"
      }], { headers: { "content-range": "0-0/1" } });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const response = await worker.fetch(appRequest("/api/workspaces", {
    headers: { cookie: sessionCookie() }
  }), env, ctx);
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(Object.keys(payload), ["workspaces"]);
  assert.equal(payload.workspaces[0].slug, "sales-team");
  assert.doesNotMatch(JSON.stringify(payload), /access-token|refresh-token/);
});

test("ワークスペース作成はRPCだけを呼びtokenや一覧を応答へ含めない", async () => {
  const calls = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith("/auth/v1/user")) {
      return Response.json({ id: "user-1", email: "user@example.invalid" });
    }
    if (String(url).endsWith("/rest/v1/rpc/create_workspace")) {
      return Response.json("11111111-1111-4111-8111-111111111111");
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const response = await worker.fetch(appRequest("/api/workspaces", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: JSON.stringify({ name: "  営業部  ", slug: "SALES-TEAM" })
  }), env, ctx);
  const payload = await response.json();
  const rpcCall = calls.at(-1);

  assert.equal(response.status, 201);
  assert.deepEqual(payload, { workspaceId: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(JSON.parse(rpcCall.init.body), {
    workspace_name: "営業部",
    workspace_slug: "sales-team"
  });
  assert.match(rpcCall.url, /\/rest\/v1\/rpc\/create_workspace$/);
  assert.doesNotMatch(JSON.stringify(payload), /access-token|refresh-token/);
  assert.equal(calls.some((call) => call.url.includes("/rest/v1/workspaces?")), false);
});

test("ワークスペース一覧の不正な2xx payloadは空一覧にせず502にする", async () => {
  for (const invalidPayload of [null, {}, [{ id: "workspace-1", name: "営業部", slug: "sales", status: "unknown", created_at: "2026-08-10" }]]) {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (String(url).includes("/rest/v1/profiles?")) return Response.json([]);
      if (String(url).includes("/rest/v1/workspaces?")) return Response.json(invalidPayload);
      throw new Error(`unexpected fetch: ${url}`);
    };
    const response = await worker.fetch(appRequest("/api/session", {
      headers: { cookie: sessionCookie() }
    }), env, ctx);
    assert.equal(response.status, 502);
    assert.equal((await response.json()).code, "WORKSPACES_RESPONSE_INVALID");
  }
});

test("RPC成功payloadが文字列IDでなければ作成済みIDとして受理しない", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (String(url).endsWith("/rest/v1/rpc/create_workspace")) return Response.json({ id: "workspace-1" });
    throw new Error(`unexpected fetch: ${url}`);
  };
  const response = await worker.fetch(appRequest("/api/workspaces", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "origin": "https://app.example",
      "cookie": sessionCookie()
    },
    body: JSON.stringify({ name: "営業部", slug: "sales-team" })
  }), env, ctx);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "WORKSPACE_CREATE_RESULT_UNKNOWN");
});

test("workspace上流の権限不足と障害を日本語の安定codeへ正規化する", async () => {
  for (const [upstreamStatus, expectedStatus, expectedCode] of [
    [403, 403, "WORKSPACE_CREATE_FORBIDDEN"],
    [429, 502, "WORKSPACE_CREATE_FAILED"],
    [503, 502, "WORKSPACE_CREATE_RESULT_UNKNOWN"]
  ]) {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (String(url).endsWith("/rest/v1/rpc/create_workspace")) {
        return Response.json({ message: "internal tenant detail" }, { status: upstreamStatus });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const response = await worker.fetch(appRequest("/api/workspaces", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "origin": "https://app.example",
        "cookie": sessionCookie()
      },
      body: JSON.stringify({ name: "営業部", slug: "sales-team" })
    }), env, ctx);
    const payload = await response.json();
    assert.equal(response.status, expectedStatus);
    assert.equal(payload.code, expectedCode);
    assert.doesNotMatch(JSON.stringify(payload), /internal tenant detail/);
  }
});

test("workspace上流401はCookieを変えず安全なrefresh経路へ戻す", async () => {
  for (const [path, method, body] of [
    ["/api/session", "GET", undefined],
    ["/api/workspaces", "POST", JSON.stringify({ name: "営業部", slug: "sales-team" })]
  ]) {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (String(url).includes("/rest/v1/profiles?")) return Response.json([]);
      return Response.json({ message: "expired" }, { status: 401 });
    };
    const response = await worker.fetch(appRequest(path, {
      method,
      headers: {
        ...(method === "POST" ? { "content-type": "application/json", "origin": "https://app.example" } : {}),
        "cookie": sessionCookie()
      },
      body
    }), env, ctx);
    assert.equal(response.status, 401);
    assert.equal((await response.json()).code, "SESSION_REFRESH_REQUIRED");
    assert.equal(response.headers.get("set-cookie"), null);
  }
});

test("profileとworkspaceの両方が401でも必ずrefresh要求へ正規化する", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (String(url).includes("/rest/v1/profiles?") || String(url).includes("/rest/v1/workspaces?")) {
      return Response.json({ message: "expired" }, { status: 401 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const response = await worker.fetch(appRequest("/api/session", { headers: { cookie: sessionCookie() } }), env, ctx);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).code, "SESSION_REFRESH_REQUIRED");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("RPC応答消失と不正成功bodyは作成失敗でなく結果不明として案内する", async () => {
  for (const rpcResult of ["throw", "aborted"]) {
    globalThis.fetch = async (url) => {
      if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (String(url).endsWith("/rest/v1/rpc/create_workspace")) {
        if (rpcResult === "throw") throw new Error("response lost after commit");
        return new Response(new ReadableStream({
          start(controller) { controller.error(new Error("body aborted")); }
        }), { status: 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const response = await worker.fetch(appRequest("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://app.example", "cookie": sessionCookie() },
      body: JSON.stringify({ name: "営業部", slug: "sales-team" })
    }), env, ctx);
    const payload = await response.json();
    assert.equal(response.status, 502);
    assert.equal(payload.code, "WORKSPACE_CREATE_RESULT_UNKNOWN");
    assert.match(payload.message, /重ねて作成せず/);
  }
});

test("workspace一覧の成功body読取失敗は内部500にせず502へ正規化する", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (String(url).includes("/rest/v1/profiles?")) return Response.json([]);
    if (String(url).includes("/rest/v1/workspaces?")) {
      return new Response(new ReadableStream({
        start(controller) { controller.error(new Error("body aborted")); }
      }), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  const response = await worker.fetch(appRequest("/api/session", { headers: { cookie: sessionCookie() } }), env, ctx);
  assert.equal(response.status, 502);
  assert.equal((await response.json()).code, "WORKSPACES_FETCH_FAILED");
});

test("workspace作成は配列・数値・object入力を文字列化して受理しない", async () => {
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    throw new Error("RPCへ到達してはいけません");
  };
  for (const payload of [
    { name: ["営業部"], slug: "sales-team" },
    { name: "営業部", slug: ["sales-team"] },
    { name: 123, slug: {} }
  ]) {
    const response = await worker.fetch(appRequest("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", "origin": "https://app.example", "cookie": sessionCookie() },
      body: JSON.stringify(payload)
    }), env, ctx);
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, "WORKSPACE_INPUT_INVALID");
  }
});

test("workspace名はUTF-16長ではなくUnicode code pointで1〜64文字を判定する", async () => {
  let rpcCalls = 0;
  globalThis.fetch = async (url) => {
    const value = String(url);
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (value.endsWith("/rest/v1/rpc/create_workspace")) {
      rpcCalls += 1;
      return Response.json("11111111-1111-4111-8111-111111111111");
    }
    throw new Error(`unexpected fetch: ${url}`);
  };
  for (const [count, expectedStatus] of [[64, 201], [65, 400]]) {
    const response = await worker.fetch(appRequest("/api/workspaces", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://app.example", cookie: sessionCookie() },
      body: JSON.stringify({ name: "😀".repeat(count), slug: `emoji-${count}` })
    }), env, ctx);
    assert.equal(response.status, expectedStatus, String(count));
  }
  assert.equal(rpcCalls, 1);

  for (const [count, expectedStatus] of [[64, 200], [65, 502]]) {
    globalThis.fetch = async (url) => {
      const value = String(url);
      if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (value.includes("/rest/v1/workspaces?")) {
        return Response.json([{
          id: "11111111-1111-4111-8111-111111111111",
          name: "😀".repeat(count),
          slug: "emoji-team",
          status: "active",
          created_at: "2026-08-10T00:00:00Z"
        }], { headers: { "content-range": "0-0/1" } });
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const response = await worker.fetch(appRequest("/api/workspaces", {
      headers: { cookie: sessionCookie() }
    }), env, ctx);
    assert.equal(response.status, expectedStatus, `list ${count}`);
  }
});

test("profileとworkspaceの混合失敗でも401を優先してrefresh要求にする", async () => {
  for (const delayed401Target of ["profile", "workspaces"]) {
    globalThis.fetch = async (url) => {
      const value = String(url);
      if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      const isProfile = value.includes("/rest/v1/profiles?");
      const is401Target = delayed401Target === "profile" ? isProfile : !isProfile;
      if (is401Target) {
        await new Promise((resolve) => setImmediate(resolve));
        return Response.json({ message: "expired" }, { status: 401 });
      }
      return new Response(new ReadableStream({
        start(controller) { controller.error(new Error("body aborted first")); }
      }), { status: 200 });
    };

    const response = await worker.fetch(appRequest("/api/session", {
      headers: { cookie: sessionCookie() }
    }), env, ctx);
    assert.equal(response.status, 401, delayed401Target);
    assert.equal((await response.json()).code, "SESSION_REFRESH_REQUIRED", delayed401Target);
    assert.equal(response.headers.get("set-cookie"), null, delayed401Target);
  }
});

test("Supabase読取がsignalを無視して停止しても5秒で打ち切り401を優先する", async () => {
  const hangingSignals = [];
  globalThis.fetch = async (url, init = {}) => {
    const value = String(url);
    const authorization = init.headers.get("authorization");
    if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (value.includes("/rest/v1/profiles?")) {
      if (authorization === "Bearer mixed-access") {
        return Response.json({ message: "expired" }, { status: 401 });
      }
      return Response.json([{ id: "user-1" }]);
    }
    if (value.includes("/rest/v1/workspaces?")) {
      hangingSignals.push(init.signal);
      return new Promise(() => {});
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const [mixedResponse, hangingResponse] = await Promise.all([
    worker.fetch(appRequest("/api/session", {
      headers: { cookie: sessionCookie("mixed-access") }
    }), env, ctx),
    worker.fetch(appRequest("/api/session", {
      headers: { cookie: sessionCookie("hanging-access") }
    }), env, ctx)
  ]);

  assert.equal(mixedResponse.status, 401);
  assert.equal((await mixedResponse.json()).code, "SESSION_REFRESH_REQUIRED");
  assert.equal(hangingResponse.status, 502);
  assert.equal((await hangingResponse.json()).code, "WORKSPACES_FETCH_FAILED");
  assert.equal(hangingSignals.length, 2);
  assert.ok(hangingSignals.every((signal) => signal.aborted));
});

test("workspace一覧は1001件目で打ち切り、無上限bufferを拒否する", async () => {
  const workspaces = Array.from({ length: 1001 }, (_, index) => ({
    id: `11111111-1111-4111-8111-${index.toString(16).padStart(12, "0")}`,
    name: `部署${index}`,
    slug: `team-${index.toString().padStart(4, "0")}`,
    status: "active",
    created_at: "2026-08-10T00:00:00Z"
  }));
  for (const returnedCount of [1001, 1000, 500]) {
    let workspaceUrl = "";
    let workspacePrefer = "";
    globalThis.fetch = async (url, init = {}) => {
      const value = String(url);
      if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (value.includes("/rest/v1/workspaces?")) {
        workspaceUrl = value;
        workspacePrefer = init.headers.get("prefer");
        return Response.json(
          workspaces.slice(0, returnedCount),
          { headers: { "content-range": `0-${returnedCount - 1}/1001` } }
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    };

    const response = await worker.fetch(appRequest("/api/workspaces", {
      headers: { cookie: sessionCookie() }
    }), env, ctx);
    assert.equal(response.status, 409, String(returnedCount));
    assert.equal((await response.json()).code, "WORKSPACES_LIMIT_EXCEEDED", String(returnedCount));
    assert.match(workspaceUrl, /limit=1001/);
    assert.equal(workspacePrefer, "count=exact");
  }

  for (const contentRange of [null, "garbage/500", "499-0/500", "1-500/500"]) {
    globalThis.fetch = async (url) => {
      const value = String(url);
      if (value.endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
      if (value.includes("/rest/v1/workspaces?")) {
        return Response.json(
          workspaces.slice(0, 500),
          contentRange ? { headers: { "content-range": contentRange } } : undefined
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    };
    const invalidRangeResponse = await worker.fetch(appRequest("/api/workspaces", {
      headers: { cookie: sessionCookie() }
    }), env, ctx);
    assert.equal(invalidRangeResponse.status, 502, String(contentRange));
    assert.equal((await invalidRangeResponse.json()).code, "WORKSPACES_RESPONSE_INVALID", String(contentRange));
  }
});

test("workspace作成routeはOrigin・MIME・body上限・plain object契約を直接強制する", async () => {
  let rpcCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("/auth/v1/user")) return Response.json({ id: "user-1" });
    if (String(url).endsWith("/rest/v1/rpc/create_workspace")) {
      rpcCalls += 1;
      return Response.json("11111111-1111-4111-8111-111111111111");
    }
    throw new Error(`unexpected fetch: ${url}`);
  };

  const cases = [
    {
      label: "origin mismatch",
      status: 403,
      code: "ORIGIN_MISMATCH",
      headers: { "content-type": "application/json", origin: "https://evil.example", cookie: sessionCookie() },
      body: JSON.stringify({ name: "営業部", slug: "sales-team" })
    },
    {
      label: "fake json mime",
      status: 415,
      code: "JSON_CONTENT_TYPE_REQUIRED",
      headers: { "content-type": "text/plain", origin: "https://app.example", cookie: sessionCookie() },
      body: JSON.stringify({ name: "営業部", slug: "sales-team" })
    },
    {
      label: "top-level null",
      status: 400,
      code: "JSON_OBJECT_REQUIRED",
      headers: { "content-type": "application/json", origin: "https://app.example", cookie: sessionCookie() },
      body: "null"
    },
    {
      label: "top-level array",
      status: 400,
      code: "JSON_OBJECT_REQUIRED",
      headers: { "content-type": "application/json", origin: "https://app.example", cookie: sessionCookie() },
      body: "[]"
    },
    {
      label: "body too large",
      status: 413,
      code: "JSON_BODY_TOO_LARGE",
      headers: { "content-type": "application/json", origin: "https://app.example", cookie: sessionCookie() },
      body: JSON.stringify({ name: "a".repeat(17 * 1024), slug: "sales-team" })
    }
  ];

  for (const testCase of cases) {
    const response = await worker.fetch(appRequest("/api/workspaces", {
      method: "POST",
      headers: testCase.headers,
      body: testCase.body
    }), env, ctx);
    assert.equal(response.status, testCase.status, testCase.label);
    assert.equal((await response.json()).code, testCase.code, testCase.label);
  }
  assert.equal(rpcCalls, 0);
});
