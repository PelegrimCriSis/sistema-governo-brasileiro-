/* =======================================================================
   B.I.P. — Executor de seed via linha de comando
   Uso: npm run seed
   (o seed também roda automaticamente toda vez que o servidor sobe)
   ======================================================================= */

require('dotenv').config();

const { initDb, pool } = require('./database');
const { seed } = require('./seed');

(async () => {
  try {
    await initDb();
    await seed();
  } catch (err) {
    console.error('[SEED] Falhou:', err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
