// 🧪 [INÍCIO: TESTE - NOTES DOCUMENT MIGRATION]
/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_document_migration.cjs por tools/portar-testes.cjs.
 * Os asserts sao identicos aos do projeto original; apenas o bootstrap e os caminhos foram adaptados.
 * Adaptacoes: entrada focus/sports.js removida; caminhos frontend/* -> raiz; TestApp = NotesPWA; ensureNotesFocusPage -> no-op; setupAntiInspection tolerante; motor instalado no prototipo (como o init do app faz)
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
  document.documentElement.dataset.theme="light";window.app=Object.create(TestApp.prototype);app.userId=1;app.projectsData=[{id:1,nome:'Teste',notas:''}];app.focusStagesData=[{id:2,foco_id:1,titulo:'Etapa',notas:''}];app.ensureNotesFocusPage = () => {};app.showToast=()=>{};if (!TestApp.prototype.__motorInstalado) { installNotesEditor(TestApp); if (typeof installNotesExtras === 'function') installNotesExtras(TestApp); if (typeof installNotesTables === 'function') installNotesTables(TestApp); if (typeof installLocalNotesStorage === 'function') installLocalNotesStorage(TestApp); TestApp.prototype.__motorInstalado = true; } if (app.setupEventListeners) app.setupEventListeners(); app.setupModalListeners();if (app.setupAntiInspection) app.setupAntiInspection();
  window.calls=[];app.apiCall=async(url,options)=>{calls.push({url,...JSON.parse(options.body)});return{};};
  window.loadNote=async html=>{clearTimeout(app.notesSaveTimer);app.notesSession=null;app.projectsData[0].notas=html;localStorage.clear();await app.openNotesModal(1);};
  window.selectText=(a,start,b=a,end=start)=>{document.getElementById('notesEditor').focus();const rows=[...document.querySelectorAll('#notesEditor .notes-line-text')];function point(row,n){const w=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let t=w.nextNode();while(t&&n>t.length){n-=t.length;t=w.nextNode();}return t?[t,n]:[row,0];}const r=document.createRange();r.setStart(...point(rows[a],start));r.setEnd(...point(rows[b],end));getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();};
 });
 const load=async html=>{await page.evaluate(html=>loadNote(html),html);await page.waitForTimeout(400);await page.locator('#notesEditor').click();};
 const select=async(a,s,b=a,e=s)=>page.evaluate(args=>selectText(...args),[a,s,b,e]);
 const command=async c=>page.evaluate(c=>app.executeNotesCommand(c),c);
 const rows=()=>page.locator('#notesEditor .notes-line');
 const text=()=>page.locator('#notesEditor .notes-line-text').allTextContents();

 await load('<h1>Título</h1><ol><li><strong>A</strong><ul><li><em>B</em><a href="https://example.com">link</a></li></ul></li></ol><div class="checklist-item"><input type="checkbox" checked><span class="checklist-text"><span style="color:#112233;background-color:#ffd700">C</span></span></div>');
 const saved=await page.evaluate(()=>app.getCleanNotesHtml());
 const original=await page.evaluate(()=>app.notesDocument.snapshot());
 assert.equal(await page.evaluate(()=>app.notesDocument.version),1);
 assert.equal(await page.evaluate(()=>app.notesDocument.blocks.every(b=>b.id&&Array.isArray(b.content))),true);
 assert.equal(await page.evaluate(()=>app.notesDocument.blocks[2].parentId===app.notesDocument.blocks[1].id),true);
 await page.evaluate(()=>{const model=app.notesDocument;app.notesDocument=NotesDocument.restore(model.snapshot());app.renderNotesDocument();app.refreshNotesCollapseControls();});
 assert.equal(await page.evaluate(()=>app.getCleanNotesHtml()),saved);
 assert.equal(await page.evaluate(()=>app.notesDocument.snapshot()),original);
 const ids=await rows().evaluateAll(rs=>rs.map(r=>r.dataset.noteId));
 await select(1,0);await command('moveDown');await command('undo');assert.deepEqual(await rows().evaluateAll(rs=>rs.map(r=>r.dataset.noteId)),ids);
 assert.equal(await page.evaluate(()=>JSON.parse(app.notesHistory[0]).version),1);
 await page.evaluate(()=>app.saveNotes());await page.evaluate(()=>app.closeNotesModal());await page.evaluate(()=>app.openNotesModal(1));assert.deepEqual(await rows().evaluateAll(rs=>rs.map(r=>r.dataset.noteId)),ids);
 await load('<p>Copiar</p>');const sourceId=await rows().first().getAttribute('data-note-id');
 await select(0,0,0,6);await page.evaluate(()=>{window.clip=new DataTransfer();document.getElementById('notesEditor').dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:clip}));});
 await select(0,0);await page.evaluate(()=>document.getElementById('notesEditor').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clip})));
 assert.equal(await rows().first().getAttribute('data-note-id'),sourceId);assert.notEqual(await rows().nth(1).getAttribute('data-note-id'),sourceId);assert.deepEqual(await text(),['Copiar','Copiar']);
 await load('<p>'+('Texto extenso '.repeat(10000))+'</p>');const length=await rows().first().locator('.notes-line-text').evaluate(e=>e.textContent.length);await page.evaluate(()=>{const html=app.getCleanNotesHtml();document.getElementById('notesEditor').innerHTML=html;app.refreshNotesCollapseControls();});assert.equal(await rows().first().locator('.notes-line-text').evaluate(e=>e.textContent.length),length);
 assert.deepEqual(errors,[]);console.log('OK: modelo/HTML sem perdas, IDs persistidos, histórico estruturado, cópia independente, nota extensa');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES DOCUMENT MIGRATION]
