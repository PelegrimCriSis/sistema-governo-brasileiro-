/* =======================================================================
   B.I.P. — SCRIPT DO PAINEL ADMINISTRATIVO
   ======================================================================= */

let SESSAO = null;
let CATEGORIAS = [];
let AGENTES_CACHE = [];
let MUSICAS_CACHE = [];

/* -----------------------------------------------------------------------
   INICIALIZAÇÃO
------------------------------------------------------------------------ */
(async function iniciar() {
  try {
    SESSAO = await apiFetch('/api/auth/me');
  } catch (e) { return; }

  if (SESSAO.tipo !== 'admin') {
    window.location.href = '/portal.html';
    return;
  }

  document.getElementById('adminName').textContent = SESSAO.usuario;
  configurarNavegacao();
  configurarModal();
  document.getElementById('btnLogout').addEventListener('click', logout);

  await recarregarCategorias();
  await recarregarMusicas();
  await carregarDashboard();
  await carregarAgentes();
  await carregarCasos();
  await carregarDocumentos();
  await carregarCategoriasTabela();
  await carregarTags();
  await carregarMusicasTabela();
  await carregarMensagens();
  await carregarLogs();
  await carregarConfiguracoes();

  ligarEventosEstáticos();
})();

function configurarNavegacao() {
  const botoes = document.querySelectorAll('.admin-menu-btn');
  botoes.forEach((btn) => {
    btn.addEventListener('click', () => {
      botoes.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      document.querySelectorAll('.admin-content .tab-panel').forEach((p) => p.classList.remove('active'));
      document.getElementById('painel-' + btn.dataset.target).classList.add('active');
    });
  });
}

async function recarregarCategorias() {
  CATEGORIAS = await apiFetch('/api/admin/categorias');
}

async function recarregarMusicas() {
  MUSICAS_CACHE = await apiFetch('/api/admin/musicas');
}

function opcoesMusicaSelect(valorSelecionado) {
  return `<option value="">— Nenhuma —</option>` + MUSICAS_CACHE.map((m) =>
    `<option value="${m.id}" ${Number(valorSelecionado) === m.id ? 'selected' : ''}>${escapeHtml(m.nome)}</option>`
  ).join('');
}

/* -----------------------------------------------------------------------
   MODAL GENÉRICO
------------------------------------------------------------------------ */
function configurarModal() {
  document.getElementById('modalFechar').addEventListener('click', fecharModal);
  document.getElementById('modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') fecharModal();
  });

  // Correção: os dropzones de arquivo (anexos, upload de documento, capa)
  // não abriam o seletor de arquivo ao clicar. Delegação de evento cobre
  // qualquer dropzone, mesmo as criadas dinamicamente dentro do modal.
  document.addEventListener('click', (e) => {
    const dz = e.target.closest('.dropzone');
    if (!dz) return;
    const input = dz.querySelector('input[type="file"]');
    if (input) input.click();
  });
}
function abrirModal(titulo, corpoHtml, largo = false) {
  document.getElementById('modalTitulo').textContent = titulo;
  document.getElementById('modalCorpo').innerHTML = corpoHtml;
  document.getElementById('modalBox').classList.toggle('modal-lg', largo);
  document.getElementById('modal').classList.add('show');
}
function fecharModal() {
  document.getElementById('modal').classList.remove('show');
  document.getElementById('modalCorpo').innerHTML = '';
}

function opcoesNivelSelect(valorSelecionado) {
  return [1, 2, 3, 4, 5].map((n) =>
    `<option value="${n}" ${Number(valorSelecionado) === n ? 'selected' : ''}>${NOMES_NIVEL[n]}</option>`
  ).join('');
}

/* -----------------------------------------------------------------------
   DASHBOARD
------------------------------------------------------------------------ */
async function carregarDashboard() {
  const [agentes, casos, docs, logs] = await Promise.all([
    apiFetch('/api/admin/agentes'),
    apiFetch('/api/admin/casos'),
    apiFetch('/api/admin/documentos'),
    apiFetch('/api/admin/logs?limite=1000')
  ]);
  const agora = Date.now();
  const logs24h = logs.filter((l) => agora - new Date(l.criado_em.replace(' ', 'T')).getTime() < 86400000).length;

  const nums = document.querySelectorAll('#statsAdmin .stat-num');
  nums[0].textContent = agentes.length;
  nums[1].textContent = casos.length;
  nums[2].textContent = docs.length;
  nums[3].textContent = logs24h;
}

