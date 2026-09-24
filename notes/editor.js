/* Versioned note document. This domain layer does not depend on the DOM. */
class NotesDocument {
    static VERSION = 1;
    // Níveis de indentação permitidos: 0 (sem recuo) a 4 (quatro recuos).
    static MAX_LEVEL = 4;
    static id() { return globalThis.crypto?.randomUUID?.() || 'note-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2); }
    constructor({version=1, blocks=[], settings={}}={}) {
        if(version!==NotesDocument.VERSION)throw new Error('Unsupported note document version');
        this.version=version;this.blocks=blocks;this.settings=settings;this.reindex();
    }
    reindex() {
        this.byId=new Map();const parents=[];
        for(const block of this.blocks){
            if(!block.id||this.byId.has(block.id))block.id=NotesDocument.id();
            block.level=Math.min(NotesDocument.MAX_LEVEL,Math.max(0,Number(block.level)||0));
            while(parents.length&&parents.at(-1).level>=block.level)parents.pop();
            block.parentId=parents.at(-1)?.id||null;
            this.byId.set(block.id,block);parents.push(block);
        }
    }
    snapshot(){return JSON.stringify({version:this.version,settings:this.settings,blocks:this.blocks});}
    static restore(snapshot){return new NotesDocument(JSON.parse(snapshot));}
    descendants(id){
        const result=[];for(const block of this.blocks){let parent=block.parentId;while(parent){if(parent===id){result.push(block);break;}parent=this.byId.get(parent)?.parentId;}}
        return result;
    }
    setCompletion(id,checked,timestamp=new Date().toISOString()){
        const block=this.byId.get(id);if(!block)return;
        const state=block.props;delete state.completedBy;
        let returnPosition;try{returnPosition=JSON.parse(state.completionPosition||'null');}catch{}
        if(checked){const peers=this.blocks.filter(b=>b.parentId===block.parentId),position=peers.indexOf(block);peers.forEach((peer,index)=>{if(peer.props.completionOrder===undefined)peer.props.completionOrder=String(index);});state.completionPosition=JSON.stringify({parentId:block.parentId,before:peers[position-1]?.id,after:peers[position+1]?.id,index:position});}
        if(checked){
            state.completedAt=timestamp;state.completionBatch=NotesDocument.id();
            for(const child of this.descendants(id))if(child.props.check==='true'&&child.props.checked!=='true'){
                child.props.checked='true';child.props.completedAt=timestamp;child.props.completedBy=state.completionBatch;
            }
        }else{
            const token=state.completionBatch;
            for(const child of this.descendants(id))if(token&&child.props.completedBy===token){child.props.checked='false';delete child.props.completedAt;delete child.props.completedBy;}
            delete state.completedAt;delete state.completionBatch;
        }
        state.checked=String(checked);
        // A checklist ends at a sibling without a checkbox or at its parent boundary.
        const index=this.blocks.indexOf(block),depth=block.level;let start=index,end=index+1;
        while(start>0){const previous=this.blocks[start-1];if(previous.level<depth||previous.level===depth&&previous.props.check!=='true')break;start--;}
        while(end<this.blocks.length){const next=this.blocks[end];if(next.level<depth||next.level===depth&&next.props.check!=='true')break;end++;}
        const group=[block,...this.descendants(id)],ids=new Set(group.map(b=>b.id));
        const boundary=this.blocks.slice(start,end).find(b=>b.level===depth&&!ids.has(b.id)&&b.props.checked==='true')||this.blocks[end];
        this.blocks=this.blocks.filter(b=>!ids.has(b.id));let insertion=boundary?this.blocks.indexOf(boundary):this.blocks.length;
        if(!checked&&returnPosition&&returnPosition.parentId===block.parentId){
            const after=this.byId.get(returnPosition.after),before=this.byId.get(returnPosition.before);
            if(after&&after.parentId===block.parentId&&this.blocks.includes(after))insertion=this.blocks.indexOf(after);
            else if(before&&before.parentId===block.parentId&&this.blocks.includes(before)){const last=this.descendants(before.id).filter(b=>this.blocks.includes(b)).at(-1)||before;insertion=this.blocks.indexOf(last)+1;}
            else{const peers=this.blocks.filter(b=>b.parentId===block.parentId),next=peers[Math.max(0,returnPosition.index||0)];if(next)insertion=this.blocks.indexOf(next);}
        }
        if(!checked&&state.completionOrder!==undefined){
            // Voltar à posição de origem: olha o PRIMEIRO irmão na ORDEM ORIGINAL
            // (completionOrder), não o primeiro na ordem atual. Se esse irmão ainda
            // estiver pendente, o item volta para logo antes dele; se já estiver
            // concluído, o item vai para o topo da pilha de concluídos (antes do
            // primeiro irmão concluído), preservando o fluxo de "desmarcar em
            // qualquer ordem restaura a ordem original".
            const ordem=Number(state.completionOrder),irmaos=this.blocks.filter(peer=>peer.parentId===block.parentId);
            const primeiroSeguinte=irmaos.filter(peer=>Number(peer.props.completionOrder)>ordem).sort((a,b)=>Number(a.props.completionOrder)-Number(b.props.completionOrder))[0];
            if(primeiroSeguinte&&primeiroSeguinte.props.checked!=='true')insertion=this.blocks.indexOf(primeiroSeguinte);
            else {const checkedPeer=irmaos.find(peer=>peer.props.checked==='true');if(checkedPeer)insertion=this.blocks.indexOf(checkedPeer);else{const preceding=irmaos.filter(peer=>Number(peer.props.completionOrder)<ordem).at(-1);if(preceding){const last=this.descendants(preceding.id).filter(row=>this.blocks.includes(row)).at(-1)||preceding;insertion=this.blocks.indexOf(last)+1;}}}
        }
        if(!checked)delete state.completionPosition;
        this.blocks.splice(insertion,0,...group);this.reindex();
    }
    renumber(parents=null){
        // Structural edits establish a new sequence; checkbox-only moves never call this.
        this.blocks.forEach(block=>{if(!parents||parents.has(block.parentId))delete block.props.checkNumber;});
    }
    indent(ids,delta){
        const chosen=ids.map(id=>this.byId.get(id)).filter(Boolean),first=chosen[0];if(!first)return;
        const selected=new Set(ids);ids.forEach(id=>this.descendants(id).forEach(b=>selected.add(b.id)));
        const group=this.blocks.filter(b=>selected.has(b.id)),parents=new Set(group.map(b=>b.parentId)),depth=first.level,previous=this.blocks[this.blocks.indexOf(first)-1];
        // Sem indentar além do teto (4 níveis) e sem "pular" a linha anterior.
        if(delta>0&&(group.some(b=>b.level>=NotesDocument.MAX_LEVEL)||!previous||depth>previous.level))return;
        if(delta<0&&depth>0&&group.every(b=>b.level>=depth)){
            let index=this.blocks.indexOf(group.at(-1))+1;while(index<this.blocks.length&&this.blocks[index].level>=depth)index++;
            const boundary=this.blocks[index];this.blocks=this.blocks.filter(b=>!selected.has(b.id));this.blocks.splice(boundary?this.blocks.indexOf(boundary):this.blocks.length,0,...group);
        }
        group.forEach(b=>b.level=Math.min(NotesDocument.MAX_LEVEL,Math.max(0,b.level+delta)));this.reindex();group.forEach(b=>parents.add(b.parentId));this.renumber(parents);
        if(delta>0){const parent=this.byId.get(first.parentId);if(parent)parent.props.collapsed='false';}
    }
    move(ids,direction){
        const selected=new Set(ids);ids.forEach(id=>this.descendants(id).forEach(b=>selected.add(b.id)));
        const group=this.blocks.filter(b=>selected.has(b.id));if(!group.length)return;
        const affectedParents=new Set(group.map(b=>b.parentId));
        let boundary;
        if(direction<0){
            let i=this.blocks.indexOf(group[0])-1;while(i>=0&&this.blocks[i].level>group[0].level)i--;
            if(i<0)return;boundary=this.blocks[i];
            if(boundary.level<group[0].level){
                // Above the parent, follow the indentation of the preceding visible item.
                const destinationLevel=this.blocks[i-1]?.level??boundary.level;
                const delta=group[0].level-destinationLevel;group.forEach(block=>block.level-=delta);
            }
        }
        else{const next=this.blocks[this.blocks.indexOf(group.at(-1))+1];if(!next||next.level!==group[0].level)return;const last=this.descendants(next.id).at(-1)||next;boundary=this.blocks[this.blocks.indexOf(last)+1];}
        this.blocks=this.blocks.filter(b=>!selected.has(b.id));this.blocks.splice(boundary?this.blocks.indexOf(boundary):this.blocks.length,0,...group);this.reindex();
        group.forEach(block=>affectedParents.add(block.parentId));this.renumber(affectedParents);
    }
}
globalThis.NotesDocument=NotesDocument;

/* Notes commands share one line structure; persisted notes remain HTML. */
function installNotesEditor(App) {
    const p = App.prototype, original = {};
    for (const name of ['openNotesModal','openStageNotesModal','closeNotesModal','setupModalListeners','toggleNotesFullscreen']) original[name] = p[name];
    const editor = () => document.getElementById('notesEditor');
    const lines = () => [...editor().children].filter(e => e.classList.contains('notes-line'));
    const body = line => line?.querySelector(':scope > .notes-line-text');
    const level = line => Number(line?.dataset.level || 0);
    const lineAt = node => (node?.nodeType === 3 ? node.parentElement : node)?.closest?.('.notes-line');
    const newLine = (html = '<br>', data = {}) => {
        const line = document.createElement('div'); line.className = 'notes-line';
        Object.assign(line.dataset, {level:'0', ...data});
        const text = document.createElement('div'); text.className = 'notes-line-text'; text.spellcheck=true; text.lang='pt-BR'; text.innerHTML = html || '<br>';
        line.append(text); return line;
    };
    function markdownRows(source){
        const root=document.createElement('div'),parts=source.replace(/\r\n?/g,'\n').split('\n');
        const escape=text=>text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        const inline=text=>{const codes=[];text=text.replace(/`([^`]+)`/g,(_,code)=>'\u0000'+(codes.push('<code>'+escape(code)+'</code>')-1)+'\u0000');return escape(text).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<strong>$1</strong>').replace(/\*([^*]+)\*/g,'<em>$1</em>').replace(/~~([^~]+)~~/g,'<s>$1</s>').replace(/\u0000(\d+)\u0000/g,(_,i)=>codes[i]);};
        const cells=text=>text.trim().replace(/^\||\|$/g,'').split('|').map(cell=>cell.trim());
        let fence=null,block='',codeLanguage='';
        for(let i=0;i<parts.length;i++){
            const text=parts[i],match=text.match(/^\s*(```+|~~~+)\s*([\w+-]*)/);
            if(match){if(fence){fence=null;}else{fence=match[1];block=NotesDocument.id();codeLanguage=match[2]||'';}continue;}
            if(fence){const last=root.lastElementChild;if(last?.dataset.codeBlock===block&&body(last).textContent.length+text.length<8192){body(last).querySelector('code').append(document.createTextNode('\n'+text));}else{const row=newLine('<code>'+escape(text)+'</code>',{codeBlock:block,codeLanguage,collapsed:'false'});root.append(row);}continue;}
            if(!text.trim()&&parts[i-1]?.trim()&&parts[i+1]?.trim())continue;
            if(text.includes('|')&&i+1<parts.length&&/^\s*\|?\s*:?-{3,}/.test(parts[i+1])){
                const table=document.createElement('table'),head=document.createElement('thead'),tr=document.createElement('tr');
                cells(text).forEach(value=>{const cell=document.createElement('th');cell.innerHTML=inline(value);tr.append(cell);});head.append(tr);table.append(head);const tbody=document.createElement('tbody');i++;
                while(i+1<parts.length&&parts[i+1].includes('|')&&parts[i+1].trim()){const tr=document.createElement('tr');cells(parts[++i]).forEach(value=>{const cell=document.createElement('td');cell.innerHTML=inline(value);tr.append(cell);});tbody.append(tr);}table.append(tbody);const row=newLine();body(row).replaceChildren(table);root.append(row);continue;
            }
            const heading=text.match(/^(#{1,6})\s+(.+)$/),list=text.match(/^(\s*)(?:([-+*])|(\d+)[.)])\s+(.+)$/);
            if(heading)root.append(newLine(inline(heading[2]),{heading:String(Math.min(3,heading[1].length)),collapsed:'false'}));
            else if(list)root.append(newLine(inline(list[4]),{list:list[3]?'ol':'ul',level:String(Math.floor(list[1].length/2)),collapsed:'false'}));
            else if(/^\s*(?:---+|\*\*\*+)\s*$/.test(text))root.append(newLine('<hr>'));
            else root.append(newLine(inline(text)||'<br>',{collapsed:'false'}));
        }
        return root;
    }
    function indentImportedSections(root){
        const headings=[];
        for(const row of root.children){
            const heading=Number(row.dataset.heading||0),relative=level(row);
            if(heading){
                while(headings.length&&headings.at(-1)>=heading)headings.pop();
                row.dataset.level=String(headings.length);headings.push(heading);
            }else row.dataset.level=String(headings.length+relative);
        }
    }
    function sanitize(root) {
        root.querySelectorAll('script,style,iframe,object,embed,meta,link').forEach(e=>e.remove());
        root.querySelectorAll('*').forEach(e=>[...e.attributes].forEach(a=>{
            if (/^on/i.test(a.name) || (/^(href|src)$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) e.removeAttribute(a.name);
        }));
    }
    function normalize(root) {
        if ([...root.children].every(e=>e.classList.contains('notes-line')) && ![...root.childNodes].some(n=>n.nodeType===3&&n.textContent.trim())) {
            // Whitespace between block elements is HTML indentation, not an editable line.
            // Leaving it here lets keyed moves accumulate visible gaps in pre-wrap editors.
            [...root.childNodes].filter(node=>node.nodeType===3&&!node.textContent.trim()).forEach(node=>node.remove());
            if (!root.children.length) root.append(newLine()); return;
        }
        const output = document.createDocumentFragment();
        function walkChildren(nodes,depth=0,list='') {
            let paragraph=null;
            const flush=()=>{if(paragraph){if(paragraph.textContent.trim()||paragraph.querySelector('img,br'))walk(paragraph,depth,list);paragraph=null;}};
            for(const node of nodes){
                if(node.nodeType===3||node.nodeType===1&&!node.matches('div,p,h1,h2,h3,ol,ul,li,table,pre,blockquote')){
                    if(!paragraph)paragraph=document.createElement('p');paragraph.append(node.cloneNode(true));
                }else{flush();walk(node,depth,list);}
            }flush();
        }
        function walk(node, depth = 0, list = '') {
            if(node.nodeType===3) { if(node.textContent.trim()) { const line=newLine();body(line).textContent=node.textContent;output.append(line); } return; }
            if(node.nodeType!==1 || node.matches('.notes-collapse-btn')) return;
            if(node.matches('ol,ul')) { [...node.childNodes].forEach(n=>walk(n,depth,node.tagName==='OL'?'ol':'ul'));return; }
            if(node.classList.contains('notes-line')) { output.append(node.cloneNode(true)); return; }
            const copy=node.cloneNode(true), nested=[...node.children].filter(e=>e.matches('ol,ul'));
            copy.querySelectorAll('.notes-collapse-btn,ol,ul').forEach(e=>e.remove());
            const check=copy.querySelector('input[type=checkbox]');
            const heading=copy.matches('table')?null:copy.matches('h1,h2,h3')?copy:copy.querySelector('h1,h2,h3,.note-heading,.note-title-line');
            const h=heading?.tagName.match(/^H([123])$/)?.[1] || heading?.className.match(/note-heading-([123])/)?.[1] || (heading?.classList.contains('note-title-line')?'1':'');
            const data={level:String(depth+Number(node.dataset.indentLevel||0)),list:node.matches('li')?list:'',heading:h};
            if(node.matches('pre')){data.codeBlock=NotesDocument.id();data.codeLanguage=copy.querySelector('[class*="language-"]')?.className.match(/language-([\w+-]+)/)?.[1]||'';}
            if(check) {data.check='true';data.checked=String(check.checked||check.hasAttribute('checked'));check.remove();}
            const content=copy.querySelector('.checklist-text') || copy;
            content.querySelectorAll('.note-heading,.note-title-line').forEach(e=>e.classList.remove('note-heading','note-title-line','note-heading-1','note-heading-2','note-heading-3'));
            if(!node.matches('li,.checklist-item,h1,h2,h3,p') && !check && [...copy.children].some(e=>e.matches('p,div,ol,ul,h1,h2,h3'))) {
                walkChildren([...node.childNodes],depth,list);return;
            }
            const preserveWrapper=node.matches('b,strong,i,em,u,s,span,a,img,table,pre,code,blockquote');
            output.append(newLine(preserveWrapper?copy.outerHTML:content.innerHTML,data));nested.forEach(n=>walk(n,depth+1));
        }
        walkChildren([...root.childNodes]); root.replaceChildren(output);if(!root.children.length)root.append(newLine());
    }
    const settingKeys=['noteAccent','noteColors','noteHighlightColors','noteAccentHistory'];
    function readNode(node){
        if(node.nodeType===3)return {type:'text',text:node.data};
        if(node.nodeType===8)return {type:'comment',text:node.data};
        if(node.nodeType!==1)return null;
        return {type:'element',tag:node.localName,namespace:node.namespaceURI,attributes:[...node.attributes].map(a=>[a.name,a.value]),children:[...node.childNodes].map(readNode).filter(Boolean)};
    }
    function writeNode(node){
        if(node.type==='text')return document.createTextNode(node.text);
        if(node.type==='comment')return document.createComment(node.text);
        const element=document.createElementNS(node.namespace||'http://www.w3.org/1999/xhtml',node.tag);
        node.attributes.forEach(([name,value])=>element.setAttribute(name,value));node.children.forEach(child=>element.append(writeNode(child)));return element;
    }
    function captureDocument(){
        const all=lines(),settings={},seen=new Set();
        settingKeys.forEach(key=>{const row=all.find(l=>l.dataset[key]);if(row)settings[key]=row.dataset[key];});
        const blocks=all.map(line=>{
            if(!line.dataset.noteId||seen.has(line.dataset.noteId))line.dataset.noteId=NotesDocument.id();seen.add(line.dataset.noteId);
            const props={...line.dataset};delete props.noteId;delete props.level;delete props.documentVersion;settingKeys.forEach(key=>delete props[key]);
            return {id:line.dataset.noteId,parentId:null,level:level(line),props,
                attributes:[...line.attributes].filter(a=>!a.name.startsWith('data-')&&!['style','hidden','class'].includes(a.name)).map(a=>[a.name,a.value]),
                classes:[...line.classList].filter(c=>c!=='notes-line-parent'),
                textAttributes:[...body(line).attributes].map(a=>[a.name,a.value]),content:[...body(line).childNodes].map(readNode).filter(Boolean)};
        });
        return new NotesDocument({blocks,settings});
    }
    function renderDocument(model,root=editor()){
        const existing=new Map([...root.children].map(row=>[row.dataset.noteId,row])),wanted=new Set();
        model.blocks.forEach((block,index)=>{
            let row=existing.get(block.id);if(!row){row=document.createElement('div');const text=document.createElement('div');text.className='notes-line-text';row.append(text);}
            wanted.add(row);const data={level:String(block.level),...block.props,...model.settings,noteId:block.id,documentVersion:String(model.version)};
            Object.keys(row.dataset).forEach(key=>{if(!(key in data))delete row.dataset[key];});Object.assign(row.dataset,data);
            const classes=block.classes.join(' ');if(row.className!==classes)row.className=classes;
            block.attributes.forEach(([name,value])=>row.setAttribute(name,value));
            const text=body(row);block.textAttributes.forEach(([name,value])=>text.setAttribute(name,value));
            const current=[...text.childNodes].map(readNode).filter(Boolean);
            if(JSON.stringify(current)!==JSON.stringify(block.content))text.replaceChildren(...block.content.map(writeNode));
            if(root.children[index]!==row)root.insertBefore(row,root.children[index]||null);
        });
        [...root.children].forEach(row=>{if(!wanted.has(row))row.remove();});
    }
    p.syncNotesDocument=function(){this.notesDocument=captureDocument();return this.notesDocument;};
    p.renderNotesDocument=function(){renderDocument(this.notesDocument);};
    function targets(line,all=lines(),start=all.indexOf(line),structural=false) {
        const result=[];
        for(let i=start+1;i<all.length;i++) {
            const candidate=all[i];
            if(candidate.dataset.outlineBreak&&line.dataset.heading&&Number(candidate.dataset.outlineBreak)<=Number(line.dataset.heading)&&level(candidate)<=level(line))break;
            if(level(candidate)>level(line)) {result.push(candidate);continue;}
            if(!structural && !line.dataset.list && line.dataset.check!=='true' && line.dataset.heading && (!candidate.dataset.heading || Number(candidate.dataset.heading)>Number(line.dataset.heading))) {result.push(candidate);continue;}
            break;
        }
        return result;
    }
    const notesCopyIcon='<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="13" rx="1.5"/><path d="M16 8V3H4v13h4"/></svg>';
    p.refreshNotesSyntaxHighlight=function(){
        const all=lines(),viewport=editor().getBoundingClientRect();
        // Presentation-only syntax ranges do not alter the document or selection.
        if(globalThis.CSS?.highlights&&globalThis.Highlight){
            const tokens={keyword:[],string:[],number:[],comment:[]};
            const pattern=/(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|\b(const|let|var|function|return|if|else|for|while|class|interface|type|enum|string|number|boolean|new|import|from|export|async|await|def|in|True|False|None|true|false|null|undefined)\b|\b(\d+(?:\.\d+)?)\b/g;
            for(const row of all){
                if(!row.classList.contains('notes-code-line')&&row.dataset.codeDisabled!=='true')continue;
                const rect=row.getBoundingClientRect();if(row.hidden||rect.bottom<Math.max(0,viewport.top)-300||rect.top>Math.min(innerHeight,viewport.bottom)+300)continue;
                const walker=document.createTreeWalker(body(row),NodeFilter.SHOW_TEXT);
                while(walker.nextNode()){const node=walker.currentNode;for(const match of node.data.matchAll(pattern)){const range=document.createRange();range.setStart(node,match.index);range.setEnd(node,match.index+match[0].length);tokens[match[1]?'comment':match[2]?'string':match[3]?'keyword':'number'].push(range);}}
            }
            for(const [name,ranges]of Object.entries(tokens)){const highlight=new Highlight();ranges.forEach(range=>highlight.add(range));CSS.highlights.set('notes-'+name,highlight);}
        }
    };
    p.refreshNotesCodePresentation=function(){
        const all=lines();
        let fencedCode=false,codeDepth=0,lastExplicit=null;
        all.forEach(line=>{
            if(lastExplicit!== (line.dataset.codeBlock||null))codeDepth=0;lastExplicit=line.dataset.codeBlock||null;
            const text=body(line).textContent.trim();
            const fence=/^(```|~~~)/.test(text);
            const signature=/^(?:(?:const|let|var)\s+[\w$]+\s*[=:]|(?:async\s+)?function\s*\w*\s*\(|(?:(?:export\s+)?(?:interface|type|enum)|class|def)\s+\w+|import\s+.+|from\s+.+\s+import\s+.+|#.*|[\w.]+\s*(?:\+?=|\()|(?:if|for|while|switch)\s*\(|(?:console\.\w+|print)\s*\(|return\s+.+;|\/\/|\/\*|[}\]]+[;,]?$)/.test(text);
            if(line.dataset.heading)codeDepth=0;
            const recognized=line.dataset.codeDisabled!=='true'&&(Boolean(line.dataset.codeBlock)||fencedCode||fence||signature||codeDepth>0);
            line.classList.toggle('notes-code-line',recognized);
            if(recognized){const syntax=text.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\/\/.*$|#.*$/g,'');codeDepth=Math.max(0,codeDepth+(syntax.match(/[\{\[]/g)||[]).length-(syntax.match(/[\}\]]/g)||[]).length);}

            if(fence){fencedCode=!fencedCode;if(!fencedCode)codeDepth=0;}
        });
        for(let i=1;i<all.length-1;i++){if(all[i].dataset.codeDisabled!=='true'&&!body(all[i]).textContent.trim()&&all[i-1].classList.contains('notes-code-line')){let end=i;while(end<all.length&&!body(all[end]).textContent.trim())end++;if(all[end]?.classList.contains('notes-code-line'))for(;i<end;i++)all[i].classList.add('notes-code-line');}}
        this.refreshNotesSyntaxHighlight();
        const isCode=row=>Boolean(row?.classList.contains('notes-code-line'));
        const sameBlock=(a,b)=>isCode(a)&&isCode(b)&&level(a)===level(b)&&(!a.dataset.codeBlock&&!b.dataset.codeBlock||a.dataset.codeBlock===b.dataset.codeBlock);
        all.forEach((row,index)=>{
            const start=isCode(row)&&!sameBlock(all[index-1],row);
            const end=isCode(row)&&!sameBlock(all[index+1],row);
            row.classList.toggle('notes-code-start',start);row.classList.toggle('notes-code-end',end);
            let header=row.querySelector(':scope > .notes-code-header');
            if(!start){header?.remove();return;}
            if(!header){header=document.createElement('div');header.className='notes-code-header';header.contentEditable='false';const label=document.createElement('span'),copy=document.createElement('button');copy.type='button';copy.title='Copiar código';copy.setAttribute('aria-label','Copiar código');copy.innerHTML=notesCopyIcon;header.append(label,copy);row.append(header);}
            const group=[];for(let i=index;i<all.length&&sameBlock(all[i],row);i++)group.push(all[i]);
            const code=group.map(item=>body(item).textContent).filter(text=>!/^\s*(```|~~~)/.test(text)).join('\n');
            const declared=row.dataset.codeLanguage||body(row).querySelector('[class*="language-"]')?.className.match(/language-([\w+-]+)/)?.[1]||body(row).textContent.match(/^\s*(?:```|~~~)([\w+-]+)/)?.[1];
            header.firstChild.textContent=declared||(/\b(?:interface|type|enum)\s+\w+/.test(code)?'typescript':/\b(?:const|let|var|console)\b/.test(code)?'javascript':/\b(?:def|print)\s*\(/.test(code)?'python':'Código');
            const button=header.lastChild;button.onmousedown=event=>event.preventDefault();button.onclick=async event=>{event.preventDefault();event.stopPropagation();try{await navigator.clipboard.writeText(code);button.textContent='✓';button.title='Copiado';setTimeout(()=>{button.innerHTML=notesCopyIcon;button.title='Copiar código';},1800);}catch{button.textContent='!';button.title='Não foi possível copiar';}};
        });
    };
    p.refreshNotesCollapseControls = function() {
        editor().querySelectorAll('.notes-collapsed-target').forEach(node=>node.classList.remove('notes-collapsed-target'));
        // Older HTML imports produced empty fragments after a BR followed by a source newline.
        // Real editor blank lines contain BR and are intentionally retained.
        const existingRows=lines();existingRows.forEach(row=>{const text=body(row);if(existingRows.length>1&&!row.dataset.codeBlock&&!row.dataset.heading&&!row.dataset.list&&row.dataset.check!=='true'&&!text.textContent.trim()&&!text.querySelector('br,img,hr,table,video,audio'))row.remove();});
        normalize(editor());
        // Old pasted documents can contain prose and code inside one preformatted row.
        for(const row of lines()){
            const text=body(row);if(row.dataset.codeDisabled==='true'||row.dataset.codeBlock||!text.querySelector('pre')||text.querySelector('table')||!/[\r\n]/.test(text.textContent))continue;
            const walker=document.createTreeWalker(text,NodeFilter.SHOW_TEXT),breaks=[];
            while(walker.nextNode()){const node=walker.currentNode;for(let i=0;i<node.length;i++)if(node.data[i]==='\n')breaks.push([node,i]);}
            let node=text,offset=0;const fragment=document.createDocumentFragment();
            for(const [end,endOffset]of [...breaks,[text,text.childNodes.length]]){
                const range=document.createRange();range.setStart(node,offset);range.setEnd(end,endOffset);
                const next=newLine('',{...row.dataset});delete next.dataset.noteId;body(next).replaceChildren(range.cloneContents());fragment.append(next);node=end;offset=endOffset+1;
            }
            row.replaceWith(fragment);
        }
        const counts=[], all=lines();editor().dataset.largeNote=String(editor().textContent.length>200000);all.forEach(l=>l.hidden=false);
        clearTimeout(this.notesCodeTimer);
        this.notesCodeTimer=setTimeout(()=>{if(editor()?.isConnected)this.refreshNotesCodePresentation();},250);
        const accent=all.find(l=>l.dataset.noteAccent)?.dataset.noteAccent||'';
        editor().style.setProperty('--notes-accent',/^#[0-9a-f]{6}$/i.test(accent)?accent:'var(--color-neon-blue)');document.getElementById('notesModal')?.style.setProperty('--notes-accent',/^#[0-9a-f]{6}$/i.test(accent)?accent:'var(--color-neon-blue)');
        document.querySelector('#notesContextNav .notes-context-chip.is-active')?.style.setProperty('--notes-accent',/^#[0-9a-f]{6}$/i.test(accent)?accent:'#0071e3');
        const customColors=all.find(l=>l.dataset.noteColors)?.dataset.noteColors||'';
        const highlights=all.find(l=>l.dataset.noteHighlightColors)?.dataset.noteHighlightColors||'';
        const accentHistory=all.find(l=>l.dataset.noteAccentHistory)?.dataset.noteAccentHistory||'';
        all.forEach(l=>{if(accentHistory)l.dataset.noteAccentHistory=accentHistory;if(accent)l.dataset.noteAccent=accent;if(customColors)l.dataset.noteColors=customColors;if(highlights)l.dataset.noteHighlightColors=highlights;});
        const childGroups=all.map((line,index)=>targets(line,all,index)),parented=new Set();
        childGroups.forEach(group=>group.forEach(child=>parented.add(child)));
        const completionOwners=new Map(all.filter(row=>row.dataset.completionBatch&&row.dataset.checked==='true').map(row=>[row.dataset.completionBatch,row]));
        // Read layout together before writing controls, avoiding a layout pass per row.
        const rowMetrics=all.map(line=>{
            if(editor().dataset.largeNote==='true'&&!line.dataset.list&&line.dataset.check!=='true'){
                const fallback={fontSize:'14px',lineHeight:'22.4px',color:'inherit',fontWeight:'400',fontStyle:'normal'};return {styles:[],fallback,first:fallback};
            }

            const walker=document.createTreeWalker(body(line),NodeFilter.SHOW_TEXT),styles=[];
            while(walker.nextNode())if(walker.currentNode.textContent.trim()){
                const computed=getComputedStyle(walker.currentNode.parentElement);
                styles.push({fontSize:computed.fontSize,lineHeight:computed.lineHeight,color:computed.color,fontWeight:computed.fontWeight,fontStyle:computed.fontStyle});
            }
            const computed=getComputedStyle(body(line));
            const fallback={fontSize:computed.fontSize,lineHeight:computed.lineHeight,color:computed.color,fontWeight:computed.fontWeight,fontStyle:computed.fontStyle};
            return {styles,fallback,first:styles[0]||fallback};
        });
        all.forEach((line,index)=>{
            const depth=level(line);counts.length=depth+1;
            if(line.dataset.list==='ol') counts[depth]=(counts[depth]||0)+1; else counts[depth]=0;
            line.style.setProperty('--notes-level',depth);
            if(line.dataset.lineColor)line.style.setProperty('--notes-line-color',line.dataset.lineColor);else line.style.removeProperty('--notes-line-color');
            let controls=line.querySelector(':scope > .notes-line-controls');
            if(!controls){controls=document.createElement('span');controls.className='notes-line-controls';controls.contentEditable='false';line.prepend(controls);}
            let collapse=controls.querySelector('.notes-line-collapse');const children=childGroups[index];
            if(children.length) {
                if(line.dataset.collapsed===undefined)line.dataset.collapsed=String(!children.some(child=>childGroups[all.indexOf(child)].length));
                if(!collapse){collapse=document.createElement('button');collapse.type='button';collapse.className='notes-line-collapse';collapse.innerHTML='<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 3 5 5-5 5"/></svg>';controls.prepend(collapse);}
                collapse.setAttribute('aria-expanded',String(line.dataset.collapsed!=='true'));
                collapse.setAttribute('aria-label',line.dataset.collapsed==='true'?'Expandir item':'Recolher item');collapse.title=collapse.getAttribute('aria-label')+' (Ctrl+Alt+L)';
            } else {collapse?.remove();delete line.dataset.collapsed;}
            line.classList.toggle('notes-line-parent',Boolean(collapse?.isConnected));
            if(line.dataset.check!=='true'){delete line.dataset.completedAt;delete line.dataset.completedBy;delete line.dataset.completionBatch;delete line.dataset.completionPosition;}
            let check=controls.querySelector('input');
            if(line.dataset.check==='true') {
                if(!check){check=document.createElement('input');check.type='checkbox';check.className='notes-line-check';check.setAttribute('aria-label','Concluir item');controls.insertBefore(check,controls.querySelector('.notes-line-marker'));}
                check.checked=line.dataset.checked==='true';
            } else check?.remove();
            const completionOwner=line.dataset.completedBy&&completionOwners.get(line.dataset.completedBy);
            if(line.dataset.checked==='true'&&line.dataset.completedAt&&!Number.isNaN(Date.parse(line.dataset.completedAt))&&!completionOwner){
                const checkChildren=targets(line,all,index,true).filter(row=>row.dataset.check==='true');
                const collective=checkChildren.length&&checkChildren.every(row=>row.dataset.checked==='true'&&row.dataset.completedBy===line.dataset.completionBatch&&row.dataset.completedAt===line.dataset.completedAt);
                controls.dataset.completionLabel=(collective?'Todos concluídos em ':'Concluído em ')+new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(line.dataset.completedAt));
            }else delete controls.dataset.completionLabel;
            const firstStyle=rowMetrics[index].first;
            controls.style.height=(parseFloat(firstStyle.lineHeight)||parseFloat(firstStyle.fontSize)*1.6)+'px';controls.style.minHeight=controls.style.height;
            if(check){const size=Math.max(14,Math.min(22,parseFloat(firstStyle.fontSize)*.85));check.style.width=size+'px';check.style.height=size+'px';}
            let marker=controls.querySelector('.notes-line-marker');
            if(line.dataset.list) {
                if(!marker){marker=document.createElement('span');marker.className='notes-line-marker';controls.append(marker);}
                marker.textContent=line.dataset.list==='ol'?(line.dataset.check==='true'&&line.dataset.checkNumber?line.dataset.checkNumber:counts[depth])+'.':'•';
                // Inline formatting and legacy notes must also style their markers.
                // Mixed selections keep their formatting confined to the selected words.
                const {styles,fallback}=rowMetrics[index];
                marker.style.fontWeight=styles.length?(styles.every(s=>Number(s.fontWeight)>=600)?'700':'400'):fallback.fontWeight;
                marker.style.fontSize=firstStyle.fontSize;marker.style.color=firstStyle.color;
                marker.style.fontStyle=styles.length?(styles.every(s=>s.fontStyle==='italic'||s.fontStyle==='oblique')?'italic':'normal'):fallback.fontStyle;
            }else marker?.remove();
            if(line.dataset.collapsed==='true')children.forEach(child=>child.hidden=true);
        });
        const toggle=document.querySelector('[data-command="collapseAll"]');
        if(toggle){const expanded=all.some((row,index)=>childGroups[index].length)&&all.every((row,index)=>!childGroups[index].length||row.dataset.collapsed!=='true');toggle.setAttribute('aria-expanded',String(expanded));toggle.title=expanded?'Recolher todos':'Expandir todos';toggle.innerHTML=expanded?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2v6m-3-3 3 3 3-3M10 18v-6m-3 3 3-3 3 3"/></svg>':'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 8V2m-3 3 3-3 3 3M10 12v6m-3-3 3 3 3-3"/></svg>';}
        this.syncNotesDocument();
    };
    p.getCleanNotesHtml = function() {
        const model=this.syncNotesDocument(),copy=document.createElement('div');renderDocument(model,copy);
        return copy.innerHTML;
    };
    function bookmark() {
        const selection=getSelection();if(!selection.rangeCount)return null;
        const range=selection.getRangeAt(0), all=lines();
        function point(node,offset) {const line=lineAt(node);if(!line)return null;const r=document.createRange();r.selectNodeContents(body(line));try{r.setEnd(node,offset);}catch{return null;}return [all.indexOf(line),r.toString().length];}
        return {start:point(range.startContainer,range.startOffset),end:point(range.endContainer,range.endOffset),startId:lineAt(range.startContainer)?.dataset.noteId,endId:lineAt(range.endContainer)?.dataset.noteId};
    }
    function caret(line,offset=0,range=null,end=false) {
        if(!line)return;const root=body(line),walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node=walker.nextNode(),left=offset;
        while(node&&left>node.length){left-=node.length;node=walker.nextNode();}
        const r=range||document.createRange();
        if(node) r[end?'setEnd':'setStart'](node,Math.min(left,node.length));else r[end?'setEnd':'setStart'](root,0);
        if(!range){editor().focus({preventScroll:true});r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);}return r;
    }
    function restore(mark) {if(!mark?.start)return;const all=lines(),start=all.find(l=>l.dataset.noteId===mark.startId)||all[mark.start[0]],end=all.find(l=>l.dataset.noteId===mark.endId)||all[mark.end?.[0]??mark.start[0]],r=caret(start,mark.start[1],document.createRange());if(!r)return;caret(end,mark.end?.[1]??mark.start[1],r,true);getSelection().removeAllRanges();getSelection().addRange(r);}
    function selected() {
        const mark=bookmark(),all=lines();if(!mark?.start)return [all.at(-1)];
        let end=mark.end?.[0]??mark.start[0];if(end>mark.start[0]&&mark.end[1]===0)end--;
        return all.slice(mark.start[0],end+1);
    }
    function deleteSelection() {
        const selection=getSelection(),mark=bookmark();if(!selection.rangeCount||selection.isCollapsed)return;
        if(!mark?.start||!mark.end||mark.start[0]===mark.end[0]){selection.getRangeAt(0).deleteContents();return;}
        const all=lines(),first=all[mark.start[0]],last=all[mark.end[0]],range=selection.getRangeAt(0);
        const prefix=document.createRange();prefix.selectNodeContents(body(first));prefix.setEnd(range.startContainer,range.startOffset);
        const suffix=document.createRange();suffix.selectNodeContents(body(last));suffix.setStart(range.endContainer,range.endOffset);
        const combined=document.createDocumentFragment();combined.append(prefix.cloneContents(),suffix.cloneContents());body(first).replaceChildren(combined);
        if(!body(first).textContent&&!body(first).querySelector('img,br'))body(first).append(document.createElement('br'));
        all.slice(mark.start[0]+1,mark.end[0]+1).forEach(l=>l.remove());caret(first,mark.start[1]);
    }
    p.restoreNotesSelection=function(){const saved=this.notesSelectionRange?.cloneRange();editor().focus({preventScroll:true});if(saved&&editor().contains(saved.commonAncestorContainer)){getSelection().removeAllRanges();getSelection().addRange(saved);}};
    p.resetNotesHistory=function(){this.notesHistory=[this.syncNotesDocument().snapshot()];this.notesHistoryMarks=[bookmark()];this.notesHistoryIndex=0;this.updateNotesHistoryButtons();};
    p.flushNotesTyping=function(){
        if(!this.notesTypingPending)return;
        this.notesTypingPending=false;clearTimeout(this.notesTypingTimer);this.recordNotesHistory(true);
    };
    p.recordNotesHistory=function(typingOnly=false){
        if(this.isRestoringNotesHistory)return;
        this.notesTypingPending=false;clearTimeout(this.notesTypingTimer);if(typingOnly){this.syncNotesDocument();clearTimeout(this.notesCodeTimer);this.notesCodeTimer=setTimeout(()=>this.refreshNotesCodePresentation(),800);}else this.refreshNotesCollapseControls();
        const html=this.notesDocument.snapshot();if(!this.notesHistory)this.resetNotesHistory();
        if(this.notesHistory[this.notesHistoryIndex]!==html){this.notesHistory=this.notesHistory.slice(0,this.notesHistoryIndex+1);this.notesHistoryMarks=(this.notesHistoryMarks||[]).slice(0,this.notesHistoryIndex+1);this.notesHistory.push(html);this.notesHistoryMarks.push(bookmark());while(this.notesHistory.length>2&&(this.notesHistory.length>100||this.notesHistory.reduce((size,item)=>size+item.length,0)>8000000)){this.notesHistory.shift();this.notesHistoryMarks.shift();}this.notesHistoryIndex=this.notesHistory.length-1;}
        this.updateNotesHistoryButtons();this.queueNotesSave();
    };
    p.undoNotes=function(){this.flushNotesTyping();this.restoreNotesHistory(this.notesHistoryIndex-1);};
    p.redoNotes=function(){this.flushNotesTyping();this.restoreNotesHistory(this.notesHistoryIndex+1);};
    p.restoreNotesHistory=function(index){if(index<0||index>=this.notesHistory.length)return;const positions=new Map(lines().filter(row=>!row.hidden).map(row=>[row,row.getBoundingClientRect()]));this.notesHistoryIndex=index;lines().forEach(row=>{row.getAnimations().forEach(animation=>animation.cancel());const controls=row.querySelector('.notes-line-controls');if(controls){clearTimeout(controls._completionNoticeTimer);controls.classList.remove('notes-completion-notice');}});this.notesDocument=NotesDocument.restore(this.notesHistory[index]);this.renderNotesDocument();this.refreshNotesCollapseControls();restore(this.notesHistoryMarks[index]);this.updateNotesHistoryButtons();this.animateNotesMovement(positions);this.queueNotesSave();};
    function selectedHeading() {
        const node=getSelection().anchorNode,element=node?.nodeType===3?node.parentElement:node;
        return element?.closest('[data-inline-heading]')?.dataset.inlineHeading ?? lineAt(node)?.dataset.heading ?? '';
    }
    function formatSelectionHeading(value,mark,chosen) {
        const remove=selectedHeading()===value;
        const all=lines();
        for(const line of chosen){
            const index=all.indexOf(line),start=index===mark.start[0]?mark.start[1]:0,end=index===mark.end[0]?mark.end[1]:body(line).textContent.length;
            if(end<=start)continue;
            const r=caret(line,start,document.createRange());caret(line,end,r,true);
            const span=document.createElement('span');span.dataset.inlineHeading=remove?'0':value;
            span.append(r.extractContents());span.querySelectorAll('[data-inline-heading]').forEach(e=>e.replaceWith(...e.childNodes));r.insertNode(span);
        }
    }
    function formatWholeLine(line,command,enabled){
        const field=command==='bold'?'fontWeight':'fontStyle';
        body(line).querySelectorAll(command==='bold'?'b,strong':'i,em').forEach(e=>e.replaceWith(...e.childNodes));
        body(line).querySelectorAll('[style]').forEach(e=>e.style[field]='');
        line.dataset[command]=String(enabled);
    }
    p.applyNotesTextStyle=function(property,value){
        this.restoreNotesSelection();const mark=bookmark(),chosen=selected().filter(Boolean),whole=getSelection().isCollapsed;
        if(!mark?.start)return;
        chosen.forEach(line=>{
            if(whole&&property==='color')line.dataset.lineColor=value;
            const index=lines().indexOf(line),text=body(line);
            const start=whole?0:index===mark.start[0]?mark.start[1]:0,end=whole?text.textContent.length:index===mark.end[0]?mark.end[1]:text.textContent.length;
            const range=caret(line,start,document.createRange());caret(line,end,range,true);
            if(property==='backgroundColor'&&value==='transparent'){
                const before=document.createRange();before.selectNodeContents(text);before.setEnd(range.startContainer,range.startOffset);
                const after=document.createRange();after.selectNodeContents(text);after.setStart(range.endContainer,range.endOffset);
                const prefix=before.cloneContents(),middle=range.cloneContents(),suffix=after.cloneContents();
                // cloneContents omits common ancestors; retain their non-highlight formatting.
                let ancestor=range.commonAncestorContainer.nodeType===3?range.commonAncestorContainer.parentElement:range.commonAncestorContainer;
                while(ancestor&&ancestor!==text){const wrapper=ancestor.cloneNode(false);wrapper.removeAttribute('id');wrapper.append(...middle.childNodes);middle.append(wrapper);ancestor=ancestor.parentElement;}
                middle.querySelectorAll('*').forEach(e=>{e.style.removeProperty('background');e.style.removeProperty('background-color');e.removeAttribute('bgcolor');if(e.tagName==='MARK')e.replaceWith(...e.childNodes);});
                text.replaceChildren(prefix,middle,suffix);
                text.querySelectorAll('span,font,mark').forEach(e=>{if(!e.textContent&&!e.querySelector('img,br'))e.remove();});
                if(!text.childNodes.length)text.append(document.createElement('br'));
                return;
            }
            const span=document.createElement('span');span.style[property]=value;span.append(range.extractContents());
            span.querySelectorAll('*').forEach(e=>{if(property==='textDecoration') {if(e.matches('s,strike,del'))e.replaceWith(...e.childNodes);else e.style.textDecoration='none';}else e.style[property]='inherit';});
            if(!span.childNodes.length)span.append(document.createElement('br'));range.insertNode(span);
        });
        this.refreshNotesCollapseControls();restore(mark);this.rememberNotesSelection();this.recordNotesHistory();this.updateNotesToolbarState();
    };
    p.setNotesDefaultColor=function(color){
        if(!/^#[0-9a-f]{6}$/i.test(color))return;
        const previous=lines()[0]?.dataset.noteAccent||'#0071e3',history=[...new Set([...(lines()[0]?.dataset.noteAccentHistory||'').split(',').filter(Boolean),previous,color])].slice(-16).join(',');
        lines().forEach(line=>{
            // Older versions linked body colors to the note accent. Freeze those colors.
            if(!line.dataset.heading)body(line).querySelectorAll('[style]').forEach(element=>{
                if(!element.closest('[data-inline-heading]:not([data-inline-heading="0"])')&&element.style.color.includes('--notes-accent'))element.style.color=getComputedStyle(element).color;
            });
            line.dataset.noteAccent=color;line.dataset.noteAccentHistory=history;
            if(line.dataset.heading){
                if(line.dataset.lineColor)line.dataset.lineColor='var(--notes-accent)';
                body(line).querySelectorAll('[style],font[color]').forEach(element=>{
                    if(element.style.color||element.hasAttribute('color')){element.removeAttribute('color');element.style.color='var(--notes-accent)';}
                });
            }else body(line).querySelectorAll('[data-inline-heading]:not([data-inline-heading="0"])').forEach(element=>{
                element.style.color='var(--notes-accent)';
                element.querySelectorAll('[style],font[color]').forEach(child=>{if(child.style.color||child.hasAttribute('color')){child.removeAttribute('color');child.style.color='inherit';}});
            });
        });
        this.recordNotesHistory();
    };
    p.closeNotesColorPanels=function(){
        document.querySelectorAll('#notesColorPalette,.notes-tone-picker').forEach(element=>{element._positionObserver?.disconnect();element._dispose?.();element.remove();});
    };
    p.setupNotesColors=function(){
        document.querySelectorAll('[data-notes-color]').forEach(button=>{
            button.addEventListener('mousedown',e=>{if(e.button===0)e.preventDefault();});
            button.addEventListener('click',()=>{
                const old=document.getElementById('notesColorPalette');if(old){this.closeNotesColorPanels();if(old.dataset.property===button.dataset.notesColor)return;}
                this.rememberNotesSelection();const panel=document.createElement('div');panel.id='notesColorPalette';panel.className='notes-color-palette';panel.dataset.property=button.dataset.notesColor;panel.setAttribute('role','dialog');panel.setAttribute('aria-label',button.title);
                
                let pendingColor=null,pendingDefault=false;
                const apply=value=>{pendingColor=value;pendingDefault=false;panel.querySelectorAll('.notes-color-grid button,.notes-custom-colors button').forEach(swatch=>swatch.setAttribute('aria-pressed',String(swatch.title===value)));};
                const colorKey=button.dataset.notesColor==='backgroundColor'?'noteHighlightColors':'noteColors';
                const rememberColor=value=>{const saved=(lines()[0]?.dataset[colorKey]||'').split(',').filter(Boolean);const colors=[...new Set([...saved,value])].slice(-12).join(',');lines().forEach(l=>l.dataset[colorKey]=colors);this.recordNotesHistory();};
                const grid=document.createElement('div');grid.className='notes-color-grid';
                const colors=[
                    ['#000000','#434343','#666666','#999999','#b7b7b7','#cccccc','#d9d9d9','#efefef','#f3f3f3','#ffffff'],
                    ['#980000','#ff0000','#ff9900','#ffff00','#00ff00','#00ffff','#4a86e8','#0000ff','#9900ff','#ff00ff'],
                    ['#e6b8af','#f4cccc','#fce5cd','#fff2cc','#d9ead3','#d0e0e3','#c9daf8','#cfe2f3','#d9d2e9','#ead1dc'],
                    ['#dd7e6b','#ea9999','#f9cb9c','#ffe599','#b6d7a8','#a2c4c9','#a4c2f4','#9fc5e8','#b4a7d6','#d5a6bd'],
                    ['#cc4125','#e06666','#f6b26b','#ffd966','#93c47d','#76a5af','#6d9eeb','#6fa8dc','#8e7cc3','#c27ba0'],
                    ['#a61c00','#cc0000','#e69138','#f1c232','#6aa84f','#45818e','#3c78d8','#3d85c6','#674ea7','#a64d79'],
                    ['#85200c','#990000','#b45f06','#bf9000','#38761d','#134f5c','#1155cc','#0b5394','#351c75','#741b47'],
                    ['#5b0f00','#660000','#783f04','#7f6000','#274e13','#0c343d','#1c4587','#073763','#20124d','#4c1130']
                ].flat();
                colors.forEach(color=>{const swatch=document.createElement('button');swatch.type='button';swatch.style.backgroundColor=color;swatch.setAttribute('aria-label',color);swatch.title=color;swatch.onclick=()=>apply(color);grid.append(swatch);});panel.append(grid);
                const recent=document.createElement('div');recent.className='notes-custom-colors';const recentTitle=document.createElement('small');recentTitle.textContent='Cores personalizadas';recent.append(recentTitle);
                (lines()[0]?.dataset[colorKey]||(colorKey==='noteHighlightColors'?'#ffd700':'')).split(',').filter(c=>/^#[0-9a-f]{6}$/i.test(c)).forEach(color=>{const swatch=document.createElement('button');swatch.type='button';swatch.style.background=color;swatch.title=color;swatch.setAttribute('aria-label',color);swatch.onclick=()=>apply(color);recent.append(swatch);});panel.append(recent);
                const reset=document.createElement('button');reset.type='button';reset.className='notes-color-reset';reset.textContent=button.dataset.notesColor==='color'?'Cor padrão':'Sem destaque';reset.onclick=()=>{if(button.dataset.notesColor==='color'){this.setNotesDefaultColor(picker.value);}else apply('transparent');};
                const custom=document.createElement('div');custom.className='notes-color-custom';const caption=document.createElement('label');caption.textContent='Personalizar';caption.htmlFor='notesCustomColor';const picker=document.createElement('button');picker.type='button';picker.id='notesCustomColor';picker.setAttribute('aria-label','Personalizar cor');picker.value=button.dataset.notesColor==='color'?(lines()[0]?.dataset.noteAccent||'#0071e3'):'#ffd700';picker.style.backgroundColor=picker.value;custom.append(caption,picker,reset);panel.append(custom);if(button.dataset.notesColor==='backgroundColor'){reset.textContent='Remover destaque';picker.title='Amarelo ouro — cor para personalizar';}
                const openCustom=(initial=button.dataset.notesColor==='color'?'#3b82f6':'#ffd700',defaultMode=false)=>{
                    const previousPopup=document.querySelector('.notes-tone-picker');previousPopup?._dispose?.();previousPopup?._positionObserver?.disconnect();previousPopup?.remove();
                    const popup=document.createElement('div');popup.className='notes-tone-picker';popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Escolher tonalidade');
                    let hue=0,saturation=1,brightness=1,draft=initial;
                    const area=document.createElement('div');area.className='notes-tone-area';area.tabIndex=0;area.setAttribute('role','slider');area.setAttribute('aria-label','Saturação e brilho');
                    const cursor=document.createElement('span');area.append(cursor);
                    const strip=document.createElement('div');strip.className='notes-tone-strip';const preview=document.createElement('span');preview.className='notes-tone-preview';const slider=document.createElement('input');slider.type='range';slider.min=0;slider.max=360;slider.setAttribute('aria-label','Matiz');strip.append(preview,slider);
                    const fields=document.createElement('div');fields.className='notes-tone-fields';
                    const values=['Hexadecimal','R','G','B'].map((name,i)=>{const label=document.createElement('label');label.textContent=name;const input=document.createElement('input');input.type=i?'number':'text';if(i){input.min=0;input.max=255;}else input.maxLength=7;input.setAttribute('aria-label',name);label.append(input);fields.append(label);return input;});
                    const render=()=>{
                        const c=brightness*saturation,x=c*(1-Math.abs((hue/60)%2-1)),m=brightness-c;
                        const components=hue<60?[c,x,0]:hue<120?[x,c,0]:hue<180?[0,c,x]:hue<240?[0,x,c]:hue<300?[x,0,c]:[c,0,x];
                        const rgb=components.map(v=>Math.round((v+m)*255));draft='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('');
                        values[0].value=draft;rgb.forEach((v,i)=>values[i+1].value=v);preview.style.background=draft;
                        area.style.background=`linear-gradient(to top, #000, transparent),linear-gradient(to right, #fff, transparent),hsl(${hue} 100% 50%)`;
                        cursor.style.left=(saturation*100)+'%';cursor.style.top=((1-brightness)*100)+'%';slider.value=hue;area.setAttribute('aria-valuetext',`Saturação ${Math.round(saturation*100)}%, brilho ${Math.round(brightness*100)}%`);
                    };
                    const fromHex=color=>{const rgb=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255),max=Math.max(...rgb),min=Math.min(...rgb),delta=max-min;
                        brightness=max;saturation=max?delta/max:0;hue=!delta?0:max===rgb[0]?60*(((rgb[1]-rgb[2])/delta)%6):max===rgb[1]?60*((rgb[2]-rgb[0])/delta+2):60*((rgb[0]-rgb[1])/delta+4);hue=(hue+360)%360;render();};
                    values.forEach((input,i)=>input.onchange=()=>{if(!i){if(/^#[0-9a-f]{6}$/i.test(input.value))fromHex(input.value);else render();}else fromHex('#'+values.slice(1).map(v=>Math.round(Math.max(0,Math.min(255,Number(v.value)||0))).toString(16).padStart(2,'0')).join(''));});
                    slider.oninput=()=>{hue=Number(slider.value);render();};
                    const pick=e=>{const rect=area.getBoundingClientRect();saturation=Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width));brightness=1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));render();};
                    area.onpointerdown=e=>{e.preventDefault();area.focus();area.setPointerCapture(e.pointerId);pick(e);};area.onpointermove=e=>{if(area.hasPointerCapture(e.pointerId))pick(e);};area.onpointerup=e=>{if(area.hasPointerCapture(e.pointerId))area.releasePointerCapture(e.pointerId);};
                    area.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();saturation=Math.max(0,Math.min(1,saturation+(e.key==='ArrowRight'?.01:e.key==='ArrowLeft'?-.01:0)));brightness=Math.max(0,Math.min(1,brightness+(e.key==='ArrowUp'?.01:e.key==='ArrowDown'?-.01:0)));render();};
                    if(window.EyeDropper){const eye=document.createElement('button');eye.type='button';eye.textContent='⌖';eye.setAttribute('aria-label','Conta-gotas');eye.onclick=async()=>{try{const result=await new EyeDropper().open();fromHex(result.sRGBHex);}catch{}};strip.insertBefore(eye,slider);}
                    const actions=document.createElement('div');actions.className='notes-custom-actions';
                    const close=()=>{popup._positionObserver?.disconnect();popup._dispose?.();popup.remove();(defaultMode?picker:add).focus();};const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Cancelar';cancel.onclick=close;
                    const ok=document.createElement('button');ok.type='button';ok.textContent='OK';ok.onclick=()=>{if(defaultMode){picker.value=draft;picker.style.backgroundColor=draft;pendingColor=draft;pendingDefault=true;close();return;}rememberColor(draft);const dot=document.createElement('button');dot.type='button';dot.style.background=draft;const color=draft;dot.title=color;dot.setAttribute('aria-label',color);dot.onclick=()=>apply(color);recent.insertBefore(dot,add);close();};actions.append(cancel,ok);
                    if(defaultMode){const restoreBlue=document.createElement('button');restoreBlue.type='button';restoreBlue.className='notes-restore-blue';restoreBlue.textContent='Restaurar azul padrão';restoreBlue.onclick=()=>fromHex('#0071e3');popup.append(restoreBlue);}
                    popup.prepend(area,strip,fields);
                    if(defaultMode){const saved=document.createElement('div');saved.className='notes-default-history';const label=document.createElement('small');label.textContent='Cores padrão salvas';saved.append(label);
                        (lines()[0]?.dataset.noteAccentHistory||'').split(',').filter(c=>/^#[0-9a-f]{6}$/i.test(c)).forEach(color=>{const swatch=document.createElement('button');swatch.type='button';swatch.style.background=color;swatch.title=color;swatch.setAttribute('aria-label','Aplicar padrão '+color);swatch.onclick=()=>{pendingColor=color;pendingDefault=true;picker.value=color;picker.style.backgroundColor=color;close();};saved.append(swatch);});popup.append(saved);}
                    popup.append(actions);document.body.append(popup);popup.setAttribute('popover','manual');popup.style.margin='0';popup.style.inset='auto';popup.showPopover();fromHex(initial);
                    const position=()=>{const viewport=window.visualViewport,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||document.documentElement.clientWidth,height=viewport?.height||innerHeight;
                        popup.style.maxWidth=Math.max(0,width-16)+'px';popup.style.maxHeight=Math.max(0,height-16)+'px';
                        const rect=(defaultMode?picker:add).getBoundingClientRect();popup.style.left=(left+Math.max(8,Math.min(rect.left-left,width-popup.offsetWidth-8)))+'px';popup.style.top=(top+Math.max(8,Math.min(rect.bottom+6-top,height-popup.offsetHeight-8)))+'px';};position();
                    const observer=new ResizeObserver(()=>{if(popup.isConnected)position();else observer.disconnect();});observer.observe(document.documentElement);popup._positionObserver=observer;
                    const dismiss=e=>{if(!popup.contains(e.target)){popup._positionObserver?.disconnect();popup._dispose?.();popup.remove();}};document.addEventListener('pointerdown',dismiss);popup._dispose=()=>document.removeEventListener('pointerdown',dismiss);
                    let leaveTimer;
                    popup.addEventListener('pointerleave',event=>{if(event.pointerType!=='mouse'||event.buttons)return;clearTimeout(leaveTimer);leaveTimer=setTimeout(()=>{if(popup.isConnected)close();},150);});
                    popup.addEventListener('pointerenter',()=>clearTimeout(leaveTimer));
                    const disposePopup=popup._dispose;popup._dispose=()=>{clearTimeout(leaveTimer);disposePopup?.();};
                    popup.addEventListener('mousedown',e=>e.stopPropagation());popup.addEventListener('keydown',e=>{e.stopPropagation();if(e.key==='Escape'){e.preventDefault();close();}if(e.key==='Tab'){const controls=[...popup.querySelectorAll('input,button,[tabindex]')];if(e.shiftKey&&document.activeElement===controls[0]){e.preventDefault();controls.at(-1).focus();}else if(!e.shiftKey&&document.activeElement===controls.at(-1)){e.preventDefault();controls[0].focus();}}});area.focus();
                };
                picker.onclick=()=>openCustom(picker.value,true);reset.onclick=()=>{if(button.dataset.notesColor==='color')openCustom(picker.value,true);else apply('transparent');};
                const add=document.createElement('button');add.type='button';add.textContent='+';add.setAttribute('aria-label','Adicionar cor personalizada');add.onclick=()=>openCustom();recent.append(add);
                if(window.EyeDropper){const dropper=document.createElement('button');dropper.type='button';dropper.textContent='⌖';dropper.setAttribute('aria-label','Conta-gotas');dropper.onclick=async()=>{try{const result=await new EyeDropper().open();openCustom(result.sRGBHex);}catch{}};recent.append(dropper);}
                if(button.dataset.notesColor==='color')reset.title='Usar a cor personalizada como padrão dos títulos e colapsos desta nota';
                const confirm=document.createElement('button');confirm.type='button';confirm.className='notes-color-apply';confirm.textContent='Aplicar';confirm.onclick=()=>{if(pendingColor===null)return;if(pendingDefault)this.setNotesDefaultColor(pendingColor);else this.applyNotesTextStyle(button.dataset.notesColor,pendingColor);this.closeNotesColorPanels();};panel.append(confirm);
                if(button.dataset.notesColor==='backgroundColor'){custom.remove();panel.insertBefore(reset,confirm);}
                panel.addEventListener('mousedown',e=>{if(e.target.tagName!=='INPUT')e.preventDefault();});
                panel.addEventListener('keydown',e=>{if(e.key==='Escape'){e.stopPropagation();this.closeNotesColorPanels();button.focus();}});
                document.getElementById('notesModal').append(panel);
                panel.setAttribute('popover','manual');panel.style.position='fixed';panel.style.margin='0';panel.style.inset='auto';panel.showPopover();
                const placePalette=()=>{if(!panel.isConnected)return;const viewport=window.visualViewport,width=viewport?.width||document.documentElement.clientWidth,height=viewport?.height||innerHeight,left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0;
                    panel.style.maxWidth=Math.max(0,width-16)+'px';panel.style.maxHeight=Math.max(0,height-16)+'px';const rect=button.getBoundingClientRect();panel.style.left=(left+Math.max(8,Math.min(rect.left-left,width-panel.offsetWidth-8)))+'px';panel.style.top=(top+Math.max(8,Math.min(rect.bottom-top,height-panel.offsetHeight-8)))+'px';};placePalette();
                const resizePalette=new ResizeObserver(()=>{if(panel.isConnected)placePalette();else resizePalette.disconnect();});resizePalette.observe(document.documentElement);panel._positionObserver=resizePalette;
                const outside=e=>{if(!panel.isConnected){document.removeEventListener('pointerdown',outside);return;}if(!document.querySelector('.notes-custom-dialog[open]')&&!e.target.closest('.notes-tone-picker')&&!panel.contains(e.target)&&!button.contains(e.target)){this.closeNotesColorPanels();}};document.addEventListener('pointerdown',outside);panel._dispose=()=>document.removeEventListener('pointerdown',outside);
            });
        });
    };
    p.executeNotesCommand=function(command){
        this.flushNotesTyping();
        if(command==='undo')return this.undoNotes();if(command==='redo')return this.redoNotes();
        this.restoreNotesSelection();normalize(editor());const mark=bookmark(), chosen=selected().filter(Boolean);
        if(this.notesHistoryMarks)this.notesHistoryMarks[this.notesHistoryIndex]=mark;
        if(command==='strikeThrough'&&getSelection().isCollapsed){return this.applyNotesTextStyle('textDecoration',document.queryCommandState('strikeThrough')?'none':'line-through');}
        if(command==='underline'&&getSelection().isCollapsed){return this.applyNotesTextStyle('textDecoration',document.queryCommandState('underline')?'none':'underline');}
        if(command==='bold'||command==='italic'){
            if(getSelection().isCollapsed){const enabled=chosen[0]?.dataset[command]!=='true';chosen.forEach(l=>formatWholeLine(l,command,enabled));}
            else return this.applyNotesTextStyle(command==='bold'?'fontWeight':'fontStyle',document.queryCommandState(command)?(command==='bold'?'400':'normal'):(command==='bold'?'700':'italic'));
        }
        else if(command.startsWith('heading')){
            const value=command.slice(-1);
            if(!getSelection().isCollapsed)formatSelectionHeading(value,mark,chosen);
            else {const remove=chosen.every(l=>l.dataset.heading===value);chosen.forEach(l=>{l.dataset.heading=remove?'':value;body(l).querySelectorAll('[data-inline-heading]').forEach(e=>e.replaceWith(...e.childNodes));});}
        }
        else if(command==='codeBlock'){
            if(chosen.length&&chosen.every(row=>row.dataset.codeBlock||row.classList.contains('notes-code-line'))){
                const ids=new Set(chosen.map(row=>row.dataset.codeBlock).filter(Boolean));
                lines().filter(row=>chosen.includes(row)||ids.has(row.dataset.codeBlock)).forEach(row=>{delete row.dataset.codeBlock;delete row.dataset.codeLanguage;row.dataset.codeDisabled='true';row.classList.remove('notes-code-line','notes-code-start','notes-code-end');row.querySelector('.notes-code-header')?.remove();});
                this.recordNotesHistory();this.refreshNotesCodePresentation();restore(mark);this.rememberNotesSelection();return;
            }
            const id=NotesDocument.id(),all=lines(),whole=getSelection().isCollapsed;
            chosen.forEach(row=>{
                const index=all.indexOf(row),text=body(row),start=whole?0:index===mark.start[0]?mark.start[1]:0,end=whole?text.textContent.length:index===mark.end[0]?mark.end[1]:text.textContent.length;
                if(end<=start&&!whole)return;
                const range=caret(row,start,document.createRange());caret(row,end,range,true);
                const before=document.createRange();before.selectNodeContents(text);before.setEnd(range.startContainer,range.startOffset);
                const after=document.createRange();after.selectNodeContents(text);after.setStart(range.endContainer,range.endOffset);
                const prefix=before.cloneContents(),content=range.cloneContents(),suffix=after.cloneContents();
                for(const [fragment,position]of [[prefix,'before'],[suffix,'after']])if(fragment.textContent){const extra=newLine('',{...row.dataset});delete extra.dataset.noteId;body(extra).replaceChildren(fragment);row[position](extra);}
                text.replaceChildren(content);delete row.dataset.codeDisabled;row.dataset.codeBlock=id;row.dataset.heading='';row.dataset.collapsed='false';
            });
            this.recordNotesHistory();caret(chosen.at(-1),body(chosen.at(-1)).textContent.length);this.rememberNotesSelection();return;
        }
        else if(command==='checklist'){const remove=chosen.every(l=>l.dataset.check==='true');chosen.forEach(l=>{l.dataset.check=String(!remove);l.dataset.checked='false';});}
        else if(['insertOrderedList','insertUnorderedList'].includes(command)){const value=command==='insertOrderedList'?'ol':'ul',remove=chosen.every(l=>l.dataset.list===value);chosen.forEach(l=>l.dataset.list=remove?'':value);const model=this.syncNotesDocument();model.renumber(new Set(chosen.map(row=>model.byId.get(row.dataset.noteId)?.parentId)));this.renderNotesDocument();}
        else if(command==='indent'||command==='outdent'){
            const delta=command==='indent'?1:-1,first=chosen[0],oldDepth=level(first),model=this.syncNotesDocument();
            model.indent(chosen.map(row=>row.dataset.noteId),delta);this.renderNotesDocument();
            if(delta>0&&first&&level(first)>oldDepth)chosen.forEach(row=>{if(!body(row).textContent.trim()){row.dataset.heading='';body(row).querySelectorAll('[data-inline-heading]').forEach(span=>span.replaceWith(...span.childNodes));}});
        } else if(command==='moveUp'||command==='moveDown') {
            const positions=new Map(lines().filter(row=>!row.hidden).map(row=>[row,row.getBoundingClientRect()]));
            lines().forEach(row=>{row._checkMoveAnimation?.cancel();row._checkMoveAnimation=null;});
            const model=this.syncNotesDocument();model.move(chosen.map(row=>row.dataset.noteId),command==='moveUp'?-1:1);this.renderNotesDocument();
            this.refreshNotesCollapseControls();if(chosen[0])caret(chosen[0],mark?.start?.[1]||0);this.recordNotesHistory();this.animateNotesMovement(positions);return;
        } else document.execCommand(command,false,null);
        if(command.startsWith('heading')){const all=lines();all.forEach((row,index)=>{if(targets(row,all,index).some(child=>chosen.includes(child)))row.dataset.collapsed='false';});}
        this.refreshNotesCollapseControls();restore(mark);this.rememberNotesSelection();this.recordNotesHistory();this.updateNotesToolbarState();
    };
    p.handleNotesEditorShortcut=function(event){
        if(event.ctrlKey||event.metaKey||event.altKey||['Enter','Tab','ArrowUp','ArrowDown'].includes(event.key))this.flushNotesTyping();
        if(event.isComposing)return;
        const modifier=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
        // Ctrl/Cmd+A: seleciona TODO o editor — inclusive as linhas escondidas por um
        // colapso (a seleção nativa do navegador não alcança `hidden`, então apagar
        // "tudo" deixava conteúdo oculto e o botão de colapso preso na primeira linha).
        if(modifier&&key==='a'&&!event.altKey){
            event.preventDefault();this.flushNotesTyping();
            const tudo=document.createRange();tudo.selectNodeContents(editor());
            const selTodo=getSelection();selTodo.removeAllRanges();selTodo.addRange(tudo);
            this.rememberNotesSelection();
            return;
        }
        if(event.target?.matches('.notes-line-check')){
            if(modifier&&!event.altKey&&['z','y','s'].includes(key)){
                event.preventDefault();event.stopPropagation();
                if(key==='s')this.saveNotes();else if(key==='y'||key==='z'&&event.shiftKey)this.redoNotes();else this.undoNotes();
            }
            return;
        }
        if(event.getModifierState?.('AltGraph'))return;
        if(event.altKey&&!modifier&&['ArrowUp','ArrowDown'].includes(event.key)){
            event.preventDefault();this.rememberNotesSelection();this.executeNotesCommand(event.key==='ArrowUp'?'moveUp':'moveDown');return;
        }
        if(modifier&&event.altKey){
            const commands={'1':'heading1','2':'heading2','3':'heading3','4':'checklist','5':'insertOrderedList','6':'insertUnorderedList','7':'strikeThrough'};
            const digit=event.code?.startsWith('Digit')?event.code.slice(5):key;
            if(commands[digit]){event.preventDefault();this.rememberNotesSelection();this.executeNotesCommand(commands[digit]);return;}
            if(['8','9','0'].includes(digit)||['t','l'].includes(key)){
                event.preventDefault();this.rememberNotesSelection();
                if(digit==='8'||digit==='9')document.querySelector(`[data-notes-color="${digit==='8'?'color':'backgroundColor'}"]`)?.click();
                else if(digit==='0'){this.toggleNotesFullscreen();}
                else if(key==='t')this.toggleNotesHeaderCollapse();
                else{const row=lineAt(getSelection().anchorNode);if(row?.querySelector('.notes-line-collapse'))this.animateNotesLineCollapse(row);}
                return;
            }
        }

        if(modifier&&['z','y','s','b','i','u'].includes(key)){event.preventDefault();if(key==='s')this.saveNotes();else if(key==='z')event.shiftKey?this.redoNotes():this.undoNotes();else if(key==='y')this.redoNotes();else{this.rememberNotesSelection();this.executeNotesCommand(key==='b'?'bold':key==='u'?'underline':'italic');}return;}
        if(event.key==='Tab'){event.preventDefault();this.rememberNotesSelection();this.executeNotesCommand(event.shiftKey?'outdent':'indent');return;}
        const selection=getSelection();if(!selection.rangeCount)return;const range=selection.getRangeAt(0);let line=lineAt(range.startContainer);
        // O cursor pode ficar FORA de uma linha: clique depois do ultimo bloco,
        // foco dado por `editor.focus()` sem range, no solto ou editor vazio. Nesses
        // casos o Enter NAO fazia nada — o keydown saia antes do preventDefault e o
        // `beforeinput` (insertParagraph) cancelava a insercao. Aqui o cursor e
        // levado para a linha certa para a quebra sempre acontecer.
        if(!line&&event.key==='Enter'&&selection.isCollapsed){
            const visiveis=lines().filter(row=>!row.hidden);
            let target=null,noInicio=false;
            if(range.startContainer===editor()){
                noInicio=range.startOffset===0;
                target=noInicio?visiveis[0]:([...editor().children].slice(0,range.startOffset).reverse().find(row=>row.classList.contains('notes-line')&&!row.hidden)||visiveis.at(-1));
            }else{
                const rect=range.getClientRects?.()[0];
                target=rect&&visiveis.length?visiveis.reduce((melhor,row)=>{const r=row.getBoundingClientRect(),d=Math.min(Math.abs(r.top-rect.top),Math.abs(r.bottom-rect.bottom));return d<melhor.d?{row,d}:melhor;},{row:visiveis.at(-1),d:Infinity}).row:visiveis.at(-1);
            }
            if(!target){target=newLine('<br>',{level:'0'});editor().append(target);}
            line=target;range.selectNodeContents(body(line));range.collapse(noInicio);selection.removeAllRanges();selection.addRange(range);
        }
        if(!line)return;
        const mark=bookmark()||{start:[lines().indexOf(line),body(line).textContent.length],end:null};
        if(!mark.start)mark.start=[lines().indexOf(line),body(line).textContent.length];
        if(this.notesHistoryMarks)this.notesHistoryMarks[this.notesHistoryIndex]=mark;
        if(selection.isCollapsed&&!modifier&&!event.altKey&&['ArrowUp','ArrowDown'].includes(event.key)){
            const visible=lines().filter(row=>!row.hidden),index=visible.indexOf(line),next=visible[index+(event.key==='ArrowUp'?-1:1)];
            if(next){const empty=!body(next).textContent.trim(),currentEmpty=!body(line).textContent.trim();
                const rect=range.getClientRects()[0],textRect=body(line).getBoundingClientRect(),height=parseFloat(getComputedStyle(body(line)).lineHeight)||22;
                const firstVisualLine=!rect||rect.top<textRect.top+height;
                if((event.key==='ArrowUp'&&empty&&firstVisualLine)||(event.key==='ArrowDown'&&currentEmpty)){
                    event.preventDefault();caret(next);this.rememberNotesSelection();this.updateNotesToolbarState();return;
                }
            }
        }

        if(event.key===' '&&selection.isCollapsed&&!line.dataset.list){
            const prefix=body(line).textContent.slice(0,mark.start[1]);
            if(/^(\d+[.)]|[-*])$/.test(prefix)){
                event.preventDefault();const shortcut=document.createRange();shortcut.selectNodeContents(body(line));shortcut.setEnd(range.startContainer,range.startOffset);shortcut.deleteContents();
                line.dataset.list=/^\d/.test(prefix)?'ol':'ul';if(!body(line).textContent&&!body(line).querySelector('br'))body(line).append(document.createElement('br'));caret(line);this.recordNotesHistory();return;
            }
        }
        if(event.key==='Backspace'&&selection.isCollapsed&&mark.start[1]===0){
            event.preventDefault();if(level(line)>0)line.dataset.level=String(level(line)-1);
            else if(line.dataset.list)line.dataset.list='';else if(line.dataset.check==='true')line.dataset.check='false';
            else if(line.previousElementSibling){const previous=line.previousElementSibling,offset=body(previous).textContent.length;if(!offset)body(previous).replaceChildren();previous.dataset.collapsed='false';body(previous).append(...body(line).childNodes);line.remove();caret(previous,offset);}
            this.recordNotesHistory();return;
        }
        if(event.key!=='Enter')return;event.preventDefault();
        if(!selection.isCollapsed){deleteSelection();range.setStart(getSelection().getRangeAt(0).startContainer,getSelection().getRangeAt(0).startOffset);range.collapse(true);}
        if(line.dataset.codeBlock){const node=document.createTextNode('\n');range.insertNode(node);if(!node.nextSibling)node.after(document.createElement('br'));range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);this.recordNotesHistory();this.rememberNotesSelection();return;}
        if(event.shiftKey){const br=document.createElement('br');range.insertNode(br);range.setStartAfter(br);range.collapse(true);selection.removeAllRanges();selection.addRange(range);this.recordNotesHistory();return;}
        if(!body(line).textContent.trim()){
            if(!line.dataset.list&&line.dataset.check!=='true'){const next=newLine('<br>',{level:String(level(line))});line.dataset.collapsed='false';line.after(next);this.recordNotesHistory();caret(next);this.rememberNotesSelection();return;}
            if(level(line)>0)line.dataset.level=String(level(line)-1);else {line.dataset.list='';line.dataset.check='false';line.dataset.heading='';}
            caret(line);this.recordNotesHistory();return;
        }
        const tail=document.createRange();tail.selectNodeContents(body(line));tail.setStart(range.startContainer,range.startOffset);
        const atEnd=tail.toString().length===0,child=atEnd&&targets(line).length>0;
        const existingChild=line.nextElementSibling;
        // Pai de lista/checklist recolhido com o cursor no fim: digita no filho vazio
        // já existente em vez de criar um irmão novo (mantém a hierarquia).
        if(!line.dataset.heading&&child&&line.dataset.collapsed==='true'&&existingChild&&level(existingChild)===level(line)+1
            &&existingChild.dataset.check===line.dataset.check&&existingChild.dataset.checked!=='true'
            &&(existingChild.dataset.list||'')===(line.dataset.list||'')
            &&!body(existingChild).textContent.trim()&&!body(existingChild).querySelector('img,table,video,audio')
            &&targets(existingChild,lines(),lines().indexOf(existingChild),true).length===0){
            line.dataset.collapsed='false';this.refreshNotesCollapseControls();caret(existingChild);this.recordNotesHistory();return;
        }
        // Título/pai recolhido com o cursor no fim: a linha criada abaixo herda a
        // formatação do item (título, lista e/ou check) e, em listas numeradas,
        // segue o fluxo de numeração abaixo. Em lista/checklist com filhos, a nova
        // linha entra como PRIMEIRO FILHO (o pai é expandido) para seguir o fluxo.
        // `mark` pode vir nulo (seleção ancorada fora de uma linha); sem esta guarda o
        // acesso a `mark.start[1]` lançava exceção e o Enter não fazia nada.
        const noFim=!mark?.start||mark.start[1]>=body(line).textContent.length;
        if(line.dataset.collapsed==='true'&&noFim){
            const group=targets(line);
            // O título pode ser de LINHA (`data-heading`) ou INLINE (um `span
            // [data-inline-heading]` cobrindo o texto, quando o H1..H3 é aplicado a
            // uma seleção). Nos dois casos a linha criada abaixo deve herdar a
            // formatação — senão a linha nova nasce "sem título".
            const inline=body(line).querySelector('[data-inline-heading]:not([data-inline-heading="0"])');
            const tituloInline=inline&&!body(line).textContent.replace(inline.textContent,'').trim()?inline.dataset.inlineHeading:'';
            const titulo=line.dataset.heading||tituloInline;
            if(group.length||titulo||line.dataset.list||line.dataset.check==='true'){
                const lista=line.dataset.list||'',check=line.dataset.check||'false';
                // RECOLHIDO + cursor no fim: a linha criada é um IRMÃO (mesmo nível, NÃO
                // é filho) e HERDA a formatação da linha de cima (título/lista/check) +
                // a numeração. O item aparece logo abaixo do grupo recolhido.
                const next=newLine('<br>',{level:String(level(line)),list:lista,check,checked:'false'});
                for(const field of ['bold','italic'])if(line.dataset[field])next.dataset[field]=line.dataset[field];
                if(titulo){next.dataset.heading=titulo;next.dataset.outlineBreak=titulo;}
                if(lista==='ol'&&line.dataset.checkNumber)next.dataset.checkNumber=String(Number(line.dataset.checkNumber)+1);
                (group.at(-1)||line).after(next);
                caret(next);this.recordNotesHistory();this.rememberNotesSelection();return;
            }
        }
        const next=newLine('<br>',{level:String(level(line)+(child?1:0)),list:line.dataset.list||'',check:line.dataset.check||'false',checked:'false'});
        if(line.dataset.list==='ol'&&line.dataset.checkNumber){
            const number=Number(line.dataset.checkNumber)+1;
            let start=line;while(start.previousElementSibling&&level(start.previousElementSibling)>=level(line))start=start.previousElementSibling;
            for(let row=start;row;row=row.nextElementSibling){if(row!==start&&level(row)<level(line))break;if(level(row)===level(line)&&row.dataset.checkNumber&&Number(row.dataset.checkNumber)>=number)row.dataset.checkNumber=String(Number(row.dataset.checkNumber)+1);}
            next.dataset.checkNumber=String(number);
        }
        if(mark.start[1]===0){for(const field of ['heading','bold','italic'])if(line.dataset[field])next.dataset[field]=line.dataset[field];}
        const fragment=tail.extractContents();if(fragment.childNodes.length)body(next).replaceChildren(fragment);
        if(!body(next).textContent && !body(next).querySelector('img,br'))body(next).append(document.createElement('br'));
        if(!body(line).childNodes.length)body(line).append(document.createElement('br'));
        if(child||line.dataset.heading)line.dataset.collapsed='false';line.after(next);this.refreshNotesCollapseControls();caret(next);this.recordNotesHistory();
    };
    p.updateNotesToolbarState=function(){const chosen=selected().filter(Boolean);document.querySelectorAll('#notesToolbar [data-command]').forEach(button=>{const command=button.dataset.command;let active=false;if(command.startsWith('heading'))active=getSelection().isCollapsed?chosen.length&&chosen.every(l=>l.dataset.heading===command.slice(-1)):selectedHeading()===command.slice(-1);else if(command==='checklist')active=chosen.length&&chosen.every(l=>l.dataset.check==='true');else if(command.includes('List'))active=chosen.length&&chosen.every(l=>l.dataset.list===(command==='insertOrderedList'?'ol':'ul'));else if(command==='bold'||command==='italic'||command==='underline')active=document.queryCommandState(command);button.classList.toggle('is-active',Boolean(active));button.setAttribute('aria-pressed',String(Boolean(active)));});};
    p.updateNotesChecklistOrder=function(check){
        this.flushNotesTyping();
        const line=lineAt(check),value=String(check.checked),keepCheckboxFocus=document.activeElement===check;
        if(!line||line.dataset.checked===value)return;
        const all=lines(),index=all.indexOf(line),depth=level(line),mark=bookmark();
        const anchor=all[mark?.start?.[0]],focus=all[mark?.end?.[0]];
        const animate=!matchMedia('(prefers-reduced-motion: reduce)').matches;
        const positions=new Map(all.filter(row=>!row.hidden).map(row=>[row,row.getBoundingClientRect()]));
        all.forEach(row=>{row._checkMoveAnimation?.cancel();row._checkMoveAnimation=null;});
        // Capture displayed numbers before changing completion order.
        all.forEach(row=>{if(row.dataset.check==='true'&&row.dataset.list==='ol'&&!row.dataset.checkNumber){const number=parseInt(row.querySelector('.notes-line-marker')?.textContent,10);if(Number.isFinite(number))row.dataset.checkNumber=String(number);}});
        const model=this.syncNotesDocument();model.setCompletion(line.dataset.noteId,value==='true');this.renderNotesDocument();
        if(mark?.start&&anchor)mark.start[0]=lines().indexOf(anchor);
        if(mark?.end&&focus)mark.end[0]=lines().indexOf(focus);
        this.refreshNotesCollapseControls();if(mark?.start&&mark?.end)restore(mark);if(keepCheckboxFocus)check.focus({preventScroll:true});
        this.recordNotesHistory();this.rememberNotesSelection();
        const controls=line.querySelector('.notes-line-controls');
        if(controls){
            clearTimeout(controls._completionNoticeTimer);
            controls.classList.toggle('notes-completion-notice',value==='true');
            if(value==='true')controls._completionNoticeTimer=setTimeout(()=>controls.classList.remove('notes-completion-notice'),3000);
        }
        if(animate)this.animateNotesMovement(positions);
    };
    p.animateNotesMovement=function(positions){
        if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;
        positions.forEach((before,row)=>{
            if(!row.isConnected||row.hidden)return;
            const after=row.getBoundingClientRect(),x=before.left-after.left,y=before.top-after.top;
            if(Math.abs(x)<.5&&Math.abs(y)<.5)return;
            const motion=row.animate([{transform:`translate(${x}px, ${y}px)`},{transform:'translate(0, 0)'}],{duration:280,easing:'cubic-bezier(.22, 1, .36, 1)'});
            row._checkMoveAnimation=motion;motion.onfinish=()=>{if(row._checkMoveAnimation===motion)row._checkMoveAnimation=null;};
        });
    };
    p.setupNotesEditing=function(){
        if(this.notesEditingReady)return;this.notesEditingReady=true;this.setupNotesColors();
        for(const [command,label,glyph]of [['codeBlock','Adicionar bloco de código','</>'],['collapseAll','Expandir/recolher todos','↕']]){
            const button=document.createElement('button');button.type='button';button.className='toolbar-btn';button.dataset.command=command;button.title=label;button.setAttribute('aria-label',label);button.innerHTML=command==='codeBlock'?'<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 6-4 4 4 4m8-8 4 4-4 4m-3-10-2 12"/></svg>':glyph;button.onmousedown=event=>event.preventDefault();button.onclick=()=>command==='collapseAll'?this.toggleAllNotesCollapse():this.executeNotesCommand(command);document.getElementById('notesToolbar').append(button);
        }
        const shortcutLabels={heading1:'Ctrl+Alt+1',heading2:'Ctrl+Alt+2',heading3:'Ctrl+Alt+3',checklist:'Ctrl+Alt+4',insertOrderedList:'Ctrl+Alt+5',insertUnorderedList:'Ctrl+Alt+6',strikeThrough:'Ctrl+Alt+7',underline:'Ctrl+U',bold:'Ctrl+B',italic:'Ctrl+I',undo:'Ctrl+Z',redo:'Ctrl+Shift+Z',indent:'Tab',outdent:'Shift+Tab',moveUp:'Alt+ArrowUp',moveDown:'Alt+ArrowDown'};
        const labelShortcut=(button,shortcut)=>{if(!button)return;button.title=(button.title||button.getAttribute('aria-label')||button.textContent.trim())+' ('+shortcut.replace('ArrowUp','↑').replace('ArrowDown','↓')+')';button.setAttribute('aria-keyshortcuts',shortcut.replace('Ctrl','Control'));};
        document.querySelectorAll('#notesToolbar [data-command]').forEach(button=>{const shortcut=shortcutLabels[button.dataset.command];if(shortcut)labelShortcut(button,shortcut);});
        labelShortcut(document.querySelector('[data-notes-color="color"]'),'Ctrl+Alt+8');labelShortcut(document.querySelector('[data-notes-color="backgroundColor"]'),'Ctrl+Alt+9');labelShortcut(document.getElementById('notesFullscreenBtn'),'Ctrl+Alt+0');labelShortcut(document.getElementById('notesHeaderCollapseBtn'),'Ctrl+Alt+T');
        editor().spellcheck=true;editor().lang='pt-BR';
        document.getElementById('notesModal').addEventListener('scroll',()=>{clearTimeout(this.notesSyntaxScrollTimer);this.notesSyntaxScrollTimer=setTimeout(()=>this.refreshNotesSyntaxHighlight(),120);},{capture:true,passive:true});
        editor().addEventListener('beforeinput',event=>{
            if(event.target.matches('.notes-line-check'))return;
            event.stopImmediatePropagation();
            const mark=bookmark();
            // Seleção cobrindo TODAS as linhas (Ctrl+A inclui as escondidas por colapso):
            // o navegador ignora as linhas ocultas ao apagar, então "apagar tudo" deixava
            // conteúdo e o botão de colapso preso. Aqui a nota é zerada de fato.
            {
                const selection=getSelection(),rangeSel=selection.rangeCount?selection.getRangeAt(0):null;
                if(rangeSel&&!selection.isCollapsed&&/^delete/.test(event.inputType)){
                    const todas=[...editor().querySelectorAll('.notes-line')];
                    const marcadas=todas.filter(linha=>rangeSel.intersectsNode(linha));
                    if(todas.length>1&&marcadas.length===todas.length){
                        event.preventDefault();
                        todas.slice(1).forEach(linha=>linha.remove());
                        const manter=todas[0];body(manter).replaceChildren(document.createElement('br'));delete manter.dataset.collapsed;
                        this.refreshNotesCollapseControls();this.recordNotesHistory();
                        caret(manter,0);this.rememberNotesSelection();
                        return;
                    }
                }
            }
            if(!getSelection().isCollapsed&&mark?.start&&mark.end&&mark.start[0]!==mark.end[0]&&(/^(delete|insertText)/.test(event.inputType))){
                event.preventDefault();deleteSelection();
                if(event.inputType==='insertText'&&event.data){const r=getSelection().getRangeAt(0),node=document.createTextNode(event.data);r.insertNode(node);r.setStartAfter(node);r.collapse(true);getSelection().removeAllRanges();getSelection().addRange(r);}
                this.recordNotesHistory();return;
            }
            if(event.inputType==='insertParagraph'||event.inputType==='insertLineBreak'){event.preventDefault();this.handleNotesEditorShortcut({key:'Enter',shiftKey:event.inputType==='insertLineBreak',preventDefault(){}});}
        },true);
        editor().addEventListener('input',event=>{event.stopImmediatePropagation();if(event.target.matches('.notes-line-check')){this.updateNotesChecklistOrder(event.target);return;}this.notesTypingPending=true;clearTimeout(this.notesTypingTimer);clearTimeout(this.notesCodeTimer);this.notesStatus('Alterações pendentes');this.notesTypingTimer=setTimeout(()=>this.flushNotesTyping(),350);this.rememberNotesSelection();},true);
        editor().addEventListener('mousedown',event=>{if(event.button===0&&event.target.closest('.notes-line-collapse'))event.preventDefault();},true);
        editor().addEventListener('click',event=>{
            const line=lineAt(event.target);if(!line)return;
            if(event.target.closest('.notes-line-collapse')){event.preventDefault();event.stopImmediatePropagation();this.animateNotesLineCollapse(line);}
        },true);
        editor().addEventListener('change',event=>{if(event.target.matches('.notes-line-check'))this.updateNotesChecklistOrder(event.target);});
        const exportClipboard=event=>{
            this.flushNotesTyping();
            const chosen=selected(),mark=bookmark();if(!mark?.start||getSelection().isCollapsed)return;
            const exported=document.createElement('div');exported.append(getSelection().getRangeAt(0).cloneContents());
            if(mark.start[0]===mark.end?.[0]){
                const range=getSelection().getRangeAt(0);let ancestor=range.commonAncestorContainer.nodeType===3?range.commonAncestorContainer.parentElement:range.commonAncestorContainer;
                const text=body(chosen[0]);while(ancestor&&ancestor!==text&&text.contains(ancestor)){const wrapper=ancestor.cloneNode(false);wrapper.removeAttribute('id');wrapper.append(...exported.childNodes);exported.append(wrapper);ancestor=ancestor.parentElement;}
            }
            exported.querySelectorAll('.notes-line-controls,.notes-code-header').forEach(e=>e.remove());
            event.clipboardData.setData('application/x-productivity-notes-inline',exported.innerHTML);
            exported.querySelectorAll('*').forEach(e=>{e.removeAttribute('bgcolor');e.style.removeProperty('background');e.style.removeProperty('background-color');e.style.removeProperty('background-image');});
            event.clipboardData.setData('text/html',exported.innerHTML);event.clipboardData.setData('text/plain',getSelection().toString());event.preventDefault();
            if(mark.start[1]===0&&mark.end?.[1]===body(chosen.at(-1))?.textContent.length){
                const root=document.createElement('div');chosen.forEach(l=>root.append(l.cloneNode(true)));root.querySelectorAll('.notes-line-controls,.notes-code-header').forEach(e=>e.remove());
                event.clipboardData.setData('application/x-productivity-notes',root.innerHTML);event.clipboardData.setData('text/plain',chosen.map(l=>body(l).innerText).join('\n'));
            }
            if(event.type==='cut'){deleteSelection();this.recordNotesHistory();this.rememberNotesSelection();}
        };
        editor().addEventListener('copy',exportClipboard);
        editor().addEventListener('cut',exportClipboard);
        editor().addEventListener('paste',event=>{
            this.flushNotesTyping();
            if(!event.clipboardData)return;
            const selection=getSelection();
            if(!selection.rangeCount||!editor().contains(selection.getRangeAt(0).commonAncestorContainer))this.restoreNotesSelection();
            if(!lines().length)editor().append(newLine());
            if(!selection.rangeCount||!editor().contains(selection.getRangeAt(0).commonAncestorContainer))caret(lines().filter(row=>!row.hidden).at(-1)||lines().at(-1));
            let range=selection.getRangeAt(0);
            // Root endpoints occur with Select All and clicks on empty editor space.
            const collapsed=range.collapsed,startAtRoot=range.startContainer===editor(),endAtRoot=range.endContainer===editor(),startOffset=range.startOffset,endOffset=range.endOffset;
            const rootPoint=(offset,end)=>{
                const children=[...editor().childNodes];
                const node=children[end?Math.max(0,offset-1):offset],row=lineAt(node)||lines().at(-1);
                return [body(row),end&&offset>0||!node?body(row).childNodes.length:0];
            };
            if(endAtRoot)range.setEnd(...rootPoint(endOffset,true));
            if(startAtRoot)range.setStart(...rootPoint(startOffset,false));
            if(collapsed)range.collapse(true);
            let line=lineAt(range.startContainer);
            if(!line){caret(lines().filter(row=>!row.hidden).at(-1)||lines().at(-1));range=selection.getRangeAt(0);line=lineAt(range.startContainer);}
            if(!event.clipboardData.getData('text/plain')&&!event.clipboardData.getData('text/html')&&!event.clipboardData.getData('application/x-productivity-notes')&&!event.clipboardData.getData('application/x-productivity-notes-inline'))return;
            event.preventDefault();
            const own=event.clipboardData.getData('application/x-productivity-notes');
            deleteSelection();const current=getSelection().getRangeAt(0);range.setStart(current.startContainer,current.startOffset);range.collapse(true);
            if(own){const root=document.createElement('div');root.innerHTML=own;sanitize(root);normalize(root);const items=[...root.children],base=level(items[0]),batches=new Map();
                items.forEach(l=>{if(l.dataset.completionBatch)batches.set(l.dataset.completionBatch,NotesDocument.id());});
                items.forEach(l=>{l.dataset.noteId=NotesDocument.id();delete l.dataset.completionPosition;settingKeys.forEach(key=>{delete l.dataset[key];const value=this.notesDocument?.settings[key];if(value)l.dataset[key]=value;});if(l.dataset.completionBatch)l.dataset.completionBatch=batches.get(l.dataset.completionBatch);if(l.dataset.completedBy){if(batches.has(l.dataset.completedBy))l.dataset.completedBy=batches.get(l.dataset.completedBy);else delete l.dataset.completedBy;}l.dataset.level=String(Math.max(0,level(l)-base+level(line)));});
                range.deleteContents();if(!body(line).textContent.trim()){line.replaceWith(...items);}else line.after(...items);this.refreshNotesCollapseControls();caret(items.at(-1),body(items.at(-1)).textContent.length);
            }else{
                const text=event.clipboardData.getData('text/plain'),html=event.clipboardData.getData('application/x-productivity-notes-inline')||event.clipboardData.getData('text/html');
                const markdown=!html&&/^(?:#{1,6} |```|~~~|\|.*\|)/m.test(text);
                if(line.dataset.codeBlock){const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);selection.removeAllRanges();selection.addRange(range);this.recordNotesHistory();this.rememberNotesSelection();return;}
                const root=markdown?markdownRows(text):document.createElement('div');
                if(markdown){}
                else if(html){root.innerHTML=html;sanitize(root);root.querySelectorAll('.notes-line-controls,.notes-collapse-btn,input').forEach(e=>e.remove());
                    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);while(walker.nextNode()){const node=walker.currentNode;if(!node.parentElement.closest('pre,code'))node.data=node.data.replace(/[\r\n]+[\t ]*/g,' ');}
                    normalize(root);}
                else text.replace(/\r\n?/g,'\n').split('\n').forEach(part=>{const row=newLine();body(row).textContent=part;root.append(row);});
                if(markdown||(html&&!event.clipboardData.getData('application/x-productivity-notes-inline')))indentImportedSections(root);
                // Preserve inline styles, but turn explicit breaks into independent editable rows.
                const items=[];
                for(const row of [...root.children]){
                    if(markdown||row.dataset.codeBlock||body(row).querySelector('table')){items.push(row);continue;}
                    const content=body(row),walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT|NodeFilter.SHOW_ELEMENT),breaks=[];
                    while(walker.nextNode()){const n=walker.currentNode;if(n.nodeType===1&&n.tagName==='BR')breaks.push([n,0,true]);else if(n.nodeType===3){for(let i=0;i<n.length;i++)if(n.data[i]==='\n')breaks.push([n,i,false]);}}
                    let startNode=content,startOffset=0;
                    for(const [node,offset,br] of breaks){const r=document.createRange();r.setStart(startNode,startOffset);if(br)r.setEndBefore(node);else r.setEnd(node,offset);const next=newLine('',{...row.dataset});body(next).replaceChildren(r.cloneContents());items.push(next);if(br){startNode=node.parentNode;startOffset=[...startNode.childNodes].indexOf(node)+1;}else{startNode=node;startOffset=offset+1;}}
                    const r=document.createRange();r.setStart(startNode,startOffset);r.setEnd(content,content.childNodes.length);const next=newLine('',{...row.dataset});body(next).replaceChildren(r.cloneContents());if(!breaks.length||body(next).textContent.trim()||body(next).querySelector('img,hr,table,br'))items.push(next);
                }
                if(!items.length)return;
                const suffix=document.createRange();suffix.selectNodeContents(body(line));suffix.setStart(range.startContainer,range.startOffset);const tail=suffix.extractContents();
                if(!body(line).textContent&&!body(line).querySelector('img'))body(line).replaceChildren();
                const first=items.shift();if(!body(line).textContent){if(first.dataset.codeBlock){line.dataset.codeBlock=first.dataset.codeBlock;line.dataset.codeLanguage=first.dataset.codeLanguage||'';}if(first.dataset.collapsed)line.dataset.collapsed=first.dataset.collapsed;if(first.dataset.heading)line.dataset.heading=first.dataset.heading;if(first.dataset.list)line.dataset.list=first.dataset.list;}
                while(body(first).firstChild)body(line).append(body(first).firstChild);
                let last=line;for(const item of items){item.dataset.level=String(level(line)+level(item));last.after(item);last=item;}
                const offset=body(last).textContent.length;body(last).append(tail);
                this.applyNotesOutlineDefaults([line,...items]);
                this.refreshNotesCollapseControls();caret(last,offset);

            }this.recordNotesHistory();this.rememberNotesSelection();
        });
        window.addEventListener('beforeunload',event=>{if(this.notesSession&&this.getCleanNotesHtml()!==this.notesSession.saved){this.storeNotesDraft();event.preventDefault();event.returnValue='';}});
    };
    p.setupModalListeners=function(){original.setupModalListeners.call(this);this.setupNotesEditing();};
    p.notesStatus=function(text,error=false){const status=document.getElementById('notesSaveStatus');if(status){status.textContent=text;status.disabled=!error;status.onclick=error?()=>this.saveNotes():null;}};
    p.storeNotesDraft=function(){const session=this.notesSession;if(!session)return;try{localStorage.setItem(session.key,JSON.stringify({html:this.getCleanNotesHtml(),base:session.saved}));}catch{this.notesStatus('Rascunho local indisponível');}};
    p.queueNotesSave=function(){if(!this.notesSession||this.notesRecovering)return;clearTimeout(this.notesDraftTimer);this.notesDraftTimer=setTimeout(()=>this.storeNotesDraft(),450);clearTimeout(this.notesSaveTimer);this.notesStatus('Alterações pendentes');this.notesSaveTimer=setTimeout(()=>this.saveNotes(),1000);};
    p.saveNotes=async function(){
        this.flushNotesTyping();clearTimeout(this.notesDraftTimer);
        const session=this.notesSession;if(!session)return true;if(this.notesRecovering)return false;clearTimeout(this.notesSaveTimer);
        if(session.pending){const ok=await session.pending;if(!ok)return false;return this.notesSession===session?this.saveNotes():true;}
        const html=this.getCleanNotesHtml();if(html===session.saved&&!session.needsModelMigration){this.notesStatus('Salvo');return true;}
        this.storeNotesDraft();this.notesStatus('Salvando…');
        session.pending=(async()=>{try{
            await this.apiCall(session.url,{method:'PUT',body:JSON.stringify({notas:html})});session.saved=html;session.needsModelMigration=false;
            const item=session.stage?(this.focusStagesData||[]).find(s=>s.id===session.stage):(this.projectsData||[]).find(p=>p.id===session.project);if(item)item.notas=html;
            try{if(this.getCleanNotesHtml()===html)localStorage.removeItem(session.key);}catch{}
            this.notesStatus('Salvo');return true;
        }catch{this.notesStatus('Falha ao salvar — tentar novamente',true);return false;}finally{session.pending=null;}})();
        const ok=await session.pending;if(ok&&this.notesSession===session&&this.getCleanNotesHtml()!==session.saved)return this.saveNotes();return ok;
    };
    p.applyNotesOutlineDefaults=function(affected=lines()){
        const rows=lines(),groups=rows.map((row,index)=>targets(row,rows,index)),parents=new Set(rows.filter((row,index)=>groups[index].length)),chosen=new Set(affected);
        rows.forEach((row,index)=>{if(chosen.has(row)&&groups[index].length)row.dataset.collapsed=String(!groups[index].some(child=>parents.has(child)));});
    };
    p.beginNotesSession=function(){
        this.setupNotesEditing();this.setupNotesResize();this.resetNotesHistory();
        const project=this.currentNotesProjectId,stage=this.currentNotesStageId;
        this.notesSession={project,stage,url:stage?`/focus-stages/${stage}`:`/projects/${project}`,key:`notes-draft:${this.userId||'local'}:${project}:${stage||'focus'}`,saved:this.getCleanNotesHtml()};
        const sourceItem=stage?(this.focusStagesData||[]).find(s=>s.id===stage):(this.projectsData||[]).find(p=>p.id===project);
        this.notesSession.needsModelMigration=!String(sourceItem?.notas||'').includes('data-document-version="1"');
        this.notesStatus('Salvo');document.getElementById('notesRecovery')?.remove();this.notesRecovering=false;
        let draft;try{draft=JSON.parse(localStorage.getItem(this.notesSession.key));}catch{}
        if(draft?.html&&draft.html!==this.notesSession.saved){
            this.notesRecovering=true;const banner=document.createElement('div');banner.id='notesRecovery';banner.setAttribute('role','status');banner.textContent='Há um rascunho local diferente da nota salva. ';
            for(const [text,recover] of [['Recuperar rascunho',true],['Manter nota salva',false]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.onclick=()=>{if(recover){editor().innerHTML=draft.html;sanitize(editor());this.refreshNotesCollapseControls();}this.notesRecovering=false;banner.remove();try{localStorage.removeItem(this.notesSession.key);}catch{}if(recover)this.recordNotesHistory();};banner.append(button);}
            editor().parentElement.before(banner);
        }
    };
    p.openNotesModal=async function(id){if(this.notesSession&&!(await this.closeNotesModal()))return;original.openNotesModal.call(this,id);if(this.currentNotesProjectId)this.beginNotesSession();};
    p.openStageNotesModal=async function(id){if(this.notesSession&&!(await this.closeNotesModal()))return;original.openStageNotesModal.call(this,id);if(this.currentNotesProjectId)this.beginNotesSession();};
    p.closeNotesModal=async function(){if(this.notesSession){if(!(await this.saveNotes()))return false;clearTimeout(this.notesSaveTimer);this.notesSession=null;}clearTimeout(this.notesCodeTimer);clearTimeout(this.notesDraftTimer);this.closeNotesColorPanels();this.notesMotionVersion=(this.notesMotionVersion||0)+1;document.getElementById('notesContextNav').hidden=false;original.closeNotesModal.call(this);return true;};
    p.setNotesHeaderCollapsed=function(collapsed){const toolbar=document.getElementById('notesToolbar'),button=document.getElementById('notesHeaderCollapseBtn');toolbar.hidden=Boolean(collapsed);button.setAttribute('aria-expanded',String(!collapsed));button.title=collapsed?'Mostrar ferramentas':'Ocultar ferramentas';button.setAttribute('aria-label',button.title);};
    p.toggleNotesHeaderCollapse=async function(){
        const toolbar=document.getElementById('notesToolbar'),nav=document.getElementById('notesContextNav');
        const hide=this.notesManualCollapseTarget===undefined?!toolbar.hidden:!this.notesManualCollapseTarget;
        this.notesManualCollapseTarget=hide;const version=this.notesMotionVersion=(this.notesMotionVersion||0)+1;
        [toolbar,nav].forEach(e=>e.getAnimations().forEach(a=>a.cancel()));
        document.getElementById('notesHeaderCollapseBtn').setAttribute('aria-expanded',String(!hide));
        if(hide){await this.notesPanelMotion(toolbar,true,version);await this.notesPanelMotion(nav,true,version);}
        else{await this.notesPanelMotion(nav,false,version);await this.notesPanelMotion(toolbar,false,version);}
        if(version===this.notesMotionVersion){this.setNotesHeaderCollapsed(hide);delete this.notesManualCollapseTarget;}
    };
    p.toggleAllNotesCollapse=function(){
        this.flushNotesTyping();const all=lines(),parents=all.filter((row,index)=>targets(row,all,index).length),expand=parents.some(row=>row.dataset.collapsed==='true');
        const positions=new Map(all.filter(row=>!row.hidden).map(row=>[row,row.getBoundingClientRect()]));
        if(expand)parents.forEach(row=>row.dataset.collapsed='false');else this.applyNotesOutlineDefaults();
        this.recordNotesHistory();this.animateNotesMovement(positions);
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches)all.filter(row=>!row.hidden&&!positions.has(row)).forEach(row=>row.animate([{opacity:0},{opacity:1}],{duration:220,easing:'ease-out'}));
    };
    p.animateNotesLineCollapse=async function(line){
        const hide=line.dataset.collapsed!=='true',children=targets(line),version=(line._collapseVersion||0)+1;line._collapseVersion=version;
        const current=new Map(children.filter(row=>!row.hidden).map(row=>{const style=getComputedStyle(row);return [row,{height:row.getBoundingClientRect().height+'px',marginTop:style.marginTop,marginBottom:style.marginBottom,paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,opacity:style.opacity}];}));
        children.forEach(row=>row.getAnimations().forEach(animation=>animation.cancel()));line.dataset.collapsed=String(hide);
        line.querySelector('.notes-line-collapse')?.setAttribute('aria-expanded',String(!hide));
        const nestedHidden=new Set();children.forEach((row,index)=>{if(row.dataset.collapsed==='true')targets(row,children,index).forEach(child=>nestedHidden.add(child));});
        const visible=children.filter(row=>!nestedHidden.has(row));visible.forEach(row=>row.hidden=false);
        const animations=[];
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches){
            const closed={height:'0px',minHeight:'0px',marginTop:'0px',marginBottom:'0px',paddingTop:'0px',paddingBottom:'0px',opacity:0,overflow:'clip'};
            const frames=visible.map(row=>{const style=getComputedStyle(row);return {row,open:{height:row.getBoundingClientRect().height+'px',minHeight:'0px',marginTop:style.marginTop,marginBottom:style.marginBottom,paddingTop:style.paddingTop,paddingBottom:style.paddingBottom,opacity:1,overflow:'clip'}};});
            frames.forEach(({row,open})=>animations.push(row.animate([{...(current.get(row)||closed),minHeight:'0px',overflow:'clip'},hide?closed:open],{duration:320,easing:'cubic-bezier(.22,1,.36,1)',fill:'both'})));
            await Promise.all(animations.map(animation=>animation.finished.catch(()=>{})));
        }
        if(line._collapseVersion===version)this.recordNotesHistory();
        animations.forEach(animation=>animation.cancel());
    };
    p.notesPanelMotion=async function(element,hide,version){
        if(this.notesMotionVersion!==version)return;
        element.getAnimations().forEach(a=>a.cancel());
        const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
        element.hidden=false;
        if(!reduced){const height=element.getBoundingClientRect().height,style=getComputedStyle(element),open={height:height+'px',opacity:1,paddingTop:style.paddingTop,paddingBottom:style.paddingBottom},closed={height:'0px',opacity:0,paddingTop:'0px',paddingBottom:'0px'};const animation=element.animate(hide?[open,closed]:[closed,open],{duration:220,easing:'ease-in-out'});try{await animation.finished;}catch{} }
        if(this.notesMotionVersion===version)element.hidden=hide;
    };
    p.toggleNotesFullscreen=async function(force){
        const modal=document.getElementById('notesModal'),backdrop=document.getElementById('notesModalBackdrop'),toolbar=document.getElementById('notesToolbar'),nav=document.getElementById('notesContextNav');
        const entering=typeof force==='boolean'?force:!modal.classList.contains('fullscreen');
        const version=this.notesMotionVersion=(this.notesMotionVersion||0)+1;
        [toolbar,nav].forEach(e=>e.getAnimations().forEach(a=>a.cancel()));
        if(entering&&!modal.classList.contains('fullscreen')){this.notesToolbarBeforeFullscreen=toolbar.hidden;this.notesNavBeforeFullscreen=nav.hidden;if(modal.getBoundingClientRect().width<innerWidth-16)this.notesSavedWidth=modal.getBoundingClientRect().width;}
        modal.classList.toggle('fullscreen',entering);backdrop.classList.toggle('notes-fullscreen-active',entering);
        modal.style.setProperty('--notes-width',entering?'100vw':Math.min(innerWidth,this.notesSavedWidth||innerWidth/2)+'px');
        document.getElementById('notesFullscreenBtn').title=entering?'Restaurar tamanho':'Expandir para tela cheia';
        if(!matchMedia('(prefers-reduced-motion: reduce)').matches)await new Promise(r=>setTimeout(r,400));
        if(version!==this.notesMotionVersion)return;
        if(entering){await this.notesPanelMotion(toolbar,true,version);await this.notesPanelMotion(nav,true,version);}
        else{await this.notesPanelMotion(nav,Boolean(this.notesNavBeforeFullscreen),version);await this.notesPanelMotion(toolbar,Boolean(this.notesToolbarBeforeFullscreen),version);}
        if(version===this.notesMotionVersion)this.setNotesHeaderCollapsed(toolbar.hidden);
    };
    p.setupNotesResize=function(){
        const modal=document.getElementById('notesModal');
        modal.style.setProperty('--notes-width',Math.min(innerWidth,this.notesSavedWidth||Math.max(360,innerWidth/2))+'px');
        if(document.getElementById('notesResizeHandle'))return;
        const handle=document.createElement('div');handle.id='notesResizeHandle';handle.tabIndex=0;handle.setAttribute('role','separator');handle.setAttribute('aria-orientation','vertical');handle.setAttribute('aria-label','Ajustar largura da nota');handle.setAttribute('aria-valuemin',Math.min(360,innerWidth));handle.setAttribute('aria-valuemax',innerWidth);handle.setAttribute('aria-valuenow',Math.round(modal.getBoundingClientRect().width));modal.append(handle);
        const setWidth=width=>{const value=Math.max(Math.min(360,innerWidth),Math.min(innerWidth,width));modal.style.setProperty('--notes-width',value+'px');handle.setAttribute('aria-valuenow',Math.round(value));return value;};
        let dragging=false;
        handle.onpointerdown=e=>{if(e.button!==0)return;e.preventDefault();dragging=true;if(!modal.classList.contains('fullscreen'))this.notesSavedWidth=modal.getBoundingClientRect().width;handle.setPointerCapture(e.pointerId);modal.classList.add('notes-resizing');};
        handle.onpointermove=e=>{if(!dragging)return;const width=e.clientX-modal.getBoundingClientRect().left;
            if(modal.classList.contains('fullscreen')&&width<innerWidth-16){this.toggleNotesFullscreen(false);}
            setWidth(width);
        };
        const finish=e=>{if(!dragging)return;dragging=false;modal.classList.remove('notes-resizing');if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);const width=modal.getBoundingClientRect().width;if(width>=innerWidth-16)this.toggleNotesFullscreen(true);else this.notesSavedWidth=width;};
        handle.onpointerup=finish;handle.onpointercancel=finish;
        handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();if(e.key==='End'){this.toggleNotesFullscreen(true);return;}if(modal.classList.contains('fullscreen'))this.toggleNotesFullscreen(false);this.notesSavedWidth=setWidth(e.key==='Home'?360:modal.getBoundingClientRect().width+(e.key==='ArrowLeft'?-24:24));};
    };
}
