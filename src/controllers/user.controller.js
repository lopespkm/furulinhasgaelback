const userService = require('../services/user.service');

class UserController {
  // GET /api/users/financial-history - Histórico financeiro
  async getFinancialHistory(req, res) {
    try {
      const userId = req.user.id;
      const financialHistory = await userService.getFinancialHistory(userId);
      
      res.status(200).json({
        success: true,
        message: 'Histórico financeiro recuperado com sucesso',
        data: financialHistory
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /api/users/game-history - Histórico de jogos
  async getGameHistory(req, res) {
    try {
      const userId = req.user.id;
      const limit = parseInt(req.query.limit) || 50;
      
      const result = await userService.getGameHistory(userId, limit);
      
      res.status(200).json({
        success: true,
        message: 'Histórico de jogos obtido com sucesso',
        data: result
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Escolher entre produto físico ou valor de resgate
  async chooseRedemption(req, res) {
    try {
      const userId = req.user.id;
      const { gameId, choice } = req.body;
      
      // Validar dados obrigatórios
      if (!gameId || !choice) {
        return res.status(400).json({
          success: false,
          message: 'ID do jogo e escolha são obrigatórios'
        });
      }
      
      const result = await userService.chooseRedemption(userId, gameId, choice);
      
      res.status(200).json({
        success: true,
        message: result.message,
        data: {
          game: result.game,
          choice: result.choice
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Buscar prêmios pendentes de escolha
  async getPendingRedemptions(req, res) {
    try {
      const userId = req.user.id;
      
      const pendingRedemptions = await userService.getPendingRedemptions(userId);
      
      res.status(200).json({
        success: true,
        message: 'Resgates pendentes obtidos com sucesso',
        data: {
          pending_redemptions: pendingRedemptions,
          total_pending: pendingRedemptions.length
        }
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // POST /api/users/withdraw - Criar solicitação de saque
  async createWithdraw(req, res) {
    try {
      const userId = req.user.id;
      const { amount, pix_key, pix_type, document } = req.body;

      // Validação dos campos obrigatórios
      if (!amount || !pix_key || !pix_type || !document) {
        return res.status(400).json({
          success: false,
          message: 'Todos os campos são obrigatórios: amount, pix_key, pix_type, document'
        });
      }

      // Validação do valor
      if (isNaN(amount) || Number(amount) <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valor deve ser um número positivo'
        });
      }

      // Validação do tipo de chave PIX
      const validPixTypes = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'RANDOM'];
      if (!validPixTypes.includes(pix_type.toUpperCase())) {
        return res.status(400).json({
          success: false,
          message: 'Tipo de chave PIX inválido. Use: CPF, CNPJ, EMAIL, PHONE ou RANDOM'
        });
      }

      const withdrawData = {
        amount: Number(amount),
        pix_key,
        pix_type: pix_type.toUpperCase(),
        document
      };

      const withdraw = await userService.createWithdraw(userId, withdrawData);
      
      res.status(201).json({
        success: true,
        message: 'Solicitação de saque criada com sucesso. Aguarde aprovação do administrador.',
        data: withdraw
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /api/users/profile - Dados do usuário
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const user = await userService.getUserWithWallet(userId);
      
      res.status(200).json({
        success: true,
        message: 'Perfil do usuário recuperado com sucesso',
        data: user
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /api/users/pending-withdraws - Saques pendentes
  async getPendingWithdraws(req, res) {
    try {
      const userId = req.user.id;
      const pendingWithdraws = await userService.getPendingWithdraws(userId);
      
      res.status(200).json({
        success: true,
        message: 'Saques pendentes recuperados com sucesso',
        data: pendingWithdraws
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /api/users/invite-code - Código de convite do usuário
  async getInviteCode(req, res) {
    try {
      const userId = req.user.id;
      const inviteCode = await userService.getUserInviteCode(userId);
      
      res.status(200).json({
        success: true,
        message: 'Código de convite recuperado com sucesso',
        data: inviteCode
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // GET /api/users/invited-users - Usuários convidados
  async getInvitedUsers(req, res) {
    try {
      const userId = req.user.id;
      const invitedUsers = await userService.getInvitedUsers(userId);
      
      res.status(200).json({
        success: true,
        message: 'Usuários convidados recuperados com sucesso',
        data: invitedUsers
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new UserController();