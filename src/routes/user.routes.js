const express = require('express');
const router = express.Router();
const userController = require('../controllers/user.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Aplicar rate limiting para todas as rotas de usuário
router.use(authMiddleware.rateLimit());

// Aplicar sanitização para todas as rotas
router.use(authMiddleware.sanitizeInput);

// Todas as rotas de usuário requerem autenticação
router.use(authMiddleware.authenticate);

// GET /api/users/profile - Obter perfil do usuário
router.get('/profile', userController.getProfile);

// GET /api/users/financial-history - Histórico financeiro (depósitos e saques)
router.get('/financial-history', userController.getFinancialHistory);

// GET /api/users/game-history - Histórico de jogos
router.get('/game-history', userController.getGameHistory);

// Buscar prêmios pendentes de escolha
router.get('/redemptions/pending', userController.getPendingRedemptions);

// Escolher entre produto físico ou valor de resgate
router.post('/redemptions/choose', 
  authMiddleware.validateRequiredFields(['gameId', 'choice']),
  userController.chooseRedemption
);

// GET /api/users/pending-withdraws - Saques pendentes
router.get('/pending-withdraws', userController.getPendingWithdraws);

// POST /api/users/withdraw - Criar solicitação de saque
router.post('/withdraw', 
  authMiddleware.validateRequiredFields(['amount', 'pix_key', 'pix_type', 'document']),
  userController.createWithdraw
);

// GET /api/users/invite-code - Código de convite do usuário
router.get('/invite-code', userController.getInviteCode);

// GET /api/users/invited-users - Usuários convidados
router.get('/invited-users', userController.getInvitedUsers);

module.exports = router;