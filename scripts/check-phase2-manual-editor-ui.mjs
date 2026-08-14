import { readFile } from "node:fs/promises";

const [app, docs, staticTest, e2e, config, workflow] = await Promise.all([
  readFile("apps/worker/src/app-assets.ts", "utf8"),
  readFile("docs/02-ux/phase2-manual-editor-ui.md", "utf8"),
  readFile("tests/manual-editor-ui.test.mjs", "utf8"),
  readFile("tests/e2e/phase2-manual-editor.spec.mjs", "utf8"),
  readFile("playwright.phase2.config.mjs", "utf8"),
  readFile(".github/workflows/manual-editor-ui.yml", "utf8")
]);

const requiredApp = [
  'id="manual-nav-button"',
  'id="manual-create-form"',
  'id="manual-draft-form"',
  'id="manual-step-add-form"',
  "loadManuals",
  "loadManualDetail",
  "createManualFromUi",
  "updateManualDraftFromUi",
  "addManualStepFromUi",
  "updateManualStepFromUi",
  "deleteManualStepFromUi",
  "reorderManualStepFromUi",
  "manualMutationUnknown",
  "作成結果を一覧で確認してください。重ねて作成しないでください。",
  "処理結果を詳細で確認してください。重ねて操作しないでください。",
  "入力した値やパスワードは記録せず",
  "外部AIは使用しません。"
];
const requiredDocs = [
  "viewerは一覧と詳細を閲覧できる",
  "自動再送せず",
  "localStorage/sessionStorageへ保存しない",
  "保存済みinstruction",
  "幅640px",
  "operation recordingはこの画面から起動せず"
];
const requiredWorkflow = [
  '"apps/worker/src/app-assets.ts"',
  '"docs/02-ux/phase2-manual-editor-ui.md"',
  '"tests/manual-editor-ui.test.mjs"',
  '"tests/e2e/phase2-manual-editor.spec.mjs"',
  "node scripts/check-phase2-manual-editor-ui.mjs",
  "playwright.phase1.config.mjs",
  "playwright.phase2.config.mjs",
  "git diff --check \"origin/${GITHUB_BASE_REF}...HEAD\""
];
const errors = [];
for (const snippet of requiredApp) if (!app.includes(snippet)) errors.push(`Missing manual editor UI contract: ${snippet}`);
for (const snippet of requiredDocs) if (!docs.includes(snippet)) errors.push(`Missing manual editor UX contract: ${snippet}`);
for (const snippet of requiredWorkflow) if (!workflow.includes(snippet)) errors.push(`Missing manual editor workflow contract: ${snippet}`);
if (!staticTest.includes("manual UI does not persist manual content")) errors.push("Missing browser-storage safety regression test");
if (!e2e.includes("閲覧者は手順書と手順を閲覧できるが編集フォームは表示されない")) errors.push("Missing viewer browser flow");
if (!config.includes("phase2-manual-editor.spec.mjs")) errors.push("Phase 2 Playwright config does not select the manual editor spec");

const forbidden = [
  "manualContentStorageKey",
  "manualStepStorageKey",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "BROWSER_RENDERING_API_TOKEN",
  "wrangler deploy"
];
for (const snippet of forbidden) {
  if (`${app}\n${docs}`.includes(snippet)) errors.push(`Forbidden manual editor dependency: ${snippet}`);
}

if (errors.length > 0) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log("Phase 2 manual editor UI, privacy, and browser contracts OK.");
