import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";

// UI-state tests use a synthetic capture adapter. Native MV3 recording/privacy
// guarantees remain covered by extension-sidepanel-browser and capture tests.
const root = resolve("apps/extension");
const evidence = resolve(process.env.MECCHA_RECORDING_QUALITY_SCREENSHOTS || "test-results/recording-quality");
const fixture = `
const image = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="#f2f6f7"/><rect width="640" height="46" fill="#193039"/><text x="24" y="30" fill="white" font-size="18">サンプル業務画面</text><rect x="28" y="74" width="584" height="240" rx="8" fill="white" stroke="#d7e2e5"/><text x="52" y="114" fill="#183039" font-size="22">申請内容を確認</text><rect x="52" y="140" width="530" height="52" fill="#edf2f3"/><text x="68" y="173" fill="#526671" font-size="18">テスト用の申請情報</text><rect x="420" y="242" width="160" height="46" rx="7" fill="#087f7a"/><text x="478" y="272" fill="white" font-size="18">確認</text></svg>');
const listeners = new Set();
window.fixture = {
 state: {}, drafts: [], images: [], messages: [], delay: 0, failure: null, statusFailure: false, draftsFailure: false, imagesFailure: false, tabsUnavailable: false, noActiveTab: false, editorOpens: 0,
 setState(phase, count = 0) {
   this.state = {phase, recording: phase === 'recording', sessionId: 'synthetic-session', mode: 'pc',
     events: Array.from({length:count}, (_,i) => ({eventId:'event-'+i, at:i, kind:'click', labelSource:'caption', label:'申請内容を確認する'})),
     stepImageRefs: Array.from({length:count}, (_,i) => ({eventId:'event-'+i, status:'ready', version:1}))};
   this.images = this.state.events.map(event=>({sessionId:'synthetic-session',eventId:event.eventId,id:'image-'+event.eventId,version:1,status:'ready',dataUrl:image}));
 },
 draftStore: {list: async()=>{if(fixture.draftsFailure) throw Error('SYNTHETIC_LIST_FAILURE');return fixture.drafts;}},
 imageStore: {list: async()=>{if(fixture.imagesFailure) throw Error('SYNTHETIC_IMAGE_FAILURE');return fixture.images;}}
};
window.chrome = {
 runtime: {
   getURL: path => location.origin + '/' + path,
   onMessage: {addListener: callback=>listeners.add(callback),removeListener: callback=>listeners.delete(callback)},
   sendMessage: async message => {
     if(message.type==='capture:status') {
       if(fixture.statusFailure) throw Error('SYNTHETIC_OFFLINE');
       return {ok:true,value:structuredClone(fixture.state)};
     }
     fixture.messages.push(message.type);
     if(fixture.delay) await new Promise(resolve=>setTimeout(resolve,fixture.delay));
     if(fixture.failure === message.type || (message.type==='capture:start' && !message.tabId)) {
       if(message.type==='capture:finish') fixture.state.phase='finish_failed';
       return {ok:false,error:'SYNTHETIC_DENIAL'};
     }
     if(message.type==='capture:start') fixture.setState('recording');
     if(message.type==='capture:pause') fixture.state.phase='paused';
     if(message.type==='capture:resume') fixture.state.phase='recording';
     if(message.type==='capture:cancel') fixture.state={};
     if(message.type==='capture:restore') fixture.state={};
     if(message.type==='capture:finish') {
       fixture.drafts=[{id:'synthetic-draft',title:'申請内容を確認する手順書',steps:fixture.state.events||[],screenshots:[{id:'image',dataUrl:image}]}];
       fixture.state={};
       return {ok:true,value:{draftId:'synthetic-draft',imageCount:fixture.images.length}};
     }
     if(message.type==='capture:close-panel') return {ok:true,value:{closed:false}};
     return {ok:true,value:{restorePending:false,restored:true}};
   }
 },
 tabs:{query:async()=>fixture.noActiveTab?[]:[{id:1}],create:async({url})=>{
   if(fixture.tabsUnavailable) throw Error('SYNTHETIC_TAB_DENIAL');
   fixture.editorOpens++;
   queueMicrotask(()=>{for(const listener of listeners) listener({type:'editor:ready',draftId:'synthetic-draft',ready:true},{url});});
   return {id:2};
 }},
 windows:{getCurrent:async()=>({id:1})}
};
const scenario = new URLSearchParams(location.search).get('scenario');
if (scenario === 'recording') fixture.setState('recording',18);
if (scenario === 'paused') fixture.setState('paused',3);
if (scenario === 'restore') fixture.state = {phase:'restore_pending',restorePending:true};
if (scenario === 'cancel_failed') fixture.state = {phase:'cancel_failed'};
if (scenario === 'offline') fixture.statusFailure = true;
if (scenario === 'drafts') fixture.drafts=[{id:'synthetic-draft',title:'経理部の月次申請内容を確認してから承認担当者へ引き継ぐための詳しい手順書',steps:[{},{}],screenshots:[{id:'image',dataUrl:image}]}];
`;

