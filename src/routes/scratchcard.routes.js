const express = require('express');
const router = express.Router();
const scratchCardController = require('../controllers/scratchcard.controller');
const uploadMiddleware = require('../middleware/upload.middleware');
const authMiddleware = require('../middleware/auth.middleware');

// Rotas públicas (sem autenticação)
router.get('/', scratchCardController.getActiveScratchCards);
router.get('/:id', scratchCardController.getScratchCardById);
router.get('/:id/stats', scratchCardController.getScratchCardStats);
router.get('/:id/history', scratchCardController.getScratchCardGameHistory);

// Rotas protegidas (com autenticação)
router.post('/play', authMiddleware.authenticate, scratchCardController.playScratchCard);
router.post('/validate-purchase', authMiddleware.authenticate, scratchCardController.validatePurchase);

// Rotas de upload
router.post('/upload-image', uploadMiddleware.single('image'), scratchCardController.uploadImage);
router.post('/upload-prize-image', uploadMiddleware.single('image'), scratchCardController.uploadPrizeImage);

// ==================== ROTAS DE ADMINISTRAÇÃO ====================
// TODO: Adicionar middleware de autorização de admin quando implementado

// Gerenciamento de raspadinhas
router.get('/admin/all',   scratchCardController.getAllScratchCards);

// Criar raspadinha com upload de imagens (multipart/form-data)
router.post('/admin/create', 
  uploadMiddleware.fieldsWithDuplicates([
    { name: 'scratchcard_image', maxCount: 1 },
    { name: 'prize_images', maxCount: 10 }
  ]), 
   scratchCardController.createScratchCard
);

// Criar raspadinha apenas com JSON (sem upload)
router.post('/admin/create-json',  scratchCardController.createScratchCardJSON);

router.put('/admin/:id',  scratchCardController.updateScratchCard);
router.delete('/admin/:id', scratchCardController.deleteScratchCard);

// Gerenciamento de prêmios
router.post('/admin/:id/prizes',  scratchCardController.addPrize);
router.put('/admin/prizes/:prizeId',  scratchCardController.updatePrize);
router.delete('/admin/prizes/:prizeId', scratchCardController.deletePrize);

module.exports = router;