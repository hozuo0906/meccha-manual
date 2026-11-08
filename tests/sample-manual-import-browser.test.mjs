import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";
import { EDITOR_TOOLS_JS } from "../apps/worker/src/editor-tools-assets.ts";
import { MANUAL_SAMPLE_DETAIL } from "../apps/worker/src/manual-sample-assets.ts";

const origin = "https://meccha-manual-staging.meccha-iiyatsu.com";
const workspaceId = "00000000-0000-4000-8000-000000000001";
const manualId = "00000000-0000-4000-8000-000000000002";
const api = `/api/workspaces/${workspaceId}`;
const label = "サンプルを自分のワークスペースに入れる";

test("explicit sample import opens editable fixture, prevents double submit, retries failure and retains edits at three widths", { timeout: 120_000 }, async () => {
  const browser = await chromium.launch({ channel: "chromium", headless: true });
  try {
    for (const width of [1366, 1024, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, locale: "ja-JP" });
      page.setDefaultTimeout(6000);
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      let manual = null, posts = 0, fail = false, patches = 0, archives = 0;
      let pending = null;
      const finishDetail = () => ({
        manual, draft: { ...MANUAL_SAMPLE_DETAIL.draft, title: manual.title, id: "draft-sample", updatedAt: "2026-11-08T00:00:00.000Z", state: "draft" },
        steps: MANUAL_SAMPLE_DETAIL.steps.map((step, index) => ({ ...step, id: `step-${index}`, assetId: `asset-${index}`, assetUrl: `${api}/assets/${index}` })),
        permissions: { canEdit: true }
      });
      await page.route(origin + "/**", async route => {
        const request = route.request();
        const path = new URL(request.url()).pathname;
        const assets = {
          "/manuals": ["text/html", renderCloudManualsPage({ workspaceId })],
          "/assets/cloud-manual.css": ["text/css", CLOUD_MANUAL_CSS],
          "/assets/cloud-manual.js": ["application/javascript", CLOUD_MANUAL_JS],
          "/assets/editor-tools.js": ["application/javascript", EDITOR_TOOLS_JS]
        };
        if (assets[path]) return route.fulfill({ status: 200, contentType: assets[path][0], body: assets[path][1] });
        const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
        if (path === `${api}/sample-manual`) {
          assert.equal(request.method(), "POST");
          assert.equal(request.postData(), null);
          posts++;
          await pending?.promise;
          if (fail) return json({ message: "合成した保存失敗" }, 503);
          const status = manual ? "alreadySeeded" : "seeded";
          manual ??= { id: manualId, title: MANUAL_SAMPLE_DETAIL.manual.title, isSample: true, updatedAt: "2026-11-08T00:00:00.000Z" };
          return json({ status, manualId });
        }
        if (path === `${api}/manuals`) return json({ manuals: manual ? [manual] : [] });
        if (path === `${api}/manuals/${manualId}`) return json(finishDetail());
        if (path === `${api}/manuals/${manualId}/share-links`) return json({ share: null });
        if (path.startsWith(`${api}/assets/`)) return route.fulfill({ status: 200, contentType: "image/png", body: await readFile(new URL("../apps/worker/brand-assets/assets/manual-sample/list.png", import.meta.url)) });
        if (path === `${api}/manuals/${manualId}/archive`) {
          assert.equal(request.method(), "POST");
          assert.equal(JSON.parse(request.postData()).expectedUpdatedAt, manual.updatedAt);
          archives++; manual = null;
          return json({ archivedManualId: manualId });
        }
        if (path === `${api}/manuals/${manualId}/draft`) { patches++; return json({}); }
        return route.fulfill({ status: 404, body: "" });
      });
      await page.goto(origin + "/manuals");
      await page.getByRole("link", { name: "サンプルを見る", exact: true }).waitFor();
      assert.equal(posts, 0, "loading and empty state never import automatically");
      assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 2, "empty state and permanent panel both offer the explicit action");
      fail = true;
      await page.getByRole("button", { name: label, exact: true }).last().click();
      await page.locator("#cloud-message").filter({ hasText: "同じボタンから再試行してください" }).waitFor();
      assert.equal(posts, 1);
      assert.equal(await page.getByRole("button", { name: label, exact: true }).first().isEnabled(), true);
      fail = false;
      pending = Promise.withResolvers();
      await page.getByRole("button", { name: label, exact: true }).first().click();
      await page.waitForFunction(() => document.querySelector("#cloud-message")?.textContent.includes("取り込んでいます"));
      const buttons = page.getByRole("button", { name: label, exact: true });
      assert.equal(await buttons.first().isDisabled(), true);
      assert.equal(await buttons.last().isDisabled(), true);
      await buttons.last().dispatchEvent("click");
      pending.resolve(); pending = null;
      await page.locator("#cloud-message").filter({ hasText: "サンプルをワークスペースに入れました" }).waitFor();
      assert.equal(posts, 2, "disabled-event dispatch also cannot submit a second request");
      assert.equal(await page.getByLabel("タイトル", { exact: true }).inputValue(), MANUAL_SAMPLE_DETAIL.manual.title);
      assert.equal(await page.getByLabel("タイトル", { exact: true }).isEditable(), true);
      assert.equal(await page.locator(".manual-step-nav ol button").count(), 6);
      await page.waitForFunction(() => document.querySelector(".cloud-step-image")?.naturalWidth === 800);
      await page.getByRole("button", { name: "手順書一覧", exact: true }).click();
      await page.locator(".manual-sample-badge").waitFor();
      assert.equal(await page.locator(".manual-sample-badge").textContent(), "サンプル");
      assert.equal(await page.getByRole("link", { name: "サンプルを見る", exact: true }).count(), 0, "existing empty-state entry behavior is preserved");
      const permanent = page.getByRole("button", { name: label, exact: true });
      await permanent.click();
      await page.locator("#cloud-message").filter({ hasText: "サンプルは既に入っています" }).waitFor();
      assert.equal(posts, 3);
      await page.getByRole("button", { name: "手順書一覧", exact: true }).click();
      pending = Promise.withResolvers();
      await permanent.click();
      await page.getByLabel("タイトル", { exact: true }).fill("取り込み待機中の未保存タイトル");
      pending.resolve(); pending = null;
      await page.locator("#cloud-message").filter({ hasText: "編集中の内容を保持しています" }).waitFor();
      assert.equal(await page.getByLabel("タイトル", { exact: true }).inputValue(), "取り込み待機中の未保存タイトル");
      assert.equal(patches, 0);
      assert.equal(posts, 4);
      assert.equal(await page.locator(".manual-sample-badge").textContent(), "サンプル");
      await permanent.click();
      await page.locator("#cloud-message").filter({ hasText: "編集中の変更や処理を完了" }).waitFor();
      assert.equal(posts, 4, "unsaved edits block another import before API calls");
      const showTools = async () => {
        if (width <= 1100 && !await page.locator(".manual-context-tools[data-panel-open=true]").count()) await page.getByRole("button", { name: width <= 760 ? "編集" : "画像・編集", exact: true }).filter({ visible: true }).click();
      };
      await showTools();
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "最新の内容を読み込む", exact: true }).click();
      await page.locator("#cloud-message").filter({ hasText: "手順書を表示しています" }).waitFor();
      await showTools();
      page.once("dialog", dialog => dialog.dismiss());
      await page.getByRole("button", { name: "手順書をアーカイブ", exact: true }).click();
      assert.equal(archives, 0, "cancelling ordinary archive leaves the manual untouched");
      page.once("dialog", dialog => dialog.accept());
      await page.getByRole("button", { name: "手順書をアーカイブ", exact: true }).click();
      await page.locator("#cloud-message").filter({ hasText: "手順書をアーカイブしました" }).waitFor();
      assert.equal(archives, 1);
      assert.equal(await page.locator(".manual-sample-badge").count(), 0);
      assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 2);
      await page.getByRole("button", { name: label, exact: true }).last().click();
      await page.locator("#cloud-message").filter({ hasText: "サンプルをワークスペースに入れました" }).waitFor();
      assert.equal(posts, 5, "ordinary archive allows another explicit import");
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `no page overflow at ${width}`);
      assert.deepEqual(errors, []);
      await page.close();
    }
  } finally { await browser.close(); }
});
