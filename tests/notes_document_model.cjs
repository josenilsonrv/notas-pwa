/*
 * Portado automaticamente de produtividade-ferrramenta/tests/notes_document_model.cjs por tools/portar-testes.cjs.
 * Os asserts sao identicos aos do projeto original; apenas o bootstrap e os caminhos foram adaptados.
 * Adaptacoes: caminhos frontend/* -> raiz
 */
const assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const context={crypto:require('node:crypto').webcrypto};vm.createContext(context);vm.runInContext(fs.readFileSync('notes/editor.js','utf8'),context);const Model=context.NotesDocument;
const block=(id,level,checked='false')=>({id,level,props:{check:'true',checked},content:[{type:'text',text:id}],attributes:[],classes:['notes-line'],textAttributes:[['class','notes-line-text']]});
const model=new Model({settings:{noteAccent:'#abc123'},blocks:[block('parent',0),block('old',1,'true'),block('new',1),block('grandchild',2),block('peer',0)]});
assert.equal(model.byId.get('grandchild').parentId,'new');model.setCompletion('parent',true,'2026-01-01T00:00:00Z');const saved=model.snapshot();const restored=Model.restore(saved);restored.setCompletion('parent',false);assert.equal(restored.byId.get('old').props.checked,'true');assert.equal(restored.byId.get('new').props.checked,'false');assert.equal(restored.byId.get('grandchild').props.checked,'false');assert.equal(Model.restore(saved).byId.get('new').props.checked,'true');
const hierarchy=new Model({blocks:[block('p',0),block('a',1),block('child',2),block('b',1)]});hierarchy.indent(['a'],-1);assert.equal(hierarchy.blocks.map(b=>b.id).join(','),'p,b,a,child');assert.equal(hierarchy.byId.get('b').parentId,'p');assert.equal(hierarchy.byId.get('child').parentId,'a');hierarchy.indent(['a'],1);assert.equal(hierarchy.byId.get('a').parentId,'p');hierarchy.move(['a'],-1);assert.equal(hierarchy.blocks.map(b=>b.id).join(','),'p,a,child,b');
const duplicate=new Model({blocks:[block('x',0),block('x',0)]});assert.notEqual(duplicate.blocks[0].id,duplicate.blocks[1].id);assert.throws(()=>Model.restore('{"version":99}'),/Unsupported/);
console.log('OK: modelo sem navegador, identidade, hierarquia, cascata, snapshots, recuo e movimento');

const numbered=new Model({blocks:[block('one',0),block('two',0)]});numbered.blocks.forEach((b,i)=>Object.assign(b.props,{list:'ol',checkNumber:String(i+1)}));numbered.move(['two'],-1);assert.equal(numbered.blocks.map(b=>b.id).join(','),'two,one');assert.equal(numbered.blocks.every(b=>b.props.checkNumber===undefined),true);
numbered.blocks.forEach((b,i)=>b.props.checkNumber=String(i+1));numbered.setCompletion('two',true);assert.equal(numbered.byId.get('two').props.checkNumber,'1');
console.log('OK: movimento manual recalcula pendentes; conclusão preserva número');

const promote=new Model({blocks:[block('before',0),block('parent',0),block('first',1),block('grandchild',2),block('second',1)]});promote.move(['first'],-1);assert.equal(promote.blocks.map(b=>b.id).join(','),'before,first,grandchild,parent,second');assert.equal(promote.byId.get('first').level,0);assert.equal(promote.byId.get('grandchild').parentId,'first');assert.equal(promote.byId.get('second').parentId,'parent');
console.log('OK: primeiro filho sobe acima do pai preservando os demais filhos');

const alignPrevious=new Model({blocks:[block('previous',0),block('heading',1),block('item',2),block('remaining',2)]});alignPrevious.move(['item'],-1);assert.equal(alignPrevious.blocks.map(b=>b.id).join(','),'previous,item,heading,remaining');assert.equal(alignPrevious.byId.get('item').level,0);assert.equal(alignPrevious.byId.get('remaining').parentId,'heading');
console.log('OK: recuo acompanha o item anterior ao título');

const originalPosition=new Model({blocks:[block('a',0),block('b',0),block('c',0)]});originalPosition.setCompletion('a',true);const restoredPosition=Model.restore(originalPosition.snapshot());restoredPosition.setCompletion('a',false);assert.equal(restoredPosition.blocks.map(b=>b.id).join(','),'a,b,c');
originalPosition.blocks=originalPosition.blocks.filter(b=>b.id!=='b');originalPosition.reindex();originalPosition.setCompletion('a',false);assert.equal(originalPosition.blocks.map(b=>b.id).join(','),'a,c');
console.log('OK: posição de conclusão persistida e retorno após exclusão de vizinho');

for(const order of [['a','b','c'],['c','b','a'],['b','a','c']]){
 const batch=new Model({blocks:['a','b','c'].map(id=>block(id,0))});
 ['a','b','c'].forEach(id=>batch.setCompletion(id,true));
 order.forEach(id=>batch.setCompletion(id,false));
 assert.equal(batch.blocks.map(row=>row.id).join(','),'a,b,c');
}
console.log('OK: all checked then unchecked in different orders restore original order');
