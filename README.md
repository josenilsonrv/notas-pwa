# Notas PWA - Editor de Notas Mobile

Editor de notas avançado como Progressive Web App (PWA) para uso em celular, com todas as funcionalidades de formatação, hierarquia e checklist do sistema original.

## 🌟 Funcionalidades

### Editor de Notas Completo
- **Hierarquia**: Sistema de níveis com indentação, limitada a **4 níveis** (0 a 4)
- **Checklist**: Checkbox com completion tracking, timestamps e batch completion; desmarcar devolve o item à posição original
- **Formatação**: Bold, italic, **sublinhado** (Ctrl+U), tachado, headings (H1-H3)
- **Listas**: Lista numerada e com marcadores (o Enter segue o fluxo da lista)
- **Cores**: Paleta de cores personalizadas para texto e destaque (background)
- **Múltiplas notas**: Botão "+" cria notas novas; chips no topo alternam entre elas (duplo clique/toque longo renomeia ou exclui) e cada chip segue a cor padrão da sua nota. A área dos chips **rola na vertical** a partir de ~2 linhas e o botão "+" fica preso no canto inferior direito
- **Navegação**: Setas para mover itens, colapso/expansão de hierarquias
- **Blocos de código**: Bloco de código com realce e linguagem
- **Tabelas**: Tabela estilo planilha com fórmulas (SOMA, MEDIA, POTENCIA, etc.), formatos de número/moeda/porcentagem, cores e redimensionamento; tocar fora da tabela posiciona o cursor logo após ela
- **Inserir**: Imagem, arquivo, tabela, data, vídeo do YouTube (incorporado) e divisor
- **Links**: Inserir/editar links com auto-link do texto digitado
- **Modelos de nota**: Salvar a nota atual como modelo e reaplicá-la
- **Undo/Redo**: Histórico de estados com atalhos
- **Toolbar**: Uma única linha com rolagem horizontal; botão "Editar barra de ferramentas" reordena os botões (ordem guardada no dispositivo); a barra acompanha o teclado, ficando logo acima dele, e o cursor é mantido visível acima dela
- **Modo mobile**: por padrão a toolbar **superior fica escondida** (aparece a barra acoplada ao teclado) e o botão de colapso alterna **apenas os chips** de notas
- **Fullscreen**: Modo tela cheia
- **Temas**: Claro e escuro, com um seletor sutil (sol/lua) no cabeçalho do modal para alternar manualmente
- **Persistência**: Salvo automaticamente no LocalStorage do dispositivo (a camada de notas é preparada para persistência remota/Supabase)

