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
