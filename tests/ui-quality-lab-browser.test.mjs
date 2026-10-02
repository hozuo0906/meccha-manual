import assert from 'node:assert/strict';
import test from 'node:test';
import {createServer} from 'node:http';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {chromium} from '@playwright/test';
import {CLOUD_MANUAL_CSS,CLOUD_MANUAL_JS,renderCloudManualsPage} from '../apps/worker/src/cloud-manual-assets.ts';
import {EDITOR_TOOLS_JS} from '../apps/worker/src/editor-tools-assets.ts';

const directory='.artifacts/all-screen-quality/after/lab';
const fixture={manual:{id:'lab-manual',title:'顧客登録・申請内容の確認手順'},draft:{id:'lab-draft',title:'顧客登録・申請内容の確認手順',description:'合成業務画面の表示と印刷を確認する検証用手順書です。',updatedAt:'v1',contentVersion:'a'.repeat(32)},permissions:{canEdit:true},branding:{themeColor:'#563aa3',logoUrl:'/api/workspaces/lab/branding/logos/synthetic'},steps:Array.from({length:12},(_,i)=>({id:'step-'+(i+1),position:i+1,type:'action',title:i===1?'縦長の申請内容を確認する':i===2?'確認事項を読み、変更内容を照合する':'参照をクリックして登録内容を確認する',instruction:i===2?'入力内容を照合し、変更箇所を確認してください。'.repeat(16):'「参照」をクリックし、表示された登録内容を確認します。',assetId:i===1?'portrait':'landscape',assetUrl:i===1?'/portrait.png':'/landscape.png',annotations:i===1?[]:[{id:'click-'+i,type:'rectangle',x:.75,y:.8,width:.2,height:.12,color:'#df4a36',strokeWidth:4}]}))};

async function installLabObservers(page){
  await page.addInitScript(()=>{
    window.__qualityLab={largestContentfulPaintMs:null,cumulativeLayoutShift:0,longTasks:0};
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries())window.__qualityLab.largestContentfulPaintMs=entry.startTime;}).observe({type:'largest-contentful-paint',buffered:true});}catch{}
    try{new PerformanceObserver(list=>{for(const entry of list.getEntries())if(!entry.hadRecentInput)window.__qualityLab.cumulativeLayoutShift+=entry.value;}).observe({type:'layout-shift',buffered:true});}catch{}
    try{new PerformanceObserver(list=>{window.__qualityLab.longTasks+=list.getEntries().length;}).observe({type:'longtask',buffered:true});}catch{}
  });
}
async function inspectAccessibility(page){
  return page.evaluate(()=>{
    const parse=value=>{const numbers=value.match(/[\d.]+/g)?.map(Number)||[];return numbers.length>=3?[...numbers.slice(0,3),numbers[3]??1]:null;};
    const luminance=rgb=>rgb.slice(0,3).map(value=>{const c=value/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4;}).reduce((v,c,i)=>v+c*[.2126,.7152,.0722][i],0);
    const contrast=[];
    for(const selector of ['.manual-title','.manual-step-heading input','.cloud-step textarea','.manual-step-nav [aria-current=step]','.cloud-save-state','.manual-context-tools h2']){
      const element=document.querySelector(selector);if(!element||!element.getBoundingClientRect().width)continue;
      const style=getComputedStyle(element),foreground=parse(style.color);let node=element,background=null,unsupported=false;
      while(node){const computed=getComputedStyle(node);if(computed.backgroundImage!=='none'){unsupported=true;break;}const candidate=parse(computed.backgroundColor);if(candidate&&candidate[3]===1){background=candidate;break;}node=node.parentElement;}
      background??=[255,255,255,1];
      if(!foreground||foreground[3]!==1||unsupported){contrast.push({selector,result:'not-measured',reason:'transparency or image background'});continue;}
      const l1=luminance(foreground),l2=luminance(background),ratio=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),size=parseFloat(style.fontSize),large=size>=24||(size>=18.66&&Number(style.fontWeight)>=700);
      contrast.push({selector,foreground:style.color,background:background.slice(0,3),fontSize:size,fontWeight:style.fontWeight,ratio,required:large?3:4.5,result:ratio>=(large?3:4.5)?'pass':'fail'});
    }
    const controls=[...document.querySelectorAll('button,input,textarea,summary,a[href]')].filter(node=>{const r=node.getBoundingClientRect();return r.width&&r.height&&!node.closest('[hidden]');}).map(node=>{const r=node.getBoundingClientRect();return {role:node.getAttribute('role')||node.tagName.toLowerCase(),name:node.getAttribute('aria-label')||node.labels?.[0]?.textContent.trim().slice(0,80)||node.textContent.trim().slice(0,80),disabled:Boolean(node.disabled),width:r.width,height:r.height,tabIndex:node.tabIndex};});
    return {contrast,controls,focus:{tag:document.activeElement?.tagName,name:document.activeElement?.getAttribute('aria-label')||document.activeElement?.textContent?.slice(0,80)},scope:'computed colors and semantic DOM inspection; not a human screen-reader test'};
  });
}

