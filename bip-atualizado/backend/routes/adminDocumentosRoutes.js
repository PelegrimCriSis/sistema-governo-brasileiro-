/* =======================================================================
   B.I.P. — Admin: Gerenciamento de Documentos
   Suporta dois modos de criação:
   1) Upload de arquivo (PDF, imagem, áudio, vídeo, txt)
   2) Documento escrito no editor rico (Quill) — salvo como HTML no banco
   ======================================================================= */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { dbGet, dbAll, dbRun } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { upload, uploadDocumentoComCapa, uploadCapa, UPLOAD_ROOT, PASTAS_POR_TIPO } = require('../middleware/upload');
const { registrarLog } = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

async function salvarTags(documentoId, tagsArray) {
  await dbRun(`DELETE FROM documento_tags WHERE documento_id = ?`, [documentoId]);
  if (!Array.isArray(tagsArray)) return;

  const nomes = tagsArray.map((t) => String(t).trim()).filter(Boolean);

  for (const nomeTag of nomes) {
    let linha = await dbGet(`SELECT id FROM tags WHERE nome = ?`, [nomeTag]);
    if (!linha) {
      linha = await dbGet(`INSERT INTO tags (nome) VALUES (?) RETURNING id`, [nomeTag]);
    }
    await dbRun(
      `INSERT INTO documento_tags (documento_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING`,
      [documentoId, linha.id]
    );
  }
}

router.get('/', asyncHandler(async (req, res) => {
  const docs = await dbAll(
    `SELECT d.*, cat.nome AS categoria_nome, c.titulo AS caso_titulo
     FROM documentos d
     LEFT JOIN categorias cat ON cat.id = d.categoria_id
     LEFT JOIN casos c ON c.id = d.caso_id
     ORDER BY d.criado_em DESC`
  );
  res.json(docs);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  const linhasTags = await dbAll(
    `SELECT t.nome FROM tags t JOIN documento_tags dt ON dt.tag_id = t.id WHERE dt.documento_id = ?`,
    [doc.id]
  );
  res.json({ ...doc, tags: linhasTags.map((r) => r.nome) });
}));

/* Criação via UPLOAD de arquivo (PDF, imagem, áudio, vídeo, txt) ---------
   Aceita opcionalmente uma capa (campo "capa") — usada principalmente
   para PDFs, mas disponível para qualquer tipo de documento enviado. */