### Áreas do app: Pastas, Notas e Mapa Mental
- **Pastas/workspaces (tela principal)**: é a primeira tela; cada pasta abrange as **Notas e os Mapas** dela. A pasta "Geral" adota o que não tem pasta (a escolha fica em `notas-pwa-pasta-ativa`)
- **Seletor de áreas (dentro da pasta)**: barra flutuante **Notas | Mapa Mental** (a escolha é lembrada em `notas-pwa-area-ativa`), com "‹ Pastas" (volta à tela principal) e "Abrir mapa" (ver o mapa ao lado da nota)
- **Notas**: chips filtrados pela pasta ativa; clique-direito/toque longo no chip abre o menu (Renomear · Duplicar · Mover para pasta · Excluir)
- **Mapa Mental**: área separada do editor, em camadas (pasta `mapa/`), montada só na primeira entrada (lazy) para não pesar o boot
- **Lado a lado (PC)**: botão na topbar mostra a nota e o mapa juntos (o preferência fica em `notas-pwa-split`); **arrastar a barra superior** de um painel para o lado inverso troca os lados, e **arrastar o divisor** entre eles ajusta a largura (um painel acompanha o outro)
- **Vínculo Notas↔Mapa**: um tópico pode apontar para uma nota (atalho 📄 que abre a nota)
- **Gestão de mapas**: criar, abrir, renomear, duplicar e excluir (com confirmação); favoritar (estrela) e arquivar/desarquivar
- **Pastas/workspaces**: criar, renomear, excluir e mover mapas entre pastas
- **Mapa raiz (Home)**: define um mapa como raiz e destaca-o na lista
- **Mapas conectados**: nó-ponte liga um mapa a outro (link bidirecional via backlinks) e avisa quando a referência está quebrada
- **Templates**: templates prontos (Mapa em branco, Simples, Projeto) e “salvar este mapa como template”
- **Recentes e busca**: atalhos para os últimos mapas abertos, busca por nome e ordenação (nome/recente/favorito)
- **Canvas infinito**: mundo expansível com `transform` (translate/scale); zoom por botões, `Ctrl+scroll` e pinça, com limites de 25% a 300%
- **Navegação**: pan por arrastar (Pointer Events, mouse e toque), centralizar, ajustar à tela (fit), ir para a raiz e minimapa clicável
- **Viewport por mapa**: última posição/zoom restaurada ao reabrir o mapa (persistida com debounce)
- **Tópicos (nós)**: criar filho/irmão/independente, editar direto no nó (duplo clique, F2 ou toque longo), excluir, duplicar, copiar/recortar/colar e desfazer
- **Estrutura**: reordenar irmãos (subir/descer), reparenting por menu ou arrastando sobre outro nó (com bloqueio de ciclo) e expandir/recolher ramos (por nó ou tudo)
- **Ramificações visíveis**: cada filho é ligado ao pai por uma curva (SVG) que sai da borda do pai mais próxima do filho — fica claro quem é filho de quem
- **Organização do nó**: bloquear (cadeado) e redimensionar a largura (alça e botões, em múltiplos de 8px)
- **Seleção**: clique, Ctrl/Shift+clique e laço (Shift+arrastar) com barra de ações do nó
- **Conteúdo do nó**: título, descrição, notas, links (com auto-link), imagens/anexos (limite ~1 MB), emoji/ícone, tags, checkbox de tarefa, prioridade, status, datas (início/prazo), responsável, progresso e referências (painel de propriedades)
- **Hierarquia**: níveis ilimitados com identificação visual por profundidade e layout em árvore por raiz (bilateral, esquerda→direita, direita→esquerda, vertical, organograma e livre)
- **Conexões livres**: ligar quaisquer dois nós (independente da hierarquia) por menu, modo “Conectar nós” ou Alt+arrastar; direcionada/simples, com rótulo editável, tipo de linha, espessura, cor e setas, editáveis pelo clique na aresta
- **Drag & drop inteligente**: mover livre (layout manual), soltar no meio = reparent, soltar em cima/baixo = inserir entre irmãos (com linha-guia), ramificação inteira acompanha e ciclo bloqueado
- **Atalhos de teclado**: mapa vazio → `Enter`/`Tab`/`Insert` cria o primeiro tópico; com nó selecionado → `Enter` = irmão, `Tab` = filho, `Ctrl/Cmd+Enter` = filho, `Insert` = filho, `Shift+Insert` = irmão, `Shift+Tab` = subir de nível, `F2` = editar, `Delete` = excluir, `Ctrl+C/X/V` = copiar/recortar/colar, `Ctrl+Z`/`Ctrl+Shift+Z` = desfazer/refazer, `Alt+↑/↓` = reordenar, `Esc` = limpar seleção
- **Isolamento**: a área do mapa não altera o motor de notas (`notes/*`), preservando a paridade estrutural e visual

### Funcionalidades PWA
- **Instalável**: Pode ser instalado como app no celular
- **Offline**: Funciona sem conexão com a internet
- **Mobile-first**: Interface otimizada para celular
- **Service Worker**: Cache de assets para performance
- **GitHub Pages Ready**: Estrutura pronta para deploy estático

## 📱 Como Usar

