/* =======================================================================
   B.I.P. — SCRIPT DO PORTAL DO AGENTE
   ======================================================================= */

let SESSAO = null;
let CATEGORIAS = [];

if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

/* -----------------------------------------------------------------------
   VISUALIZADOR MODERNO DE PDF — zoom, troca de páginas e tela cheia.
   Carrega o PDF sob demanda (só quando o documento é aberto) e mantém a
   mesma aparência do resto do site (usa as classes do style.css).
------------------------------------------------------------------------ */
async function renderizarPdfCompleto(url, wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap || !window.pdfjsLib) return;

  wrap.innerHTML = '<p class="pdf-carregando">Carregando documento…</p>';

  let pdf;
  try {
    pdf = await pdfjsLib.getDocument(url).promise;
  } catch (e) {
    wrap.innerHTML = '<p class="tabela-vazia">Não foi possível carregar o PDF.</p>';
    return;
  }

  const estado = { pagina: 1, escala: 1.3, totalPaginas: pdf.numPages };

  wrap.innerHTML = `
    <div class="pdf-toolbar">
      <button type="button" id="pdfAnterior" title="Página anterior">◀</button>
      <span id="pdfPaginaAtual">Página 1 de ${estado.totalPaginas}</span>
      <button type="button" id="pdfProxima" title="Próxima página">▶</button>
      <button type="button" id="pdfZoomMenos" title="Diminuir zoom">－</button>
      <span id="pdfZoomLabel">130%</span>
      <button type="button" id="pdfZoomMais" title="Aumentar zoom">＋</button>
      <button type="button" id="pdfTelaCheia" title="Tela cheia">⛶ Tela cheia</button>
    </div>
    <div class="pdf-canvas-wrap" id="pdfCanvasWrap"><canvas id="pdfCanvasReal"></canvas></div>
  `;

  const canvas = document.getElementById('pdfCanvasReal');
  const canvasWrap = document.getElementById('pdfCanvasWrap');
  let renderizando = false;

  async function renderizarPagina() {
    if (renderizando) return;
    renderizando = true;
    const pagina = await pdf.getPage(estado.pagina);
    const viewport = pagina.getViewport({ scale: estado.escala });
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await pagina.render({ canvasContext: ctx, viewport }).promise;
    renderizando = false;

    document.getElementById('pdfPaginaAtual').textContent = `Página ${estado.pagina} de ${estado.totalPaginas}`;
    document.getElementById('pdfZoomLabel').textContent = `${Math.round(estado.escala / 1.3 * 100)}%`;
    document.getElementById('pdfAnterior').disabled = estado.pagina <= 1;
    document.getElementById('pdfProxima').disabled = estado.pagina >= estado.totalPaginas;
  }

  document.getElementById('pdfAnterior').addEventListener('click', () => {
    if (estado.pagina > 1) { estado.pagina--; renderizarPagina(); }
  });
  document.getElementById('pdfProxima').addEventListener('click', () => {
    if (estado.pagina < estado.totalPaginas) { estado.pagina++; renderizarPagina(); }
  });
  document.getElementById('pdfZoomMenos').addEventListener('click', () => {
    estado.escala = Math.max(0.5, estado.escala - 0.25);
    renderizarPagina();
  });
  document.getElementById('pdfZoomMais').addEventListener('click', () => {
    estado.escala = Math.min(4, estado.escala + 0.25);
    renderizarPagina();
  });
  document.getElementById('pdfTelaCheia').addEventListener('click', () => {
    canvasWrap.classList.toggle('pdf-tela-cheia');
  });

  await renderizarPagina();
}

