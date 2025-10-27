const { PrismaClient } = require('../generated/prisma');
const { createClient } = require('@supabase/supabase-js');
const prisma = new PrismaClient();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
)

class SettingService {
  /**
   * Busca todas as configurações do sistema
   * @returns {Promise<Object>} Resultado da busca
   */
  async getSettings() {
    try {
      const settings = await prisma.setting.findMany();
      
      // Filtrar credenciais sensíveis antes de retornar
      const filteredSettings = settings.map(setting => {
        const { pluggou_api_key, pluggou_organization_id, ...publicSettings } = setting;
        return publicSettings;
      });
      
      return {
        success: true,
        data: filteredSettings,
        message: 'Configurações recuperadas com sucesso.'
      };
    } catch (error) {
      console.error('❌ Erro ao buscar configurações:', error.message);
      return {
        success: false,
        data: null,
        message: error.message || 'Erro ao buscar configurações.'
      };
    }
  }

  /**
   * Upload dinâmico de arquivos para o Supabase e atualização do Setting
   * @param {Object} files - Arquivos a serem enviados (logo, banner, banner_2, banner_3)
   * @returns {Promise<Object>} Resultado do upload e update
   */
  async uploadSettingImages(files) {
    try {
      const bucket = process.env.SUPABASE_BUCKET;
      if (!bucket) throw new Error('Bucket do Supabase não configurado');

      // Buscar o registro atual
      const [setting] = await prisma.setting.findMany();
      if (!setting) throw new Error('Configuração não encontrada');

      // Campos a atualizar
      const updateData = {};
      const fs = require('fs').promises;
      console.log('Arquivos recebidos:', files);
      // Função auxiliar para upload
      const uploadAndGetUrl = async (file, field) => {
        if (!file) return null;
        const ext = file.originalname.split('.').pop();
        // Salva sempre na pasta settings/<tipo>/<timestamp>-<nome>
        const filePath = `settings/${field}/${Date.now()}-${file.originalname}`;
        // Lê o buffer do arquivo salvo localmente
        const buffer = await fs.readFile(file.path);
        const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
          contentType: file.mimetype,
          upsert: true
        });
        if (error) throw new Error(`Erro ao fazer upload de ${field}: ${error.message}`);
        // URL pública
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return data.publicUrl;
      };

      // Para cada campo, se veio arquivo, faz upload e atualiza
      if (files.logo) {
        updateData.plataform_logo = await uploadAndGetUrl(files.logo, 'logo');
      }
      if (files.banner) {
        updateData.plataform_banner = await uploadAndGetUrl(files.banner, 'banner');
      }
      if (files.banner_2) {
        updateData.plataform_banner_2 = await uploadAndGetUrl(files.banner_2, 'banner_2');
      }
      if (files.banner_3) {
        updateData.plataform_banner_3 = await uploadAndGetUrl(files.banner_3, 'banner_3');
      }
      if (files.register_banner) {
        updateData.register_banner = await uploadAndGetUrl(files.register_banner, 'register_banner');
      }
      if (files.login_banner) {
        updateData.login_banner = await uploadAndGetUrl(files.login_banner, 'login_banner');
      }
      if (files.deposit_banner) {
        updateData.deposit_banner = await uploadAndGetUrl(files.deposit_banner, 'deposit_banner');
      }

      // Só atualiza se tiver algo novo
      if (Object.keys(updateData).length === 0) {
        return { success: false, message: 'Nenhum arquivo enviado para upload.' };
      }

      const updated = await prisma.setting.update({
        where: { id: setting.id },
        data: updateData
      });

      return {
        success: true,
        data: updated,
        message: 'Configurações atualizadas com sucesso!'
      };
    } catch (error) {
      console.error('❌ Erro no upload de arquivos do Setting:', error.message);
      return {
        success: false,
        data: null,
        message: error.message || 'Erro ao fazer upload dos arquivos.'
      };
    }
  }

  /**
   * Atualizar plataform_name e plataform_description
   * @param {Object} data - Dados a serem atualizados (plataform_name, plataform_description)
   * @returns {Promise<Object>} Resultado da atualização
   */
  async updateSetting(data) {
    try {
      const [setting] = await prisma.setting.findMany();
      if (!setting) throw new Error('Configuração não encontrada');

      // Permitir atualização parcial
      const updateFields = {};
      if (typeof data.plataform_name === 'string' && data.plataform_name.trim() !== '') {
        updateFields.plataform_name = data.plataform_name.trim();
      }
      if (typeof data.plataform_description === 'string' && data.plataform_description.trim() !== '') {
        updateFields.plataform_description = data.plataform_description.trim();
      }
      if (Object.keys(updateFields).length === 0) {
        return {
          success: false,
          data: null,
          message: 'Nenhum campo válido para atualizar.'
        };
      }

      const updated = await prisma.setting.update({
        where: { id: setting.id },
        data: updateFields
      });
      return {
        success: true,
        data: updated,
        message: 'Configurações atualizadas com sucesso!'
      };
    } catch (error) {
      console.error('❌ Erro ao atualizar configurações:', error.message);
      return {
        success: false,
        data: null,
        message: error.message || 'Erro ao atualizar configurações.'
      };
    }
  }

  /**
   * Atualizar configurações do Pluggou
   * @param {Object} data - Dados a serem atualizados (pluggou_base_url, pluggou_api_key, pluggou_organization_id)
   * @returns {Promise<Object>} Resultado da atualização
   */
  async updatePluggouSettings(data) {
    try {
      const [setting] = await prisma.setting.findMany();
      if (!setting) throw new Error('Configuração não encontrada');

      // Permitir atualização parcial
      const updateFields = {};
      if (typeof data.pluggou_base_url === 'string' && data.pluggou_base_url.trim() !== '') {
        updateFields.pluggou_base_url = data.pluggou_base_url.trim();
      }
      if (typeof data.pluggou_api_key === 'string' && data.pluggou_api_key.trim() !== '') {
        updateFields.pluggou_api_key = data.pluggou_api_key.trim();
      }
      if (typeof data.pluggou_organization_id === 'string' && data.pluggou_organization_id.trim() !== '') {
        updateFields.pluggou_organization_id = data.pluggou_organization_id.trim();
      }
      if (Object.keys(updateFields).length === 0) {
        return {
          success: false,
          data: null,
          message: 'Nenhum campo válido para atualizar.'
        };
      }

      const updated = await prisma.setting.update({
        where: { id: setting.id },
        data: updateFields
      });
      return {
        success: true,
        data: updated,
        message: 'Configurações do Pluggou atualizadas com sucesso!'
      };
    } catch (error) {
      console.error('❌ Erro ao atualizar configurações do Pluggou:', error.message);
      return {
        success: false,
        data: null,
        message: error.message || 'Erro ao atualizar configurações do Pluggou.'
      };
    }
  }

}

module.exports = new SettingService();