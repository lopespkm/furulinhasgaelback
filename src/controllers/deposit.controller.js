const depositService = require('../services/deposit.service');
const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

class DepositController {
  /**
   * Criar um novo depósito PIX
   * POST /api/deposits/create
   */
  async createDeposit(req, res) {
    try {
      const userId = req.user.id;
      const { amount, paymentMethod = 'PIX', gateway } = req.body;

      // Validações
      if (!amount || amount <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Valor do depósito deve ser maior que zero'
        });
      }

      if (amount < 1) {
        return res.status(400).json({
          success: false,
          message: 'Valor mínimo para depósito é R$ 1,00'
        });
      }

      if (amount > 10000) {
        return res.status(400).json({
          success: false,
          message: 'Valor máximo para depósito é R$ 10.000,00'
        });
      }

      const depositData = {
        userId,
        amount: parseFloat(amount),
        paymentMethod,
        gateway
      };

      const result = await depositService.createDeposit(depositData);

      res.status(201).json({
        success: true,
        message: 'Depósito criado com sucesso',
        data: result
      });
    } catch (error) {
      console.error('❌ Erro no controller de depósito:', error.message);
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Webhook para confirmação de pagamento
   * POST /api/deposits/webhook/:gateway
   */
  async processWebhook(req, res) {
    try {
      const { gateway } = req.params;
      const webhookData = req.body;

      console.log('📨 Webhook recebido:', {
        gateway,
        transactionId: webhookData.id || webhookData.requestBody?.transactionId,
        externalId: webhookData.external_id || webhookData.requestBody?.external_id,
        status: webhookData.status || webhookData.requestBody?.status,
        amount: webhookData.amount || webhookData.requestBody?.amount,
        paymentType: webhookData.paymentType || webhookData.requestBody?.paymentType
      });

      const result = await depositService.processPaymentConfirmation(webhookData, gateway);

      res.status(200).json({
        success: true,
        message: result.message,
        data: result
      });
    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error.message);
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Buscar histórico de depósitos do usuário
   * GET /api/deposits/history
   */
  async getDepositHistory(req, res) {
    try {
      const userId = req.user.id;
      const { limit = 50 } = req.query;

      const deposits = await depositService.getUserDeposits(userId, parseInt(limit));

      res.status(200).json({
        success: true,
        message: 'Histórico de depósitos recuperado com sucesso',
        data: deposits,
        count: deposits.length
      });
    } catch (error) {
      console.error('❌ Erro ao buscar histórico de depósitos:', error.message);
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Verificar status de um depósito específico
   * GET /api/deposits/:id/status
   */
  async checkDepositStatus(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID do depósito é obrigatório'
        });
      }

      const deposit = await depositService.checkDepositStatus(id);

      // Verificar se o depósito pertence ao usuário (segurança)
      if (deposit.user.id !== userId && !req.user.is_admin) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado a este depósito'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Status do depósito recuperado com sucesso',
        data: deposit
      });
    } catch (error) {
      console.error('❌ Erro ao verificar status do depósito:', error.message);
      
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Confirmar depósito manualmente (apenas admin)
   * POST /api/deposits/:id/confirm
   */
  async confirmDeposit(req, res) {
    try {
      const { id } = req.params;
      const userId = req.user.id;

      // Verificar se é admin
      if (!req.user.is_admin) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores podem confirmar depósitos manualmente'
        });
      }

      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID do depósito é obrigatório'
        });
      }

      const paymentData = {
        paidAt: new Date(),
        status: 'PAID',
        confirmedBy: userId
      };

      const result = await depositService.confirmDeposit(id, paymentData);

      res.status(200).json({
        success: true,
        message: 'Depósito confirmado manualmente com sucesso',
        data: {
          id: result.id,
          amount: result.amount,
          status: result.status,
          paid_at: result.paid_at
        }
      });
    } catch (error) {
      console.error('❌ Erro ao confirmar depósito manualmente:', error.message);
      
      if (error.message.includes('não encontrado')) {
        return res.status(404).json({
          success: false,
          message: error.message
        });
      }
      
      if (error.message.includes('já foi confirmado')) {
        return res.status(400).json({
          success: false,
          message: error.message
        });
      }
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Listar todos os depósitos (apenas admin)
   * GET /api/deposits/admin/all
   */
  async getAllDeposits(req, res) {
    try {
      // Verificar se é admin
      if (!req.user.is_admin) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Apenas administradores podem ver todos os depósitos'
        });
      }

      const { limit = 100, status, userId } = req.query;
      
      const filters = {};
      if (status !== undefined) {
        filters.status = status === 'true';
      }
      if (userId) {
        filters.userId = userId;
      }

      const deposits = await prisma.deposit.findMany({
        where: filters,
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              email: true,
              username: true
            }
          },
          wallet: {
            select: {
              id: true,
              balance: true,
              currency: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        take: parseInt(limit)
      });

      res.status(200).json({
        success: true,
        message: 'Todos os depósitos recuperados com sucesso',
        data: deposits,
        count: deposits.length
      });
    } catch (error) {
      console.error('❌ Erro ao buscar todos os depósitos:', error.message);
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

module.exports = new DepositController();