# Guia para Agentes AI - Notas PWA

Este documento fornece contexto completo para agentes AI que trabalharão neste projeto.

## ⚠️ LEIA ANTES DE EDITAR — Marcação de código e Bússola de Arquitetura

1. Ler **`.clinerules/marcacao-e-arquitetura.md`** — regras obrigatórias de marcação (`[INÍCIO:]/[FIM:]`, prefixo de comentário por linguagem, vocabulário de emoji semântico, regras de testes/ferramentas) e da **Regra de Ouro** de atualização da bússola.
2. Consultar **`arquitetura.md`** (Bússola) e os marcadores no código (`Ctrl+Shift+F` por `[INÍCIO:`) para localizar o bloco exato — **não** pedir/editar arquivos inteiros.
3. Depois de qualquer alteração: atualizar `arquitetura.md` no trecho afetado, validar (`node --check <arquivo>`) e rodar o teste da área (`node tests/<arquivo>.cjs`).

## 🎯 Visão Geral do Sistema

PWA vanilla-JS (sem build, sem dependências de runtime) com duas áreas: **Notas** (editor hierárquico) e **Mapa Mental**. Service Worker offline-first.

### Arquitetura Principal

| Camada | Arquivos |
|---|---|
| Casca / boot | `index.html`, `app.js`, `sw.js`, `manifest.json` |
| Motor de notas | `notes/editor.js`, `notes/extras.js`, `notes/tables.js`, `notes/table-math.js` (+ CSS) |
| Mapa mental | `mapa/mapa.js`, `mapa-modelo.js`, `mapa-store.js`, `mapa-layout.js`, `mapa-render.js`, `mapa-painel.js`, `mapa-interacao.js` (+ `mapa.css`) |
| Temas | `styles.css`, `theme-origem.css` (**gerado**) |
| Testes | `tests/*.cjs` + `tests/run-all.cjs` |
| Ferramentas | `tools/*.cjs` |

### Comandos

```bash
npm test                       # suite completa (Playwright + Edge)
node tests/<arquivo>.cjs        # um teste isolado
npm run rastreabilidade         # docs/INVENTARIO-REGRAS.md + RASTREABILIDADE.md
npm run icones                  # regenera icon-192/512.png
```

### 🚫 Não alterar
- `node_modules/`
- Arquivos gerados: `theme-origem.css` (use `tools/extrair-tema.cjs`), `docs/*.json` (relatórios de teste/paridade), `icon-192.png`, `icon-512.png`

### Onde está o que

| Item | Caminho |
|---|---|
| Bússola de arquitetura | `arquitetura.md` |
| Regras de marcação | `.clinerules/marcacao-e-arquitetura.md` |
| Mapa do motor (paridade com o original) | `tests/parity_*.cjs` + `docs/RASTREABILIDADE.md` |
| Relatórios de teste (gerados) | `docs/RELATORIO-TESTES.md`, `docs/relatorio-testes.json` |