/* -----------------------------------------------------------------------
   AGENTES
------------------------------------------------------------------------ */
async function carregarAgentes() {
  AGENTES_CACHE = await apiFetch('/api/admin/agentes');
  const tbody = document.getElementById('tabelaAgentes');
  if (!AGENTES_CACHE.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="tabela-vazia">Nenhum agente cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = AGENTES_CACHE.map((a) => `
    <tr>
      <td>${escapeHtml(a.nome)}</td>
      <td>${escapeHtml(a.codinome || '—')}</td>
      <td>${escapeHtml(a.usuario)}</td>
      <td>${escapeHtml(a.cargo || '—')}</td>
      <td>${badgeNivel(a.nivel_autorizacao)}</td>
      <td>${escapeHtml(a.status)}</td>
      <td><span class="badge-status ${a.ativo ? 'ativo' : 'inativo'}">${a.ativo ? 'Sim' : 'Não'}</span></td>
      <td class="col-acoes">
        <button class="btn-icon" onclick="abrirEditarAgente(${a.id})" title="Editar">✎</button>
        <button class="btn-icon perigo" onclick="removerAgente(${a.id}, '${escapeHtml(a.nome)}')" title="Remover">🗑</button>
      </td>
    </tr>
  `).join('');
}

function formularioAgente(agente) {
  const editando = !!agente;
  return `
    <form id="formAgente" class="form-grid">
      <div class="form-field"><label>Nome completo *</label><input type="text" id="agNome" required value="${agente ? escapeHtml(agente.nome) : ''}"></div>
      <div class="form-field"><label>Codinome</label><input type="text" id="agCodinome" value="${agente ? escapeHtml(agente.codinome || '') : ''}"></div>
      <div class="form-field"><label>Cargo</label><input type="text" id="agCargo" value="${agente ? escapeHtml(agente.cargo || '') : ''}"></div>
      <div class="form-field"><label>Nível de autorização</label><select id="agNivel">${opcoesNivelSelect(agente ? agente.nivel_autorizacao : 1)}</select></div>
      <div class="form-field"><label>Status</label>
        <select id="agStatus">
          <option value="Ativo" ${agente && agente.status === 'Ativo' ? 'selected' : ''}>Ativo</option>
          <option value="Inativo" ${agente && agente.status === 'Inativo' ? 'selected' : ''}>Inativo</option>
          <option value="Desaparecido" ${agente && agente.status === 'Desaparecido' ? 'selected' : ''}>Desaparecido</option>
          <option value="KIA" ${agente && agente.status === 'KIA' ? 'selected' : ''}>KIA</option>
        </select>
      </div>
      <div class="form-field"><label>Usuário de login *</label><input type="text" id="agUsuario" required ${editando ? 'readonly' : ''} value="${agente ? escapeHtml(agente.usuario) : ''}"></div>
      <div class="form-field"><label>${editando ? 'Nova senha (deixe em branco p/ manter)' : 'Senha *'}</label><input type="password" id="agSenha" ${editando ? '' : 'required'}></div>
      <div class="form-field full"><label>Observações</label><textarea id="agObs" rows="3">${agente ? escapeHtml(agente.observacoes || '') : ''}</textarea></div>
      ${editando ? `<div class="form-field"><label class="form-checkbox"><input type="checkbox" id="agAtivo" ${agente.ativo ? 'checked' : ''}> Login ativo</label></div>` : ''}
      <div class="form-field full"><label>Foto (opcional)</label><input type="file" id="agFoto" accept=".png,.jpg,.jpeg,.webp,.gif"></div>
      <div class="form-actions full">
        <button type="button" class="btn-secundario" onclick="fecharModal()">Cancelar</button>
        <button type="submit" class="btn-primario">${editando ? 'Salvar alterações' : 'Cadastrar agente'}</button>
      </div>
    </form>
  `;
}

document.addEventListener('click', (e) => {
  if (e.target.id === 'btnNovoAgente') {
    abrirModal('NOVO AGENTE', formularioAgente(null));
    document.getElementById('formAgente').addEventListener('submit', salvarNovoAgente);
  }
});

async function salvarNovoAgente(e) {
  e.preventDefault();
  try {
    const info = await apiFetch('/api/admin/agentes', {
      method: 'POST',
      body: JSON.stringify({
        usuario: document.getElementById('agUsuario').value.trim(),
        senha: document.getElementById('agSenha').value,
        nome: document.getElementById('agNome').value.trim(),
        codinome: document.getElementById('agCodinome').value.trim(),
        cargo: document.getElementById('agCargo').value.trim(),
        nivel_autorizacao: document.getElementById('agNivel').value,
        status: document.getElementById('agStatus').value,
        observacoes: document.getElementById('agObs').value.trim()
      })
    });

    const arquivoFoto = document.getElementById('agFoto').files[0];
    if (arquivoFoto) await enviarFotoAgente(info.id, arquivoFoto);

    mostrarToast('Agente cadastrado com sucesso.');
    fecharModal();
    await carregarAgentes();
    await carregarDashboard();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function enviarFotoAgente(agenteId, arquivo) {
  const fd = new FormData();
  fd.append('foto', arquivo);
  await apiFetch(`/api/admin/agentes/${agenteId}/foto`, { method: 'POST', body: fd });
}

function abrirEditarAgente(id) {
  const agente = AGENTES_CACHE.find((a) => a.id === id);
  if (!agente) return;
  abrirModal('EDITAR AGENTE', formularioAgente(agente));
  document.getElementById('formAgente').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch(`/api/admin/agentes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          nome: document.getElementById('agNome').value.trim(),
          codinome: document.getElementById('agCodinome').value.trim(),
          cargo: document.getElementById('agCargo').value.trim(),
          nivel_autorizacao: document.getElementById('agNivel').value,
          status: document.getElementById('agStatus').value,
          observacoes: document.getElementById('agObs').value.trim(),
          novaSenha: document.getElementById('agSenha').value || undefined,
          ativo: document.getElementById('agAtivo').checked
        })
      });
      const arquivoFoto = document.getElementById('agFoto').files[0];
      if (arquivoFoto) await enviarFotoAgente(id, arquivoFoto);

      mostrarToast('Agente atualizado.');
      fecharModal();
      await carregarAgentes();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

async function removerAgente(id, nome) {
  if (!confirm(`Remover o agente "${nome}"? Isso também apaga o login dele. Essa ação não pode ser desfeita.`)) return;
  try {
    await apiFetch(`/api/admin/agentes/${id}`, { method: 'DELETE' });
    mostrarToast('Agente removido.');
    await carregarAgentes();
    await carregarDashboard();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

/* -----------------------------------------------------------------------
   CASOS
------------------------------------------------------------------------ */
let CASOS_CACHE = [];

async function carregarCasos() {
  CASOS_CACHE = await apiFetch('/api/admin/casos');
  const tbody = document.getElementById('tabelaCasos');
  if (!CASOS_CACHE.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="tabela-vazia">Nenhum caso cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = CASOS_CACHE.map((c) => `
    <tr>
      <td>${escapeHtml(c.codigo)}</td>
      <td>${escapeHtml(c.titulo)}</td>
      <td>${escapeHtml(c.categoria_nome || '—')}</td>
      <td>${escapeHtml(c.responsavel_codinome || '—')}</td>
      <td>${escapeHtml(c.status)}</td>
      <td>${badgeNivel(c.nivel_autorizacao)}</td>
      <td class="col-acoes">
        <button class="btn-icon" onclick="abrirEditarCaso(${c.id})" title="Editar">✎</button>
        <button class="btn-icon" onclick="gerenciarAnexos(${c.id})" title="Anexos">📎</button>
        <button class="btn-icon perigo" onclick="removerCaso(${c.id}, '${escapeHtml(c.codigo)}')" title="Remover">🗑</button>
      </td>
    </tr>
  `).join('');
}

function opcoesCategoriaSelect(valorSelecionado) {
  return `<option value="">— Nenhuma —</option>` + CATEGORIAS.map((c) =>
    `<option value="${c.id}" ${Number(valorSelecionado) === c.id ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`
  ).join('');
}
function opcoesAgenteSelect(valorSelecionado) {
  return `<option value="">— Nenhum —</option>` + AGENTES_CACHE.map((a) =>
    `<option value="${a.id}" ${Number(valorSelecionado) === a.id ? 'selected' : ''}>${escapeHtml(a.codinome || a.nome)}</option>`
  ).join('');
}
function opcoesCasoSelect(valorSelecionado) {
  return `<option value="">— Nenhum —</option>` + CASOS_CACHE.map((c) =>
    `<option value="${c.id}" ${Number(valorSelecionado) === c.id ? 'selected' : ''}>${escapeHtml(c.codigo)} — ${escapeHtml(c.titulo)}</option>`
  ).join('');
}

function formularioCaso(caso) {
  const editando = !!caso;
  return `
    <form id="formCaso" class="form-grid">
      <div class="form-field"><label>Código *</label><input type="text" id="csCodigo" required value="${caso ? escapeHtml(caso.codigo) : ''}"></div>
      <div class="form-field"><label>Título *</label><input type="text" id="csTitulo" required value="${caso ? escapeHtml(caso.titulo) : ''}"></div>
      <div class="form-field"><label>Categoria</label><select id="csCategoria">${opcoesCategoriaSelect(caso ? caso.categoria_id : null)}</select></div>
      <div class="form-field"><label>Responsável</label><select id="csResponsavel">${opcoesAgenteSelect(caso ? caso.responsavel_id : null)}</select></div>
      <div class="form-field"><label>Status</label>
        <select id="csStatus">
          <option ${caso && caso.status === 'Em andamento' ? 'selected' : ''}>Em andamento</option>
          <option ${caso && caso.status === 'Concluído' ? 'selected' : ''}>Concluído</option>
          <option ${caso && caso.status === 'Suspenso' ? 'selected' : ''}>Suspenso</option>
          <option ${caso && caso.status === 'Arquivado' ? 'selected' : ''}>Arquivado</option>
        </select>
      </div>
      <div class="form-field"><label>Nível de autorização</label><select id="csNivel">${opcoesNivelSelect(caso ? caso.nivel_autorizacao : 1)}</select></div>
      <div class="form-field"><label>🎵 Música do caso</label><select id="csMusica">${opcoesMusicaSelect(caso ? caso.musica_id : null)}</select></div>
      <div class="form-field full"><label>Descrição</label><textarea id="csDescricao" rows="3">${caso ? escapeHtml(caso.descricao || '') : ''}</textarea></div>
      <div class="form-field full"><label>Observações</label><textarea id="csObservacoes" rows="2">${caso ? escapeHtml(caso.observacoes || '') : ''}</textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn-secundario" onclick="fecharModal()">Cancelar</button>
        <button type="submit" class="btn-primario">${editando ? 'Salvar alterações' : 'Criar caso'}</button>
      </div>
    </form>
  `;
}

function coletarDadosCaso() {
  return {
    codigo: document.getElementById('csCodigo').value.trim(),
    titulo: document.getElementById('csTitulo').value.trim(),
    categoria_id: document.getElementById('csCategoria').value || null,
    responsavel_id: document.getElementById('csResponsavel').value || null,
    status: document.getElementById('csStatus').value,
    nivel_autorizacao: document.getElementById('csNivel').value,
    musica_id: document.getElementById('csMusica').value || null,
    descricao: document.getElementById('csDescricao').value.trim(),
    observacoes: document.getElementById('csObservacoes').value.trim()
  };
}

function abrirEditarCaso(id) {
  const caso = id ? CASOS_CACHE.find((c) => c.id === id) : null;
  abrirModal(id ? 'EDITAR CASO' : 'NOVO CASO', formularioCaso(caso));
  document.getElementById('formCaso').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      if (id) {
        await apiFetch(`/api/admin/casos/${id}`, { method: 'PUT', body: JSON.stringify(coletarDadosCaso()) });
      } else {
        await apiFetch('/api/admin/casos', { method: 'POST', body: JSON.stringify(coletarDadosCaso()) });
      }
      mostrarToast('Caso salvo com sucesso.');
      fecharModal();
      await carregarCasos();
      await carregarDashboard();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

async function removerCaso(id, codigo) {
  if (!confirm(`Remover o caso "${codigo}"? Os anexos também serão apagados.`)) return;
  try {
    await apiFetch(`/api/admin/casos/${id}`, { method: 'DELETE' });
    mostrarToast('Caso removido.');
    await carregarCasos();
    await carregarDashboard();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function gerenciarAnexos(casoId) {
  const caso = await apiFetch(`/api/admin/casos/${casoId}`);
  renderModalAnexos(caso);
}

function renderModalAnexos(caso) {
  abrirModal(`ANEXOS — ${caso.codigo}`, `
    <div class="dropzone" id="dzAnexo">
      <input type="file" id="inputAnexo">
      <span>Clique ou arraste um arquivo para anexar (ilimitado por caso)</span>
    </div>
    <div class="data-table-wrap" style="margin-top:16px;">
      <table class="data-table"><thead><tr><th>Arquivo</th><th>Tipo</th><th>Enviado em</th><th class="col-acoes">Ações</th></tr></thead>
      <tbody id="tabelaAnexos">
        ${caso.anexos.length ? caso.anexos.map((a) => `
          <tr>
            <td>${escapeHtml(a.nome_original)}</td>
            <td>${escapeHtml(a.tipo_arquivo)}</td>
            <td>${formatarData(a.enviado_em)}</td>
            <td class="col-acoes"><button class="btn-icon perigo" onclick="removerAnexo(${a.id}, ${caso.id})" title="Remover">🗑</button></td>
          </tr>`).join('') : '<tr><td colspan="4" class="tabela-vazia">Nenhum anexo.</td></tr>'}
      </tbody></table>
    </div>
  `, true);

  document.getElementById('inputAnexo').addEventListener('change', async (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo) return;
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      await apiFetch(`/api/admin/casos/${caso.id}/anexos`, { method: 'POST', body: fd });
      mostrarToast('Anexo adicionado.');
      const casoAtualizado = await apiFetch(`/api/admin/casos/${caso.id}`);
      renderModalAnexos(casoAtualizado);
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

async function removerAnexo(anexoId, casoId) {
  if (!confirm('Remover este anexo?')) return;
  await apiFetch(`/api/admin/casos/anexos/${anexoId}`, { method: 'DELETE' });
  const casoAtualizado = await apiFetch(`/api/admin/casos/${casoId}`);
  renderModalAnexos(casoAtualizado);
}

/* -----------------------------------------------------------------------
   DOCUMENTOS
------------------------------------------------------------------------ */
let DOCS_CACHE = [];
let quillInstance = null;

async function carregarDocumentos() {
  DOCS_CACHE = await apiFetch('/api/admin/documentos');
  const tbody = document.getElementById('tabelaDocumentos');
  if (!DOCS_CACHE.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="tabela-vazia">Nenhum documento cadastrado.</td></tr>';
    return;
  }
  tbody.innerHTML = DOCS_CACHE.map((d) => `
    <tr>
      <td>${escapeHtml(d.codigo)}</td>
      <td>${escapeHtml(d.titulo)}</td>
      <td>${escapeHtml(d.tipo_arquivo || '—')}</td>
      <td>${badgeNivel(d.nivel_autorizacao)}</td>
      <td>${d.publicado ? '✅' : '❌'}</td>
      <td>${d.oculto ? '✅' : '❌'}</td>
      <td>${d.permitir_download ? '✅' : '❌'}</td>
      <td class="col-acoes">
        <button class="btn-icon" onclick="abrirEditarDocumento(${d.id})" title="Editar">✎</button>
        <button class="btn-icon perigo" onclick="removerDocumento(${d.id}, '${escapeHtml(d.codigo)}')" title="Remover">🗑</button>
      </td>
    </tr>
  `).join('');
}

function camposComunsDocumento(doc) {
  return `
    <div class="form-field"><label>Código *</label><input type="text" id="dcCodigo" required value="${doc ? escapeHtml(doc.codigo) : ''}"></div>
    <div class="form-field"><label>Título *</label><input type="text" id="dcTitulo" required value="${doc ? escapeHtml(doc.titulo) : ''}"></div>
    <div class="form-field"><label>Autor</label><input type="text" id="dcAutor" value="${doc ? escapeHtml(doc.autor || '') : ''}"></div>
    <div class="form-field"><label>Categoria</label><select id="dcCategoria">${opcoesCategoriaSelect(doc ? doc.categoria_id : null)}</select></div>
    <div class="form-field"><label>Caso relacionado</label><select id="dcCaso">${opcoesCasoSelect(doc ? doc.caso_id : null)}</select></div>
    <div class="form-field"><label>Nível de autorização</label><select id="dcNivel">${opcoesNivelSelect(doc ? doc.nivel_autorizacao : 1)}</select></div>
    <div class="form-field"><label>🎵 Música do documento</label><select id="dcMusica">${opcoesMusicaSelect(doc ? doc.musica_id : null)}</select></div>
    <div class="form-field full"><label>Descrição / Resumo</label><textarea id="dcDescricao" rows="2">${doc ? escapeHtml(doc.descricao || '') : ''}</textarea></div>
    <div class="form-field full"><label>Tags (separadas por vírgula)</label><input type="text" id="dcTags" value="${doc && doc.tags ? doc.tags.map(escapeHtml).join(', ') : ''}"></div>
    <div class="form-field"><label class="form-checkbox"><input type="checkbox" id="dcPublicado" ${doc && doc.publicado ? 'checked' : ''}> Publicado</label></div>
    <div class="form-field"><label class="form-checkbox"><input type="checkbox" id="dcOculto" ${doc && doc.oculto ? 'checked' : ''}> Oculto</label></div>
  `;
}

function abrirNovoDocumentoUpload() {
  abrirModal('NOVO DOCUMENTO — UPLOAD', `
    <form id="formDocUpload" class="form-grid" enctype="multipart/form-data">
      ${camposComunsDocumento(null)}
      <div class="form-field"><label class="form-checkbox"><input type="checkbox" id="dcPermitirDownload"> Permitir download</label></div>
      <div class="form-field full">
        <label>Arquivo * (PDF, TXT, PNG, JPG, JPEG, WEBP, GIF, MP3, WAV, OGG, MP4, WEBM)</label>
        <div class="dropzone" id="dzDocUpload">
          <input type="file" id="dcArquivo" required accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.ogg,.mp4,.webm">
          <span>Clique ou arraste o arquivo aqui</span>
          <div class="dropzone-filename" id="nomeArquivoDoc"></div>
        </div>
      </div>
      <div class="form-field full">
        <label>Capa (opcional — útil principalmente para PDFs)</label>
        <div class="dropzone" id="dzDocCapa">
          <input type="file" id="dcCapa" accept=".png,.jpg,.jpeg,.webp">
          <span>Clique ou arraste uma imagem de capa</span>
          <div class="dropzone-filename" id="nomeArquivoCapa"></div>
        </div>
      </div>
      <div class="form-actions full">
        <button type="button" class="btn-secundario" onclick="fecharModal()">Cancelar</button>
        <button type="submit" class="btn-primario">Enviar documento</button>
      </div>
    </form>
  `, true);

  const input = document.getElementById('dcArquivo');
  input.addEventListener('change', () => {
    document.getElementById('nomeArquivoDoc').textContent = input.files[0] ? input.files[0].name : '';
  });
  const inputCapa = document.getElementById('dcCapa');
  inputCapa.addEventListener('change', () => {
    document.getElementById('nomeArquivoCapa').textContent = inputCapa.files[0] ? inputCapa.files[0].name : '';
  });

  document.getElementById('formDocUpload').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const fd = new FormData();
      fd.append('codigo', document.getElementById('dcCodigo').value.trim());
      fd.append('titulo', document.getElementById('dcTitulo').value.trim());
      fd.append('autor', document.getElementById('dcAutor').value.trim());
      fd.append('categoria_id', document.getElementById('dcCategoria').value);
      fd.append('caso_id', document.getElementById('dcCaso').value);
      fd.append('nivel_autorizacao', document.getElementById('dcNivel').value);
      fd.append('musica_id', document.getElementById('dcMusica').value);
      fd.append('descricao', document.getElementById('dcDescricao').value.trim());
      fd.append('tags', document.getElementById('dcTags').value.trim());
      fd.append('publicado', document.getElementById('dcPublicado').checked);
      fd.append('oculto', document.getElementById('dcOculto').checked);
      fd.append('permitir_download', document.getElementById('dcPermitirDownload').checked);
      fd.append('arquivo', document.getElementById('dcArquivo').files[0]);
      if (inputCapa.files[0]) fd.append('capa', inputCapa.files[0]);

      await apiFetch('/api/admin/documentos/upload', { method: 'POST', body: fd });
      mostrarToast('Documento enviado com sucesso.');
      fecharModal();
      await carregarDocumentos();
      await carregarDashboard();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

function abrirNovoDocumentoEditor() {
  abrirModal('NOVO DOCUMENTO — EDITOR RICO', `
    <form id="formDocEditor" class="form-grid">
      ${camposComunsDocumento(null)}
      <div class="form-field full">
        <label>Conteúdo *</label>
        <div id="quillEditor" style="background:#0a0a0a;"></div>
      </div>
      <div class="form-actions full">
        <button type="button" class="btn-secundario" onclick="fecharModal()">Cancelar</button>
        <button type="submit" class="btn-primario">Salvar documento</button>
      </div>
    </form>
  `, true);

  quillInstance = new Quill('#quillEditor', {
    theme: 'snow',
    modules: {
      toolbar: [
        ['bold', 'italic', 'underline'],
        [{ header: [1, 2, 3, false] }],
        [{ list: 'ordered' }, { list: 'bullet' }],
        ['link', 'image', 'code-block'],
        [{ table: true }]
      ]
    }
  });

  document.getElementById('formDocEditor').addEventListener('submit', async (e) => {
    e.preventDefault();
    const conteudo = quillInstance.root.innerHTML;
    if (quillInstance.getText().trim().length === 0) {
      mostrarToast('O conteúdo do documento não pode estar vazio.', 'erro');
      return;
    }
    try {
      await apiFetch('/api/admin/documentos/editor', {
        method: 'POST',
        body: JSON.stringify({
          codigo: document.getElementById('dcCodigo').value.trim(),
          titulo: document.getElementById('dcTitulo').value.trim(),
          autor: document.getElementById('dcAutor').value.trim(),
          categoria_id: document.getElementById('dcCategoria').value || null,
          caso_id: document.getElementById('dcCaso').value || null,
          nivel_autorizacao: document.getElementById('dcNivel').value,
          musica_id: document.getElementById('dcMusica').value || null,
          descricao: document.getElementById('dcDescricao').value.trim(),
          tags: document.getElementById('dcTags').value.split(',').map((t) => t.trim()).filter(Boolean),
          publicado: document.getElementById('dcPublicado').checked,
          oculto: document.getElementById('dcOculto').checked,
          conteudo_rico: conteudo
        })
      });
      mostrarToast('Documento salvo com sucesso.');
      fecharModal();
      await carregarDocumentos();
      await carregarDashboard();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

async function abrirEditarDocumento(id) {
  const doc = await apiFetch(`/api/admin/documentos/${id}`);
  const ehRico = doc.tipo_arquivo === 'rico';

  abrirModal('EDITAR DOCUMENTO', `
    <form id="formDocEdit" class="form-grid">
      ${camposComunsDocumento(doc)}
      ${!ehRico ? `<div class="form-field"><label class="form-checkbox"><input type="checkbox" id="dcPermitirDownload" ${doc.permitir_download ? 'checked' : ''}> Permitir download</label></div>` : ''}
      <div class="form-field full">
        <label>Capa ${doc.imagem_capa ? '(já possui uma — envie outra para substituir)' : '(opcional)'}</label>
        <div class="dropzone" id="dzDocCapaEdit">
          <input type="file" id="dcCapaEdit" accept=".png,.jpg,.jpeg,.webp">
          <span>Clique ou arraste uma imagem de capa</span>
          <div class="dropzone-filename" id="nomeArquivoCapaEdit"></div>
        </div>
      </div>
      ${ehRico ? `<div class="form-field full"><label>Conteúdo</label><div id="quillEditorEdit" style="background:#0a0a0a;"></div></div>` : ''}
      <div class="form-actions full">
        <button type="button" class="btn-secundario" onclick="fecharModal()">Cancelar</button>
        <button type="submit" class="btn-primario">Salvar alterações</button>
      </div>
    </form>
  `, true);

  const inputCapaEdit = document.getElementById('dcCapaEdit');
  inputCapaEdit.addEventListener('change', () => {
    document.getElementById('nomeArquivoCapaEdit').textContent = inputCapaEdit.files[0] ? inputCapaEdit.files[0].name : '';
  });

  if (ehRico) {
    quillInstance = new Quill('#quillEditorEdit', {
      theme: 'snow',
      modules: { toolbar: [['bold', 'italic', 'underline'], [{ header: [1, 2, 3, false] }], [{ list: 'ordered' }, { list: 'bullet' }], ['link', 'image', 'code-block']] }
    });
    quillInstance.root.innerHTML = doc.conteudo_rico || '';
  }

  document.getElementById('formDocEdit').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        codigo: document.getElementById('dcCodigo').value.trim(),
        titulo: document.getElementById('dcTitulo').value.trim(),
        autor: document.getElementById('dcAutor').value.trim(),
        categoria_id: document.getElementById('dcCategoria').value || null,
        caso_id: document.getElementById('dcCaso').value || null,
        nivel_autorizacao: document.getElementById('dcNivel').value,
        musica_id: document.getElementById('dcMusica').value || null,
        descricao: document.getElementById('dcDescricao').value.trim(),
        tags: document.getElementById('dcTags').value.split(',').map((t) => t.trim()).filter(Boolean),
        publicado: document.getElementById('dcPublicado').checked,
        oculto: document.getElementById('dcOculto').checked
      };
      if (!ehRico) payload.permitir_download = document.getElementById('dcPermitirDownload').checked;
      if (ehRico) payload.conteudo_rico = quillInstance.root.innerHTML;

      await apiFetch(`/api/admin/documentos/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

      if (inputCapaEdit.files[0]) {
        const fdCapa = new FormData();
        fdCapa.append('capa', inputCapaEdit.files[0]);
        await apiFetch(`/api/admin/documentos/${id}/capa`, { method: 'POST', body: fdCapa });
      }

      mostrarToast('Documento atualizado.');
      fecharModal();
      await carregarDocumentos();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

async function removerDocumento(id, codigo) {
  if (!confirm(`Remover o documento "${codigo}"? Essa ação não pode ser desfeita.`)) return;
  try {
    await apiFetch(`/api/admin/documentos/${id}`, { method: 'DELETE' });
    mostrarToast('Documento removido.');
    await carregarDocumentos();
    await carregarDashboard();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

/* -----------------------------------------------------------------------
   CATEGORIAS
------------------------------------------------------------------------ */
async function carregarCategoriasTabela() {
  await recarregarCategorias();
  const tbody = document.getElementById('tabelaCategorias');
  tbody.innerHTML = CATEGORIAS.length
    ? CATEGORIAS.map((c) => `
      <tr><td>${escapeHtml(c.nome)}</td>
        <td class="col-acoes"><button class="btn-icon perigo" onclick="removerCategoria(${c.id})" title="Remover">🗑</button></td>
      </tr>`).join('')
    : '<tr><td colspan="2" class="tabela-vazia">Nenhuma categoria cadastrada.</td></tr>';
}

async function removerCategoria(id) {
  if (!confirm('Remover esta categoria?')) return;
  await apiFetch(`/api/admin/categorias/${id}`, { method: 'DELETE' });
  await carregarCategoriasTabela();
}

/* -----------------------------------------------------------------------
   TAGS
------------------------------------------------------------------------ */
async function carregarTags() {
  const tags = await apiFetch('/api/admin/tags');
  const tbody = document.getElementById('tabelaTags');
  tbody.innerHTML = tags.length
    ? tags.map((t) => `
      <tr><td>${escapeHtml(t.nome)}</td>
        <td class="col-acoes"><button class="btn-icon perigo" onclick="removerTag(${t.id})" title="Remover">🗑</button></td>
      </tr>`).join('')
    : '<tr><td colspan="2" class="tabela-vazia">Nenhuma tag cadastrada.</td></tr>';
}
async function removerTag(id) {
  if (!confirm('Remover esta tag?')) return;
  await apiFetch(`/api/admin/tags/${id}`, { method: 'DELETE' });
  await carregarTags();
}

/* -----------------------------------------------------------------------
   MENSAGENS
------------------------------------------------------------------------ */
async function carregarMensagens() {
  const msgs = await apiFetch('/api/admin/mensagens');
  const tbody = document.getElementById('tabelaMensagens');
  tbody.innerHTML = msgs.length
    ? msgs.map((m) => `
      <tr>
        <td>${escapeHtml(m.destinatario_codinome || '—')}</td>
        <td>${escapeHtml(m.assunto)}</td>
        <td>${badgeNivel(m.nivel_autorizacao)}</td>
        <td>${m.lida ? '✅' : '❌'}</td>
        <td>${formatarData(m.criado_em)}</td>
        <td class="col-acoes"><button class="btn-icon perigo" onclick="removerMensagem(${m.id})" title="Remover">🗑</button></td>
      </tr>`).join('')
    : '<tr><td colspan="6" class="tabela-vazia">Nenhuma mensagem enviada.</td></tr>';
}

function abrirNovaMensagem() {
  abrirModal('NOVA MENSAGEM', `
    <form id="formMensagem" class="form-grid">
      <div class="form-field full"><label>Destinatário *</label><select id="msgDestinatario" required>${opcoesAgenteSelect(null)}</select></div>
      <div class="form-field"><label>Nível mínimo para leitura</label><select id="msgNivel">${opcoesNivelSelect(1)}</select></div>
      <div class="form-field full"><label>Assunto *</label><input type="text" id="msgAssunto" required></div>
      <div class="form-field full"><label>Corpo da mensagem</label><textarea id="msgCorpo" rows="4"></textarea></div>
      <div class="form-actions full">
        <button type="button" class="btn-secundario" onclick="fecharModal()">Cancelar</button>
        <button type="submit" class="btn-primario">Enviar</button>
      </div>
    </form>
  `);
  document.getElementById('formMensagem').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/mensagens', {
        method: 'POST',
        body: JSON.stringify({
          destinatario_id: document.getElementById('msgDestinatario').value,
          assunto: document.getElementById('msgAssunto').value.trim(),
          corpo: document.getElementById('msgCorpo').value.trim(),
          nivel_autorizacao: document.getElementById('msgNivel').value
        })
      });
      mostrarToast('Mensagem enviada.');
      fecharModal();
      await carregarMensagens();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}
async function removerMensagem(id) {
  if (!confirm('Remover esta mensagem?')) return;
  await apiFetch(`/api/admin/mensagens/${id}`, { method: 'DELETE' });
  await carregarMensagens();
}

/* -----------------------------------------------------------------------
   LOGS
------------------------------------------------------------------------ */
async function carregarLogs() {
  const tipo = document.getElementById('filtroLogTipo').value;
  const usuario = document.getElementById('filtroLogUsuario').value.trim();
  const params = new URLSearchParams();
  if (tipo) params.set('tipo', tipo);
  if (usuario) params.set('usuario', usuario);

  const logs = await apiFetch('/api/admin/logs?' + params.toString());
  const tbody = document.getElementById('tabelaLogs');
  tbody.innerHTML = logs.length
    ? logs.map((l) => `
      <tr>
        <td>${formatarData(l.criado_em)}</td>
        <td>${escapeHtml(l.usuario_nome || '—')}</td>
        <td>${escapeHtml(l.tipo_acao)}</td>
        <td>${escapeHtml(l.detalhe || '—')}</td>
        <td>${escapeHtml(l.ip || '—')}</td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="tabela-vazia">Nenhum evento encontrado.</td></tr>';
}

/* -----------------------------------------------------------------------
   BACKUP
------------------------------------------------------------------------ */
function configurarBackup() {
  document.getElementById('btnExportarBackup').addEventListener('click', () => {
    window.open('/api/admin/backup/exportar', '_blank');
  });

  const input = document.getElementById('inputBackup');
  const dropzone = document.getElementById('dropzoneBackup');
  dropzone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => {
    document.getElementById('nomeArquivoBackup').textContent = input.files[0] ? input.files[0].name : '';
  });

  document.getElementById('btnImportarBackup').addEventListener('click', async () => {
    const arquivo = input.files[0];
    if (!arquivo) { mostrarToast('Selecione um arquivo .sqlite primeiro.', 'erro'); return; }
    if (!confirm('Isso substituirá TODO o banco de dados atual. Deseja continuar?')) return;
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      const resp = await apiFetch('/api/admin/backup/importar', { method: 'POST', body: fd });
      mostrarToast(resp.aviso || 'Backup importado.');
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

/* -----------------------------------------------------------------------
   CONFIGURAÇÕES
------------------------------------------------------------------------ */
async function carregarConfiguracoes() {
  const cfg = await apiFetch('/api/admin/config');
  document.getElementById('cfgNomeOrg').value = cfg.nome_organizacao || '';
  document.getElementById('cfgTema').value = cfg.tema || 'escuro';
  document.getElementById('cfgIdioma').value = cfg.idioma || 'pt-BR';
  document.getElementById('cfgVolume').value = cfg.volume || '80';
  document.getElementById('cfgLogo').value = cfg.logo || '';
  document.getElementById('cfgFundo').value = cfg.imagem_fundo || '';

  const selMusica = document.getElementById('cfgMusicaInicial');
  selMusica.innerHTML = opcoesMusicaSelect(cfg.musica_inicial_id ? Number(cfg.musica_inicial_id) : null);
  document.getElementById('cfgMusicaAtiva').checked = cfg.musica_inicial_ativa === '1';
  document.getElementById('cfgMusicaLoop').checked = cfg.musica_loop !== '0';
  document.getElementById('cfgMusicaFade').value = cfg.musica_fade_ms || '1500';
  const telas = (cfg.musica_telas || '').split(',').map((t) => t.trim());
  document.getElementById('cfgMusicaTelaLogin').checked = telas.includes('login');
  document.getElementById('cfgMusicaTelaPortal').checked = telas.includes('portal');

  document.getElementById('formConfig').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const telasEscolhidas = [];
      if (document.getElementById('cfgMusicaTelaLogin').checked) telasEscolhidas.push('login');
      if (document.getElementById('cfgMusicaTelaPortal').checked) telasEscolhidas.push('portal');

      await apiFetch('/api/admin/config', {
        method: 'PUT',
        body: JSON.stringify({
          nome_organizacao: document.getElementById('cfgNomeOrg').value.trim(),
          tema: document.getElementById('cfgTema').value,
          idioma: document.getElementById('cfgIdioma').value,
          volume: document.getElementById('cfgVolume').value,
          logo: document.getElementById('cfgLogo').value.trim(),
          imagem_fundo: document.getElementById('cfgFundo').value.trim(),
          musica_inicial_id: document.getElementById('cfgMusicaInicial').value || '',
          musica_inicial_ativa: document.getElementById('cfgMusicaAtiva').checked ? '1' : '0',
          musica_loop: document.getElementById('cfgMusicaLoop').checked ? '1' : '0',
          musica_fade_ms: document.getElementById('cfgMusicaFade').value || '1500',
          musica_telas: telasEscolhidas.join(',')
        })
      });
      mostrarToast('Configurações salvas.');
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}

/* -----------------------------------------------------------------------
   MÚSICAS (painel dedicado)
------------------------------------------------------------------------ */
async function carregarMusicasTabela() {
  await recarregarMusicas();
  const cfg = await apiFetch('/api/admin/config');
  const idInicial = cfg.musica_inicial_id ? Number(cfg.musica_inicial_id) : null;
  const container = document.getElementById('listaMusicasAdmin');

  if (!MUSICAS_CACHE.length) {
    container.innerHTML = '<p class="tabela-vazia">Nenhuma música cadastrada ainda.</p>';
    return;
  }

  container.innerHTML = MUSICAS_CACHE.map((m) => `
    <div class="musica-admin-card">
      <div class="musica-admin-info">
        <span class="musica-admin-nome">
          ${escapeHtml(m.nome)}
          ${idInicial === m.id ? '<span class="musica-admin-tag-inicial">MÚSICA INICIAL</span>' : ''}
        </span>
        <span class="musica-admin-meta">${(m.tipo_arquivo || '').toUpperCase()} · ${formatarTamanho(m.tamanho_bytes)} · ${formatarData(m.criado_em)}</span>
        <audio controls preload="none" src="/api/public/musicas/${m.id}/arquivo" style="height:30px; margin-top:4px;"></audio>
      </div>
      <div class="musica-admin-acoes">
        <button class="btn-secundario" onclick="renomearMusica(${m.id})">Renomear</button>
        ${idInicial === m.id
          ? `<button class="btn-secundario" onclick="definirMusicaInicial(null)">Remover como inicial</button>`
          : `<button class="btn-secundario" onclick="definirMusicaInicial(${m.id})">Definir como inicial</button>`}
        <button class="btn-perigo" onclick="removerMusica(${m.id}, '${escapeHtml(m.nome).replace(/'/g, "\\'")}')">Excluir</button>
      </div>
    </div>
  `).join('');
}

function formatarTamanho(bytes) {
  if (!bytes) return '—';
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

async function definirMusicaInicial(id) {
  try {
    await apiFetch('/api/admin/config', {
      method: 'PUT',
      body: JSON.stringify({ musica_inicial_id: id || '' })
    });
    mostrarToast(id ? 'Música definida como inicial.' : 'Música inicial removida.');
    await carregarMusicasTabela();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function renomearMusica(id) {
  const musica = MUSICAS_CACHE.find((m) => m.id === id);
  if (!musica) return;
  const novoNome = prompt('Novo nome da música:', musica.nome);
  if (!novoNome || !novoNome.trim()) return;
  try {
    await apiFetch(`/api/admin/musicas/${id}`, { method: 'PUT', body: JSON.stringify({ nome: novoNome.trim() }) });
    mostrarToast('Música renomeada.');
    await carregarMusicasTabela();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

async function removerMusica(id, nome) {
  if (!confirm(`Remover a música "${nome}"? Documentos e casos que a usam ficarão sem música. Essa ação não pode ser desfeita.`)) return;
  try {
    await apiFetch(`/api/admin/musicas/${id}`, { method: 'DELETE' });
    mostrarToast('Música removida.');
    await carregarMusicasTabela();
  } catch (err) {
    mostrarToast(err.message, 'erro');
  }
}

function iniciarUploadMusica() {
  const input = document.getElementById('inputNovaMusica');
  if (!input) return;

  input.addEventListener('change', () => {
    document.getElementById('nomeArquivoMusica').textContent = input.files[0] ? input.files[0].name : '';
  });

  document.getElementById('btnEnviarMusica').addEventListener('click', async () => {
    const arquivo = input.files[0];
    if (!arquivo) {
      mostrarToast('Selecione um arquivo de áudio.', 'erro');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      fd.append('nome', document.getElementById('novaMusicaNome').value.trim());
      await apiFetch('/api/admin/musicas/upload', { method: 'POST', body: fd });
      mostrarToast('Música adicionada com sucesso.');
      input.value = '';
      document.getElementById('novaMusicaNome').value = '';
      document.getElementById('nomeArquivoMusica').textContent = '';
      await carregarMusicasTabela();
    } catch (err) {
      mostrarToast(err.message, 'erro');
    }
  });
}


/* -----------------------------------------------------------------------
   EVENTOS ESTÁTICOS (botões que existem desde o carregamento da página)
------------------------------------------------------------------------ */
function ligarEventosEstáticos() {
  document.getElementById('btnNovoCaso').addEventListener('click', () => abrirEditarCaso(null));
  document.getElementById('btnNovoDocUpload').addEventListener('click', abrirNovoDocumentoUpload);
  document.getElementById('btnNovoDocEditor').addEventListener('click', abrirNovoDocumentoEditor);
  document.getElementById('btnNovaMensagem').addEventListener('click', abrirNovaMensagem);
  document.getElementById('btnFiltrarLogs').addEventListener('click', carregarLogs);

  document.getElementById('btnNovaCategoria').addEventListener('click', async () => {
    const input = document.getElementById('novaCategoriaInput');
    const nome = input.value.trim();
    if (!nome) return;
    try {
      await apiFetch('/api/admin/categorias', { method: 'POST', body: JSON.stringify({ nome }) });
      input.value = '';
      await carregarCategoriasTabela();
      mostrarToast('Categoria adicionada.');
    } catch (err) { mostrarToast(err.message, 'erro'); }
  });

  document.getElementById('btnNovaTag').addEventListener('click', async () => {
    const input = document.getElementById('novaTagInput');
    const nome = input.value.trim();
    if (!nome) return;
    try {
      await apiFetch('/api/admin/tags', { method: 'POST', body: JSON.stringify({ nome }) });
      input.value = '';
      await carregarTags();
      mostrarToast('Tag adicionada.');
    } catch (err) { mostrarToast(err.message, 'erro'); }
  });

  configurarBackup();
  iniciarUploadMusica();
}
