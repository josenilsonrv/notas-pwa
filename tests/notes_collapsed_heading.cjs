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
  const info=el=>{const t=el.querySelector('.notes-line-text');return {heading:el.dataset.heading||'',level:el.dataset.level,list:el.dataset.list||'',collapsed:el.dataset.collapsed||'',size:getComputedStyle(t).fontSize,bold:getComputedStyle(t).fontWeight};};
  window.linhas=()=>[...document.querySelectorAll('#notesEditor .notes-line')];
  // Recolhido: a linha criada e IRMA (entra depois do grupo, no fim).
  window.criadaNoFim=()=>{const l=[...document.querySelectorAll('#notesEditor .notes-line')];return {...info(l.at(-1)),total:l.length};};
  // Aberto/sem colapso: a linha criada e FILHA (entra logo apos o pai).
  window.criadaComoFilho=()=>{const l=[...document.querySelectorAll('#notesEditor .notes-line')];return {...info(l[1]),total:l.length};};
 });
 const rodar=async (html,coletor)=>{await page.evaluate(h=>loadNote(h),html);await page.waitForTimeout(400);await page.evaluate(()=>caretFim());await page.keyboard.press('Enter');await page.waitForTimeout(180);return page.evaluate(c=>window[c](),coletor);};
 const filho='<div class="notes-line" data-level="1"><div class="notes-line-text">filho</div></div>';

 // (a) RECOLHIDO: titulo de linha -> IRMAO (mesmo nivel) herdando a formatacao
 const linha=await rodar('<div class="notes-line" data-level="0" data-heading="1" data-collapsed="true"><div class="notes-line-text">Titulo</div></div>'+filho,'criadaNoFim');
 assert.equal(linha.total,3,'criou a linha de baixo');
 assert.equal(linha.level,'0','recolhido cria IRMAO (nao e filho)');
 assert.equal(linha.heading,'1','titulo de linha replicado (data-heading)');
 assert.equal(linha.bold,'700','negrito do titulo replicado');
 assert.equal(linha.size,'24px','tamanho do titulo replicado');

 // (b) RECOLHIDO: titulo INLINE (aplicado a seleção) -> IRMAO com a formatacao
 const inline=await rodar('<div class="notes-line" data-level="0" data-collapsed="true"><div class="notes-line-text"><span data-inline-heading="1">Titulo</span></div></div>'+filho,'criadaNoFim');
 assert.equal(inline.total,3,'criou a linha de baixo');
 assert.equal(inline.level,'0','tambem e IRMAO (nao indentado)');
 assert.equal(inline.heading,'1','titulo INLINE replicado');
 assert.equal(inline.bold,'700','negrito do titulo inline replicado');
 assert.equal(inline.size,'24px','tamanho do titulo inline replicado');

 // (c) RECOLHIDO: pai de lista -> IRMAO herdando a lista (nao vira titulo)
 const lista=await rodar('<div class="notes-line" data-level="0" data-list="ol" data-check="true" data-checked="false" data-check-number="1" data-collapsed="true"><div class="notes-line-text">Item</div></div><div class="notes-line" data-level="1" data-list="ol" data-check="true" data-checked="false"><div class="notes-line-text">Sub</div></div>','criadaNoFim');
 assert.equal(lista.heading,'','lista recolhida NAO vira titulo');
 assert.equal(lista.level,'0','recolhido cria IRMAO (mesmo nivel)');
 assert.equal(lista.list,'ol','mantem a lista');
 assert.equal(lista.total,3,'criou o item');

 // (d) ABERTO (com botao) + cursor no fim: a linha criada e FILHA e SEM a formatacao
 const aberto=await rodar('<div class="notes-line" data-level="0" data-heading="1" data-collapsed="false"><div class="notes-line-text">Titulo</div></div>'+filho,'criadaComoFilho');
 assert.equal(aberto.total,3,'criou a linha');
 assert.equal(aberto.level,'1','aberto cria FILHO (indentado)');
 assert.equal(aberto.heading,'','filho NAO herda a formatacao do titulo');
 assert.equal(aberto.bold,'400','filho nao e negrito');

 // (e) SEM botao de colapso (titulo isolado) + cursor no fim: linha irma simples
 const semBotao=await rodar('<div class="notes-line" data-level="0" data-heading="1"><div class="notes-line-text">Titulo</div></div>','criadaNoFim');
 assert.equal(semBotao.total,2,'criou a linha');
 assert.equal(semBotao.level,'0','sem filhos cria irmao no mesmo nivel');

 assert.deepEqual(errors,[]);
 console.log('OK: recolhido cria IRMAO herdando a formatacao; aberto/sem botao cria FILHO sem a formatacao');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