/* -----------------------------------------------------------------------
   INICIALIZAÇÃO
------------------------------------------------------------------------ */
(async function iniciar() {
  try {
    SESSAO = await apiFetch('/api/auth/me');
  } catch (e) {
    return; // apiFetch já redireciona em 401
  }

  if (SESSAO.tipo === 'admin') {
    window.location.href = '/admin.html';
    return;
  }

  document.getElementById('agentName').textContent =
    (SESSAO.agente && (SESSAO.agente.codinome || SESSAO.agente.nome)) || SESSAO.usuario;
  document.getElementById('agentLevel').textContent =
    NOMES_NIVEL[SESSAO.agente ? SESSAO.agente.nivel_autorizacao : 1] || '—';

  configurarNavegacao();
  configurarModal();

  CATEGORIAS = await apiFetch('/api/portal/categorias');
  const selCat = document.getElementById('filtroCategoriaDoc');
  CATEGORIAS.forEach((c) => {
    const opt = document.createElement('option');
    opt.value = c.id; opt.textContent = c.nome;
    selCat.appendChild(opt);
  });

  await carregarDashboard();
  await carregarCasos();
  await carregarDocumentos();
  await carregarMensagens();
  await carregarDownloads();
  await carregarPerfil();

  document.getElementById('buscaCasos').addEventListener('input', debounce(carregarCasos, 350));
  document.getElementById('buscaDocumentos').addEventListener('input', debounce(carregarDocumentos, 350));
  document.getElementById('filtroCategoriaDoc').addEventListener('change', carregarDocumentos);
  document.getElementById('filtroClassificacao').addEventListener('change', carregarDocumentos);
  document.getElementById('btnBuscarBanco').addEventListener('click', buscarBanco);
  document.getElementById('buscaBanco').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscarBanco();
  });
  document.getElementById('btnLogout').addEventListener('click', logout);
})();

function debounce(fn, ms) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

/* -----------------------------------------------------------------------
   NAVEGAÇÃO ENTRE ABAS
------------------------------------------------------------------------ */
function configurarNavegacao() {
  const botoes = document.querySelectorAll('.nav-btn');
  botoes.forEach((btn) => {
    btn.addEventListener('click', () => {
      botoes.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
      document.getElementById('painel-' + btn.dataset.target).classList.add('active');
    });
  });
}

/* -----------------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------------ */
async function carregarDashboard() {
  const dados = await apiFetch('/api/portal/dashboard');
  const cards = document.querySelectorAll('#dashboardStats .stat-card .stat-num');
  cards[0].textContent = dados.casos;
  cards[1].textContent = dados.documentos;
  cards[2].textContent = dados.mensagensNaoLidas;
}

/* -----------------------------------------------------------------------
   CASOS
------------------------------------------------------------------------ */
async function carregarCasos() {
  const q = document.getElementById('buscaCasos').value.trim();
  const params = new URLSearchParams();
  if (q) params.set('q', q);

  const casos = await apiFetch('/api/portal/casos?' + params.toString());
  const tbody = document.getElementById('tabelaCasos');

  if (!casos.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="tabela-vazia">Nenhum caso encontrado dentro do seu nível de autorização.</td></tr>';
    return;
  }

  tbody.innerHTML = casos.map((c) => `
    <tr>
      <td>${escapeHtml(c.codigo)}</td>
      <td>${escapeHtml(c.titulo)}</td>
      <td>${escapeHtml(c.categoria_nome || '—')}</td>
      <td>${escapeHtml(c.status)}</td>
      <td>${badgeNivel(c.nivel_autorizacao)}</td>
      <td>${escapeHtml(c.responsavel_codinome || '—')}</td>
      <td class="col-acoes"><button class="btn-icon" onclick="verCaso(${c.id})" title="Visualizar">👁</button></td>
    </tr>
  `).join('');
}

