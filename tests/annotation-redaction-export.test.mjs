import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudImageLayers, drawScreenshot } from '../apps/extension/editor/image-renderer.js';
import { cleanDraft } from '../apps/extension/background/cloud-claim.js';
const secret='SYNTHETIC_REDACTED_TEXT_CANARY';
const annotation={id:'text-canary',type:'text',x:.1,y:.1,width:.7,height:.2,text:secret,color:'#a14eba',fontSize:24,strokeWidth:3};
for(const mask of [{x:0,y:0,width:1,height:1},{x:.12,y:.12,width:.1,height:.05}])test('masked annotation is irreversibly flattened and absent from every public claim field '+mask.width,()=>{
 const screenshot={id:'image',dataUrl:'data:image/png;base64,AA==',annotations:[annotation],masks:[mask]};const layers=cloudImageLayers(screenshot);assert.deepEqual(layers.annotations,[]);assert.deepEqual(layers.baseAnnotations,[annotation]);
 const draft={title:'手順書',description:'合成',steps:[{id:'step',order:1,instruction:'確認する',screenshotId:'image'}],screenshots:[screenshot]};const clean=cleanDraft(draft);assert.ok(clean);assert.ok(!JSON.stringify(clean).includes(secret));assert.deepEqual(clean.steps[0].annotations||[],[]);assert.deepEqual(clean.screenshots[0].annotations||[],[]);
 const calls=[];const context={canvas:{},save(){},restore(){},clearRect(){},drawImage(){calls.push('base')},fillText(){calls.push('text')},fillRect(){calls.push('mask')}};drawScreenshot(context,{width:1200,height:660},{annotations:layers.baseAnnotations,masks:layers.masks});assert.deepEqual(calls.slice(-2),['text','mask']);
});
test('unmasked annotations remain editable and invalid redaction fails closed',()=>{const layers=cloudImageLayers({annotations:[annotation],masks:[]});assert.deepEqual(layers.baseAnnotations,[]);assert.equal(layers.annotations[0].text,secret);assert.throws(()=>cloudImageLayers({annotations:[annotation],masks:[{x:0,y:0,width:2,height:1}]}));});
