// 🧪 [INÍCIO: TESTE - NOTES EXTRAS]
/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_extras.cjs por tools/portar-testes.cjs.
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



 await load('<p></p>');await select(0,0);await page.keyboard.press('Control+Shift+H');assert.equal(await page.locator('#notesEditor hr').count(),1);await page.keyboard.press('Backspace');assert.equal(await page.locator('#notesEditor hr').count(),0);
 await load('<p>https://example.com</p>');await select(0,19);await page.evaluate(()=>app.notesAutoLinks(document.querySelector('#notesEditor .notes-line')));assert.equal(await page.locator('#notesEditor a').count(),1);
 await select(0,0,0,19);await page.keyboard.press('Control+k');await page.locator('.notes-extra-dialog label').filter({hasText:'Título'}).locator('input').fill('Exemplo');await page.locator('.notes-extra-dialog button').filter({hasText:'OK'}).click();assert.equal(await page.locator('#notesEditor a').textContent(),'Exemplo');
 await load('<p>Antes depois</p>');await select(0,6);await page.evaluate(()=>app.notesMedia('image','data:image/png;base64,iVBORw0KGgo=','Teste'));assert.equal(await page.locator('#notesEditor figure').count(),1);assert.deepEqual((await text()).filter(t=>!t.includes('↑')),['Antes ','depois']);
 await page.evaluate(()=>app.notesTableDialog());await page.locator('.notes-extra-dialog button').filter({hasText:'Inserir'}).click();assert.equal(await page.locator('#notesEditor table').count(),1);
 await page.setViewportSize({width:380,height:800});await page.waitForTimeout(300);assert.equal(await page.locator('.notes-toolbar-more').isVisible(),true);await page.locator('.notes-toolbar-more').click();assert.equal(await page.locator('.notes-toolbar-overflow').isVisible(),true);await page.waitForTimeout(300);const fullHeight=await page.locator('.notes-toolbar-overflow').evaluate(e=>e.getBoundingClientRect().height);const intermediateHeight=await page.evaluate(()=>{document.querySelector('.notes-toolbar-more').click();const drawer=document.querySelector('.notes-toolbar-overflow'),animation=drawer.getAnimations()[0];animation.pause();animation.currentTime=120;const height=drawer.getBoundingClientRect().height;animation.play();return height;});assert.ok(intermediateHeight>0&&intermediateHeight<fullHeight,JSON.stringify({intermediateHeight,fullHeight}));await page.waitForTimeout(300);assert.equal(await page.locator('.notes-toolbar-overflow').isVisible(),false);

 // Exercise the actual nested toolbar menu, preserving a selection in a heading.
 await page.setViewportSize({width:1280,height:960});await load('<h2>Motivação</h2>');await select(0,9);
 const openTool=async name=>{const tool=page.locator('[data-extra="'+name+'"]');if(!await tool.isVisible())await page.locator('.notes-toolbar-more').click();await tool.click();};
 await openTool('insert');if(process.env.NOTES_SCREENSHOT)await page.screenshot({path:process.env.NOTES_SCREENSHOT});const menuBox=await page.locator('.notes-extra-dialog').boundingBox(),triggerBox=await page.locator('[data-extra="insert"]').boundingBox();assert.ok(Math.abs(menuBox.y-triggerBox.y)<350);
 await page.getByRole('button',{name:'Tabela · Ctrl+Alt+Q',exact:true}).click();await page.getByRole('button',{name:'Inserir tabela',exact:true}).click();assert.equal(await page.locator('#notesEditor table').count(),1);assert.equal(await page.locator('#notesEditor table').isVisible(),true);
 await load('<p></p>');await select(0,0);await page.keyboard.press('Control+Shift+H');assert.equal(await page.locator('#notesEditor hr').count(),1);await page.keyboard.press('Enter');await page.keyboard.type('Depois do divisor');await page.evaluate(()=>app.setNotesDefaultColor('#8432aa'));assert.equal(await page.locator('#notesEditor hr').evaluate(e=>getComputedStyle(e).borderTopColor),'rgb(132, 50, 170)');assert.ok((await text()).join('').includes('Depois do divisor'));
 await load('<p>https://www.youtube.com/watch?v=dQw4w9WgXcQ</p>');await select(0,0,0,43);await page.locator('#notesEditor .notes-line-text').click({button:'right'});await page.getByRole('button',{name:'Incorporar vídeo',exact:true}).click();assert.equal(await page.locator('#notesEditor figure[data-youtube]').isVisible(),true);
 await page.route('**/api/note-assets/files?*',r=>r.fulfill({contentType:'application/json',body:JSON.stringify({id:'uploaded',name:'Teste.png'})}));
 for(const [label,isImage] of [['Imagem · Ctrl+Shift+O',true],['Arquivo · Ctrl+O',false]]){
  await load('<h2>Motivação</h2>');await select(0,9);await openTool('insert');const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:label,exact:true}).click();await(await chooser).setFiles({name:isImage?'Teste.png':'Teste.pdf',mimeType:isImage?'image/png':'application/pdf',buffer:Buffer.from('fixture')});await page.waitForTimeout(300);assert.equal(await page.locator(isImage?'#notesEditor figure':'#notesEditor a[data-note-asset]').isVisible(),true);const saved=await page.evaluate(()=>app.getCleanNotesHtml());await load(saved);assert.equal(await page.locator(isImage?'#notesEditor figure':'#notesEditor a[data-note-asset]').isVisible(),true);
 }
 await load('<h2>Motivação</h2><p>Filho oculto</p>');await select(0,9);await page.keyboard.press('Enter');await page.keyboard.type('Fora do título');const outside=page.locator('#notesEditor .notes-line-text').filter({hasText:'Fora do título'});assert.equal(await outside.isVisible(),true);assert.equal(await rows().first().getAttribute('data-collapsed'),'true');const afterEnter=await page.evaluate(()=>app.getCleanNotesHtml());await load(afterEnter);assert.equal(await outside.isVisible(),true);
 let annotations=[],templates=[];
 await page.route('**/api/note-assets/**',async route=>{const url=new URL(route.request().url());let value={};if(url.pathname.endsWith('/templates/template'))value=templates[0];else if(url.pathname.endsWith('/info'))value={name:'Documento',kind:'word',pages:1};else if(url.pathname.endsWith('/page'))value={html:'<p>Texto para destacar</p>'};else if(url.pathname.endsWith('/annotations')){if(route.request().method()==='PUT')annotations=route.request().postDataJSON().ranges;value={ranges:annotations};}else if(url.pathname.endsWith('/templates')){if(route.request().method()==='POST')templates.push({id:'template',...route.request().postDataJSON()});value=templates;}await route.fulfill({contentType:'application/json',body:JSON.stringify(value)});});
 await page.evaluate(()=>app.notesFileViewer('asset'));await page.locator('.notes-file-page p').waitFor();await page.evaluate(()=>{const text=document.querySelector('.notes-file-page p').firstChild,r=document.createRange();r.setStart(text,0);r.setEnd(text,5);getSelection().removeAllRanges();getSelection().addRange(r);});await page.getByRole('button',{name:'Destacar seleção'}).click();await page.waitForTimeout(200);assert.deepEqual(annotations,[{start:0,end:5}]);await page.getByRole('button',{name:'Expandir/restaurar'}).click();assert.equal(await page.locator('.notes-file-viewer').evaluate(e=>e.classList.contains('expanded')),true);await page.getByRole('button',{name:'Fechar',exact:true}).click();
 await load('<p>Modelo de teste</p>');await page.evaluate(()=>app.notesTemplates());await page.locator('.notes-extra-dialog input').fill('Meu modelo');await page.getByRole('button',{name:'Salvar nota como modelo'}).click();await page.waitForTimeout(200);assert.equal(templates.length,1);await page.getByRole('button',{name:'Fechar',exact:true}).click();await load('<p>Anterior</p>');await page.evaluate(()=>app.notesTemplates());await page.getByRole('button',{name:'Usar Meu modelo'}).click();await page.waitForFunction(()=>document.getElementById('notesEditor').textContent.includes('Modelo de teste'));assert.equal((await text()).join(''),'Modelo de teste');await command('undo');assert.equal((await text()).join(''),'Anterior');
 assert.deepEqual(errors,[]);console.log('OK: divider shortcut/removal, automatic and titled links, cursor media, table and toolbar overflow');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES EXTRAS]
