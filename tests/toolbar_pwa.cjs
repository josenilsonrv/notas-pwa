/*
 * Barra de ferramentas do PWA: uma linha com rolagem horizontal, botão de
 * edição de posições (diálogo com arrastar-e-soltar), ordem persistida no dispositivo e
 * dock acima do teclado virtual (visualViewport).
 *
 * Usa o boot REAL (`new NotesPWA()` -> init), pois é nele que o PWA liga a
 * configuração da barra — os harnesses de paridade/motor chamam init? não.
 */
const assert=require('node:assert/strict');
const fs=require('node:fs');const path=require('node:path');
const {chromium}=require('playwright');

const read=f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8');

const montar=async(page,seedOrdem)=>{
  if(seedOrdem)await page.addInitScript(ordem=>{try{localStorage.clear();localStorage.setItem('notas-pwa-toolbar-order',JSON.stringify(ordem));}catch(_){}},seedOrdem);
  const html=read('index.html').replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'').replace(/<link\b[^>]*>/gi,'');
  await page.route('**/*',r=>r.request().resourceType()==='document'?r.fulfill({contentType:'text/html',body:html}):r.abort());
  await page.goto('http://notes.test');
  for(const f of ['styles.css','theme-origem.css','notes/editor.css','notes/extras.css','notes/tables.css'])await page.addStyleTag({content:read(f)});
  for(const f of ['notes/editor.js','notes/table-math.js','notes/extras.js','notes/tables.js'])await page.addScriptTag({content:read(f)});
  const source=read('app.js');
  await page.addScriptTag({content:source.slice(0,source.indexOf("document.addEventListener('DOMContentLoaded'"))+'\nwindow.TestApp = NotesPWA;'});
  await page.evaluate(seed=>{if(!seed)localStorage.clear();window.app=new TestApp();},Boolean(seedOrdem));
  await page.waitForTimeout(400);
};

