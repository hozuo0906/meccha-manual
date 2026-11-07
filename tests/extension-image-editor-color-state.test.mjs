import assert from 'node:assert/strict';
import test from 'node:test';
import { createImageEditor } from '../apps/extension/editor/image-editor.js';
class Element {
 constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.attrs=new Map();this.listeners=new Map();this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.style={setProperty(){}};}
 append(...children){for(const c of children){c.parentElement=this;this.children.push(c)}}
 replaceChildren(...children){this.children=[];this.append(...children)}
 remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(c=>c!==this)}
 setAttribute(k,v){this.attrs.set(k,String(v))}getAttribute(k){return this.attrs.get(k)||null}removeAttribute(k){this.attrs.delete(k)}
 addEventListener(k,f,options={}){const rows=this.listeners.get(k)||[];rows.push({f,signal:options.signal});this.listeners.set(k,rows)}
 async fire(k,event={}){for(const {f,signal}of this.listeners.get(k)||[])if(!signal?.aborted)await f({target:this,preventDefault(){},stopPropagation(){},...event})}
 focus(){document.activeElement=this}
 querySelectorAll(selector){const all=this.children.flatMap(c=>[c,...c.querySelectorAll('*')]);return selector==='button'?all.filter(c=>c.tagName==='BUTTON'):selector==='*'?all:[]}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null}
 contains(node){return node===this||this.querySelectorAll('*').includes(node)}closest(){return null}
 show(){this.open=true}showModal(){this.open=true}close(){this.open=false}
 getContext(){return new Proxy({canvas:this},{get(o,k){return k in o?o[k]:()=>{}}})}
}
function setup(t){
 const previousDocument=globalThis.document, previousImage=globalThis.Image;
 t.after(()=>{globalThis.document=previousDocument;globalThis.Image=previousImage});
 const dialog=new Element('dialog'),canvas=new Element('canvas'),host=new Element();host.append(canvas);
 const status=new Element(),hex=new Element('input'),color=new Element('input'),property=new Element(),selection=new Element(),save=new Element('button'),cancel=new Element('button'),tool=new Element('button'),form=new Element('form');tool.dataset.editorTool='select';
 property.append(hex,color);dialog.append(form,status,property,selection,save,cancel,tool,host);
 const selectors={'[data-editor-status]':status,'[data-editor-color]':color,'[data-editor-color-hex]':hex,'.property-group':property,'[data-editor-save]':save,'[data-editor-selection]':selection,'[data-editor-cancel]':cancel,'[data-editor-tool="select"]':tool,form};
 dialog.querySelector=s=>selectors[s]||null;dialog.querySelectorAll=s=>s==='[data-editor-cancel]'?[cancel]:s==='[data-editor-tool]'?[tool]:[];
 globalThis.document={activeElement:null,body:new Element('body'),createElement:t=>new Element(t)};globalThis.Image=class{width=100;height=100;async decode(){}};
 let saved=0,output;
 const screenshot={dataUrl:'data:image/png;base64,AA==',annotations:[{id:'rect',type:'rectangle',x:.1,y:.1,width:.3,height:.3,color:'#087f7a',strokeWidth:2}],masks:[]};
 const editor=createImageEditor({dialog,canvas,screenshot,inline:true,onSave:async value=>{saved++;output=value;return true}});
 t.after(()=>editor.dispose());
 return {editor,dialog,canvas,hex,color,property,selection,save,cancel,status,screenshot,saved:()=>saved,output:()=>output};
}

// The real module/event handlers run here; the DOM and bitmap are synthetic.
// These tests verify editor state and save calls, not pixels or native Chrome.
test('invalid selected color blocks Apply until corrected', async t => {
  const h = setup(t);
  await h.editor.open();
  await h.selection.children[0].children[0].fire('click');
  h.hex.focus();
  h.hex.value = '#12';
  await h.hex.fire('input');
  await h.save.fire('click');
  assert.equal(h.saved(), 0);
  assert.equal(h.property.hidden, false);
  assert.equal(h.hex.getAttribute('aria-invalid'), 'true');
  h.hex.value = '#A14EBA';
  await h.hex.fire('input');
  await h.save.fire('click');
  assert.equal(h.saved(), 1);
  assert.equal(h.output().annotations[0].color, '#a14eba');
});

test('deleting the invalid-color annotation permits applying its removal', async t => {
  const h = setup(t);
  await h.editor.open();
  await h.selection.children[0].children[0].fire('click');
  h.hex.focus();
  h.hex.value = '#12';
  await h.hex.fire('input');
  await h.selection.children[0].children[1].fire('click');
  assert.equal(h.property.hidden, true);
  assert.notEqual(h.hex.getAttribute('aria-invalid'), 'true');
  await h.save.fire('click');
  assert.equal(h.saved(), 1);
  assert.deepEqual(h.output().annotations, []);
});

test('Undo clears irrelevant invalid-color input and saves the restored annotation', async t => {
  const h = setup(t);
  await h.editor.open();
  await h.selection.children[0].children[0].fire('click');
  h.hex.focus();
  h.hex.value = '#112233';
  await h.hex.fire('input');
  h.hex.value = '#12';
  await h.hex.fire('input');
  await h.dialog.fire('keydown', { key: 'z', ctrlKey: true, target: h.canvas });
  assert.equal(h.property.hidden, true);
  assert.notEqual(h.hex.getAttribute('aria-invalid'), 'true');
  await h.save.fire('click');
  assert.equal(h.saved(), 1);
  assert.equal(h.output().annotations[0].color, '#087f7a');
});

test('Cancel then reopen an annotation-free image resets shared dialog validation', async t => {
  const h = setup(t);
  await h.editor.open();
  await h.selection.children[0].children[0].fire('click');
  h.hex.value = '#12';
  await h.hex.fire('input');
  await h.cancel.fire('click');
  h.editor.dispose();
  let saved = 0, output;
  const second = createImageEditor({
    dialog: h.dialog,
    canvas: h.canvas,
    screenshot: { ...h.screenshot, annotations: [] },
    inline: true,
    onSave: async value => { saved++; output = value; return true; }
  });
  t.after(() => second.dispose());
  await second.open();
  assert.equal(h.property.hidden, true);
  assert.notEqual(h.hex.getAttribute('aria-invalid'), 'true');
  await h.save.fire('click');
  assert.equal(saved, 1);
  assert.deepEqual(output.annotations, []);
});
