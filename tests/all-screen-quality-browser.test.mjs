import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import test from 'node:test';
import {chromium} from './support/test-browser.mjs';
import {APP_HTML,APP_CSS,APP_JS} from '../apps/worker/src/app-assets.ts';
import {CLOUD_MANUAL_CSS,CLOUD_MANUAL_JS,renderCloudManualsPage} from '../apps/worker/src/cloud-manual-assets.ts';
import {EDITOR_TOOLS_JS} from '../apps/worker/src/editor-tools-assets.ts';
import {ONBOARDING_CSS,ONBOARDING_JS,renderOnboardingContinuePage} from '../apps/worker/src/onboarding-assets.ts';
import {handleShareLinkRoute} from '../apps/worker/src/share-link-router.ts';

// Presentation and recovery checkpoints supplement the separate real MV3 and
// Worker/API suites. Synthetic data only; never infer SSO or deployment success.
const directory='.artifacts/all-screen-quality/after';
const records=[];
async function checkpoint(page,id,kind='screen'){
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.evaluate(()=>[...document.images].filter(image=>image.getBoundingClientRect().width>0).every(image=>image.complete && image.naturalWidth>0)),true,`${id} includes its real brand imagery`);
  const full=await page.screenshot({path:`${directory}/${id}.png`,fullPage:true});
  const viewportShot=await page.screenshot({path:`${directory}/${id}-viewport.png`});
  const metrics=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth+1,documentWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,bodyWidth:document.body.getBoundingClientRect().width,viewport:{width:innerWidth,height:innerHeight},language:document.documentElement.lang,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}));
  records.push({id,kind,...metrics,pngDimensions:{fullPage:{width:full.readUInt32BE(16),height:full.readUInt32BE(20)},viewport:{width:viewportShot.readUInt32BE(16),height:viewportShot.readUInt32BE(20)}},candidateCommit:process.env.GITHUB_SHA||null,fixture:'synthetic-API-source-render',screenshot:`${id}.png`});
  await writeFile(`${directory}/inventory.json`,JSON.stringify(records,null,2)+'\n');
  assert.equal(metrics.overflow,false,`${id} has no horizontal page overflow`);
  assert.equal(metrics.language,'ja');
}

