# Regras de edição — marcação de código e manutenção da Bússola de Arquitetura

> ⚠️ **LEIA ISTO ANTES DE QUALQUER EDIÇÃO.** Vale para todo arquivo de código do projeto, para qualquer IA ou pessoa.

## 1. Fluxo obrigatório antes de editar
1. Ler este arquivo **inteiro**.
2. Abrir `arquitetura.md` (Bússola) e localizar o bloco pela **âncora** + **assinatura**.
3. Trabalhar **por blocos**: perguntar/citar apenas o trecho exato via `[Linhas XX-YY ~]` — nunca pedir o arquivo inteiro.
4. Ao alterar, **preservar** os marcadores do bloco e fechá-los com o MESMO nome.

## 1.1 Mapa do arquivo (obrigatório no TOPO de todo arquivo de código)

Todo arquivo de código começa com o **mapa do arquivo** — 3 linhas que dizem o que é,
o que faz e quem depende dele. Adapte a sintaxe: bloco `/** ... */` em JS/CSS e
docstring `"""..."""` em Python.

**JavaScript / CSS**

```js
/**
 * 🗺️ COMPONENTE: [o que é esta tela/função]
 * 🎯 OBJETIVO: [o que faz, em uma frase]
 * 🔗 QUEM DEPENDE DELE: [telas, rotas ou módulos conectados]
 */
```

**Python**

```python
"""
🗺️ COMPONENTE: [o que é este módulo]
🎯 OBJETIVO: [o que faz, em uma frase]
🔗 QUEM DEPENDE DELE: [módulos, rotas ou processos conectados]
"""
```

Regras do mapa:
- vem **antes** do primeiro par `[INÍCIO: ...]` e **não** o substitui (o mapa indexa o
  arquivo; o par indexa o bloco);
- nome do arquivo novo entra também na Bússola (`arquitetura.md`), na Regra de Ouro;
- em arquivos antigos, o mapa é adicionado **quando o arquivo for tocado** (não se
  reescreve um arquivo só para inserir o mapa).

## 2. Padrão de marcação (obrigatório em código)
```
<prefixo de comentário> <emoji> [INÍCIO: PREFIXO - NOME]
... bloco ...
<prefixo de comentário> <emoji> [FIM: PREFIXO - NOME]
```
- **Sempre em pares fechados**, com **nome idêntico** no INÍCIO e no FIM (diferença de texto = incoerência).
- O par envolve um **bloco coeso** (não necessariamente a função inteira).
- Bloco grande dividido: sufixo `- PARTE 1` / `- PARTE 2` **no FIM**, mantendo o NOME.
- O marcador **herda a indentação** da linha do bloco (crítico em Python; opcional em JS/CSS).
- Nunca inserir marcador **antes de um `#!` (shebang)**: em `tests/run-all.cjs` o par fica **depois** da linha 1.

### Prefixo de comentário por linguagem
| Linguagem | Sintaxe | Exemplo |
|---|---|---|
| JavaScript | `//` | `// 🔄 [INÍCIO: NOTAS - COMANDOS (executeNotesCommand)]` |
| CSS | `/* … */` | `/* 🎨 [INÍCIO: NOTAS/ESTILO - EDITOR (LINHAS, CABEÇALHO, COLAPSO)] */` |
| HTML | `<!-- … -->` | `<!-- 🚀 [INÍCIO: PWA - CARGA DE MÓDULOS E SERVICE WORKER] -->` |
| Config (`_headers`, `_redirects`) | `#` | `# 🚀 [INÍCIO: DEPLOY - REDIRECTS]` |
| Testes/ferramentas (`.cjs`) | `//` file-level | `// 🧪 [INÍCIO: TESTE - NOTES MARKDOWN]` |

| Python (`backend/`) | `#` | `# 💾 [INÍCIO: BACKEND - REPOSITÓRIO]` |

| Python (testes, `backend/tests/`) | `#` file-level | `# 🧪 [INÍCIO: TESTE - BACKEND/TEST_AUTH]` |

### Vocabulário de emoji (semântico — não usar 🔄 para tudo)

> **Regra de leitura:** o **PREFIXO** identifica o módulo/área (ex.: `PWA -`, `AGENDADOR -`, `PÁGINA -`); o **EMOJI** identifica o **tipo de bloco** (🚀 entrada · 🚨 crítico · 🔄 fluxo/API · 💾 persistência · ⚙️ regra · ⚡ interação · 🎨 estilo · 📊 métricas · 🧪 teste). Por isso o **mesmo prefixo pode ter emojis diferentes** — e cada emoji deve ser sempre o mesmo para o mesmo tipo.

