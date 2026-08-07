/* =======================================================================
   B.I.P. — BRANCH INTELLIGENCE PORTAL
   Conexão e schema do banco de dados PostgreSQL (Supabase)

   Usa o driver "pg" (node-postgres), assíncrono. A conexão é lida de
   process.env.DATABASE_URL (string de conexão do Supabase/Postgres).

   Este módulo expõe um pequeno "compat layer" (dbGet/dbAll/dbRun) que
   aceita SQL com placeholders "?" (estilo SQLite) e converte
   automaticamente para "$1, $2, ..." (estilo Postgres), para manter as
   queries do resto do backend o mais parecidas possível com o original.
   ======================================================================= */

const { Pool } = require('pg');

const CONNECTION_STRING = process.env.DATABASE_URL;

if (!CONNECTION_STRING) {
  console.warn(
    '[DB] Aviso: variável de ambiente DATABASE_URL não definida. ' +
    'Defina-a com a connection string do seu banco Postgres (ex.: Supabase).'
  );
}

/* O Supabase (e a maioria dos provedores gerenciados de Postgres) exige
   SSL. Para conexões locais (ex.: Postgres rodando em localhost/Docker
   durante desenvolvimento) o SSL geralmente não é necessário. */
const usaSSL = CONNECTION_STRING && !/localhost|127\.0\.0\.1/.test(CONNECTION_STRING);

const pool = new Pool({
  connectionString: CONNECTION_STRING,
  ssl: usaSSL ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('[DB] Erro inesperado no pool de conexões Postgres:', err.message);
});

