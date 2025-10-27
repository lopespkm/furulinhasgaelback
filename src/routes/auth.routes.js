const express = require('express');
const authController = require('../controllers/auth.controller');
const authMiddleware = require('../middleware/auth.middleware');

const router = express.Router();

// Middleware global para sanitização de entrada
router.use(authMiddleware.sanitizeInput);

// Middleware de rate limiting para rotas de autenticação
router.use(authMiddleware.rateLimit(20, 15 * 60 * 1000)); // 20 requisições por 15 minutos

// Rotas públicas (sem autenticação)
router.post('/register', 
  authMiddleware.validateRequiredFields(['email', 'password', 'cpf']),
  authController.register
);

router.post('/login', 
  authMiddleware.validateRequiredFields(['identifier', 'password']),
  authController.login
);

router.post('/validate', 
  authController.validateRegistrationData
);

router.post('/verify-token', 
  authController.verifyToken
);

// Rotas protegidas (requerem autenticação)
router.use(authMiddleware.authenticate);

router.get('/profile', 
  authController.getProfile
);

router.put('/change-password', 
  authMiddleware.validateRequiredFields(['currentPassword', 'newPassword']),
  authController.changePassword
);

router.post('/logout', 
  authController.logout
);

// Rota para refresh do perfil (dados atualizados)
router.get('/me', 
  authController.getProfile
);

module.exports = router;