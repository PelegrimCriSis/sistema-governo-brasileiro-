/* =======================================================================
   B.I.P. — Rotas públicas (sem autenticação)
   Usadas apenas para a trilha sonora ambiente do sistema: a música em si
   não é conteúdo classificado, então ela pode tocar já na tela de login
   (antes do agente autenticar) e continuar tocando após o login, sem
   reiniciar. Nenhum dado de caso/documento é exposto aqui.
   ======================================================================= */

const express = require('express');
const path = require('path');
const fs = require('fs');
const { dbGet, dbAll } = require('../db/database');
const { UPLOAD_ROOT } = require('../middleware/upload');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

/** Apenas as chaves de configuração relacionadas à música (nada sensível). */
router.get('/config', asyncHandler(async (req, res) => {
  const linhas = await dbAll(
    `SELECT chave, valor FROM configuracoes WHERE chave LIKE 'musica_%' OR chave = 'volume'`
  );
  const config = {};
  linhas.forEach((l) => { config[l.chave] = l.valor; });
  res.json(config);
}));

/** Lista básica (id + nome) das músicas ativas — usada apenas para exibir nomes na UI. */
router.get('/musicas', asyncHandler(async (req, res) => {
  const musicas = await dbAll(`SELECT id, nome FROM musicas ORDER BY nome`);
  res.json(musicas);
}));

/** Stream do arquivo de áudio — som ambiente, não é informação classificada. */
router.get('/musicas/:id/arquivo', asyncHandler(async (req, res) => {
  const musica = await dbGet(`SELECT * FROM musicas WHERE id = ?`, [req.params.id]);
  if (!musica) return res.status(404).json({ erro: 'Música não encontrada.' });

  const caminhoAbsoluto = path.join(UPLOAD_ROOT, musica.caminho);
  if (!fs.existsSync(caminhoAbsoluto)) {
    return res.status(404).json({ erro: 'Arquivo de música não encontrado no servidor.' });
  }

  res.setHeader('Content-Disposition', 'inline');
  res.sendFile(caminhoAbsoluto);
}));

module.exports = router;
