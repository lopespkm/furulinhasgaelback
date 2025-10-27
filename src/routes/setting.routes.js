const express = require('express');
const router = express.Router();
const settingController = require('../controllers/setting.controller');
const authMiddleware = require('../middleware/auth.middleware');
const uploadMiddleware = require('../middleware/upload.middleware');



// Buscar configurações do sistema
router.get('/', settingController.getSettings);

// Upload de imagens de configuração (logo, banners)
router.post(
  '/upload',
  authMiddleware.authenticate,
  authMiddleware.requireAdmin,
  uploadMiddleware.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'banner', maxCount: 1 },
    { name: 'banner_2', maxCount: 1 },
    { name: 'banner_3', maxCount: 1 },
    { name: 'register_banner', maxCount: 1 },
    { name: 'login_banner', maxCount: 1 },
    { name: 'deposit_banner', maxCount: 1 }
  ]),
  settingController.uploadSettingImages
);

// Atualizar configurações do sistema
router.put('/update', authMiddleware.authenticate, authMiddleware.requireAdmin, settingController.updateSetting);

// Atualizar configurações do Credentials
router.put('/credentials', authMiddleware.authenticate, authMiddleware.requireAdmin, settingController.updatePluggouSettings);



module.exports = router;