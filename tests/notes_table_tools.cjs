// 🧪 [INÍCIO: TESTE - NOTES TABLE TOOLS]
/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_table_tools.cjs por tools/portar-testes.cjs.
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
 for(const f of ['styles.css','notes/editor.css','notes/extras.css','notes/tables.css'])await page.addStyleTag({content:read(f)});
 for(const f of ['notes/editor.js','notes/extras.js','notes/table-math.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
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






 await load('<p></p>');await select(0,0);await page.keyboard.press('Control+Alt+q');await page.getByRole('button',{name:'Inserir tabela',exact:true}).click();
 const table=page.locator('#notesEditor table'),cell=(r,c)=>table.locator('tr').nth(r).locator('td').nth(c),formula=page.getByRole('textbox',{name:'Valor ou fórmula da célula'});
 const write=async(r,c,value)=>{await cell(r,c).click();await cell(r,c).evaluate(el=>{const range=document.createRange();range.selectNodeContents(el);getSelection().removeAllRanges();getSelection().addRange(range);});await page.keyboard.type(value);};
 const applyFormula=async(r,c,value)=>{await cell(r,c).click();await formula.fill(value);await page.getByRole('button',{name:'Aplicar valor ou fórmula',exact:true}).click();};
 await write(0,0,'10');await write(0,1,'20');await applyFormula(0,2,'=A1+B1');assert.equal(await cell(0,2).textContent(),'30');
 await write(0,0,'15');await page.waitForTimeout(500);assert.equal(await cell(0,2).textContent(),'35');
 await cell(1,0).click();await page.getByRole('combobox',{name:'Inserir função matemática'}).selectOption('SOMA');await cell(0,0).click();await cell(0,1).click({modifiers:['Shift']});assert.equal(await formula.inputValue(),'=SOMA(A1:B1)');await page.getByRole('button',{name:'Aplicar valor ou fórmula',exact:true}).click();assert.equal(await cell(1,0).textContent(),'35');
 await applyFormula(2,0,'=1/0');assert.equal(await cell(2,0).textContent(),'#DIV/0!');assert.ok((await cell(2,0).getAttribute('title')).includes('zero'));
 await cell(0,0).click();await page.getByRole('button',{name:'Tamanho e cores da tabela'}).click();const dialog=page.locator('.notes-extra-dialog');await dialog.getByRole('combobox',{name:'Aplicar a'}).selectOption('table');await dialog.getByText('Coluna (px)',{exact:true}).locator('input').fill('120');await dialog.getByText('Linha (px)',{exact:true}).locator('input').fill('54');await dialog.locator('input[type=color]').nth(0).fill('#aabbcc');await dialog.locator('input[type=color]').nth(1).fill('#8844aa');assert.equal(await cell(0,0).evaluate(el=>el.style.backgroundColor),'');await dialog.getByRole('button',{name:'Aplicar ajustes da tabela'}).click();
 assert.equal(await cell(0,0).evaluate(el=>el.style.backgroundColor),'rgb(170, 187, 204)');assert.equal(await cell(2,2).evaluate(el=>el.style.borderColor),'rgb(136, 68, 170)');assert.equal(await table.locator('col').first().evaluate(el=>el.style.width),'120px');assert.equal(await cell(0,0).evaluate(el=>el.style.height),'54px');
 const box=await cell(0,0).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height-2);assert.equal(await cell(0,0).evaluate(el=>getComputedStyle(el).cursor),'row-resize');await page.mouse.move(box.x+box.width/2,box.y+box.height/2);assert.notEqual(await cell(0,0).evaluate(el=>getComputedStyle(el).cursor),'row-resize');await page.mouse.move(box.x+box.width-2,box.y+box.height/2);assert.equal(await cell(0,0).evaluate(el=>getComputedStyle(el).cursor),'col-resize');await page.mouse.down();await page.mouse.move(box.x+box.width+38,box.y+box.height/2,{steps:5});await page.mouse.up();assert.ok(parseFloat(await table.locator('col').first().evaluate(el=>el.style.width))>145);
 await command('undo');assert.equal(await table.locator('col').first().evaluate(el=>el.style.width),'120px');const saved=await page.evaluate(()=>app.getCleanNotesHtml());await load(saved);assert.equal(await cell(0,2).textContent(),'35');assert.equal(await cell(1,0).getAttribute('data-formula'),'=SOMA(A1:B1)');assert.equal(await cell(2,2).evaluate(el=>el.style.borderColor),'rgb(136, 68, 170)');

 // Numeric formats change display only and survive recalculation/reopen.
 await cell(0,0).click();await page.getByRole('combobox',{name:'Formato da célula',exact:true}).selectOption('currency');await page.getByRole('combobox',{name:'Moeda da célula',exact:true}).selectOption('BRL');await page.getByRole('spinbutton',{name:'Casas decimais'}).fill('3');assert.equal(await cell(0,0).textContent(),'15');await page.getByRole('button',{name:'Aplicar formato às células selecionadas'}).click();assert.equal((await cell(0,0).textContent()).replace(/\s/g,''),'R$15,000');assert.equal(await cell(0,0).getAttribute('data-cell-value'),'15');assert.equal(await cell(0,2).textContent(),'35');
 await applyFormula(1,1,'=1/3');await page.getByRole('combobox',{name:'Formato da célula',exact:true}).selectOption('percent');await page.getByRole('spinbutton',{name:'Casas decimais'}).fill('2');await page.getByRole('button',{name:'Aplicar formato às células selecionadas'}).click();assert.equal(await cell(1,1).textContent(),'33,33%');await applyFormula(1,2,'=B2*3');assert.equal(await cell(1,2).textContent(),'1');
 const formatted=await page.evaluate(()=>app.getCleanNotesHtml());await load(formatted);assert.equal(await cell(1,1).textContent(),'33,33%');await cell(1,1).click();assert.equal(await page.getByRole('combobox',{name:'Formato da célula',exact:true}).inputValue(),'percent');assert.equal(await page.getByRole('spinbutton',{name:'Casas decimais'}).inputValue(),'2');
 await cell(2,1).click();await page.keyboard.type('=2+3*4');await page.locator('#notesToolbar [data-command=bold]').click();assert.equal(await cell(2,1).textContent(),'14');
 if(process.env.NOTES_TABLE_SCREENSHOT)await page.screenshot({path:process.env.NOTES_TABLE_SCREENSHOT});
 assert.deepEqual(errors,[]);console.log('OK: formulas, recalculation, point-and-click references, staged cell colors, dimensions, drag, undo and reopen');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES TABLE TOOLS]
