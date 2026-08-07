/* =======================================================================
   B.I.P. — Middlewares de autenticação e controle de nível de acesso
   ======================================================================= */

/** Exige que exista uma sessão válida (admin ou agente autenticado). */
function requireAuth(req, res, next) {
  if (req.session && req.session.usuarioId) {
    return next();
  }
  return res.status(401).json({ erro: 'ACESSO NEGADO — sessão inválida ou expirada.' });
}

/** Exige que o usuário logado seja administrador. */
function requireAdmin(req, res, next) {
  if (req.session && req.session.usuarioId && req.session.tipo === 'admin') {
    return next();
  }
  return res.status(403).json({ erro: 'ACESSO NEGADO — privilégios administrativos requeridos.' });
}

/**
 * Exige que o agente logado (ou admin) tenha nível de autorização
 * suficiente. Uso: requireNivel(3) — nível mínimo 3 para acessar a rota.
 * Admin sempre passa (nível máximo implícito).
 */
function requireNivel(nivelMinimo) {
  return function (req, res, next) {
    if (!req.session || !req.session.usuarioId) {
      return res.status(401).json({ erro: 'ACESSO NEGADO — sessão inválida.' });
    }
    if (req.session.tipo === 'admin') {
      return next();
    }
    const nivelAgente = req.session.nivelAutorizacao || 0;
    if (nivelAgente >= nivelMinimo) {
      return next();
    }
    return res.status(403).json({ erro: 'ACESSO NEGADO — nível de autorização insuficiente.' });
  };
}

module.exports = { requireAuth, requireAdmin, requireNivel };