async function withBrowser(run) {
  const server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, "http://localhost").pathname;
      if (path.endsWith("/storage/draft-store.js") || path.endsWith("/storage/capture-live-store.js")) {
        response.setHeader("Content-Type", "text/javascript");
        response.end(path.endsWith("/draft-store.js") ? "export const draftStore = window.fixture.draftStore;" : "export const captureLiveStore = window.fixture.imageStore;");
        return;
      }
      const file = resolve(root, `.${path}`);
      if (!file.startsWith(`${root}/`)) { response.writeHead(404).end(); return; }
      let bytes = await readFile(file);
      response.setHeader("Content-Type", ({".html":"text/html; charset=utf-8",".js":"text/javascript",".css":"text/css",".png":"image/png"})[extname(file)] || "application/octet-stream");
      if (file.endsWith(".html")) bytes = bytes.toString().replace('<script type="module"', `<script>${fixture}</script><script type="module"`);
      response.end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    await mkdir(evidence, {recursive:true});
    browser = await chromium.launch({headless:true});
    await run(browser, `http://127.0.0.1:${server.address().port}`);
  } finally {
    await browser?.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

async function checkLayout(page) {
  const result = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth > innerWidth,
    shortTargets: [...document.querySelectorAll('button, select')].filter(el=>el.getClientRects().length && el.getBoundingClientRect().height < 43.5).map(el=>el.id || el.textContent)
  }));
  assert.equal(result.overflow, false, "narrow view has no horizontal overflow");
  assert.deepEqual(result.shortTargets, [], "visible controls retain 44px targets");
}

