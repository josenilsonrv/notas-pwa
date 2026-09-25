// 🧪 [INÍCIO: TESTE - MULTI NOTAS]
/*
 * Múltiplas notas locais (botão "+"), chips de nota e migração da nota única.
 * Cobre: migração de 'notas-pwa-content' -> 'notas-pwa-notes', criação ("+"),
 * troca de nota sem perder conteúdo, persistência no dispositivo, renomear e
 * excluir (com a última nota sempre recriada) e a cor de accent por chip.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
  const html=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  await page.route('**/*',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.goto('http://notes.test');
  for(const f of ['styles.css','theme-origem.css','notes/editor.css','notes/extras.css','notes/tables.css'])await page.addStyleTag({content:read(f)});
  for(const f of ['notes/editor.js','notes/table-math.js','notes/extras.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
  const source=read('app.js');await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});

  const chips=()=>page.locator('#notesContextNav .notes-context-chip:not(.notes-context-chip-add)');

  // 1) Migração: quem já usava o app (nota única) não perde o conteúdo.
  await page.evaluate(()=>{localStorage.clear();localStorage.setItem('notas-pwa-content','<p>Antiga</p>');window.app=new TestApp();});
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>app.projectsData.length),1,'deve migrar para uma nota');
  assert.equal(await page.evaluate(()=>app.projectsData[0].id),'local','a nota migrada mantém id "local"');
  assert.equal(await page.evaluate(()=>app.projectsData[0].notas),'<p>Antiga</p>');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('notas-pwa-notes')).length),1);
  assert.equal(await chips().count(),1);
  assert.equal(await page.locator('.notes-context-chip-add').textContent(),'+');
  assert.equal(await page.locator('.notes-context-chip-add').evaluate(el=>getComputedStyle(el).fontWeight),'700','CSS do botao "+" aplicado');

  // 2) O botão "+" cria uma nota nova e abre ela vazia e ativa.
  await page.locator('.notes-context-chip-add').click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>app.projectsData.length),2,'"+" cria nota');
  assert.equal(await chips().count(),2);
  assert.equal(await page.locator('#notesContextNav .notes-context-chip.is-active').textContent(),'Nova nota');
  const notaDois=await page.evaluate(()=>app.currentNotesProjectId);
  assert.equal(notaDois.startsWith('nota-'),true);
  assert.equal((await page.locator('#notesEditor').textContent()).trim(),'');

  // 3) Digitar salva na nota ATIVA (autosave) e a anterior continua guardada.
  await page.locator('#notesEditor').click();
  await page.keyboard.type('Conteudo da nota dois');
  await page.keyboard.press('Control+s');
  await page.waitForTimeout(1600);
  const lista=await page.evaluate(()=>JSON.parse(localStorage.getItem('notas-pwa-notes')));
  assert.ok(lista.find(n=>n.id===notaDois).notas.includes('Conteudo da nota dois'),'salvou na nota ativa');
  assert.ok(lista.find(n=>n.id==='local').notas.includes('Antiga'),'a outra nota ficou intacta');

  // 4) Trocar de chip recarrega o conteúdo de cada nota corretamente.
  await chips().first().click();
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(()=>app.currentNotesProjectId),'local');
  assert.ok((await page.locator('#notesEditor').textContent()).includes('Antiga'));
  await chips().nth(1).click();
  await page.waitForTimeout(300);
  assert.ok((await page.locator('#notesEditor').textContent()).includes('Conteudo da nota dois'));

  // 5) Renomear (duplo clique no chip abre o prompt) grava e repinta o chip/título.
  page.once('dialog',dialog=>dialog.accept('Renomeada'));
  await page.locator('#notesContextNav .notes-context-chip.is-active').dblclick();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#notesContextNav .notes-context-chip.is-active').textContent(),'Renomeada');
  assert.equal(await page.locator('#notesModalTitle').textContent(),'Renomeada');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('notas-pwa-notes')).find(n=>n.id===app.currentNotesProjectId).nome),'Renomeada');

  // 6) Cada chip usa a cor padrão (accent) da sua própria nota.
  await page.evaluate(()=>{app.projectsData[0].notas='<div class="notes-line" data-level="0" data-note-accent="#aa7733"><div class="notes-line-text">Cor</div></div>';app.renderNotesNav();});
  assert.equal(await chips().first().evaluate(el=>el.style.getPropertyValue('--notes-accent')),'#aa7733');

  // 7) Excluir (com confirmação) e, ao excluir a última, criar uma nova vazia.
  page.once('dialog',dialog=>dialog.accept());
  await page.evaluate(()=>app.excluirNota(app.currentNotesProjectId));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>app.projectsData.length),1);
  assert.equal(await page.evaluate(()=>app.projectsData[0].id),'local','volta para a nota restante');
  page.once('dialog',dialog=>dialog.accept());
  await page.evaluate(()=>app.excluirNota('local'));
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(()=>app.projectsData.length),1,'nunca fica sem nota');
  assert.equal(await page.evaluate(()=>app.projectsData[0].id.startsWith('nota-')),true);

  assert.deepEqual(errors,[]);
  console.log('OK: multi-notas (migração, "+", chips, troca, renomear, excluir, accent por nota)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - MULTI NOTAS]
