/* =======================================================================
   B.I.P. — Admin: Gerenciamento de Agentes (jogadores)
   Cria usuário de login (usuarios) + perfil (agentes) em conjunto.
   ======================================================================= */

const express = require('express');
const bcrypt = require('bcryptjs');
const { dbGet, dbAll, dbRun, withTransaction } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { uploadFotoAgente } = require('../middleware/upload');
const { registrarLog } = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

/* GET /api/admin/agentes ------------------------------------------------ */
router.get('/', asyncHandler(async (req, res) => {
  const agentes = await dbAll(
    `SELECT a.*, u.usuario, u.ativo
     FROM agentes a JOIN usuarios u ON u.id = a.usuario_id
     ORDER BY a.nome`
  );
  res.json(agentes);
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const agente = await dbGet(
    `SELECT a.*, u.usuario, u.ativo
     FROM agentes a JOIN usuarios u ON u.id = a.usuario_id
     WHERE a.id = ?`,
    [req.params.id]
  );
  if (!agente) return res.status(404).json({ erro: 'Agente não encontrado.' });
  res.json(agente);
}));

/* POST /api/admin/agentes — cria login + perfil de um novo player ------- */
router.post('/', asyncHandler(async (req, res) => {
  const {
    usuario, senha, nome, codinome, cargo,
    nivel_autorizacao, status, observacoes
  } = req.body;

  if (!usuario || !senha || !nome) {
    return res.status(400).json({ erro: 'Usuário, senha e nome são obrigatórios.' });
  }

  const jaExiste = await dbGet(`SELECT id FROM usuarios WHERE usuario = ?`, [usuario.trim()]);
  if (jaExiste) {
    return res.status(409).json({ erro: 'Esse nome de usuário já está em uso.' });
  }

  const hash = bcrypt.hashSync(senha, 10);

  const novoId = await withTransaction(async (tx) => {
    const usuarioRow = await tx.get(
      `INSERT INTO usuarios (usuario, senha_hash, tipo, ativo) VALUES (?, ?, 'agente', 1) RETURNING id`,
      [usuario.trim(), hash]
    );

    const agenteRow = await tx.get(
      `INSERT INTO agentes (usuario_id, nome, codinome, cargo, nivel_autorizacao, status, observacoes)
       VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
      [
        usuarioRow.id,
        nome,
        codinome || null,
        cargo || null,
        Number(nivel_autorizacao) || 1,
        status || 'Ativo',
        observacoes || null
      ]
    );

    return agenteRow.id;
  });

  registrarLog({
    usuarioId: req.session.usuarioId,
    usuarioNome: req.session.usuarioNome,
    tipoAcao: 'AGENTE_CRIADO',
    detalhe: `Novo agente: ${nome} (usuário: ${usuario})`,
    ip: req.ip
  });

  res.status(201).json({ ok: true, id: novoId });
}));

/* PUT /api/admin/agentes/:id — edita perfil (e opcionalmente senha) ----- */
router.put('/:id', asyncHandler(async (req, res) => {
  const agente = await dbGet(`SELECT * FROM agentes WHERE id = ?`, [req.params.id]);
  if (!agente) return res.status(404).json({ erro: 'Agente não encontrado.' });

  const {
    nome, codinome, cargo, nivel_autorizacao, status, observacoes,
    novaSenha, ativo
  } = req.body;

  await dbRun(
    `UPDATE agentes SET nome=?, codinome=?, cargo=?, nivel_autorizacao=?, status=?, observacoes=?
     WHERE id=?`,
    [
      nome ?? agente.nome,
      codinome ?? agente.codinome,
      cargo ?? agente.cargo,
      nivel_autorizacao != null ? Number(nivel_autorizacao) : agente.nivel_autorizacao,
      status ?? agente.status,
      observacoes ?? agente.observacoes,
      agente.id
    ]
  );

  if (novaSenha) {
    const hash = bcrypt.hashSync(novaSenha, 10);
    await dbRun(`UPDATE usuarios SET senha_hash = ? WHERE id = ?`, [hash, agente.usuario_id]);
  }

  if (typeof ativo === 'boolean') {
    await dbRun(`UPDATE usuarios SET ativo = ? WHERE id = ?`, [ativo ? 1 : 0, agente.usuario_id]);
  }

  registrarLog({
    usuarioId: req.session.usuarioId,
    usuarioNome: req.session.usuarioNome,
    tipoAcao: 'AGENTE_EDITADO',
    detalhe: `Agente #${agente.id} — ${nome || agente.nome}`,
    ip: req.ip
  });

  res.json({ ok: true });
}));

/* POST /api/admin/agentes/:id/foto — upload de foto do agente ---------- */
router.post('/:id/foto', uploadFotoAgente.single('foto'), asyncHandler(async (req, res) => {
  const agente = await dbGet(`SELECT * FROM agentes WHERE id = ?`, [req.params.id]);
  if (!agente) return res.status(404).json({ erro: 'Agente não encontrado.' });
  if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

  await dbRun(`UPDATE agentes SET foto = ? WHERE id = ?`, [
    `fotos_agentes/${req.file.filename}`,
    agente.id
  ]);
  res.json({ ok: true, foto: `fotos_agentes/${req.file.filename}` });
}));

/* DELETE /api/admin/agentes/:id — remove agente e o login associado ----- */
router.delete('/:id', asyncHandler(async (req, res) => {
  const agente = await dbGet(`SELECT * FROM agentes WHERE id = ?`, [req.params.id]);
  if (!agente) return res.status(404).json({ erro: 'Agente não encontrado.' });

  await dbRun(`DELETE FROM usuarios WHERE id = ?`, [agente.usuario_id]); // cascata remove agentes

  registrarLog({
    usuarioId: req.session.usuarioId,
    usuarioNome: req.session.usuarioNome,
    tipoAcao: 'AGENTE_REMOVIDO',
    detalhe: `Agente #${agente.id} — ${agente.nome}`,
    ip: req.ip
  });

  res.json({ ok: true });
}));

module.exports = router;
