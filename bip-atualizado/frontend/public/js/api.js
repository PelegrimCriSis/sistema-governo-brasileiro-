/* =======================================================================
   B.I.P. — Utilitários compartilhados (chamadas de API, toasts, helpers)
   ======================================================================= */

const NOMES_NIVEL = {
  1: 'Nível I',
  2: 'Nível II',
  3: 'Nível III',
  4: 'Nível IV',
  5: 'Ultrassecreto'
};

/** Wrapper de fetch que já trata JSON, erros e credenciais de sessão. */
async function apiFetch(url, opcoes = {}) {
  const config = {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...opcoes
  };
  if (opcoes.body instanceof FormData) {
    delete config.headers['Content-Type']; // deixa o browser definir o boundary
  }

  const resposta = await fetch(url, config);

  if (resposta.status === 401) {
    window.location.href = '/index.html';
    throw new Error('Sessão expirada.');
  }

  let dados = null;
  try { dados = await resposta.json(); } catch (_) { /* resposta sem corpo JSON */ }

  if (!resposta.ok) {
    const msg = (dados && dados.erro) || 'Erro na requisição.';
    throw new Error(msg);
  }
  return dados;
}

/* Toasts ------------------------------------------------------------------ */
function garantirContainerToast() {
  let c = document.querySelector('.toast-container');
  if (!c) {
    c = document.createElement('div');
    c.className = 'toast-container';
    document.body.appendChild(c);
  }
  return c;
}

function mostrarToast(mensagem, tipo = 'ok') {
  const container = garantirContainerToast();
  const toast = document.createElement('div');
  toast.className = 'toast' + (tipo === 'erro' ? ' erro' : '');
  toast.textContent = mensagem;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4200);
}

/* Helpers de formatação ----------------------------------------------------- */
function badgeNivel(nivel) {
  return `<span class="badge-nivel badge-nivel-${nivel}">${NOMES_NIVEL[nivel] || 'Nível ' + nivel}</span>`;
}

function formatarData(dataStr) {
  if (!dataStr) return '—';
  const d = new Date(dataStr.replace(' ', 'T'));
  if (isNaN(d)) return dataStr;
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(texto) {
  const div = document.createElement('div');
  div.textContent = texto ?? '';
  return div.innerHTML;
}

async function logout() {
  try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (_) {}
  window.location.href = '/index.html';
}
