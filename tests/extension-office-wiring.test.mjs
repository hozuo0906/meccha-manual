import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const read = (path) => readFile(new URL(path, root), "utf8");

test("0.1.9 editor exposes Office actions behind the authenticated cloud gate", async () => {
  const [manifest, editor, html, serviceWorker] = await Promise.all([
    read("apps/extension/manifest.json").then(JSON.parse),
    read("apps/extension/editor/editor.js"),
    read("apps/extension/editor/editor.html"),
    read("apps/extension/background/service-worker.js")
  ]);
  assert.equal(manifest.version, "0.1.9");
  assert.match(html, /header-office-actions/u);
  assert.match(html, /Word・PowerPointファイルをこの端末に保存/u);
  assert.doesNotMatch(html, /<aside id="contextTools"[\s\S]*office-actions/u, "全体出力は画像調整パネルの内側に置かない");
  assert.match(html, /id="exportWord"[^>]*>Wordで書き出す/u);
  assert.match(html, /id="exportPowerPoint"[^>]*>PowerPointで書き出す/u);
  assert.match(editor, /await import\("\.\.\/export\/office-export\.js"\)/u);
  assert.match(editor, /kind: "edited"/u);
  assert.match(editor, /drawScreenshot\(canvas\.getContext\("2d"\), image, screenshot\)/u);
  assert.match(editor, /canonicalDraftJson/u);
  assert.match(editor, /openOutput\("office", "docx"\)/u);
  assert.match(editor, /openOutput\("office", "pptx"\)/u);
  assert.match(editor, /ログインして\$\{officeFormat === "docx" \? "Word" : "PowerPoint"\}を書き出す/u);
  assert.doesNotMatch(editor, /authenticatedCloudReference/u, "a stale cloudRef is not an authentication proof");
  assert.match(editor, /persisted completed record is only a recovery hint/u);
  assert.match(serviceWorker, /metadata\.expiresAt !== ready\.expiresAt[\s\S]*Date\.parse\(metadata\.expiresAt\) <= Date\.now\(\)/u);
  assert.match(serviceWorker, /chrome\.tabs\.query\(\{\}\)/u);
  assert.match(serviceWorker, /chrome\.tabs\.update\(existing\.id, \{ active: true \}\)/u);
  assert.match(editor, /officeDraftContent\(draft, title\.value, description\.value\) !== exportContent/u);
  assert.match(editor, /office-image-failed/u);
  assert.match(editor, /手順\$\{step\[1\]\}の説明を入力してから再試行してください/u);
  assert.match(editor, /手順は200件以内にしてから再試行してください/u);
  assert.match(editor, /認証済みワークスペースへの保存を確認しました。共有設定は変更していません/u);
});

test("editor Office wiring refuses silent image loss and guards a changed snapshot", async () => {
  const editor = await read("apps/extension/editor/editor.js");
  assert.match(editor, /pendingImages\.size \|\| unresolvedSteps\(\)\.length/u);
  assert.match(editor, /fingerprintDraft\(draft\)/gu);
  assert.match(editor, /office-export-changed/u);
  assert.doesNotMatch(editor, /image:\s*screenshot\.dataUrl/u);
  assert.match(editor, /run\.outputAction === "office"/u);
  assert.match(editor, /clearOfficeIntentForRun\(run\)/u);
  assert.match(editor, /current\?\.handoffId === run\.handoffId/u);
});

test("replacement mode has a keyboard range action and keeps synthetic text guidance visible", async () => {
  const editor = await read("apps/extension/editor/image-editor.js");
  assert.match(editor, /textContent = "範囲を追加"/u);
  assert.match(editor, /event\.key === "Enter" && tool === "replacement"/u);
  assert.match(editor, /矢印キーで移動し/u);
  assert.match(editor, /置き換える種別/u);
  assert.match(editor, /replacementAddButton\.focus/u);
});
