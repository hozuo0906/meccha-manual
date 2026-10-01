import { EDITOR_TOOLS_JS } from "./editor-tools-assets.ts";
import { readStoredManualAnnotations } from "./manual-annotations.ts";
import { ManualBrandingRepository } from "./infra/d1/manual-branding-repository.ts";
import { AccessIdentityError, authenticateApplicationRequest, type ApplicationIdentityRepository } from "./access-identity.ts";
import { D1IdentityRepository } from "./infra/d1/identity-repository.ts";
import { D1RepositoryError } from "./infra/d1/d1-errors.ts";
import { changed, type D1DatabaseLike } from "./infra/d1/d1-types.ts";
import { inspectAppRuntimeConfig, type AccessBindings, type AppRuntimeBindings } from "./server-config.ts";
import { derivePasscodeHash, nowIso, randomSecret, sha256Hex, validatePasscode, validateSecret, verifyPasscode, PASSCODE_MAX_LENGTH, PASSCODE_MIN_LENGTH, SHARE_GRANT_BYTES, SHARE_TOKEN_BYTES } from "./share-link-crypto.ts";

export interface ShareLinkEnv extends AccessBindings, AppRuntimeBindings {
  DB?: D1DatabaseLike;
  MANUAL_ASSETS?: R2Bucket;
  SHARE_AUTH_RATE_LIMITER?: RateLimit;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store, private",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "content-security-policy": "default-src 'self'; base-uri 'none'; connect-src 'self'; frame-ancestors 'none'; form-action 'self'; img-src 'self' blob:; script-src 'self'; style-src 'self'"
};
const TOKEN_HEADER = "x-share-token";
const GRANT_HEADER = "x-share-grant";
const MAX_BODY_BYTES = 16 * 1024;
const MAX_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_GRANT_MS = 15 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const OPERATION = /^[A-Za-z0-9_-]{16,128}$/u;

class ShareError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) { super(message); this.status = status; this.code = code; }
}

function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  const merged = new Headers(JSON_HEADERS);
  new Headers(headers).forEach((value, key) => merged.set(key, value));
  return new Response(JSON.stringify(body), { status, headers: merged });
}

function html(body: string): Response {
  return new Response(body, { status: 200, headers: { ...JSON_HEADERS, "content-type": "text/html; charset=utf-8" } });
}

function errorResponse(error: unknown): Response {
  if (error instanceof ShareError) return json({ code: error.code, message: error.message }, error.status);
  if (error instanceof AccessIdentityError) return json({ code: error.code, message: "認証を確認できませんでした。" }, error.status);
  if (error instanceof D1RepositoryError) {
    const status = error.code === "conflict" ? 409 : error.code === "not_found" ? 404 : error.code === "forbidden" || error.code === "actor_forbidden" ? 403 : 503;
    return json({ code: status === 409 ? "SHARE_CONFLICT" : status === 403 ? "ACCESS_FORBIDDEN" : status === 404 ? "SHARE_NOT_FOUND" : "SHARE_UNAVAILABLE", message: "共有設定を完了できませんでした。時間をおいて、もう一度お試しください。" }, status);
  }
  return json({ code: "SHARE_UNAVAILABLE", message: "共有設定を完了できませんでした。時間をおいて、もう一度お試しください。" }, 503);
}

function db(env: ShareLinkEnv): D1DatabaseLike {
  if (!env.DB) throw new ShareError(503, "SHARE_MIGRATION_IN_PROGRESS", "共有機能は移行中のため、現在利用できません。");
  return env.DB;
}

function id(value: unknown, code = "RESOURCE_ID_INVALID"): string {
  if (typeof value !== "string" || !UUID.test(value)) throw new ShareError(400, code, "識別子を確認してください。");
  return value.toLowerCase();
}

function operation(value: unknown): string {
  if (typeof value !== "string" || !OPERATION.test(value)) throw new ShareError(400, "OPERATION_ID_INVALID", "操作IDを確認してください。");
  return value;
}

