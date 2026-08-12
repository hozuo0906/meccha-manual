import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const outputDirectory = await mkdtemp(join(tmpdir(), "meccha-manual-worker-bundle-"));
const wranglerConfigDirectory = join(outputDirectory, "xdg-config");
const executable = process.platform === "win32" ? "wrangler.cmd" : "wrangler";

try {
  const result = spawnSync(executable, ["deploy", "--dry-run", "--outdir", outputDirectory], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || wranglerConfigDirectory
    },
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
} finally {
  await rm(outputDirectory, { recursive: true, force: true });
}
