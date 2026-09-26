/**
 * 🗺️ COMPONENTE: Conta do usuário — login OPCIONAL por e-mail/senha
 * 🎯 OBJETIVO: Dar rosto ao backend (botão "Entrar" no cabeçalho + diálogo de conta)
 *              mantendo o login OPCIONAL: deslogado, o app é exatamente o de hoje.
 * 🔗 QUEM DEPENDE DELE: `index.html` (botão `#contaBtn` + `<script>`), `app.js`
 *              (`installNotesFeatures` chama `installConta`) e o `sync/sync-cliente.js`
 *              (seção 5), que lê `window.notasConta` para saber se há sessão.
 */
// 🚨 [INÍCIO: CONTA - ESTADO E CHAMADAS À API]
/**
 * Espelho do estado da conta que o FRONT enxerga. NUNCA guarda token: a sessão
 * vive num cookie `HttpOnly` (assinado pelo backend) que o JavaScript não lê.
 */
window.notasConta = window.notasConta || {
    logado: false,
    email: '',
    csrf: '',
    sync: { estado: 'local', pendentes: 0 }
};

/** Ícone de pessoa (mesmo desenho/traço dos ícones do app). */
const ICONE_PESSOA = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="3.4"/><path d="M5.2 20a6.8 6.8 0 0 1 13.6 0"/></svg>';

function installConta(App) {
    const p = App.prototype;

    /**
     * Chamada à API da conta: mesmo origin (sem CORS), cookie `HttpOnly` via
     * `credentials: 'same-origin'` e `X-CSRF` em TODA escrita. O erro do backend
     * chega como `{detail}` e vira um `Error` com a mensagem pronta para a tela.
     */
    p.contaPedir = async function (caminho, opcoes = {}) {
        const metodo = (opcoes.method || 'GET').toUpperCase();
        const cabecalhos = Object.assign({}, opcoes.headers || {});
        if (metodo !== 'GET' && window.notasConta.csrf) cabecalhos['X-CSRF'] = window.notasConta.csrf;
        let resposta;
        try {
            resposta = await fetch('/api/auth' + caminho, Object.assign({}, opcoes, {
                method: metodo,
                headers: cabecalhos,
                credentials: 'same-origin'
            }));
        } catch (_) {
            throw new Error('Não foi possível falar com o servidor.');
        }
        if (resposta.status === 204) return null;
        const dados = await resposta.json().catch(() => ({}));
        if (resposta.ok) return dados;
        const falha = new Error(dados.detail || 'Não foi possível concluir a operação.');
        falha.status = resposta.status;
        throw falha;
    };
// 🚨 [FIM: CONTA - ESTADO E CHAMADAS À API]

// 🚨 [INÍCIO: CONTA - SESSÃO (aplicar/verificar/entrar/registrar/sair)]
    /** Aplica (ou limpa) o espelho do estado e reflete na UI. */
    p.contaAplicar = function (dados) {
        const alvo = window.notasConta;
        alvo.logado = Boolean(dados && dados.id);
        alvo.email = alvo.logado ? (dados.email || '') : '';
        alvo.csrf = alvo.logado ? (dados.csrf || '') : '';
        if (typeof this.contaAtualizarBotao === 'function') this.contaAtualizarBotao();
        if (typeof this.contaAtualizarDialogo === 'function') this.contaAtualizarDialogo();
        // Gancho do SYNC (seção 5): entrar dispara snapshot + 1º envio; sair limpa a fila.
        if (alvo.logado && typeof this.syncAoEntrar === 'function') this.syncAoEntrar().catch(() => { });
        if (!alvo.logado && typeof this.syncAoSair === 'function') this.syncAoSair();
    };

    /**
     * Confere a sessão no boot. É SILENCIOSO de propósito (P62): com o backend
     * desligado ou sem conta, o app sobe deslogado e 100% utilizável — nunca
     * mostra erro nem bloqueia nada.
     */
    p.contaVerificar = async function () {
        try {
            const dados = await this.contaPedir('/me');
            this.contaAplicar(dados);
            return true;
        } catch (_) {
            this.contaAplicar(null);
            return false;
        }
    };

    p.contaEntrar = async function (email, senha) {
        await this.contaPedir('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        await this.contaVerificar();
    };

    p.contaRegistrar = async function (email, senha) {
        await this.contaPedir('/registrar', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, senha })
        });
        await this.contaVerificar();
    };

    /** Sair é IDEMPOTENTE: mesmo sem sessão, o diálogo volta ao estado "Entrar". */
    p.contaSair = async function () {
        try {
            await this.contaPedir('/logout', { method: 'POST' });
        } catch (_) { /* sessão já caiu/offline: o estado local volta a deslogado */ }
        this.contaAplicar(null);
    };
