/*
 * "Apagar todo o conteúdo" (Ctrl+A + Delete) numa nota com linhas escondidas por
 * colapso: o navegador ignora as linhas ocultas na hora de apagar, então sobrava
 * conteúdo invisível e o botão de colapso ficava preso na primeira linha.
 * Aqui a nota é zerada de fato: uma linha vazia, sem botão de colapso.
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
 for(const f of ['notes/editor.js','notes/table-math.js','notes/extras.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
 const source=read('app.js');await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});
 await page.evaluate(()=>{
  document.documentElement.dataset.theme='light';window.app=Object.create(TestApp.prototype);app.userId='local';app.projectsData=[{id:'local',nome:'Teste',notas:''}];app.focusStagesData=[];app.ensureNotesFocusPage=()=>{};app.showToast=()=>{};if(!TestApp.prototype.__motorInstalado){installNotesEditor(TestApp);if(typeof installNotesExtras==='function')installNotesExtras(TestApp);if(typeof installNotesTables==='function')installNotesTables(TestApp);if(typeof installLocalNotesStorage==='function')installLocalNotesStorage(TestApp);TestApp.prototype.__motorInstalado=true;}app.setupModalListeners();if(app.setupEventListeners)app.setupEventListeners();document.getElementById('notesModalBackdrop').classList.add('active');
  window.loadNote=async h=>{clearTimeout(app.notesSaveTimer);app.notesSession=null;app.projectsData[0].notas=h;localStorage.clear();await app.openNotesModal('local');};
 });
 const load=async h=>{await page.evaluate(x=>loadNote(x),h);await page.waitForTimeout(500);};
 const estado=()=>page.evaluate(()=>({linhas:[...document.querySelectorAll('#notesEditor .notes-line')].map(r=>r.querySelector('.notes-line-text').textContent), botoes:document.querySelectorAll('#notesEditor .notes-line-collapse').length}));

 // título com filhos escondidos -> Ctrl+A + Delete zera a nota
 await load('<h1>Titulo</h1><ul><li>filho</li></ul><p>fim</p>');
 const antes=await estado();
 assert.equal(antes.botoes,1,'o titulo tem botao de colapso (tem filhos ocultos)');
 await page.locator('#notesEditor').click();
 await page.keyboard.press('Control+a');
 await page.keyboard.press('Delete');
 await page.waitForTimeout(800);
 const depois=await estado();
 assert.equal(depois.linhas.length,1,'sobrou apenas uma linha');
 assert.equal(depois.linhas[0],'','a linha esta vazia');
 assert.equal(depois.botoes,0,'o botao de colapso sumiu da primeira linha');
 await page.keyboard.type('Recomeco');
 await page.waitForTimeout(200);
 assert.deepEqual((await estado()).linhas,['Recomeco'],'a digitacao volta a funcionar');
 assert.deepEqual(errors,[]);
 console.log('OK: apagar tudo (Ctrl+A) zera a nota e remove o botao de colapso');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
