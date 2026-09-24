/*
 * Enter que "nao pega": quando o cursor fica FORA de uma linha (clique depois do
 * ultimo bloco, editor vazio, no solto), o keydown saia antes do preventDefault e
 * o `beforeinput` cancelava a insercao -> nada acontecia. Agora o Enter leva o
 * cursor para a linha certa e a quebra sempre acontece.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:960},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const html=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('**/*',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:html}):r.abort());
 await page.goto('http://notes.test');
 for(const f of ['styles.css','notes/editor.css'])await page.addStyleTag({content:read(f)});
 for(const f of ['notes/editor.js'])await page.addScriptTag({content:read(f)});
 const source=read('app.js');await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});
 await page.evaluate(()=>{
  document.documentElement.dataset.theme='light';window.app=Object.create(TestApp.prototype);app.userId=1;app.projectsData=[{id:1,nome:'Teste',notas:''}];app.focusStagesData=[{id:2,foco_id:1,titulo:'Etapa',notas:''}];app.ensureNotesFocusPage=()=>{};app.showToast=()=>{};if(!TestApp.prototype.__motorInstalado){installNotesEditor(TestApp);if(typeof installNotesExtras==='function')installNotesExtras(TestApp);TestApp.prototype.__motorInstalado=true;}if(app.setupEventListeners)app.setupEventListeners();app.setupModalListeners();
  window.loadNote=async html=>{clearTimeout(app.notesSaveTimer);app.notesSession=null;app.projectsData[0].notas=html;localStorage.clear();await app.openNotesModal(1);};
  window.cursorEditor=(offset)=>{const e=document.getElementById('notesEditor');e.focus();const r=document.createRange();r.setStart(e,offset);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();};
  window.linhas=()=>[...document.querySelectorAll('#notesEditor .notes-line')].length;
  window.textos=()=>[...document.querySelectorAll('#notesEditor .notes-line-text')].map(t=>t.textContent);
 });
 const load=async html=>{await page.evaluate(h=>loadNote(h),html);await page.waitForTimeout(300);};
 const linha='<div class="notes-line" data-level="0"><div class="notes-line-text">Um</div></div><div class="notes-line" data-level="0"><div class="notes-line-text">Dois</div></div>';

 // (a) cursor no editor, DEPOIS do ultimo bloco
 await load(linha);
 await page.evaluate(()=>cursorEditor(document.getElementById('notesEditor').children.length));
 await page.keyboard.press('Enter');await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>linhas()),3,'quebra quando o cursor esta no editor (depois do ultimo bloco)');
 await page.keyboard.type('X');await page.waitForTimeout(100);
 assert.deepEqual(await page.evaluate(()=>textos()),['Um','Dois','X'],'digitacao cai na linha nova');

 // (b) cursor no editor, ANTES do primeiro bloco
 await load(linha);
 await page.evaluate(()=>cursorEditor(0));
 await page.keyboard.press('Enter');await page.waitForTimeout(150);
 assert.equal(await page.evaluate(()=>linhas()),3,'quebra quando o cursor esta no editor (antes do primeiro bloco)');

 // (c) editor praticamente vazio (sem .notes-line) com o foco
 await load('');
 await page.evaluate(()=>{const e=document.getElementById('notesEditor');e.innerHTML='';e.focus();const r=document.createRange();r.setStart(e,0);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();});
 await page.keyboard.press('Enter');await page.waitForTimeout(150);
 assert.ok(await page.evaluate(()=>linhas())>=1,'Enter em editor vazio cria/usa uma linha');
 await page.keyboard.type('Vazio');await page.waitForTimeout(100);
 assert.ok((await page.evaluate(()=>textos())).includes('Vazio'),'digitacao funciona depois do Enter em editor vazio');

 assert.deepEqual(errors,[]);
 console.log('OK: Enter sempre quebra (mesmo com o cursor fora de uma linha)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
