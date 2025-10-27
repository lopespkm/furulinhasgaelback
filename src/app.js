const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const path = require('path');

// Importar middlewares personalizados
const authMiddleware = require('./middleware/auth.middleware');
const uploadMiddleware = require('./middleware/upload.middleware');

// Importar rotas
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const scratchCardRoutes = require('./routes/scratchcard.routes');
const depositRoutes = require('./routes/deposit.routes');
const adminRoutes = require('./routes/admin.routes');
const licenseRoutes = require('./routes/license.routes');
const settingRoutes = require('./routes/setting.routes');
const webhookRoutes = require('./routes/webhook.routes');

// Criar instância do Express
const app = express();

// Configurar proxy trust (para obter IP real atrás de proxies)
app.set('trust proxy', 1);

// Middlewares de segurança
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configurado
app.use(cors({
  origin: '*',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting global
const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // máximo 1000 requisições por IP por janela
  message: {
    success: false,
    message: 'Muitas requisições deste IP, tente novamente mais tarde'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use(globalLimiter);

// Compressão de resposta
app.use(compression());

// Logging de requisições
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Parsing de JSON e URL encoded
app.use(express.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    try {
      JSON.parse(buf);
    } catch (e) {
      // Não enviar resposta aqui, deixar para o middleware de erro
      const error = new Error('JSON inválido');
      error.status = 400;
      error.type = 'entity.parse.failed';
      throw error;
    }
  }
}));

app.use(express.urlencoded({ 
  extended: true, 
  limit: '10mb' 
}));

// Servir arquivos estáticos (uploads)
app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// Middleware de log personalizado
app.use(authMiddleware.logRequest);

// Rota de health check
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Servidor funcionando corretamente',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Rota raiz
app.get('/', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Olá amigo, o que perdeu aqui?',
    version: '1.0.0',
    // documentation: '/api/docs',
    // endpoints: {
    //   auth: '/api/auth',
    //   users: '/api/users',
    //   scratchcards: '/api/scratchcards',
    //   deposits: '/api/deposits',
    //   admin: '/api/admin',
    //   license: '/api/license',
    //   health: '/health'
    // }
  });
});

// Versionamento de rotas
const v1Router = "/v1"

// Rotas da API
app.use(v1Router + '/api/auth', authRoutes);
app.use(v1Router + '/api/users', userRoutes);
app.use(v1Router + '/api/scratchcards', scratchCardRoutes);
app.use(v1Router + '/api/deposits', depositRoutes);
app.use(v1Router + '/api/admin', adminRoutes);
app.use(v1Router + '/api/license', licenseRoutes);
app.use(v1Router + '/api/setting', settingRoutes);
app.use(v1Router + '/api/payments', webhookRoutes);

// Middleware para rotas não encontradas
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Rota não encontrada',
    path: req.originalUrl,
    method: req.method
  });
});

// Middleware de tratamento de erros do upload
app.use(uploadMiddleware.handleError);

// Middleware global de tratamento de erros
app.use(authMiddleware.errorHandler);

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('Erro não capturado:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Promise rejeitada não tratada:', reason);
  console.error('Promise:', promise);
  process.exit(1);
});

module.exports = app;