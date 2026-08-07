/* =======================================================================
   B.I.P. — SISTEMA DE MÚSICAS
   Script compartilhado (login + portal) responsável por:
   - Tocar a música principal/inicial configurada pelo admin (autoplay,
     loop, fade suave, volume configurável).
   - Manter a música tocando "sem reiniciar" durante a navegação — tanto
     dentro do portal (SPA, nunca recarrega) quanto entre telas completas
     (login → portal), retomando aproximadamente de onde parou via
     localStorage.
   - Tocar uma música secundária (de um documento ou de um caso) com fade,
     reduzindo a principal enquanto ela toca e restaurando ao terminar.
   - Botão ligar/desligar + controle de volume, com preferência do usuário
     salva em localStorage.

   Não depende de nenhum outro script do projeto (carrega antes de
   portal.js / login.js) e não altera nada do HTML/CSS existente — apenas
   injeta seu próprio widget flutuante.
   ======================================================================= */

const MusicaSistema = (function () {
  const CHAVE_LIGADA = 'bip_musica_ligada';
  const CHAVE_VOLUME = 'bip_musica_volume';
  const CHAVE_ESTADO = 'bip_musica_estado'; // { id, tempo, atualizadoEm }

  let config = null;
  let principal = null;          // <audio> da música principal/inicial
  let secundario = null;         // <audio> da música do documento/caso atual
  let secundarioId = null;
  let fadeMs = 1500;
  let ligada = true;
  let pronto = false;
  let filaSecundaria = null;     // guarda uma chamada feita antes de "pronto"
  let intervaloSalvarEstado = null;

  /* ------------------------------------------------------------------
     Utilitários
  ------------------------------------------------------------------ */
  function lerLocalStorage(chave, padrao) {
    try {
      const v = localStorage.getItem(chave);
      return v === null ? padrao : v;
    } catch (e) { return padrao; }
  }
  function gravarLocalStorage(chave, valor) {
    try { localStorage.setItem(chave, valor); } catch (e) { /* modo privado etc. */ }
  }

  function volumeUsuario01() {
    const v = Number(lerLocalStorage(CHAVE_VOLUME, (config && config.volume) || '80'));
    return Math.min(1, Math.max(0, (isNaN(v) ? 80 : v) / 100));
  }

  /** Anima o volume de um <audio> até um alvo (0..1) suavemente. */
  function fadeTo(audioEl, alvo, duracaoMs, aoTerminar) {
    if (!audioEl) { if (aoTerminar) aoTerminar(); return; }
    alvo = Math.min(1, Math.max(0, alvo));
    const inicio = audioEl.volume;
    const t0 = performance.now();
    if (audioEl._fadeRaf) cancelAnimationFrame(audioEl._fadeRaf);

    function passo(agora) {
      const progresso = duracaoMs <= 0 ? 1 : Math.min(1, (agora - t0) / duracaoMs);
      audioEl.volume = inicio + (alvo - inicio) * progresso;
      if (progresso < 1) {
        audioEl._fadeRaf = requestAnimationFrame(passo);
      } else {
        audioEl._fadeRaf = null;
        if (aoTerminar) aoTerminar();
      }
    }
    audioEl._fadeRaf = requestAnimationFrame(passo);
  }

  function telaAtual() {
    const p = window.location.pathname.toLowerCase();
    if (p.endsWith('/portal.html')) return 'portal';
    if (p.endsWith('/admin.html')) return 'admin';
    return 'login'; // index.html ou raiz
  }

  /* ------------------------------------------------------------------
     Widget flutuante (ligar/desligar + volume)
  ------------------------------------------------------------------ */
  function construirWidget() {
    if (document.getElementById('musicaPlayerWidget')) return;

    const wrap = document.createElement('div');
    wrap.className = 'musica-player-widget';
    wrap.id = 'musicaPlayerWidget';
    wrap.innerHTML = `
      <button type="button" class="musica-btn-toggle" id="musicaBtnToggle" title="Ligar/desligar música">${ligada ? '🔊' : '🔇'}</button>
      <input type="range" class="musica-volume-slider" id="musicaVolumeSlider" min="0" max="100" value="${Math.round(volumeUsuario01() * 100)}" title="Volume da música">
      <span class="musica-label">MÚSICA</span>
    `;
    document.body.appendChild(wrap);

    document.getElementById('musicaBtnToggle').addEventListener('click', alternar);
    document.getElementById('musicaVolumeSlider').addEventListener('input', (e) => {
      definirVolume(Number(e.target.value));
    });
  }

  function mostrarPromptAtivar() {
    if (document.getElementById('musicaAtivarPrompt')) return;
    const aviso = document.createElement('div');
    aviso.className = 'musica-ativar-prompt';
    aviso.id = 'musicaAtivarPrompt';
    aviso.textContent = '🔇 Clique para ativar a música ambiente';
    aviso.addEventListener('click', () => {
      aviso.remove();
      if (principal) {
        principal.play().then(() => fadeTo(principal, volumeUsuario01(), fadeMs)).catch(() => {});
      }
    });
    document.body.appendChild(aviso);
  }

  /* ------------------------------------------------------------------
     Música principal / inicial
  ------------------------------------------------------------------ */
  function criarPrincipal() {
    if (!config || !config.musica_inicial_id) return null;
    const audio = new Audio(`/api/public/musicas/${config.musica_inicial_id}/arquivo`);
    audio.loop = config.musica_loop !== '0';
    audio.preload = 'auto';
    audio.volume = 0;
    return audio;
  }

  function retomarPosicaoSalva(audio) {
    let estado = null;
    try { estado = JSON.parse(lerLocalStorage(CHAVE_ESTADO, 'null')); } catch (e) { estado = null; }
    if (!estado || String(estado.id) !== String(config.musica_inicial_id)) return;

    const decorridoSeg = Math.max(0, (Date.now() - estado.atualizadoEm) / 1000);
    const tempoEstimado = (estado.tempo || 0) + decorridoSeg;

    audio.addEventListener('loadedmetadata', function ajustar() {
      try {
        if (audio.duration && isFinite(audio.duration)) {
          audio.currentTime = tempoEstimado % audio.duration;
        }
      } catch (e) { /* alguns navegadores bloqueiam antes do play() */ }
    }, { once: true });
  }

  function iniciarPersistenciaDeEstado(audio) {
    if (intervaloSalvarEstado) clearInterval(intervaloSalvarEstado);
    intervaloSalvarEstado = setInterval(() => {
      if (!audio.paused) {
        gravarLocalStorage(CHAVE_ESTADO, JSON.stringify({
          id: config.musica_inicial_id,
          tempo: audio.currentTime,
          atualizadoEm: Date.now()
        }));
      }
    }, 2000);
    window.addEventListener('beforeunload', () => {
      if (!audio.paused) {
        gravarLocalStorage(CHAVE_ESTADO, JSON.stringify({
          id: config.musica_inicial_id,
          tempo: audio.currentTime,
          atualizadoEm: Date.now()
        }));
      }
    });
  }

  function iniciarMusicaPrincipalSeAplicavel() {
    const telas = (config.musica_telas || '').split(',').map((s) => s.trim()).filter(Boolean);
    const deveExistir = !!config.musica_inicial_id && telas.includes(telaAtual());
    if (!deveExistir) return;

    principal = criarPrincipal();
    if (!principal) return;

    retomarPosicaoSalva(principal);
    iniciarPersistenciaDeEstado(principal);

    if (config.musica_inicial_ativa === '1' && ligada) {
      principal.play()
        .then(() => fadeTo(principal, volumeUsuario01(), fadeMs))
        .catch(() => mostrarPromptAtivar()); // política de autoplay do navegador bloqueou
    }
  }

  /* ------------------------------------------------------------------
     API pública
  ------------------------------------------------------------------ */
  function alternar() {
    ligada = !ligada;
    gravarLocalStorage(CHAVE_LIGADA, ligada ? '1' : '0');
    const btn = document.getElementById('musicaBtnToggle');
    if (btn) btn.textContent = ligada ? '🔊' : '🔇';

    if (ligada) {
      if (principal) {
        principal.play().then(() => fadeTo(principal, secundario ? volumeUsuario01() * 0.15 : volumeUsuario01(), fadeMs)).catch(() => mostrarPromptAtivar());
      }
      if (secundario) {
        secundario.play().then(() => fadeTo(secundario, volumeUsuario01(), fadeMs)).catch(() => {});
      }
    } else {
      if (principal) fadeTo(principal, 0, fadeMs, () => principal && principal.pause());
      if (secundario) fadeTo(secundario, 0, fadeMs, () => secundario && secundario.pause());
    }
  }

  function definirVolume(percentual) {
    percentual = Math.min(100, Math.max(0, Number(percentual) || 0));
    gravarLocalStorage(CHAVE_VOLUME, String(percentual));
    const alvo01 = percentual / 100;
    if (principal && ligada) principal.volume = secundario ? alvo01 * 0.15 : alvo01;
    if (secundario && ligada) secundario.volume = alvo01;
  }

  function tocarSecundaria(musicaId) {
    if (!musicaId) return;
    if (!pronto) { filaSecundaria = () => tocarSecundaria(musicaId); return; }
    if (secundarioId && String(secundarioId) === String(musicaId)) return; // já tocando

    // troca imediata de uma secundária para outra (sem restaurar a principal no meio)
    if (secundario) {
      const antigo = secundario;
      fadeTo(antigo, 0, fadeMs / 2, () => antigo.pause());
    }

    secundarioId = musicaId;
    const novo = new Audio(`/api/public/musicas/${musicaId}/arquivo`);
    novo.loop = true;
    novo.volume = 0;
    secundario = novo;

    if (principal && ligada) fadeTo(principal, volumeUsuario01() * 0.15, fadeMs);

    if (ligada) {
      novo.play().then(() => fadeTo(novo, volumeUsuario01(), fadeMs)).catch(() => {});
    }
  }

  function pararSecundaria() {
    if (!pronto) { filaSecundaria = null; return; }
    if (!secundario) return;
    const atual = secundario;
    secundario = null;
    secundarioId = null;
    fadeTo(atual, 0, fadeMs, () => atual.pause());
    if (principal && ligada) fadeTo(principal, volumeUsuario01(), fadeMs);
  }

  /* ------------------------------------------------------------------
     Inicialização
  ------------------------------------------------------------------ */
  async function iniciar() {
    ligada = lerLocalStorage(CHAVE_LIGADA, '1') === '1';

    try {
      const resp = await fetch('/api/public/config', { credentials: 'same-origin' });
      config = resp.ok ? await resp.json() : {};
    } catch (e) {
      config = {};
    }

    fadeMs = Number(config.musica_fade_ms) || 1500;

    construirWidget();

    const tela = telaAtual();
    if (tela === 'login' || tela === 'portal') {
      iniciarMusicaPrincipalSeAplicavel();
    }

    pronto = true;
    if (filaSecundaria) { const f = filaSecundaria; filaSecundaria = null; f(); }
  }

  document.addEventListener('DOMContentLoaded', iniciar);

  return { tocarSecundaria, pararSecundaria, alternar, definirVolume };
})();

window.MusicaSistema = MusicaSistema;
