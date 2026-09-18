/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_table_media.cjs por tools/portar-testes.cjs.
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
 for(const f of ['styles.css','notes/editor.css','notes/extras.css'])await page.addStyleTag({content:read(f)});
 for(const f of ['notes/editor.js','notes/extras.js'])await page.addScriptTag({content:read(f)});
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





 await load('<h2>Tabela</h2>');await select(0,6);const insert=page.locator('[data-extra="insert"]');if(!await insert.isVisible())await page.locator('.notes-toolbar-more').click();await insert.click();await page.getByRole('button',{name:'Tabela · Ctrl+Alt+Q',exact:true}).click();await page.getByRole('button',{name:'Inserir tabela',exact:true}).click();
 const table=page.locator('#notesEditor table');assert.equal(await table.isVisible(),true);assert.equal(await table.locator('td').count(),9);assert.equal(await table.locator('td').first().evaluate(e=>getComputedStyle(e).borderLeftWidth),'1px');
 await page.keyboard.type('Nome');assert.equal(await table.locator('td').first().textContent(),'Nome');await page.keyboard.press('Tab');await page.keyboard.type('Valor');assert.equal(await table.locator('td').nth(1).textContent(),'Valor');await page.keyboard.press('Enter');await page.keyboard.type('Linha 2');assert.equal(await table.count(),1);assert.equal(await table.locator('tr').count(),3);assert.ok(await table.locator('td').nth(1).locator('br').count());
 await page.keyboard.press('Backspace');assert.equal(await table.count(),1);const savedHtml=await page.evaluate(()=>app.getCleanNotesHtml());await load(savedHtml);assert.equal(await table.locator('td').count(),9);assert.equal(await table.isVisible(),true);
 for(const kind of ['image','video']){
  await load('<p></p>');await page.evaluate(()=>app.setNotesDefaultColor('#8432aa'));await select(0,0);await page.evaluate(kind=>app.notesMedia(kind,kind==='image'?'data:image/png;base64,iVBORw0KGgo=':'dQw4w9WgXcQ','Teste'),kind);
  const figure=page.locator('#notesEditor figure');await figure.locator('img').click();assert.equal(await figure.evaluate(e=>document.activeElement===e),true);assert.equal(await figure.evaluate(e=>getComputedStyle(e).outlineColor),'rgb(132, 50, 170)');assert.equal(await figure.evaluate(e=>getComputedStyle(e,'::after').borderLeftColor),'rgb(132, 50, 170)');assert.equal(await figure.locator('iframe').count(),0);await page.keyboard.press('Backspace');assert.equal(await figure.count(),0);await command('undo');assert.equal(await figure.count(),1);
  if(kind==='video'){await figure.locator('.notes-video-play').click();assert.equal(await figure.locator('iframe').count(),1);}
 }
 assert.deepEqual(errors,[]);console.log('OK: create/edit/reopen table; click media, Backspace removal, undo and explicit video playback');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