for (const surface of ["popup", "sidepanel"]) {
  test(`${surface} has coherent narrow states, keyboard focus and repeated-action guards`, {timeout:60_000}, async () => withBrowser(async (browser, base) => {
    const page = await browser.newPage({viewport:{width:360,height:720}, reducedMotion:"reduce"});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    const url=`${base}/${surface}/${surface}.html`;
    await page.goto(url);
    await page.waitForFunction(()=>!document.querySelector('#start').disabled);
    await checkLayout(page);
    await page.screenshot({path:resolve(evidence,`${surface}-360-ready.png`)});
    if(surface==='sidepanel') assert.equal(await page.locator('#liveProgress').isVisible(),false, 'idle capture diagnostics stay hidden');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#mode').evaluate(el=>el===document.activeElement),true);
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#start').evaluate(el=>el===document.activeElement && getComputedStyle(el).outlineStyle!=='none'),true);
    await page.screenshot({path:resolve(evidence,`${surface}-keyboard-focus.png`)});
    await page.evaluate(()=>{ fixture.delay=550; document.querySelector('#start').click(); document.querySelector('#start').click(); document.querySelector('#start').click(); });
    assert.equal(await page.locator('#start').isDisabled(),true);
    await page.screenshot({path:resolve(evidence,`${surface}-starting.png`)});
    await page.waitForFunction(()=>fixture.state.phase==='recording' && !document.querySelector('#finish').disabled);
    assert.equal(await page.evaluate(()=>fixture.messages.filter(value=>value==='capture:start').length),1);
    if(surface==='sidepanel') {
      assert.equal(await page.locator('#liveImageSummary').isVisible(),false, 'empty live counters stay hidden');
      await page.locator('#pause').click();
      await page.waitForFunction(()=>fixture.state.phase==='paused' && !document.querySelector('#resume').disabled);
      assert.match(await page.locator('#introTitle').textContent(),/一時停止/);
      await page.locator('#resume').click();
      await page.waitForFunction(()=>fixture.state.phase==='recording' && !document.querySelector('#pause').disabled);
    }
    await page.evaluate(()=>{fixture.delay=0;fixture.failure='capture:finish';});
    await page.locator('#finish').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('保持'));
    assert.equal(await page.locator('#finish').isVisible(),true);
    assert.equal(await page.evaluate(()=>fixture.drafts.length),0);
    await page.screenshot({path:resolve(evidence,`${surface}-finish-failed.png`)});
    await page.evaluate(()=>{fixture.failure=null;fixture.tabsUnavailable=true;});
    await page.locator('#finish').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('編集画面を開けません'));
    assert.equal(await page.evaluate(()=>fixture.drafts.length),1);
    assert.equal(await page.locator('#draftSection').isVisible(),true);
    await checkLayout(page);
    assert.equal(await page.locator('#status').evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0 && rect.bottom<=innerHeight;}),true,'saved-draft recovery message is visible without scrolling');
    await page.screenshot({path:resolve(evidence,`${surface}-saved-editor-unavailable.png`)});
    for (const width of [280,360]) {
      await page.setViewportSize({width,height:720});
      const recoveryAction = surface === 'popup' ? '#openDraft' : '#drafts button';
      assert.equal(await page.locator(recoveryAction).first().evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0 && rect.bottom<=innerHeight;}),true,'saved-draft recovery action is visible without scrolling');
      assert.equal(await page.locator('#draftSection').evaluate(el=>el.previousElementSibling?.id==='status'),true,'the visual recovery priority also matches DOM/tab order');
      await checkLayout(page);
      await page.screenshot({path:resolve(evidence,`${surface}-${width}-saved-editor-recovery.png`)});
    }
    for(const width of [320,280]) {
      await page.setViewportSize({width,height:720});
      await page.goto(`${url}?scenario=drafts`);
      await page.waitForFunction(()=>!document.querySelector('#draftSection').hidden);
      assert.doesNotMatch(await page.locator('#status').textContent(),/状態を確認しています/);
      await checkLayout(page);
      await page.screenshot({path:resolve(evidence,`${surface}-${width}-long-draft.png`)});
    }
    await page.goto(url);
    await page.waitForFunction(()=>!document.querySelector('#start').disabled);
    await page.evaluate(()=>{fixture.noActiveTab=true;});
    await page.locator('#start').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('開始できません'));
    assert.equal(await page.locator('#start').isDisabled(),false);
    assert.equal(await page.locator('#status').evaluate(el=>{const rect=el.getBoundingClientRect();return rect.top>=0 && rect.bottom<=innerHeight;}),true,'start failure is visible without scrolling');
    await page.screenshot({path:resolve(evidence,`${surface}-no-active-tab.png`)});
    await page.evaluate(()=>{fixture.noActiveTab=false;fixture.failure='capture:start';});
    await page.locator('#start').click();
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('開始できません'));
    assert.equal(await page.locator('#finish').isVisible(),false);
    assert.match(await page.locator(surface==='sidepanel'?'#introTitle':'#recordingState').textContent(),/開始できません/);
    await page.screenshot({path:resolve(evidence,`${surface}-permission-denied.png`)});
    await page.goto(`${url}?scenario=offline`);
    await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('確認できません') || document.querySelector('#status').textContent.includes('読み込めません'));
    assert.equal(await page.locator('#start').isDisabled(),true);
    await page.screenshot({path:resolve(evidence,`${surface}-offline.png`)});
    assert.deepEqual(errors,[]);
    await page.close();
  }));
}