### Localmente
1. Clone o repositório ou copie a pasta `notas-pwa`
2. Abra o arquivo `index.html` em um navegador
3. Para testar como PWA, use um servidor local:
   ```bash
   # Usando Python
   python -m http.server 8000
   
   # Usando Node.js
   npx serve
   ```
4. Acesse `http://localhost:8000`

### Deploy no GitHub Pages
1. Crie um repositório no GitHub
2. Faça upload da pasta `notas-pwa` para o repositório
3. Ative GitHub Pages:
   - Vá em Settings > Pages
   - Selecione a branch (main/master)
   - Salve
4. A PWA estará disponível em `https://seu-usuario.github.io/seu-repositorio`

### Instalar no Celular
1. Abra a PWA no navegador do celular (Chrome/Safari)
2. No Chrome: Toque no menu (três pontos) > "Instalar app" ou "Adicionar à tela inicial"
3. No Safari: Toque no botão de compartilhar > "Adicionar à tela inicial"
4. A PWA será instalada como um app nativo

## ⌨️ Atalhos de Teclado

- `Ctrl+B`: Negrito
- `Ctrl+I`: Itálico
- `Ctrl+Z`: Desfazer
- `Ctrl+Shift+Z` ou `Ctrl+Y`: Refazer
- `Ctrl+S`: Salvar
- `Tab`: Indentar
- `Shift+Tab`: Desindentar
- `Alt+ArrowUp`: Mover item para cima
- `Alt+ArrowDown`: Mover item para baixo
- `Ctrl+Alt+1`: Heading 1
- `Ctrl+Alt+2`: Heading 2
- `Ctrl+Alt+3`: Heading 3
- `Ctrl+Alt+4`: Checklist
- `Ctrl+Alt+5`: Lista numerada
- `Ctrl+Alt+6`: Lista com marcadores
- `Ctrl+Alt+7`: Tachado
- `Ctrl+Alt+8`: Cor do texto
- `Ctrl+Alt+9`: Destaque de texto
- `Ctrl+Alt+0`: Tela cheia
- `Ctrl+Alt+T`: Recolher cabeçalho
- `Ctrl+Alt+M`: Modelos de nota (salvar/aplicar)

## 🎨 Temas

A PWA suporta temas claro e escuro:
- **Automático**: Detecta a preferência do sistema
- **Manual**: Switch sutil (sol/lua) no cabeçalho do modal de notas
- **Persistente**: A escolha é salva no LocalStorage

## 💾 Persistência

As notas são salvas automaticamente:
- **LocalStorage**: Dados salvos no navegador
- **Auto-save**: Salva a cada 1 segundo após mudanças
- **Draft**: Rascunho local em caso de fechamento não salvo
- **Status**: Indicador de "Salvo" ou "Alterações pendentes"

Chaves usadas no dispositivo:
- `notas-pwa-notes`: lista de todas as notas (`id`, `nome`, `notas` em HTML, datas)
- `notas-pwa-nota-ativa`: id da última nota aberta
- `notas-pwa-content`: espelho da nota ativa (compatibilidade com versões antigas)
- `notas-pwa-templates`: modelos de nota salvos no dispositivo (globais, compartilhados entre as notas)
- `notas-pwa-theme`: tema claro/escuro escolhido
- `notas-pwa-toolbar-order`: ordem personalizada dos botões da barra de ferramentas

> Na primeira execução de uma versão com múltiplas notas, o conteúdo antigo de
> `notas-pwa-content` é migrado automaticamente para a nota `id: 'local'` dentro de
> `notas-pwa-notes` — nada é perdido. Os **modelos** aplicam o texto exatamente como
> foi salvo (substituem toda a nota atual; `Ctrl+Z` desfaz).

## ☁️ Conta opcional (login + sync na nuvem)