router.post('/upload', uploadDocumentoComCapa.fields([
  { name: 'arquivo', maxCount: 1 },
  { name: 'capa', maxCount: 1 }
]), asyncHandler(async (req, res) => {
  const {
    codigo, titulo, descricao, autor, categoria_id, caso_id,
    nivel_autorizacao, publicado, oculto, permitir_download, tags, musica_id
  } = req.body;

  const arquivo = req.files && req.files.arquivo && req.files.arquivo[0];
  const capa = req.files && req.files.capa && req.files.capa[0];

  if (!codigo || !titulo || !arquivo) {
    return res.status(400).json({ erro: 'Código, título e arquivo são obrigatórios.' });
  }

  const ext = path.extname(arquivo.originalname).toLowerCase();
  const pasta = PASTAS_POR_TIPO[ext] || 'documentos';
  const caminhoRelativo = `${pasta}/${arquivo.filename}`;
  const capaRelativa = capa ? `imagens/${capa.filename}` : null;

  try {
    const row = await dbGet(
      `INSERT INTO documentos
       (codigo, titulo, descricao, autor, categoria_id, caso_id, nivel_autorizacao,
        publicado, oculto, permitir_download, tipo_arquivo, caminho_arquivo, tamanho_bytes,
        imagem_capa, musica_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        codigo, titulo, descricao || null, autor || null,
        categoria_id || null, caso_id || null,
        Number(nivel_autorizacao) || 1,
        publicado === 'true' || publicado === true ? 1 : 0,
        oculto === 'true' || oculto === true ? 1 : 0,
        permitir_download === 'true' || permitir_download === true ? 1 : 0,
        ext.replace('.', ''), caminhoRelativo, arquivo.size,
        capaRelativa, musica_id || null
      ]
    );

    const tagsArray = tags ? String(tags).split(',') : [];
    await salvarTags(row.id, tagsArray);

    registrarLog({
      usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
      tipoAcao: 'DOCUMENTO_CRIADO', detalhe: `${codigo} — ${titulo} (upload)`, ip: req.ip
    });

    res.status(201).json({ ok: true, id: row.id });
  } catch (err) {
    res.status(409).json({ erro: 'Código de documento já existe.' });
  }
}));

/* Envia ou substitui a capa de um documento já existente (opcional) ----- */
router.post('/:id/capa', uploadCapa.single('capa'), asyncHandler(async (req, res) => {
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });
  if (!req.file) return res.status(400).json({ erro: 'Envie uma imagem de capa.' });

  if (doc.imagem_capa) {
    const antiga = path.join(UPLOAD_ROOT, doc.imagem_capa);
    if (fs.existsSync(antiga)) fs.unlinkSync(antiga);
  }

  const capaRelativa = `imagens/${req.file.filename}`;
  await dbRun(`UPDATE documentos SET imagem_capa = ?, atualizado_em = now() WHERE id = ?`, [capaRelativa, doc.id]);

  res.json({ ok: true, imagem_capa: capaRelativa });
}));

/* Criação via EDITOR RICO (conteúdo HTML gerado pelo Quill) ------------- */
router.post('/editor', asyncHandler(async (req, res) => {
  const {
    codigo, titulo, descricao, autor, categoria_id, caso_id,
    nivel_autorizacao, publicado, oculto, tags, conteudo_rico, musica_id
  } = req.body;

  if (!codigo || !titulo || !conteudo_rico) {
    return res.status(400).json({ erro: 'Código, título e conteúdo são obrigatórios.' });
  }

  try {
    const row = await dbGet(
      `INSERT INTO documentos
       (codigo, titulo, descricao, autor, categoria_id, caso_id, nivel_autorizacao,
        publicado, oculto, permitir_download, tipo_arquivo, conteudo_rico, musica_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 'rico', ?, ?) RETURNING id`,
      [
        codigo, titulo, descricao || null, autor || null,
        categoria_id || null, caso_id || null,
        Number(nivel_autorizacao) || 1,
        publicado ? 1 : 0, oculto ? 1 : 0, conteudo_rico, musica_id || null
      ]
    );

    await salvarTags(row.id, Array.isArray(tags) ? tags : []);

    registrarLog({
      usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
      tipoAcao: 'DOCUMENTO_CRIADO', detalhe: `${codigo} — ${titulo} (editor)`, ip: req.ip
    });

    res.status(201).json({ ok: true, id: row.id });
  } catch (err) {
    res.status(409).json({ erro: 'Código de documento já existe.' });
  }
}));

/* Edição de metadados (e conteúdo rico, se aplicável) ------------------- */
router.put('/:id', asyncHandler(async (req, res) => {
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });

  const {
    codigo, titulo, descricao, autor, categoria_id, caso_id,
    nivel_autorizacao, publicado, oculto, permitir_download, tags, conteudo_rico, musica_id
  } = req.body;

  await dbRun(
    `UPDATE documentos SET
       codigo=?, titulo=?, descricao=?, autor=?, categoria_id=?, caso_id=?,
       nivel_autorizacao=?, publicado=?, oculto=?, permitir_download=?, conteudo_rico=?,
       musica_id=?, atualizado_em=now()
     WHERE id=?`,
    [
      codigo ?? doc.codigo, titulo ?? doc.titulo, descricao ?? doc.descricao,
      autor ?? doc.autor, categoria_id ?? doc.categoria_id, caso_id ?? doc.caso_id,
      nivel_autorizacao != null ? Number(nivel_autorizacao) : doc.nivel_autorizacao,
      publicado != null ? (publicado ? 1 : 0) : doc.publicado,
      oculto != null ? (oculto ? 1 : 0) : doc.oculto,
      permitir_download != null ? (permitir_download ? 1 : 0) : doc.permitir_download,
      conteudo_rico ?? doc.conteudo_rico,
      musica_id !== undefined ? (musica_id || null) : doc.musica_id,
      doc.id
    ]
  );

  if (tags) await salvarTags(doc.id, Array.isArray(tags) ? tags : String(tags).split(','));

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'DOCUMENTO_EDITADO', detalhe: `Documento #${doc.id}`, ip: req.ip
  });

  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const doc = await dbGet(`SELECT * FROM documentos WHERE id = ?`, [req.params.id]);
  if (!doc) return res.status(404).json({ erro: 'Documento não encontrado.' });

  if (doc.caminho_arquivo) {
    const p = path.join(UPLOAD_ROOT, doc.caminho_arquivo);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }
  if (doc.imagem_capa) {
    const pCapa = path.join(UPLOAD_ROOT, doc.imagem_capa);
    if (fs.existsSync(pCapa)) fs.unlinkSync(pCapa);
  }
  await dbRun(`DELETE FROM documentos WHERE id = ?`, [doc.id]);

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'DOCUMENTO_REMOVIDO', detalhe: `Documento #${doc.id} — ${doc.titulo}`, ip: req.ip
  });

  res.json({ ok: true });
}));

module.exports = router;