test('all-screen source render inventory covers public, library, authentication, recovery and responsive states',{timeout:120_000},async()=>{
  let mode='library',release=null;
  const session={user:{id:'00000000-0000-4000-8000-000000000001',email:'quality@example.invalid'},profile:{id:'00000000-0000-4000-8000-000000000001',display_name:'検証ユーザー',locale:'ja-JP',timezone:'Asia/Tokyo'},workspaces:[{id:'11111111-1111-4111-8111-111111111111',name:'品質確認ワークスペース',slug:'quality',status:'active',created_at:'2026-10-01T00:00:00Z'}]};
  const manual={id:'manual-quality',title:'月次請求の確認と、差異がある場合の対応手順',updatedAt:'2026-10-01T00:00:00Z'};
  const detail={manual,draft:{id:'draft-quality',title:manual.title,description:'合成データによる、読みやすさと状態表示の検証です。',updatedAt:'v1',contentVersion:'a'.repeat(32)},steps:[{id:'step-1',position:1,type:'action',title:'確認結果を記入する',instruction:'この手順は説明だけで伝えます。請求内容と確認結果を照合してください。',assetId:null,assetUrl:null}],permissions:{canEdit:false}};
  const server=createServer(async(req,res)=>{try{
    const p=new URL(req.url,'http://localhost').pathname;
    const send=(body,type='application/json',code=200)=>{res.writeHead(code,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(body):body)};
    if(p==='/')return send(APP_HTML,'text/html;charset=utf-8');
    if(p==='/assets/app.css')return send(APP_CSS,'text/css');if(p==='/assets/app.js')return send(APP_JS,'application/javascript');
    if(p==='/manuals')return send(renderCloudManualsPage({workspaceId:'11111111-1111-4111-8111-111111111111'}),'text/html;charset=utf-8');
    if(p==='/assets/cloud-manual.css')return send(CLOUD_MANUAL_CSS,'text/css');if(p==='/assets/cloud-manual.js')return send(CLOUD_MANUAL_JS,'application/javascript');if(p==='/assets/editor-tools.js')return send(EDITOR_TOOLS_JS,'application/javascript');
    if(p==='/onboarding/continue')return send(renderOnboardingContinuePage({bootstrapEnabled:mode!=='setup-unavailable'}),'text/html;charset=utf-8');if(p==='/assets/onboarding.css')return send(ONBOARDING_CSS,'text/css');if(p==='/assets/onboarding.js')return send(ONBOARDING_JS,'application/javascript');
    if(p==='/api/session'){
      if(mode==='app-loading')await new Promise(r=>release=r);
      if(mode==='app-error')return send({code:'SERVICE_UNAVAILABLE',message:'接続を確認できませんでした。時間をおいて、もう一度お試しください。'},'application/json',503);
      if(mode==='app-workspace'||mode==='app-empty')return send({...session,workspaces:mode==='app-empty'?[]:session.workspaces});
      return send({code:'SESSION_REQUIRED',message:'ログインしてください。'},'application/json',401);
    }
    if(p.endsWith('/members'))return send({workspaceId:'11111111-1111-4111-8111-111111111111',currentUserRole:'owner',members:[{userId:'00000000-0000-4000-8000-000000000001',displayName:'検証ユーザー',role:'owner',status:'active',joinedAt:'2026-10-01T00:00:00Z'}]});
    if(p==='/api/workspaces/11111111-1111-4111-8111-111111111111/manuals'){
      if(mode==='library-loading')await new Promise(r=>release=r);
      if(mode==='library-error')return send({code:'MANUAL_READ_FAILED',message:'接続を確認できませんでした。'},'application/json',503);
      return send({manuals:mode==='library-empty'?[]:[manual,{id:'manual-long',title:'長いタイトルの折り返し確認：'+ '月次の請求内容を確認する手順'.repeat(3),updatedAt:manual.updatedAt}]});
    }
    if(p.endsWith('/share-links'))return send({share:null});if(p.endsWith('/branding'))return send({branding:{themeColor:'#087f7a'},canEdit:true});if(p.startsWith('/api/workspaces/11111111-1111-4111-8111-111111111111/manuals/'))return send(detail);
    if(p==='/s/assets/brand/logo.png'||p==='/s/assets/brand/mascot.png')return send(await readFile(new URL('../apps/worker/brand-assets/assets/'+(p.includes('logo')?'meccha-manual-logo-mark.png':'meccha-manual-mascot-me-clear-eyes.png'),import.meta.url)),'image/png');
    if(p.startsWith('/s/')){const r=await handleShareLinkRoute(new Request('http://localhost'+req.url),{});if(r){res.writeHead(r.status,Object.fromEntries(r.headers));res.end(Buffer.from(await r.arrayBuffer()));return;}}
    if(p.startsWith('/assets/meccha-manual'))return send(await readFile(new URL((p.endsWith('meccha-manual-mascot.png')?'../apps/brand-site/public':'../apps/worker/brand-assets')+p,import.meta.url)),'image/png');
    const pathname=p==='/brand/'?'/index.html':p;
    const root=resolve('apps/brand-site/public');const file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/'))return send({},'application/json',404);
    return send(await readFile(file),file.endsWith('.html')?'text/html;charset=utf-8':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':'application/octet-stream');
  }catch{res.writeHead(404).end()}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
  let browser;
  try{
    browser=await chromium.launch({channel:'chromium',headless:true});await mkdir(directory,{recursive:true});
    for(const width of [1440,390]){
      const page=await browser.newPage({viewport:{width,height:width===390?844:1000},locale:'ja-JP',timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
      for(const [id,path] of [['brand-home','/brand/'],['brand-catalog','/app/index.html'],['product-landing','/app/meccha-manual/index.html'],['brand-not-found','/404.html']]){await page.goto(origin+path);await checkpoint(page,id+'-'+width);}
      mode='app-login';await page.goto(origin+'/');await page.getByRole('heading',{name:'ログイン',exact:true}).waitFor();await checkpoint(page,'app-login-'+width);
      await page.getByRole('button',{name:'ログイン',exact:true}).click();await checkpoint(page,'app-login-validation-'+width);
      mode='app-error';await page.reload();await page.getByRole('button',{name:/再読み込み|再試行|もう一度/}).first().waitFor();await checkpoint(page,'app-load-error-'+width);
      mode='app-loading';await page.reload({waitUntil:'domcontentloaded'});await page.locator('.boot').waitFor();await checkpoint(page,'app-loading-'+width);mode='app-workspace';release?.();await page.getByRole('heading',{name:'ワークスペース',exact:true}).waitFor();await checkpoint(page,'app-workspace-'+width);
      await page.getByRole('button',{name:'メンバー一覧を表示',exact:true}).click();await page.getByRole('region',{name:'ワークスペースメンバー一覧'}).waitFor();await checkpoint(page,'app-members-'+width);
      mode='app-empty';await page.reload();await page.getByRole('heading',{name:'ワークスペース',exact:true}).waitFor();await checkpoint(page,'app-workspace-empty-'+width);
      for(const state of ['library','library-empty','library-error']){mode=state;await page.goto(origin+'/manuals');await page.waitForFunction(()=>!document.querySelector('#cloud-list').hasAttribute('aria-busy'));await checkpoint(page,state+'-'+width);}
      mode='library-loading';await page.goto(origin+'/manuals',{waitUntil:'domcontentloaded'});await page.locator('[aria-busy=true]').waitFor();await checkpoint(page,'library-loading-'+width);mode='library';release?.();await page.getByRole('button',{name:manual.title,exact:true}).waitFor();
      await page.getByRole('searchbox').fill('見つからない検索語');await page.getByText(/一致する手順書がありません/).waitFor();await checkpoint(page,'library-search-empty-'+width);await page.getByRole('searchbox').fill('');
      await page.getByRole('button',{name:manual.title,exact:true}).click();await page.locator('.cloud-step').waitFor();assert.equal(await page.locator('[data-manual-save]').isDisabled(),true);assert.equal(await page.getByText('閲覧専用',{exact:true}).isVisible(),true);await checkpoint(page,'cloud-readonly-text-step-'+width);
      for(const state of ['setup-unavailable','setup-invalid']){mode=state;await page.goto(origin+'/onboarding/continue');await page.locator('#bootstrap:disabled').waitFor();await checkpoint(page,state+'-'+width);}
      await page.goto(origin+'/s/');await page.getByText(/共有リンク/).first().waitFor();await checkpoint(page,'reader-link-missing-'+width);
      await page.goto(origin+'/s/#token='+'T'.repeat(43));await page.locator('#share-auth:not([hidden])').waitFor();await checkpoint(page,'reader-passcode-'+width);await page.getByRole('button',{name:'手順書を表示'}).click();await checkpoint(page,'reader-passcode-validation-'+width);
      assert.deepEqual(errors,[]);await page.close();
    }
    for(const width of [320,768,1024,1440,1920]){
      const page=await browser.newPage({viewport:{width,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});mode='library';await page.goto(origin+'/manuals');await page.getByRole('button',{name:manual.title,exact:true}).waitFor();await checkpoint(page,'library-layout-'+width,'layout');await page.close();
    }
  }finally{release?.();await browser?.close();server.closeAllConnections?.();await new Promise(r=>server.close(r));}
});
