/* =======================================================================
   B.I.P. — Configuração de upload de arquivos (Multer)
   Organiza automaticamente por tipo: documentos, imagens, audios, videos
   ======================================================================= */

const path = require('path');
const fs = require('fs');
const multer = require('multer');

const UPLOAD_ROOT = path.join(__dirname, '..', '..', 'uploads');

const PASTAS_POR_TIPO = {
  '.pdf': 'documentos',
  '.txt': 'documentos',
  '.png': 'imagens',
  '.jpg': 'imagens',
  '.jpeg': 'imagens',
  '.webp': 'imagens',
  '.gif': 'imagens',
  '.mp3': 'audios',
  '.wav': 'audios',
  '.ogg': 'audios',
  '.mp4': 'videos',
  '.webm': 'videos'
};

// Garante que todas as subpastas existam
Object.values(PASTAS_POR_TIPO)
  .concat(['fotos_agentes'])
  .forEach((pasta) => {
    const full = path.join(UPLOAD_ROOT, pasta);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  });

function extensaoPermitida(nomeArquivo) {
  const ext = path.extname(nomeArquivo).toLowerCase();
  return PASTAS_POR_TIPO[ext] || null;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const pasta = extensaoPermitida(file.originalname) || 'documentos';
    cb(null, path.join(UPLOAD_ROOT, pasta));
  },
  filename(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    const nomeSeguro = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, nomeSeguro);
  }
});

const fileFilter = (req, file, cb) => {
  if (extensaoPermitida(file.originalname)) {
    return cb(null, true);
  }
  cb(new Error('Tipo de arquivo não permitido.'));
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB — ajuste conforme necessário
});

// Upload específico para foto de agente (apenas imagens)
const uploadFotoAgente = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, path.join(UPLOAD_ROOT, 'fotos_agentes'));
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `agente-${Date.now()}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const permitido = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
    cb(permitido ? null : new Error('Envie uma imagem válida.'), permitido);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Upload específico para músicas do Sistema de Músicas (admin) — apenas áudio
const uploadMusica = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, path.join(UPLOAD_ROOT, 'audios'));
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `musica-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const permitido = ['.mp3', '.wav', '.ogg'].includes(ext);
    cb(permitido ? null : new Error('Envie um arquivo de áudio válido (.mp3, .wav, .ogg).'), permitido);
  },
  limits: { fileSize: 50 * 1024 * 1024 }
});

// Upload específico para capa de documento (opcional, ex.: capa de PDF) — apenas imagens
const uploadCapa = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, path.join(UPLOAD_ROOT, 'imagens'));
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `capa-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const permitido = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
    cb(permitido ? null : new Error('Envie uma imagem válida para a capa (.png, .jpg, .jpeg, .webp).'), permitido);
  },
  limits: { fileSize: 10 * 1024 * 1024 }
});

// Upload de documento (arquivo principal + capa opcional) em um único formulário
const uploadDocumentoComCapa = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      if (file.fieldname === 'capa') {
        return cb(null, path.join(UPLOAD_ROOT, 'imagens'));
      }
      const pasta = extensaoPermitida(file.originalname) || 'documentos';
      cb(null, path.join(UPLOAD_ROOT, pasta));
    },
    filename(req, file, cb) {
      const ext = path.extname(file.originalname).toLowerCase();
      const prefixo = file.fieldname === 'capa' ? 'capa' : Date.now();
      cb(null, `${prefixo}-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
    }
  }),
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'capa') {
      const ok = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext);
      return cb(ok ? null : new Error('Capa inválida. Use .png, .jpg, .jpeg ou .webp.'), ok);
    }
    if (extensaoPermitida(file.originalname)) return cb(null, true);
    cb(new Error('Tipo de arquivo não permitido.'));
  },
  limits: { fileSize: 200 * 1024 * 1024 }
});

module.exports = {
  upload, uploadFotoAgente, uploadMusica, uploadCapa, uploadDocumentoComCapa,
  PASTAS_POR_TIPO, UPLOAD_ROOT
};
