import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { chromium } from "@playwright/test";

const extensionRoot = resolve(fileURLToPath(new URL("../apps/extension/", import.meta.url)));

test("sidepanel is the action surface and keeps recording controls explicit", async () => {
  const manifest = JSON.parse(await readFile(new URL("../apps/extension/manifest.json", import.meta.url), "utf8"));
  const html = await readFile(new URL("../apps/extension/sidepanel/sidepanel.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../apps/extension/sidepanel/sidepanel.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../apps/extension/sidepanel/sidepanel.css", import.meta.url), "utf8");
  assert.equal(manifest.version, "0.1.4");
  assert.equal(manifest.permissions.includes("sidePanel"), true);
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.side_panel.default_path, "sidepanel/sidepanel.html");
  assert.match(source, /capture:start/);
  assert.match(source, /capture:pause/);
  assert.match(source, /capture:finish/);
  assert.match(source, /captureLiveStore\.list/);
  assert.match(html, /id="liveSteps"/);
  assert.match(html, /id="finish"/);
  assert.match(html, /id="pause"/);
  assert.match(css, /prefers-reduced-motion/);
});
