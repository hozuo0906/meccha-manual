import assert from "node:assert/strict";
import test from "node:test";
import { isSensitiveInput, normalizeCaptureEvent } from "../apps/extension/capture/privacy.js";
import { VIEWPORTS, targetOuterBounds } from "../apps/extension/responsive/viewports.js";

test("manifest uses explicit minimal permissions without all_urls or debugger", async () => {
  const manifest = JSON.parse(await (await import("node:fs/promises")).readFile(new URL("../apps/extension/manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.permissions.includes("activeTab"), true);
  assert.equal(manifest.permissions.includes("scripting"), true);
  assert.equal(manifest.permissions.includes("debugger"), false);
  assert.equal("host_permissions" in manifest, false);
  assert.equal("externally_connectable" in manifest, false);
});

test("capture session survives Manifest V3 service worker suspension", async () => {
  const source = await (await import("node:fs/promises")).readFile(
    new URL("../apps/extension/background/service-worker.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /chrome\.storage\.session\.get\(SESSION_KEY\)/);
  assert.match(source, /chrome\.storage\.session\.set\(\{ \[SESSION_KEY\]: nextSession \}\)/);
  assert.match(source, /chrome\.storage\.session\.remove\(SESSION_KEY\)/);
});

test("input values are never copied into normalized events", () => {
  const event = normalizeCaptureEvent({ kind: "input", at: 1, target: { ariaLabel: "顧客名", value: "秘密の値" } });
  assert.deepEqual(event, { kind: "input", at: 1, label: "顧客名" });
  assert.equal(JSON.stringify(event).includes("秘密の値"), false);
});

test("password, payment, token and identity fields receive a generic label", () => {
  for (const target of [{ type: "password" }, { autocomplete: "cc-number" }, { name: "access_token" }, { ariaLabel: "個人番号" }]) {
    assert.equal(isSensitiveInput(target), true);
    assert.equal(normalizeCaptureEvent({ kind: "input", at: 1, target }).label, "保護された入力欄");
  }
});

test("responsive modes include both orientations and account for browser chrome", () => {
  assert.deepEqual(Object.keys(VIEWPORTS), ["pc", "smartphonePortrait", "smartphoneLandscape", "tabletPortrait", "tabletLandscape"]);
  assert.deepEqual(targetOuterBounds(VIEWPORTS.smartphonePortrait, { innerWidth: 1000, innerHeight: 700 }, { width: 1016, height: 788 }), { width: 406, height: 932 });
  assert.equal(targetOuterBounds(VIEWPORTS.pc, {}, {}), null);
});
