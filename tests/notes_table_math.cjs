// 🧪 [INÍCIO: TESTE - NOTES TABLE MATH]
/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_table_math.cjs por tools/portar-testes.cjs.
 * Os asserts sao identicos aos do projeto original; apenas o bootstrap e os caminhos foram adaptados.
 * Adaptacoes: caminhos ../frontend/* -> ../
 */
const assert=require('node:assert/strict');
const math=require('../notes/table-math.js');
const result=expression=>math.calculate([[expression]])[0][0];
for(const [formula,value] of [['=2+3*4',14],['=(2+3)*4',20],['=-2^2',-4],['=2^3^2',512],['=200*15%',30],['=1,5+2.5',4],['=SOMA(1;2;3)',6],['=MÉDIA(2;4)',3],['=RAIZ(81)',9],['=POTENCIA(3;2)',9],['=ARRED(1,235;2)',1.24],['=ABS(-5)',5],['=RESTO(8;3)',2],['=FATORIAL(5)',120],['=LOG10(100)',2],['=COS(0)',1]])assert.equal(result(formula),value,formula);
assert.deepEqual(math.calculate([['10','20','=A1+B1'],['5','=SOMA(A1:A2)','=C1+B2']]),[['10','20',30],['5',15,45]]);
assert.deepEqual(math.calculate([['Título','2'],['4','=SOMA(A1:A2)']]),[['Título','2'],['4',4]]);
assert.equal(result('=1/0'),'#DIV/0!');assert.equal(result('=Z99'),'#REF!');assert.equal(result('=A1'),'#CICLO!');
assert.deepEqual(math.calculate([['=B1','=A1']]),[['#CICLO!','#CICLO!']]);
assert.equal(result('=globalThis.alert(1)'),'#FORMULA!');assert.equal(result('=SOMA('),'#FORMULA!');
assert.equal(math.address(12,26),'AA13');assert.deepEqual(math.coordinates('$AA$13'),[12,26]);
const start=performance.now();const grid=Array.from({length:50},(_,r)=>Array.from({length:20},(_,c)=>c===19?'=SOMA(A'+(r+1)+':S'+(r+1)+')':String(c)));const calculated=math.calculate(grid);assert.equal(calculated[49][19],171);assert.ok(performance.now()-start<1000);
console.log('OK: arithmetic, localized functions, references, dependencies, error handling and 1,000 cells');
// 🧪 [FIM: TESTE - NOTES TABLE MATH]