async function verCaso(id) {
  try {
    const caso = await apiFetch('/api/portal/casos/' + id);
    if (caso.musica_id && window.MusicaSistema) MusicaSistema.tocarSecundaria(caso.musica_id);
    abrirModal(`CASO — ${caso.codigo}`, `
      <p style="margin-bottom:10px;">${badgeNivel(caso.nivel_autorizacao)} <span class="badge-status ativo">${escapeHtml(caso.status)}</span></p>
      <h3 style="font-family:var(--fonte-display); font-size:15px; margin-bottom:10px;">${escapeHtml(caso.titulo)}</h3>
      <p class="conteudo-rico">${escapeHtml(caso.descricao || 'Sem descrição.')}</p>
      ${caso.observacoes ? `<p class="conteudo-rico" style="margin-top:10px;"><strong>Observações:</strong> ${escapeHtml(caso.observacoes)}</p>` : ''}
      <h4 style="margin-top:16px; color:var(--verde-neon); font-size:12px; letter-spacing:1px;">ANEXOS</h4>
      ${caso.anexos.length ? `<ul>${caso.anexos.map(a => `<li>${escapeHtml(a.nome_original)}</li>`).join('')}</ul>` : '<p class="tabela-vazia">Nenhum anexo.</p>'}
    `);
  } catch (e) {
    mostrarToast(e.message, 'erro');
  }
}

/* -----------------------------------------------------------------------
   DOCUMENTOS
------------------------------------------------------------------------ */
async function carregarDocumentos() {
  const q = document.getElementById('buscaDocumentos').value.trim();
  const categoria = document.getElementById('filtroCategoriaDoc').value;
  const classificacao = document.getElementById('filtroClassificacao').value;

  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (categoria) params.set('categoria', categoria);
  if (classificacao) params.set('classificacao', classificacao);

  const docs = await apiFetch('/api/portal/documentos?' + params.toString());
  renderizarListaDocumentos('listaDocumentos', docs);
}

function renderizarListaDocumentos(containerId, docs) {
  const container = document.getElementById(containerId);
  if (!docs.length) {
    container.innerHTML = '<p class="tabela-vazia">Nenhum documento disponível.</p>';
    return;
  }
  container.innerHTML = docs.map((d) => `
    <div class="doc-card">
      ${d.imagem_capa ? `<img class="doc-card-capa" src="/api/portal/documentos/${d.id}/capa" alt="Capa de ${escapeHtml(d.titulo)}">` : ''}
      <div class="doc-card-info">
        <div class="doc-card-title">${escapeHtml(d.titulo)}</div>
        <div class="doc-card-meta">
          <span>#${escapeHtml(d.codigo)}</span>
          <span>${escapeHtml(d.categoria_nome || 'Sem categoria')}</span>
          <span>${escapeHtml(d.autor || 'Autor desconhecido')}</span>
          <span>${formatarData(d.criado_em)}</span>
          ${badgeNivel(d.nivel_autorizacao)}
        </div>
      </div>
      <div class="doc-card-actions">
        <button class="btn-secundario" onclick="visualizarDocumento(${d.id})">Visualizar</button>
        ${d.permitir_download ? `<button class="btn-primario" onclick="baixarDocumento(${d.id})">Download</button>` : ''}
      </div>
    </div>
  `).join('');
}

