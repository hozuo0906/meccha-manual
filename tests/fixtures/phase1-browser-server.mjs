import { createServer } from "node:http";

import worker from "../../apps/worker/src/index.ts";

const hostname = "127.0.0.1";
const port = 4173;
const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "public-anon-key"
};
const ctx = { waitUntil() {} };

const server = createServer(async (incoming, outgoing) => {
  try {
    if (incoming.url === "/healthz") {
      outgoing.writeHead(204).end();
      return;
    }

    const request = new Request(`http://${hostname}:${port}${incoming.url || "/"}`, {
      method: incoming.method,
      headers: incoming.headers
    });
    const response = await worker.fetch(request, env, ctx);
    const headers = Object.fromEntries(response.headers.entries());
    outgoing.writeHead(response.status, headers);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    outgoing.end(error instanceof Error ? error.message : "unknown server error");
  }
});

server.listen(port, hostname);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