test('sidepanel follows the actual inner scroller, preserves reading position and exposes recovery states', {timeout:60_000}, async()=>withBrowser(async(browser,base)=>{
  const page=await browser.newPage({viewport:{width:360,height:720},reducedMotion:'reduce'});
  const url=`${base}/sidepanel/sidepanel.html`;
  await page.goto(`${url}?scenario=recording`);
  await page.waitForFunction(()=>document.querySelectorAll('.step-card').length===18);
  await page.waitForFunction(()=>{const list=document.querySelector('#liveSection');return list.scrollTop>0 && list.scrollHeight-list.scrollTop-list.clientHeight<2;});
  await checkLayout(page);
  assert.doesNotMatch(await page.locator('#liveImageSummary').textContent(),/準備中 0|取得できず 0|要確認 0|説明のみ 0/);
  await page.screenshot({path:resolve(evidence,'sidepanel-360-recording.png')});
  await page.locator('#liveSection').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
  await page.waitForFunction(()=>!document.querySelector('#liveLatest').hidden);
  await page.evaluate(()=>fixture.setState('recording',19));
  await page.waitForFunction(()=>document.querySelectorAll('.step-card').length===19);
  assert.ok(await page.locator('#liveSection').evaluate(el=>el.scrollTop<5),'reading older steps must not snap to the newest');
  await page.locator('#liveLatest').click();
  await page.waitForFunction(()=>{const list=document.querySelector('#liveSection');return list.scrollHeight-list.scrollTop-list.clientHeight<2;});
  for (const width of [320,280]) {
    await page.setViewportSize({width,height:560});
    await checkLayout(page);
    await page.screenshot({path:resolve(evidence,`sidepanel-${width}-recording.png`)});
  }
  for(const scenario of ['paused','restore','cancel_failed']) {
    await page.goto(`${url}?scenario=${scenario}`);
    await page.waitForFunction(phase=>document.querySelector('#introTitle').getAttribute('data-phase')===phase,scenario==='restore'?'restore_pending':scenario);
    await checkLayout(page);
    if (scenario !== 'restore') assert.equal(await page.locator('#liveTitle').textContent(),'ここまでの手順');
    if (scenario === 'cancel_failed') assert.doesNotMatch(await page.locator('#liveCurrentStatus').textContent(),/操作を待っています/);
    await page.screenshot({path:resolve(evidence,`sidepanel-${scenario}.png`)});
  }
  assert.equal(await page.locator('#start').isVisible(),false);
  assert.equal(await page.locator('#finish').isVisible(),false);
  assert.equal(await page.locator('#resume').isVisible(),false);
  assert.equal(await page.locator('#cancel').isVisible(),true);
  await writeFile(resolve(evidence,'verification-scope.json'),JSON.stringify({adapter:'synthetic-capture-UI',viewports:[{width:360,height:720},{width:320,height:720},{width:280,height:720},{width:320,height:560},{width:280,height:560}],nativeRecording:'covered separately by extension-sidepanel-browser; this suite does not prove native recording or privacy'},null,2));
  await page.close();
}));

async function recordingHarness(surface, initialState = {}, {draftsFail = false, imagesFail = false, statusFailsAfterStart = false, initialDrafts = []} = {}) {
  const vm = await import('node:vm');
  const source = (await readFile(resolve(root, surface, `${surface}.js`), 'utf8')).replace(/^import .*;\r?\n/gm, '');
  const elements = new Map();
  const messages = [];
  let state = initialState;
  let pending;
  let release;
  const makeElement = () => {
    const element = { hidden:false, disabled:false, value:'pc', textContent:'', dataset:{}, children:[], listeners:{},
      style:{setProperty(){}}, classList:{add(){}}, setAttribute(){}, removeAttribute(){},
      addEventListener(type, handler){this.listeners[type]=handler;},
      replaceChildren(...children){this.children=children;}, append(...children){this.children.push(...children);},
      querySelectorAll(){return [];},querySelector(){return null;},
      getBoundingClientRect(){return {top:0,bottom:120,height:120};}
    };
    Object.defineProperty(element,'lastElementChild',{get:()=>element.children.at(-1)||null});
    return element;
  };
  const document = {documentElement:{style:{setProperty(){}}}, querySelector(selector){
    if(!elements.has(selector))elements.set(selector,makeElement());
    return elements.get(selector);
  },createElement:makeElement};
  vm.runInNewContext(source,{
    document, URL, CSS:{escape:value=>value}, ResizeObserver:undefined,
    requestAnimationFrame:callback=>callback(),
    setTimeout:()=>1,clearTimeout(){},
    window:{innerHeight:720,scrollY:0,addEventListener(){},matchMedia:()=>({matches:true}),scrollTo(){},scrollBy(){},close(){}},
    draftStore:{list:async()=>{if(draftsFail) throw Error('SYNTHETIC_LIST_FAILURE');return initialDrafts;}},captureLiveStore:{list:async()=>{if(imagesFail) throw Error('SYNTHETIC_IMAGE_LIST_FAILURE');return []; }},
    chrome:{
      runtime:{getURL:path=>`chrome-extension://synthetic/${path}`,sendMessage:async message=>{
        messages.push(message.type);
        if(message.type==='capture:status'){if(statusFailsAfterStart && state.phase==='recording') throw Error('SYNTHETIC_STATE_UNAVAILABLE');return {ok:true,value:state};}
        if(pending===message.type) await new Promise(resolve=>{release=resolve;});
        if(message.type==='capture:start'||message.type==='capture:resume')state={phase:'recording',recording:true,sessionId:'synthetic-session'};
        if(message.type==='capture:restore')return {ok:false,error:'SYNTHETIC_RESTORE_DENIAL'};
        return {ok:true,value:{}};
      }},
      tabs:{query:async()=>[{id:1}],create:async()=>{throw Error('SYNTHETIC_EDITOR_DENIAL');}}
    }
  });
  await new Promise(resolve=>setImmediate(resolve));
  return {elements,messages,hold(type){pending=type;},release(){pending=null;release?.();},click(id){return elements.get(id).listeners.click();}};
}

