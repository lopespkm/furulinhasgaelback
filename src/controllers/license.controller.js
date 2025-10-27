const LicenseService = require('../services/license.service');
const licenseService = new LicenseService();

class LicenseController {
    /**
     * Obter a licença atual
     */
    async getCurrentLicense(req, res) {
        try {
            const license = await licenseService.getCurrentLicense();
            
            res.status(200).json({
                success: true,
                data: license
            });
        } catch (error) {
            console.error('Erro ao obter licença atual:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao obter licença atual',
                error: error.message
            });
        }
    }
    
    /**
     * Listar registros de uso da licença
     */
    async listUsageRecords(req, res) {
        try {
            const { page = 1, limit = 10, userId, licenseId, scratchCardId, dateFrom, dateTo } = req.query;
            
            // Construir objeto de filtros a partir dos parâmetros da query
            const filters = {};
            if (userId) filters.userId = userId;
            if (licenseId) filters.licenseId = licenseId;
            if (scratchCardId) filters.scratchCardId = scratchCardId;
            if (dateFrom) filters.dateFrom = dateFrom;
            if (dateTo) filters.dateTo = dateTo;
            
            const result = await licenseService.listUsageRecords(
                filters,
                parseInt(page),
                parseInt(limit)
            );
            
            res.status(200).json(result);
        } catch (error) {
            console.error('Erro ao listar registros de uso:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao listar registros de uso',
                error: error.message
            });
        }
    }
    
    /**
     * Obter estatísticas de uso da licença
     */
    async getLicenseUsageStats(req, res) {
        try {
            const { userId, licenseId, dateFrom, dateTo } = req.query;
            
            // Construir objeto de filtros a partir dos parâmetros da query
            const filters = {};
            if (userId) filters.userId = userId;
            if (licenseId) filters.licenseId = licenseId;
            if (dateFrom) filters.dateFrom = dateFrom;
            if (dateTo) filters.dateTo = dateTo;
            
            const result = await licenseService.getLicenseUsageStats(filters);
            
            res.status(200).json(result);
        } catch (error) {
            console.error('Erro ao obter estatísticas de uso:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao obter estatísticas de uso',
                error: error.message
            });
        }
    }

    /**
     * Verificar o status da licença
     */
    async checkLicenseStatus(req, res) {
        try {
            const status = await licenseService.checkLicenseStatus();
            
            res.status(200).json(status);
        } catch (error) {
            console.error('Erro ao verificar status da licença:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao verificar status da licença',
                error: error.message
            });
        }
    }

    /**
     * Editar créditos da licença
     */
    async editCredits(req, res) {
        try {
            const { credits } = req.body;
            
            if (credits === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'O campo credits é obrigatório'
                });
            }

            const updatedLicense = await licenseService.editCredits(credits);
            
            res.status(200).json({
                success: true,
                message: 'Créditos atualizados com sucesso',
                data: updatedLicense
            });
        } catch (error) {
            console.error('Erro ao editar créditos:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao editar créditos',
                error: error.message
            });
        }
    }

    /**
     * Adicionar saldo à licença (incrementar earnings)
     */
    async addEarnings(req, res) {
        try {
            const { amount } = req.body;
            
            if (amount === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'O campo amount é obrigatório'
                });
            }

            const updatedLicense = await licenseService.addEarnings(Number(amount));
            
            res.status(200).json({
                success: true,
                message: 'Saldo adicionado com sucesso',
                data: updatedLicense
            });
        } catch (error) {
            console.error('Erro ao adicionar saldo:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao adicionar saldo',
                error: error.message
            });
        }
    }

    /**
     * Atualizar parâmetros da licença
     */
    async updateLicenseParams(req, res) {
        try {
            const { credits, credits_value, ggr_percentage, is_active } = req.body;
            
            // Verificar se pelo menos um parâmetro foi fornecido
            if (credits === undefined && credits_value === undefined && 
                ggr_percentage === undefined && is_active === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'Pelo menos um parâmetro deve ser fornecido'
                });
            }

            const params = {};
            
            if (credits !== undefined) params.credits = Number(credits);
            if (credits_value !== undefined) params.credits_value = Number(credits_value);
            if (ggr_percentage !== undefined) params.ggr_percentage = Number(ggr_percentage);
            if (is_active !== undefined) params.is_active = Boolean(is_active);

            const updatedLicense = await licenseService.updateLicenseParams(params);
            
            res.status(200).json({
                success: true,
                message: 'Parâmetros da licença atualizados com sucesso',
                data: updatedLicense
            });
        } catch (error) {
            console.error('Erro ao atualizar parâmetros da licença:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao atualizar parâmetros da licença',
                error: error.message
            });
        }
    }

    /**
     * Verificar se há créditos suficientes para uma operação
     */
    async hasEnoughCredits(req, res) {
        try {
            const { amount } = req.body;
            
            if (amount === undefined) {
                return res.status(400).json({
                    success: false,
                    message: 'O campo amount é obrigatório'
                });
            }

            const result = await licenseService.hasEnoughCredits(Number(amount));
            
            res.status(200).json(result);
        } catch (error) {
            console.error('Erro ao verificar créditos:', error);
            res.status(500).json({
                success: false,
                message: 'Erro ao verificar créditos',
                error: error.message
            });
        }
    }
}

module.exports = new LicenseController();