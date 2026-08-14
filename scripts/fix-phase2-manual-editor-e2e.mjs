import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

function replaceOnce(source, find, replacement, label) {
  const index = source.indexOf(find);
  if (index < 0) throw new Error(`Missing replacement target: ${label}`);
  if (source.indexOf(find, index + find.length) >= 0) throw new Error(`Replacement target is not unique: ${label}`);
  return `${source.slice(0, index)}${replacement}${source.slice(index + find.length)}`;
}

let test = await readFile("tests/e2e/phase2-manual-editor.spec.mjs", "utf8");
test = replaceOnce(test, '  await page.getByLabel("タイトル").fill("入会受付手順");', '  await page.locator("#manual-create-title").fill("入会受付手順");', "create title selector");
test = replaceOnce(test, '  await page.getByLabel("説明").fill("受付担当者向け");', '  await page.locator("#manual-create-description").fill("受付担当者向け");', "create description selector");
test = replaceOnce(test, '  await page.getByLabel("見出し").fill("保存する");', '  await page.locator("#new-step-title").fill("保存する");', "new step title selector");
test = replaceOnce(test, '  await page.getByLabel("操作対象").fill("保存ボタン");', '  await page.locator("#new-step-target").fill("保存ボタン");', "new step target selector");
test = replaceOnce(
  test,
  `  await expect(page.getByDisplayValue("［保存ボタン］をクリックします。" )).toBeVisible();

  const instruction = page.getByLabel("手順文").last();
  await instruction.fill("利用者が手修正した文章です。");
  await page.getByLabel("操作対象").last().fill("確定ボタン");`,
  `  const instruction = page.locator(\`#step-instruction-\${firstStepId}\`);
  const target = page.locator(\`#step-target-\${firstStepId}\`);
  await expect(instruction).toHaveValue("［保存ボタン］をクリックします。");

  await instruction.fill("利用者が手修正した文章です。");
  await target.fill("確定ボタン");`,
  "saved step selectors"
);
test = replaceOnce(
  test,
  '  await expect(page.getByDisplayValue("利用者が手修正した文章です。" )).toBeVisible();',
  '  await expect(page.locator(`#step-instruction-${firstStepId}`)).toHaveValue("利用者が手修正した文章です。");',
  "saved instruction assertion"
);
await writeFile("tests/e2e/phase2-manual-editor.spec.mjs", test, "utf8");

let appAssets = await readFile("apps/worker/src/app-assets.ts", "utf8");
const appAssetsModuleUrl = `data:text/javascript;base64,${Buffer.from(appAssets).toString("base64")}`;
const { APP_CSS, APP_JS } = await import(appAssetsModuleUrl);
const assetVersion = `sha256-${createHash("sha256")
  .update(APP_CSS)
  .update("\0")
  .update(APP_JS)
  .digest("hex")
  .slice(0, 16)}`;
appAssets = appAssets.replace(
  /APP_ASSET_VERSION = "[^"]+"/,
  `APP_ASSET_VERSION = "${assetVersion}"`
);
await writeFile("apps/worker/src/app-assets.ts", appAssets, "utf8");
