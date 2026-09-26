#!/usr/bin/env node
// 🧪 [INÍCIO: TESTE - BACKEND PYTHON]
/**
 * Ponte entre a suite Node do PWA e o pytest do backend Python.
 *
 * REGRA DE OURO: a suite do PWA NUNCA pode quebrar por causa do backend. Este
 * wrapper SAI COM 0 (e diz o motivo) quando o toolchain Python nao esta
 * disponivel:
 *   - sem `.venv` nem `python` no PATH; ou
 *   - `pytest`/`fastapi` nao instalados no interpretador encontrado.
 * Com o ambiente pronto, ele roda `pytest backend/tests -q` e propaga o codigo
 * de saida (falha de verdade REPROVA a suite).
 *
 * Uso: `node tests/backend_python.cjs` (a suite completa ja chama sozinha).
 * Guia: docs/COMO-RODAR-TESTES.md e backend/README.md.
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const PULAR = mensagem => {
  console.log('SKIP backend: ' + mensagem);
  console.log('  (a suite do PWA segue verde; para rodar: pip install -r backend/requirements.txt)');
  process.exit(0);
};

const acharPython = () => {
  const candidatos = [
    process.env.PYTHON_BACKEND,
    path.join(RAIZ, '.venv', 'Scripts', 'python.exe'), // Windows
    path.join(RAIZ, '.venv', 'bin', 'python'), // Linux/macOS
  ].filter(Boolean);
  return candidatos.find(caminho => {
    try {
      return fs.existsSync(caminho);
    } catch (_) {
      return false;
    }
  });
};

const rodar = (bin, argumentos) => {
  try {
    return spawnSync(bin, argumentos, { cwd: RAIZ, encoding: 'utf8' });
  } catch (erro) {
    return { status: null, error: erro, stdout: '', stderr: '' };
  }
};

const python = acharPython();
if (!python) {
  // Ultimo recurso: `python` do PATH, apenas para a checagem de dependencias.
  const teste = rodar('python', ['-c', 'import pytest, fastapi']);
  if (teste.status !== 0) PULAR('sem .venv e sem pytest/fastapi no python do PATH');
  const resultado = rodar('python', ['-m', 'pytest', 'backend/tests', '-q', '--no-header']);
  if (resultado.error) PULAR('nao consegui executar python -m pytest');
  process.stdout.write(resultado.stdout || '');
  process.stderr.write(resultado.stderr || '');
  process.exit(resultado.status === 0 ? 0 : 1);
}

const dependencias = rodar(python, ['-c', 'import pytest, fastapi']);
if (dependencias.error || dependencias.status !== 0) {
  PULAR('pytest/fastapi nao instalados em ' + python);
}

const resultado = rodar(python, ['-m', 'pytest', 'backend/tests', '-q', '--no-header']);
if (resultado.error) PULAR('nao consegui executar ' + python + ' -m pytest');
process.stdout.write(resultado.stdout || '');
process.stderr.write(resultado.stderr || '');
if (resultado.status !== 0) {
  console.log('FALHA: pytest do backend reprovou (veja a saida acima)');
  process.exit(1);
}
console.log('OK: backend/tests (pytest) sem falhas');
process.exit(0);
// 🧪 [FIM: TESTE - BACKEND PYTHON]
