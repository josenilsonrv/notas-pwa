// 🧪 [INÍCIO: TESTE - NOTES CHECKLIST ENTER]
/*
 * Enter em lista com check + numerada: a quebra mantém a continuidade (novo item
 * com check/lista e numeração seguinte) e o FOCO vai para o item novo (o anterior
 * não pode ficar com o cursor — revisão do bloco de notas).
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
  window.selectText=(a,start,b=a,end=start)=>{document.getElementById('notesEditor').focus();const rows=[...document.querySelectorAll('#notesEditor .notes-line-text')];function point(row,n){const w=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let t=w.nextNode();while(t&&n>t.length){n-=t.length;t=w.nextNode();}return t?[t,n]:[row,0];}const r=document.createRange();r.setStart(...point(rows[a],start));r.setEnd(...point(rows[b],end));getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();};
  window.caretLine=()=>{const n=getSelection().anchorNode,el=n&&(n.nodeType===3?n.parentElement:n),line=el&&el.closest&&el.closest('.notes-line');return line?line.querySelector('.notes-line-text').textContent:null;};
 });
 const load=async html=>{await page.evaluate(h=>loadNote(h),html);await page.waitForTimeout(400);};
 const linha=(t,i)=>`<div class="notes-line" data-level="0" data-list="ol" data-check="true" data-checked="false" data-check-number="${i+1}"><div class="notes-line-text">${t}</div></div>`;

 // Enter no fim de "A": novo item entre A e B, com foco nele.
 await load(['A','B','C'].map(linha).join(''));
 await page.evaluate(()=>selectText(0,1));
 await page.keyboard.press('Enter');
 await page.waitForTimeout(180);
 const dados=await page.evaluate(()=>{
  const linhas=[...document.querySelectorAll('#notesEditor .notes-line')];
  return {
   textos:linhas.map(r=>r.querySelector('.notes-line-text').textContent),
   niveis:linhas.map(r=>r.dataset.level),
   checks:linhas.map(r=>r.dataset.check),
   listas:linhas.map(r=>r.dataset.list),
   marcadores:[...document.querySelectorAll('.notes-line-marker')].map(m=>m.textContent),
   foco:caretLine()
  };
 });
 assert.deepEqual(dados.textos,['A','','B','C'],'quebra com continuidade (novo item logo apos o atual)');
 assert.deepEqual(dados.niveis,['0','0','0','0'],'mesmo nivel da lista');
 assert.ok(dados.checks.every(c=>c==='true'),'o novo item continua checklist');
 assert.ok(dados.listas.every(l=>l==='ol'),'o novo item continua numerado');
 assert.deepEqual(dados.marcadores,['1.','2.','3.','4.'],'numeracao segue abaixo');
 assert.equal(dados.foco,'','o foco/ponteiro esta no ITEM NOVO (vazio), nao no anterior');

 // Digitar continua no novo item.
 await page.keyboard.type('AA');
 await page.waitForTimeout(120);
 assert.deepEqual(await page.locator('#notesEditor .notes-line-text').allTextContents(),['A','AA','B','C'],'digitacao cai no item novo');
 assert.deepEqual(errors,[]);
 console.log('OK: Enter em lista com check+numerada mantem continuidade e foca o item seguinte');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES CHECKLIST ENTER]
