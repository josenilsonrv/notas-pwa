// 🧪 [INÍCIO: TESTE - NOTES UNDERLINE]
/*
 * Sublinhado (revisão do bloco de notas): comando novo, atalho Ctrl+U e botão
 * na toolbar rotulado. O original não tem sublinhado — este é exclusivo do PWA.
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
 for(const f of ['styles.css','theme-origem.css','notes/editor.css','notes/extras.css','notes/tables.css'])await page.addStyleTag({content:read(f)});
 for(const f of ['notes/editor.js','notes/table-math.js','notes/extras.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
 const source=read('app.js');await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});
 await page.evaluate(()=>{
  document.documentElement.dataset.theme="light";window.app=Object.create(TestApp.prototype);app.userId='local';app.projectsData=[{id:'local',nome:'Teste',notas:''}];app.focusStagesData=[];app.ensureNotesFocusPage=()=>{};app.showToast=()=>{};if(!TestApp.prototype.__motorInstalado){installNotesEditor(TestApp);if(typeof installNotesExtras==='function')installNotesExtras(TestApp);if(typeof installNotesTables==='function')installNotesTables(TestApp);if(typeof installLocalNotesStorage==='function')installLocalNotesStorage(TestApp);TestApp.prototype.__motorInstalado=true;}app.setupModalListeners();if(app.setupEventListeners)app.setupEventListeners();document.getElementById('notesModalBackdrop').classList.add('active');
  window.loadNote=async html=>{clearTimeout(app.notesSaveTimer);app.notesSession=null;app.projectsData[0].notas=html;localStorage.clear();await app.openNotesModal('local');};
  window.selectText=(a,start,b=a,end=start)=>{document.getElementById('notesEditor').focus();const rows=[...document.querySelectorAll('#notesEditor .notes-line-text')];function point(row,n){const w=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let t=w.nextNode();while(t&&n>t.length){n-=t.length;t=w.nextNode();}return t?[t,n]:[row,0];}const r=document.createRange();r.setStart(...point(rows[a],start));r.setEnd(...point(rows[b],end));getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();};
 });
 const load=async html=>{await page.evaluate(html=>loadNote(html),html);await page.waitForTimeout(300);};
 const select=async(a,s,b=a,e=s)=>page.evaluate(args=>selectText(...args),[a,s,b,e]);

 // botão presente com atalho rotulado
 const rotulo=await page.evaluate(()=>{const b=document.querySelector('#notesToolbar [data-command="underline"]');return b?{title:b.title,key:b.getAttribute('aria-keyshortcuts')}:null;});
 assert.ok(rotulo,'botao Sublinhado presente na toolbar');
 assert.ok(/\(Ctrl\+U\)/.test(rotulo.title||''),'botao rotulado com (Ctrl+U): '+rotulo.title);
 assert.equal(rotulo.key,'Control+U','aria-keyshortcuts do sublinhado');

 // Ctrl+U numa selecao aplica sublinhado
 await load('<div class="notes-line" data-level="0"><div class="notes-line-text">Sublinha</div></div>');
 await select(0,0,0,8);
 await page.keyboard.press('Control+u');
 await page.waitForTimeout(160);
 const decorado=await page.evaluate(()=>{const t=document.querySelector('#notesEditor .notes-line-text');const alvo=t.querySelector('u')||t;return getComputedStyle(alvo).textDecorationLine;});
 assert.ok(/underline/.test(decorado),'Ctrl+U aplica sublinhado (text-decoration: '+decorado+')');

 // alterna: Ctrl+U de novo remove o sublinhado
 await page.keyboard.press('Control+u');
 await page.waitForTimeout(160);
 const decorado2=await page.evaluate(()=>{const t=document.querySelector('#notesEditor .notes-line-text');const alvo=t.querySelector('u')||t;return getComputedStyle(alvo).textDecorationLine;});
 assert.ok(!/underline/.test(decorado2),'Ctrl+U alterna/remove o sublinhado (text-decoration: '+decorado2+')');

 assert.deepEqual(errors,[]);
 console.log('OK: sublinhado por botao/atalho Ctrl+U');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES UNDERLINE]
