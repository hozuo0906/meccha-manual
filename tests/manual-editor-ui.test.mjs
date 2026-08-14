import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appPath = "apps/worker/src/app-assets.ts";

test("manual navigation and editor states are embedded in the app shell", async () => {
  const source = await readFile(appPath, "utf8");
  for (const snippet of [
    'id="manual-nav-button"',
    'id="manual-create-form"',
    'id="manual-draft-form"',
    'id="manual-step-add-form"',
    'steps.length >= 200',
    '手順は200件までです',
    '作成結果を一覧で確認してください。重ねて作成しないでください。',
    '処理結果を詳細で確認してください。重ねて操作しないでください。',
    '入力した値やパスワードは記録せず',
    '外部AIは使用しません。',
    'function captureManualDetailDrafts',
    'function restoreManualDetailDrafts',
    'restoreManualDetailDrafts(options.restoreDrafts)',
    'preserveDomUntilLoaded: true',
    'requestGeneration !== sessionGeneration'
  ]) {
    assert.match(source, new RegExp(snippet.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("manual UI does not persist manual content or input values in browser storage", async () => {
  const source = await readFile(appPath, "utf8");
  assert.doesNotMatch(source, /localStorage\.(?:setItem|getItem)\([^\n]*(?:manual|step|instruction|targetText)/i);
  assert.doesNotMatch(source, /sessionStorage\.(?:setItem|getItem)\([^\n]*(?:manual|step|instruction|targetText)/i);
  assert.doesNotMatch(source, /name=["']value["']/i);
  assert.doesNotMatch(source, /elements\.value\b/);
});

test("manual mutations preserve drafts and fail closed when edit permission expires", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /const retainedDrafts = captureManualDetailDrafts\(options\.excludeDraftKeys \|\| \[\]\)/);
  assert.match(source, /restoreManualDetailDrafts\(options\.restoreDrafts\)/);
  assert.match(source, /error\.status === 403[\s\S]*canEdit: false[\s\S]*loadManualDetail\(workspaceId, manualId/);
  assert.match(source, /authenticationChannel\?\.addEventListener\("message"[\s\S]*manualRequestSequence \+= 1;[\s\S]*renderAuthenticationReload/);
  assert.doesNotMatch(source, /manualMutationInFlight = true;\n  renderShell\(currentSession\);/);
});

test("viewer and accessible UI contracts remain explicit", async () => {
  const source = await readFile(appPath, "utf8");
  assert.match(source, /現在の権限では閲覧のみ利用できます。/);
  assert.match(source, /aria-live=/);
  assert.match(source, /manual-step-up/);
  assert.match(source, /manual-step-down/);
  assert.match(source, /visually-hidden/);
  assert.match(source, /maxlength="64"/);
  assert.match(source, /maxlength="10000"/);
  assert.match(source, /maxlength="4000"/);
  assert.match(source, /<div role="listitem"><button class="manual-list-item" type="button" data-manual-id=/);
  assert.doesNotMatch(source, /<button[^>]*role="listitem"/);
  assert.match(source, /id="members-heading" tabindex="-1"/);
});

test("Phase 2 browser config runs only the manual editor flow", async () => {
  const config = await readFile("playwright.phase2.config.mjs", "utf8");
  const spec = await readFile("tests/e2e/phase2-manual-editor.spec.mjs", "utf8");
  assert.match(config, /phase2-manual-editor\.spec\.mjs/);
  assert.match(spec, /編集者は手順書作成から手順追加・手修正文保持まで完了できる/);
  assert.match(spec, /別フォームの未保存説明/);
  assert.match(spec, /更新競合を解消してください。/);
  assert.match(spec, /閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない/);
  assert.match(spec, /権限失効時は編集UIを閉じて最新権限を再取得する/);
  assert.match(spec, /編集権限がありません。/);
  assert.match(spec, /横スクロールせずキーボードで移動できる/);
});
