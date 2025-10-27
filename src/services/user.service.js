const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

class UserService {
  // Buscar histórico financeiro do usuário (depósitos e saques)
  async getFinancialHistory(userId) {
    try {
      const [deposits, withdraws] = await Promise.all([
        prisma.deposit.findMany({
          where: { userId },
          include: {
            wallet: true
          },
          orderBy: { created_at: 'desc' }
        }),
        prisma.withdraw.findMany({
          where: { userId },
          include: {
            wallet: true
          },
          orderBy: { created_at: 'desc' }
        })
      ]);

      return {
        deposits,
        withdraws,
        summary: {
          total_deposits: deposits.reduce((sum, deposit) => sum + Number(deposit.amount), 0),
          total_withdraws: withdraws.reduce((sum, withdraw) => sum + Number(withdraw.amount), 0),
          pending_withdraws: withdraws.filter(w => !w.status).reduce((sum, withdraw) => sum + Number(withdraw.amount), 0)
        }
      };
    } catch (error) {
      throw new Error(`Erro ao buscar histórico financeiro: ${error.message}`);
    }
  }

  // Buscar histórico de jogos do usuário
  async getGameHistory(userId, limit = 50) {
    try {
      const games = await prisma.game.findMany({
        where: { userId },
        include: {
          scratchCard: {
            select: {
              id: true,
              name: true,
              price: true,
              image_url: true
            }
          },
          prize: {
            select: {
              id: true,
              name: true,
              type: true,
              value: true,
              product_name: true,
              redemption_value: true,
              image_url: true
            }
          }
        },
        orderBy: {
          played_at: 'desc'
        },
        take: limit
      });

      return games;
    } catch (error) {
      throw new Error(`Erro ao buscar histórico de jogos: ${error.message}`);
    }
  }

  // Escolher entre produto físico ou valor de resgate
  async chooseRedemption(userId, gameId, choice) {
    try {
      // Usar transação para garantir consistência
      const result = await prisma.$transaction(async (tx) => {
        // Verificar se o jogo existe e pertence ao usuário
        const game = await tx.game.findFirst({
          where: {
            id: gameId,
            userId: userId,
            is_winner: true,
            status: 'COMPLETED'
          },
          include: {
            prize: true,
            user: {
              include: {
                wallet: true
              }
            }
          }
        });

        if (!game) {
          throw new Error('Jogo não encontrado ou não elegível para resgate');
        }

        if (!game.prize || game.prize.type !== 'PRODUCT') {
          throw new Error('Este prêmio não é um produto físico');
        }

        if (game.redemption_choice !== false) {
          throw new Error('Escolha de resgate já foi realizada para este prêmio');
        }

        if (!game.user.wallet || game.user.wallet.length === 0) {
          throw new Error('Carteira não encontrada');
        }

        const wallet = game.user.wallet[0];

        // Validar escolha
        if (choice !== 'product' && choice !== 'money') {
          throw new Error('Escolha inválida. Use "product" ou "money"');
        }

        let updatedGame;

        if (choice === 'money') {
          // Escolheu receber o valor de resgate
          const redemptionValue = Number(game.prize.redemption_value);
          
          if (!redemptionValue || redemptionValue <= 0) {
            throw new Error('Valor de resgate não disponível para este produto');
          }

          // Creditar valor na carteira
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: {
                increment: redemptionValue
              }
            }
          });

          // Atualizar jogo
          updatedGame = await tx.game.update({
            where: { id: gameId },
            data: {
              redemption_choice: true,
              amount_won: redemptionValue,
              prize_type: 'REDEMPTION',
              updated_at: new Date()
            },
            include: {
              prize: true,
              scratchCard: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  image_url: true
                }
              }
            }
          });

