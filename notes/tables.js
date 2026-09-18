/* Contextual table tools. Only a table being edited is recalculated. */
function installNotesTables(App){
 const p=App.prototype,setup=p.setupNotesEditing,record=p.recordNotesHistory;
 const editor=()=>document.getElementById('notesEditor');
 const cellAt=node=>(node?.nodeType===3?node.parentElement:node)?.closest?.('td,th');
 const tableOf=cell=>cell?.closest('table');
 const cells=table=>[...table.rows].map(row=>[...row.cells]);
 const label=cell=>NotesTableMath.address(cell.parentElement.rowIndex,cell.cellIndex);
 const source=cell=>cell.dataset.formula??cell.dataset.cellValue??cell.textContent;
 const functions=[['Soma','SOMA'],['Média','MEDIA'],['Menor valor','MINIMO'],['Maior valor','MAXIMO'],['Contar números','CONTAR'],['Produto','PRODUTO'],['Raiz quadrada','RAIZ'],['Potência','POTENCIA'],['Arredondar','ARRED'],['Valor absoluto','ABS'],['Resto da divisão','RESTO'],['Logaritmo','LOG'],['Logaritmo natural','LN'],['Seno','SEN'],['Cosseno','COS'],['Tangente','TAN'],['Fatorial','FATORIAL']];
 const messages={'#DIV/0!':'Não é possível dividir por zero.','#REF!':'Esta célula não existe na tabela.','#CICLO!':'A fórmula depende dela mesma, direta ou indiretamente.','#VALOR!':'Use números nas operações.','#ARG!':'Verifique os argumentos da função.','#NUM!':'O resultado não é um número válido.','#FORMULA!':'Confira os parênteses e use ; para separar argumentos.','#FUNCAO!':'Função não reconhecida.','#LIMITE!':'A fórmula ou cadeia de referências é grande demais.'};
 p.notesRecalculateTable=function(table,skip=null){
  if(!table?.isConnected)return;const grid=cells(table),values=NotesTableMath.calculate(grid.map(row=>row.map(source)));
  grid.forEach((row,r)=>row.forEach((cell,c)=>{
   const expression=source(cell).trim(),formula=expression.startsWith('='),format=cell.dataset.numberFormat||'auto';
   if(formula)cell.dataset.formula=expression;
   if(cell===skip)return;
   const value=formula?values[r][c]:NotesTableMath.numeric(source(cell));
   if(!formula&&!Number.isFinite(value))return;
   if(!formula&&format==='auto'&&cell.dataset.cellValue===undefined)return;
   let display;
   if(typeof value==='number'){
    const decimals=Math.max(0,Math.min(10,Number(cell.dataset.numberDecimals??2))),options=format==='auto'?{maximumSignificantDigits:12}:{minimumFractionDigits:decimals,maximumFractionDigits:decimals};
    if(format==='currency'){options.style='currency';options.currency=['BRL','USD','EUR','GBP','JPY'].includes(cell.dataset.numberCurrency)?cell.dataset.numberCurrency:'BRL';}
    if(format==='percent')options.style='percent';
    display=!formula&&format==='auto'?source(cell):new Intl.NumberFormat('pt-BR',options).format(value);
    if(!formula){if(format==='auto')delete cell.dataset.cellValue;else cell.dataset.cellValue=source(cell);}
   }else display=value;
   if(cell.textContent!==display)cell.textContent=display;
   if(formula){cell.title=messages[display]||expression;cell.dataset.formulaError=String(typeof value!=='number');}

  }));
 };
 p.recordNotesHistory=function(...args){
  if(this.notesDirtyTables?.size){const active=cellAt(getSelection().anchorNode);for(const table of this.notesDirtyTables)this.notesRecalculateTable(table,active);this.notesDirtyTables.clear();}
  return record.apply(this,args);
 };
 p.setupNotesEditing=function(){
  setup.call(this);if(this.notesTablesReady)return;this.notesTablesReady=true;this.notesDirtyTables=new Set();
  const app=this,root=editor();let active=null,selected=[],editing=false,frame,drag=null,referenceAnchor=null;
  const panel=document.createElement('div');panel.className='notes-table-tools';panel.hidden=true;
  const address=document.createElement('span');address.className='notes-table-address';address.textContent='A1';
  const input=document.createElement('input');input.className='notes-table-formula';input.setAttribute('aria-label','Valor ou fórmula da célula');input.placeholder='Valor ou fórmula: =SOMA(A1:A3)';
  const makeButton=(text,name,action)=>{const b=document.createElement('button');b.type='button';b.textContent=text;b.title=name;b.setAttribute('aria-label',name);b.onmousedown=e=>e.preventDefault();b.onclick=action;return b;};
  const fill=()=>{if(active?.isConnected){address.textContent=label(active);input.value=source(active);input.title=active.title||'';numberFormat.value=active.dataset.numberFormat||'auto';currency.value=active.dataset.numberCurrency||'BRL';decimals.value=active.dataset.numberDecimals||'2';currencyLabel.hidden=numberFormat.value!=='currency';}};
  const focusCell=cell=>{const range=document.createRange();range.selectNodeContents(cell);range.collapse(false);root.focus({preventScroll:true});getSelection().removeAllRanges();getSelection().addRange(range);app.rememberNotesSelection();};
  const commit=()=>{if(!active?.isConnected)return;app.flushNotesTyping();const value=input.value.trim();if(value.startsWith('=')){active.dataset.formula=value;}else{delete active.dataset.formula;delete active.dataset.cellValue;delete active.dataset.formulaError;active.removeAttribute('title');active.textContent=input.value||'';if(!active.textContent)active.append(document.createElement('br'));}editing=false;referenceAnchor=null;app.notesRecalculateTable(tableOf(active));app.recordNotesHistory();focusCell(active);fill();};
  const confirm=makeButton('Aplicar','Aplicar valor ou fórmula',commit);
  const functionsMenu=document.createElement('select');functionsMenu.setAttribute('aria-label','Inserir função matemática');functionsMenu.append(new Option('ƒx Cálculos',''));functions.forEach(([name,value])=>functionsMenu.append(new Option(name,value)));
  functionsMenu.onchange=()=>{if(!active||!functionsMenu.value)return;editing=true;referenceAnchor=null;input.value='='+functionsMenu.value+'()';input.focus();input.setSelectionRange(input.value.length-1,input.value.length-1);functionsMenu.value='';};
  const help=makeButton('?','Ajuda de cálculos',()=>app.notesExtraDialog('Cálculos na tabela',dialog=>{
   const text=document.createElement('p');text.className='notes-table-help';text.textContent='Comece com =. Use +, −, *, /, ^ (potência), % e parênteses. Exemplos: =A1+B1, =A1*15%, =SOMA(A1:A5), =MEDIA(A1:A5), =POTENCIA(A1;2), =ARRED(A1;2). Use vírgula decimal (1,5) e ponto e vírgula entre argumentos. As funções trigonométricas usam radianos; PI() retorna π. Enquanto edita a fórmula nesta barra, clique em uma célula para inserir sua referência. Shift+clique estende a referência para um intervalo. Enter aplica; Escape cancela. Shift+clique fora da edição de fórmula seleciona um grupo de células para formatar.';dialog.append(text);
  },help));
  const settings=makeButton('Ajustar','Tamanho e cores da tabela',()=>openSettings());
  const formats=document.createElement('div');formats.className='notes-table-formats';
  const numberFormat=document.createElement('select');numberFormat.setAttribute('aria-label','Formato da célula');[['auto','Automático'],['number','Número'],['currency','Moeda'],['percent','Porcentagem']].forEach(([value,text])=>numberFormat.append(new Option(text,value)));
  const currency=document.createElement('select');currency.setAttribute('aria-label','Moeda da célula');[['BRL','Real (R$)'],['USD','Dólar (US$)'],['EUR','Euro (€)'],['GBP','Libra (£)'],['JPY','Iene (¥)']].forEach(([value,text])=>currency.append(new Option(text,value)));
  const decimals=document.createElement('input');decimals.type='number';decimals.min=0;decimals.max=10;decimals.value=2;decimals.setAttribute('aria-label','Casas decimais');
  const field=(text,control)=>{const label=document.createElement('label');label.append(document.createTextNode(text),control);formats.append(label);return label;};field('Formato',numberFormat);const currencyLabel=field('Moeda',currency);currencyLabel.hidden=true;field('Casas decimais',decimals);
  numberFormat.onchange=()=>currencyLabel.hidden=numberFormat.value!=='currency';decimals.oninput=()=>{if(numberFormat.value==='auto')numberFormat.value='number';};
  formats.append(makeButton('Aplicar formato','Aplicar formato às células selecionadas',()=>{
   if(!active?.isConnected)return;if(!decimals.checkValidity()){decimals.reportValidity();return;}app.flushNotesTyping();const targets=selected.filter(cell=>cell.isConnected);for(const cell of targets){cell.dataset.numberFormat=numberFormat.value;cell.dataset.numberCurrency=currency.value;cell.dataset.numberDecimals=String(Math.max(0,Math.min(10,Number(decimals.value)||0)));}app.notesRecalculateTable(tableOf(active));app.recordNotesHistory();
  }));
  formats.title='Porcentagem: 0,15 é exibido como 15%. A precisão dos cálculos é preservada.';
  panel.append(address,input,confirm,functionsMenu,settings,help,formats);document.getElementById('notesToolbar').after(panel);
  input.onfocus=()=>{editing=true;};input.oninput=()=>{editing=true;referenceAnchor=null;};input.onkeydown=e=>{e.stopPropagation();if(e.key==='Enter'){e.preventDefault();commit();}if(e.key==='Escape'){e.preventDefault();editing=false;referenceAnchor=null;fill();if(active)focusCell(active);}};
  const markSelection=()=>{
   if(!CSS.highlights||!globalThis.Highlight)return;const highlight=new Highlight();for(const cell of selected){if(!cell.isConnected)continue;const range=document.createRange();range.selectNodeContents(cell);highlight.add(range);}CSS.highlights.set('notes-table-selection',highlight);
  };
  function select(cell,extend=false){
   if(active&&active!==cell&&active.isConnected&&(active.textContent.trim().startsWith('=')||active.dataset.numberFormat)){app.notesRecalculateTable(tableOf(active));app.recordNotesHistory();}
   if(!cell||!root.contains(cell)){if(!editing){panel.hidden=true;active=null;selected=[];markSelection();}return;}
   if(extend&&active&&tableOf(active)===tableOf(cell)){const r1=active.parentElement.rowIndex,r2=cell.parentElement.rowIndex,c1=active.cellIndex,c2=cell.cellIndex;selected=cells(tableOf(cell)).slice(Math.min(r1,r2),Math.max(r1,r2)+1).flatMap(row=>row.slice(Math.min(c1,c2),Math.max(c1,c2)+1));}
   else{active=cell;selected=[cell];}for(const row of cells(tableOf(cell)))for(const item of row)item.setAttribute('aria-label','Célula '+label(item));panel.hidden=false;fill();if(selected.length>1)address.textContent=label(selected[0])+':'+label(selected.at(-1));markSelection();
  }
  const coordinates=(cell)=>{const rect=cell.getBoundingClientRect();return {rect,x:rect.right,y:rect.bottom};};
  function widths(table){return [...table.rows[0].cells].map(cell=>cell.getBoundingClientRect().width);}
  function setWidths(table,values){let group=table.querySelector(':scope > colgroup');if(!group){group=document.createElement('colgroup');table.prepend(group);}while(group.children.length<values.length)group.append(document.createElement('col'));values.forEach((value,i)=>group.children[i].style.width=Math.max(48,value)+'px');table.style.width=values.reduce((sum,value)=>sum+Math.max(48,value),0)+'px';table.style.tableLayout='fixed';}
  function openSettings(){
   if(!active?.isConnected)return;const current=active,table=tableOf(current),initial=[...selected],tableSession=app.notesSession;
   app.notesExtraDialog('Ajustar tabela',dialog=>{
    const form=document.createElement('form'),scope=document.createElement('select');scope.setAttribute('aria-label','Aplicar a');[['selection',initial.length>1?'Células selecionadas':'Célula atual'],['row','Linha atual'],['column','Coluna atual'],['table','Tabela inteira']].forEach(([value,label])=>scope.append(new Option(label,value)));
    const field=(name,control)=>{const label=document.createElement('label');label.textContent=name;label.append(control);form.append(label);};field('Aplicar a',scope);
    const width=document.createElement('input'),height=document.createElement('input');width.type=height.type='number';width.min=48;width.max=1000;height.min=30;height.max=600;width.value=Math.round(current.getBoundingClientRect().width);height.value=Math.round(current.getBoundingClientRect().height);let sizeX=false,sizeY=false,backgroundDirty=false,borderDirty=false;const auto=document.createElement('input');auto.type='checkbox';auto.setAttribute('aria-label','Altura automática');auto.checked=!current.style.height;auto.onchange=()=>{sizeY=true;};width.oninput=()=>sizeX=true;height.oninput=()=>{sizeY=true;auto.checked=false;};field('Coluna (px)',width);field('Linha (px)',height);field('Altura automática',auto);
    const background=document.createElement('input'),border=document.createElement('input'),clearBackground=document.createElement('input'),defaultBorder=document.createElement('input');background.type=border.type='color';clearBackground.type=defaultBorder.type='checkbox';
    const toHex=color=>{const found=color.match(/\d+/g);return found?.length>=3?'#'+found.slice(0,3).map(n=>Number(n).toString(16).padStart(2,'0')).join(''):'#ffffff';};
    background.value=toHex(getComputedStyle(current).backgroundColor);border.value=toHex(getComputedStyle(current).borderTopColor);clearBackground.checked=!current.style.backgroundColor;defaultBorder.checked=!current.style.borderColor;
    background.oninput=()=>{backgroundDirty=true;clearBackground.checked=false;};border.oninput=()=>{borderDirty=true;defaultBorder.checked=false;};clearBackground.onchange=()=>backgroundDirty=true;defaultBorder.onchange=()=>borderDirty=true;
    field('Fundo',background);field('Sem fundo',clearBackground);field('Borda',border);field('Cor padrão da nota',defaultBorder);
    const submit=makeButton('Aplicar','Aplicar ajustes da tabela');submit.type='submit';form.append(submit);form.onsubmit=e=>{
     e.preventDefault();if(!table.isConnected||tableSession!==app.notesSession){dialog.close();return;}app.flushNotesTyping();let targets=initial.filter(cell=>cell.isConnected);if(scope.value==='table')targets=cells(table).flat();if(scope.value==='row')targets=[...current.parentElement.cells];if(scope.value==='column')targets=cells(table).map(row=>row[current.cellIndex]).filter(Boolean);
     const columns=new Set(targets.map(cell=>cell.cellIndex)),rows=new Set(targets.map(cell=>cell.parentElement));
     if(sizeX){const values=widths(table);columns.forEach(index=>values[index]=Math.max(48,Math.min(1000,Number(width.value)||48)));setWidths(table,values);}
     if(sizeY)rows.forEach(row=>[...row.cells].forEach(cell=>{cell.style.height=auto.checked?'':Math.max(30,Math.min(600,Number(height.value)||30))+'px';}));
     targets.forEach(cell=>{if(backgroundDirty)cell.style.backgroundColor=clearBackground.checked?'':background.value;if(borderDirty)cell.style.borderColor=defaultBorder.checked?'':border.value;});table.dataset.noteTable='true';app.recordNotesHistory();dialog.close();
    };dialog.append(form);
   },settings);
  }
  document.addEventListener('selectionchange',()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{if(editing||drag||panel.contains(document.activeElement)||document.activeElement?.closest?.('.notes-extra-dialog'))return;const cell=cellAt(getSelection().anchorNode);if(cell===active)return;select(cell);});});
  document.addEventListener('input',e=>{
   if(!root.contains(e.target))return;const cell=cellAt(getSelection().anchorNode);if(!cell)return;const text=cell.textContent.trim();delete cell.dataset.cellValue;if(!text.startsWith('=')){delete cell.dataset.formula;delete cell.dataset.formulaError;cell.removeAttribute('title');}else cell.dataset.formula=text;app.notesDirtyTables.add(tableOf(cell));if(!editing&&cell===active)fill();
  },true);
  document.addEventListener('keydown',e=>{
   if(!root.contains(e.target))return;const cell=cellAt(getSelection().anchorNode);if(!cell)return;
   if(e.key==='='&&!e.ctrlKey&&!e.metaKey&&!e.altKey){cell.textContent='';delete cell.dataset.formula;delete cell.dataset.cellValue;focusCell(cell);}
   if(cell.dataset.cellValue!==undefined&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&(e.key.length===1||e.key==='Backspace'||e.key==='Delete')){cell.textContent=e.key.length===1?'':cell.dataset.cellValue;delete cell.dataset.cellValue;focusCell(cell);}
   if((e.key==='Enter'||e.key==='Tab')&&cell.textContent.trim().startsWith('=')){e.preventDefault();e.stopImmediatePropagation();app.flushNotesTyping();cell.dataset.formula=cell.textContent.trim();app.notesRecalculateTable(tableOf(cell));app.recordNotesHistory();focusCell(cell);select(cell);}
  },true);
  root.addEventListener('dblclick',e=>{const cell=cellAt(e.target);if(cell&&(cell.dataset.formula||cell.dataset.cellValue!==undefined)){select(cell);input.focus();input.select();editing=true;}});
  document.addEventListener('pointerdown',e=>{
   const cell=cellAt(e.target);if(!cell||!root.contains(cell)||e.button!==0)return;
   if(editing&&active&&tableOf(active)===tableOf(cell)&&input.value.trim().startsWith('=')){
    e.preventDefault();e.stopImmediatePropagation();const ref=label(cell);let start=input.selectionStart,end=input.selectionEnd;
    if(e.shiftKey&&referenceAnchor){start=referenceAnchor.start;end=referenceAnchor.end;const range=referenceAnchor.ref+':'+ref;input.setRangeText(range,start,end,'end');referenceAnchor.end=start+range.length;}
    else{input.setRangeText(ref,start,end,'end');referenceAnchor={start,end:start+ref.length,ref};}input.focus();return;
   }
   editing=false;const {rect}=coordinates(cell),right=Math.abs(e.clientX-rect.right)<6,bottom=Math.abs(e.clientY-rect.bottom)<6;
   if((right||bottom)&&!e.shiftKey){
    e.preventDefault();e.stopImmediatePropagation();app.flushNotesTyping();const table=tableOf(cell);drag={table,cell,axis:right?'x':'y',start:right?e.clientX:e.clientY,widths:widths(table),height:rect.height};cell.setPointerCapture(e.pointerId);return;
   }
   if(e.shiftKey&&active&&tableOf(active)===tableOf(cell)){e.preventDefault();select(cell,true);}else select(cell);
  },true);
  const resizeCursor=axis=>{if(axis)root.dataset.tableResize=axis;else delete root.dataset.tableResize;root.style.cursor='';};
  document.addEventListener('pointermove',e=>{
   if(drag){resizeCursor(drag.axis);if(drag.axis==='x'){const values=[...drag.widths];values[drag.cell.cellIndex]=Math.max(48,Math.min(1000,values[drag.cell.cellIndex]+e.clientX-drag.start));setWidths(drag.table,values);}else [...drag.cell.parentElement.cells].forEach(cell=>cell.style.height=Math.max(30,Math.min(600,drag.height+e.clientY-drag.start))+'px');return;}
   const cell=cellAt(e.target);if(!cell||!root.contains(cell)){resizeCursor(null);return;}const {rect}=coordinates(cell);resizeCursor(Math.abs(e.clientX-rect.right)<6?'x':Math.abs(e.clientY-rect.bottom)<6?'y':null);
  });
  const endDrag=()=>{if(drag){drag=null;resizeCursor(null);app.recordNotesHistory();}};document.addEventListener('pointerup',endDrag);document.addEventListener('pointercancel',endDrag);root.addEventListener('pointerleave',()=>{if(!drag)resizeCursor(null);});
  document.addEventListener('pointerdown',e=>{if(!root.contains(e.target)&&!panel.contains(e.target)&&!e.target.closest('.notes-extra-dialog')){editing=false;select(null);}},true);
  const observer=new MutationObserver(()=>{if(active&&!active.isConnected){active=null;selected=[];editing=false;panel.hidden=true;markSelection();}});observer.observe(root,{childList:true,subtree:true});
 };
}