// 🚨 [FIM: CONTA - SESSÃO (aplicar/verificar/entrar/registrar/sair)]

// ⚡ [INÍCIO: CONTA - BOTÃO DO CABEÇALHO]
    /** Deslogado = "Entrar"; logado = o e-mail. Traz ícone + nome (o CSS esconde o
     *  nome até 1023px, para o título da área ao lado continuar legível). */
    p.contaAtualizarBotao = function () {
        const botao = document.getElementById('contaBtn');
        if (!botao) return;
        const estado = window.notasConta;
        if (!botao.querySelector('.conta-btn-nome')) {
            botao.innerHTML = ICONE_PESSOA + '<span class="conta-btn-nome"></span>';
        }
        botao.querySelector('.conta-btn-nome').textContent = estado.logado ? estado.email : 'Entrar';
        botao.dataset.logado = estado.logado ? 'true' : 'false';
        const rotulo = estado.logado ? 'Conta de ' + estado.email : 'Entrar na sua conta';
        botao.title = rotulo;
        botao.setAttribute('aria-label', rotulo);
    };
// ⚡ [FIM: CONTA - BOTÃO DO CABEÇALHO]

// ⚡ [INÍCIO: CONTA - DIÁLOGO (entrar / criar conta / sair)]
    /** Cria um elemento do MEU diálogo (`data-conta` = o que eu removo ao redesenhar). */
    const criar = (tag, classe) => {
        const el = document.createElement(tag);
        el.dataset.conta = '';
        if (classe) el.className = classe;
        return el;
    };

    const paragrafo = (texto, classe) => {
        const el = criar('p', classe);
        el.textContent = texto;
        return el;
    };

    const botao = (texto, rotulo, acao, classe) => {
        const el = criar('button', classe);
        el.type = 'button';
        el.textContent = texto;
        el.title = rotulo;
        el.setAttribute('aria-label', rotulo);
        el.addEventListener('click', acao);
        return el;
    };

    /** Campo rotulado (o `<label>` envolve o input: nome acessível sem id extra). */
    const campo = (id, rotulo, tipo) => {
        const caixa = criar('label', 'conta-campo');
        const texto = document.createElement('span');
        texto.textContent = rotulo;
        const entrada = document.createElement('input');
        entrada.id = id;
        entrada.type = tipo;
        entrada.required = true;
        entrada.autocomplete = tipo === 'password' ? 'current-password' : 'email';
        caixa.append(texto, entrada);
        return { caixa, entrada };
    };

    /** Estado LOGADO: e-mail, situação do sync e "Sair". */
    p.montarContaLogado = function (dialog, erro, mostrarErro) {
        const estado = window.notasConta;
        dialog.append(
            paragrafo('Conectado. Suas notas, mapas e ajustes ficam na sua conta.', 'conta-ajuda'),
            paragrafo(estado.email, 'conta-email'),
            paragrafo(this.contaTextoDoSync(), 'conta-sync'),
            botao('Sair da conta', 'Sair da conta', async () => {
                mostrarErro('');
                try {
                    await this.contaSair();
                } catch (falha) {
                    mostrarErro(falha.message);
                }
            }, 'conta-acao-secundaria'),
            erro
        );
    };

    /** Estado DESLOGADO: formulário (Entrar / Criar conta) + erro inline. */
    p.montarContaDeslogado = function (dialog, erro, mostrarErro) {
        const email = campo('contaEmail', 'E-mail', 'email');
        const senha = campo('contaSenha', 'Senha', 'password');
        const formulario = criar('form', 'conta-form');
        formulario.noValidate = true;

        const entrar = criar('button', 'conta-acao');
        entrar.type = 'submit';
        entrar.textContent = 'Entrar';
        const criarConta = botao('Criar conta', 'Criar conta', () => submeter(true), 'conta-acao-secundaria');
        formulario.append(email.caixa, senha.caixa, entrar, criarConta);

        let ocupado = false;
        const submeter = async novo => {
            if (ocupado) return;
            ocupado = true;
            mostrarErro('');
            const rotulo = entrar.textContent;
            entrar.disabled = true;
            criarConta.disabled = true;
            entrar.textContent = novo ? 'Criando…' : 'Entrando…';
            try {
                if (novo) await this.contaRegistrar(email.entrada.value.trim(), senha.entrada.value);
                else await this.contaEntrar(email.entrada.value.trim(), senha.entrada.value);
                // Deu certo: `contaAplicar` já redesenha o diálogo no estado logado.
            } catch (falha) {
                mostrarErro(falha.message);
                entrar.textContent = rotulo;
                entrar.disabled = false;
                criarConta.disabled = false;
            } finally {
                ocupado = false;
            }
        };
        formulario.addEventListener('submit', evento => {
            evento.preventDefault();
            submeter(false);
        });

        dialog.append(
            paragrafo('A conta é opcional: sem ela, suas notas ficam somente neste aparelho.', 'conta-ajuda'),
            formulario,
            paragrafo('Ao entrar pela primeira vez, o conteúdo deste aparelho é enviado para a sua conta.', 'conta-aviso'),
            erro
        );
    };

    /** (Re)desenha o conteúdo do diálogo conforme o estado ATUAL da conta. */
    p.contaMontarDialogo = function (dialog) {
        dialog.querySelectorAll('[data-conta]').forEach(elemento => elemento.remove());
        const erro = paragrafo('', 'conta-erro');
        erro.setAttribute('role', 'alert');
        erro.hidden = true;
        const mostrarErro = mensagem => {
            erro.textContent = mensagem || '';
            erro.hidden = !mensagem;
        };
        if (window.notasConta.logado) this.montarContaLogado(dialog, erro, mostrarErro);
        else this.montarContaDeslogado(dialog, erro, mostrarErro);
    };

    /** Abre o diálogo de conta REUSANDO o diálogo base do app (como faz o "Modelos"). */
    p.contaAbrirDialog = function (gatilho) {
        if (typeof this.notesExtraDialog !== 'function') return null;
        const alvo = gatilho || document.getElementById('contaBtn');
        this.contaDialogo = this.notesExtraDialog('Conta', dialog => {
            dialog.classList.add('conta-dialog');
            this.contaMontarDialogo(dialog);
        }, alvo);
        return this.contaDialogo;
    };

    /** Redesenha o diálogo ABERTO quando o estado muda (entrou/saiu). */
    p.contaAtualizarDialogo = function () {
        const dialog = this.contaDialogo;
        if (!dialog || !dialog.open) return;
        this.contaMontarDialogo(dialog);
    };

    /** Texto do estado de sincronização (a seção 5 liga os estados reais). */
    p.contaTextoDoSync = function () {
        const sync = window.notasConta.sync || {};
        const pendentes = Number(sync.pendentes || 0);
        switch (sync.estado) {
            case 'sincronizando':
                return pendentes > 0
                    ? 'Enviando ' + pendentes + ' alteraç' + (pendentes === 1 ? 'ão' : 'ões') + '…'
                    : 'Enviando alterações…';
            case 'offline':
                return 'Offline — ' + pendentes + ' na fila';
            case 'expirada':
                return 'Sessão expirada (entre novamente)';
            case 'local':
                return 'Só neste aparelho';
            default:
                return window.notasConta.logado ? 'Sincronizado' : 'Só neste aparelho';
        }
    };
// ⚡ [FIM: CONTA - DIÁLOGO (entrar / criar conta / sair)]

// 🚀 [INÍCIO: CONTA - INSTALAÇÃO (installConta)]
    /** Liga o botão do cabeçalho e confere a sessão — SILENCIOSO (P62). */
    p.instalarContaUI = function () {
        const gatilho = document.getElementById('contaBtn');
        if (gatilho && gatilho.dataset.contaLigado !== 'true') {
            gatilho.dataset.contaLigado = 'true';
            gatilho.addEventListener('click', () => this.contaAbrirDialog(gatilho));
        }
        this.contaAtualizarBotao();
        // Voltou a rede: reconfere apenas se ainda não houver sessão.
        window.addEventListener('online', () => {
            if (!window.notasConta.logado) this.contaVerificar();
        });
        return this.contaVerificar();
    };

    p.instalarContaUI();
}
// 🚀 [FIM: CONTA - INSTALAÇÃO (installConta)]

