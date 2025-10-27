const adminService = require('../services/admin.service');

class AdminController {
  // ==================== GESTÃO DE USUÁRIOS ====================
  
  /**
   * Listar todos os usuários
   */
  async getAllUsers(req, res) {
    try {
      const { page = 1, limit = 20, search = '' } = req.query;
      
      const result = await adminService.getAllUsers(
        parseInt(page),
        parseInt(limit),
        search
      );
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Erro ao listar usuários:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }
  
  /**
   * Obter usuário por ID
   */
  async getUserById(req, res) {
    try {
      const { userId } = req.params;
      
      const user = await adminService.getUserById(userId);
      
      res.status(200).json({
        success: true,
        data: user
      });
    } catch (error) {
      console.error('Erro ao obter usuário:', error);
      const statusCode = error.message === 'Usuário não encontrado' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }
  
  /**
   * Atualizar usuário
   */
  async updateUser(req, res) {
    try {
      const { userId } = req.params;
      const updateData = req.body;
      
      const user = await adminService.updateUser(userId, updateData);
      
      res.status(200).json({
        success: true,
        message: 'Usuário atualizado com sucesso',
        data: user
      });
    } catch (error) {
      console.error('Erro ao atualizar usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao atualizar usuário',
        error: error.message
      });
    }
  }
  
  /**
   * Ativar/Desativar usuário
   */
  async toggleUserStatus(req, res) {
    try {
      const { userId } = req.params;
      
      const user = await adminService.toggleUserStatus(userId);
      
      res.status(200).json({
        success: true,
        message: `Usuário ${user.is_active ? 'ativado' : 'desativado'} com sucesso`,
        data: user
      });
    } catch (error) {
      console.error('Erro ao alterar status do usuário:', error);
      const statusCode = error.message === 'Usuário não encontrado' ? 404 : 500;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // ==================== GESTÃO DE DEPÓSITOS ====================
  
  /**
   * Listar todos os depósitos
   */
  async getAllDeposits(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      
      const result = await adminService.getAllDeposits(
        parseInt(page),
        parseInt(limit),
        status
      );
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Erro ao listar depósitos:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }
  
  /**
   * Aprovar depósito
   */
  async approveDeposit(req, res) {
    try {
      const { depositId } = req.params;
      const adminId = req.user?.id; // Assumindo que o middleware de auth adiciona o usuário
      
      const deposit = await adminService.approveDeposit(depositId, adminId);
      
      res.status(200).json({
        success: true,
        message: 'Depósito aprovado com sucesso',
        data: deposit
      });
    } catch (error) {
      console.error('Erro ao aprovar depósito:', error);
      const statusCode = error.message.includes('não encontrado') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }
  
  /**
   * Rejeitar depósito
   */
  async rejectDeposit(req, res) {
    try {
      const { depositId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.id;
      
      const deposit = await adminService.rejectDeposit(depositId, adminId, reason);
      
      res.status(200).json({
        success: true,
        message: 'Depósito rejeitado com sucesso',
        data: deposit
      });
    } catch (error) {
      console.error('Erro ao rejeitar depósito:', error);
      const statusCode = error.message.includes('não encontrado') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // ==================== GESTÃO DE SAQUES ====================
  
  /**
   * Listar todos os saques
   */
  async getAllWithdrawals(req, res) {
    try {
      const { page = 1, limit = 20, status } = req.query;
      
      const result = await adminService.getAllWithdrawals(
        parseInt(page),
        parseInt(limit),
        status
      );
      
      res.status(200).json({
        success: true,
        data: result
      });
    } catch (error) {
      console.error('Erro ao listar saques:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }
  
  /**
   * Aprovar saque via PixUp
   */
  async approveWithdrawal(req, res) {
    try {
      const { withdrawalId } = req.params;
      const adminId = req.user?.id;
      
      if (!withdrawalId) {
        return res.status(400).json({
          success: false,
          message: 'ID do saque é obrigatório'
        });
      }
      
      const withdrawal = await adminService.approveWithdrawal(withdrawalId, adminId, 'pixup');
      
      res.status(200).json({
        success: true,
        message: 'Saque aprovado e processado via PixUp com sucesso',
        data: withdrawal
      });
    } catch (error) {
      console.error('Erro ao aprovar saque:', error);
      
      // Determinar status code baseado no tipo de erro
      let statusCode = 500;
      if (error.message.includes('não encontrado')) {
        statusCode = 404;
      } else if (error.message.includes('pendentes') || error.message.includes('obrigatório')) {
        statusCode = 400;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Erro ao aprovar saque. Tente novamente.'
      });
    }
  }
  
  /**
   * Rejeitar saque
   */
  async rejectWithdrawal(req, res) {
    try {
      const { withdrawalId } = req.params;
      const { reason } = req.body;
      const adminId = req.user?.id;
      
      const withdrawal = await adminService.rejectWithdrawal(withdrawalId, adminId, reason);
      
      res.status(200).json({
        success: true,
        message: 'Saque rejeitado com sucesso',
        data: withdrawal
      });
    } catch (error) {
      console.error('Erro ao rejeitar saque:', error);
      const statusCode = error.message.includes('não encontrado') ? 404 : 400;
      res.status(statusCode).json({
        success: false,
        message: error.message
      });
    }
  }
  
  // ==================== ESTATÍSTICAS ====================
  
  /**
   * Obter estatísticas do sistema
   */
  async getSystemStats(req, res) {
    try {
      const stats = await adminService.getSystemStats();
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erro ao obter estatísticas:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas do sistema',
        error: error.message
      });
    }
  }
  
  /**
   * Obter estatísticas por período
   */
  async getStatsByPeriod(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          message: 'Data de início e fim são obrigatórias'
        });
      }
      
      const stats = await adminService.getStatsByPeriod(startDate, endDate);
      
      res.status(200).json({
        success: true,
        data: stats
      });
    } catch (error) {
      console.error('Erro ao obter estatísticas por período:', error);
      res.status(500).json({
        success: false,
        message: 'Erro ao obter estatísticas por período',
        error: error.message
      });
    }
  }

  /**
   * Ajustar saldo do usuário (adicionar ou descontar)
   * Espera { userId, amount } no body
   */
  async adjustUserBalance(req, res) {
    try {
      const { userId, amount } = req.body;
      if (!userId || typeof amount !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'userId e amount numérico são obrigatórios.'
        });
      }
      const result = await adminService.adjustUserBalance(userId, amount);
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
      console.error('Erro ao ajustar saldo do usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
 * Editar porcentagem de comissão do afiliado
 * Espera { userId, commission_rate } no body
 */
async editAffiliateCommission(req, res) {
  try {
    const { userId, commission_rate } = req.body;
    if (!userId || typeof commission_rate !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'userId e commission_rate numérico são obrigatórios.'
      });
    }
    const result = await adminService.editAffiliateCommission(userId, commission_rate);
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
    console.error('Erro ao editar comissão do afiliado:', error);
    res.status(500).json({
      success: false,
      message: 'Erro interno do servidor',
      error: error.message
    });
  }
}

  /**
   * Ajustar manualmente total_commission e total_invites do afiliado (InviteCode)
   * Espera { userId, commissionDelta, invitesDelta } no body
   */
  async adjustAffiliateTotals(req, res) {
    try {
      const { userId, commissionDelta = 0, invitesDelta = 0 } = req.body;
      if (!userId || typeof commissionDelta !== 'number' || typeof invitesDelta !== 'number') {
        return res.status(400).json({
          success: false,
          message: 'userId, commissionDelta e invitesDelta numéricos são obrigatórios.'
        });
      }
      const result = await adminService.adjustAffiliateTotals(userId, commissionDelta, invitesDelta);
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
      console.error('Erro ao ajustar totais do afiliado:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Listar todos os usuários convidados (afiliados) por um usuário específico (admin view)
   * Espera userId como parâmetro na rota
   */
  async getInvitedUsersByAdmin(req, res) {
    try {
      const { userId } = req.params;
      if (!userId) {
        return res.status(400).json({
          success: false,
          message: 'userId é obrigatório.'
        });
      }
      const result = await adminService.getInvitedUsersByAdmin(userId);
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
      console.error('Erro ao buscar afiliados do usuário:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Ativar/Desativar status is_featured de uma raspadinha
   * Espera { scratchCardId, isFeatured } no body
   */
  async toggleScratchCardFeatured(req, res) {
    try {
      const { scratchCardId, isFeatured } = req.body;
      if (!scratchCardId || typeof isFeatured !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'scratchCardId e isFeatured (boolean) são obrigatórios.'
        });
      }
      const result = await adminService.toggleScratchCardFeatured(scratchCardId, isFeatured);
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
      console.error('Erro ao ativar/desativar raspadinha destacada:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

  /**
   * Ativar/Desativar status is_influencer de um usuário
   * Espera { userId, isInfluencer } no body
   */
  async toggleIsInfluencer(req, res) {
    try {
      const { userId, isInfluencer } = req.body;
      if (!userId || typeof isInfluencer !== 'boolean') {
        return res.status(400).json({
          success: false,
          message: 'userId e isInfluencer (boolean) são obrigatórios.'
        });
      }
      const result = await adminService.toggleIsInfluencer(userId, isInfluencer);
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
      console.error('Erro ao ativar/desativar influencer:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor',
        error: error.message
      });
    }
  }

}

module.exports = new AdminController();