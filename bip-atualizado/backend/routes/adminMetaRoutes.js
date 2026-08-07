/* =======================================================================
   B.I.P. — Admin: Categorias, Tags, Configurações, Logs, Backup, Mensagens
   ======================================================================= */

const express = require('express');
const multer = require('multer');
const { dbGet, dbAll, dbRun, withTransaction } = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const { registrarLog } = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');

const router = express.Router();
router.use(requireAdmin);

/* ---------------------------- CATEGORIAS ------------------------------ */
router.get('/categorias', asyncHandler(async (req, res) => {
  res.json(await dbAll(`SELECT * FROM categorias ORDER BY nome`));
}));
router.post('/categorias', asyncHandler(async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
  try {
    const row = await dbGet(`INSERT INTO categorias (nome) VALUES (?) RETURNING id`, [nome.trim()]);
    res.status(201).json({ ok: true, id: row.id });
  } catch {
    res.status(409).json({ erro: 'Categoria já existe.' });
  }
}));
router.delete('/categorias/:id', asyncHandler(async (req, res) => {
  await dbRun(`DELETE FROM categorias WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

/* ------------------------------- TAGS ---------------------------------- */
router.get('/tags', asyncHandler(async (req, res) => {
  res.json(await dbAll(`SELECT * FROM tags ORDER BY nome`));
}));
router.post('/tags', asyncHandler(async (req, res) => {
  const { nome } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
  try {
    const row = await dbGet(`INSERT INTO tags (nome) VALUES (?) RETURNING id`, [nome.trim()]);
    res.status(201).json({ ok: true, id: row.id });
  } catch {
    res.status(409).json({ erro: 'Tag já existe.' });
  }
}));
router.delete('/tags/:id', asyncHandler(async (req, res) => {
  await dbRun(`DELETE FROM tags WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

/* --------------------------- CONFIGURAÇÕES ------------------------------ */
router.get('/config', asyncHandler(async (req, res) => {
  const linhas = await dbAll(`SELECT chave, valor FROM configuracoes`);
  const config = {};
  linhas.forEach((l) => { config[l.chave] = l.valor; });
  res.json(config);
}));
router.put('/config', asyncHandler(async (req, res) => {
  const entradas = Object.entries(req.body || {});

  await withTransaction(async (tx) => {
    for (const [chave, valor] of entradas) {
      await tx.run(
        `INSERT INTO configuracoes (chave, valor) VALUES (?, ?)
         ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor`,
        [chave, String(valor)]
      );
    }
  });

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'CONFIGURACAO_ALTERADA', detalhe: JSON.stringify(req.body), ip: req.ip
  });

  res.json({ ok: true });
}));

/* -------------------------------- LOGS ---------------------------------- */
router.get('/logs', asyncHandler(async (req, res) => {
  const { tipo, usuario, de, ate, limite } = req.query;
  let sql = `SELECT * FROM logs WHERE 1=1`;
  const params = [];

  if (tipo) { sql += ` AND tipo_acao = ?`; params.push(tipo); }
  if (usuario) { sql += ` AND usuario_nome ILIKE ?`; params.push(`%${usuario}%`); }
  if (de) { sql += ` AND date(criado_em) >= date(?)`; params.push(de); }
  if (ate) { sql += ` AND date(criado_em) <= date(?)`; params.push(ate); }

  sql += ` ORDER BY criado_em DESC LIMIT ?`;
  params.push(Number(limite) || 500);

  res.json(await dbAll(sql, params));
}));

/* -------------------------------- BACKUP ---------------------------------
   Como o banco agora é Postgres (Supabase), não existe mais um único
   arquivo .sqlite para baixar/restaurar. Em vez disso, o backup é um
   JSON com o conteúdo de todas as tabelas — exportável e reimportável
   pela própria interface, sem depender de ferramentas externas.
   ------------------------------------------------------------------- */
const TABELAS_BACKUP = [
  'usuarios', 'agentes', 'categorias', 'tags', 'musicas', 'casos',
  'documentos', 'documento_tags', 'anexos', 'mensagens', 'logs', 'configuracoes'
];

router.get('/backup/exportar', asyncHandler(async (req, res) => {
  const dump = { geradoEm: new Date().toISOString(), versao: 1, tabelas: {} };

  for (const tabela of TABELAS_BACKUP) {
    dump.tabelas[tabela] = await dbAll(`SELECT * FROM ${tabela}`);
  }

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'BACKUP_EXPORTADO', ip: req.ip
  });

  res.setHeader('Content-Disposition', `attachment; filename="bip-backup-${Date.now()}.json"`);
  res.json(dump);
}));