async function visualizarDocumento(id) {
  try {
    const doc = await apiFetch('/api/portal/documentos/' + id);
    if (doc.musica_id && window.MusicaSistema) MusicaSistema.tocarSecundaria(doc.musica_id);

    let corpo = '';
    const wrapId = `pdfWrap-${id}`;

    if (doc.tipo_arquivo === 'rico') {
      corpo = `<div class="conteudo-rico">${doc.conteudo_rico}</div>`;
    } else if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(doc.tipo_arquivo)) {
      corpo = `<div class="visualizador-wrap"><img src="/api/portal/documentos/${id}/arquivo" alt="${escapeHtml(doc.titulo)}"></div>`;
    } else if (['mp3', 'wav', 'ogg'].includes(doc.tipo_arquivo)) {
      corpo = `<div class="visualizador-wrap"><audio controls src="/api/portal/documentos/${id}/arquivo"></audio></div>`;
    } else if (['mp4', 'webm'].includes(doc.tipo_arquivo)) {
      corpo = `<div class="visualizador-wrap"><video controls src="/api/portal/documentos/${id}/arquivo"></video></div>`;
    } else if (doc.tipo_arquivo === 'pdf') {
      // Visualizador moderno (zoom, páginas, tela cheia) — carregado sob demanda.
      corpo = `<div class="visualizador-wrap" id="${wrapId}"><p class="pdf-carregando">Carregando documento…</p></div>`;
      setTimeout(() => renderizarPdfCompleto(`/api/portal/documentos/${id}/arquivo`, wrapId), 50);
    } else if (doc.tipo_arquivo === 'txt') {
      const resp = await fetch(`/api/portal/documentos/${id}/arquivo`, { credentials: 'same-origin' });
      const texto = await resp.text();
      corpo = `<div class="visualizador-wrap"><pre style="white-space:pre-wrap;color:#dcdcdc;">${escapeHtml(texto)}</pre></div>`;
    } else {
      corpo = `<div class="visualizador-wrap"><p class="tabela-vazia">Tipo de arquivo sem pré-visualização direta: ${escapeHtml(doc.tipo_arquivo || '—')}</p></div>`;
    }

    abrirModal(`${doc.codigo} — ${doc.titulo}`, `
      ${doc.imagem_capa ? `<img class="doc-capa-grande" src="/api/portal/documentos/${id}/capa" alt="Capa">` : ''}
      <p style="margin-bottom:10px;">${badgeNivel(doc.nivel_autorizacao)}</p>
      <p class="conteudo-rico" style="margin-bottom:14px;">${escapeHtml(doc.descricao || '')}</p>
      ${corpo}
      ${doc.permitir_download ? `<div style="margin-top:14px; text-align:right;"><button class="btn-primario" onclick="baixarDocumento(${id})">⬇ Baixar Documento</button></div>` : ''}
      ${doc.tags && doc.tags.length ? `<p style="margin-top:12px; font-size:11px; color:#888;">TAGS: ${doc.tags.map(escapeHtml).join(', ')}</p>` : ''}
    `, true);
  } catch (e) {
    mostrarToast(e.message, 'erro');
  }
}

function baixarDocumento(id) {
  window.open('/api/portal/documentos/' + id + '/download', '_blank');
}

/* -----------------------------------------------------------------------
   BANCO DE DADOS (busca unificada em casos + documentos)
------------------------------------------------------------------------ */
async function buscarBanco() {
  const q = document.getElementById('buscaBanco').value.trim();
  const container = document.getElementById('resultadosBanco');
  if (!q) {
    container.innerHTML = '<p class="tabela-vazia">Digite um termo e clique em Consultar.</p>';
    return;
  }

  container.innerHTML = '<p class="tabela-vazia">Consultando...</p>';
  const params = new URLSearchParams({ q });
  const [casos, docs] = await Promise.all([
    apiFetch('/api/portal/casos?' + params.toString()),
    apiFetch('/api/portal/documentos?' + params.toString())
  ]);

  if (!casos.length && !docs.length) {
    container.innerHTML = '<p class="tabela-vazia">Nenhum resultado encontrado dentro do seu nível de autorização.</p>';
    return;
  }

  let html = '';
  if (casos.length) {
    html += `<h4 style="color:var(--verde-neon); font-size:12px; letter-spacing:1px; margin-bottom:10px;">CASOS (${casos.length})</h4>`;
    html += `<div class="doc-list" style="margin-bottom:24px;">` + casos.map((c) => `
      <div class="doc-card">
        <div class="doc-card-info">
          <div class="doc-card-title">${escapeHtml(c.titulo)}</div>
          <div class="doc-card-meta"><span>#${escapeHtml(c.codigo)}</span>${badgeNivel(c.nivel_autorizacao)}</div>
        </div>
        <div class="doc-card-actions"><button class="btn-secundario" onclick="verCaso(${c.id})">Visualizar</button></div>
      </div>`).join('') + `</div>`;
  }
  if (docs.length) {
    html += `<h4 style="color:var(--verde-neon); font-size:12px; letter-spacing:1px; margin-bottom:10px;">DOCUMENTOS (${docs.length})</h4>`;
    html += `<div class="doc-list">` + docs.map((d) => `
      <div class="doc-card">
        <div class="doc-card-info">
          <div class="doc-card-title">${escapeHtml(d.titulo)}</div>
          <div class="doc-card-meta"><span>#${escapeHtml(d.codigo)}</span>${badgeNivel(d.nivel_autorizacao)}</div>
        </div>
        <div class="doc-card-actions"><button class="btn-secundario" onclick="visualizarDocumento(${d.id})">Visualizar</button></div>
      </div>`).join('') + `</div>`;
  }
  container.innerHTML = html;
}

