import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, createHash, randomBytes } from 'node:crypto';
import { chromium } from '@playwright/test';
import { exportJWK, SignJWT } from 'jose';
import worker from '../apps/worker/src/index.ts';

// Replays an exported extension draft through the actual Worker route, D1 schema,
// and R2 adapter used by the local integration harness. It does not use remote I/O.
const root = new URL('../', import.meta.url);
const base = 'https://meccha-manual-staging.meccha-iiyatsu.com';
const issuer = 'https://access.example.invalid';
const jwks = issuer + '/.well-known/jwks.json';

function readOption(name) {
  const index = process.argv.indexOf(name);
  if (index === -1) return null;
  const value = process.argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${name} requires a path`);
  return value;
}

function requiredDraftPath() {
  const value = readOption('--draft')
    ?? process.env.MECCHA_RECORDED_WORKFLOW_DRAFT
    ?? process.env.MECCHA_SIDEPANEL_DRAFT;
  if (!value) throw new Error('A draft path is required via --draft, MECCHA_RECORDED_WORKFLOW_DRAFT, or MECCHA_SIDEPANEL_DRAFT');
  return resolve(process.cwd(), value);
}

const draftPath = requiredDraftPath();
const outputDir = resolve(process.cwd(), process.env.MECCHA_RECORDED_WORKFLOW_OUTPUT_DIR ?? dirname(draftPath));
const source = await readFile(new URL('tests/cloud-manual-c.test.mjs', root), 'utf8');
const classes = source.slice(source.indexOf('class LocalStatement'), source.indexOf('class DetailRaceD1'))
  + source.slice(source.indexOf('class MemoryR2'), source.indexOf('let database;'));
const { LocalD1, MemoryR2 } = Function(classes + ';return {LocalD1,MemoryR2};')();
const database = new DatabaseSync(':memory:');
for (const name of ['0001_d1_identity_workspace.sql', '0002_d1_personal_workspace.sql', '0003_d1_onboarding_bootstrap.sql', '0004_d1_cloud_manual_claim.sql', '0005_d1_share_links.sql', '0006_d1_manual_editor_branding.sql']) {
  database.exec(await readFile(new URL('migrations/' + name, root), 'utf8'));
}
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const publicJwk = { ...await exportJWK(publicKey), kid: 'synthetic-chain', alg: 'RS256', use: 'sig' };
const jwt = await new SignJWT({ type: 'app', sub: 'synthetic-chain-owner' }).setProtectedHeader({ alg: 'RS256', kid: publicJwk.kid }).setIssuer(issuer).setAudience('synthetic-chain').setIssuedAt().setExpirationTime('30m').sign(privateKey);
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url) => { assert.equal(String(url), jwks); return Response.json({ keys: [publicJwk] }); };
const env = { APP_ENV: 'staging', APP_BASE_URL: base, ACCESS_ISSUER: issuer, ACCESS_AUDIENCE: 'synthetic-chain', ACCESS_JWKS_URL: jwks, DB: new LocalD1(database), MANUAL_ASSETS: new MemoryR2(), ONBOARDING_RATE_LIMITER: { limit: async () => ({ success: true }) }, SHARE_AUTH_RATE_LIMITER: { limit: async () => ({ success: true }) }, ASSETS: { fetch: async (request) => {
  const path = new URL(request.url).pathname;
  assert.ok(['/assets/meccha-manual-logo-mark.png', '/assets/meccha-manual-mascot-me-clear-eyes.png'].includes(path));
  return new Response(await readFile(new URL('apps/worker/brand-assets' + path, root)), { headers: { 'content-type': 'image/png' } });
} } };

async function invoke(path, { method = 'GET', body, headers = {}, authenticated = !path.startsWith('/s/') } = {}) {
  const h = new Headers(headers);
  if (authenticated) h.set('Cf-Access-Jwt-Assertion', jwt);
  h.set('origin', base); h.set('cf-connecting-ip', '198.51.100.20');
  if (body !== undefined && !(body instanceof Uint8Array) && typeof body !== 'string') { h.set('content-type', 'application/json'); body = JSON.stringify(body); }
  const request = new Request(base + path, { method, headers: h, body });
  Object.defineProperty(request, 'cf', { value: { colo: 'NRT', asn: 64500 } });
  return worker.fetch(request, env, {});
}

async function json(path, options = {}, expected = 200) {
  const response = await invoke(path, options); const body = await response.json();
  assert.equal(response.status, expected, body.code || 'unexpected route status'); return body;
}

const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
let browser;
try {
  const draft = JSON.parse(await readFile(draftPath, 'utf8'));
  assert.ok(Array.isArray(draft.steps) && draft.steps.length >= 2);
  assert.ok(Array.isArray(draft.screenshots) && draft.screenshots.length >= 2);
  const images = draft.screenshots.map((image) => {
    const match = /^data:(image\/(?:jpeg|png));base64,(.+)$/.exec(image.dataUrl);
    assert.ok(match, 'draft screenshots must contain exported JPEG or PNG bytes');
    return { id: image.id, type: match[1], bytes: Buffer.from(match[2], 'base64') };
  });
  assert.equal(new Set(images.map((image) => digest(image.bytes))).size, images.length, 'step images must differ');
  const boot = await json('/api/onboarding/bootstrap', { method: 'POST', body: { operationId: 'synthetic-chain-bootstrap' } });
  const operationId = 'synthetic-chain-claim';
  const intent = await json('/api/onboarding/claim-intents', { method: 'POST', body: { operationId, assetCount: images.length } }, 201);
  for (const [slot, image] of images.entries()) {
    await json(`/api/onboarding/claim-intents/${intent.claimIntentId}/assets/${slot}`, { method: 'PUT', body: image.bytes, headers: { 'content-type': image.type, 'content-length': String(image.bytes.length), 'x-claim-operation-id': operationId, 'x-asset-sha256': digest(image.bytes), 'x-asset-byte-length': String(image.bytes.length) } });
  }
  const claimed = await json(`/api/onboarding/claims/${intent.claimIntentId}`, { method: 'POST', body: { operationId, manual: { title: '記録した操作の手順書', description: '実際に記録した操作を保存して共有した確認', steps: draft.steps.map((step, i) => ({ type: 'action', title: `操作 ${i + 1}`, instruction: step.instruction || 'ボタンを操作します', actionType: 'click', targetText: null, url: null, assetSlot: images.findIndex((image) => image.id === step.screenshotId) })) }, assets: images.map((image, assetSlot) => ({ assetSlot, sha256: digest(image.bytes) })) } });
  const manualPath = `/api/workspaces/${boot.workspaceId}/manuals/${claimed.manualId}`;
  const detail = await json(manualPath);
  for (const [i, step] of detail.steps.entries()) {
    const image = images.find((candidate) => candidate.id === draft.steps[i].screenshotId);
    assert.equal(digest(Buffer.from(await (await invoke(step.assetUrl)).arrayBuffer())), digest(image.bytes));
  }
  const token = randomBytes(32).toString('base64url');
  const passcode = 'synthetic-only-passcode';
  const shared = await json(manualPath + '/share-links', { method: 'POST', body: { operationId: 'synthetic-chain-share', token, passcode, expiresAt: new Date(Date.now() + 3600000).toISOString(), expectedDraftRevisionId: detail.draft.id, expectedContentVersion: detail.draft.contentVersion, confirmed: true } });
  await mkdir(outputDir, { recursive: true });
  browser = await chromium.launch({ channel: process.platform === 'win32' ? 'chrome' : 'chromium', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  await context.addInitScript(() => { globalThis.syntheticCspViolations = []; document.addEventListener('securitypolicyviolation', (event) => globalThis.syntheticCspViolations.push(event.violatedDirective)); });
  await context.route('**/*', async (route) => {
    const req = route.request(), url = new URL(req.url());
    if (url.origin !== base) { await route.abort(); return; }
    const response = await invoke(url.pathname + url.search, { method: req.method(), headers: req.headers(), body: req.postDataBuffer() ?? undefined });
    await route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: Buffer.from(await response.arrayBuffer()) });
  });
  const page = await context.newPage(); page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(base + '/manuals');
  await page.getByRole('button', { name: '記録した操作の手順書', exact: true }).click();
  await page.waitForFunction((count) => { const images = [...document.querySelectorAll('img.cloud-step-image')]; const brand = [...document.querySelectorAll('img.cloud-brand-logo, img.cloud-brand-mascot')]; return images.length === count && images.every((image) => !image.hidden && image.complete && image.naturalWidth > 300) && brand.length === 2 && brand.every((image) => image.complete && image.naturalWidth > 0); }, images.length);
  await page.screenshot({ path: join(outputDir, 'chain-cloud.png'), fullPage: true });
  assert.deepEqual(await page.evaluate(() => globalThis.syntheticCspViolations), [], 'cloud page must obey actual Worker CSP');
  await page.goto(base + '/s/#token=' + token);
  await page.waitForFunction(() => { const brand = [...document.querySelectorAll("img[src='/s/assets/brand/logo.png'], img[src='/s/assets/brand/mascot.png']")]; return brand.length === 2 && brand.every((image) => image.complete && image.naturalWidth > 0); });
  await page.locator('#share-passcode').fill(passcode); await page.locator('#share-submit').click();
  await page.waitForFunction((count) => { const images = [...document.querySelectorAll('.share-step-image-card img')]; return images.length === count && images.every((image) => !image.hidden && image.complete && image.naturalWidth > 300); }, images.length);
  await page.screenshot({ path: join(outputDir, 'chain-share.png'), fullPage: true });
  assert.deepEqual(await page.evaluate(() => globalThis.syntheticCspViolations), [], 'shared page must obey actual Worker CSP');
  assert.deepEqual(errors, []);
  await json(manualPath + '/share-links', { method: 'DELETE', body: { shareLinkId: shared.shareLinkId } });
  const denied = await invoke('/s/api/resolve', { method: 'POST', headers: { 'X-Share-Token': token }, body: { passcode } }); assert.equal(denied.status, 401);
  const result = { status: 'pass', capturedSteps: draft.steps.length, distinctImages: images.length, cloudImageBytesMatch: true, cloudAndSharedImagesDecoded: true, brandAssetsDecoded: true, revokedShareRejected: true, environment: 'local actual Worker + SQLite D1 adapter + memory R2; synthetic JWT; no remote Access or upload' };
  await writeFile(join(outputDir, 'chain-result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser?.close(); globalThis.fetch = originalFetch; database.close(); }