/** Converte placeholders "?" (estilo SQLite) em "$1, $2, ..." (Postgres). */
function paraPostgres(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** Executa uma query e retorna todas as linhas. */
async function dbAll(sql, params = []) {
  const { rows } = await pool.query(paraPostgres(sql), params);
  return rows;
}

/** Executa uma query e retorna apenas a primeira linha (ou null). */
async function dbGet(sql, params = []) {
  const { rows } = await pool.query(paraPostgres(sql), params);
  return rows[0] || null;
}

/** Executa uma query de escrita (INSERT/UPDATE/DELETE) e retorna o resultado bruto do pg. */
async function dbRun(sql, params = []) {
  return pool.query(paraPostgres(sql), params);
}

/**
 * Executa uma função dentro de uma transação. A função recebe um objeto
 * { all, get, run } equivalente ao dbAll/dbGet/dbRun, mas vinculado a uma
 * única conexão/transação. Faz COMMIT automático no sucesso e ROLLBACK em
 * caso de erro.
 */
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const tx = {
      all: async (sql, params = []) => (await client.query(paraPostgres(sql), params)).rows,
      get: async (sql, params = []) => (await client.query(paraPostgres(sql), params)).rows[0] || null,
      run: async (sql, params = []) => client.query(paraPostgres(sql), params)
    };
    const resultado = await fn(tx);
    await client.query('COMMIT');
    return resultado;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/* -----------------------------------------------------------------------
   NÍVEIS DE AUTORIZAÇÃO (fixos, usados em toda a aplicação)
   1 = Nível I (mais baixo) ... 5 = Ultrassecreto (mais alto)
------------------------------------------------------------------------ */
const NIVEIS = {
  1: 'Nível I',
  2: 'Nível II',
  3: 'Nível III',
  4: 'Nível IV',
  5: 'Ultrassecreto'
};

/* -----------------------------------------------------------------------
   CRIAÇÃO DAS TABELAS (executa sempre; CREATE TABLE IF NOT EXISTS)
   Observação: colunas booleanas do modelo original (ativo, publicado,
   oculto, permitir_download, lida) foram mantidas como INTEGER (0/1),
   em vez de BOOLEAN, para que o restante do backend (que compara com
   === 1 / === 0) continue funcionando sem alterações.
------------------------------------------------------------------------ */
async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id            SERIAL PRIMARY KEY,
      usuario       TEXT UNIQUE NOT NULL,
      senha_hash    TEXT NOT NULL,
      tipo          TEXT NOT NULL CHECK(tipo IN ('admin','agente')),
      ativo         INTEGER NOT NULL DEFAULT 1,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS agentes (
      id                  SERIAL PRIMARY KEY,
      usuario_id          INTEGER UNIQUE NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      nome                TEXT NOT NULL,
      codinome            TEXT,
      cargo               TEXT,
      foto                TEXT,
      nivel_autorizacao   INTEGER NOT NULL DEFAULT 1,
      status              TEXT NOT NULL DEFAULT 'Ativo',
      observacoes         TEXT,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS categorias (
      id    SERIAL PRIMARY KEY,
      nome  TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tags (
      id    SERIAL PRIMARY KEY,
      nome  TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS casos (
      id                  SERIAL PRIMARY KEY,
      codigo              TEXT UNIQUE NOT NULL,
      titulo              TEXT NOT NULL,
      descricao           TEXT,
      categoria_id        INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
      responsavel_id      INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      status              TEXT NOT NULL DEFAULT 'Em andamento',
      nivel_autorizacao   INTEGER NOT NULL DEFAULT 1,
      observacoes         TEXT,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS documentos (
      id                  SERIAL PRIMARY KEY,
      codigo              TEXT UNIQUE NOT NULL,
      titulo              TEXT NOT NULL,
      descricao           TEXT,
      autor               TEXT,
      categoria_id        INTEGER REFERENCES categorias(id) ON DELETE SET NULL,
      caso_id             INTEGER REFERENCES casos(id) ON DELETE SET NULL,
      nivel_autorizacao   INTEGER NOT NULL DEFAULT 1,
      publicado           INTEGER NOT NULL DEFAULT 0,
      oculto              INTEGER NOT NULL DEFAULT 0,
      permitir_download   INTEGER NOT NULL DEFAULT 0,
      tipo_arquivo        TEXT,
      caminho_arquivo     TEXT,
      conteudo_rico       TEXT,
      tamanho_bytes       INTEGER,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
      atualizado_em       TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS documento_tags (
      documento_id  INTEGER NOT NULL REFERENCES documentos(id) ON DELETE CASCADE,
      tag_id        INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (documento_id, tag_id)
    );

    CREATE TABLE IF NOT EXISTS anexos (
      id            SERIAL PRIMARY KEY,
      caso_id       INTEGER NOT NULL REFERENCES casos(id) ON DELETE CASCADE,
      nome_original TEXT NOT NULL,
      caminho       TEXT NOT NULL,
      tipo_arquivo  TEXT,
      enviado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS mensagens (
      id                  SERIAL PRIMARY KEY,
      remetente_id        INTEGER REFERENCES agentes(id) ON DELETE SET NULL,
      destinatario_id     INTEGER REFERENCES agentes(id) ON DELETE CASCADE,
      assunto             TEXT NOT NULL,
      corpo               TEXT,
      nivel_autorizacao   INTEGER NOT NULL DEFAULT 1,
      lida                INTEGER NOT NULL DEFAULT 0,
      criado_em           TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS logs (
      id            SERIAL PRIMARY KEY,
      usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
      usuario_nome  TEXT,
      tipo_acao     TEXT NOT NULL,
      detalhe       TEXT,
      ip            TEXT,
      criado_em     TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS configuracoes (
      chave  TEXT PRIMARY KEY,
      valor  TEXT
    );

    CREATE TABLE IF NOT EXISTS musicas (
      id                SERIAL PRIMARY KEY,
      nome              TEXT NOT NULL,
      caminho           TEXT NOT NULL,
      tipo_arquivo      TEXT,
      tamanho_bytes     INTEGER,
      criado_em         TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  /* ---------------------------------------------------------------------
     ALTERAÇÕES ADITIVAS DE SCHEMA (compatíveis com o banco existente)
     — Sistema de músicas: cada caso e cada documento pode ter sua própria
       música (referência opcional para a tabela "musicas").
     — Documentos: capa opcional (usada principalmente para PDFs).
     Usa ADD COLUMN IF NOT EXISTS para nunca quebrar um banco já existente.
  --------------------------------------------------------------------- */
  await pool.query(`
    ALTER TABLE casos      ADD COLUMN IF NOT EXISTS musica_id     INTEGER REFERENCES musicas(id) ON DELETE SET NULL;
    ALTER TABLE documentos ADD COLUMN IF NOT EXISTS musica_id     INTEGER REFERENCES musicas(id) ON DELETE SET NULL;
    ALTER TABLE documentos ADD COLUMN IF NOT EXISTS imagem_capa   TEXT;
  `);

  /* ---------------------------------------------------------------------
     CONFIGURAÇÕES PADRÃO (só insere se ainda não existirem)
  --------------------------------------------------------------------- */
  const configPadrao = {
    nome_organizacao: 'BRANCH',
    tema: 'escuro',
    idioma: 'pt-BR',
    volume: '80',
    logo: '',
    imagem_fundo: '',

    /* -------- Sistema de músicas -------- */
    musica_inicial_id: '',       // id (musicas.id) da música principal/inicial
    musica_inicial_ativa: '0',   // '1' = tocar automaticamente ao entrar no sistema
    musica_loop: '1',            // '1' = loop contínuo
    musica_fade_ms: '1500',      // duração do fade (ms) ao iniciar/trocar de música
    musica_telas: 'login,portal' // telas onde a música principal toca (lista separada por vírgula)
  };

  for (const [chave, valor] of Object.entries(configPadrao)) {
    await pool.query(
      `INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO NOTHING`,
      [chave, valor]
    );
  }

  console.log('[DB] Conectado ao Postgres e schema verificado/criado com sucesso.');
}

module.exports = { pool, dbAll, dbGet, dbRun, withTransaction, initDb, NIVEIS };
