const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middleware/auth.middleware');

// Middleware de autenticação para todas as rotas de admin
// TODO: Adicionar middleware de autorização específico para admin
router.use(authMiddleware.authenticate);
router.use(authMiddleware.requireAdmin);

// ==================== ROTAS DE USUÁRIOS ====================

// Listar todos os usuários
router.get('/users', adminController.getAllUsers);

// Obter usuário específico
router.get('/users/:userId', adminController.getUserById);

// Atualizar usuário
router.put('/users/:userId', adminController.updateUser);

// Ativar/Desativar usuário
router.patch('/users/:userId/toggle-status', adminController.toggleUserStatus);

// Ajustar saldo do usuário (adicionar/descontar)
router.post('/users/adjust-balance', adminController.adjustUserBalance);

// Editar porcentagem de comissão do afiliado
router.put('/affiliates/edit-commission', adminController.editAffiliateCommission);

// Manipular dados do afiliado (Total de convites, total de comissões)
router.post('/affiliates/data', adminController.adjustAffiliateTotals);

// Listar todos os usuários convidados por um usuário específico (admin view)
router.get('/affiliates/:userId/invited-users', adminController.getInvitedUsersByAdmin);

// Ativar/Desativar status is_influencer de um usuário
router.post('/affiliates/toggle-influencer', adminController.toggleIsInfluencer);

// ==================== ROTAS DE RASPADINHAS ====================

// Ativar/Desativar status is_featured de uma raspadinha
router.post('/scratchcards/toggle-featured', adminController.toggleScratchCardFeatured);

// ==================== ROTAS DE DEPÓSITOS ====================

// Listar todos os depósitos
router.get('/deposits', adminController.getAllDeposits);

// Aprovar depósito
router.patch('/deposits/:depositId/approve', adminController.approveDeposit);

// Rejeitar depósito
router.patch('/deposits/:depositId/reject', adminController.rejectDeposit);

// ==================== ROTAS DE SAQUES ====================

// Listar todos os saques
router.get('/withdrawals', adminController.getAllWithdrawals);

// Aprovar saque
router.patch('/withdrawals/:withdrawalId/approve', adminController.approveWithdrawal);

// Rejeitar saque
router.patch('/withdrawals/:withdrawalId/reject', adminController.rejectWithdrawal);

// ==================== ROTAS DE ESTATÍSTICAS ====================

// Obter estatísticas gerais do sistema
router.get('/stats', adminController.getSystemStats);

// Obter estatísticas por período
router.get('/stats/period', adminController.getStatsByPeriod);

module.exports = router;