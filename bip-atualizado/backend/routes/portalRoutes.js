/* =======================================================================
   B.I.P. — Rotas do Portal do Agente
   Toda a filtragem por nível de autorização acontece aqui, no servidor —
   um agente nunca recebe dados de algo que seu nível não permite ver.
   ======================================================================= */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { dbGet, dbAll, dbRun } = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { registrarLog } = require('../utils/logger');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAuth);

/** Retorna o nível de autorização efetivo do usuário logado (admin = ilimitado). */
function nivelDoUsuario(req) {
  return req.session.tipo === 'admin' ? 999 : (req.session.nivelAutorizacao || 0);
}

/* -----------------------------------------------------------------------
   DASHBOARD — contadores rápidos
------------------------------------------------------------------------ */
router.get('/dashboard', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);

  const casosRow = await dbGet(`SELECT COUNT(*) AS n FROM casos WHERE nivel_autorizacao <= ?`, [nivel]);
  const documentosRow = await dbGet(
    `SELECT COUNT(*) AS n FROM documentos WHERE nivel_autorizacao <= ? AND publicado = 1 AND oculto = 0`,
    [nivel]
  );
  const mensagensRow = req.session.agenteId
    ? await dbGet(`SELECT COUNT(*) AS n FROM mensagens WHERE destinatario_id = ? AND lida = 0`, [req.session.agenteId])
    : { n: 0 };

  res.json({
    casos: Number(casosRow.n),
    documentos: Number(documentosRow.n),
    mensagensNaoLidas: Number(mensagensRow.n)
  });
}));

/* -----------------------------------------------------------------------
   CASOS
------------------------------------------------------------------------ */
router.get('/casos', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);
  const { q, categoria, status } = req.query;

  let sql = `
    SELECT c.*, cat.nome AS categoria_nome, a.codinome AS responsavel_codinome
    FROM casos c
    LEFT JOIN categorias cat ON cat.id = c.categoria_id
    LEFT JOIN agentes a ON a.id = c.responsavel_id
    WHERE c.nivel_autorizacao <= ?
  `;
  const params = [nivel];

  if (q) {
    sql += ` AND (c.titulo ILIKE ? OR c.codigo ILIKE ? OR c.descricao ILIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (categoria) {
    sql += ` AND c.categoria_id = ?`;
    params.push(categoria);
  }
  if (status) {
    sql += ` AND c.status = ?`;
    params.push(status);
  }
  sql += ` ORDER BY c.atualizado_em DESC`;

  res.json(await dbAll(sql, params));
}));

router.get('/casos/:id', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);
  const caso = await dbGet(
    `SELECT c.*, cat.nome AS categoria_nome, a.codinome AS responsavel_codinome
     FROM casos c
     LEFT JOIN categorias cat ON cat.id = c.categoria_id
     LEFT JOIN agentes a ON a.id = c.responsavel_id
     WHERE c.id = ?`,
    [req.params.id]
  );

  if (!caso || caso.nivel_autorizacao > nivel) {
    return res.status(403).json({ erro: 'ACESSO NEGADO' });
  }

  const anexos = await dbAll(
    `SELECT id, nome_original, tipo_arquivo, enviado_em FROM anexos WHERE caso_id = ?`,
    [caso.id]
  );

  res.json({ ...caso, anexos });
}));

/* -----------------------------------------------------------------------
   DOCUMENTOS
------------------------------------------------------------------------ */
router.get('/documentos', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);
  const { q, categoria, caso, tag, data, classificacao } = req.query;

  let sql = `
    SELECT d.*, cat.nome AS categoria_nome, c.titulo AS caso_titulo
    FROM documentos d
    LEFT JOIN categorias cat ON cat.id = d.categoria_id
    LEFT JOIN casos c ON c.id = d.caso_id
    WHERE d.publicado = 1 AND d.oculto = 0 AND d.nivel_autorizacao <= ?
  `;
  const params = [nivel];

  if (q) {
    sql += ` AND (d.titulo ILIKE ? OR d.codigo ILIKE ? OR d.autor ILIKE ?)`;
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (categoria) { sql += ` AND d.categoria_id = ?`; params.push(categoria); }
  if (caso) { sql += ` AND d.caso_id = ?`; params.push(caso); }
  if (data) { sql += ` AND date(d.criado_em) = date(?)`; params.push(data); }
  if (classificacao) { sql += ` AND d.nivel_autorizacao = ?`; params.push(classificacao); }

  sql += ` ORDER BY d.criado_em DESC`;
  let resultado = await dbAll(sql, params);

  if (tag) {
    const linhasTag = await dbAll(
      `SELECT dt.documento_id FROM documento_tags dt
       JOIN tags t ON t.id = dt.tag_id WHERE t.nome = ?`,
      [tag]
    );
    const idsComTag = new Set(linhasTag.map((r) => r.documento_id));
    resultado = resultado.filter((d) => idsComTag.has(d.id));
  }

  res.json(resultado);
}));

router.get('/documentos/:id', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);

  if (!doc || doc.publicado !== 1 || doc.oculto === 1 || doc.nivel_autorizacao > nivel) {
    return res.status(403).json({ erro: 'ACESSO NEGADO' });
  }

  const linhasTags = await dbAll(
    `SELECT t.nome FROM tags t JOIN documento_tags dt ON dt.tag_id = t.id WHERE dt.documento_id = ?`,
    [doc.id]
  );
  const tags = linhasTags.map((r) => r.nome);

  registrarLog({
    usuarioId: req.session.usuarioId,
    usuarioNome: req.session.usuarioNome,
    tipoAcao: 'DOCUMENTO_VISUALIZADO',
    detalhe: `Documento #${doc.id} — ${doc.titulo}`,
    ip: req.ip
  });

  res.json({ ...doc, tags });
}));

