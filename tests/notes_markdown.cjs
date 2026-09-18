/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_markdown.cjs por tools/portar-testes.cjs.
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



 const markdownSource=process.argv[2]?fs.readFileSync(process.argv[2],'utf8'):'# Plano\n\n## Resumo\n| Mês | Foco |\n|---|---|\n| 1 | Estudo |\n\n```javascript\nconst valor = 42;\nconsole.log(valor);\n```\n';
 await load('<p></p>');await select(0,0);
 const elapsed=await page.evaluate(source=>{const start=performance.now(),clip=new DataTransfer();clip.setData('text/plain',source);document.getElementById('notesEditor').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clip}));return performance.now()-start;},markdownSource);
 await page.waitForTimeout(500);
 assert.ok(await page.locator('#notesEditor table').count());assert.ok(await page.locator('#notesEditor [data-heading="1"]').count());assert.ok(await page.locator('#notesEditor .notes-code-header').count());
 assert.equal(await page.locator('#notesEditor .notes-line[hidden]').count(),0);
 console.log('Markdown pasted in '+Math.round(elapsed)+' ms; tables, headings, code and visible contents verified');
 const typing=await page.evaluate(()=>{
  const body=document.querySelector('#notesEditor .notes-line-text');document.getElementById('notesEditor').focus();const range=document.createRange();range.selectNodeContents(body);range.collapse(false);getSelection().removeAllRanges();getSelection().addRange(range);app.rememberNotesSelection();
  const original=body.textContent,times=[];for(const char of ' teste de digitação rápida'){const start=performance.now();document.execCommand('insertText',false,char);times.push(performance.now()-start);}return {original,max:Math.max(...times)};
 });
 assert.ok(typing.max<150,'Slow keystroke: '+typing.max);
 await page.keyboard.press('Control+z');assert.equal(await page.locator('#notesEditor .notes-line-text').first().textContent(),typing.original);
 console.log('Typing max '+Math.round(typing.max)+' ms; immediate undo preserved');
 await load('<p></p>');await select(0,0);
 await page.evaluate(()=>{const clip=new DataTransfer();clip.setData('text/plain','# Título\nTexto\n## Seção\n- Item\n  - Filho\n```javascript\nconst n = 1;\n```\n# Outro\nFinal');document.getElementById('notesEditor').dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:clip}));});
 assert.deepEqual(await rows().evaluateAll(rows=>rows.map(row=>Number(row.dataset.level))),[0,1,1,2,3,2,0,1]);
 await page.evaluate(async()=>{const row=document.querySelector('#notesEditor .notes-line');await app.animateNotesLineCollapse(row);});
 assert.equal(await rows().nth(5).evaluate(e=>e.hidden),true);assert.equal(await rows().nth(6).evaluate(e=>e.hidden),false);
 await page.evaluate(async()=>app.animateNotesLineCollapse(document.querySelector('#notesEditor .notes-line')));
 assert.equal(await rows().nth(5).evaluate(e=>e.hidden),false);
 await load('<h1>Título</h1><p class="notes-collapsed-target">Texto recuperado</p>');
 assert.equal(await page.locator('#notesEditor .notes-collapsed-target').count(),0);assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});