O app tem uma **camada opcional** em Python (FastAPI) para quem quiser as notas na conta, em
qualquer aparelho. **Sem login nada muda**: o app continua local-first, offline e sem exigir rede.

- **Botão de conta** no topo (moldura fixa): deslogado = "Entrar"; logado = seu e-mail.
- **Login por e-mail/senha**; a sessão vive num cookie `HttpOnly` (assinado pelo backend) — o token
  do Supabase **nunca** chega ao JavaScript.
- **1º login**: o conteúdo deste aparelho **sobe sozinho** para a conta (sem diálogo e sem duplicar
  nada — os ids são preservados), inclusive os **anexos** que estavam como `data:` na nota.
- **Depois**: sync **bidirecional em tempo real** por WebSocket (`/ws`) — o que você escreve no PC
  aparece no celular **sem recarregar**. Sem rede, a alteração entra numa **fila persistida** e sobe
  quando a conexão volta (o indicador mostra "Offline — N na fila").
- **Anexos na conta** (Supabase Storage): imagem/PDF/documento abre em **qualquer** aparelho, com
  limite de 25 MB por arquivo e cota por conta.
- **Escopo**: pastas, notas, mapas (com o grafo), modelos e **todas** as configurações do app.

Como subir o backend, ligar o Supabase, os contratos HTTP/WS e o diagnóstico de problemas estão em
**`docs/BACKEND-SYNC.md`**. Atalhos:

```powershell
npm run dev:backend        # sobe PWA + API em http://localhost:8000/
npm run verificar:backend  # checa config, estático, schema, dados e login
npm run test:backend       # pytest do backend
```

## 📁 Estrutura de Arquivos

