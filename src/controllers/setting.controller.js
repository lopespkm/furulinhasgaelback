const settingService = require('../services/setting.service');

class SettingController {
  /**
   * Buscar configurações do sistema
   */
  async getSettings(req, res) {
    try {
      const result = await settingService.getSettings();
      if (result.success) {
        return res.status(200).json({
          success: true,
          data: result.data,
          message: result.message
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Erro ao buscar configurações:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Upload de imagens de configuração (logo, banners)
   * Espera arquivos em req.files: logo, banner, banner_2, banner_3
   */
  async uploadSettingImages(req, res) {
    console.log('Upload de imagens de configuração:', req.files);
    try {
      // Suporte tanto para multipart quanto para buffer já tratado
      const files = {
        logo: req.files?.logo,
        banner: req.files?.banner,
        banner_2: req.files?.banner_2,
        banner_3: req.files?.banner_3,
        register_banner: req.files?.register_banner,
        login_banner: req.files?.login_banner,
        deposit_banner: req.files?.deposit_banner
      };
      // Se vier como array (multer), pega o primeiro
      Object.keys(files).forEach(key => {
        if (Array.isArray(files[key])) files[key] = files[key][0];
      });

      const result = await settingService.uploadSettingImages(files);
      if (result.success) {
        return res.status(200).json({
          success: true,
          data: result.data,
          message: result.message
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Erro ao fazer upload de imagens de configuração:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Atualizar plataform_name e plataform_description
   */
  async updateSetting(req, res) {
    const result = await settingService.updateSetting(req.body);
    if (result.success) {
      return res.status(200).json({
        success: true,
        data: result.data,
        message: result.message
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }
  }

  /**
   * Atualizar configurações do Pluggou
   */
  async updatePluggouSettings(req, res) {
    try {
      const result = await settingService.updatePluggouSettings(req.body);
      if (result.success) {
        return res.status(200).json({
          success: true,
          data: result.data,
          message: result.message
        });
      } else {
        return res.status(400).json({
          success: false,
          message: result.message
        });
      }
    } catch (error) {
      console.error('Erro ao atualizar configurações do Pluggou:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }
}

module.exports = new SettingController();
