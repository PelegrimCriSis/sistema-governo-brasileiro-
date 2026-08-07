# B.I.P. — Branch Intelligence Portal

Portal interno fictício da agência **BRANCH**, feito para uso em campanha de RPG.
Node.js + Express + **PostgreSQL** (Supabase), com login real, controle de níveis
de autorização e painel administrativo completo (nada precisa ser editado no
código — tudo é gerenciado pela interface).

> ⚠️ Este pacote foi montado em um ambiente sem acesso à internet nem a um
> banco Postgres real, então o código não pôde ser testado rodando de
> verdade aqui. A sintaxe de todos os arquivos `.js` foi validada
> (`node --check`), mas rode os testes abaixo assim que instalar/conectar a
> um banco de verdade, e me avise se algo travar.

---

## 1. Pré-requisitos

- [Node.js](https://nodejs.org) versão 18 ou mais recente (vem com `npm`)
- Uma conta gratuita no [Supabase](https://supabase.com) (banco Postgres)
- Uma conta gratuita no [Render](https://render.com) (hospedagem do servidor), se for fazer deploy

## 2. Banco de dados (Supabase)

1. Crie um projeto novo em [supabase.com](https://supabase.com).
2. Vá em **Project Settings → Database → Connection string**, aba **URI**.
3. Copie a connection string (algo como
   `postgresql://postgres:SUA_SENHA@db.xxxxxxxx.supabase.co:5432/postgres`).
   - Se preferir usar o *connection pooler* do Supabase (recomendado em
     produção, evita esgotar conexões), use a versão da porta `6543`
     ("Transaction" mode) em vez da `5432`.
4. Guarde essa string — ela vai virar a variável de ambiente `DATABASE_URL`.

O app **cria as tabelas sozinho** na primeira vez que sobe (não precisa
rodar nenhum script `.sql` manualmente no Supabase).

## 3. Instalação local

Abra um terminal na pasta do projeto e rode:

```bash
npm install
```

Isso baixa as dependências: `express`, `pg` (driver do Postgres), `bcryptjs`,
`express-session` e `multer`.

Copie `.env.example` para `.env` e preencha `DATABASE_URL` com a connection
string do Supabase (passo 2):

```bash
cp .env.example .env
```

## 4. Primeira execução

```bash
npm start
```

Na primeira vez, o sistema:

1. Conecta no Postgres (Supabase) usando `DATABASE_URL`;
2. Cria automaticamente as tabelas (`CREATE TABLE IF NOT EXISTS`);
3. Cria um usuário **administrador padrão**:

```
Usuário: admin
Senha:   branch-admin-2026
```

**Troque essa senha assim que entrar** (Painel Admin → Agentes não se aplica
ao admin — a senha do admin é trocada diretamente no banco por enquanto; se
quiser, posso adicionar uma tela de "trocar minha própria senha" depois).

Acesse: `http://localhost:3000`

## 5. Deploy (Supabase + Render)

O banco fica no **Supabase** (passo 2, acima) e o servidor Node/Express fica
no **Render**. São dois serviços separados conversando via `DATABASE_URL`.

### 5.1. Suba o código num repositório Git
O Render faz deploy a partir de um repositório GitHub/GitLab. Suba esta
pasta (`bip/`) para um repositório novo.

### 5.2. Crie o Web Service no Render
Duas formas:

**Opção A — Blueprint automático (arquivo `render.yaml` incluído):**
No painel do Render, "New" → "Blueprint", aponte para o repositório. Ele lê
o `render.yaml` deste projeto e já configura build, start e um disco
persistente para `uploads/`. Depois, defina manualmente a variável
`DATABASE_URL` em **Environment** (ela não vai no `render.yaml` por
segurança).

**Opção B — Manual:**
"New" → "Web Service", aponte para o repositório, e configure:
- **Build command:** `npm install`
- **Start command:** `npm start`
- **Health check path:** `/healthz`

Em **Environment**, adicione:

| Variável         | Valor                                                        |
|------------------|---------------------------------------------------------------|
| `DATABASE_URL`   | connection string do Supabase (passo 2)                       |
| `SESSION_SECRET` | uma string aleatória longa (ex.: `openssl rand -hex 32`)      |
| `NODE_ENV`       | `production`                                                   |

### 5.3. Uploads em produção (importante)
Os arquivos enviados (documentos, fotos de agentes, anexos de casos) são
salvos em disco, na pasta `uploads/`. O sistema de arquivos do Render é
**efêmero** por padrão — some a cada novo deploy. Para persistir os
uploads entre deploys, use um **disco persistente** do Render montado em
`uploads/` (o `render.yaml` incluso já faz isso automaticamente). Se você
usar a Opção B (manual), adicione um disco em **Disks** apontando para
`uploads/` dentro do serviço.

> Alternativa mais robusta (não implementada aqui, mas posso montar depois
> se quiser): trocar o armazenamento local por um bucket do **Supabase
> Storage**, que já está no mesmo projeto do banco.

### 5.4. Pronto
Depois do primeiro deploy, o Render te dá uma URL pública
(`https://seu-app.onrender.com`). O app cria as tabelas e o admin padrão
automaticamente na primeira subida, exatamente como localmente.

## 6. Estrutura do projeto

```
bip/
├── server.js                  → ponto de entrada do servidor Express
├── render.yaml                 → configuração de deploy no Render
├── .env.example                → variáveis de ambiente esperadas
├── backend/
│   ├── db/
│   │   ├── database.js        → conexão Postgres (pg) + criação das tabelas
│   │   ├── seed.js             → cria o admin padrão (chamado no boot do servidor)
│   │   └── runSeed.js          → executa o seed manualmente via `npm run seed`
│   ├── middleware/
│   │   ├── auth.js            → requireAuth / requireAdmin / requireNivel
│   │   └── upload.js          → configuração do Multer (uploads)
│   ├── routes/
│   │   ├── authRoutes.js      → login, logout, sessão atual
│   │   ├── portalRoutes.js    → APIs do Portal do Agente (somente leitura,
│   │   │                        filtradas por nível de autorização)
│   │   ├── adminAgentesRoutes.js
│   │   ├── adminCasosRoutes.js
│   │   ├── adminDocumentosRoutes.js
│   │   └── adminMetaRoutes.js → categorias, tags, config, logs, backup, mensagens
│   └── utils/
│       ├── logger.js          → grava eventos na tabela de logs
│       └── asyncHandler.js    → captura erros de rotas assíncronas (Express 4)
├── frontend/public/
│   ├── index.html              → tela de login
│   ├── portal.html             → Portal do Agente
│   ├── admin.html              → Painel Administrativo
│   ├── css/style.css           → tema visual (preto/vermelho, fonte "Special Elite")
│   └── js/
│       ├── api.js              → wrapper de fetch + toasts + helpers
│       ├── login.js
│       ├── portal.js
│       └── admin.js
└── uploads/                    → arquivos enviados (por tipo; ver seção 5.3)
```

## 7. Como funciona o controle de acesso

### Login para múltiplos jogadores
No Painel Admin → **Agentes** → "+ Novo Agente", você cadastra usuário, senha,
nome, codinome, cargo, foto e **nível de autorização** (I a Ultrassecreto) de
cada jogador. Cada um loga com sua própria conta — nada fica marcado no
código.

### Censura por nível de autorização
Todo caso e documento tem um campo **Nível de autorização** (1 a 5). No
servidor (não no navegador!), toda consulta de casos/documentos filtra por
`nivel_autorizacao <= nível do agente logado`. Isso quer dizer que um agente
Nível I literalmente **nunca recebe do servidor** os dados de algo Nível III
— não é só escondido na tela, é uma barreira real de acesso.

Documentos também têm as chaves **Publicado**, **Oculto** e **Permitir
download**, todas controladas pelo admin, sem precisar mexer em código.

### Sessões
Login usa sessão de servidor (cookie `bip.sid`), válida por 8 horas. Cada
jogador só vê o que sua sessão autoriza.

## 8. Visual

O tema visual foi trocado para uma paleta preto/vermelho ("Special Elite"
para títulos, "Inter" para o restante do texto). As variáveis de cor
principais estão centralizadas no topo de `frontend/public/css/style.css`
(`--background`, `--surface`, `--primary`, `--primary-hover`, `--text`,
`--text-secondary`, `--border-primary`, `--border`, `--radius`).

Os badges de **nível de autorização** (I a Ultrassecreto) mantiveram cores
distintas entre si (verde, vermelho, azul, amarelo, vermelho-alerta) de
propósito, para dar pra diferenciar rapidamente os 5 níveis à primeira
vista — se preferir que fiquem todos no tom vermelho do novo tema também,
é só pedir que eu ajusto.

A fonte "Special Elite" é carregada via Google Fonts (funciona direto, sem
precisar de arquivo local). O `@font-face` que aponta para
`../assets/fonts/SpecialElite.ttf` também foi incluído como você pediu —
se quiser usar o arquivo `.ttf` local em vez do Google Fonts, coloque-o em
`frontend/public/assets/fonts/SpecialElite.ttf`. A variável `--font-logo:
"Carbon", serif` também foi adicionada; como "Carbon" não é uma fonte
pública, ela cai no fallback `serif` a menos que você forneça esse arquivo
de fonte também.

## 9. Próximos passos sugeridos (não implementados ainda)

- Tela para o admin trocar a própria senha pela interface;
- Paginação nas tabelas grandes (hoje carregam tudo de uma vez);
- Editor de PDF diretamente no navegador (hoje o PDF é só visualizado);
- Mover uploads para o Supabase Storage (mais robusto que disco do Render).

## 10. Testando localmente

```bash
npm install
cp .env.example .env   # preencha DATABASE_URL com a string do Supabase
npm start
# abra http://localhost:3000
# login: admin / branch-admin-2026
```

Qualquer erro que aparecer no terminal ao rodar, me manda a mensagem que eu
ajusto.
