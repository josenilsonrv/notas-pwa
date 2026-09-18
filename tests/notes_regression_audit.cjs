/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_regression_audit.cjs por tools/portar-testes.cjs.
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

 await load('<p><strong><em><span style="background-color:#ffd700;color:#112233">abcdef</span></em></strong></p>');
 await select(0,2,0,4);await page.evaluate(()=>app.applyNotesTextStyle('backgroundColor','transparent'));
 assert.deepEqual(await text(),['abcdef']);assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
 const state=await rows().first().evaluate(row=>{const walker=document.createTreeWalker(row.querySelector('.notes-line-text'),NodeFilter.SHOW_TEXT),items=[];while(walker.nextNode()){const node=walker.currentNode;const style=getComputedStyle(node.parentElement);let el=node.parentElement,highlight=false;while(el&&!el.classList.contains('notes-line-text')){if(el.style.backgroundColor&&el.style.backgroundColor!=='transparent')highlight=true;el=el.parentElement;}items.push([node.textContent,style.fontWeight,style.fontStyle,style.color,highlight]);}return items;});
 assert.deepEqual(state,[['ab','700','italic','rgb(17, 34, 51)',true],['cd','700','italic','rgb(17, 34, 51)',false],['ef','700','italic','rgb(17, 34, 51)',true]]);
 await page.evaluate(()=>{document.querySelector('#notesEditor .notes-line').dataset.noteHighlightColors='#123456';});
 await select(0,6);await page.keyboard.press('Enter');
 assert.equal(await rows().nth(1).getAttribute('data-note-highlight-colors'),'#123456');
 await page.locator('[data-notes-color="color"]').click();await page.getByRole('button',{name:'Adicionar cor personalizada'}).click();
 assert.equal(await page.locator('.notes-tone-picker').count(),1);
 await page.evaluate(()=>app.closeNotesModal());assert.equal(await page.locator('.notes-tone-picker,#notesColorPalette').count(),0);assert.notEqual(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
 assert.deepEqual(errors,[]);console.log('OK: remoção parcial preserva formatação, cores sobrevivem em novas linhas, fechamento limpa paletas');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
