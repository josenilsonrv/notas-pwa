// 🧪 [INÍCIO: TESTE - NOTES INDENT LEVELS]
/*
 * Indentação do bloco de notas:
 * - teto de 4 níveis (0..4), incluindo saneamento de documentos antigos;
 * - recuo/desrecuo normais continuam funcionando;
 * - Tab/Shift+Tab e rótulos (Tab)/(Shift+Tab) nos botões.
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
  document.documentElement.dataset.theme="light";window.app=Object.create(TestApp.prototype);app.userId=1;app.projectsData=[{id:1,nome:'Teste',notas:''}];app.focusStagesData=[{id:2,foco_id:1,titulo:'Etapa',notas:''}];app.ensureNotesFocusPage=()=>{};app.showToast=()=>{};if(!TestApp.prototype.__motorInstalado){installNotesEditor(TestApp);if(typeof installNotesExtras==='function')installNotesExtras(TestApp);if(typeof installNotesTables==='function')installNotesTables(TestApp);if(typeof installLocalNotesStorage==='function')installLocalNotesStorage(TestApp);TestApp.prototype.__motorInstalado=true;}if(app.setupEventListeners)app.setupEventListeners();app.setupModalListeners();
  window.loadNote=async html=>{clearTimeout(app.notesSaveTimer);app.notesSession=null;app.projectsData[0].notas=html;localStorage.clear();await app.openNotesModal(1);};
  window.selectText=(a,start,b=a,end=start)=>{document.getElementById('notesEditor').focus();const rows=[...document.querySelectorAll('#notesEditor .notes-line-text')];function point(row,n){const w=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let t=w.nextNode();while(t&&n>t.length){n-=t.length;t=w.nextNode();}return t?[t,n]:[row,0];}const r=document.createRange();r.setStart(...point(rows[a],start));r.setEnd(...point(rows[b],end));getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();};
 });
 const load=async html=>{await page.evaluate(html=>loadNote(html),html);await page.waitForTimeout(400);await page.locator('#notesEditor').click();};
 const select=async(a,s)=>page.evaluate(args=>selectText(...args),[a,s]);
 const levels=()=>page.locator('#notesEditor .notes-line').evaluateAll(rs=>rs.map(r=>r.dataset.level));

 // ------------------------------------------------------------------ modelo
 const modelo=await page.evaluate(()=>{
  const b=(id,level)=>({id,level,props:{},content:[{type:'text',text:id}],attributes:[],classes:['notes-line'],textAttributes:[[]]});
  const cap=new NotesDocument({blocks:[b('pai',4),b('alvo',4)]});cap.indent(['alvo'],1);
  const altos=new NotesDocument({blocks:[b('fundo',9)]});
  const normal=new NotesDocument({blocks:[b('a',0),b('b',0)]});normal.indent(['b'],1);
  const desce=new NotesDocument({blocks:[b('a',0),b('b',1)]});desce.indent(['b'],-1);
  return {cap:cap.byId.get('alvo').level,altos:altos.byId.get('fundo').level,normal:normal.byId.get('b').level,desce:desce.byId.get('b').level};
 });
 assert.equal(modelo.cap,4,'recuo nao pode passar de 4 niveis');
 assert.equal(modelo.altos,4,'nivel acima do teto e saneado para 4');
 assert.equal(modelo.normal,1,'recuo normal continua funcionando');
 assert.equal(modelo.desce,0,'desrecuo normal continua funcionando');

 // ------------------------------------------------------- DOM: Tab/Shift+Tab
 await load(['a','b','c','d','e','f'].map((t,i)=>`<div class="notes-line" data-level="${Math.min(i,4)}"><div class="notes-line-text">${t}</div></div>`).join(''));
 await select(5,1);
 await page.keyboard.press('Tab');await page.waitForTimeout(150);
 assert.deepEqual(await levels(),['0','1','2','3','4','4'],'Tab nao ultrapassa 4 niveis');
 await page.keyboard.press('Shift+Tab');await page.waitForTimeout(150);
 assert.deepEqual(await levels(),['0','1','2','3','4','3'],'Shift+Tab desindenta');

 // -------------------------------------------------------------- botoes
 const rotulos=await page.evaluate(()=>{const i=document.querySelector('#notesToolbar [data-command="indent"]'),o=document.querySelector('#notesToolbar [data-command="outdent"]');return {i:i&&i.title,o:o&&o.title};});
 assert.ok(/\(Tab\)/.test(rotulos.i||''),'botao Indentar rotulado com (Tab): '+rotulos.i);
 assert.ok(/Shift\+Tab/.test(rotulos.o||''),'botao Desindentar rotulado com (Shift+Tab): '+rotulos.o);
 assert.deepEqual(errors,[]);
 console.log('OK: teto de 4 niveis, recuo/desrecuo e rotulos de atalho');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES INDENT LEVELS]