const ordemDe=page=>page.evaluate(()=>[...app.chavesToolbar().values()]);

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960},hasTouch:true}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await montar(page);

  // 1) Botão de edição + ordem de fábrica capturada.
  assert.equal(await page.locator('#notesToolbar [data-pwa="editar-toolbar"]').count(),1,'botao de edicao existe');
  const fabrica=await ordemDe(page);
  assert.ok(fabrica.length>10,'barra tem varios botoes');
  assert.equal(await page.evaluate(()=>document.getElementById('notesToolbar').lastElementChild?.dataset.pwa||''),'editar-toolbar','botao de edicao no fim da barra');

  // 2) Em 390px: uma única linha, com rolagem horizontal e sem menu "...".
  await page.setViewportSize({width:390,height:800});
  await page.waitForTimeout(400);
  const layout=await page.evaluate(()=>{
    const t=document.getElementById('notesToolbar');
    const botoes=[...t.children].filter(el=>el.classList.contains('toolbar-btn')&&!el.classList.contains('notes-toolbar-more'));
    const caixa=t.getBoundingClientRect();
    const dentro=botoes.every(el=>{const r=el.getBoundingClientRect();return r.top>=caixa.top-1&&r.bottom<=caixa.bottom+1;});
    const mais=document.querySelector('.notes-toolbar-more');
    const gaveta=document.querySelector('.notes-toolbar-overflow');
    return {classe:t.classList.contains('notes-toolbar-inline'),rola:t.scrollWidth>t.clientWidth+1,altura:Math.round(caixa.height),dentro,maisVisivel:getComputedStyle(mais).display!=='none',gaveta:gaveta.children.length};
  });
  assert.equal(layout.classe,true,'classe notes-toolbar-inline aplicada');
  assert.equal(layout.rola,true,'barra rola na horizontal');
  assert.ok(layout.altura<70,'barra em uma unica linha (altura '+layout.altura+'px)');
  assert.equal(layout.dentro,true,'todos os botoes na mesma linha');
  assert.equal(layout.maisVisivel,false,'menu "..." escondido');
  assert.equal(layout.gaveta,0,'gaveta do motor vazia');
  await page.setViewportSize({width:1280,height:960});
  await page.waitForTimeout(300);

  // 3) Dock acima do teclado (inset simulado, pois não há teclado no headless).
  // Viewport de celular com altura <= 720px: é aí que o CSS do original dá
  // transform/backdrop-filter ao modal (containing block) e quebra o fixed.
  await page.setViewportSize({width:390,height:700});
  await page.waitForTimeout(300);
  // O poll do teclado (ligado quando o editor foca no boot) desfaria o
  // `insetForcado` no proximo tick; aqui ele e parado para medir so o calculo.
  await page.evaluate(()=>{clearInterval(app.notesToolbarTecladoPoll);app.notesToolbarTecladoPoll=null;(app.notesToolbarTecladoTimeouts||[]).forEach(clearTimeout);});
  await page.evaluate(()=>app.aplicarToolbarTeclado());
  assert.equal(await page.evaluate(()=>document.getElementById('notesToolbar').classList.contains('notes-toolbar-docked')),false,'sem teclado nao doca');
  await page.evaluate(()=>app.aplicarToolbarTeclado(260));
  const dock=await page.evaluate(()=>{const t=document.getElementById('notesToolbar');const s=getComputedStyle(t);return{classe:t.classList.contains('notes-toolbar-docked'),pos:s.position,bottom:s.bottom,pad:document.getElementById('notesEditor').style.paddingBottom};});
  assert.equal(dock.classe,true,'barra docada');
  assert.equal(dock.pos,'fixed','barra fixa enquanto o teclado esta aberto');
  assert.ok(parseFloat(dock.bottom)>0,'barra deslocada para cima do teclado');
  assert.ok(parseFloat(dock.pad)>0,'editor ganha espaco para nao ficar sob a barra');
  const visivel=await page.locator('#notesToolbar').boundingBox();
  const alturaJanela=await page.evaluate(()=>window.innerHeight);
  assert.ok(Math.abs((visivel.y+visivel.height)-(alturaJanela-260))<5,'barra visivelmente logo acima do teclado ('+JSON.stringify({topoBarra:Math.round(visivel.y+visivel.height),esperado:alturaJanela-260})+')');
  const modalBox=await page.locator('#notesModal').boundingBox();
  assert.ok(Math.abs(visivel.x-modalBox.x)<2&&Math.abs(visivel.width-modalBox.width)<2,'barra alinhada com o modal');
  await page.evaluate(()=>app.aplicarToolbarTeclado(0));
  assert.equal(await page.evaluate(()=>document.getElementById('notesToolbar').classList.contains('notes-toolbar-docked')),false,'barra volta ao normal');
  assert.equal(await page.evaluate(()=>document.getElementById('notesEditor').style.paddingBottom),'','espaco extra removido');

  // 3b) O poll do teclado so existe com o editor focado: para mesmo quando o
  // `focusout` vem de um filho (checkbox/botao dentro da nota) e o foco vai para
  // FORA do editor — antes o intervalo ficava rodando para sempre e o aparelho
  // continuava a re-renderizar a barra.
  const estadoPoll=()=>page.evaluate(()=>({poll:Boolean(app.notesToolbarTecladoPoll),timeouts:(app.notesToolbarTecladoTimeouts||[]).length}));
  await page.evaluate(()=>{
    const editor=document.getElementById('notesEditor');
    const dentro=document.createElement('button');
    dentro.type='button';dentro.id='focoNaNota';dentro.textContent='na nota';
    (editor.querySelector('.notes-line-text')||editor).append(dentro);
    const fora=document.createElement('button');
    fora.type='button';fora.id='focoForaDaNota';fora.textContent='fora';
    document.body.append(fora);
    dentro.focus();
    dentro.dispatchEvent(new FocusEvent('focusin',{bubbles:true}));
  });
  await page.waitForTimeout(50);
  assert.ok((await estadoPoll()).poll,'poll ligado com o foco dentro da nota');
  await page.evaluate(()=>{
    // O foco vai para fora do editor a partir de um filho: e o `focusout` que
    // chega com `target` = filho (nao `#notesEditor`) e enganava o codigo antigo.
    document.getElementById('focoForaDaNota').focus();
    document.getElementById('focoNaNota').dispatchEvent(new FocusEvent('focusout',{bubbles:true}));
  });
  await page.waitForTimeout(50);
  assert.deepEqual(await estadoPoll(),{poll:false,timeouts:0},'poll e reajustes parados quando o foco sai da nota (veio de um filho)');
  await page.evaluate(()=>{document.getElementById('focoNaNota')?.remove();document.getElementById('focoForaDaNota')?.remove();});

  // 4) Dialogo de edicao: ARRASTAR pela alca reordena, aplica ao vivo e persiste.
  await page.evaluate(()=>app.abrirEditorToolbar());
  await page.locator('.app-toolbar-editor').waitFor({state:'visible'});
  assert.equal(await page.locator('.app-toolbar-editor-row').count(),(await ordemDe(page)).length,'uma linha por botao');
  assert.equal(await page.locator('.app-toolbar-editor-grip').count(),(await ordemDe(page)).length,'uma alca por linha');
  assert.equal(await page.locator('.app-toolbar-editor button[aria-label*="esquerda"]').count(),0,'sem botao de seta esquerda');
  assert.equal(await page.locator('.app-toolbar-editor button[aria-label*="direita"]').count(),0,'sem botao de seta direita');
  const antes=await ordemDe(page);
  const arrastarAlca=async(indice,destino)=>{
    const alca=await page.locator('.app-toolbar-editor-row').nth(indice).locator('.app-toolbar-editor-grip').boundingBox();
    const alvo=await page.locator('.app-toolbar-editor-row').nth(destino).boundingBox();
    await page.mouse.move(alca.x+alca.width/2,alca.y+alca.height/2);
    await page.mouse.down();
    await page.mouse.move(alca.x+alca.width/2,alvo.y+alvo.height-2,{steps:6});
    await page.mouse.up();
    await page.waitForTimeout(200);
  };
  await arrastarAlca(0,1);
  const depois=await ordemDe(page);
  assert.equal(depois[0],antes[1],'arraste move uma posicao');
  assert.equal(depois[1],antes[0]);
  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('notas-pwa-toolbar-order'))),depois,'ordem salva pelo arraste');
  const dom=await page.evaluate(()=>app.filhosToolbar().map(el=>app.chavesToolbar().get(el)));
  assert.deepEqual(dom,depois,'ordem aplicada no DOM');
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest?.('.app-toolbar-editor')),true,'foco permanece dentro da modal');
  assert.equal(await page.locator('.app-toolbar-editor-row').count(),depois.length,'linhas reutilizadas no arraste');

  // 4.1) Teclado (o arraste nao serve para todos): ArrowDown/ArrowUp reordenam.
  const baseTeclado=await ordemDe(page);
  await page.locator('.app-toolbar-editor-row').first().focus();
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(150);
  assert.equal((await ordemDe(page))[0],baseTeclado[1],'teclado move uma posicao');
  assert.equal(await page.evaluate(()=>!!document.activeElement?.closest?.('.app-toolbar-editor')),true,'foco continua na modal apos o teclado');
  await page.keyboard.press('ArrowUp');
  await page.waitForTimeout(150);
  assert.deepEqual(await ordemDe(page),baseTeclado,'teclado volta uma posicao');

  // 4.1b) No celular o arraste e por TOQUE (Pointer Events: mesmo caminho do mouse).,  const tocarArrastar=async(indice,destino)=>{,    const alca=await page.locator('.app-toolbar-editor-row').nth(indice).locator('.app-toolbar-editor-grip').boundingBox();,    const alvo=await page.locator('.app-toolbar-editor-row').nth(destino).boundingBox();,    const cdp=await page.context().newCDPSession(page);,    const toque=(t,x,y)=>cdp.send('Input.dispatchTouchEvent',{type:t,touchPoints:t==='touchEnd'?[]:[{x,y,radiusX:3,radiusY:3,force:1,id:1}]});,    const x=alca.x+alca.width/2, y0=alca.y+alca.height/2, y1=alvo.y+alvo.height-2;,    await toque('touchStart',x,y0);,    for(let n=1;n<=6;n++){ await toque('touchMove',x,y0+(y1-y0)*n/6); await page.waitForTimeout(25); },    await toque('touchEnd',x,y1);,    await page.waitForTimeout(300);,    await cdp.detach().catch(()=>{});,  };,  const antesToque=await ordemDe(page);,  await tocarArrastar(0,1);,  const depoisToque=await ordemDe(page);,  assert.equal(depoisToque[0],antesToque[1],'toque arrasta e reordena');,  assert.equal(depoisToque[1],antesToque[0]);,  assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('notas-pwa-toolbar-order'))),depoisToque,'ordem salva pelo toque');,  assert.equal(await page.evaluate(()=>!!document.querySelector('.app-toolbar-editor-dragging')),false,'estado de arraste liberado no toque');,
  // 4.2) A reordenacao PARA depois do gesto (sem cascata) no repouso, no arraste e no resize.
  await page.evaluate(()=>{window.__ordens=0;const o=app.aplicarOrdemToolbar.bind(app);app.aplicarOrdemToolbar=function(...a){window.__ordens++;return o(...a);};});
  await page.waitForTimeout(400);
  const repouso=await page.evaluate(()=>window.__ordens);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>window.__ordens),repouso,'sem reordenacao em repouso');
  await arrastarAlca(1,2);
  await page.waitForTimeout(400);
  const aposArraste=await page.evaluate(()=>window.__ordens);
  await page.waitForTimeout(600);
  assert.equal(await page.evaluate(()=>window.__ordens),aposArraste,'reordenacao para depois do arraste');
  await page.evaluate(()=>{window.__ordens=0;});
  await page.setViewportSize({width:820,height:900});
  await page.waitForTimeout(800);
  const aposResize=await page.evaluate(()=>window.__ordens);
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(()=>window.__ordens),aposResize,'resize nao inicia cascata');

  // 5) "Restaurar padrão" volta à ordem de fábrica e limpa o storage.
  await page.getByRole('button',{name:'Restaurar padrão'}).click();
  await page.waitForTimeout(150);
  assert.deepEqual(await ordemDe(page),fabrica,'ordem de fabrica restaurada');
  assert.equal(await page.evaluate(()=>localStorage.getItem('notas-pwa-toolbar-order')),null,'storage limpo');
  await page.evaluate(()=>document.querySelector('.app-toolbar-editor')?.close());

  // 6) Persistência entre sessões: uma nova sessão aplica a ordem salva no boot.
  await page.evaluate(()=>app.moverBotaoToolbar(app.filhosToolbar()[0],1));
  const ordemSalva=await page.evaluate(()=>JSON.parse(localStorage.getItem('notas-pwa-toolbar-order')));
  const page2=await browser.newPage({viewport:{width:1280,height:960},hasTouch:true});
  const erros2=[];page2.on('pageerror',e=>erros2.push(e.message));
  await montar(page2,ordemSalva);
  assert.deepEqual(await ordemDe(page2),ordemSalva,'ordem aplicada ao recarregar o app');
  assert.deepEqual(erros2,[]);
  await page2.close();

  assert.deepEqual(errors,[]);
  console.log('OK: toolbar inline com rolagem, sem "..." , ordem editavel/persistida e dock acima do teclado');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