for(const surface of ['popup','sidepanel']) {
  test(`unit: ${surface} sends one start while repeated controls are pending`,async()=>{
    const view=await recordingHarness(surface);
    view.hold('capture:start');
    const first=view.click('#start');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(view.elements.get('#start').disabled,true);
    await view.click('#start');
    assert.equal(view.messages.filter(type=>type==='capture:start').length,1);
    view.release();await first;
    assert.equal(view.elements.get('#finish').hidden,false);
    assert.equal(view.elements.get('#finish').disabled,false);
  });
  test(`unit: ${surface} exposes paused resume and blocks new recording in cancel recovery`,async()=>{
    const paused=await recordingHarness(surface,{phase:'paused'});
    assert.equal(paused.elements.get('#resume').hidden,false);
    assert.equal(paused.elements.get('#start').hidden || paused.elements.get('#startSection')?.hidden,true);
    const cancelled=await recordingHarness(surface,{phase:'cancel_failed'});
    assert.equal(cancelled.elements.get('#finish').hidden,true);
    assert.equal(cancelled.elements.get('#resume').hidden,true);
    assert.equal(cancelled.elements.get('#cancel').hidden,false);
  });
  test(`unit: ${surface} retains restoration action after a denied retry`,async()=>{
    const view=await recordingHarness(surface,{phase:'restore_pending',restorePending:true});
    await view.click('#restore');
    assert.match(view.elements.get('#status').textContent,/復元できません/);
    assert.equal(view.elements.get('#restore').hidden,false);
    assert.equal(view.elements.get('#restore').disabled,false);
  });
}


test('unit: sidepanel keeps acknowledged recording state when the saved-draft list fails',async()=>{
  const view=await recordingHarness('sidepanel',{}, {draftsFail:true});
  assert.equal(view.elements.get('#start').disabled,false);
  await view.click('#start');
  assert.equal(view.elements.get('#finish').hidden,false);
  assert.equal(view.elements.get('#pause').hidden,false);
  assert.match(view.elements.get('#introTitle').textContent,/記録中/);
  assert.match(view.elements.get('#status').textContent,/一覧を更新できません/);
  assert.doesNotMatch(view.elements.get('#status').textContent,/記録を開始できません/);
});

test('unit: sidepanel keeps recording controls when the live-image list fails',async()=>{
  const view=await recordingHarness('sidepanel',{}, {imagesFail:true});
  await view.click('#start');
  assert.equal(view.elements.get('#finish').hidden,false);
  assert.equal(view.elements.get('#finish').disabled,false);
  assert.match(view.elements.get('#status').textContent,/画像を読み込めません/);
  assert.doesNotMatch(view.elements.get('#status').textContent,/記録を開始できません/);
});

test('unit: sidepanel distinguishes an unknown post-start status from a rejected start',async()=>{
  const view=await recordingHarness('sidepanel',{}, {statusFailsAfterStart:true});
  await view.click('#start');
  assert.equal(view.elements.get('#start').disabled,true);
  assert.match(view.elements.get('#introTitle').textContent,/状態を確認できません/);
  assert.match(view.elements.get('#status').textContent,/記録の状態を確認できません/);
  assert.doesNotMatch(view.elements.get('#status').textContent,/記録を開始できません/);
});


