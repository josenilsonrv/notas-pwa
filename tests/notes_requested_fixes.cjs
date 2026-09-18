/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_requested_fixes.cjs por tools/portar-testes.cjs.
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


 const paste=async data=>page.evaluate(data=>{const clip=new DataTransfer();for(const [k,v]of Object.entries(data))clip.setData(k,v);document.getElementById('notesEditor').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clip}));},data);
 await load('<p></p>');await select(0,0);await paste({'text/html':'<p>Antes</p><pre><code class="language-python"># app.py\nfrom flask import Flask\n\napp = Flask(__name__)\ntarefas = [\n {"id": 1}\n]\n</code></pre><p>Depois</p>'});
 assert.equal(await rows().count(),3);assert.ok(await rows().nth(1).getAttribute('data-code-block'));
 await select(1,8);await page.keyboard.press('Enter');assert.equal(await rows().count(),3);await paste({'text/plain':'inserido'});assert.ok((await text())[1].includes('inserido'));
 await load('<p>A</p><p>B</p>');await select(0,0,1,1);await command('codeBlock');assert.ok(await rows().first().getAttribute('data-code-block'));
 await load('<p>Antes código depois</p>');await select(0,6,0,12);await command('codeBlock');assert.deepEqual(await text(),['Antes ','código',' depois']);assert.ok(await rows().nth(1).getAttribute('data-code-block'));
 await load('<h1>Pai</h1><p>Filho</p><h1>Outro</h1>');await page.evaluate(()=>{const row=document.querySelector('#notesEditor .notes-line');row.dataset.collapsed='true';app.refreshNotesCollapseControls();});await select(0,3);await page.keyboard.press('Enter');assert.deepEqual(await text(),['Pai','Filho','','Outro']);assert.equal(await rows().nth(2).getAttribute('data-level'),'0');
 await load('<h1>Pai</h1><h2>Filho</h2><p>Texto</p>');await page.evaluate(()=>app.toggleAllNotesCollapse());const stored=await page.evaluate(()=>app.getCleanNotesHtml());await load(stored);assert.equal(await rows().nth(2).evaluate(e=>e.hidden),false);
 await page.evaluate(()=>app.toggleAllNotesCollapse());assert.equal(await rows().nth(2).evaluate(e=>e.hidden),true);
 await load('<h1>Pai</h1><h1>Último</h1>');await select(1,0);await command('heading3');assert.equal(await rows().nth(1).evaluate(e=>e.hidden),false);
 await load('<p>Texto</p>');await select(0,0,0,5);const before=await page.evaluate(()=>app.getCleanNotesHtml());await page.locator('[data-notes-color="color"]').click();await page.locator('.notes-color-grid button').nth(10).click();assert.equal(await page.evaluate(()=>app.getCleanNotesHtml()),before);await page.locator('.notes-color-apply').click();assert.notEqual(await page.evaluate(()=>app.getCleanNotesHtml()),before);
 await page.evaluate(async()=>{app.loadFocusStages=async()=>{};document.getElementById('focusStageFocusId').innerHTML='<option value="1">Foco</option>';document.getElementById('focusStageTitle').value='Módulo';document.getElementById('focusStageDateStart').value='';document.getElementById('focusStageDateEnd').value='';await app.saveFocusStage();});
 const call=await page.evaluate(()=>calls.at(-1));assert.equal(call.date_start,null);assert.equal(call.date_end,null);
 await load('<pre><code>const n = 1;\n  console.log(n);</code></pre>');await select(0,0,0,10);
 const codeBefore=await rows().first().locator('.notes-line-text').innerHTML();await command('codeBlock');await page.waitForTimeout(350);
 assert.equal(await rows().first().locator('.notes-line-text').innerHTML(),codeBefore);assert.equal(await page.locator('.notes-code-header').count(),0);
 assert.equal(await rows().first().getAttribute('data-code-disabled'),'true');
 await load('<h1>Pai</h1><p>Filho</p>');const icon=page.locator('[data-command="collapseAll"]');const initial=await icon.innerHTML();await icon.click();assert.notEqual(await icon.innerHTML(),initial);
 assert.equal(await page.locator('[data-command="codeBlock"] svg').evaluate(e=>getComputedStyle(e).width),'16px');
 assert.deepEqual(errors,[]);console.log('OK: code boundaries, Enter, manual code, collapse persistence, H3, staged colors and module payload');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
