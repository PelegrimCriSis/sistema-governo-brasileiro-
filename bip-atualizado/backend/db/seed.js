/* =======================================================================
   B.I.P. — Seed inicial
   Cria o usuário administrador padrão se ainda não existir nenhum.
   Roda automaticamente ao iniciar o servidor (ver server.js).
   ======================================================================= */

const bcrypt = require('bcryptjs');
const { dbGet, dbRun } = require('./database');

async function seed() {
  const existeAdmin = await dbGet(`SELECT id FROM usuarios WHERE tipo = 'admin' LIMIT 1`);

  if (existeAdmin) {
    console.log('[SEED] Já existe um administrador cadastrado. Nada a fazer.');
    return;
  }

  const usuario = 'admin';
  const senha = 'branch-admin-2026'; // TROQUE a senha após o primeiro login!
  const hash = bcrypt.hashSync(senha, 10);

  await dbRun(
    `INSERT INTO usuarios (usuario, senha_hash, tipo, ativo) VALUES (?, ?, 'admin', 1)`,
    [usuario, hash]
  );

  console.log('=======================================================');
  console.log('[SEED] Administrador criado com sucesso.');
  console.log(`       Usuário: ${usuario}`);
  console.log(`       Senha:   ${senha}`);
  console.log('       >>> TROQUE ESSA SENHA assim que entrar no sistema <<<');
  console.log('=======================================================');

  // Categorias básicas de exemplo (estrutura, não conteúdo de caso)
  const categorias = ['Geral', 'Paranormal', 'Vigilância', 'Interrogatório', 'Científico'];
  for (const nome of categorias) {
    await dbRun(`INSERT INTO categorias (nome) VALUES (?) ON CONFLICT (nome) DO NOTHING`, [nome]);
  }
}

module.exports = { seed };
