import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir } from "node:fs/promises";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";

test("20-step cloud editing preserves step 17 through reorder, undo, save and share dismissal at three widths", {timeout:90_000}, async () => {
  let version=1;
  const state={manual:{id:"manual-preview",title:"顧客情報を更新する"},draft:{id:"draft-preview",title:"顧客情報を更新する",description:"合成データ",updatedAt:"v1",contentVersion:"a".repeat(32)},steps:Array.from({length:20},(_,index)=>({id:"step-"+(index+1),position:index+1,type:"action",title:"操作 "+(index+1),instruction:"内容を確認して保存します",assetId:"image-1",assetUrl:"/image.svg",actionType:"click",targetText:null,url:null})),permissions:{canEdit:true}};
  const image='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660"><rect width="1200" height="660" fill="#ffffff"/><rect width="1200" height="64" fill="#eaf2f4"/><text x="32" y="42" font-size="26" fill="#193039">サンプル顧客管理</text><text x="40" y="126" font-size="32" fill="#193039">顧客情報を確認</text><rect x="180" y="180" width="970" height="68" fill="#f6fafb" stroke="#cbdadc"/><text x="40" y="224" font-size="26" fill="#526671">氏名</text><text x="200" y="224" font-size="26" fill="#193039">山田 花子</text><rect x="920" y="534" width="224" height="72" fill="#087f7a"/><text x="970" y="580" font-size="27" fill="white">保存する</text></svg>';
  const server=createServer(async(request,response)=>{
    const path=new URL(request.url,"http://localhost").pathname;
    const send=(body,type="application/json")=>{response.setHeader("content-type",type);response.end(type==="application/json"?JSON.stringify(body):body)};
    if(path==="/manuals")return send(renderCloudManualsPage({workspaceId:"workspace-preview"}),"text/html;charset=utf-8");
    if(path==="/assets/cloud-manual.css")return send(CLOUD_MANUAL_CSS,"text/css");
    if(path==="/assets/cloud-manual.js")return send(CLOUD_MANUAL_JS,"application/javascript");
    if(path==="/image.svg")return send(image,"image/svg+xml");
    if(path.endsWith("/share-links"))return send({share:null});
    if(path==="/api/workspaces/workspace-preview/manuals")return send({manuals:[state.manual]});
    if(path==="/api/workspaces/workspace-preview/manuals/manual-preview")return send(state);
    if(path.endsWith("/draft")&&request.method==="PATCH") { let text="";for await(const chunk of request)text+=chunk; const next=JSON.parse(text);state.draft={...state.draft,title:next.title,description:next.description,updatedAt:"v"+(++version)};state.manual.title=next.title;state.steps=next.steps.map((step,index)=>({...step,position:index+1,assetUrl:step.assetId?"/image.svg":null}));return send({status:"saved",updatedAt:state.draft.updatedAt}); }
    response.writeHead(404).end();
  });
  await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));
  let browser;
  try {
    browser=await chromium.launch({channel:"chromium",headless:true});
    await mkdir(".artifacts/uiux-20261001/screens",{recursive:true});
    for(const [width,height] of [[1366,900],[1024,768],[390,844]]) {
      const page=await browser.newPage({viewport:{width,height}}); const errors=[];page.on("pageerror",e=>errors.push(e.message));
      await page.goto("http://127.0.0.1:"+server.address().port+"/manuals");await page.getByRole("button",{name:"顧客情報を更新する",exact:true}).click();
      await page.locator('[data-step-key="step-17"]').first().click();
      assert.equal(await page.locator(".cloud-step").count(),1);
      const active=()=>page.locator(".cloud-step");assert.equal(await active().getAttribute("data-step-key"),"step-17");
      await active().getByRole("textbox",{name:/の説明/}).fill("17番の説明を修正しました");
      await active().getByRole("button",{name:"上へ",exact:true}).click();assert.equal(await active().getAttribute("data-step-key"),"step-17");
      await active().getByRole("button",{name:"この手順を削除"}).click();assert.notEqual(await active().getAttribute("data-step-key"),"step-17");
      await page.getByRole("button",{name:"取り消す",exact:true}).click();assert.equal(await active().getAttribute("data-step-key"),"step-17");assert.equal(await page.locator(".manual-step-nav li").count(),20);
      await page.getByRole("button",{name:"変更を保存",exact:true}).click();await page.waitForFunction(()=>document.querySelector(".cloud-save-state")?.textContent==="クラウドに保存済み");
      assert.equal(await active().getAttribute("data-step-key"),"step-17");assert.equal(await active().getByRole("textbox",{name:/の説明/}).inputValue(),"17番の説明を修正しました");
      await page.waitForFunction(()=>document.querySelector(".cloud-step-image")?.naturalWidth>0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      await page.screenshot({path:`.artifacts/uiux-20261001/screens/cloud-${width}-step17.png`,fullPage:true});
      const share=page.getByRole("button",{name:"共有",exact:true});await share.click();await page.getByLabel("パスコード（12〜128文字）").waitFor();
      await page.screenshot({path:`.artifacts/uiux-20261001/screens/cloud-${width}-share.png`,fullPage:true});
      await page.getByRole("button",{name:"閉じる",exact:true}).click();assert.equal(await share.evaluate(node=>document.activeElement===node),true);assert.equal(await active().getAttribute("data-step-key"),"step-17");
      assert.deepEqual(errors,[]);await page.close();
    }
  } finally {await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
});
