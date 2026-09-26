// 🧪 [INÍCIO: TESTE - TEMA SWITCH]
/*
 * Seletor sutil de tema (claro/escuro) no header do PWA:
 * alterna manualmente, persiste no dispositivo e atualiza aria-checked,
 * o título e o meta theme-color. Cobre também a reabertura do app.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');
const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const montar=async(page,temaSalvo)=>{
  if(temaSalvo)await page.addInitScript(tema=>{try{localStorage.clear();localStorage.setItem('notas-pwa-theme',tema);}catch(_){}},temaSalvo);
  const html=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  await page.route('**/*',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.goto('http://notes.test');
  for(const f of ['styles.css','theme-origem.css'])await page.addStyleTag({content:read(f)});
  const source=read('app.js');
  await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestTheme = ThemeManager;'});
  await page.evaluate(limpar=>{if(limpar)localStorage.clear();document.documentElement.dataset.theme='light';document.getElementById('pastasArea').hidden=false;document.getElementById('notesModalBackdrop').classList.remove('active');window.tm=new TestTheme();},!temaSalvo);
};

const estado=page=>page.evaluate(()=>({
  tema:document.documentElement.dataset.theme,
  checked:document.getElementById('themeToggle').getAttribute('aria-checked'),
  salvo:localStorage.getItem('notas-pwa-theme'),
  cor:document.querySelector('meta[name="theme-color"]').getAttribute('content'),
  role:document.getElementById('themeToggle').getAttribute('role')
}));

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:390,height:800}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await montar(page);

  // 1) Estado inicial claro e acessível.
  let atual=await estado(page);
  assert.equal(atual.tema,'light');
  assert.equal(atual.checked,'false');
  assert.equal(atual.role,'switch','seletor exposto como switch');

  // 2) Clique alterna para escuro, persiste e atualiza meta/aria.
  await page.locator('#themeToggle').click();
  await page.waitForTimeout(60);
  atual=await estado(page);
  assert.equal(atual.tema,'dark');
  assert.equal(atual.checked,'true');
  assert.equal(atual.salvo,'dark');
  assert.equal(atual.cor,'#11161D');
  assert.ok((await page.locator('#themeToggle').getAttribute('title')).includes('escuro'));

  // 3) Clique volta para claro e persiste.
  await page.locator('#themeToggle').click();
  await page.waitForTimeout(60);
  atual=await estado(page);
  assert.equal(atual.tema,'light');
  assert.equal(atual.checked,'false');
  assert.equal(atual.salvo,'light');
  assert.equal(atual.cor,'#F8FAFC');

  // 4) O thumb do switch acompanha o tema (CSS).
  await page.waitForTimeout(400);
  const deslocamento=await page.evaluate(()=>getComputedStyle(document.querySelector('.app-theme-switch-thumb')).transform);
  assert.ok(deslocamento==='none'||/matrix\(1, 0, 0, 1, 0, 0\)/.test(deslocamento),'thumb à esquerda no claro ('+deslocamento+')');

  assert.deepEqual(errors,[]);
  await page.close();

  // 5) Reabrir o app com tema salvo mantém a escolha manual.
  const page2=await browser.newPage({viewport:{width:390,height:800}}),erros2=[];
  page2.on('pageerror',e=>erros2.push(e.message));
  await montar(page2,'dark');
  const reaberto=await estado(page2);
  assert.equal(reaberto.tema,'dark','tema salvo reaplicado');
  assert.equal(reaberto.checked,'true');
  await page2.waitForTimeout(400);
  const deslocamentoEscuro=await page2.evaluate(()=>getComputedStyle(document.querySelector('.app-theme-switch-thumb')).transform);
  assert.ok(deslocamentoEscuro!=='none'&&deslocamentoEscuro!=='matrix(1, 0, 0, 1, 0, 0)','thumb à direita no escuro ('+deslocamentoEscuro+')');
  assert.deepEqual(erros2,[]);
  await page2.close();

  console.log('OK: seletor sutil de tema (claro/escuro) alterna, persiste e reabre mantendo a escolha');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - TEMA SWITCH]
