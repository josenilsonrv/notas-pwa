/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_outline_code.cjs por tools/portar-testes.cjs.
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




 await load(Array.from({length:6},(_,i)=>'<div class="notes-line" data-level="'+i+'" data-collapsed="true"><div class="notes-line-text">Nível '+i+'</div></div>').join(''));
 for(let i=0;i<5;i++)assert.equal(await rows().nth(i).evaluate(e=>e.hidden),false);
 assert.equal(await rows().nth(5).evaluate(e=>e.hidden),true);
 await load('<p>// Interfaces</p><p>interface Usuario {</p><p>nome: string;</p><p>idade: number;</p><p>email?: string;</p><p>}</p><p>Texto comum</p>');
 await page.waitForTimeout(350);
 assert.equal(await page.locator('.notes-code-header').count(),1);assert.equal(await page.locator('.notes-code-header span').textContent(),'typescript');
 assert.equal(await page.locator('#notesEditor .notes-code-line').count(),6);
 await load('<p></p>');await select(0,0);
 await page.evaluate(()=>{const clip=new DataTransfer();clip.setData('text/html','<h1>Raiz</h1><h2>Seção</h2><h3>Subseção</h3><ul><li>Grupo<ul><li>Subgrupo<ul><li>Conteúdo</li></ul></li></ul></li></ul>');document.getElementById('notesEditor').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clip}));});
 assert.equal(await page.locator('#notesEditor .notes-line[hidden] .notes-line-collapse').count(),0);
 assert.ok(await page.locator('#notesEditor .notes-line-collapse').count()>=4);
 await load('<h1>Fase</h1><h2>Checklist</h2><ul><li>Tarefa A</li><li>Tarefa B</li></ul>');
 assert.equal(await rows().nth(0).getAttribute('data-collapsed'),'false');
 assert.equal(await rows().nth(1).getAttribute('data-collapsed'),'true');
 assert.equal(await rows().nth(1).evaluate(e=>e.hidden),false);
 assert.equal(await rows().nth(2).evaluate(e=>e.hidden),true);
 assert.deepEqual(errors,[]);console.log('OK: nested outline visible and complete TypeScript interface grouped');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
