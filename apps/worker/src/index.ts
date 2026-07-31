interface HealthResponse {
  service: "meccha-manual";
  status: "ok";
  phase: "cloudflare-worker-harness";
  timestamp: string;
}

function jsonResponse(body: HealthResponse, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...init?.headers
    }
  });
}

export default {
  async fetch(): Promise<Response> {
    return jsonResponse({
      service: "meccha-manual",
      status: "ok",
      phase: "cloudflare-worker-harness",
      timestamp: new Date().toISOString()
    });
  }
} satisfies ExportedHandler;