| Emoji | Usar para |
|---|---|
| 🚀 | boot, instalação, registro, entrada (ex.: `PWA - BOOT`, `INSTALL`, `SW`) |
| 🚨 | crítico, segurança, blindagem |
| 🔄 | estado, fluxo, orquestração, API, modelo |
| 💾 | persistência (LocalStorage, cache) |
| ⚙️ | regra de cálculo/algoritmo/parser |
| ⚡ | interação, UI, comandos, atalhos, toolbar |
| 🎨 | estilo, tema, animação, layout |
| 📊 | métricas e resumos |
| 🧪 | testes e ferramentas (file-level) |

### Prefixos (área) em uso
`PWA - ` · `NOTAS - ` · `NOTAS/TABELA - ` · `NOTAS/EXTRAS - ` · `TABELA - ` · `MAPA - ` · `PWA/ESTILO - ` · `NOTAS/ESTILO - ` · `MAPA/ESTILO - ` · `DEPLOY - ` · `TESTE - ` · `SCRIPT - `

Backend/login/sync (fase atual): `BACKEND - ` · `API - ` · `CONTA - ` · `SYNC - `

### Regras específicas
- **`tests/*.cjs` e `tools/*.cjs`**: **um único par file-level** `🧪 [INÍCIO: TESTE|SCRIPT - NOME DO ARQUIVO]` … `[FIM: ...]`.
- **`sw.js`**: um par por seção (constantes, helpers, install, activate, fetch, message).
- **Arquivos gerados** (`theme-origem.css`, `styles.css` do compilado): mantêm o par file-level; quem regenerar não deve removê-lo.
- **Não marcar** arquivos que não aceitam comentário: `manifest.json`, `package.json`, `package-lock.json`, `icon.svg`, `.png`.
- **Não** documentar/alterar `node_modules/`, `docs/*.json` (relatórios gerados).

### Legendas de acesso rápido (onde mexer)

• 🎨 [ESTILO] -> cor, tamanho, margem ou visual.
• ⚡ [INTERAÇÃO/JS] -> clique, teclado ou tela sem reagir.
• 🔄 [ESTADO/API] -> dado que não chega ou não sai da tela.
• ⚙️ [REGRA] -> cálculo, parser ou validação errada.
• 💾 [PERSISTÊNCIA] -> dado que não salva ou não atualiza.
• 🚨 [CRÍTICO] -> cuidado extra (segurança, fronteira JS ↔ servidor).
• 🚀 [PONTO DE ENTRADA] -> boot, registro do Service Worker, `init()`.
• 📊 [MÉTRICAS] -> contadores, resumos e relatórios.
• 🧪 [TESTE] -> suíte e ferramentas (par file-level).

## 3. Depois de editar (obrigatório — Regra de Ouro)
1. Atualizar `arquitetura.md` no trecho afetado: `[Linhas XX-YY ~]`, âncora e assinatura.
2. Se o bloco foi criado/removido/movido, ajustar também os índices do doc.
3. Validar sintaxe: `node --check <arquivo>`; e comportamento: `node tests/<arquivo>.cjs` (ou `npm test`).
4. **Nunca** deixar marcador órfão. Conferir com:
   ```
   Select-String -Path <arquivo> -Pattern 'CIO:|\[FIM:'
   ```
   (contagem de `CIO:` = contagem de `[FIM:`).
5. Se a mudança alterar linhas de blocos **posteriores**, atualizar as faixas deles também.

## 4. Estrutura da Bússola (`arquitetura.md`)
- `# Nome do Arquivo: <caminho>` — um por arquivo/área.
- `**Propósito:**` — 1 linha cirúrgica.
- `## Implementação: <fluxo>` — agrupado por **fluxo lógico** (não pela ordem física).
- Bloco: `- **[Linhas XX-YY ~]** \`âncora real do código\` -> \`assinatura\``
- No fim: **rodapé fixo** (não remover nem reescrever).

## 5. Onde está o que
| Item | Caminho |
|---|---|
| Bússola | `arquitetura.md` |
| Mapa do motor de notas (paridade com o original) | `tests/parity_*.cjs` + `docs/RASTREABILIDADE.md` |
| Relatórios de teste (gerados) | `docs/RELATORIO-TESTES.md`, `docs/relatorio-testes.json` |
| Testes | `node tests/run-all.cjs` (ou um arquivo: `node tests/<nome>.cjs`) |
| Ferramentas | `tools/*.cjs` (ex.: `tools/extrair-tema.cjs`, `tools/portar-testes.cjs`) |
