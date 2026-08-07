/* =======================================================================
   B.I.P. — Rotas de autenticação
   ======================================================================= */

const express = require('express');
const bcrypt = require('bcryptjs');
const { dbGet } = require('../db/database');
const { registrarLog } = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();

/* POST /api/auth/login ----------------------------------------------- */
router.post('/login', asyncHandler(async (req, res) => {
  const { usuario, senha } = req.body;

  if (!usuario || !senha) {
    return res.status(400).json({ erro: 'Usuário e senha são obrigatórios.' });
  }

  const linha = await dbGet(`SELECT * FROM usuarios WHERE usuario = ? AND ativo = 1`, [usuario.trim()]);

  const senhaOk = linha ? bcrypt.compareSync(senha, linha.senha_hash) : false;

  if (!linha || !senhaOk) {
    registrarLog({
      usuarioNome: usuario,
      tipoAcao: 'LOGIN_FALHO',
      detalhe: 'Credenciais inválidas',
      ip: req.ip
    });
    return res.status(401).json({ erro: 'ACESSO NEGADO — Credenciais inválidas' });
  }

  // Monta a sessão
  req.session.usuarioId = linha.id;
  req.session.usuarioNome = linha.usuario;
  req.session.tipo = linha.tipo;

  let perfilAgente = null;
  if (linha.tipo === 'agente') {
    perfilAgente = await dbGet(`SELECT * FROM agentes WHERE usuario_id = ?`, [linha.id]);
    req.session.nivelAutorizacao = perfilAgente ? perfilAgente.nivel_autorizacao : 1;
    req.session.agenteId = perfilAgente ? perfilAgente.id : null;
  }

  registrarLog({
    usuarioId: linha.id,
    usuarioNome: linha.usuario,
    tipoAcao: 'LOGIN',
    detalhe: `Tipo: ${linha.tipo}`,
    ip: req.ip
  });

  res.json({
    ok: true,
    redirecionarPara: linha.tipo === 'admin' ? '/admin.html' : '/portal.html',
    tipo: linha.tipo,
    nome: perfilAgente ? (perfilAgente.codinome || perfilAgente.nome) : linha.usuario
  });
}));

/* POST /api/auth/logout ------------------------------------------------ */
router.post('/logout', (req, res) => {
  if (req.session && req.session.usuarioId) {
    registrarLog({
      usuarioId: req.session.usuarioId,
      usuarioNome: req.session.usuarioNome,
      tipoAcao: 'LOGOUT',
      ip: req.ip
    });
  }
  req.session.destroy(() => {
    res.clearCookie('bip.sid');
    res.json({ ok: true });
  });
});

/* GET /api/auth/me ------------------------------------------------------ */
router.get('/me', asyncHandler(async (req, res) => {
  if (!req.session || !req.session.usuarioId) {
    return res.status(401).json({ autenticado: false });
  }

  let dadosAgente = null;
  if (req.session.tipo === 'agente') {
    dadosAgente = await dbGet(
      `SELECT id, nome, codinome, cargo, foto, nivel_autorizacao, status
       FROM agentes WHERE id = ?`,
      [req.session.agenteId]
    );
  }

  res.json({
    autenticado: true,
    tipo: req.session.tipo,
    usuario: req.session.usuarioNome,
    agente: dadosAgente
  });
}));

module.exports = router;
