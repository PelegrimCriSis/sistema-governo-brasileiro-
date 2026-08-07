/* =======================================================================
   B.I.P. — Wrapper para handlers assíncronos do Express
   O Express 4 não captura rejeições de Promises automaticamente; este
   wrapper garante que qualquer erro (ex.: falha de query no Postgres)
   caia no middleware de tratamento de erros em vez de travar o processo.
   ======================================================================= */

function asyncHandler(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

module.exports = { asyncHandler };