async function readJson(request: Request): Promise<Record<string, unknown>> {
  if ((request.headers.get("content-type") ?? "").split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new ShareError(415, "JSON_CONTENT_TYPE_REQUIRED", "Content-Typeはapplication/jsonにしてください。");
  const length = Number(request.headers.get("content-length") ?? "0");
  if (length > MAX_BODY_BYTES) throw new ShareError(413, "JSON_BODY_TOO_LARGE", "入力が大きすぎます。");
  if (!request.body) throw new ShareError(400, "JSON_BODY_REQUIRED", "JSON本文を指定してください。");
  const reader = request.body.getReader(); const chunks: Uint8Array[] = []; let total = 0;
  try {
    while (true) {
      const next = await reader.read(); if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BODY_BYTES) { await reader.cancel("json too large").catch(() => undefined); throw new ShareError(413, "JSON_BODY_TOO_LARGE", "入力が大きすぎます。"); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  const text = new TextDecoder().decode(bytes);
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new ShareError(400, "INVALID_JSON", "入力形式を確認してください。"); }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ShareError(400, "JSON_OBJECT_REQUIRED", "入力形式を確認してください。");
  return value as Record<string, unknown>;
}

function assertSameOrigin(request: Request, env: ShareLinkEnv): void {
  const origin = request.headers.get("origin");
  const config = inspectAppRuntimeConfig(env).config;
  if (!origin || !config || origin !== config.baseUrl || new URL(request.url).origin !== config.baseUrl) throw new ShareError(403, "ORIGIN_MISMATCH", "同一サイトからの操作だけを受け付けます。");
}

async function actor(request: Request, env: ShareLinkEnv): Promise<{ actorId: string; database: D1DatabaseLike }> {
  const database = db(env);
  let auth;
  try { auth = await authenticateApplicationRequest(request, env, new D1IdentityRepository(database) as ApplicationIdentityRepository); } catch (error) {
    if (error instanceof AccessIdentityError) throw error;
    throw new ShareError(503, "ACCESS_IDENTITY_UNAVAILABLE", "認証を確認できません。時間をおいて、もう一度お試しください。");
  }
  if (auth.kind !== "application_user") throw new ShareError(403, "ACCESS_FORBIDDEN", "この操作を行う権限がありません。");
  return { actorId: auth.identity.applicationId, database };
}

async function ensureManager(database: D1DatabaseLike, actorId: string, workspaceId: string, manualId: string): Promise<"owner" | "admin" | "editor"> {
  const row = await database.prepare(`SELECT wm.role FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id JOIN manuals m ON m.workspace_id = wm.workspace_id WHERE wm.workspace_id = ?1 AND wm.application_id = ?2 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') AND i.status = 'active' AND w.status = 'active' AND m.id = ?3 AND m.archived_at IS NULL LIMIT 1`).bind(workspaceId, actorId, manualId).first<{ role: "owner" | "admin" | "editor" }>();
  if (!row) throw new ShareError(403, "ACCESS_FORBIDDEN", "この操作を行う権限がありません。");
  return row.role;
}

function expiry(value: unknown, now: string): string {
  if (value === undefined) throw new ShareError(400, "SHARE_EXPIRY_REQUIRED", "共有期限を指定してください。");
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) throw new ShareError(400, "SHARE_EXPIRY_INVALID", "共有期限を確認してください。");
  const parsed = Date.parse(value);
  const base = Date.parse(now);
  if (parsed <= base || parsed > base + MAX_EXPIRY_MS) throw new ShareError(400, "SHARE_EXPIRY_INVALID", "共有期限は30日以内で指定してください。");
  return new Date(parsed).toISOString();
}

function shareViewerHtml(): string {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>共有された手順書 | めっちゃマニュアル</title><link rel="stylesheet" href="/s/assets/share.css"></head><body><main id="share-viewer" class="share-shell"><header class="share-brand"><img src="/s/assets/brand/logo.png" alt="めっちゃマニュアル"><div><p class="share-kicker">めっちゃマニュアル</p><h1>共有された手順書</h1></div><img class="share-mascot" src="/s/assets/brand/mascot.png" alt="めっちゃマニュアルのキャラクター"></header><p id="share-message" role="status" aria-live="polite">共有リンクを確認しています。</p><section id="share-auth" hidden><label for="share-passcode">パスコード</label><input id="share-passcode" type="password" minlength="${PASSCODE_MIN_LENGTH}" maxlength="256" autocomplete="off"><button id="share-submit" type="button">手順書を表示</button></section><article id="share-content" hidden></article></main><script src="/s/assets/editor-tools.js" defer></script><script src="/s/assets/share.js" defer></script></body></html>`;
}

const SHARE_CSS = `html{scroll-behavior:smooth;scroll-padding-top:84px}body{margin:0;background:#f2f6f7}button:focus-visible,a:focus-visible,input:focus-visible{outline:3px solid #117bce;outline-offset:3px}.reader-layout{display:grid;grid-template-columns:220px minmax(0,1fr);gap:32px;align-items:start}.reader-toc{position:sticky;top:24px;max-height:calc(100vh - 48px);overflow:auto}.reader-toc h2{font-size:14px;margin:0 0 14px}.reader-toc ol{list-style:none;padding:0;margin:0;display:grid;gap:6px}.reader-toc a{display:block;color:#183039;text-decoration:none;min-height:44px;padding:10px 12px;box-sizing:border-box;border:1px solid transparent;border-radius:8px;line-height:1.5;font-size:14px}.reader-toc a[aria-current=step]{background:#e5f4f2;border-color:var(--reader-accent,#087f7a);font-weight:700}.reader-progress{font-size:13px;color:#5c7077;margin:12px 0}.reader-team-logo{max-width:180px!important;max-height:64px;object-fit:contain;object-position:left;margin:0 0 20px!important;padding:4px;box-sizing:border-box;background:white}.reader-document-header{border-top:5px solid var(--reader-accent,#087f7a);padding:24px 0 20px}.reader-document-header h2{font-size:clamp(24px,3vw,34px);line-height:1.4;margin:0}.reader-print{min-height:44px;background:white;border:1px solid #789099;border-radius:8px;padding:8px 16px;color:#183039;font:inherit}.reader-print:disabled{opacity:.5}.share-step{scroll-margin-top:24px}.share-step>p{white-space:pre-wrap}.reader-print-note{font-size:12px;color:#5c7077}.reader-toc summary{display:none}@media(max-width:760px){.reader-layout{display:block}.reader-toc{position:sticky;top:0;z-index:3;background:#fff;border:1px solid #d7e2e5;border-radius:8px;padding:8px 12px;max-height:60vh;margin-bottom:20px}.reader-toc summary{display:block;min-height:44px;line-height:44px;cursor:pointer;font-weight:700}.reader-toc:not([open]) ol,.reader-toc:not([open]) h2{display:none}.reader-toc .reader-progress{margin:0}.reader-document-header{padding:20px 0}.reader-print{margin:12px 0}.reader-toc h2{display:none}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}@media print{body{background:#fff}.share-brand,#share-message,#share-auth,.reader-toc,.reader-print,.reader-print-note{display:none!important}.share-shell{padding:0!important;max-width:none!important;background:#fff!important}.reader-layout{display:block}.share-step{break-inside:avoid;page-break-inside:avoid}.share-step-image-card{border:0!important;padding:0!important;background:#fff!important}#share-content{border:0!important;box-shadow:none!important;padding:0!important}.reader-document-header{border-top-color:var(--reader-accent,#087f7a)!important;print-color-adjust:exact}.share-step-image-card img{max-height:660px!important}.share-image-error,.share-image-status{color:#000}}
.share-shell{box-sizing:border-box;max-width:1240px;margin:0 auto;padding:24px 16px;font:16px/1.7 system-ui,sans-serif;color:#20282e;background:#f3fbfa;min-height:100vh}.share-brand{display:flex;align-items:center;gap:14px;padding:12px 16px 20px;background:#fff;border:1px solid #b6deda;border-radius:16px;box-shadow:0 8px 24px #204a4420}.share-brand>img:first-child{width:58px;height:58px;object-fit:contain}.share-brand h1{margin:0;font-size:clamp(1.5rem,4vw,2.15rem)}.share-kicker{margin:0;color:#087f7a;font-weight:700}.share-mascot{width:80px;height:80px;object-fit:contain;margin-left:auto}.share-shell>h1{font-size:clamp(1.4rem,4vw,2rem)}#share-message{padding:12px 0;color:#46555b}#share-auth{display:grid;gap:10px;max-width:420px;padding:18px;background:#fff;border:1px solid #b6deda;border-radius:12px}#share-auth[hidden],#share-content[hidden],#share-content [hidden]{display:none!important}#share-auth input{min-height:44px;padding:8px;border:1px solid #9abbb8;border-radius:6px}#share-auth button{min-height:44px;padding:8px 16px;border:0;border-radius:6px;background:#087f7a;color:#fff;font-weight:700}#share-content{margin-top:18px;background:#fff;border:1px solid #b6deda;border-radius:14px;padding:18px 20px;box-shadow:0 8px 24px #204a4420}#share-content>h2{margin-top:0}#share-content img{max-width:100%;height:auto;display:block;margin:12px auto;border-radius:8px}.share-step{padding:20px 0;border-top:1px solid #b6deda}.share-step h3{margin:0 0 8px}.share-step-image-card{margin-top:14px;padding:16px;border:1px solid #b6deda;border-radius:10px;background:#f7fffd}.share-step-image-card img{width:100%;max-height:600px;object-fit:contain;margin:8px auto}.share-image-status,.share-image-error,.share-image-empty{margin:0;color:#52666a}.share-image-error{color:#a3362b}.share-image-retry{min-height:44px;margin-top:8px;padding:7px 14px;border:1px solid #087f7a;border-radius:7px;background:#e9faf7;color:#126b5c;font-weight:700;cursor:pointer}.share-note{color:#52666a}@media(max-width:560px){.share-brand{padding:10px 12px}.share-mascot{width:58px;height:58px}.share-brand>img:first-child{width:48px;height:48px}#share-content{padding:14px}}`;

const SHARE_JS = `(() => {
  const message = document.querySelector('#share-message');
  const auth = document.querySelector('#share-auth');
  const passcode = document.querySelector('#share-passcode');
  const submit = document.querySelector('#share-submit');
  const content = document.querySelector('#share-content');
  const token = location.hash.startsWith('#token=') ? location.hash.slice(7) : '';
  let grant = '';
  const objectUrls = [];
  const setMessage = (value) => { message.textContent = value; };
  const validSecret = (value) => /^[A-Za-z0-9_-]{43}$/.test(value);
  async function request(path, init = {}) {
    const headers = { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) };
    const response = await fetch(path, { ...init, headers, credentials: 'same-origin', cache: 'no-store' });
    let body = null; try { body = await response.json(); } catch {}
    if (!response.ok) { const error = new Error(body?.message || '共有内容を表示できません。'); error.status = response.status; throw error; }
    return body;
  }
  let imagePending=0, imageFailures=0, printButton=null;
  const updatePrint=()=>{if(printButton)printButton.disabled=imagePending>0||imageFailures>0;};
  async function loadImage(image, assetId, status, error, retry, annotations=[]) {
    if(image.dataset.failed==="true"){imageFailures--;delete image.dataset.failed;}imagePending++;updatePrint();
    image.hidden = true; status.hidden = false; error.hidden = true; retry.hidden = true;
    try {
      const response = await fetch('/s/api/assets/' + encodeURIComponent(assetId), { headers: { Accept: 'image/*', 'X-Share-Grant': grant }, credentials: 'same-origin', cache: 'no-store' });
      if (!response.ok) { const failure = new Error('asset unavailable'); failure.status = response.status; throw failure; }
      const url = URL.createObjectURL(await response.blob()); objectUrls.push(url); image.src = url;
      await image.decode();
      if(annotations.length){if(!globalThis.MecchaImageTools)throw new Error('renderer unavailable');const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight;MecchaImageTools.drawScreenshot(canvas.getContext('2d'),image,{annotations,masks:[]});const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw new Error('render failed');const rendered=URL.createObjectURL(blob);objectUrls.push(rendered);image.src=rendered;await image.decode();}
      status.hidden = true; image.hidden = false;
    } catch (failure) {
      imageFailures++;image.dataset.failed='true';status.hidden = true; error.textContent = failure?.status === 401 ? '共有期限が切れているか、共有権限を確認できません。共有元に確認してください。' : '画像を読み込めませんでした。もう一度お試しください。'; error.hidden = false; retry.hidden = false;
    }finally{imagePending--;updatePrint();}
  }
  function render(data) {
    content.replaceChildren();imagePending=0;imageFailures=0;
    const color=/^#[0-9a-f]{6}$/i.test(data.branding?.themeColor||'')?data.branding.themeColor:'#087f7a';content.style.setProperty('--reader-accent',color);
    const layout=document.createElement('div');layout.className='reader-layout';const toc=document.createElement('details');toc.className='reader-toc';toc.open=innerWidth>760;const summary=document.createElement('summary');summary.textContent='手順一覧';const tocHeading=document.createElement('h2');tocHeading.textContent='この手順書の内容';const links=document.createElement('ol');const progress=document.createElement('p');progress.className='reader-progress';progress.textContent='全 '+(data.steps||[]).length+' 手順';toc.append(summary,tocHeading,links,progress);
    const documentBody=document.createElement('div');documentBody.className='reader-document';const documentHeader=document.createElement('header');documentHeader.className='reader-document-header';const title = document.createElement('h2'); title.textContent = data.title || '手順書'; documentHeader.append(title);documentBody.append(documentHeader);layout.append(toc,documentBody);content.append(layout);
    if(data.branding?.logoId){imagePending++;const logo=document.createElement('img');logo.className='reader-team-logo';logo.alt='チームのロゴ';logo.hidden=true;documentHeader.prepend(logo);fetch('/s/api/logos/'+encodeURIComponent(data.branding.logoId),{headers:{'X-Share-Grant':grant},credentials:'same-origin',cache:'no-store'}).then(async response=>{if(!response.ok)throw new Error('logo unavailable');const url=URL.createObjectURL(await response.blob());objectUrls.push(url);logo.src=url;await logo.decode();logo.hidden=false;}).catch(()=>{imageFailures++;const warning=document.createElement('p');warning.className='share-image-error';warning.textContent='チームのロゴを読み込めませんでした。手順書を開き直してください。';documentHeader.append(warning);}).finally(()=>{imagePending--;updatePrint();});}
    printButton=document.createElement('button');printButton.type='button';printButton.className='reader-print';printButton.textContent='PDF / 印刷';printButton.disabled=true;printButton.addEventListener('click',()=>{if(!imagePending&&!imageFailures)window.print();});const printNote=document.createElement('p');printNote.className='reader-print-note';printNote.textContent='すべての画像を読み込むと、PDF・印刷できます。';documentHeader.append(printButton,printNote);
    const observer=new IntersectionObserver(entries=>{const visible=entries.filter(entry=>entry.isIntersecting).sort((a,b)=>a.boundingClientRect.top-b.boundingClientRect.top)[0];if(!visible)return;const index=Number(visible.target.dataset.index);progress.textContent='いま '+(index+1)+' / '+data.steps.length+' 手順';links.querySelectorAll('a').forEach((link,i)=>link.setAttribute('aria-current',i===index?'step':'false'));},{rootMargin:'-10% 0px -60% 0px'});

    if (data.description) { const description = document.createElement('p'); description.textContent = data.description; documentHeader.insertBefore(description,printButton); }
    for (const [index, step] of (data.steps || []).entries()) {
      const item = document.createElement('section'); item.className = 'share-step'; item.setAttribute('aria-labelledby', 'share-step-' + (index + 1)); const heading = document.createElement('h3'); heading.id = 'share-step-' + (index + 1); heading.textContent = '手順 ' + (index + 1) + '：' + (step.title || '手順'); item.append(heading);item.id='reader-step-'+(index+1);item.dataset.index=String(index);const li=document.createElement('li'),link=document.createElement('a');link.href='#'+item.id;link.textContent=(index+1)+'  '+(step.title||'手順');link.setAttribute('aria-current',index===0?'step':'false');link.addEventListener('click',event=>{event.preventDefault();if(innerWidth<=760)toc.open=false;item.scrollIntoView({block:'start'});heading.tabIndex=-1;heading.focus({preventScroll:true});});li.append(link);links.append(li);observer.observe(item); const text = document.createElement('p'); text.textContent = step.instruction || ''; item.append(text);
      if (step.assetId) {
        const card = document.createElement('div'); card.className = 'share-step-image-card'; const status = document.createElement('p'); status.className = 'share-image-status'; status.textContent = '画像を読み込んでいます…'; const error = document.createElement('p'); error.className = 'share-image-error'; error.hidden = true; const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'share-image-retry'; retry.textContent = '画像をもう一度読み込む'; retry.hidden = true; const image = document.createElement('img'); image.alt = '手順の画像'; image.loading = 'eager'; retry.addEventListener('click', () => loadImage(image, step.assetId, status, error, retry, step.annotations||[])); card.append(status, error, retry, image); item.append(card); loadImage(image, step.assetId, status, error, retry, step.annotations||[]);
      } else {
        const empty = document.createElement('p'); empty.className = 'share-image-empty'; empty.textContent = 'この手順には画像がありません。'; item.append(empty);
      }
      documentBody.append(item);
    }
    updatePrint();
  }
  async function start() {
    if (!validSecret(token)) { setMessage('共有リンクを確認できません。'); return; }
    auth.hidden = false; setMessage('パスコードを入力してください。');
    submit.addEventListener('click', async () => { submit.disabled = true; try { const result = await request('/s/api/resolve', { method: 'POST', headers: { 'X-Share-Token': token }, body: JSON.stringify({ passcode: passcode.value }) }); grant = result.grant; history.replaceState(null, '', location.pathname); setMessage('共有された手順書を表示しています。'); const data = await request('/s/api/content', { method: 'POST', headers: { 'X-Share-Grant': grant }, body: '{}' }); render(data); content.hidden = false; auth.hidden = true; } catch (failure) { setMessage(failure.status === 429 ? '試行回数が多いため、時間をおいてください。' : '共有リンクまたはパスコードを確認してください。'); } finally { submit.disabled = false; } });
  }
  passcode.addEventListener('keydown',event=>{if(event.key==='Enter'&&!submit.disabled)submit.click();});
  addEventListener('pagehide', () => objectUrls.splice(0).forEach((url) => URL.revokeObjectURL(url))); start();
})();`;

async function rateLimit(request: Request, env: ShareLinkEnv, tokenHash: string): Promise<void> {
  if (!env.SHARE_AUTH_RATE_LIMITER) throw new ShareError(503, "SHARE_RATE_LIMIT_UNAVAILABLE", "共有確認を一時停止しています。");
  const ip = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim() ?? "unknown";
  const ipHash = await sha256Hex(ip);
  const [ipResult, linkResult] = await Promise.all([
    env.SHARE_AUTH_RATE_LIMITER.limit({ key: `ip:${ipHash}` }),
    env.SHARE_AUTH_RATE_LIMITER.limit({ key: `link:${tokenHash}` })
  ]);
  if (!ipResult.success || !linkResult.success) throw new ShareError(429, "SHARE_RATE_LIMITED", "試行回数が多いため、時間をおいてください。");
}

interface ShareRow { id: string; workspace_id: string; manual_id: string; published_revision_id: string; source_draft_revision_id: string; source_content_version: string; token_hash: string; passcode_salt: string; passcode_hash: string; expires_at: string; revoked_at: string | null; created_by: string; operation_id: string; }
interface GrantRow { id: string; share_link_id: string; token_hash: string; workspace_id: string; manual_id: string; published_revision_id: string; expires_at: string; }

async function createShare(request: Request, env: ShareLinkEnv, workspaceId: string, manualId: string): Promise<Response> {
  assertSameOrigin(request, env);
  const { actorId, database } = await actor(request, env);
  await ensureManager(database, actorId, workspaceId, manualId);
  const body = await readJson(request);
  if (Object.keys(body).some((key) => !["operationId", "token", "passcode", "expiresAt", "expectedDraftRevisionId", "expectedContentVersion", "confirmed"].includes(key))) throw new ShareError(400, "INPUT_INVALID", "指定できない項目が含まれています。");
  if (body.confirmed !== true) throw new ShareError(400, "SHARE_CONFIRMATION_REQUIRED", "共有する内容を確認してから作成してください。");
  const operationId = operation(body.operationId);
  let token: string; let passcode: string;
  try { token = validateSecret(body.token, SHARE_TOKEN_BYTES); passcode = validatePasscode(body.passcode); } catch { throw new ShareError(400, "SHARE_SECRET_INVALID", "共有情報を確認してください。"); }
  const now = nowIso();
  const expiresAt = expiry(body.expiresAt, now);
  const expectedDraftRevisionId = id(body.expectedDraftRevisionId, "MANUAL_DRAFT_VERSION_INVALID");
  if (typeof body.expectedContentVersion !== "string" || !/^[0-9a-f]{32}$/u.test(body.expectedContentVersion)) throw new ShareError(400, "MANUAL_DRAFT_VERSION_INVALID", "下書きの版を確認してください。");
  const tokenHash = await sha256Hex(token);
  const existing = await database.prepare(`SELECT s.id, s.workspace_id, s.manual_id, s.published_revision_id, s.source_draft_revision_id, s.source_content_version, s.token_hash, s.passcode_salt, s.passcode_hash, s.expires_at, s.revoked_at, s.created_by, s.operation_id FROM share_links s JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.application_id = ?3 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') JOIN identities i ON i.application_id = wm.application_id AND i.status = 'active' JOIN workspaces w ON w.id = s.workspace_id AND w.status = 'active' WHERE s.workspace_id = ?1 AND s.manual_id = ?2 AND s.created_by = ?3 AND s.operation_id = ?4 LIMIT 1`).bind(workspaceId, manualId, actorId, operationId).first<ShareRow>();
  if (existing) {
    if (existing.token_hash !== tokenHash || existing.revoked_at || existing.source_draft_revision_id !== expectedDraftRevisionId || existing.source_content_version !== body.expectedContentVersion || existing.expires_at !== expiresAt || !(await verifyPasscode(passcode, existing.passcode_salt, existing.passcode_hash))) throw new ShareError(409, "SHARE_OPERATION_CONFLICT", "同じ共有操作へ別の内容は送信できません。");
    return json({ shareLinkId: existing.id, expiresAt: existing.expires_at, permission: "read_only", viewerPath: "/s/", reused: true });
  }
  const draft = await database.prepare(`SELECT m.current_draft_revision_id AS draft_id, r.title, r.description, r.content_version, r.updated_at, COALESCE((SELECT json_group_array(json_object('id', s.id, 'position', s.position, 'type', s.type, 'title', s.title, 'instruction', s.instruction, 'actionType', s.action_type, 'targetText', s.target_text, 'url', s.url, 'assetId', s.asset_id, 'annotations', json(s.annotation))) FROM (SELECT * FROM manual_steps WHERE revision_id = m.current_draft_revision_id AND workspace_id = m.workspace_id AND deleted_at IS NULL ORDER BY position ASC, id ASC LIMIT 201) s), '[]') AS steps_json FROM manuals m JOIN manual_revisions r ON r.id = m.current_draft_revision_id AND r.manual_id = m.id AND r.workspace_id = m.workspace_id AND r.state = 'draft' JOIN workspace_members wm ON wm.workspace_id = m.workspace_id AND wm.application_id = ?3 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') JOIN identities i ON i.application_id = wm.application_id AND i.status = 'active' JOIN workspaces w ON w.id = m.workspace_id AND w.status = 'active' WHERE m.id = ?2 AND m.workspace_id = ?1 AND m.archived_at IS NULL LIMIT 1`).bind(workspaceId, manualId, actorId).first<{ draft_id: string; title: string; description: string; content_version: string; updated_at: string; steps_json: string }>();
  if (!draft || draft.draft_id !== expectedDraftRevisionId || draft.content_version !== body.expectedContentVersion) throw new ShareError(409, "MANUAL_DRAFT_CHANGED", "下書きが更新されています。最新の内容を確認してから作成してください。");
  const parsedSteps: Array<Record<string, unknown>> = (JSON.parse(draft.steps_json) as Array<Record<string, unknown>>).map((step) => ({ ...step, annotations: readStoredManualAnnotations(step.annotations) }));
  if (parsedSteps.length > 200) throw new ShareError(409, "MANUAL_SNAPSHOT_INVALID", "共有する手順書を確認できません。");
  const assetIds = [...new Set(parsedSteps.map((step) => typeof step.assetId === "string" ? step.assetId : null).filter((value): value is string => Boolean(value)))];
  if (assetIds.length > 0) {
    const assets = await database.prepare(`SELECT DISTINCT a.id FROM assets a WHERE a.workspace_id = ?2 AND a.bucket = 'MANUAL_ASSETS' AND a.kind = 'manual_image' AND a.id IN (SELECT value FROM json_each(?3)) AND (EXISTS (SELECT 1 FROM claim_assets ca JOIN claim_intents ci ON ci.id = ca.claim_intent_id WHERE ca.asset_id = a.id AND ca.status = 'completed' AND ci.status = 'completed' AND ci.manual_id = ?1 AND ci.workspace_id = ?2) OR EXISTS (SELECT 1 FROM manual_edit_assets ea WHERE ea.id = a.id AND ea.workspace_id = ?2 AND ea.manual_id = ?1 AND ea.status = 'ready'))`).bind(manualId, workspaceId, JSON.stringify(assetIds)).all<{ id: string }>();
    if (new Set(assets.results.map((row) => row.id)).size !== assetIds.length) throw new ShareError(409, "MANUAL_SNAPSHOT_INVALID", "共有する画像を確認できません。");
  }
  const snapshotSteps = parsedSteps.map((step) => ({ ...step, id: crypto.randomUUID() }));
  const revisionId = crypto.randomUUID(); const shareId = crypto.randomUUID(); const salt = randomSecret(16); const passcodeHash = await derivePasscodeHash(passcode, salt); const createdAt = now;
  const statements = [
    database.prepare(`UPDATE manual_revisions SET updated_at = updated_at WHERE id = ?1 AND manual_id = ?2 AND workspace_id = ?3 AND state = 'draft' AND content_version = ?4 AND EXISTS (SELECT 1 FROM manuals m WHERE m.id = ?2 AND m.workspace_id = ?3 AND m.current_draft_revision_id = ?1 AND m.archived_at IS NULL) AND EXISTS (SELECT 1 FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id WHERE wm.workspace_id = ?3 AND wm.application_id = ?5 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') AND i.status = 'active' AND w.status = 'active')`).bind(expectedDraftRevisionId, manualId, workspaceId, body.expectedContentVersion, actorId),
    database.prepare(`UPDATE manual_revisions SET state = 'superseded', updated_at = ?1 WHERE manual_id = ?2 AND workspace_id = ?3 AND state = 'published' AND NOT EXISTS (SELECT 1 FROM share_links sl WHERE sl.manual_id = ?2 AND sl.revoked_at IS NULL) AND EXISTS (SELECT 1 FROM manual_revisions d WHERE d.id = ?4 AND d.manual_id = ?2 AND d.workspace_id = ?3 AND d.state = 'draft' AND d.content_version = ?5)`).bind(createdAt, manualId, workspaceId, expectedDraftRevisionId, body.expectedContentVersion),
    database.prepare(`INSERT INTO manual_revisions (id, workspace_id, manual_id, revision_no, state, title, description, content_version, created_at, updated_at, branding_version_id) SELECT ?1, ?2, ?3, (SELECT COALESCE(MAX(revision_no), 0) + 1 FROM manual_revisions WHERE manual_id = ?3 AND workspace_id = ?2), 'superseded', ?4, ?5, lower(hex(randomblob(16))), ?6, ?6, (SELECT branding_version_id FROM manual_revisions WHERE id = ?7 AND workspace_id = ?2) WHERE EXISTS (SELECT 1 FROM manual_revisions d WHERE d.id = ?7 AND d.manual_id = ?3 AND d.workspace_id = ?2 AND d.state = 'draft' AND d.content_version = ?8)`).bind(revisionId, workspaceId, manualId, draft.title, draft.description, createdAt, expectedDraftRevisionId, body.expectedContentVersion),
    database.prepare(`INSERT INTO manual_steps (id, workspace_id, revision_id, position, type, title, instruction, action_type, target_text, url, asset_id, annotation, masking, created_at, updated_at) SELECT json_extract(item.value, '$.id'), ?1, ?2, CAST(json_extract(item.value, '$.position') AS INTEGER), json_extract(item.value, '$.type'), json_extract(item.value, '$.title'), json_extract(item.value, '$.instruction'), json_extract(item.value, '$.actionType'), json_extract(item.value, '$.targetText'), json_extract(item.value, '$.url'), json_extract(item.value, '$.assetId'), json_extract(item.value, '$.annotations'), '{}', ?3, ?3 FROM json_each(?4) AS item WHERE EXISTS (SELECT 1 FROM manual_revisions d WHERE d.id = ?5 AND d.manual_id = ?6 AND d.workspace_id = ?1 AND d.state = 'draft' AND d.content_version = ?7)`).bind(workspaceId, revisionId, createdAt, JSON.stringify(snapshotSteps), expectedDraftRevisionId, manualId, body.expectedContentVersion),
    database.prepare(`UPDATE manual_revisions SET state = 'published', updated_at = ?1 WHERE id = ?2 AND manual_id = ?3 AND workspace_id = ?4 AND state = 'superseded'`).bind(createdAt, revisionId, manualId, workspaceId),
    database.prepare(`UPDATE manuals SET status = 'published', current_published_revision_id = ?1, updated_at = ?2 WHERE id = ?3 AND workspace_id = ?4 AND current_draft_revision_id = ?5 AND archived_at IS NULL AND EXISTS (SELECT 1 FROM manual_revisions d WHERE d.id = ?5 AND d.manual_id = ?3 AND d.workspace_id = ?4 AND d.state = 'draft' AND d.content_version = ?6)`).bind(revisionId, createdAt, manualId, workspaceId, expectedDraftRevisionId, body.expectedContentVersion),
    database.prepare(`INSERT INTO share_links (id, workspace_id, manual_id, published_revision_id, source_draft_revision_id, source_content_version, token_hash, passcode_salt, passcode_hash, permission, expires_at, created_by, operation_id, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'read_only', ?10, ?11, ?12, ?13, ?13)`).bind(shareId, workspaceId, manualId, revisionId, expectedDraftRevisionId, body.expectedContentVersion, tokenHash, salt, passcodeHash, expiresAt, actorId, operationId, createdAt)
  ];
  let results;
  try { results = await database.batch(statements); } catch (error) { throw new D1RepositoryError("conflict", error instanceof Error ? error.message : "share create failed"); }
  if (results.length !== 7 || changed(results[0]) !== 1 || changed(results[2]) !== 1 || changed(results[3]) !== snapshotSteps.length || changed(results[4]) !== 1 || changed(results[5]) !== 1 || changed(results[6]) !== 1) throw new ShareError(409, "SHARE_CONFLICT", "共有操作が競合しました。最新の内容を確認してください。");
  return json({ shareLinkId: shareId, expiresAt, permission: "read_only", viewerPath: "/s/", reused: false });
}

async function revokeShare(request: Request, env: ShareLinkEnv, workspaceId: string, manualId: string): Promise<Response> {
  assertSameOrigin(request, env);
  const { actorId, database } = await actor(request, env);
  await ensureManager(database, actorId, workspaceId, manualId);
  const body = await readJson(request);
  if (Object.keys(body).some((key) => key !== "shareLinkId")) throw new ShareError(400, "INPUT_INVALID", "指定できない項目が含まれています。");
  const shareLinkId = id(body.shareLinkId, "SHARE_LINK_ID_INVALID");
  const result = await database.prepare(`UPDATE share_links SET revoked_at = ?1, updated_at = ?1 WHERE id = ?2 AND workspace_id = ?3 AND manual_id = ?4 AND revoked_at IS NULL AND EXISTS (SELECT 1 FROM workspace_members wm JOIN identities i ON i.application_id = wm.application_id JOIN workspaces w ON w.id = wm.workspace_id JOIN manuals m ON m.id = ?4 AND m.workspace_id = ?3 WHERE wm.workspace_id = ?3 AND wm.application_id = ?5 AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') AND i.status = 'active' AND w.status = 'active' AND m.archived_at IS NULL AND (wm.role IN ('owner','admin') OR (wm.role = 'editor' AND share_links.created_by = ?5)))`).bind(nowIso(), shareLinkId, workspaceId, manualId, actorId).run();
  if (changed(result) > 1) throw new ShareError(503, "SHARE_UNAVAILABLE", "共有停止結果を確認できません。");
  if (changed(result) === 0) {
    await ensureManager(database, actorId, workspaceId, manualId);
    const current = await database.prepare("SELECT revoked_at FROM share_links WHERE id = ?1 AND workspace_id = ?2 AND manual_id = ?3 LIMIT 1").bind(shareLinkId, workspaceId, manualId).first<{ revoked_at: string | null }>();
    if (current && current.revoked_at === null) throw new ShareError(409, "SHARE_CONFLICT", "共有リンクの停止状態を確認できませんでした。最新状態を確認してから再試行してください。");
  }
  return json({ revoked: changed(result) === 1, shareLinkId });
}

async function shareMetadata(request: Request, env: ShareLinkEnv, workspaceId: string, manualId: string): Promise<Response> {
  const { actorId, database } = await actor(request, env);
  const actorRole = await ensureManager(database, actorId, workspaceId, manualId);
  const row = await database.prepare(`SELECT s.id, s.expires_at, s.revoked_at, s.permission FROM share_links s WHERE s.workspace_id = ?1 AND s.manual_id = ?2 AND (s.created_by = ?3 OR ?4 IN ('owner','admin')) ORDER BY s.created_at DESC, s.id DESC LIMIT 1`).bind(workspaceId, manualId, actorId, actorRole).first<{ id: string; expires_at: string; revoked_at: string | null; permission: "read_only" }>();
  if (!row) return json({ share: null });
  return json({ share: { shareLinkId: row.id, expiresAt: row.expires_at, revokedAt: row.revoked_at, permission: row.permission, viewerPath: "/s/" } });
}

async function resolveShare(request: Request, env: ShareLinkEnv): Promise<Response> {
  const database = db(env); const tokenValue = request.headers.get(TOKEN_HEADER);
  let token: string; try { token = validateSecret(tokenValue, SHARE_TOKEN_BYTES); } catch { throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクまたはパスコードを確認してください。"); }
  const tokenHash = await sha256Hex(token); await rateLimit(request, env, tokenHash);
  const body = await readJson(request); if (Object.keys(body).some((key) => key !== "passcode")) throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクまたはパスコードを確認してください。");
  let passcode: string; try { passcode = validatePasscode(body.passcode); } catch { throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクまたはパスコードを確認してください。"); }
  const row = await database.prepare(`SELECT s.id, s.workspace_id, s.manual_id, s.published_revision_id, s.token_hash, s.passcode_salt, s.passcode_hash, s.expires_at, s.revoked_at, s.created_by, s.operation_id FROM share_links s JOIN manuals m ON m.id = s.manual_id AND m.workspace_id = s.workspace_id AND m.archived_at IS NULL JOIN manual_revisions r ON r.id = s.published_revision_id AND r.manual_id = s.manual_id AND r.workspace_id = s.workspace_id AND r.state = 'published' JOIN identities i ON i.application_id = s.created_by AND i.status = 'active' JOIN workspaces w ON w.id = s.workspace_id AND w.status = 'active' JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.application_id = s.created_by AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') WHERE s.token_hash = ?1 LIMIT 1`).bind(tokenHash).first<ShareRow>();
  if (!row || row.revoked_at || Date.parse(row.expires_at) <= Date.now()) throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクまたはパスコードを確認してください。");
  const valid = await verifyPasscode(passcode, row.passcode_salt, row.passcode_hash); if (!valid) throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクまたはパスコードを確認してください。");
  const now = nowIso(); const grant = randomSecret(SHARE_GRANT_BYTES); const grantHash = await sha256Hex(grant); const grantExpiresAt = new Date(Math.min(Date.parse(row.expires_at), Date.parse(now) + MAX_GRANT_MS)).toISOString();
  const grantId = crypto.randomUUID(); const result = await database.prepare(`INSERT INTO share_grants (id, share_link_id, token_hash, grant_hash, workspace_id, manual_id, published_revision_id, expires_at, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)`).bind(grantId, row.id, row.token_hash, grantHash, row.workspace_id, row.manual_id, row.published_revision_id, grantExpiresAt, now).run();
  if (changed(result) !== 1) throw new ShareError(503, "SHARE_UNAVAILABLE", "共有確認を完了できませんでした。");
  return json({ grant, expiresAt: grantExpiresAt, permission: "read_only" });
}

async function grantRow(request: Request, env: ShareLinkEnv): Promise<{ database: D1DatabaseLike; grant: GrantRow }> {
  const value = request.headers.get(GRANT_HEADER); let grant: string; try { grant = validateSecret(value, SHARE_GRANT_BYTES); } catch { throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクを確認してください。"); }
  const hash = await sha256Hex(grant); const database = db(env); const row = await database.prepare(`SELECT g.id, g.share_link_id, g.token_hash, g.workspace_id, g.manual_id, g.published_revision_id, g.expires_at FROM share_grants g JOIN share_links s ON s.id = g.share_link_id AND s.token_hash = g.token_hash JOIN manuals m ON m.id = g.manual_id AND m.workspace_id = g.workspace_id AND m.archived_at IS NULL JOIN manual_revisions r ON r.id = g.published_revision_id AND r.manual_id = g.manual_id AND r.workspace_id = g.workspace_id AND r.state = 'published' JOIN identities i ON i.application_id = s.created_by AND i.status = 'active' JOIN workspaces w ON w.id = g.workspace_id AND w.status = 'active' JOIN workspace_members wm ON wm.workspace_id = s.workspace_id AND wm.application_id = s.created_by AND wm.status = 'active' AND wm.role IN ('owner','admin','editor') WHERE g.grant_hash = ?1 AND g.revoked_at IS NULL AND g.expires_at > ?2 AND s.revoked_at IS NULL AND s.expires_at > ?2 LIMIT 1`).bind(hash, nowIso()).first<GrantRow>();
  if (!row) throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクを確認してください。");
  return { database, grant: row };
}

async function content(request: Request, env: ShareLinkEnv): Promise<Response> {
  const { database, grant } = await grantRow(request, env);
  const row = await database.prepare(`SELECT r.title, r.description, r.branding_version_id, COALESCE((SELECT json_group_array(json_object('id', s.id, 'position', s.position, 'title', s.title, 'instruction', s.instruction, 'assetId', s.asset_id, 'annotations', json(s.annotation))) FROM (SELECT * FROM manual_steps WHERE revision_id = ?1 AND workspace_id = ?2 AND deleted_at IS NULL ORDER BY position ASC, id ASC LIMIT 201) s), '[]') AS steps_json FROM manual_revisions r WHERE r.id = ?1 AND r.manual_id = ?3 AND r.workspace_id = ?2 AND r.state = 'published' LIMIT 1`).bind(grant.published_revision_id, grant.workspace_id, grant.manual_id).first<{ title: string; description: string; branding_version_id: string | null; steps_json: string }>();
  if (!row) throw new ShareError(401, "SHARE_UNAVAILABLE", "共有リンクを確認してください。");
  const branding = await new ManualBrandingRepository(database).read(grant.workspace_id, row.branding_version_id);
  return json({ title: row.title, description: row.description, branding: { ...branding, logoUrl: branding.logoId ? `/s/api/logos/${branding.logoId}` : null }, permission: "read_only", expiresAt: grant.expires_at, steps: JSON.parse(row.steps_json).map((step: Record<string, unknown>) => ({ id: step.id, position: step.position, title: step.title, instruction: step.instruction, assetId: step.assetId, annotations: readStoredManualAnnotations(step.annotations) })) });
}

async function asset(request: Request, env: ShareLinkEnv, assetId: string): Promise<Response> {
  if (request.method !== "GET") throw new ShareError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
  if (!env.MANUAL_ASSETS) throw new ShareError(503, "SHARE_MIGRATION_IN_PROGRESS", "共有機能は移行中です。");
  const { database, grant } = await grantRow(request, env); const validAssetId = id(assetId, "ASSET_ID_INVALID");
  const row = await database.prepare(`SELECT a.object_key, a.content_type FROM assets a JOIN manual_steps s ON s.asset_id = a.id AND s.revision_id = ?1 AND s.workspace_id = ?2 AND s.deleted_at IS NULL WHERE a.id = ?4 AND a.workspace_id = ?2 AND a.bucket = 'MANUAL_ASSETS' AND a.kind = 'manual_image' AND (EXISTS (SELECT 1 FROM claim_assets ca JOIN claim_intents ci ON ci.id = ca.claim_intent_id WHERE ca.asset_id = a.id AND ca.status = 'completed' AND ci.status = 'completed' AND ci.manual_id = ?3 AND ci.workspace_id = ?2) OR EXISTS (SELECT 1 FROM manual_edit_assets ea WHERE ea.id = a.id AND ea.workspace_id = ?2 AND ea.manual_id = ?3 AND ea.status = 'ready')) LIMIT 1`).bind(grant.published_revision_id, grant.workspace_id, grant.manual_id, validAssetId).first<{ object_key: string; content_type: string }>();
  if (!row) throw new ShareError(404, "SHARE_UNAVAILABLE", "共有画像を確認できません。");
  const object = await env.MANUAL_ASSETS.get(row.object_key); if (!object || !("body" in object) || !object.body) throw new ShareError(404, "SHARE_UNAVAILABLE", "共有画像を確認できません。");
  return new Response(object.body, { headers: { ...JSON_HEADERS, "content-type": row.content_type, "content-disposition": "inline" } });
}

async function brandLogo(request: Request, env: ShareLinkEnv, logoId: string): Promise<Response> {
  if (request.method !== "GET") throw new ShareError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
  if (!env.MANUAL_ASSETS) throw new ShareError(503, "SHARE_MIGRATION_IN_PROGRESS", "共有機能は移行中です。");
  const { database, grant } = await grantRow(request, env);
  const row = await database.prepare(`SELECT l.object_key, l.content_type FROM workspace_brand_logos l
    JOIN workspace_branding_versions b ON b.logo_id = l.id AND b.workspace_id = l.workspace_id
    JOIN manual_revisions r ON r.branding_version_id = b.id AND r.workspace_id = b.workspace_id
    WHERE r.id = ?1 AND r.manual_id = ?2 AND r.workspace_id = ?3 AND r.state = 'published' AND l.id = ?4 AND l.status = 'ready' LIMIT 1`)
    .bind(grant.published_revision_id, grant.manual_id, grant.workspace_id, id(logoId, "ASSET_ID_INVALID")).first<{ object_key: string; content_type: string }>();
  if (!row) throw new ShareError(404, "SHARE_UNAVAILABLE", "共有ロゴを確認できません。");
  const object = await env.MANUAL_ASSETS.get(row.object_key);
  if (!object?.body) throw new ShareError(404, "SHARE_UNAVAILABLE", "共有ロゴを確認できません。");
  return new Response(object.body, { headers: { ...JSON_HEADERS, "content-type": row.content_type, "content-disposition": "inline" } });
}

export async function handleShareLinkRoute(request: Request, env: ShareLinkEnv): Promise<Response | null> {
  const url = new URL(request.url); const path = url.pathname;
  if (path === "/s/" && request.method === "GET") return html(shareViewerHtml());
  if (path === "/s/assets/share.css" && request.method === "GET") return new Response(SHARE_CSS, { headers: { ...JSON_HEADERS, "content-type": "text/css; charset=utf-8" } });
  if (path === "/s/assets/share.js" && request.method === "GET") return new Response(SHARE_JS, { headers: { ...JSON_HEADERS, "content-type": "application/javascript; charset=utf-8" } });
  if (path === "/s/assets/editor-tools.js" && request.method === "GET") return new Response(EDITOR_TOOLS_JS, { headers: { ...JSON_HEADERS, "content-type": "application/javascript; charset=utf-8" } });
  const resolve = path === "/s/api/resolve";
  if (/^\/s\/api\/logos\/[^/]+$/u.test(path) || resolve || path === "/s/api/content" || /^\/s\/api\/assets\/[^/]+$/u.test(path) || /^\/api\/workspaces\/[^/]+\/manuals\/[^/]+\/share-links$/u.test(path)) {
    try {
      const management = path.match(/^\/api\/workspaces\/([^/]+)\/manuals\/([^/]+)\/share-links$/u);
      if (management) {
        const workspaceId = id(management[1], "WORKSPACE_ID_INVALID"); const manualId = id(management[2], "MANUAL_ID_INVALID");
        if (request.method === "GET") return await shareMetadata(request, env, workspaceId, manualId);
        if (request.method === "POST") return await createShare(request, env, workspaceId, manualId);
        if (request.method === "DELETE") return await revokeShare(request, env, workspaceId, manualId);
        throw new ShareError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。");
      }
      if (resolve) { if (request.method !== "POST") throw new ShareError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。"); return await resolveShare(request, env); }
      if (path === "/s/api/content") { if (request.method !== "POST") throw new ShareError(405, "METHOD_NOT_ALLOWED", "この操作には対応していません。"); return await content(request, env); }
      if (path.startsWith("/s/api/logos/")) return await brandLogo(request, env, path.slice("/s/api/logos/".length));
      return await asset(request, env, path.slice("/s/api/assets/".length));
    } catch (error) { return errorResponse(error); }
  }
  if (path.startsWith("/s/")) return json({ code: "NOT_FOUND", message: "ページが見つかりません。" }, 404);
  return null;
}
