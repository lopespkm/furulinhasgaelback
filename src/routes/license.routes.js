const express = require('express');
const router = express.Router();
const licenseController = require('../controllers/license.controller');
const authMiddleware = require('../middleware/auth.middleware');


router.use(authMiddleware.authenticate);
router.use(authMiddleware.requireAdmin);

// ==================== ROTAS DE LICENÇA ====================

// Obter licença atual
router.get('/current', licenseController.getCurrentLicense);

// Verificar status da licença
router.get('/status', licenseController.checkLicenseStatus);

// Editar créditos da licença
router.patch('/credits', licenseController.editCredits);

// Adicionar saldo à licença (earnings)
router.patch('/earnings', licenseController.addEarnings);

// Atualizar parâmetros da licença
router.patch('/params', licenseController.updateLicenseParams);

// Verificar se há créditos suficientes para uma operação
router.post('/check-credits', licenseController.hasEnoughCredits);

// Listar registros de uso da licença
router.get('/usage', licenseController.listUsageRecords);

// Obter estatísticas de uso da licença
router.get('/stats', licenseController.getLicenseUsageStats);

module.exports = router;