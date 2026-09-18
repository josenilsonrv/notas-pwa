# Notas PWA - Editor de Notas Mobile

Editor de notas avançado como Progressive Web App (PWA) para uso em celular, com todas as funcionalidades de formatação, hierarquia e checklist do sistema original.

## 🌟 Funcionalidades

### Editor de Notas Completo
- **Hierarquia**: Sistema de níveis com indentação (nível 0, 1, 2, etc.)
- **Checklist**: Checkbox com completion tracking, timestamps e batch completion
- **Formatação**: Bold, italic, tachado, headings (H1-H3)
- **Listas**: Lista numerada e com marcadores
- **Cores**: Paleta de cores personalizadas para texto e destaque (background)
- **Múltiplas notas**: Botão "+" cria notas novas; chips no topo alternam entre elas (duplo clique/toque longo renomeia ou exclui) e cada chip segue a cor padrão da sua nota
- **Navegação**: Setas para mover itens, colapso/expansão de hierarquias
- **Blocos de código**: Bloco de código com realce e linguagem
- **Tabelas**: Tabela estilo planilha com fórmulas (SOMA, MEDIA, POTENCIA, etc.), formatos de número/moeda/porcentagem, cores e redimensionamento
- **Inserir**: Imagem, arquivo, tabela, data, vídeo do YouTube (incorporado) e divisor
- **Links**: Inserir/editar links com auto-link do texto digitado
- **Modelos de nota**: Salvar a nota atual como modelo e reaplicá-la
- **Undo/Redo**: Histórico de estados com atalhos
- **Toolbar**: Uma única linha com rolagem horizontal; botão "Editar barra de ferramentas" reordena os botões (ordem guardada no dispositivo); a barra acompanha o teclado, ficando logo acima dele
- **Fullscreen**: Modo tela cheia
- **Temas**: Claro e escuro, com um seletor sutil (sol/lua) no cabeçalho do modal para alternar manualmente
- **Persistência**: Salvo automaticamente no LocalStorage do dispositivo

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
├── icon-192.png            # Ícone 192x192 (PNG real, maskable)
├── icon-512.png            # Ícone 512x512 (PNG real, maskable)
├── icon.svg                # Ícone SVG
├── theme-origem.css        # Tema/regras do modal extraídos do CSS compilado do original (gerado)
├── _headers                # Regras de cache/headers para Cloudflare Pages
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
│   └── helpers/parity.cjs      # Bootstrap comum (PWA e original)
├── docs/
│   ├── INVENTARIO-REGRAS.md    # Todas as unidades de comportamento do motor
│   ├── RASTREABILIDADE.md      # Regra -> teste -> status (lacunas explícitas)
│   ├── RELATORIO-PARIDADE.md   # Divergências visuais e exceções justificadas
│   ├── PROMPT-MODO-CLARO-VIDRO.md        # Como replicar o tema claro com efeitos de vidro
│   ├── PROMPT-MULTI-NOTAS-MODELOS-CORES.md  # Botão "+" (multi-notas), modelos e cores/accent
│   ├── COMO-RODAR-TESTES.md     # Fluxo eficiente: filtros, baseline, retry
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

### GitHub Pages
1. Push dos arquivos para o GitHub
2. Ativar Pages nas configurações do repositório (branch `main`, pasta `/ (root)`)
3. Os caminhos do PWA são relativos (`./`), portanto funcionam tanto na raiz do domínio quanto em subpasta

### Netlify
1. Conecte o repositório ao Netlify
2. Configure as configurações de build (não necessário para HTML estático)
3. Deploy automático

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
2. Preservar todas as funcionalidades do editor
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