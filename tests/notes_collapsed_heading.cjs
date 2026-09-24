/*
 * Título recolhido + cursor no fim + Enter: a linha criada ABAIXO herda a
 * formatação do título, seja ele de linha (`data-heading`) ou INLINE
 * (`span [data-inline-heading]`, criado quando o H1..H3 é aplicado a uma seleção).
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
  window.caretFim=()=>{const t=document.querySelector('#notesEditor .notes-line-text');const r=document.createRange();r.selectNodeContents(t);r.collapse(false);getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();};
  window.ultima=()=>{const linhas=[...document.querySelectorAll('#notesEditor .notes-line')],u=linhas.at(-1);const t=u.querySelector('.notes-line-text');return {heading:u.dataset.heading||'',outlineBreak:u.dataset.outlineBreak||'',size:getComputedStyle(t).fontSize,bold:getComputedStyle(t).fontWeight,linhas:linhas.length};};
 });
 const rodar=async html=>{await page.evaluate(h=>loadNote(h),html);await page.waitForTimeout(400);await page.evaluate(()=>caretFim());await page.keyboard.press('Enter');await page.waitForTimeout(180);return page.evaluate(()=>ultima());};
 const filho='<div class="notes-line" data-level="1"><div class="notes-line-text">filho</div></div>';

 // (a) título de linha (data-heading)
 const linha=await rodar('<div class="notes-line" data-level="0" data-heading="1" data-collapsed="true"><div class="notes-line-text">Titulo</div></div>'+filho);
 assert.equal(linha.linhas,3,'criou a linha de baixo');
 assert.equal(linha.heading,'1','titulo de linha replicado (data-heading)');
 assert.equal(linha.bold,'700','negrito do titulo replicado');
 assert.equal(linha.size,'24px','tamanho do titulo replicado');

 // (b) título INLINE (aplicado a uma seleção)
 const inline=await rodar('<div class="notes-line" data-level="0" data-collapsed="true"><div class="notes-line-text"><span data-inline-heading="1">Titulo</span></div></div>'+filho);
 assert.equal(inline.linhas,3,'criou a linha de baixo');
 assert.equal(inline.heading,'1','titulo INLINE replicado na linha de baixo');
 assert.equal(inline.bold,'700','negrito do titulo inline replicado');
 assert.equal(inline.size,'24px','tamanho do titulo inline replicado');

 // (c) lista recolhida continua seguindo o fluxo (filho), sem virar título
 const lista=await rodar('<div class="notes-line" data-level="0" data-list="ol" data-check="true" data-checked="false" data-check-number="1" data-collapsed="true"><div class="notes-line-text">Item</div></div><div class="notes-line" data-level="1" data-list="ol" data-check="true" data-checked="false"><div class="notes-line-text">Sub</div></div>');
 assert.equal(lista.heading,'','lista recolhida NAO vira titulo');
 assert.equal(lista.linhas,3,'lista recolhida segue o fluxo (novo item)');
 assert.deepEqual(errors,[]);
 console.log('OK: Enter em titulo recolhido replica a formatacao (linha e inline) e listas seguem o fluxo');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