```
notas-pwa/
├── index.html              # Página principal
├── manifest.json           # Config PWA
├── sw.js                   # Service Worker
├── styles.css              # CSS base
├── app.js                  # Lógica da aplicação (camada local, sem backend)
├── notes/
│   ├── editor.js           # Editor completo (mesmo motor do sistema)
│   ├── editor.css          # Estilos do editor
│   ├── extras.js           # Ferramentas: inserir, link, modelos, mídia
│   ├── extras.css          # Estilos das ferramentas extras
│   ├── table-math.js       # Avaliador de fórmulas das tabelas
│   ├── tables.js           # Ferramentas contextuais de tabela
│   └── tables.css          # Estilos das tabelas
├── mapa/
│   ├── mapa.css            # Estilos da área (tokens do tema, claro/escuro)
│   ├── mapa-modelo.js      # Modelo (nós/conexões, IDs monotônicos, migração, duplicação)
│   ├── mapa-store.js       # Persistência local (CRUD de mapas, pastas, recentes, viewport)
│   ├── mapa-layout.js      # Layout em árvore, limites do mundo e geometria do minimapa
│   ├── mapa-render.js      # Shell da área, gestão, canvas infinito, conexões SVG e minimapa
│   ├── mapa-painel.js      # Painel de propriedades do nó (conteúdo, anexos, emoji)
│   ├── mapa-interacao.js   # Seleção, drag&drop (zonas), conexões e atalhos (Pointer Events)
│   └── mapa.js             # installMapaMental + controlador da área (montagem lazy)
├── icon-192.png            # Ícone 192x192 (PNG real, maskable)
├── icon-512.png            # Ícone 512x512 (PNG real, maskable)
├── icon.svg                # Ícone SVG
├── theme-origem.css        # Tema/regras do modal extraídos do CSS compilado do original (gerado)
├── _headers                # Regras de cache/headers para Cloudflare Pages
├── _redirects              # Mantém /sw.js e /manifest.json fora do fallback de SPA
├── tools/
│   ├── gerar-icones.cjs        # Regera os PNGs dos ícones (sem dependências)
│   ├── extrair-tema.cjs        # Extrai o tema do CSS compilado do original
│   ├── portar-testes.cjs       # Porta a suíte de testes do projeto original
│   ├── inventario-regras.cjs   # Inventário de regras do motor de notas
│   └── gerar-rastreabilidade.cjs  # Gera docs/RASTREABILIDADE.md e o inventário
├── tests/
│   ├── run-all.cjs             # Runner da suíte (npm test)
│   ├── notes_*.cjs             # Suíte portada do original (asserts originais)
│   ├── parity_structure.cjs    # Paridade estrutural do modal (ids/ARIA/comandos)
│   ├── parity_visual.cjs       # Paridade de estilos computados (claro/escuro)
│   ├── tema_vidro.cjs          # Modo claro com vidro (backdrop-filter) + escuro sólido
│   ├── multi_notas.cjs         # Múltiplas notas (botão "+"), chips, migração e accent
│   ├── toolbar_pwa.cjs         # Barra em uma linha/rolagem, edição de posições e dock do teclado
│   ├── tema_switch.cjs         # Switch sutil de tema (claro/escuro) manual
│   ├── shortcuts.cjs           # Atalhos de teclado (lacunas cobertas)
│   ├── mapa_area.cjs           # Área Mapa Mental: seletor, troca, lazy e tema
│   ├── mapa_gestao.cjs         # Gestão de mapas: CRUD, pastas, raiz, conexões, templates
│   ├── mapa_canvas.cjs         # Canvas infinito: zoom, pan, pinça, fit, minimapa, viewport
│   ├── mapa_nos.cjs            # Nós: criar/editar/copiar/colar/reparent/recolher/bloquear/largura
│   ├── mapa_conteudo.cjs       # Conteúdo do nó: sanitização, painel, anexos e nó-ponte
│   ├── mapa_layout.cjs         # Hierarquia: níveis, layouts em árvore e recolher seguro
│   ├── mapa_conexoes.cjs       # Conexões livres: criação (3 modos), estilo, edição e remoção
│   ├── mapa_dragdrop.cjs       # Drag & drop: reparent, irmãos, ramificação e ciclo
│   ├── mapa_vazio.cjs          # Mapa novo: estado vazio e criação do primeiro tópico
│   └── helpers/parity.cjs      # Bootstrap comum (PWA e original)
├── docs/
│   ├── INVENTARIO-REGRAS.md    # Todas as unidades de comportamento do motor
│   ├── RASTREABILIDADE.md      # Regra -> teste -> status (lacunas explícitas)
│   ├── RELATORIO-PARIDADE.md   # Divergências visuais e exceções justificadas
│   ├── PROMPT-MODO-CLARO-VIDRO.md        # Como replicar o tema claro com efeitos de vidro
│   ├── PROMPT-MULTI-NOTAS-MODELOS-CORES.md  # Botão "+" (multi-notas), modelos e cores/accent
│   ├── COMO-RODAR-TESTES.md     # Fluxo eficiente: filtros, baseline, retry
│   ├── PROMPT-MAPA-MENTAL.md    # Plano da área "Mapa Mental" (fases e checklist)
│   ├── PROMPT-BACKEND-SYNC-SUPABASE.md  # Plano (10 seções): backend Python + login opcional + sync Supabase/WebSocket
│   ├── PROBLEMAS-E-MITIGACOES.md # Problemas da suíte por fase e como mitigar
│   └── RELATORIO-CORRECAO-TRAVAMENTO-CELULAR.md  # Investigação e correção do travamento no celular
└── README.md               # Este arquivo
```

## 🧪 Testes
A suíte valida as regras do editor comparando o PWA com o projeto original
(`produtividade-ferrramenta`), que é usado **somente como referência**.

