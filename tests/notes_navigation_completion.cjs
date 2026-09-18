/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_navigation_completion.cjs por tools/portar-testes.cjs.
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

 await load(['A','B','C'].map(t=>`<div class="notes-line" data-level="0" data-check="true"><div class="notes-line-text">${t}</div></div>`).join(''));
 await rows().first().locator('input').click();await page.waitForTimeout(300);assert.deepEqual(await text(),['B','C','A']);await rows().last().locator('input').click();await page.waitForTimeout(300);assert.deepEqual(await text(),['A','B','C']);
 await load('<div class="notes-line" data-level="0" data-check="true"><div class="notes-line-text"><br></div></div><div class="notes-line" data-level="0" data-check="true"><div class="notes-line-text">Texto</div></div>');await select(1,0);await page.keyboard.press('ArrowUp');await page.keyboard.type('Acima');assert.deepEqual(await text(),['Acima','Texto']);
 await load('<div class="notes-line" data-level="0" data-check="true"><div class="notes-line-text">Pai</div></div><div class="notes-line" data-level="1" data-check="true"><div class="notes-line-text">Filho</div></div><div class="notes-line" data-level="2" data-check="true"><div class="notes-line-text">Neto</div></div>');
 assert.equal(await rows().first().getAttribute('data-collapsed'),'false');assert.equal(await rows().nth(1).getAttribute('data-collapsed'),'true');
 await rows().first().locator('input').click();assert.ok((await rows().first().locator('.notes-line-controls').getAttribute('data-completion-label')).startsWith('Todos concluídos em'));assert.equal(await rows().nth(1).locator('.notes-line-controls').getAttribute('data-completion-label'),null);
 await load('<p><br></p><p><br></p>');await select(1,0);await command('indent');assert.equal(await rows().first().locator('.notes-line-collapse').count(),1);assert.equal(await rows().first().getAttribute('data-collapsed'),'false');await select(0,0);await page.keyboard.type('Pai');assert.equal(await rows().first().getAttribute('data-collapsed'),'false');assert.equal(await rows().nth(1).isVisible(),true);
 await page.evaluate(()=>{app.setNotesDefaultColor('#112233');app.setNotesDefaultColor('#445566');});await page.evaluate(()=>app.saveNotes());await page.evaluate(()=>app.closeNotesModal());await page.evaluate(()=>app.openNotesModal(1));assert.ok((await rows().first().getAttribute('data-note-accent-history')).includes('#112233'));
 assert.equal(await page.locator('#notesEditor').evaluate(e=>getComputedStyle(e).caretColor),'rgb(68, 85, 102)');
 await select(0,0);await page.locator('[data-notes-color="color"]').click();await page.locator('#notesCustomColor').click();await page.getByRole('button',{name:'Aplicar padrão #112233',exact:true}).click();assert.equal(await rows().first().getAttribute('data-note-accent'),'#112233');assert.equal(await page.locator('#notesContextNav .is-active').evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(17, 34, 51)');
 assert.deepEqual(errors,[]);console.log('OK: retorno original, cursor vazio, colapsos, conclusão coletiva, cores salvas e abas');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
