import { EDITOR_TOOLS_JS } from "../apps/worker/src/editor-tools-assets.ts";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import test from "node:test";
import { chromium } from "./support/test-browser.mjs";
import { CLOUD_MANUAL_CSS, CLOUD_MANUAL_JS, renderCloudManualsPage } from "../apps/worker/src/cloud-manual-assets.ts";

test("20-step cloud editing preserves step 17 through reorder, undo, save and keyboard share dismissal at three widths and 200%-equivalent reflow", {timeout:120_000}, async () => {
  let version=1;
  const state={manual:{id:"manual-preview",title:"顧客情報を更新する"},draft:{id:"draft-preview",title:"顧客情報を更新する",description:"合成データ",updatedAt:"v1",contentVersion:"a".repeat(32)},steps:Array.from({length:20},(_,index)=>({id:"step-"+(index+1),position:index+1,type:"action",title:["顧客一覧を開く","詳細を確認する","情報を入力する","変更内容を確認する","保存する"][index%5],instruction:"内容を確認して保存します",assetId:"image-1",assetUrl:"/image.svg",actionType:"click",targetText:null,url:null})),permissions:{canEdit:true}};
  const image='<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="660"><rect width="1200" height="660" fill="#ffffff"/><rect width="1200" height="64" fill="#eaf2f4"/><text x="32" y="42" font-size="26" fill="#193039">サンプル顧客管理</text><text x="40" y="126" font-size="32" fill="#193039">顧客情報を確認</text><rect x="180" y="180" width="970" height="68" fill="#f6fafb" stroke="#cbdadc"/><text x="40" y="224" font-size="26" fill="#526671">氏名</text><text x="200" y="224" font-size="26" fill="#193039">山田 花子</text><rect x="920" y="534" width="224" height="72" fill="#087f7a"/><text x="970" y="580" font-size="27" fill="white">保存する</text></svg>';
  const server=createServer(async(request,response)=>{
    const path=new URL(request.url,"http://localhost").pathname;
    const send=(body,type="application/json")=>{response.setHeader("content-type",type);response.end(type==="application/json"?JSON.stringify(body):body)};
    if(path==="/manuals")return send(renderCloudManualsPage({workspaceId:"workspace-preview"}),"text/html;charset=utf-8");
    if(path==="/assets/cloud-manual.css")return send(CLOUD_MANUAL_CSS,"text/css");
    if(path==="/assets/editor-tools.js")return send(EDITOR_TOOLS_JS,"application/javascript");
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
    // 683x450 CSS px exercises the layout viewport of a 1366x900 window at
    // 200% zoom. This is reflow-equivalent coverage, not actual browser zoom.
    for(const [width,height] of [[1366,900],[1024,768],[390,844],[683,450]]) {
      const page=await browser.newPage({viewport:{width,height},reducedMotion:"reduce"}); const errors=[];page.on("pageerror",e=>errors.push(e.message));
      await page.goto("http://127.0.0.1:"+server.address().port+"/manuals");await page.getByRole("button",{name:"顧客情報を更新する",exact:true}).click();
      if(width<=760)await page.locator(".manual-mobile-actions").getByRole("button",{name:"手順",exact:true}).click();
      await page.locator('[data-step-key="step-17"]').first().click();
      assert.equal(await page.locator(".cloud-step").count(),1);
      const active=()=>page.locator(".cloud-step");assert.equal(await active().getAttribute("data-step-key"),"step-17");
      if(width===1366) {
        await page.locator('.manual-step-nav [data-step-key="step-17"]').focus();
        await page.keyboard.press("ArrowUp");assert.equal(await active().getAttribute("data-step-key"),"step-16");
        await page.keyboard.press("ArrowDown");assert.equal(await active().getAttribute("data-step-key"),"step-17");
        assert.equal(await page.evaluate(()=>document.activeElement?.dataset.stepKey),"step-17");
        await page.screenshot({path:".artifacts/uiux-20261001/screens/cloud-keyboard-step-navigation.png",fullPage:true});
      }
      await active().getByRole("textbox",{name:/の説明/}).fill("17番の説明を修正しました");
      await active().getByRole("button",{name:"上へ",exact:true}).click();assert.equal(await active().getAttribute("data-step-key"),"step-17");
      await active().getByRole("button",{name:"この手順を削除"}).click();assert.notEqual(await active().getAttribute("data-step-key"),"step-17");
      if(width<=1100)await page.getByRole("button",{name:width<=760?"編集":"画像・編集",exact:true}).click();
      await page.getByRole("button",{name:"取り消す",exact:true}).click();assert.equal(await active().getAttribute("data-step-key"),"step-17");assert.equal(await page.locator(".manual-step-nav li").count(),20);
      await page.getByRole("button",{name:"変更を保存",exact:true}).click();await page.waitForFunction(()=>document.querySelector(".cloud-save-state")?.textContent==="クラウドに保存済み");
      assert.equal(await active().getAttribute("data-step-key"),"step-17");assert.equal(await active().getByRole("textbox",{name:/の説明/}).inputValue(),"17番の説明を修正しました");
      await page.waitForFunction(()=>document.querySelector(".cloud-step-image")?.naturalWidth>0);
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
      if(width===1024){const pane=await page.locator(".manual-step-center").boundingBox();assert.ok(pane.y+pane.height>=height-1,"Tablet editing uses the full remaining viewport");}
      await page.screenshot({path:`.artifacts/uiux-20261001/screens/cloud-${width}-step17.png`,fullPage:true});
      const share=page.getByRole("button",{name:"共有",exact:true});await share.focus();await page.keyboard.press("Enter");await page.getByLabel("パスコード（12〜128文字）").waitFor();
      assert.equal(await page.locator(".manual-share-drawer").getByRole("button",{name:"閉じる",exact:true}).evaluate(node=>document.activeElement===node),true);
      await page.keyboard.press("Tab");
      assert.equal(await page.locator(".manual-share-drawer").evaluate(node=>node.contains(document.activeElement)),true,"Tab moves into the share controls");
      await page.screenshot({path:`.artifacts/uiux-20261001/screens/cloud-${width}-share.png`,fullPage:true});
      await page.keyboard.press("Escape");assert.equal(await share.evaluate(node=>document.activeElement===node),true);assert.equal(await active().getAttribute("data-step-key"),"step-17");
      assert.equal(await page.locator(".manual-share-drawer").isVisible(),false);
      await page.screenshot({path:`.artifacts/uiux-20261001/screens/cloud-${width}-keyboard-focus-restored.png`,fullPage:true});
      await writeFile(`.artifacts/uiux-20261001/screens/cloud-${width}-operations.json`,JSON.stringify({
        candidateCommit:process.env.GITHUB_SHA||null,fixture:"synthetic-cloud-editor-mock-API",viewport:{width,height},
        reflow:width===683?{equivalentZoomPercent:200,referenceViewport:{width:1366,height:900},actualBrowserZoomTested:false}:null,
        operations:[...(width===1366?["ArrowUp-to-step16","ArrowDown-to-step17"]:[]),"edit-step17","move-up","delete","undo","save","Enter-opens-share","Tab-enters-share-form","Escape-closes-share"],
        selectedStep:await active().getAttribute("data-step-key"),stepCount:await page.locator(".manual-step-nav li").count(),
        saveState:await page.locator(".cloud-save-state").textContent(),focusReturnedToShare:await share.evaluate(node=>document.activeElement===node),
        horizontalOverflow:await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),reducedMotion:await page.evaluate(()=>matchMedia("(prefers-reduced-motion: reduce)").matches),
        screenshots:[`cloud-${width}-step17.png`,`cloud-${width}-share.png`,`cloud-${width}-keyboard-focus-restored.png`]
      },null,2)+"\n");
      // Retain the original pointer dismissal regression alongside keyboard coverage.
      await share.click();
      await page.locator(".manual-share-drawer").getByRole("button",{name:"閉じる",exact:true}).click();
      assert.equal(await share.evaluate(node=>document.activeElement===node),true);assert.equal(await active().getAttribute("data-step-key"),"step-17");
      assert.deepEqual(errors,[]);await page.close();
    }
  } finally {await browser?.close();server.closeAllConnections?.();await new Promise(resolve=>server.close(resolve));}
});
