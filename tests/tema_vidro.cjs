/*
 * Modo claro com efeitos de vidro (réplica do compilado do original).
 * O `parity_visual` compara cor/forma/tipografia, mas NÃO compara
 * `backdrop-filter`; este teste cobre exatamente os critérios de aceite
 * mensuráveis de docs/PROMPT-MODO-CLARO-VIDRO.md (seção 4) no tema claro
 * e o desligamento do vidro no tema escuro (seção 4.1).
 */
const assert=require('node:assert/strict');
const path=require('node:path');
const {chromium}=require('playwright');
const {montar,NOTA_EXEMPLO}=require('./helpers/parity.cjs');

const medir=page=>page.evaluate(()=>{
  const estilo=sel=>{const el=document.querySelector(sel);const s=getComputedStyle(el);return{
    backdropFilter:s.backdropFilter,
    backgroundColor:s.backgroundColor,
    borderTopColor:s.borderTopColor,
    borderRadius:s.borderRadius
  };};
  return {
    header:estilo('.notes-modal-header'),
    card:estilo('#notesEditorContainer'),
    nav:estilo('#notesContextNav'),
    body:getComputedStyle(document.body).fontFamily
  };
});

const vidroDe=dados=>({
  header:{backdropFilter:dados.header.backdropFilter,backgroundColor:dados.header.backgroundColor},
  card:{backdropFilter:dados.card.backdropFilter,backgroundColor:dados.card.backgroundColor},
  nav:{backdropFilter:dados.nav.backdropFilter,backgroundColor:dados.nav.backgroundColor}
});

(async()=>{
 const browser=await chromium.launch({headless:true,channel:'msedge'});
 try{
  const abrir=async(variante,tema)=>{
    const page=await browser.newPage({viewport:{width:1280,height:960}});
    await montar(page,variante,{tema});
    await page.evaluate(html=>window.carregarNota(html),NOTA_EXEMPLO);
    await page.waitForTimeout(250);
    const dados=await medir(page);
    await page.close();
    return dados;
  };

  // ---- Tema claro: o vidro vive aqui; o PWA replica o compilado do original.
  const claro=await abrir('pwa','light');
  const claroOriginal=await abrir('original','light');

  assert.equal(claro.header.backdropFilter,'blur(16px) saturate(1.08)','paineis com vidro');
  assert.equal(claro.header.backgroundColor,'rgba(255, 255, 255, 0.88)','painel translucido');
  assert.equal(claro.card.backdropFilter,'blur(18px) saturate(1.45)','card do editor com vidro');
  assert.equal(claro.card.backgroundColor,'rgba(245, 245, 247, 0.72)','fundo translucido do card');
  assert.equal(claro.card.borderTopColor,'rgba(255, 255, 255, 0.78)','borda translucida do card');
  assert.ok(/Segoe UI|-apple-system/.test(claro.body)&&!/Inter/.test(claro.body),'fonte system stack (nao Inter)');
  assert.deepEqual(vidroDe(claro),vidroDe(claroOriginal),'vidro do PWA identico ao original no claro');
  assert.ok(/Segoe UI|-apple-system/.test(claroOriginal.body)&&!/Inter/.test(claroOriginal.body),'fonte system stack no original');

  // ---- Tema escuro: o compilado desliga o vidro (superficies solidas).
  const escuro=await abrir('pwa','dark');
  const escuroOriginal=await abrir('original','dark');

  assert.equal(escuro.header.backdropFilter,'none','paineis sem vidro no escuro');
  assert.equal(escuro.header.backgroundColor,'rgb(21, 27, 35)','painel solido no escuro (#151B23)');
  assert.equal(escuro.card.backdropFilter,'none','card sem vidro no escuro');
  assert.equal(escuro.card.backgroundColor,'rgb(13, 18, 24)','card solido no escuro (#0D1218)');
  assert.deepEqual(vidroDe(escuro),vidroDe(escuroOriginal),'vidro escuro identico ao original (solidos, sem blur)');

  console.log('OK: modo claro com vidro (paineis blur16, card blur18/alpha .72, system stack) e escuro solido, iguais ao original');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
