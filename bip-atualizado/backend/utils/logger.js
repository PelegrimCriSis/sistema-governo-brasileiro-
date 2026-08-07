/* =======================================================================
   B.I.P. — Registro de logs de auditoria
   ======================================================================= */

const { dbRun } = require('../db/database');

/**
 * Registra uma ação no log.
 * tipos comuns: 'LOGIN', 'LOGOUT', 'LOGIN_FALHO', 'DOCUMENTO_VISUALIZADO',
 * 'DOWNLOAD', 'DOCUMENTO_CRIADO', 'DOCUMENTO_EDITADO', 'DOCUMENTO_REMOVIDO'
 *
 * Assíncrona, mas "dispara e esquece" nas rotas (não é aguardada) para não
 * atrasar a resposta — qualquer erro é apenas logado no console.
 */
function registrarLog({ usuarioId = null, usuarioNome = 'desconhecido', tipoAcao, detalhe = '', ip = '' }) {
  dbRun(
    `INSERT INTO logs (usuario_id, usuario_nome, tipo_acao, detalhe, ip) VALUES (?, ?, ?, ?, ?)`,
    [usuarioId, usuarioNome, tipoAcao, detalhe, ip]
  ).catch((err) => {
    console.error('[LOGGER] Falha ao registrar log:', err.message);
  });
}

module.exports = { registrarLog };