test('reproducible image-heavy lab, keyboard, contrast and actual PDF evidence',{timeout:150_000},async()=>{
  let landscape,portrait;const logo=await readFile(new URL('../apps/worker/brand-assets/assets/meccha-manual-logo-mark.png',import.meta.url));
  const server=createServer(async(req,res)=>{const p=new URL(req.url,'http://localhost').pathname;const send=(data,type='application/json')=>{res.writeHead(200,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(data):data);};
    if(p==='/seed')return send('<!doctype html><html lang="ja"><title>合成画像の準備</title></html>','text/html');
    if(p==='/manuals')return send(renderCloudManualsPage({workspaceId:'lab'}),'text/html;charset=utf-8');
    if(p==='/assets/cloud-manual.css')return send(CLOUD_MANUAL_CSS,'text/css');if(p==='/assets/cloud-manual.js')return send(CLOUD_MANUAL_JS,'application/javascript');if(p==='/assets/editor-tools.js')return send(EDITOR_TOOLS_JS,'application/javascript');
    if(p==='/landscape.png')return send(landscape,'image/png');if(p==='/portrait.png')return send(portrait,'image/png');
    if(p==='/s/assets/brand/logo.png'||p==='/s/assets/brand/mascot.png'||p.endsWith('/branding/logos/synthetic'))return send(logo,'image/png');
    if(p==='/api/workspaces/lab/manuals')return send({manuals:[fixture.manual]});if(p.endsWith('/share-links'))return send({share:null});if(p.endsWith('/branding'))return send({branding:fixture.branding,canEdit:true});if(p==='/api/workspaces/lab/manuals/lab-manual')return send(fixture);
    res.writeHead(404).end();
  });
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;let browser;
  try{
    // PDF requires headless Chrome. This separate lab intentionally does not use
    // the headed/native lifecycle launcher, but uses the same official binary.
    browser=await chromium.launch({headless:true,...(process.env.MECCHA_TEST_CHROME_PATH?{executablePath:process.env.MECCHA_TEST_CHROME_PATH}:{channel:'chromium'})});
    await mkdir(directory,{recursive:true});const seed=await browser.newPage();await seed.goto(origin+'/seed');
    const images=await seed.evaluate(()=>[false,true].map(tall=>{const c=document.createElement('canvas');c.width=tall?600:1200;c.height=tall?1600:660;const x=c.getContext('2d');x.fillStyle='#fff';x.fillRect(0,0,c.width,c.height);x.fillStyle='#173b42';x.fillRect(0,0,c.width,80);x.fillStyle='#fff';x.font='28px sans-serif';x.fillText('サンプル申請システム',28,50);x.fillStyle='#183039';x.font='bold 30px sans-serif';x.fillText('登録内容の確認',32,140);x.font='22px sans-serif';for(let i=0;i<(tall?12:3);i++){x.fillStyle='#edf3f4';x.fillRect(32,190+i*90,c.width-64,64);x.fillStyle='#183039';x.fillText('確認項目 '+(i+1)+'：サンプル内容',48,231+i*90);}x.fillStyle='#087f7a';x.fillRect(c.width*.77,c.height*.82,c.width*.16,c.height*.08);x.fillStyle='#fff';x.font='24px sans-serif';x.fillText('参照',c.width*.8,c.height*.82+36);return c.toDataURL('image/png').split(',')[1];}));
    landscape=Buffer.from(images[0],'base64');portrait=Buffer.from(images[1],'base64');await seed.close();
    const reports=[];
    for(const width of [1440,390]){
      for(let repeat=1;repeat<=3;repeat++){
        const page=await browser.newPage({viewport:{width,height:900},locale:'ja-JP',timezoneId:'Asia/Tokyo',reducedMotion:'reduce'});const runtimeErrors=[];page.on('pageerror',e=>runtimeErrors.push(e.name));await installLabObservers(page);
        await page.goto(origin+'/manuals');await page.getByRole('button',{name:fixture.manual.title,exact:true}).waitFor();const start=await page.evaluate(()=>performance.now());await page.getByRole('button',{name:fixture.manual.title,exact:true}).click();await page.waitForFunction(()=>document.querySelector('.cloud-step-image')?.complete&&!document.querySelector('.cloud-step-image')?.hidden);const imageReadyMs=await page.evaluate(()=>performance.now())-start;
        const accessibility=await inspectAccessibility(page);assert.equal(accessibility.contrast.some(item=>item.result==='fail'),false,JSON.stringify(accessibility.contrast));
        if(repeat===1){
          const zoom=page.getByRole('button',{name:'画像を拡大して確認',exact:true});await zoom.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'原寸表示',exact:true}).waitFor();await page.keyboard.press('Tab');assert.equal(await page.locator('.cloud-image-inspection').evaluate(node=>node.contains(document.activeElement)),true);await page.keyboard.press('Escape');assert.equal(await zoom.evaluate(node=>node===document.activeElement),true);
          await page.screenshot({path:`${directory}/cloud-keyboard-${width}.png`});
        }
        const lab=await page.evaluate(()=>window.__qualityLab);reports.push({width,repeat,lab,imageReadyTaskMs:imageReadyMs,runtimeErrors,accessibility});assert.deepEqual(runtimeErrors,[]);
        if(width===1440&&repeat===1){await page.getByRole('button',{name:'PDF・印刷プレビュー',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.manual-print-step').length===12&&!document.querySelector('.manual-print-toolbar .primary').disabled);assert.equal(await page.locator('.manual-print-step img').count(),12);await page.pdf({path:`${directory}/manual-print-evidence.pdf`,format:'A4',printBackground:true,margin:{top:'15mm',bottom:'15mm',left:'14mm',right:'14mm'}});await page.getByRole('button',{name:'編集に戻る',exact:true}).click();}
        await page.close();
      }
    }
    await writeFile(`${directory}/evidence.json`,JSON.stringify({candidateCommit:process.env.GITHUB_SHA||null,browser:browser.version(),conditions:{runner:'GitHub Actions',network:'synthetic local HTTP fixture; no network throttling',cpu:'runner default; no CPU throttling',cache:'fresh browser context each repeat',locale:'ja-JP',timezone:'Asia/Tokyo',reducedMotion:true,repeatCount:3},limitations:['Lab measurements are not field p75 Core Web Vitals','Automation-observed image-ready task duration is not INP','Computed/semantic checks are not human screen-reader validation','PDF requires separate rendered-page inspection'],reports},null,2)+'\n');
  }finally{await browser?.close();server.closeAllConnections?.();await new Promise(r=>server.close(r));}
});