```bash
npm install      # instala o Playwright (usa o Edge já instalado; não baixa navegadores)
npm test         # roda a suíte completa e gera docs/RELATORIO-TESTES.md

node tests/<arquivo>.cjs        # 1 único teste (segundos) — o mais rápido
node tests/pwa_service_worker.cjs   # deploy/Service Worker (MIME, skipWaiting, fallback de SPA)
npm test -- --filter=toolbar    # só os testes que casam com o padrão
npm run test:baseline           # suíte completa; só falha se houver falha NOVA
npm test -- --retry=1           # repete 1x um teste que falhou (timeout transitório)

npm run rastreabilidade   # regenera docs/INVENTARIO-REGRAS.md e docs/RASTREABILIDADE.md
npm run icones            # regenera os ícones PNG
```

> **Eficiência**: cada teste abre o próprio navegador e a suíte completa leva
> minutos; são **12 falhas conhecidas** (determinísticas) registradas no baseline.
> Veja `docs/COMO-RODAR-TESTES.md` para o fluxo recomendado.
Para rodar a mesma suíte contra o projeto original (contraprova):
```bash
node tests/run-all.cjs --dir="C:/caminho/produtividade-ferrramenta" --prefixo=RELATORIO-ORIGEM
```
O caminho do original pode ser trocado pela variável de ambiente `NOTAS_ORIGINAL`.

### Gerar novamente os ícones
Os PNGs são gerados a partir do desenho definido em `tools/gerar-icones.cjs` (mesma identidade do `icon.svg`):
```bash
node tools/gerar-icones.cjs              # regenera icon-192.png e icon-512.png
node tools/gerar-icones.cjs --inspecionar  # confere assinatura e dimensões
```

## 🔧 Personalização

### Cores do Tema
Edite as variáveis CSS em `styles.css`:
```css
:root {
    --color-neon-blue: #0071E3;
    --color-neon-green: #34C759;
    /* ... outras cores */
}
```

### Comportamento do Editor
O editor usa o sistema `NotesDocument` do original, mantendo todas as regras:
- Completion position restoration
- Cascade completion
- Auto-renumbering
- HTML normalization
- Sanitização de scripts

## 🚀 Deploy

### Cloudflare Pages (Recomendado)
1. Acesse **Workers & Pages → Create → Pages → Connect to Git**
2. Selecione o repositório e a branch `main`
3. Configuração de build: **Framework preset `None`**, **build command vazio**, **output directory `/`**
4. Deploy automático a cada push; a URL fica em `https://<projeto>.pages.dev`

O arquivo `_headers` já define `Cache-Control: public, max-age=0, must-revalidate` para todo o site,
evitando que o celular fique preso em uma versão antiga do `sw.js`, `index.html` ou `manifest.json`.

> Ao publicar alterações nos assets, incremente `CACHE_NAME` em `sw.js` (ex.: `notas-pwa-v3`) para
> forçar a atualização do cache do Service Worker nos dispositivos.
>
> **Atualização do app (cache do Service Worker, "não atualiza no link publicado", hospedagem):**
> veja **`docs/ATUALIZACAO-PWA.md`** — inclui o diagnóstico, o `firebase.json` de exemplo, os
> cabeçalhos por host (Firebase/Cloudflare/Netlify/Nginx) e o checklist de release.

### Service Worker e fallback de SPA (importante)

Se o host estiver configurado como **SPA** (qualquer rota desconhecida → `index.html` com status 200),
o `sw.js` pode acabar respondido como `text/html`. O navegador **rejeita em silêncio** um Service
Worker que não é JavaScript: o app continua abrindo, mas **nunca mais atualiza** no dispositivo.

O repositório já resolve isso:

* `_redirects` - `/sw.js` e `/manifest.json` são servidos como arquivos estáticos, **antes** de
  qualquer catch-all do `index.html`;
* `_headers` - reforça `Content-Type: application/javascript; charset=utf-8`, `Cache-Control: no-cache`
  e `Service-Worker-Allowed: /` para o `/sw.js`;
* `index.html` - registra com `new URL("sw.js", document.baseURI)` e `{ scope: "./", updateViaCache: "none" }`
  (ignora o cache HTTP do `sw.js`), checa atualização ao carregar e ao voltar para a aba, recarrega
  uma vez no `controllerchange` e **avisa** (bootGuard) se o servidor devolver HTML no lugar do JavaScript.

