// 🧪 [INÍCIO: TESTE - PWA SERVICE WORKER]
/*
 * Deploy/PWA: o Service Worker precisa ser servido como JavaScript NA RAIZ e nao
 * cair no fallback de SPA do host. Um sw.js respondido como text/html (status 200)
 * e rejeitado pelo navegador em silencio e o PWA para de atualizar no cliente.
 *
 * Sobe um servidor estatico REAL (com fallback de SPA, igual ao host do usuario),
 * porque nenhum outro teste cobre o caminho do Service Worker.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium}=require('playwright');

const raiz=path.join(__dirname,'..');
const TIPOS={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png'};
const PORTA=8123;

const servidor=http.createServer((req,res)=>{
  const rel=decodeURIComponent(req.url.split('?')[0]);
  const alvo=path.resolve(raiz, rel==='/' ? 'index.html' : '.'+rel);
  const existe=alvo.toLowerCase().startsWith(raiz.toLowerCase()) && fs.existsSync(alvo) && !fs.statSync(alvo).isDirectory();
  if(!existe){
    // Igual ao host do usuario: rota desconhecida devolve o index.html com 200.
    res.writeHead(200,{'Content-Type':'text/html; charset=utf-8'});
    res.end(fs.readFileSync(path.join(raiz,'index.html')));
    return;
  }
  res.writeHead(200,{'Content-Type':TIPOS[path.extname(alvo)]||'application/octet-stream'});
  fs.createReadStream(alvo).pipe(res);
});

(async()=>{
 await new Promise(r=>servidor.listen(PORTA,'127.0.0.1',r));
 const base='http://127.0.0.1:'+PORTA+'/';
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const ctx=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'allow'});
  const page=await ctx.newPage();
  const erros=[];
  page.on('pageerror',e=>erros.push(e.message));

  const redireciona=fs.readFileSync(path.join(raiz,'_redirects'),'utf8');
  assert.ok(/^\/sw\.js\s+\/sw\.js\s+200/m.test(redireciona),'_redirects serve o sw.js como arquivo estatico');
  const cabecalhos=fs.readFileSync(path.join(raiz,'_headers'),'utf8');
  assert.ok(cabecalhos.includes('Service-Worker-Allowed: /'),'_headers libera o escopo da raiz');

  const fonte=fs.readFileSync(path.join(raiz,'index.html'),'utf8');
  assert.ok(fonte.includes("updateViaCache: 'none'"),'registro usa updateViaCache none');
  assert.ok(fonte.includes("new URL('sw.js', document.baseURI)"),'registro resolve o caminho real do sw.js');

  await page.goto(base,{waitUntil:'domcontentloaded'});

  const sw=await page.evaluate(()=>fetch('sw.js',{cache:'no-store'}).then(r=>r.text().then(t=>({tipo:r.headers.get('content-type')||'',texto:t}))));
  assert.match(sw.tipo,/javascript|ecmascript/,'sw.js servido como JavaScript');
  assert.ok(sw.texto.includes('self.skipWaiting'),'install chama skipWaiting');
  assert.ok(sw.texto.includes('clients.claim'),'activate chama clients.claim');

  const tipoFalso=await page.evaluate(()=>fetch('rota-que-nao-existe',{cache:'no-store'}).then(r=>r.headers.get('content-type')||''));
  assert.match(String(tipoFalso),/text\/html/,'rota desconhecida cai no fallback de SPA');

  await page.waitForFunction(()=>!!navigator.serviceWorker.controller,null,{timeout:20000});
  const registro=await page.evaluate(async()=>{const r=await navigator.serviceWorker.getRegistration();return r?{escopo:r.scope,ativo:!!r.active}:null;});
  assert.ok(registro,'service worker registrado');
  assert.ok(registro.ativo,'service worker ativo');
  assert.equal(await page.evaluate(()=>window.__notasPronto===true),true,'app iniciou controlado pelo service worker');
  assert.deepEqual(erros,[],'sem erros de pagina');
  console.log('OK: sw.js na raiz servido como JavaScript (fora do fallback de SPA), registro com updateViaCache none e app inicia controlado');
 }finally{await browser.close();servidor.close();}
})().catch(e=>{console.error(e);process.exit(1);});
// 🧪 [FIM: TESTE - PWA SERVICE WORKER]
