/*
 * Nota gigante na PWA: uma nota com ~1 milhão de caracteres deve ABRIR
 * (renderizar no editor) e SALVAR sem estourar a cota do LocalStorage.
 *
 * Cobre os ajustes: o espelho legado ('notas-pwa-content') e o rascunho
 * duplicado ('notes-draft:*') ficam de fora em notas grandes — antes o
 * armazenamento passava de 4 milhões de caracteres (limite do navegador ~5 MB)
 * e a gravação podia falhar.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:700},hasTouch:true});
  page.setDefaultTimeout(120000);
  const erros=[];page.on('pageerror',e=>erros.push(e.message));
  const html=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  await page.route('**/*',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.goto('http://notes.test');
  for(const f of ['styles.css','theme-origem.css','notes/editor.css','notes/extras.css','notes/tables.css'])await page.addStyleTag({content:read(f)});
  for(const f of ['notes/editor.js','notes/table-math.js','notes/extras.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
  const source=read('app.js');
  await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});

  const r=await page.evaluate(async()=>{
   localStorage.clear();
   // ~1.000.000 de caracteres em 1000 linhas (1001 caracteres por linha)
   const conteudo=Array.from({length:1000},(_,i)=>'<div class="notes-line" data-level="0" data-document-version="1"><div class="notes-line-text">'+String(i).padStart(4,'0')+' '+'texto '.repeat(166)+'</div></div>').join('');
   localStorage.setItem('notas-pwa-notes',JSON.stringify([{id:'local',nome:'gigante',notas:conteudo}]));
   localStorage.setItem('notas-pwa-nota-ativa','local');

   window.app=new TestApp();
   await new Promise(resolve=>setTimeout(resolve,400));

   const editor=document.getElementById('notesEditor');
   const t0=performance.now();
   await app.openNotesModal('local');
   const abrir=Math.round(performance.now()-t0);

   if(app.notesSession)app.notesSession.saved='forcar-gravacao';
   const t1=performance.now();
   await app.saveNotes();
   const salvar=Math.round(performance.now()-t1);
   app.storeNotesDraft();

   let chars=0;const chaves=[];
   for(const k of Object.keys(localStorage)){const v=localStorage[k]||'';chars+=v.length+k.length;chaves.push(k);}
   return {abrir,salvar,caracteresEditor:editor.textContent.length,charsArmazenados:chars,chaves,status:document.getElementById('notesSaveStatus')?.textContent||''};
  });

  assert.ok(r.caracteresEditor>1000000,'a nota com ~1 milhao de caracteres deve ser renderizada ('+r.caracteresEditor+' chars no editor)');
  assert.equal(r.status,'Salvo','a nota grande deve salvar sem erro');
  assert.ok(r.charsArmazenados<4000000,'armazenamento deve ficar com folga abaixo da cota ('+r.charsArmazenados+' chars)');
  assert.ok(!r.chaves.includes('notas-pwa-content'),'nota grande nao deve gravar o espelho legado');
  assert.ok(!r.chaves.some(k=>k.startsWith('notes-draft:')),'nota grande nao deve gravar rascunho duplicado');
  assert.deepEqual(erros,[]);
  console.log('OK: nota com ~1 milhao de caracteres abre e salva (abrir '+r.abrir+'ms, salvar '+r.salvar+'ms, armazenamento '+r.charsArmazenados+' chars)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