/* -----------------------------------------------------------------------
   MENSAGENS
------------------------------------------------------------------------ */
async function carregarMensagens() {
  const msgs = await apiFetch('/api/portal/mensagens');
  const container = document.getElementById('listaMensagens');
  if (!msgs.length) {
    container.innerHTML = '<p class="tabela-vazia">Nenhuma mensagem recebida.</p>';
    return;
  }
  container.innerHTML = msgs.map((m) => `
    <div class="doc-card">
      <div class="doc-card-info">
        <div class="doc-card-title">${m.lida ? '' : '🔴 '}${escapeHtml(m.assunto)}</div>
        <div class="doc-card-meta"><span>${escapeHtml(m.remetente_codinome || 'BRANCH — Administração')}</span><span>${formatarData(m.criado_em)}</span></div>
        <p class="conteudo-rico" style="margin-top:8px;">${escapeHtml(m.corpo || '')}</p>
      </div>
      ${!m.lida ? `<div class="doc-card-actions"><button class="btn-secundario" onclick="marcarLida(${m.id})">Marcar como lida</button></div>` : ''}
    </div>
  `).join('');
}

async function marcarLida(id) {
  await apiFetch('/api/portal/mensagens/' + id + '/marcar-lida', { method: 'POST' });
  await carregarMensagens();
  await carregarDashboard();
}

/* -----------------------------------------------------------------------
   DOWNLOADS (documentos com download permitido)
------------------------------------------------------------------------ */
async function carregarDownloads() {
  const docs = await apiFetch('/api/portal/documentos');
  renderizarListaDocumentos('listaDownloads', docs.filter((d) => d.permitir_download));
}

/* -----------------------------------------------------------------------
   PERFIL
------------------------------------------------------------------------ */
async function carregarPerfil() {
  const container = document.getElementById('perfilConteudo');
  const a = SESSAO.agente;
  if (!a) { container.innerHTML = '<p>Perfil indisponível.</p>'; return; }

  container.innerHTML = `
    ${a.foto ? `<img src="/uploads/${escapeHtml(a.foto)}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;margin-bottom:14px;border:2px solid var(--verde-militar);">` : ''}
    <p><strong>Nome:</strong> ${escapeHtml(a.nome)}</p>
    <p><strong>Codinome:</strong> ${escapeHtml(a.codinome || '—')}</p>
    <p><strong>Cargo:</strong> ${escapeHtml(a.cargo || '—')}</p>
    <p><strong>Status:</strong> <span class="badge-status ativo">${escapeHtml(a.status)}</span></p>
    <p style="margin-top:8px;"><strong>Nível de autorização:</strong> ${badgeNivel(a.nivel_autorizacao)}</p>
  `;
}

/* -----------------------------------------------------------------------
   MODAL
------------------------------------------------------------------------ */
function configurarModal() {
  document.getElementById('modalDocFechar').addEventListener('click', fecharModal);
  document.getElementById('modalDocumento').addEventListener('click', (e) => {
    if (e.target.id === 'modalDocumento') fecharModal();
  });
}
function abrirModal(titulo, corpoHtml) {
  document.getElementById('modalDocTitulo').textContent = titulo;
  document.getElementById('modalDocCorpo').innerHTML = corpoHtml;
  document.getElementById('modalDocumento').classList.add('show');
}
function fecharModal() {
  document.getElementById('modalDocumento').classList.remove('show');
  // Ao fechar o documento/caso, a música secundária (se houver) para e a
  // música principal volta ao volume normal.
  if (window.MusicaSistema) MusicaSistema.pararSecundaria();
}