const uploadMem = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

router.post('/backup/importar', uploadMem.single('arquivo'), asyncHandler(async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: 'Envie um arquivo de backup .json válido.' });
  }

  let dump;
  try {
    dump = JSON.parse(req.file.buffer.toString('utf-8'));
  } catch {
    return res.status(400).json({ erro: 'Arquivo de backup inválido (JSON malformado).' });
  }

  if (!dump || typeof dump.tabelas !== 'object') {
    return res.status(400).json({ erro: 'Arquivo de backup em formato inesperado.' });
  }

  // Ordem de exclusão/inserção respeita as dependências de chave estrangeira.
  const ordemExclusao = [
    'documento_tags', 'anexos', 'mensagens', 'logs',
    'documentos', 'casos', 'musicas', 'agentes', 'usuarios', 'tags', 'categorias', 'configuracoes'
  ];
  const ordemInsercao = [...ordemExclusao].reverse();

  await withTransaction(async (tx) => {
    for (const tabela of ordemExclusao) {
      await tx.run(`DELETE FROM ${tabela}`);
    }

    for (const tabela of ordemInsercao) {
      const linhas = dump.tabelas[tabela];
      if (!Array.isArray(linhas) || linhas.length === 0) continue;

      for (const linha of linhas) {
        const colunas = Object.keys(linha);
        const placeholders = colunas.map(() => '?').join(', ');
        const valores = colunas.map((c) => linha[c]);
        await tx.run(
          `INSERT INTO ${tabela} (${colunas.join(', ')}) VALUES (${placeholders})`,
          valores
        );
      }

      // Realinha a sequência do SERIAL após inserir IDs explícitos.
      await tx.run(
        `SELECT setval(
           pg_get_serial_sequence('${tabela}', 'id'),
           COALESCE((SELECT MAX(id) FROM ${tabela}), 1),
           (SELECT COUNT(*) FROM ${tabela}) > 0
         )`
      ).catch(() => {}); // tabelas sem coluna "id" (ex.: documento_tags) simplesmente ignoram
    }
  });

  registrarLog({
    usuarioId: req.session.usuarioId, usuarioNome: req.session.usuarioNome,
    tipoAcao: 'BACKUP_IMPORTADO', detalhe: `Gerado em: ${dump.geradoEm || 'desconhecido'}`, ip: req.ip
  });

  res.json({ ok: true });
}));

/* ----------------------------- MENSAGENS --------------------------------- */
router.get('/mensagens', asyncHandler(async (req, res) => {
  res.json(
    await dbAll(
      `SELECT m.*, ad.codinome AS destinatario_codinome
       FROM mensagens m LEFT JOIN agentes ad ON ad.id = m.destinatario_id
       ORDER BY m.criado_em DESC`
    )
  );
}));

router.post('/mensagens', asyncHandler(async (req, res) => {
  const { destinatario_id, assunto, corpo, nivel_autorizacao } = req.body;
  if (!destinatario_id || !assunto) {
    return res.status(400).json({ erro: 'Destinatário e assunto são obrigatórios.' });
  }
  const row = await dbGet(
    `INSERT INTO mensagens (remetente_id, destinatario_id, assunto, corpo, nivel_autorizacao)
     VALUES (NULL, ?, ?, ?, ?) RETURNING id`,
    [destinatario_id, assunto, corpo || '', Number(nivel_autorizacao) || 1]
  );

  res.status(201).json({ ok: true, id: row.id });
}));

router.delete('/mensagens/:id', asyncHandler(async (req, res) => {
  await dbRun(`DELETE FROM mensagens WHERE id = ?`, [req.params.id]);
  res.json({ ok: true });
}));

module.exports = router;