/**
 * Visualização inline (somente leitura) — exige nível suficiente, mas NÃO
 * exige permissão de download. É o que alimenta os visualizadores de
 * imagem/áudio/vídeo/PDF no portal. Nunca envia como anexo para download.
 */
router.get('/documentos/:id/arquivo', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);

  if (
    !doc || doc.publicado !== 1 || doc.oculto === 1 ||
    doc.nivel_autorizacao > nivel || !doc.caminho_arquivo
  ) {
    return res.status(403).json({ erro: 'ACESSO NEGADO' });
  }

  const caminhoAbsoluto = path.join(UPLOAD_ROOT, doc.caminho_arquivo);
  if (!fs.existsSync(caminhoAbsoluto)) {
    return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
  }

  registrarLog({
    usuarioId: req.session.usuarioId,
    usuarioNome: req.session.usuarioNome,
    tipoAcao: 'DOCUMENTO_VISUALIZADO',
    detalhe: `Arquivo do documento #${doc.id} — ${doc.titulo}`,
    ip: req.ip
  });

  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(caminhoAbsoluto);
}));

/** Capa (miniatura) opcional de um documento — mesma regra de visibilidade da visualização. */
router.get('/documentos/:id/capa', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);

  if (
    !doc || doc.publicado !== 1 || doc.oculto === 1 ||
    doc.nivel_autorizacao > nivel || !doc.imagem_capa
  ) {
    return res.status(404).json({ erro: 'Capa não encontrada.' });
  }

  const caminhoAbsoluto = path.join(UPLOAD_ROOT, doc.imagem_capa);
  if (!fs.existsSync(caminhoAbsoluto)) {
    return res.status(404).json({ erro: 'Arquivo de capa não encontrado no servidor.' });
  }

  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(caminhoAbsoluto);
}));

/** Download do arquivo — só libera se permitir_download = 1 e nível suficiente. */
router.get('/documentos/:id/download', asyncHandler(async (req, res) => {
  const nivel = nivelDoUsuario(req);
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);

  if (
    !doc ||
    doc.publicado !== 1 ||
    doc.oculto === 1 ||
    doc.nivel_autorizacao > nivel ||
    doc.permitir_download !== 1 ||
    !doc.caminho_arquivo
  ) {
    return res.status(403).json({ erro: 'ACESSO NEGADO — download não permitido.' });
  }

  const caminhoAbsoluto = path.join(UPLOAD_ROOT, doc.caminho_arquivo);
  if (!fs.existsSync(caminhoAbsoluto)) {
    return res.status(404).json({ erro: 'Arquivo não encontrado no servidor.' });
  }

  registrarLog({
    usuarioId: req.session.usuarioId,
    usuarioNome: req.session.usuarioNome,
    tipoAcao: 'DOWNLOAD',
    detalhe: `Documento #${doc.id} — ${doc.titulo}`,
    ip: req.ip
  });

  res.download(caminhoAbsoluto, doc.titulo + path.extname(caminhoAbsoluto));
}));

/* -----------------------------------------------------------------------
   AGENTES AUTORIZADOS (lista pública interna — dados básicos apenas)
------------------------------------------------------------------------ */
router.get('/agentes', asyncHandler(async (req, res) => {
  const agentes = await dbAll(
    `SELECT id, nome, codinome, cargo, foto, status FROM agentes WHERE status = 'Ativo' ORDER BY nome`
  );
  res.json(agentes);
}));

/* -----------------------------------------------------------------------
   MENSAGENS INTERNAS
------------------------------------------------------------------------ */
router.get('/mensagens', asyncHandler(async (req, res) => {
  if (!req.session.agenteId) return res.json([]);
  const nivel = nivelDoUsuario(req);
  const msgs = await dbAll(
    `SELECT m.*, a.codinome AS remetente_codinome
     FROM mensagens m
     LEFT JOIN agentes a ON a.id = m.remetente_id
     WHERE m.destinatario_id = ? AND m.nivel_autorizacao <= ?
     ORDER BY m.criado_em DESC`,
    [req.session.agenteId, nivel]
  );
  res.json(msgs);
}));

router.post('/mensagens/:id/marcar-lida', asyncHandler(async (req, res) => {
  if (!req.session.agenteId) return res.status(403).json({ erro: 'ACESSO NEGADO' });
  await dbRun(
    `UPDATE mensagens SET lida = 1 WHERE id = ? AND destinatario_id = ?`,
    [req.params.id, req.session.agenteId]
  );
  res.json({ ok: true });
}));

/* -----------------------------------------------------------------------
   CATEGORIAS / TAGS (para popular filtros no front-end)
------------------------------------------------------------------------ */
router.get('/categorias', asyncHandler(async (req, res) => {
  res.json(await dbAll(`SELECT * FROM categorias ORDER BY nome`));
}));
router.get('/tags', asyncHandler(async (req, res) => {
  res.json(await dbAll(`SELECT * FROM tags ORDER BY nome`));
}));

/* -----------------------------------------------------------------------
   CONFIGURAÇÕES PÚBLICAS (nome da organização, logo, tema, etc.)
------------------------------------------------------------------------ */
router.get('/config', asyncHandler(async (req, res) => {
  const linhas = await dbAll(`SELECT chave, valor FROM configuracoes`);
  const config = {};
  linhas.forEach((l) => { config[l.chave] = l.valor; });
  res.json(config);
}));

module.exports = router;
