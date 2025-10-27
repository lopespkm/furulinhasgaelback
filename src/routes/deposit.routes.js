const express = require('express');
const router = express.Router();
const depositController = require('../controllers/deposit.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Aplicar rate limiting para todas as rotas de depósito
router.use(authMiddleware.rateLimit());

// Aplicar sanitização para todas as rotas
router.use(authMiddleware.sanitizeInput);

// Aplicar log de requisições
router.use(authMiddleware.logRequest);

// router.post('/webhook/:gateway', depositController.processWebhook);

// Todas as outras rotas requerem autenticação
router.use(authMiddleware.authenticate);

// POST /api/deposits/create - Criar novo depósito
router.post('/create', 
  authMiddleware.validateRequiredFields(['amount']),
  depositController.createDeposit
);

// GET /api/deposits/history - Histórico de depósitos do usuário
router.get('/history', depositController.getDepositHistory);

// GET /api/deposits/:id/status - Verificar status de um depósito
router.get('/:id/status', depositController.checkDepositStatus);

// POST /api/deposits/:id/confirm - Confirmar depósito manualmente (admin)
router.post('/:id/confirm', depositController.confirmDeposit);

// GET /api/deposits/admin/all - Listar todos os depósitos (admin)
router.get('/admin/all', depositController.getAllDeposits);

module.exports = router;