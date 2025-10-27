const { PrismaClient } = require('../generated/prisma');
const SafiraService = require('./payments/safira.service');
const PixupService = require('./payments/pixup.service');
const DigitoService = require('./payments/digito.service');
const PluggouService = require('./payments/pluggou.service');
const prisma = new PrismaClient();

class DepositService {
  constructor() {
    // Mapeamento de gateways disponíveis
    this.gateways = {
      'safira': new SafiraService(),
      'pixup': PixupService, // PixupService já é uma instância exportada
      'digito': DigitoService, // DigitoService já é uma instância exportada
      'pluggou': PluggouService // PluggouService já é uma instância exportada
      // Aqui podem ser adicionados outros gateways no futuro
      // 'mercadopago': mercadoPagoService,
      // 'pagseguro': pagSeguroService,
    };
    
    // Gateway padrão
    this.defaultGateway = 'safira';
  }

  /**
   * Criar um novo depósito
   * @param {Object} depositData - Dados do depósito
   * @param {string} depositData.userId - ID do usuário
   * @param {number} depositData.amount - Valor do depósito
   * @param {string} depositData.paymentMethod - Método de pagamento (PIX, CARD, etc)
   * @param {string} depositData.gateway - Gateway de pagamento (opcional)
   * @returns {Promise<Object>} Dados do depósito criado
   */
  async createDeposit(depositData) {
    try {
      // Validar dados obrigatórios
      if (!depositData.userId || !depositData.amount) {
        throw new Error('UserId e amount são obrigatórios');
      }

      if (depositData.amount <= 0) {
        throw new Error('Valor do depósito deve ser maior que zero');
      }

      // Buscar usuário e carteira
      const user = await prisma.user.findUnique({
        where: { id: depositData.userId },
        include: {
          wallet: true
        }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      if (!user.wallet || user.wallet.length === 0) {
        throw new Error('Carteira do usuário não encontrada');
      }

      const wallet = user.wallet[0];
      const gateway = depositData.gateway || this.defaultGateway;
      const paymentMethod = depositData.paymentMethod || 'PIX';

      // Validar gateway
      if (!this.gateways[gateway]) {
        throw new Error(`Gateway '${gateway}' não suportado`);
      }

      // Criar registro do depósito no banco
      const deposit = await prisma.deposit.create({
        data: {
          userId: user.id,
          walletId: wallet.id,
          amount: depositData.amount,
          payment_method: paymentMethod,
          status: false, // Pendente
          created_at: new Date(),
          updated_at: new Date()
        }
      });

      console.log('💰 Depósito criado no banco:', {
        depositId: deposit.id,
        userId: user.id,
        amount: depositData.amount,
        gateway
      });

      // Preparar dados para o gateway
      const gatewayData = {
        amount: depositData.amount,
        customerData: {
          name: user.full_name,
          email: user.email,
          document: user.cpf,
          phone: user.phone
        },
        metadata: {
          orderId: deposit.id,
          description: `Depósito de R$ ${depositData.amount} - ${user.full_name}`,
          userId: user.id,
          walletId: wallet.id,
          depositId: deposit.id
        }
      };

      // Criar pagamento no gateway
      let paymentResult;
      
      if (paymentMethod === 'PIX' || paymentMethod === 'TAX39' || paymentMethod === 'TAX19') {
        paymentResult = await this.gateways[gateway].createPixPayment(gatewayData);
      } else {
        throw new Error(`Método de pagamento '${paymentMethod}' não suportado`);
      }

      // Atualizar depósito com dados do gateway
      const updatedDeposit = await prisma.deposit.update({
        where: { id: deposit.id },
        data: {
          metadata: {
            gateway,
            transactionId: paymentResult.transactionId,
            qrCode: paymentResult.qrCode,
            pixKey: paymentResult.pixKey,
            expiresAt: paymentResult.expiresAt
          },
          updated_at: new Date()
        },
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              email: true
            }
          },
          wallet: {
            select: {
              id: true,
              balance: true,
              currency: true
            }
          }
        }
      });

      return {
        success: true,
        deposit: {
          id: updatedDeposit.id,
          amount: updatedDeposit.amount,
          currency: updatedDeposit.currency,
          status: updatedDeposit.status ? 'PAID' : 'PENDING',
          payment_method: updatedDeposit.payment_method,
          created_at: updatedDeposit.created_at
        },
        payment: {
          transactionId: paymentResult.transactionId,
          qrCode: paymentResult.qrCode,
          qrCodeBase64: paymentResult.qrCodeBase64,
          pixKey: paymentResult.pixKey,
          expiresAt: paymentResult.expiresAt,
          gateway
        },
        user: updatedDeposit.user,
        wallet: updatedDeposit.wallet
      };
    } catch (error) {
      console.error('❌ Erro ao criar depósito:', error.message);
      throw new Error(`Erro ao criar depósito: ${error.message}`);
    }
  }

  /**
   * Processar confirmação de pagamento (webhook)
   * @param {Object} webhookData - Dados do webhook
   * @param {string} gateway - Gateway que enviou o webhook
   * @returns {Promise<Object>} Resultado do processamento
   */
  async processPaymentConfirmation(webhookData, gateway = 'safira') {
    try {
      // Validar gateway
      if (!this.gateways[gateway]) {
        throw new Error(`Gateway '${gateway}' não suportado`);
      }

      // Processar webhook no gateway específico
      const webhookResult = this.gateways[gateway].processWebhook(webhookData);
      
      if (!webhookResult.isValid) {
        throw new Error(`Webhook inválido: ${webhookResult.error}`);
      }

      // Buscar depósito pelo external_id (depositId) ou transactionId
      let deposit = null;
      
      // Primeiro, tentar buscar pelo external_id (para PixUp)
      if (webhookResult.externalId) {
        deposit = await prisma.deposit.findUnique({
          where: { id: webhookResult.externalId },
          include: {
            user: true,
            wallet: true
          }
        });
      }
      
      // Se não encontrou pelo external_id, buscar pelo transactionId (para outros gateways)
      if (!deposit && webhookResult.transactionId) {
        deposit = await prisma.deposit.findFirst({
          where: {
            metadata: {
              path: ['transactionId'],
              equals: webhookResult.transactionId
            }
          },
          include: {
            user: true,
            wallet: true
          }
        });
      }

      if (!deposit) {
        const identifier = webhookResult.externalId || webhookResult.transactionId;
        throw new Error(`Depósito não encontrado para ID: ${identifier}`);
      }

      // Se já foi processado, retornar sucesso
      if (deposit.status === true) {
        console.log('ℹ️ Depósito já foi processado:', deposit.id);
        return {
          success: true,
          message: 'Depósito já processado',
          deposit
        };
      }

      // Processar pagamento confirmado
      if (webhookResult.status === 'PAID' || webhookResult.status === 'COMPLETED') {
        await this.confirmDeposit(deposit.id, webhookResult);
        
        return {
          success: true,
          message: 'Depósito confirmado com sucesso',
          deposit: {
            id: deposit.id,
            amount: deposit.amount,
            userId: deposit.userId
          }
        };
      }

      return {
        success: true,
        message: `Status do pagamento: ${webhookResult.status}`,
        status: webhookResult.status
      };
    } catch (error) {
      console.error('❌ Erro ao processar confirmação de pagamento:', error.message);
      throw new Error(`Erro ao processar pagamento: ${error.message}`);
    }
  }

  /**
   * Confirmar depósito e creditar na carteira
   * @param {string} depositId - ID do depósito
   * @param {Object} paymentData - Dados do pagamento confirmado
   * @returns {Promise<Object>} Depósito confirmado
   */
  async confirmDeposit(depositId, paymentData) {
    try {
      return await prisma.$transaction(async (tx) => {
        // Buscar depósito com dados do usuário incluindo quem o convidou
        const deposit = await tx.deposit.findUnique({
          where: { id: depositId },
          include: {
            user: {
              include: {
                inviter: {
                  include: {
                    wallet: true,
                    inviteCode: true
                  }
                }
              }
            },
            wallet: true
          }
        });

        if (!deposit) {
          throw new Error('Depósito não encontrado');
        }

        if (deposit.status === true) {
          throw new Error('Depósito já foi confirmado');
        }

        // Atualizar status do depósito
        const updatedDeposit = await tx.deposit.update({
          where: { id: depositId },
          data: {
            status: true,
            paid_at: paymentData.paidAt ? new Date(paymentData.paidAt) : new Date(),
            updated_at: new Date()
          }
        });

        // Creditar valor na carteira do usuário
        await tx.wallet.update({
          where: { id: deposit.walletId },
          data: {
            balance: {
              increment: deposit.amount
            },
            updated_at: new Date()
          }
        });

        // Atualizar total de depósitos do usuário
        await tx.user.update({
          where: { id: deposit.userId },
          data: {
            total_deposit: {
              increment: deposit.amount
            },
            updated_at: new Date()
          }
        });

        // Processar comissão para quem convidou (15% do depósito)
        if (deposit.user.invitedBy && deposit.user.inviter) {
          const inviter = deposit.user.inviter;
          const commissionRate = inviter.inviteCode?.commission_rate || 15.00; // 15% padrão
          const commissionAmount = (Number(deposit.amount) * Number(commissionRate)) / 100;

          // Buscar carteira principal do convidador (primeira carteira ativa)
          const inviterWallet = inviter.wallet && inviter.wallet.length > 0 
            ? inviter.wallet.find(w => w.status === true) || inviter.wallet[0]
            : null;

          if (inviterWallet) {
            // Creditar comissão na carteira do convidador
            await tx.wallet.update({
              where: { id: inviterWallet.id },
              data: {
                balance: {
                  increment: commissionAmount
                },
                updated_at: new Date()
              }
            });

            // Atualizar estatísticas do código de convite
            if (inviter.inviteCode) {
              await tx.inviteCode.update({
                where: { id: inviter.inviteCode.id },
                data: {
                  total_commission: {
                    increment: commissionAmount
                  },
                  updated_at: new Date()
                }
              });
            }

            console.log('💰 Comissão creditada:', {
              inviterId: inviter.id,
              inviterWalletId: inviterWallet.id,
              commissionAmount,
              commissionRate: `${commissionRate}%`,
              originalDeposit: deposit.amount
            });
          } else {
            console.warn('⚠️ Carteira do convidador não encontrada:', {
              inviterId: inviter.id,
              depositId: deposit.id
            });
          }
        }

        console.log('✅ Depósito confirmado e creditado:', {
          depositId: updatedDeposit.id,
          userId: deposit.userId,
          amount: deposit.amount,
          newBalance: 'updated'
        });

        return updatedDeposit;
      });
    } catch (error) {
      console.error('❌ Erro ao confirmar depósito:', error.message);
      throw new Error(`Erro ao confirmar depósito: ${error.message}`);
    }
  }

  /**
   * Buscar histórico de depósitos do usuário
   * @param {string} userId - ID do usuário
   * @param {number} limit - Limite de resultados
   * @returns {Promise<Array>} Lista de depósitos
   */
  async getUserDeposits(userId, limit = 50) {
    try {
      const deposits = await prisma.deposit.findMany({
        where: { userId },
        include: {
          wallet: {
            select: {
              currency: true,
              symbol: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        },
        take: limit
      });

      return deposits.map(deposit => ({
        id: deposit.id,
        amount: deposit.amount,
        currency: deposit.currency,
        symbol: deposit.symbol,
        status: deposit.status ? 'PAID' : 'PENDING',
        payment_method: deposit.payment_method,
        paid_at: deposit.paid_at,
        created_at: deposit.created_at,
        metadata: deposit.metadata
      }));
    } catch (error) {
      console.error('❌ Erro ao buscar depósitos do usuário:', error.message);
      throw new Error(`Erro ao buscar depósitos: ${error.message}`);
    }
  }

  /**
   * Verificar status de um depósito
   * @param {string} depositId - ID do depósito
   * @returns {Promise<Object>} Status do depósito
   */
  async checkDepositStatus(depositId) {
    try {
      const deposit = await prisma.deposit.findUnique({
        where: { id: depositId },
        include: {
          user: {
            select: {
              id: true,
              full_name: true,
              email: true
            }
          },
          wallet: {
            select: {
              id: true,
              balance: true,
              currency: true
            }
          }
        }
      });

      if (!deposit) {
        throw new Error('Depósito não encontrado');
      }

      return {
        id: deposit.id,
        amount: deposit.amount,
        currency: deposit.currency,
        status: deposit.status ? 'PAID' : 'PENDING',
        payment_method: deposit.payment_method,
        paid_at: deposit.paid_at,
        created_at: deposit.created_at,
        user: deposit.user,
        wallet: deposit.wallet,
        metadata: deposit.metadata
      };
    } catch (error) {
      console.error('❌ Erro ao verificar status do depósito:', error.message);
      throw new Error(`Erro ao verificar depósito: ${error.message}`);
    }
  }
}

module.exports = new DepositService();