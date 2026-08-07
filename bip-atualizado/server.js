/* =======================================================================
   B.I.P. — BRANCH INTELLIGENCE PORTAL
   Servidor principal (Express)
   ======================================================================= */

require('dotenv').config(); // carrega o arquivo .env (uso local) para process.env

const path = require('path');
const express = require('express');
const session = require('express-session');

const { initDb } = require('./backend/db/database');
const { seed } = require('./backend/db/seed');

const authRoutes = require('./backend/routes/authRoutes');
const portalRoutes = require('./backend/routes/portalRoutes');
const adminAgentesRoutes = require('./backend/routes/adminAgentesRoutes');
const adminCasosRoutes = require('./backend/routes/adminCasosRoutes');
const adminDocumentosRoutes = require('./backend/routes/adminDocumentosRoutes');
const adminMusicasRoutes = require('./backend/routes/adminMusicasRoutes');
const adminMetaRoutes = require('./backend/routes/adminMetaRoutes');
const publicRoutes = require('./backend/routes/publicRoutes');

const app = express();
const PORTA = process.env.PORT || 3000;

/* -----------------------------------------------------------------------
   MIDDLEWARES GLOBAIS
------------------------------------------------------------------------ */
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

/* Necessário quando o app roda atrás de um proxy reverso (Render, etc.)
   para que cookies "secure" e req.ip funcionem corretamente. */
app.set('trust proxy', 1);

app.use(
  session({
    name: 'bip.sid',
    secret: process.env.SESSION_SECRET || 'branch-sessao-troque-isso-em-producao',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 8 // 8 horas
    }
  })
);

/* -----------------------------------------------------------------------
   ARQUIVOS ESTÁTICOS DO FRONT-END
   Rotas HTML "protegidas" (portal.html / admin.html) são servidas
   normalmente, mas TODO o conteúdo sensível só chega via API — então
   mesmo que alguém abra o HTML sem sessão, não vê nenhum dado real.
------------------------------------------------------------------------ */
app.use(express.static(path.join(__dirname, 'frontend', 'public')));

/* Uploads: servidos sob rota protegida (não como estático livre), exceto
   fotos de agentes, que podem ser públicas dentro do portal. */
app.use('/uploads/fotos_agentes', express.static(path.join(__dirname, 'uploads', 'fotos_agentes')));

/* -----------------------------------------------------------------------
   HEALTHCHECK — usado pelo Render para saber se o serviço está de pé
------------------------------------------------------------------------ */
app.get('/healthz', (req, res) => res.status(200).json({ ok: true }));

/* -----------------------------------------------------------------------
   ROTAS DA API
------------------------------------------------------------------------ */
app.use('/api/auth', authRoutes);
app.use('/api/portal', portalRoutes);
app.use('/api/admin/agentes', adminAgentesRoutes);
app.use('/api/admin/casos', adminCasosRoutes);
app.use('/api/admin/documentos', adminDocumentosRoutes);
app.use('/api/admin/musicas', adminMusicasRoutes);
app.use('/api/admin', adminMetaRoutes);
app.use('/api/public', publicRoutes);

/* -----------------------------------------------------------------------
   TRATAMENTO DE ERROS
------------------------------------------------------------------------ */
app.use((err, req, res, next) => {
  console.error('[ERRO]', err);
  res.status(500).json({ erro: 'Erro interno do servidor.', detalhe: err.message });
});

/* -----------------------------------------------------------------------
   FALLBACK — qualquer rota não encontrada volta pro login
------------------------------------------------------------------------ */
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ erro: 'Rota não encontrada.' });
  }
  res.status(404).sendFile(path.join(__dirname, 'frontend', 'public', 'index.html'));
});

/* -----------------------------------------------------------------------
   INICIALIZAÇÃO — garante schema + admin padrão antes de aceitar tráfego
------------------------------------------------------------------------ */
async function iniciar() {
  try {
    await initDb();  // garante que o banco/tabelas existam (Postgres)
    await seed();    // cria admin padrão se necessário

    app.listen(PORTA, () => {
      console.log('=======================================================');
      console.log(`  B.I.P. — BRANCH INTELLIGENCE PORTAL`);
      console.log(`  Servidor ativo em: http://localhost:${PORTA}`);
      console.log('=======================================================');
    });
  } catch (err) {
    console.error('[FATAL] Não foi possível iniciar o servidor:', err);
    process.exit(1);
  }
}

iniciar();
