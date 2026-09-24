/*
 * Muitas notas (100): a área dos chips precisa rolar na vertical (a partir de
 * ~2 linhas) sem empurrar o conteúdo, e o botão "+" fica preso no canto inferior
 * direito, menor e translúcido, sem aumentar a altura do contêiner.
 * Também mede que renderizar/trocar notas não trava a thread.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
 const page=await browser.newPage({viewport:{width:390,height:800},hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');
 const html=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
 await page.route('**/*',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:html}):r.abort());
 await page.goto('http://notes.test');
 for(const f of ['styles.css','theme-origem.css','notes/editor.css','notes/extras.css','notes/tables.css'])await page.addStyleTag({content:read(f)});
 for(const f of ['notes/editor.js','notes/table-math.js','notes/extras.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
 const source=read('app.js');await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});
 await page.evaluate(()=>{localStorage.clear();document.documentElement.dataset.theme='light';window.app=new TestApp();});
 await page.waitForTimeout(700);

 const dados=await page.evaluate(()=>{
  const notas=Array.from({length:100},(_,i)=>({id:'n'+i,nome:'Nota '+(i+1)+(i%7===0?' nome longo para quebrar linha':''),notas:'<div class="notes-line" data-level="0"><div class="notes-line-text">conteudo '+i+'</div></div>'}));
  app.projectsData=notas;
  const t0=performance.now();
  app.renderNotesNav();
  const render=Math.round(performance.now()-t0);
  const nav=document.getElementById('notesContextNav');
  const estilo=getComputedStyle(nav);
  const mais=nav.querySelector('.notes-context-chip-add');
  nav.scrollTop=nav.scrollHeight;
  const caixaNav=nav.getBoundingClientRect(),caixaMais=mais.getBoundingClientRect();
  return {
   render, chips:nav.querySelectorAll('.notes-context-chip').length,
   overflowY:estilo.overflowY, maxHeight:estilo.maxHeight,
   navAltura:Math.round(caixaNav.height), rola:nav.scrollHeight>nav.clientHeight+1,
   maisLargura:Math.round(caixaMais.width), maisOpacidade:Number(getComputedStyle(mais).opacity),
   maisVisivel:caixaMais.bottom<=caixaNav.bottom+1&&caixaMais.top>=caixaNav.top-1&&caixaMais.right<=caixaNav.right+1
  };
 });
 assert.equal(dados.chips,101,'100 notas + botao "+"');
 assert.ok(dados.render<1500,'render dos 100 chips sem travar ('+dados.render+'ms)');
 assert.equal(dados.overflowY,'auto','chips rolam na vertical');
 assert.equal(dados.rola,true,'conteudo dos chips excede a area visivel');
 assert.ok(dados.navAltura<=90,'altura do nav limitada a ~2 linhas ('+dados.navAltura+'px)');
 assert.ok(dados.maisLargura<=30,'botao "+" menor ('+dados.maisLargura+'px)');
 assert.ok(dados.maisOpacidade<0.95,'botao "+" com media transparencia ('+dados.maisOpacidade+')');
 assert.equal(dados.maisVisivel,true,'botao "+" visivel no canto inferior direito apos rolar');

 // trocar para a ultima nota nao pode travar e deve manter os chips rolando
 const troca=await page.evaluate(async()=>{
  const t0=performance.now();
  await app.openNotesModal('n99');
  const ms=Math.round(performance.now()-t0);
  const nav=document.getElementById('notesContextNav');
  return {ms,ativo:nav.querySelector('.notes-context-chip.is-active')?.textContent||'',texto:document.querySelector('#notesEditor .notes-line-text')?.textContent||''};
 });
 assert.ok(troca.ms<2000,'trocar de nota nao trava ('+troca.ms+'ms)');
 assert.equal(troca.ativo,'Nota 100','chip ativo correto');
 assert.equal(troca.texto,'conteudo 99','conteudo da nota carregado');
 assert.deepEqual(errors,[]);
 console.log('OK: 100 notas nos chips com rolagem vertical, botao "+" fixo e troca sem travar (render '+dados.render+'ms, troca '+troca.ms+'ms)');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