> Se o fallback estiver configurado fora do repositório, replique a exclusão. Em nginx:
> ```nginx
> location = /sw.js          { try_files $uri =404; }
> location = /manifest.json  { try_files $uri =404; }
> location /                 { try_files $uri /index.html; }
> ```
> No Netlify, mantenha as regras de `/sw.js` e `/manifest.json` **antes** do `/* /index.html 200`
> (é exatamente o que o `_redirects` deste repositório faz).

**Como conferir o deploy:**

```bash
curl -s  https://SEU-DOMINIO/sw.js | grep notas-pwa-v          # versão atual (ex.: notas-pwa-v19)
curl -sI https://SEU-DOMINIO/sw.js | grep -i content-type      # deve ser application/javascript
```

No navegador: DevTools -> **Application -> Service Workers** -> o script deve vir de
`https://SEU-DOMINIO/sw.js` (nunca de um `index.html`).

O teste `tests/pwa_service_worker.cjs` sobe um servidor real **com fallback de SPA** e valida
tudo isso automaticamente.

### GitHub Pages
1. Push dos arquivos para o GitHub
2. Ativar Pages nas configurações do repositório (branch `main`, pasta `/ (root)`)
3. Os caminhos do PWA são relativos (`./`), portanto funcionam tanto na raiz do domínio quanto em subpasta

### Netlify
1. Conecte o repositório ao Netlify
2. Configure as configurações de build (não necessário para HTML estático)
3. Deploy automático
4. O arquivo _redirects do repositório mantém /sw.js e /manifest.json fora do fallback de SPA - mantenha essas regras antes de qualquer /* /index.html 200

### Vercel
1. Importe o repositório no Vercel
2. Configure como projeto estático
3. Deploy automático

## 📝 Notas Técnicas

### Dependências
- Sem dependências externas (vanilla JS)
- Nenhuma fonte externa: a tipografia é o *system stack* do CSS compilado do projeto
  original (`-apple-system, Segoe UI, Roboto…`), o que garante o app 100% offline
- Service Worker para cache offline

### Compatibilidade
- Chrome/Edge: Suporte completo
- Safari: Suporte completo (iOS 14.5+)
- Firefox: Suporte completo
- Navegadores móveis: Otimizado para mobile

### Performance
- Service Worker para cache de assets
- Lazy loading de funcionalidades
- CSS otimizado com variáveis
- JavaScript vanilla (sem frameworks)

## 🔒 Privacidade

- Dados salvos apenas no LocalStorage do dispositivo
- Sem envio de dados para servidores externos
- Sem tracking ou analytics
- Totalmente offline

## 🤝 Contribuindo

Este é um fork do editor de notas do sistema original. Para contribuir:
1. Mantenha a compatibilidade com o sistema `NotesDocument`
2. Preserve as funcionalidades do editor — o motor (`notes/editor.js`, `notes/extras.js`)
   **deixou de ser byte-a-byte igual** ao original na revisão do bloco de notas: ganhou o
   teto de 4 níveis de indentação, o sublinhado (Ctrl+U), o retorno do check à posição
   original e o fluxo do Enter em listas/títulos recolhidos. Ver `docs/INVENTARIO-REGRAS.md`
3. Teste em múltiplos dispositivos
4. Mantenha o código limpo e documentado

## 📄 Licença

Mantenha a mesma licença do projeto original.

## 🎯 Próximos Passos (Opcionais)

- Exportar/importar notas (JSON/HTML)
- Sincronização via GitHub Gist
- Suporte a imagens
- Busca de notas
- Tags/categorias
- Backup automático

---

**Desenvolvido como PWA standalone do sistema de notas original.**
**Todas as funcionalidades e regras de formatação foram preservadas.**