          // Atualizar estatísticas da raspadinha
          await tx.scratchCard.update({
            where: { id: game.scratchCardId },
            data: {
              total_payouts: {
                increment: redemptionValue
              }
            }
          });

        } else {
          // Escolheu receber o produto físico
          updatedGame = await tx.game.update({
            where: { id: gameId },
            data: {
              redemption_choice: false,
              prize_type: 'PRODUCT',
              status: 'PENDING_DELIVERY',
              updated_at: new Date()
            },
            include: {
              prize: true,
              scratchCard: {
                select: {
                  id: true,
                  name: true,
                  price: true,
                  image_url: true
                }
              }
            }
          });
        }

        return {
          game: updatedGame,
          choice: choice,
          message: choice === 'money' 
            ? `Valor de R$ ${game.prize.redemption_value} creditado na sua carteira!`
            : `Produto ${game.prize.product_name} será enviado para seu endereço!`
        };
      });

      return result;
    } catch (error) {
      throw new Error(`Erro ao processar escolha de resgate: ${error.message}`);
    }
  }

  // Buscar prêmios pendentes de escolha
  async getPendingRedemptions(userId) {
    try {
      const pendingGames = await prisma.game.findMany({
        where: {
          userId: userId,
          is_winner: true,
          status: 'COMPLETED',
          redemption_choice: false,
          prize: {
            type: 'PRODUCT'
          }
        },
        select: {
          id: true, // gameId
          played_at: true,
          prize: {
            select: {
              id: true,
              name: true,
              type: true,
              product_name: true,
              redemption_value: true,
              image_url: true,
              description: true
            }
          },
          scratchCard: {
            select: {
              id: true,
              name: true,
              image_url: true
            }
          }
        },
        orderBy: {
          played_at: 'desc'
        }
      });

      return pendingGames;
    } catch (error) {
      throw new Error(`Erro ao buscar resgates pendentes: ${error.message}`);
    }
  }

  // Criar solicitação de saque
  async createWithdraw(userId, withdrawData) {
    try {
      const { amount, pix_key, pix_type, document } = withdrawData;

      // Verificar se o usuário existe
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true
        }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      if (!user.wallet || user.wallet.length === 0) {
        throw new Error('Carteira não encontrada');
      }

      const wallet = user.wallet[0];

      // Verificar se há saldo suficiente
      if (Number(wallet.balance) < Number(amount)) {
        throw new Error('Saldo insuficiente para saque');
      }

      // Verificar se o valor mínimo de saque é atendido (exemplo: R$ 10,00)
      if (Number(amount) < 10) {
        throw new Error('Valor mínimo para saque é R$ 10,00');
      }

      // Usar transação para garantir consistência
      const result = await prisma.$transaction(async (tx) => {
        // Debitar o saldo da carteira imediatamente
        const updatedWallet = await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: {
              decrement: Number(amount)
            }
          }
        });

        // Criar a solicitação de saque com status false (pendente aprovação)
        const withdraw = await tx.withdraw.create({
          data: {
            userId,
            walletId: wallet.id,
            amount: Number(amount),
            document,
            pix_key,
            pix_type,
            currency: wallet.currency,
            symbol: wallet.symbol,
            status: false, // Pendente aprovação do admin
            payment_method: 'PIX'
          },
          include: {
            wallet: true,
            user: {
              select: {
                id: true,
                email: true,
                full_name: true
              }
            }
          }
        });

        // Atualizar o total de saques do usuário
        await tx.user.update({
          where: { id: userId },
          data: {
            total_withdraw: {
              increment: Number(amount)
            }
          }
        });

        return { withdraw, updatedWallet };
      });

      return result.withdraw;
    } catch (error) {
      throw new Error(`Erro ao criar solicitação de saque: ${error.message}`);
    }
  }

  // Buscar dados do usuário com carteira
  async getUserWithWallet(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          inviteCode: true
        }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      return user;
    } catch (error) {
      throw new Error(`Erro ao buscar dados do usuário: ${error.message}`);
    }
  }

  // Buscar saques pendentes do usuário
  async getPendingWithdraws(userId) {
    try {
      const pendingWithdraws = await prisma.withdraw.findMany({
        where: {
          userId,
          status: false
        },
        orderBy: { created_at: 'desc' }
      });

      return pendingWithdraws;
    } catch (error) {
      throw new Error(`Erro ao buscar saques pendentes: ${error.message}`);
    }
  }

  // Buscar código de convite do usuário com estatísticas
  async getUserInviteCode(userId) {
    try {
      const inviteCode = await prisma.inviteCode.findUnique({
        where: { userId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              full_name: true,
              email: true
            }
          }
        }
      });

      if (!inviteCode) {
        throw new Error('Código de convite não encontrado');
      }

      return inviteCode;
    } catch (error) {
      throw new Error(`Erro ao buscar código de convite: ${error.message}`);
    }
  }

  // Buscar usuários convidados pelo usuário
  async getInvitedUsers(userId, limit = 50) {
    try {
      // Primeiro verificar se o usuário tem código de convite
      const inviteCode = await prisma.inviteCode.findUnique({
        where: { userId }
      });

      if (!inviteCode) {
        return {
          invitedUsers: [],
          stats: {
            total_invites: 0,
            total_commission: 0,
            active_invites: 0
          }
        };
      }

      // Buscar usuários convidados
      const invitedUsers = await prisma.user.findMany({
        where: {
          invitedBy: userId,
          deleted_at: null
        },
        select: {
          id: true,
          username: true,
          full_name: true,
          email: true,
          total_deposit: true,
          total_withdraw: true,
          total_scratchs: true,
          total_wins: true,
          total_losses: true,
          created_at: true,
          updated_at: true
        },
        orderBy: {
          created_at: 'desc'
        },
        take: limit
      });

      // Calcular estatísticas
      const stats = {
        total_invites: inviteCode.total_invites,
        total_commission: Number(inviteCode.total_commission),
        active_invites: invitedUsers.length,
        total_deposits_from_invites: invitedUsers.reduce((sum, user) => sum + Number(user.total_deposit), 0),
        total_games_from_invites: invitedUsers.reduce((sum, user) => sum + user.total_scratchs, 0)
      };

      return {
        inviteCode,
        invitedUsers,
        stats
      };
    } catch (error) {
      throw new Error(`Erro ao buscar usuários convidados: ${error.message}`);
    }
  }
}

module.exports = new UserService();