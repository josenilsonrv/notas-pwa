// ⚙️ [INÍCIO: FONTES - CATÁLOGO DO SISTEMA (BUSCA + SELETOR)]
/**
 * Catálogo AMPLO de fontes do SISTEMA (offline: zero download). Cada aparelho mostra
 * as famílias que tem instaladas — as que faltarem caem no fallback do grupo (ex.:
 * `serif`/`sans-serif`/`monospace`), então o texto nunca fica sem estilo.
 *
 * Expõe `global.NotasFontes`:
 *   - lista:    [{ nome, css }]
 *   - buscar(t): filtra por nome (sem acento e sem diferenciar maiúsculas)
 *   - abrir({ atual, onEscolher, trigger }): diálogo com busca + prévia ("Aa").
 *
 * Usado por Notas (barra de ferramentas → botão "Fonte") e pelo Mapa.
 */
(function (global) {
    'use strict';

    const SANS = "system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif";
    const SERIF = "Georgia, 'Times New Roman', 'Times', serif";
    const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    const CURSIVA = "'Segoe Script', 'Comic Sans MS', 'Brush Script MT', cursive";

    const FONTES = [
        { nome: 'Sistema (padrão)', css: SANS },
        // ---- Sem serifa ----
        { nome: 'Arial', css: "Arial, Helvetica, sans-serif" },
        { nome: 'Arial Black', css: "'Arial Black', Arial, sans-serif" },
        { nome: 'Arial Narrow', css: "'Arial Narrow', Arial, sans-serif" },
        { nome: 'Helvetica', css: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
        { nome: 'Verdana', css: "Verdana, Geneva, sans-serif" },
        { nome: 'Tahoma', css: "Tahoma, Geneva, sans-serif" },
        { nome: 'Trebuchet MS', css: "'Trebuchet MS', Tahoma, sans-serif" },
        { nome: 'Segoe UI', css: "'Segoe UI', Roboto, sans-serif" },
        { nome: 'Calibri', css: "Calibri, Candara, 'Segoe UI', sans-serif" },
        { nome: 'Candara', css: "Candara, Calibri, 'Segoe UI', sans-serif" },
        { nome: 'Corbel', css: "Corbel, Calibri, 'Segoe UI', sans-serif" },
        { nome: 'Franklin Gothic', css: "'Franklin Gothic Medium', 'Arial Narrow', sans-serif" },
        { nome: 'Century Gothic', css: "'Century Gothic', 'AppleGothic', sans-serif" },
        { nome: 'Gill Sans', css: "'Gill Sans', 'Gill Sans MT', Calibri, sans-serif" },
        { nome: 'Optima', css: "Optima, Candara, 'Segoe UI', sans-serif" },
        { nome: 'Futura', css: "Futura, 'Century Gothic', sans-serif" },
        { nome: 'Lucida Sans', css: "'Lucida Sans', 'Lucida Grande', Geneva, sans-serif" },
        { nome: 'Geneva', css: "Geneva, Verdana, sans-serif" },
        { nome: 'Bahnschrift', css: "Bahnschrift, 'Segoe UI', sans-serif" },
        { nome: 'Impact', css: "Impact, Haettenschweiler, sans-serif" },
        { nome: 'Copperplate', css: "Copperplate, 'Copperplate Gothic Light', sans-serif" },
        // ---- Com serifa ----
        { nome: 'Georgia', css: "Georgia, 'Times New Roman', serif" },
        { nome: 'Times New Roman', css: "'Times New Roman', Times, serif" },
        { nome: 'Cambria', css: "Cambria, Georgia, serif" },
        { nome: 'Constantia', css: "Constantia, Cambria, Georgia, serif" },
        { nome: 'Palatino', css: "'Palatino Linotype', 'Book Antiqua', Palatino, serif" },
        { nome: 'Garamond', css: "Garamond, 'Times New Roman', serif" },
        { nome: 'Baskerville', css: "Baskerville, 'Baskerville Old Face', Georgia, serif" },
        { nome: 'Didot', css: "Didot, 'Bodoni MT', Georgia, serif" },
        { nome: 'Bodoni', css: "'Bodoni MT', Didot, Georgia, serif" },
        { nome: 'Rockwell', css: "Rockwell, 'Courier New', serif" },
        { nome: 'Bookman', css: "'Bookman Old Style', Georgia, serif" },
        { nome: 'Century Schoolbook', css: "'Century Schoolbook', 'New Century Schoolbook', Georgia, serif" },
        { nome: 'Perpetua', css: "Perpetua, 'Palatino Linotype', serif" },
        // ---- Monoespaçadas ----
        { nome: 'Consolas', css: "Consolas, 'Courier New', monospace" },
        { nome: 'Courier New', css: "'Courier New', Courier, monospace" },
        { nome: 'Lucida Console', css: "'Lucida Console', Monaco, monospace" },
        { nome: 'Monaco', css: "Monaco, Consolas, monospace" },
        { nome: 'Menlo', css: "Menlo, Consolas, monospace" },
        { nome: 'Cascadia Mono', css: "'Cascadia Mono', Consolas, monospace" },
        { nome: 'DejaVu Sans Mono', css: "'DejaVu Sans Mono', 'Liberation Mono', monospace" },
        // ---- Cursiva / manuscrita ----
        { nome: 'Segoe Script', css: "'Segoe Script', 'Brush Script MT', cursive" },
        { nome: 'Comic Sans MS', css: "'Comic Sans MS', 'Segoe Print', cursive" },
        { nome: 'Brush Script', css: "'Brush Script MT', 'Segoe Script', cursive" },
        { nome: 'Lucida Handwriting', css: "'Lucida Handwriting', 'Segoe Script', cursive" },
        { nome: 'Bradley Hand', css: "'Bradley Hand', 'Segoe Script', cursive" },
        { nome: 'Papyrus', css: "Papyrus, 'Comic Sans MS', cursive" },
        { nome: 'Snell Roundhand', css: "'Snell Roundhand', 'Apple Chancery', cursive" },
        { nome: 'Apple Chancery', css: "'Apple Chancery', 'Snell Roundhand', cursive" },
        { nome: 'Zapfino', css: "Zapfino, 'Snell Roundhand', cursive" },
        { nome: 'Chalkboard', css: "Chalkboard, 'Comic Sans MS', cursive" },
        // ---- Fantasia / display ----
        { nome: 'Haettenschweiler', css: "Haettenschweiler, Impact, sans-serif" },
        { nome: 'Stencil', css: "Stencil, Impact, sans-serif" },
        { nome: 'Luminari', css: "Luminari, Papyrus, fantasy" },
        { nome: 'Fantasy (padrão)', css: "fantasy" },
        // ---- Grupos genéricos (fallback garantido) ----
        { nome: 'Serifada (padrão)', css: SERIF },
        { nome: 'Monoespaçada (padrão)', css: MONO },
        { nome: 'Sans (padrão)', css: SANS },
        { nome: 'Cursiva (padrão)', css: CURSIVA }
    ];

    /** Normaliza para busca (minúsculas, sem acento). */
    function chave(texto) {
        return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    }

    function buscar(termo) {
        const alvo = chave(termo).trim();
        if (!alvo) return FONTES.slice();
        return FONTES.filter(fonte => chave(fonte.nome).includes(alvo));
    }

    let abertoAtual = null;

    /** Fecha o seletor aberto (se houver). */
    function fechar() {
        if (abertoAtual && typeof abertoAtual.fechar === 'function') abertoAtual.fechar();
    }

    /**
     * Abre o seletor de fontes. `onEscolher(css, nome)` é chamado ao confirmar.
     * Fecha com Esc, clique fora ou o botão ✕.
     */
    function abrir(opcoes) {
        const cfg = opcoes || {};
        fechar();
        const overlay = document.createElement('div');
        overlay.className = 'notas-seletor-fontes';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Escolher fonte');

        const caixa = document.createElement('div');
        caixa.className = 'notas-seletor-fontes-caixa';

        const topo = document.createElement('div');
        topo.className = 'notas-seletor-fontes-topo';
        const busca = document.createElement('input');
        busca.type = 'search';
        busca.className = 'notas-seletor-fontes-busca';
        busca.placeholder = 'Buscar fonte...';
        busca.setAttribute('aria-label', 'Buscar fonte');
        const fecharBtn = document.createElement('button');
        fecharBtn.type = 'button';
        fecharBtn.className = 'notas-seletor-fontes-fechar';
        fecharBtn.setAttribute('aria-label', 'Fechar');
        fecharBtn.textContent = '✕';
        topo.append(busca, fecharBtn);

        const lista = document.createElement('div');
        lista.className = 'notas-seletor-fontes-lista';
        lista.setAttribute('role', 'listbox');
        lista.setAttribute('aria-label', 'Fontes disponíveis');

        caixa.append(topo, lista);
        overlay.append(caixa);
        document.body.append(overlay);

        function desenhar() {
            lista.replaceChildren();
            const achadas = buscar(busca.value);
            if (!achadas.length) {
                const vazio = document.createElement('p');
                vazio.className = 'notas-seletor-fontes-vazio';
                vazio.textContent = 'Nenhuma fonte encontrada.';
                lista.append(vazio);
                return;
            }
            achadas.forEach(fonte => {
                const item = document.createElement('button');
                item.type = 'button';
                item.className = 'notas-seletor-fontes-opcao';
                item.setAttribute('role', 'option');
                item.dataset.fonte = fonte.css;
                if (cfg.atual && fonte.css === cfg.atual) item.classList.add('is-ativa');
                item.style.fontFamily = fonte.css;
                const nome = document.createElement('span');
                nome.className = 'notas-seletor-fontes-nome';
                nome.textContent = fonte.nome;
                const previa = document.createElement('span');
                previa.className = 'notas-seletor-fontes-previa';
                previa.style.fontFamily = fonte.css;
                previa.textContent = 'Aa';
                item.append(nome, previa);
                item.addEventListener('click', () => {
                    const css = fonte.css;
                    fechar();
                    if (typeof cfg.onEscolher === 'function') cfg.onEscolher(css, fonte.nome);
                });
                lista.append(item);
            });
        }

        function aoTeclar(evento) {
            if (evento.key === 'Escape') { evento.preventDefault(); fechar(); }
        }
        function aoClicarFora(evento) {
            if (!caixa.contains(evento.target)) fechar();
        }
        function fim() {
            document.removeEventListener('keydown', aoTeclar, true);
            overlay.removeEventListener('pointerdown', aoClicarFora);
            overlay.remove();
            abertoAtual = null;
            const gatilho = cfg.trigger;
            if (gatilho && typeof gatilho.focus === 'function') { try { gatilho.focus({ preventScroll: true }); } catch (_) { /* opcional */ } }
        }
        abertoAtual = { fechar: fim };

        busca.addEventListener('input', desenhar);
        fecharBtn.addEventListener('click', fim);
        overlay.addEventListener('pointerdown', aoClicarFora);
        document.addEventListener('keydown', aoTeclar, true);

        desenhar();
        busca.focus({ preventScroll: true });
    }

    global.NotasFontes = { lista: FONTES, buscar, abrir, fechar };
})(typeof window !== 'undefined' ? window : globalThis);
// ⚙️ [FIM: FONTES - CATÁLOGO DO SISTEMA (BUSCA + SELETOR)]
