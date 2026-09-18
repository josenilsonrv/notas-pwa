/* Small numeric formula evaluator. Input is parsed, never executed as JavaScript. */
(function(root){
 'use strict';
 const fault=code=>{throw new Error(code);};
 const scalar=value=>{if(Array.isArray(value)||!Number.isFinite(value))fault('#VALOR!');return value;};
 const aliases={SUM:'SOMA',AVERAGE:'MEDIA',MIN:'MINIMO',MAX:'MAXIMO',COUNT:'CONTAR',PRODUCT:'PRODUTO',SQRT:'RAIZ',POWER:'POTENCIA',ROUND:'ARRED',ABS:'ABS',MOD:'RESTO',SIN:'SEN',COS:'COS',TAN:'TAN',LOG10:'LOG10',LN:'LN',EXP:'EXP',FLOOR:'PISO',CEIL:'TETO',PI:'PI',FACT:'FATORIAL'};
 function call(name,args){
  name=aliases[name]||name;
  const values=args.flat().filter(Number.isFinite),a=()=>scalar(args[0]),b=()=>scalar(args[1]);
  if(['SOMA','MEDIA','MINIMO','MAXIMO','CONTAR','PRODUTO'].includes(name)){
   if(!args.length)fault('#ARG!');
   if(name==='SOMA')return values.reduce((x,y)=>x+y,0);
   if(name==='CONTAR')return values.length;
   if(!values.length)fault('#VALOR!');
   if(name==='MEDIA')return values.reduce((x,y)=>x+y,0)/values.length;
   if(name==='MINIMO')return Math.min(...values);
   if(name==='MAXIMO')return Math.max(...values);
   return values.reduce((x,y)=>x*y,1);
  }
  const arity={PI:[0,0],POTENCIA:[2,2],RESTO:[2,2],ARRED:[1,2],LOG:[1,2],RAIZ:[1,1],ABS:[1,1],SEN:[1,1],COS:[1,1],TAN:[1,1],LN:[1,1],LOG10:[1,1],EXP:[1,1],PISO:[1,1],TETO:[1,1],FATORIAL:[1,1]};
  if(!arity[name])fault('#FUNCAO!');
  if(args.length<arity[name][0]||args.length>arity[name][1])fault('#ARG!');
  switch(name){
   case 'PI':return Math.PI;
   case 'POTENCIA':return a()**b();
   case 'RAIZ':return Math.sqrt(a());
   case 'ABS':return Math.abs(a());
   case 'RESTO':if(b()===0)fault('#DIV/0!');return ((a()%b())+b())%b();
   case 'ARRED':{const places=args.length===2?b():0;if(!Number.isInteger(places)||Math.abs(places)>15)fault('#ARG!');const factor=10**places;return Math.sign(a())*Math.round((Math.abs(a())+Number.EPSILON)*factor)/factor;}
   case 'SEN':return Math.sin(a());case 'COS':return Math.cos(a());case 'TAN':return Math.tan(a());
   case 'LN':return Math.log(a());case 'LOG10':return Math.log10(a());case 'LOG':return Math.log(a())/Math.log(args.length===2?b():10);
   case 'EXP':return Math.exp(a());case 'PISO':return Math.floor(a());case 'TETO':return Math.ceil(a());
   case 'FATORIAL':{const n=a();if(!Number.isInteger(n)||n<0||n>170)fault('#NUM!');let result=1;for(let i=2;i<=n;i++)result*=i;return result;}
  }
 }
 function address(row,col){let label='';for(let n=col+1;n;n=Math.floor((n-1)/26))label=String.fromCharCode(65+(n-1)%26)+label;return label+(row+1);}
 function coordinates(ref){const match=/^\$?([A-Z]+)\$?([1-9]\d*)$/i.exec(ref);if(!match)fault('#REF!');let col=0;for(const c of match[1].toUpperCase())col=col*26+c.charCodeAt(0)-64;return [Number(match[2])-1,col-1];}
 function numeric(raw){let text=String(raw??'').trim().replace(/\s/g,'');if(!text)return NaN;const percent=text.endsWith('%');if(percent)text=text.slice(0,-1);if(text.includes(','))text=text.replace(/\./g,'').replace(',','.');return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)?Number(text)/(percent?100:1):NaN;}
 function evaluate(expression,read){
  let source=expression.trim().replace(/^=/,'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase(),offset=0,depth=0;
  if(source.length>4096)fault('#LIMITE!');
  const space=()=>{while(/\s/.test(source[offset]||'')&&offset<source.length)offset++;};
  const take=char=>{space();if(source[offset]===char){offset++;return true;}return false;};
  const ref=()=>{space();const match=/^\$?[A-Z]+\$?[1-9]\d*/.exec(source.slice(offset));if(!match)fault('#FORMULA!');offset+=match[0].length;return match[0];};
  function atom(){
   if(++depth>100)fault('#LIMITE!');let value;space();
   if(take('(')){value=add();if(!take(')'))fault('#FORMULA!');}
   else {
    const number=/^(?:\d+(?:[.,]\d*)?|[.,]\d+)(?:E[+-]?\d+)?/.exec(source.slice(offset));
    if(number){offset+=number[0].length;value=Number(number[0].replace(',','.'));}
    else {
     const name=/^[A-Z_][A-Z_0-9]*/.exec(source.slice(offset));
     if(name&&/^\s*\(/.test(source.slice(offset+name[0].length))){offset+=name[0].length;take('(');const args=[];if(!take(')')){do{args.push(add());}while(take(';'));if(!take(')'))fault('#FORMULA!');}value=call(name[0],args);}
     else {const start=ref();if(take(':')){const end=ref(),[r1,c1]=coordinates(start),[r2,c2]=coordinates(end);if((Math.abs(r2-r1)+1)*(Math.abs(c2-c1)+1)>10000)fault('#LIMITE!');value=[];for(let r=Math.min(r1,r2);r<=Math.max(r1,r2);r++)for(let c=Math.min(c1,c2);c<=Math.max(c1,c2);c++)value.push(read(address(r,c),true));}else value=read(start,false);}
    }
   }
   while(take('%'))value=scalar(value)/100;depth--;return value;
  }
  function power(){let value=atom();if(take('^'))value=scalar(value)**scalar(unary());return value;}
  function unary(){if(take('+'))return scalar(unary());if(take('-'))return -scalar(unary());return power();}
  function multiply(){let value=unary();for(;;){if(take('*'))value=scalar(value)*scalar(unary());else if(take('/')){const divisor=scalar(unary());if(divisor===0)fault('#DIV/0!');value=scalar(value)/divisor;}else return value;}}
  function add(){let value=multiply();for(;;){if(take('+'))value=scalar(value)+scalar(multiply());else if(take('-'))value=scalar(value)-scalar(multiply());else return value;}}
  const result=scalar(add());space();if(offset!==source.length)fault('#FORMULA!');if(!Number.isFinite(result))fault('#NUM!');return result;
 }
 function calculate(grid){
  const cache=new Map(),visiting=new Set();
  const read=(ref,range=false)=>{const [row,col]=coordinates(ref),key=address(row,col);if(!grid[row]||col>=grid[row].length)fault('#REF!');const raw=String(grid[row][col]??'').trim();if(!raw.startsWith('=')){const n=numeric(raw);if(range)return n;if(!raw)return 0;return scalar(n);}if(cache.has(key)){const value=cache.get(key);if(typeof value==='string')fault(value);return value;}if(visiting.has(key))fault('#CICLO!');if(visiting.size>200)fault('#LIMITE!');visiting.add(key);let result;try{result=evaluate(raw,read);}catch(error){result=error.message.startsWith('#')?error.message:'#FORMULA!';}visiting.delete(key);cache.set(key,result);if(typeof result==='string')fault(result);return result;};
  return grid.map((row,r)=>row.map((raw,c)=>{if(!String(raw).trim().startsWith('='))return raw;try{return read(address(r,c));}catch(error){return error.message;}}));
 }
 const api={evaluate,calculate,numeric,address,coordinates};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.NotesTableMath=api;
})(globalThis);
