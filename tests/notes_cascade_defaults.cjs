// 🧪 [INÍCIO: TESTE - NOTES CASCADE DEFAULTS]
/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_cascade_defaults.cjs por tools/portar-testes.cjs.
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

 await load('<div class="notes-line" data-check="true" data-level="0" data-collapsed="false"><div class="notes-line-text">Pai</div></div><div class="notes-line" data-check="true" data-checked="true" data-completed-at="2026-01-01T12:00:00.000Z" data-level="1"><div class="notes-line-text">Anterior</div></div><div class="notes-line" data-check="true" data-level="1"><div class="notes-line-text">Pendente</div></div>');
 await rows().first().locator('input').click();assert.deepEqual(await rows().evaluateAll(rs=>rs.map(r=>r.dataset.checked)),['true','true','true']);
 assert.equal(await rows().nth(1).getAttribute('data-completed-at'),'2026-01-01T12:00:00.000Z');assert.ok(await rows().nth(2).getAttribute('data-completed-at'));
 await page.evaluate(()=>app.saveNotes());await page.evaluate(()=>app.closeNotesModal());await page.evaluate(()=>app.openNotesModal(1));
 await rows().first().locator('input').click();assert.deepEqual(await rows().evaluateAll(rs=>rs.map(r=>r.dataset.checked)),['false','true','false']);assert.equal(await rows().nth(2).getAttribute('data-completed-at'),null);

 await rows().nth(1).hover();await page.waitForTimeout(200);assert.equal(await rows().nth(1).locator('.notes-line-controls').evaluate(e=>getComputedStyle(e,'::after').opacity),'1');
 await load('<div class="notes-line" data-check="true" data-level="0" data-collapsed="false"><div class="notes-line-text">Pai</div></div><div class="notes-line" data-check="true" data-level="1"><div class="notes-line-text">Filho</div></div><div class="notes-line" data-check="true" data-level="2"><div class="notes-line-text">Neto</div></div>');
 await rows().first().locator('input').click();assert.deepEqual(await rows().evaluateAll(rs=>rs.map(r=>r.dataset.checked)),['true','true','true']);await rows().first().locator('input').click();assert.deepEqual(await rows().evaluateAll(rs=>rs.map(r=>r.dataset.checked)),['false','false','false']);assert.equal(await page.locator('[data-completed-at]').count(),0);
 await load('<h1>Título</h1><p><span style="color:#ab1234">Texto colorido</span></p>');await page.evaluate(()=>app.setNotesDefaultColor('#1122aa'));
 assert.equal(await rows().nth(1).locator('span[style]').last().evaluate(e=>e.style.color),'rgb(171, 18, 52)');
 await select(0,0);await page.locator('[data-notes-color="color"]').click();await page.locator('#notesCustomColor').click();
 const tone=page.locator('.notes-tone-picker');assert.equal(await tone.count(),1);await tone.getByRole('textbox',{name:'Hexadecimal'}).fill('#aa1122');await tone.getByRole('textbox',{name:'Hexadecimal'}).press('Tab');await tone.getByRole('button',{name:'OK',exact:true}).click();assert.equal(await rows().first().getAttribute('data-note-accent'),'#aa1122');
 await page.locator('#notesCustomColor').click();await tone.getByRole('button',{name:'Restaurar azul padrão'}).click();await tone.getByRole('button',{name:'OK',exact:true}).click();assert.equal(await rows().first().getAttribute('data-note-accent'),'#0071e3');
 await page.locator('#notesCustomColor').click();await page.locator('.notes-custom-colors small').click();assert.equal(await tone.count(),0);assert.equal(await page.locator('#notesColorPalette').count(),1);
 await page.evaluate(()=>app.closeNotesModal());assert.deepEqual(errors,[]);console.log('OK: cascata reversível persistida, data de conclusão, cor do corpo preservada, seletor padrão e fechamento independente');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES CASCADE DEFAULTS]
