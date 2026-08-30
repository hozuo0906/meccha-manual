console.error(
  "Cloudflare Config Audit is retired by ADR-0028 and Issue #176. No external Cloudflare, health, KV, or secret call was performed."
);
process.exitCode = 1;
