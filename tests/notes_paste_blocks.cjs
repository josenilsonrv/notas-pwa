// 🧪 [INÍCIO: TESTE - NOTES PASTE BLOCKS]
/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_paste_blocks.cjs por tools/portar-testes.cjs.
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


 const paste=async(data)=>page.evaluate(data=>{const clip=new DataTransfer();for(const [type,value]of Object.entries(data))clip.setData(type,value);document.getElementById('notesEditor').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clip}));},data);
 await load('<p>Destino </p>');await select(0,8);
 await paste({'text/html':'<h2>Semana</h2><p>Estude:</p><p>Pratique:</p><pre><code>const a = 1;\nconst b = 2;</code></pre>'});
 assert.deepEqual(await text(),['Destino Semana','Estude:','Pratique:','const a = 1;','const b = 2;']);
 await select(2,0,2,8);await page.keyboard.press('Control+b');
 assert.equal(await rows().nth(3).locator('code').evaluate(e=>getComputedStyle(e).fontWeight),'400');
 await select(1,0);await command('indent');assert.equal(await rows().nth(1).getAttribute('data-level'),'1');assert.equal(await rows().nth(2).getAttribute('data-level'),'0');
 await load('<p></p>');await select(0,0);const large='a'.repeat(150000);await paste({'text/plain':large+'\nFim'});assert.deepEqual(await text(),[large,'Fim']);
 await load('<h2>Semana</h2>');await select(0,0);await command('insertOrderedList');await command('checklist');
 const sizes=await rows().first().evaluate(row=>{const t=getComputedStyle(row.querySelector('.notes-line-text')),m=getComputedStyle(row.querySelector('.notes-line-marker'));return [t.fontSize,m.fontSize,t.color,m.color];});assert.equal(sizes[0],sizes[1]);assert.equal(sizes[2],sizes[3]);
 await load('<p>Texto comum</p><p>const valor = 42;</p><pre><code style="color:black"><span style="color:red">print(valor)</span></code></pre>');
 assert.equal(await rows().nth(0).evaluate(e=>e.classList.contains('notes-code-line')),false);
 assert.equal(await rows().nth(1).evaluate(e=>e.classList.contains('notes-code-line')),true);
 for(const [theme,expected] of [['light','rgb(36, 52, 73)'],['dark','rgb(220, 230, 243)']]){
  await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
  assert.equal(await rows().nth(1).locator('.notes-line-text').evaluate(e=>getComputedStyle(e).color),expected);
  assert.equal(await rows().nth(2).locator('code span').evaluate(e=>getComputedStyle(e).color),expected);
 }
 await load('<pre><code class="language-javascript">const a = 1;</code></pre><pre><code>console.log(a);</code></pre><p>Texto comum</p>');
 assert.equal(await page.locator('.notes-code-header').count(),1);
 assert.equal(await page.locator('.notes-code-header span').textContent(),'javascript');
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.copiedCode=value;}}}));
 await page.locator('.notes-code-header button').click();
 assert.equal(await page.evaluate(()=>window.copiedCode),'const a = 1;\nconsole.log(a);');
 assert.equal(await page.evaluate(()=>app.getCleanNotesHtml().includes('notes-code-header')),false);
 await load('<pre><code>PLANO DE ESTUDO\nObjetivo: aprender linguagens\n// Variáveis\nconst nome = "João";\nconst idade = 25;\nPratique os exercícios</code></pre>');
 assert.equal(await rows().count(),6);
 assert.equal(await rows().nth(0).evaluate(e=>e.classList.contains('notes-code-line')),false);
 assert.equal(await rows().nth(5).evaluate(e=>e.classList.contains('notes-code-line')),false);
 assert.equal(await page.locator('.notes-code-header').count(),1);
 assert.ok(await page.evaluate(()=>CSS.highlights.get('notes-keyword').size>0&&CSS.highlights.get('notes-string').size>0&&CSS.highlights.get('notes-number').size>0&&CSS.highlights.get('notes-comment').size>0));
 await load('<p></p>');await select(0,0);await paste({'text/html':'<table><thead><tr><th>Mês</th><th>Foco</th></tr></thead><tbody>\n<tr><td>1</td><td>Fundamentos</td></tr>\n<tr><td>2</td><td>Backend</td></tr></tbody></table>'});
 assert.equal(await page.locator('#notesEditor table').count(),1);assert.equal(await page.locator('#notesEditor table tr').count(),3);
 assert.equal(await rows().count(),1);
 await load('<h1>Semana</h1><p>Conteúdo visível</p>');
 await page.evaluate(async()=>{const row=document.querySelector('#notesEditor .notes-line');if(row.dataset.collapsed!=='true')await app.animateNotesLineCollapse(row);await app.animateNotesLineCollapse(row);});
 assert.equal(await rows().nth(1).evaluate(e=>e.hidden),false);
 assert.deepEqual(errors,[]);console.log('OK: multiline paste, 150k text, selected bold, indentation and marker sizing');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES PASTE BLOCKS]
