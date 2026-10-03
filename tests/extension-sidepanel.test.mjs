import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

test("sidepanel is the action surface and keeps recording controls explicit", async () => {
  const manifest = JSON.parse(await readFile(new URL("../apps/extension/manifest.json", import.meta.url), "utf8"));
  const html = await readFile(new URL("../apps/extension/sidepanel/sidepanel.html", import.meta.url), "utf8");
  const source = await readFile(new URL("../apps/extension/sidepanel/sidepanel.js", import.meta.url), "utf8");
  const css = await readFile(new URL("../apps/extension/sidepanel/sidepanel.css", import.meta.url), "utf8");
  assert.equal(manifest.version, "0.1.9");
  assert.equal(manifest.permissions.includes("sidePanel"), true);
  assert.equal(manifest.action.default_popup, undefined);
  assert.equal(manifest.action.default_icon["128"], "assets/meccha-manual-logo-mark.png");
  assert.equal(manifest.icons["128"], "assets/meccha-manual-logo-mark.png");
  assert.equal(manifest.side_panel.default_path, "sidepanel/sidepanel.html");
  assert.match(source, /capture:start/);
  assert.match(source, /capture:pause/);
  assert.match(source, /capture:finish/);
  assert.match(source, /capture:close-panel/);
  assert.match(source, /EDITOR_READY_TIMEOUT_MS/);
  assert.match(source, /waitForEditorReady/);
  assert.match(source, /isEditorReadySender/);
  assert.match(source, /openDraftEditor\(result\.draftId, \{ waitForReady: true \}\)/);
  assert.match(source, /keepLiveTailVisibleAfterResize\(\)/);
  assert.match(source, /liveLatest/);
  assert.match(source, /scrollLiveLatest/);
  assert.match(source, /window\.scrollTo\(\{ top: targetScrollY, behavior: scrollBehavior \}\)/);
  assert.match(source, /if \(programmaticFollowPending\) \{\s*if \(isLiveTailVisible\(\)\) programmaticFollowPending = false;/);
  assert.doesNotMatch(source, /event\?\.isTrusted\) programmaticFollowPending = false/);
  assert.doesNotMatch(source, /latest\.scrollIntoView/);
  assert.doesNotMatch(source, /window\.scrollBy\(\{ top: overlap/);
  assert.match(source, /captureLimitReached/);
  assert.match(source, /captureLimitReached: state\.captureLimitReached/);
  assert.match(source, /const semanticLabel = SEMANTIC_LABELS\.has\(event\?\.label\) \? event\.label : "操作対象"/);
  assert.match(source, /event\?\.kind === "click" && event\.label && \(event\.labelSource === "caption" \|\| !SEMANTIC_LABELS\.has\(event\.label\)\).*【\$\{event\.label\}】をクリック/);
  assert.match(source, /cancel_failed/);
  assert.match(source, /100/);
  assert.match(source, /200/);
  const worker = await readFile(new URL("../apps/extension/background/service-worker.js", import.meta.url), "utf8");
  assert.match(worker, /chrome\.sidePanel\.open/);
  assert.match(worker, /chrome\.sidePanel\.close/);
  assert.match(worker, /CLOUD_CLAIM_MAX_ASSETS/);
  assert.match(worker, /message\?\.type === "editor:ready"/);
  assert.doesNotMatch(worker, /typeof importedCaptureLiveStore/);
  assert.match(worker, /captureLimitReached: session\?\.captureLimitReached/);
  assert.match(source, /captureLiveStore\.list/);
  assert.match(html, /id="liveSteps"/);
  assert.match(html, /id="liveCurrentStep"/);
  assert.match(html, /id="liveCurrentStatus"/);
  assert.match(html, /id="liveLatest"/);
  assert.ok(html.indexOf('id="liveProgress"') < html.indexOf('id="liveSection"'), "live progress must precede the scrollable recording section");
  assert.match(html, /id="draftSection"/);
  assert.match(html, /id="finish"/);
  assert.match(html, /id="pause"/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /\.live-progress \{[^}]*position: sticky/);
});

async function imageStatusHarness() {
  const source = await readFile(new URL("../apps/extension/sidepanel/sidepanel.js", import.meta.url), "utf8");
  const context = { failedDisplayImages: new Set() };
  vm.runInNewContext(source.slice(source.indexOf("function imageStateFor("), source.indexOf("function updateLiveLatestVisibility(")) +
    "\nglobalThis.state = imageStateFor; globalThis.label = imageStatusFor; globalThis.summary = imageSummaryFor; globalThis.reason = imageReasonText;", context);
  return context;
}

test("sidepanel distinguishes completed, pending, missing, protected and intentional no-image steps", async () => {
  const view = await imageStatusHarness();
  const statuses = ["ready", "queued", "capturing", "failed", "unavailable", "protected", "none"];
  const events = statuses.map((status) => ({ eventId: status }));
  const refs = statuses.map((status) => ({ eventId: status, status, reason: status === "protected" ? "unsupported_iframe" : null, version: 1 }));
  const images = [{ eventId: "ready", id: "ready-image", status: "ready", dataUrl: "data:image/jpeg;base64,AA" }, { eventId: "protected", id: "protected-image", status: "protected", reason: "unsupported_iframe", dataUrl: "data:image/jpeg;base64,AA" }];
  assert.equal(view.summary(events, images, refs), "画像 完了 1/7・準備中 2・取得できず 2・要確認 1・説明のみ 1");
  assert.equal(view.label(events[5], images, refs), "保護した領域の確認が必要です");
  assert.equal(view.label(events[6], images, refs), "説明のみの手順");
  assert.match(view.reason("unsupported_iframe"), /埋め込み領域/);
  assert.match(view.reason("screen_changed"), /過去の画面/);
});

test("sidepanel displays failed saved-image decoding separately and does not claim success", async () => {
  const view = await imageStatusHarness();
  const event = { eventId: "one" };
  const image = { eventId: "one", id: "broken-image", status: "ready", dataUrl: "data:image/jpeg;base64,AA" };
  view.failedDisplayImages.add("broken-image");
  assert.equal(view.label(event, [image], []), "保存済みの画像を読み込めませんでした");
  assert.match(view.summary([event], [image], []), /完了 0\/1.*表示できず 1/);
  view.failedDisplayImages.delete("broken-image");
  assert.equal(view.label(event, [image], []), "保存済み");
});

test("sidepanel respects newer intentional no-image state and missing stored bytes", async () => {
  const view = await imageStatusHarness();
  const event = { eventId: "one" };
  const image = { eventId: "one", status: "ready", dataUrl: "data:image/jpeg;base64,AA", version: 1 };
  assert.equal(view.state(event, [image], [{ eventId: "one", status: "none", version: 2 }]).status, "none");
  assert.equal(view.state(event, [], [{ eventId: "one", status: "ready" }]).reason, "storage_failed");
  assert.equal(view.state(event, [image], [{ eventId: "one", status: "ready", version: 2 }]).reason, "storage_failed");
  view.failedDisplayImages.add(undefined);
  assert.equal(view.state(event, [image], [{ eventId: "one", status: "none", version: 2 }]).status, "none");
});
