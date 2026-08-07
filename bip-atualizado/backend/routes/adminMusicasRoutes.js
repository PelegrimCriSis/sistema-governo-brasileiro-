/* =======================================================================
   B.I.P. — Admin: Sistema de Músicas
   Permite enviar, renomear, excluir e escolher a música inicial do
   sistema, sem necessidade de editar código. Os arquivos ficam em
   /uploads/audios e os metadados na tabela "musicas".
   ======================================================================= */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { dbGet, dbAll, dbRun } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { uploadMusica, UPLOAD_ROOT } = require('../middleware/upload');
const { registrarLog } = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

router.get('/', asyncHandler(async (req, res) => {
  const musicas = await dbAll(`SELECT * FROM musicas ORDER BY criado_em DESC`);
  res.json(musicas);
}));

router.post('/upload', uploadMusica.single('arquivo'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ erro: 'Envie um arquivo de áudio.' });

  const ext = path.extname(req.file.originalname).toLowerCase();
  const caminhoRelativo = `audios/${req.file.filename}`;
  const nome = (req.body.nome && req.body.nome.trim()) || req.file.originalname;

  const row = await dbGet(
    `INSERT INTO musicas (nome, caminho, tipo_arquivo, tamanho_bytes)
     VALUES (?, ?, ?, ?) RETURNING id`,
    [nome, caminhoRelativo, ext.replace('.', ''), req.file.size]
  );

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'MUSICA_ADICIONADA', detalhe: `${nome} (${caminhoRelativo})`, ip: req.ip
  });

  res.status(201).json({ ok: true, id: row.id });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const musica = await dbGet(`SELECT * FROM musicas WHERE id = ?`, [req.params.id]);
  if (!musica) return res.status(404).json({ erro: 'Música não encontrada.' });

  const nome = (req.body.nome && String(req.body.nome).trim()) || musica.nome;
  await dbRun(`UPDATE musicas SET nome = ? WHERE id = ?`, [nome, musica.id]);

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'MUSICA_EDITADA', detalhe: `Música #${musica.id} — ${nome}`, ip: req.ip
  });

  res.json({ ok: true });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  const musica = await dbGet(`SELECT * FROM musicas WHERE id = ?`, [req.params.id]);
  if (!musica) return res.status(404).json({ erro: 'Música não encontrada.' });

  const caminho = path.join(UPLOAD_ROOT, musica.caminho);
  if (fs.existsSync(caminho)) fs.unlinkSync(caminho);

  // Se essa música era a música inicial configurada, limpa a configuração.
  const cfg = await dbGet(`SELECT valor FROM configuracoes WHERE chave = 'musica_inicial_id'`);
  if (cfg && String(cfg.valor) === String(musica.id)) {
    await dbRun(`UPDATE configuracoes SET valor = '' WHERE chave = 'musica_inicial_id'`);
  }

  // documentos.musica_id e casos.musica_id são liberados automaticamente
  // (ON DELETE SET NULL) ao remover a linha da tabela "musicas".
  await dbRun(`DELETE FROM musicas WHERE id = ?`, [musica.id]);

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'MUSICA_REMOVIDA', detalhe: `Música #${musica.id} — ${musica.nome}`, ip: req.ip
  });

  res.json({ ok: true });
}));

module.exports = router;
