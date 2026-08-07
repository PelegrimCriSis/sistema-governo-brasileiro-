/* =======================================================================
   B.I.P. — SCRIPT DA TELA DE LOGIN
   ======================================================================= */

/* Relógio ---------------------------------------------------------------- */
function atualizarRelogio() {
  const clockEl = document.getElementById('clock');
  if (!clockEl) return;
  const agora = new Date();
  clockEl.textContent = `${agora.toLocaleDateString('pt-BR')} — ${agora.toLocaleTimeString('pt-BR', { hour12: false })}`;
}
setInterval(atualizarRelogio, 1000);
atualizarRelogio();

/* Partículas digitais ----------------------------------------------------- */
function gerarParticulas() {
  const container = document.getElementById('particles');
  if (!container) return;
  for (let i = 0; i < 40; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = Math.random() * 100 + 'vw';
    const tamanho = 2 + Math.random() * 2;
    p.style.width = tamanho + 'px';
    p.style.height = tamanho + 'px';
    p.style.bottom = '-10px';
    p.style.animationDuration = (8 + Math.random() * 12) + 's';
    p.style.animationDelay = (Math.random() * 10) + 's';
    container.appendChild(p);
  }
}
gerarParticulas();

/* "Lembrar usuário" (armazenado localmente, apenas o nome de usuário) ---- */
const usuarioInput = document.getElementById('usuario');
const lembrarCheckbox = document.getElementById('lembrarUsuario');
const usuarioLembrado = localStorage.getItem('bip_usuario_lembrado');
if (usuarioLembrado) {
  usuarioInput.value = usuarioLembrado;
  lembrarCheckbox.checked = true;
}

/* "Esqueci minha senha" — apenas visual, conforme especificação ---------- */
document.getElementById('btnEsqueciSenha').addEventListener('click', () => {
  alert('Procedimento de recuperação indisponível. Contate o Administrador do sistema (Mestre) para redefinir sua senha.');
});

/* Lógica de login ---------------------------------------------------------- */
const loginForm = document.getElementById('loginForm');
const loginBox = document.getElementById('loginBox');
const errorMsg = document.getElementById('errorMsg');
const verifyBlock = document.getElementById('verifyBlock');
const loadingFill = document.getElementById('loadingFill');
const verifyLog = document.getElementById('verifyLog');
const alertFlash = document.getElementById('alertFlash');
const btnAccess = document.getElementById('btnAccess');

const mensagensVerificacao = [
  'Validando autorização...',
  'Verificando nível de acesso...',
  'Conectando ao banco de dados classificado...',
  'Acesso concedido.'
];

loginForm.addEventListener('submit', async (evento) => {
  evento.preventDefault();

  const usuario = usuarioInput.value.trim();
  const senha = document.getElementById('senha').value;

  errorMsg.classList.remove('show');
  verifyBlock.classList.remove('show');

  if (lembrarCheckbox.checked) {
    localStorage.setItem('bip_usuario_lembrado', usuario);
  } else {
    localStorage.removeItem('bip_usuario_lembrado');
  }

  try {
    const resposta = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usuario, senha })
    });
    const dados = await resposta.json();

    if (!resposta.ok) {
      processarLoginIncorreto();
      return;
    }

    processarLoginCorreto(dados.redirecionarPara);
  } catch (err) {
    processarLoginIncorreto();
  }
});

function processarLoginIncorreto() {
  loginBox.classList.remove('shake');
  void loginBox.offsetWidth;
  loginBox.classList.add('shake');

  errorMsg.classList.add('show');

  alertFlash.classList.remove('flash');
  void alertFlash.offsetWidth;
  alertFlash.classList.add('flash');

  setTimeout(() => loginBox.classList.remove('shake'), 500);
}

function processarLoginCorreto(destino) {
  btnAccess.disabled = true;
  verifyBlock.classList.add('show');
  verifyLog.innerHTML = '';

  requestAnimationFrame(() => {
    loadingFill.style.width = '100%';
  });

  mensagensVerificacao.forEach((mensagem, indice) => {
    setTimeout(() => {
      const item = document.createElement('li');
      item.textContent = '> ' + mensagem;
      verifyLog.appendChild(item);
    }, indice * 550);
  });

  setTimeout(() => {
    window.location.href = destino || '/portal.html';
  }, 2500);
}