test('sidepanel separates capture state from local-list read failures and automatically recovers', {timeout:30_000}, async()=>withBrowser(async(browser,base)=>{
  const page=await browser.newPage({viewport:{width:360,height:720},reducedMotion:'reduce'});
  await page.goto(`${base}/sidepanel/sidepanel.html`);
  await page.waitForFunction(()=>!document.querySelector('#start').disabled);
  await page.evaluate(()=>{fixture.draftsFailure=true;});
  await page.locator('#start').click();
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('一覧を更新できません'));
  assert.equal(await page.locator('#finish').isVisible(),true);
  assert.equal(await page.locator('#finish').isDisabled(),false);
  await page.screenshot({path:resolve(evidence,'sidepanel-recording-draft-list-unavailable.png')});
  await page.evaluate(()=>{fixture.draftsFailure=false;fixture.imagesFailure=true;fixture.setState('recording',2);});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('画像を読み込めません'));
  assert.equal(await page.locator('#finish').isDisabled(),false);
  assert.doesNotMatch(await page.locator('#liveSteps').textContent(),/保存できませんでした|取得できませんでした/);
  assert.match(await page.locator('#liveImageSummary').textContent(),/読み込めず 2/);
  await page.screenshot({path:resolve(evidence,'sidepanel-recording-image-list-unavailable.png')});
  await page.evaluate(()=>{fixture.imagesFailure=false;});
  await page.waitForFunction(()=>document.querySelectorAll('.step-card img').length===2);
  assert.doesNotMatch(await page.locator('#status').textContent(),/読み込めません/);
  await page.evaluate(()=>{fixture.statusFailure=true;});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('記録の状態を確認できません'));
  assert.equal(await page.locator('#finish').isDisabled(),true);
  await page.screenshot({path:resolve(evidence,'sidepanel-recording-state-unavailable.png')});
  await page.evaluate(()=>{fixture.statusFailure=false;});
  await page.waitForFunction(()=>!document.querySelector('#finish').disabled);
  assert.match(await page.locator('#introTitle').textContent(),/記録中/);
  await page.close();
}));


test('unit: sidepanel paused and cancel recovery copy never instructs the user to continue recording',async()=>{
  for (const phase of ['paused','cancel_failed']) {
    const view=await recordingHarness('sidepanel',{phase});
    assert.equal(view.elements.get('#liveTitle').textContent,'ここまでの手順');
    assert.equal(view.elements.get('#liveCurrentStatus').textContent,'手順はまだありません');
    assert.doesNotMatch(view.elements.get('#liveDescription').textContent,/操作を続ける|操作すると/);
  }
});


test('unit: sidepanel distinguishes a temporary image-list read error from missing persisted bytes',async()=>{
  const vm=await import('node:vm');
  const source=await readFile(resolve(root,'sidepanel/sidepanel.js'),'utf8');
  const context={failedDisplayImages:new Set(),liveImagesUnavailable:true};
  vm.runInNewContext(source.slice(source.indexOf('function imageStateFor('),source.indexOf('function updateLiveLatestVisibility('))+'\nglobalThis.state=imageStateFor;globalThis.label=imageStatusFor;globalThis.summary=imageSummaryFor;',context);
  const event={eventId:'synthetic-event'};
  const refs=[{eventId:event.eventId,status:'ready',version:1}];
  assert.equal(context.state(event,[],refs).status,'read_failed');
  assert.equal(context.label(event,[],refs),'画像を読み込めませんでした');
  assert.match(context.summary([event],[],refs),/読み込めず 1/);
  context.liveImagesUnavailable=false;
  assert.equal(context.state(event,[],refs).reason,'storage_failed','a successful read with missing persisted bytes retains the original failure boundary');
});


test('unit: sidepanel clears the loading message when a saved draft is ready',async()=>{
  const view=await recordingHarness('sidepanel',{}, {initialDrafts:[{id:'synthetic-draft',title:'保存済みの手順書',steps:[]}]});
  assert.equal(view.elements.get('#draftSection').hidden,false);
  assert.equal(view.elements.get('#status').textContent,'');
});

test('unit: sidepanel failed finish only offers the available retry action in its guidance',async()=>{
  const view=await recordingHarness('sidepanel',{phase:'finish_failed'});
  assert.doesNotMatch(view.elements.get('#liveDescription').textContent,/再開/);
  assert.match(view.elements.get('#liveDescription').textContent,/終了をもう一度/);
});
