// 🧪 [INÍCIO: TESTE - NOTES TABLE STRUCTURE]
/*
 * Cobre a edição ESTRUTURAL da tabela (linha/coluna/célula), o tema do painel
 * da tabela (claro/escuro) e o acoplamento da barra da tabela ao teclado no
 * celular (acima da toolbar de texto, nunca no topo).
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
 for(const f of ['styles.css','theme-origem.css','notes/editor.css','notes/extras.css','notes/tables.css'])await page.addStyleTag({content:read(f)});
 for(const f of ['notes/editor.js','notes/extras.js','notes/table-math.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
 const source=read('app.js');await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});
 await page.evaluate(()=>{
  document.documentElement.dataset.theme="light";window.app=Object.create(TestApp.prototype);app.userId=1;app.projectsData=[{id:1,nome:'Teste',notas:''}];app.focusStagesData=[{id:2,foco_id:1,titulo:'Etapa',notas:''}];app.ensureNotesFocusPage = () => {};app.showToast=()=>{};if (!TestApp.prototype.__motorInstalado) { installNotesEditor(TestApp); if (typeof installNotesExtras === 'function') installNotesExtras(TestApp); if (typeof installNotesTables === 'function') installNotesTables(TestApp); if (typeof installLocalNotesStorage === 'function') installLocalNotesStorage(TestApp); TestApp.prototype.__motorInstalado = true; } if (app.setupEventListeners) app.setupEventListeners(); app.setupModalListeners();
  window.loadNote=async html=>{clearTimeout(app.notesSaveTimer);app.notesSession=null;app.projectsData[0].notas=html;localStorage.clear();await app.openNotesModal(1);};
  window.selectText=(a,start,b=a,end=start)=>{document.getElementById('notesEditor').focus();const rows=[...document.querySelectorAll('#notesEditor .notes-line-text')];function point(row,n){const w=document.createTreeWalker(row,NodeFilter.SHOW_TEXT);let t=w.nextNode();while(t&&n>t.length){n-=t.length;t=w.nextNode();}return t?[t,n]:[row,0];}const r=document.createRange();r.setStart(...point(rows[a],start));r.setEnd(...point(rows[b],end));getSelection().removeAllRanges();getSelection().addRange(r);app.rememberNotesSelection();};
 });
 const load=async html=>{await page.evaluate(html=>loadNote(html),html);await page.waitForTimeout(400);await page.locator('#notesEditor').click();};
 await load('<p></p>');await page.evaluate(()=>selectText(0,0));await page.keyboard.press('Control+Alt+q');await page.getByRole('button',{name:'Inserir tabela',exact:true}).click();
 const table=page.locator('#notesEditor table'),rows=table.locator('tr'),structure=page.getByRole('combobox',{name:'Estrutura da tabela'}),cell=(r,c)=>rows.nth(r).locator('td,th').nth(c);
 const count=async()=>({rows:await rows.count(),cols:await rows.first().locator('td,th').count(),all:await table.locator('td,th').count()});
 const focused=()=>page.evaluate(()=>{const node=getSelection().anchorNode,cell=(node?.nodeType===3?node.parentElement:node)?.closest?.('td,th');return cell?{row:cell.parentElement.rowIndex,col:cell.cellIndex}:null;});
 assert.deepEqual(await count(),{rows:3,cols:3,all:9});

 // Inserir linha abaixo: nasce ligada à tabela, na mesma coluna, e recebe o foco.
 await cell(1,1).click();await structure.selectOption('rowBelow');
 assert.deepEqual(await count(),{rows:4,cols:3,all:12});assert.deepEqual(await focused(),{row:2,col:1});assert.equal((await cell(2,1).textContent()).trim(),'');
 // A nova linha herda o formato da coluna (apresentação), mas não a fórmula.
 await cell(1,1).click();await page.getByRole('combobox',{name:'Formato da célula',exact:true}).selectOption('currency');await page.getByRole('button',{name:'Aplicar formato às células selecionadas'}).click();
 await structure.selectOption('rowBelow');assert.equal(await cell(2,1).getAttribute('data-number-format'),'currency');
 await structure.selectOption('rowDelete');

 // Inserir coluna à direita: todas as linhas ganham a célula na posição certa.
 await cell(1,1).click();await structure.selectOption('columnRight');
 assert.deepEqual(await rows.evaluateAll(items=>items.map(item=>item.cells.length)),[4,4,4,4]);assert.deepEqual(await focused(),{row:1,col:2});
 // Inserir/excluir UMA célula: mexe só na linha atual.
 await structure.selectOption('cellRight');assert.deepEqual(await rows.evaluateAll(items=>items.map(item=>item.cells.length)),[4,5,4,4]);assert.deepEqual(await focused(),{row:1,col:3});
 await structure.selectOption('cellDelete');assert.deepEqual(await rows.evaluateAll(items=>items.map(item=>item.cells.length)),[4,4,4,4]);assert.deepEqual(await focused(),{row:1,col:3});
 // Excluir linha/coluna.
 await structure.selectOption('rowDelete');assert.deepEqual(await count(),{rows:3,cols:4,all:12});assert.deepEqual(await focused(),{row:1,col:3});
 await structure.selectOption('columnDelete');assert.deepEqual(await rows.evaluateAll(items=>items.map(item=>item.cells.length)),[3,3,3]);

 // Padronização: MESMA altura, superfície e linguagem de botão da barra de texto.
 await page.evaluate(()=>document.getElementById('notesToolbar').classList.add('notes-toolbar-inline'));
 const panel=page.locator('.notes-table-tools'),toolbar=page.locator('#notesToolbar');
 const css=(loc,prop)=>loc.evaluate((el,p)=>getComputedStyle(el)[p],prop);
 const panelConfirm=panel.getByRole('button',{name:'Aplicar valor ou fórmula',exact:true}),toolbarButton=toolbar.locator('.toolbar-btn[data-command="bold"]');
 const boxHeight=loc=>loc.evaluate(el=>el.getBoundingClientRect().height);
 assert.equal(await css(panel,'flexWrap'),'nowrap');
 assert.equal(await css(panel,'minHeight'),await css(toolbar,'minHeight'));
 assert.equal(await css(panel,'backgroundColor'),await css(toolbar,'backgroundColor'));
 assert.equal(await boxHeight(panelConfirm),await boxHeight(toolbarButton));
 assert.equal(await css(panelConfirm,'color'),await css(toolbarButton,'color'));
 await page.evaluate(()=>{document.documentElement.dataset.theme='dark';});await page.waitForTimeout(50);
 assert.equal(await css(panel,'backgroundColor'),await css(toolbar,'backgroundColor'));
 assert.equal(await css(panelConfirm,'color'),await css(toolbarButton,'color'));
 assert.equal(await panel.locator('select').first().evaluate(el=>getComputedStyle(el).color),'rgb(148, 163, 184)');
 // Barra de navegação do Android acompanha o tema (não fica branca no escuro).
 assert.equal(await css(page.locator('html'),'colorScheme'),'dark');

 // Mobile: a barra da tabela só aparece ACOPLADA ao teclado (acima da toolbar de texto).
 await page.evaluate(()=>{document.documentElement.dataset.theme='light';document.documentElement.classList.add('notes-mobile');});
 await page.evaluate(()=>app.aplicarToolbarTeclado(300));await page.waitForTimeout(80);
 assert.ok(await page.evaluate(()=>document.getElementById('notesToolbar').classList.contains('notes-toolbar-docked')));
 assert.ok(await panel.evaluate(el=>el.classList.contains('notes-table-tools-docked')));
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).position),'fixed');
 assert.notEqual(await panel.evaluate(el=>getComputedStyle(el).bottom),'0px');
 // Teclado fechado SEM menu aberto: some, como a barra de texto.
 await page.evaluate(()=>app.aplicarToolbarTeclado(0));await page.waitForTimeout(80);
 assert.ok(!(await panel.evaluate(el=>el.classList.contains('notes-table-tools-docked'))),'painel some quando o teclado fecha');
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).display),'none');
 // Exceção: <select> aberto fecha o teclado, mas mantém a barra no rodapé.
 await page.evaluate(()=>app.aplicarToolbarTeclado(300));await page.waitForTimeout(60);
 await panel.getByRole('combobox',{name:'Estrutura da tabela'}).focus();
 await page.evaluate(()=>app.aplicarToolbarTeclado(0));await page.waitForTimeout(60);
 assert.ok(await panel.evaluate(el=>el.classList.contains('notes-table-tools-docked')),'select aberto mantém a barra');
 assert.equal(await panel.evaluate(el=>getComputedStyle(el).bottom),'0px');
 await page.evaluate(()=>{document.activeElement?.blur();app.sincronizarBarraTabela();});await page.waitForTimeout(60);
 assert.ok(!(await panel.evaluate(el=>el.classList.contains('notes-table-tools-docked'))));

 if(process.env.NOTES_TABLE_SCREENSHOT)await page.screenshot({path:process.env.NOTES_TABLE_SCREENSHOT});
 assert.deepEqual(errors,[]);console.log('OK: estrutura (linha/coluna/célula), tema do painel e barra acoplada ao teclado no mobile');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - NOTES TABLE STRUCTURE]
