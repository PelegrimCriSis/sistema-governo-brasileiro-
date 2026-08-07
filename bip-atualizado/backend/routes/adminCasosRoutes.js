/* =======================================================================
   B.I.P. — Admin: Gerenciamento de Casos
   ======================================================================= */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { dbGet, dbAll, dbRun } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { upload, UPLOAD_ROOT, PASTAS_POR_TIPO } = require('../middleware/upload');
const { registrarLog } = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  res.json(
    await dbAll(
      `SELECT c.*, cat.nome AS categoria_nome, a.codinome AS responsavel_codinome
       FROM casos c
       LEFT JOIN categorias cat ON cat.id = c.categoria_id
       LEFT JOIN agentes a ON a.id = c.responsavel_id
       ORDER BY c.atualizado_em DESC`
    )
  );
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const caso = await dbGet(`SELECT * FROM casos WHERE id = ?`, [req.params.id]);
  if (!caso) return res.status(404).json({ erro: 'Caso não encontrado.' });
  const anexos = await dbAll(`SELECT * FROM anexos WHERE caso_id = ?`, [caso.id]);
  res.json({ ...caso, anexos });
}));

router.post('/', asyncHandler(async (req, res) => {
  const {
    codigo, titulo, descricao, categoria_id, responsavel_id,
    status, nivel_autorizacao, observacoes, musica_id
  } = req.body;

  if (!codigo || !titulo) {
    return res.status(400).json({ erro: 'Código e título são obrigatórios.' });
  }

  try {
    const row = await dbGet(
      `INSERT INTO casos (codigo, titulo, descricao, categoria_id, responsavel_id, status, nivel_autorizacao, observacoes, musica_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        codigo, titulo, descricao || null,
        categoria_id || null, responsavel_id || null,
        status || 'Em andamento', Number(nivel_autorizacao) || 1, observacoes || null,
        musica_id || null
      ]
    );

    registrarLog({
      usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
      tipoAcao: 'CASO_CRIADO', detalhe: `${codigo} — ${titulo}`, ip: req.ip
    });

    res.status(201).json({ ok: true, id: row.id });
  } catch (err) {
    res.status(409).json({ erro: 'Código de caso já existe.' });
  }
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const caso = await dbGet(`SELECT * FROM casos WHERE id = ?`, [req.params.id]);
  if (!caso) return res.status(404).json({ erro: 'Caso não encontrado.' });

  const {
    codigo, titulo, descricao, categoria_id, responsavel_id,
    status, nivel_autorizacao, observacoes, musica_id
  } = req.body;

  await dbRun(
    `UPDATE casos SET codigo=?, titulo=?, descricao=?, categoria_id=?, responsavel_id=?,
     status=?, nivel_autorizacao=?, observacoes=?, musica_id=?, atualizado_em=now()
     WHERE id=?`,
    [
      codigo ?? caso.codigo, titulo ?? caso.titulo, descricao ?? caso.descricao,
      categoria_id ?? caso.categoria_id, responsavel_id ?? caso.responsavel_id,
      status ?? caso.status,
      nivel_autorizacao != null ? Number(nivel_autorizacao) : caso.nivel_autorizacao,
      observacoes ?? caso.observacoes,
      musica_id !== undefined ? (musica_id || null) : caso.musica_id,
      caso.id
    ]
  );

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'CASO_EDITADO', detalhe: `Caso #${caso.id}`, ip: req.ip
  });

  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const caso = await dbGet(`SELECT * FROM casos WHERE id = ?`, [req.params.id]);
  if (!caso) return res.status(404).json({ erro: 'Caso não encontrado.' });

  const anexos = await dbAll(`SELECT * FROM anexos WHERE caso_id = ?`, [caso.id]);
  anexos.forEach((a) => {
    const p = path.join(UPLOAD_ROOT, a.caminho);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  });

  await dbRun(`DELETE FROM casos WHERE id = ?`, [caso.id]);

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'CASO_REMOVIDO', detalhe: `Caso #${caso.id} — ${caso.titulo}`, ip: req.ip
  });

  res.json({ ok: true });
}));

/* Anexos ilimitados por caso -------------------------------------------- */
router.post('/:id/anexos', upload.single('arquivo'), asyncHandler(async (req, res) => {
  const caso = await dbGet(`SELECT * FROM casos WHERE id = ?`, [req.params.id]);
  if (!caso) return res.status(404).json({ erro: 'Caso não encontrado.' });
  if (!req.file) return res.status(400).json({ erro: 'Nenhum arquivo enviado.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const pasta = PASTAS_POR_TIPO[ext] || 'documentos';
  const caminhoRelativo = `${pasta}/${req.file.filename}`;

  const row = await dbGet(
    `INSERT INTO anexos (caso_id, nome_original, caminho, tipo_arquivo) VALUES (?, ?, ?, ?) RETURNING id`,
    [caso.id, req.file.originalname, caminhoRelativo, ext.replace('.', '')]
  );

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'ANEXO_ADICIONADO', detalhe: `Caso #${caso.id} — ${req.file.originalname}`, ip: req.ip
  });

  res.status(201).json({ ok: true, id: row.id, caminho: caminhoRelativo });
}));

router.delete('/anexos/:anexoId', asyncHandler(async (req, res) => {
  const anexo = await dbGet(`SELECT * FROM anexos WHERE id = ?`, [req.params.anexoId]);
  if (!anexo) return res.status(404).json({ erro: 'Anexo não encontrado.' });

  const caminho = path.join(UPLOAD_ROOT, anexo.caminho);
  if (fs.existsSync(caminho)) fs.unlinkSync(caminho);
  await dbRun(`DELETE FROM anexos WHERE id = ?`, [anexo.id]);

  res.json({ ok: true });
}));

module.exports = router;
