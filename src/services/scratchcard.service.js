const { PrismaClient } = require('../generated/prisma');
const { createClient } = require('@supabase/supabase-js');
const prisma = new PrismaClient();
const LicenseService = require('./license.service');
const licenseService = new LicenseService();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

class ScratchCardService {
  // Listar todas as raspadinhas ativas
  async getActiveScratchCards() {
    try {
      const scratchCards = await prisma.scratchCard.findMany({
        where: {
          is_active: true,
          deleted_at: null
        },
        include: {
          prizes: {
            where: {
              is_active: true
            },
            orderBy: {
              probability: 'desc'
            }
          }
        },
        orderBy: {
          price: 'asc'
        }
      });

      return scratchCards;
    } catch (error) {
      throw new Error(`Erro ao buscar raspadinhas: ${error.message}`);
    }
  }

  // Buscar uma raspadinha específica
  async getScratchCardById(scratchCardId) {
    try {
      const scratchCard = await prisma.scratchCard.findUnique({
        where: {
          id: scratchCardId,
          is_active: true,
          deleted_at: null
        },
        include: {
          prizes: {
            where: {
              is_active: true
            },
            orderBy: {
              probability: 'desc'
            }
          }
        }
      });

      if (!scratchCard) {
        throw new Error('Raspadinha não encontrada ou inativa');
      }

      return scratchCard;
    } catch (error) {
      throw new Error(`Erro ao buscar raspadinha: ${error.message}`);
    }
  }

  // Comprar e jogar uma raspadinha
  async playScratchCard(userId, scratchCardId) {
    try {

      // Verificar se o usuário existe e tem carteira antes da transação
      const userWithWallet = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true
        }
      });

      if (!userWithWallet) {
        throw new Error('Usuário não encontrado');
      }

      if (!userWithWallet.wallet || userWithWallet.wallet.length === 0) {
        throw new Error('Carteira não encontrada');
      }

      const wallet = userWithWallet.wallet[0];

      // Verificar se a raspadinha existe e está ativa antes da transação
      const scratchCardWithPrizes = await prisma.scratchCard.findUnique({
        where: {
          id: scratchCardId,
          is_active: true,
          deleted_at: null
        },
        include: {
          prizes: {
            where: {
              is_active: true
            }
          }
        }
      });

      if (!scratchCardWithPrizes) {
        throw new Error('Raspadinha não encontrada ou inativa');
      }
      
      // Verificar se a licença está ativa e tem créditos suficientes
      const licenseCheck = await licenseService.hasEnoughCredits(scratchCardWithPrizes.price);
      
      if (!licenseCheck.success) {
        throw new Error(`Sistema temporariamente indisponível: ${licenseCheck.message}`);
      }

      // Verificar se o usuário tem saldo suficiente
      if (Number(wallet.balance) < Number(scratchCardWithPrizes.price)) {
        throw new Error('Saldo insuficiente para comprar esta raspadinha');
      }

      // Determinar se o usuário ganhou e qual prêmio antes da transação
      // Passando o objeto user para considerar se é influenciador
      const gameResult = this.determineGameResult(scratchCardWithPrizes, userWithWallet);
      
      let amountWon = 0;
      let prizeId = null;
      let prizeType = null;

      if (gameResult.isWinner && gameResult.prize) {
        prizeId = gameResult.prize.id;
        prizeType = gameResult.prize.type;
        
        if (gameResult.prize.type === 'MONEY') {
          amountWon = Number(gameResult.prize.value);
        } else if (gameResult.prize.type === 'PRODUCT') {
          // Para produtos físicos, o valor ganho é 0 (será tratado separadamente)
          amountWon = 0;
        }
      }

      // Obter a licença do resultado da verificação para uso posterior
      const license = licenseCheck.license;
      
      // Usar transação para garantir consistência nas operações de banco de dados
      const result = await prisma.$transaction(async (tx) => {
        // Debitar o valor da raspadinha da carteira
        await tx.wallet.update({
          where: { id: wallet.id },
          data: {
            balance: {
              decrement: Number(scratchCardWithPrizes.price)
            }
          }
        });

        // Se ganhou dinheiro, creditar na carteira
        if (gameResult.isWinner && gameResult.prize && gameResult.prize.type === 'MONEY') {
          await tx.wallet.update({
            where: { id: wallet.id },
            data: {
              balance: {
                increment: amountWon
              }
            }
          });
        }

        // Criar o registro do jogo
        const game = await tx.game.create({
          data: {
            userId,
            scratchCardId,
            prizeId,
            is_winner: gameResult.isWinner,
            amount_won: amountWon,
            prize_type: prizeType,
            status: 'COMPLETED'
          },
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
          }
        });

        // Atualizar estatísticas do usuário
        await tx.user.update({
          where: { id: userId },
          data: {
            total_scratchs: {
              increment: 1
            },
            total_wins: gameResult.isWinner ? {
              increment: 1
            } : undefined,
            total_losses: !gameResult.isWinner ? {
              increment: 1
            } : undefined
          }
        });

        // Atualizar estatísticas da raspadinha
        await tx.scratchCard.update({
          where: { id: scratchCardId },
          data: {
            total_revenue: {
              increment: Number(scratchCardWithPrizes.price)
            },
            total_payouts: {
              increment: amountWon
            },
            total_games_played: {
              increment: 1
            }
          }
        });

        // Calcular e atualizar RTP atual apenas para usuários não-influenciadores
        // Influenciadores não afetam o RTP atual devido aos altos ganhos
        if (!userWithWallet.is_influencer) {
          const updatedStats = await tx.scratchCard.findUnique({
            where: { id: scratchCardId },
            select: {
              total_revenue: true,
              total_payouts: true
            }
          });

          const currentRtp = Number(updatedStats.total_revenue) > 0 
            ? (Number(updatedStats.total_payouts) / Number(updatedStats.total_revenue)) * 100
            : 0;

          await tx.scratchCard.update({
            where: { id: scratchCardId },
            data: {
              current_rtp: currentRtp
            }
          });
        }

        // Consumir créditos e registrar ganhos na licença
        await licenseService.consumeCreditsAndAddEarnings({
          amount: Number(scratchCardWithPrizes.price),
          userId: userId,
          scratchCardId: scratchCardId,
          tx: tx
        });
        
        return game;
      }, {
        // Configurações da transação para maior estabilidade
        maxWait: 5000, // 5 segundos de espera máxima
        timeout: 10000, // 10 segundos de timeout
        isolationLevel: 'Serializable' // Nível de isolamento mais alto
      });

      return result;
    } catch (error) {
      throw new Error(`Erro ao jogar raspadinha: ${error.message}`);
    }
  }

  // Determinar resultado do jogo: usuário comum sempre perde, influenciador ganha mais
  determineGameResult(scratchCard, user = null) {
    const prizes = scratchCard.prizes;

    // Se não há prêmios, sempre perde
    if (!prizes || prizes.length === 0) {
      return { isWinner: false, prize: null };
    }

    // Usuário comum sempre perde (0% de chance)
    let chanceGanhar = 0;
    
    // Influenciador tem 80% de chance de ganhar (mais ganhos que perdas)
    if (user && user.is_influencer) {
      chanceGanhar = 40; // 80% de chance para influenciadores
    }

    // Gerar número aleatório de 0 a 100
    const randomNumber = Math.random() * 100;
    
    // Se o número for maior que a chance de ganhar, perde
    if (randomNumber > chanceGanhar) {
      return { isWinner: false, prize: null };
    }

    // Se ganhou, determinar qual prêmio baseado nas probabilidades relativas
    let cumulativeProbability = 0;
    const totalProbability = prizes.reduce((sum, prize) => sum + Number(prize.probability), 0);

    // Gerar segundo número aleatório para escolher o prêmio
    const prizeRandomNumber = Math.random() * totalProbability;

    for (const prize of prizes) {
      cumulativeProbability += Number(prize.probability);
      
      if (prizeRandomNumber <= cumulativeProbability) {
        return { isWinner: true, prize };
      }
    }

    // Fallback: retornar o primeiro prêmio se algo der errado
    return { isWinner: true, prize: prizes[0] };
  }

  // Buscar estatísticas de uma raspadinha
  async getScratchCardStats(scratchCardId) {
    try {
      const scratchCard = await prisma.scratchCard.findUnique({
        where: { id: scratchCardId },
        select: {
          id: true,
          name: true,
          price: true,
          target_rtp: true,
          current_rtp: true,
          total_revenue: true,
          total_payouts: true,
          total_games_played: true,
          created_at: true
        }
      });

      if (!scratchCard) {
        throw new Error('Raspadinha não encontrada');
      }

      return scratchCard;
    } catch (error) {
      throw new Error(`Erro ao buscar estatísticas: ${error.message}`);
    }
  }

  // Buscar histórico de jogos de uma raspadinha específica
  async getScratchCardGameHistory(scratchCardId, limit = 50) {
    try {
      const games = await prisma.game.findMany({
        where: { scratchCardId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              full_name: true
            }
          },
          prize: {
            select: {
              id: true,
              name: true,
              type: true,
              value: true,
              product_name: true
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

  // ==================== MÉTODOS DE ADMINISTRAÇÃO ====================

  // Criar raspadinha com múltiplos prêmios
  async createScratchCardWithPrizes(scratchCardData, prizesData) {
    try {
      // Validações de negócio
      this.validateScratchCardData(scratchCardData);
      this.validatePrizesData(prizesData);

      const result = await prisma.$transaction(async (tx) => {
        // Criar a raspadinha
        const scratchCard = await tx.scratchCard.create({
          data: {
            name: scratchCardData.name,
            description: scratchCardData.description,
            price: Number(scratchCardData.price),
            image_url: scratchCardData.image_url,
            target_rtp: Number(scratchCardData.target_rtp),
            is_active: scratchCardData.is_active !== undefined ? scratchCardData.is_active : true,
            current_rtp: 0,
            total_revenue: 0,
            total_payouts: 0,
            total_games_played: 0
          }
        });

        // Criar os prêmios
        const prizesWithScratchCardId = prizesData.map(prize => ({
          scratchCardId: scratchCard.id,
          name: prize.name,
          description: prize.description || null,
          type: prize.type,
          value: prize.value ? Number(prize.value) : null,
          product_name: prize.product_name || null,
          redemption_value: prize.redemption_value ? Number(prize.redemption_value) : null,
          image_url: prize.image_url || null,
          probability: Number(prize.probability),
          is_active: prize.is_active !== undefined ? prize.is_active : true
        }));

        await tx.prize.createMany({
          data: prizesWithScratchCardId
        });

        // Buscar a raspadinha criada com os prêmios
        const createdScratchCard = await tx.scratchCard.findUnique({
          where: { id: scratchCard.id },
          include: {
            prizes: {
              orderBy: {
                probability: 'desc'
              }
            }
          }
        });

        return createdScratchCard;
      });

      return result;
    } catch (error) {
      throw new Error(`Erro ao criar raspadinha: ${error.message}`);
    }
  }

  /**
   * Criar raspadinha com múltiplos prêmios e upload de imagens para o Supabase
   * @param {Object} scratchCardData - Dados da raspadinha
   * @param {Array} prizesData - Array de prêmios
   * @param {Object} files - Arquivos de imagem (scratchCardImage, prizeImages)
   * @returns {Promise<Object>} Resultado da criação
   */
  async createScratchCardWithPrizesAndImages(scratchCardData, prizesData, files) {
    try {
      const bucket = process.env.SUPABASE_BUCKET;
      if (!bucket) throw new Error('Bucket do Supabase não configurado');

      // Validações de negócio (sem validar image_url obrigatório)
      this.validateScratchCardDataForImageUpload(scratchCardData);
      this.validatePrizesDataForImageUpload(prizesData);

      // Função auxiliar para upload de imagem
      const uploadAndGetUrl = async (file, folder) => {
        if (!file) return null;
        
        const fs = require('fs').promises;
        const filePath = `scratchcards/${folder}/${Date.now()}-${file.originalname}`;
        
        // Lê o buffer do arquivo salvo localmente
        const buffer = await fs.readFile(file.path);
        
        const { error } = await supabase.storage.from(bucket).upload(filePath, buffer, {
          contentType: file.mimetype,
          upsert: true
        });
        
        if (error) throw new Error(`Erro ao fazer upload de ${folder}: ${error.message}`);
        
        // URL pública
        const { data } = supabase.storage.from(bucket).getPublicUrl(filePath);
        return data.publicUrl;
      };

      // Upload da imagem da raspadinha
      let scratchCardImageUrl = scratchCardData.image_url;
      if (files.scratchCardImage) {
        scratchCardImageUrl = await uploadAndGetUrl(files.scratchCardImage, 'cards');
      }

      // Upload das imagens dos prêmios
      const updatedPrizesData = [...prizesData];
      if (files.prizeImages && Array.isArray(files.prizeImages)) {
        for (let i = 0; i < Math.min(files.prizeImages.length, updatedPrizesData.length); i++) {
          const prizeImage = files.prizeImages[i];
          if (prizeImage) {
            const imageUrl = await uploadAndGetUrl(prizeImage, 'prizes');
            updatedPrizesData[i].image_url = imageUrl;
          }
        }
      }

      // Atualizar dados da raspadinha com a URL da imagem
      const finalScratchCardData = {
        ...scratchCardData,
        image_url: scratchCardImageUrl
      };

      // Criar raspadinha com as imagens processadas
      const result = await prisma.$transaction(async (tx) => {
        // Criar a raspadinha
        const scratchCard = await tx.scratchCard.create({
          data: {
            name: finalScratchCardData.name,
            description: finalScratchCardData.description,
            price: Number(finalScratchCardData.price),
            image_url: finalScratchCardData.image_url,
            target_rtp: Number(finalScratchCardData.target_rtp),
            is_active: finalScratchCardData.is_active !== undefined ? finalScratchCardData.is_active : true,
            current_rtp: 0,
            total_revenue: 0,
            total_payouts: 0,
            total_games_played: 0
          }
        });

        // Criar os prêmios com as imagens processadas
        const prizesWithScratchCardId = updatedPrizesData.map(prize => ({
          scratchCardId: scratchCard.id,
          name: prize.name,
          description: prize.description || null,
          type: prize.type,
          value: prize.value ? Number(prize.value) : null,
          product_name: prize.product_name || null,
          redemption_value: prize.redemption_value ? Number(prize.redemption_value) : null,
          image_url: prize.image_url || null,
          probability: Number(prize.probability),
          is_active: prize.is_active !== undefined ? prize.is_active : true
        }));

        await tx.prize.createMany({
          data: prizesWithScratchCardId
        });

        // Buscar a raspadinha criada com os prêmios
        const createdScratchCard = await tx.scratchCard.findUnique({
          where: { id: scratchCard.id },
          include: {
            prizes: {
              orderBy: {
                probability: 'desc'
              }
            }
          }
        });

        return createdScratchCard;
      });

      return result;
    } catch (error) {
      throw new Error(`Erro ao criar raspadinha com imagens: ${error.message}`);
    }
  }

  // Atualizar raspadinha
  async updateScratchCard(scratchCardId, updateData) {
    try {
      // Verificar se a raspadinha existe
      const existingScratchCard = await prisma.scratchCard.findUnique({
        where: { id: scratchCardId, deleted_at: null }
      });

      if (!existingScratchCard) {
        throw new Error('Raspadinha não encontrada');
      }

      // Validar dados de atualização
      if (updateData.price !== undefined) {
        this.validatePrice(updateData.price);
      }
      if (updateData.target_rtp !== undefined) {
        this.validateTargetRtp(updateData.target_rtp);
      }

      const updatedScratchCard = await prisma.scratchCard.update({
        where: { id: scratchCardId },
        data: {
          name: updateData.name,
          description: updateData.description,
          price: updateData.price ? Number(updateData.price) : undefined,
          image_url: updateData.image_url,
          target_rtp: updateData.target_rtp ? Number(updateData.target_rtp) : undefined,
          is_active: updateData.is_active,
          updated_at: new Date()
        },
        include: {
          prizes: {
            where: { is_active: true },
            orderBy: { probability: 'desc' }
          }
        }
      });

      return updatedScratchCard;
    } catch (error) {
      throw new Error(`Erro ao atualizar raspadinha: ${error.message}`);
    }
  }

  // Excluir raspadinha (soft delete)
  async deleteScratchCard(scratchCardId) {
    try {
      // Verificar se a raspadinha existe
      const existingScratchCard = await prisma.scratchCard.findUnique({
        where: { id: scratchCardId, deleted_at: null }
      });

      if (!existingScratchCard) {
        throw new Error('Raspadinha não encontrada');
      }

      // Verificar se há jogos ativos (não permitir exclusão se houver)
      const activeGames = await prisma.game.count({
        where: {
          scratchCardId,
          status: 'COMPLETED'
        }
      });

      if (activeGames > 0) {
        // Se há jogos, apenas desativar
        const deactivatedScratchCard = await prisma.scratchCard.update({
          where: { id: scratchCardId },
          data: {
            is_active: false,
            updated_at: new Date()
          }
        });
        return { action: 'deactivated', scratchCard: deactivatedScratchCard };
      } else {
        // Se não há jogos, fazer soft delete
        const deletedScratchCard = await prisma.scratchCard.update({
          where: { id: scratchCardId },
          data: {
            deleted_at: new Date(),
            is_active: false,
            updated_at: new Date()
          }
        });
        return { action: 'deleted', scratchCard: deletedScratchCard };
      }
    } catch (error) {
      throw new Error(`Erro ao excluir raspadinha: ${error.message}`);
    }
  }

  // Adicionar prêmio a uma raspadinha existente
  async addPrizeToScratchCard(scratchCardId, prizeData) {
    try {
      // Verificar se a raspadinha existe
      const scratchCard = await prisma.scratchCard.findUnique({
        where: { id: scratchCardId, deleted_at: null }
      });

      if (!scratchCard) {
        throw new Error('Raspadinha não encontrada');
      }

      // Validar dados do prêmio
      this.validatePrizeData(prizeData);

      const prize = await prisma.prize.create({
        data: {
          scratchCardId,
          name: prizeData.name,
          description: prizeData.description || null,
          type: prizeData.type,
          value: prizeData.value ? Number(prizeData.value) : null,
          product_name: prizeData.product_name || null,
          redemption_value: prizeData.redemption_value ? Number(prizeData.redemption_value) : null,
          image_url: prizeData.image_url || null,
          probability: Number(prizeData.probability),
          is_active: prizeData.is_active !== undefined ? prizeData.is_active : true
        }
      });

      return prize;
    } catch (error) {
      throw new Error(`Erro ao adicionar prêmio: ${error.message}`);
    }
  }

  // Atualizar prêmio
  async updatePrize(prizeId, updateData) {
    try {
      // Verificar se o prêmio existe
      const existingPrize = await prisma.prize.findUnique({
        where: { id: prizeId }
      });

      if (!existingPrize) {
        throw new Error('Prêmio não encontrado');
      }

      // Validar dados de atualização
      if (updateData.probability !== undefined) {
        this.validateProbability(updateData.probability);
      }
      if (updateData.type && updateData.type !== existingPrize.type) {
        this.validatePrizeType(updateData.type);
      }

      const updatedPrize = await prisma.prize.update({
        where: { id: prizeId },
        data: {
          name: updateData.name,
          description: updateData.description,
          type: updateData.type,
          value: updateData.value ? Number(updateData.value) : undefined,
          product_name: updateData.product_name,
          redemption_value: updateData.redemption_value ? Number(updateData.redemption_value) : undefined,
          image_url: updateData.image_url,
          probability: updateData.probability ? Number(updateData.probability) : undefined,
          is_active: updateData.is_active,
          updated_at: new Date()
        }
      });

      return updatedPrize;
    } catch (error) {
      throw new Error(`Erro ao atualizar prêmio: ${error.message}`);
    }
  }

  // Excluir prêmio
  async deletePrize(prizeId) {
    try {
      // Verificar se o prêmio existe
      const existingPrize = await prisma.prize.findUnique({
        where: { id: prizeId }
      });

      if (!existingPrize) {
        throw new Error('Prêmio não encontrado');
      }

      // Verificar se há jogos que ganharam este prêmio
      const gamesWithPrize = await prisma.game.count({
        where: { prizeId }
      });

      if (gamesWithPrize > 0) {
        // Se há jogos, apenas desativar
        const deactivatedPrize = await prisma.prize.update({
          where: { id: prizeId },
          data: {
            is_active: false,
            updated_at: new Date()
          }
        });
        return { action: 'deactivated', prize: deactivatedPrize };
      } else {
        // Se não há jogos, excluir permanentemente
        await prisma.prize.delete({
          where: { id: prizeId }
        });
        return { action: 'deleted', prize: existingPrize };
      }
    } catch (error) {
      throw new Error(`Erro ao excluir prêmio: ${error.message}`);
    }
  }

  // Listar todas as raspadinhas (incluindo inativas) - para admin
  async getAllScratchCards(includeInactive = false) {
    try {
      const whereClause = {
        deleted_at: null
      };

      if (!includeInactive) {
        whereClause.is_active = true;
      }

      const scratchCards = await prisma.scratchCard.findMany({
        where: whereClause,
        include: {
          prizes: {
            orderBy: {
              probability: 'desc'
            }
          },
          _count: {
            select: {
              games: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      return scratchCards;
    } catch (error) {
      throw new Error(`Erro ao buscar raspadinhas: ${error.message}`);
    }
  }

  // ==================== VALIDAÇÕES DE NEGÓCIO ====================

  validateScratchCardData(data) {
    if (!data.name || data.name.trim().length < 3) {
      throw new Error('Nome da raspadinha deve ter pelo menos 3 caracteres');
    }
    if (!data.description || data.description.trim().length < 10) {
      throw new Error('Descrição da raspadinha deve ter pelo menos 10 caracteres');
    }
    if (!data.image_url || !this.isValidUrl(data.image_url)) {
      throw new Error('URL da imagem da raspadinha é obrigatória e deve ser válida');
    }
    this.validatePrice(data.price);
    this.validateTargetRtp(data.target_rtp);
  }

  validateScratchCardDataForImageUpload(data) {
    if (!data.name || data.name.trim().length < 3) {
      throw new Error('Nome da raspadinha deve ter pelo menos 3 caracteres');
    }
    if (!data.description || data.description.trim().length < 10) {
      throw new Error('Descrição da raspadinha deve ter pelo menos 10 caracteres');
    }
    // Não validar image_url obrigatório para upload de imagem
    this.validatePrice(data.price);
    this.validateTargetRtp(data.target_rtp);
  }

  validatePrizesData(prizes) {
    if (!Array.isArray(prizes) || prizes.length === 0) {
      throw new Error('Deve haver pelo menos um prêmio');
    }
    if (prizes.length > 20) {
      throw new Error('Máximo de 20 prêmios por raspadinha');
    }

    let totalProbability = 0;
    for (const prize of prizes) {
      this.validatePrizeData(prize);
      totalProbability += Number(prize.probability);
    }

    if (totalProbability > 100) {
      throw new Error('Soma das probabilidades não pode exceder 100%');
    }
  }

  validatePrizesDataForImageUpload(prizes) {
    if (!Array.isArray(prizes) || prizes.length === 0) {
      throw new Error('Deve haver pelo menos um prêmio');
    }
    if (prizes.length > 20) {
      throw new Error('Máximo de 20 prêmios por raspadinha');
    }

    let totalProbability = 0;
    for (const prize of prizes) {
      this.validatePrizeDataForImageUpload(prize);
      totalProbability += Number(prize.probability);
    }

    if (totalProbability > 100) {
      throw new Error('Soma das probabilidades não pode exceder 100%');
    }
  }

  validatePrizeData(prize) {
    if (!prize.name || prize.name.trim().length < 2) {
      throw new Error('Nome do prêmio deve ter pelo menos 2 caracteres');
    }
    this.validatePrizeType(prize.type);
    this.validateProbability(prize.probability);

    // Validar URL da imagem se fornecida
    if (prize.image_url && !this.isValidUrl(prize.image_url)) {
      throw new Error('URL da imagem do prêmio deve ser válida');
    }

    if (prize.type === 'MONEY') {
      if (!prize.value || Number(prize.value) <= 0) {
        throw new Error('Prêmios em dinheiro devem ter valor maior que zero');
      }
    } else if (prize.type === 'PRODUCT') {
      if (!prize.product_name || prize.product_name.trim().length < 2) {
        throw new Error('Produtos devem ter nome do produto');
      }
      if (!prize.redemption_value || Number(prize.redemption_value) <= 0) {
        throw new Error('Produtos devem ter valor de resgate maior que zero');
      }
    }
  }

  validatePrizeDataForImageUpload(prize) {
    if (!prize.name || prize.name.trim().length < 2) {
      throw new Error('Nome do prêmio deve ter pelo menos 2 caracteres');
    }
    this.validatePrizeType(prize.type);
    this.validateProbability(prize.probability);

    // Não validar image_url obrigatório para upload de imagem

    if (prize.type === 'MONEY') {
      if (!prize.value || Number(prize.value) <= 0) {
        throw new Error('Prêmios em dinheiro devem ter valor maior que zero');
      }
    } else if (prize.type === 'PRODUCT') {
      if (!prize.product_name || prize.product_name.trim().length < 2) {
        throw new Error('Produtos devem ter nome do produto');
      }
      if (!prize.redemption_value || Number(prize.redemption_value) <= 0) {
        throw new Error('Produtos devem ter valor de resgate maior que zero');
      }
    }
  }

  validatePrice(price) {
    const numPrice = Number(price);
    if (isNaN(numPrice) || numPrice <= 0) {
      throw new Error('Preço deve ser um número maior que zero');
    }
    if (numPrice > 1000) {
      throw new Error('Preço não pode exceder R$ 1.000,00');
    }
  }

  validateTargetRtp(targetRtp) {
    const numRtp = Number(targetRtp);
    if (isNaN(numRtp) || numRtp < 50 || numRtp > 99) {
      throw new Error('RTP alvo deve estar entre 50% e 99%');
    }
  }

  validatePrizeType(type) {
    if (!['MONEY', 'PRODUCT'].includes(type)) {
      throw new Error('Tipo de prêmio deve ser MONEY ou PRODUCT');
    }
  }

  validateProbability(probability) {
    const numProb = Number(probability);
    if (isNaN(numProb) || numProb < 0 || numProb > 100) {
      throw new Error('Probabilidade deve estar entre 0% e 100%');
    }
  }

  // Validar se uma string é uma URL válida
  isValidUrl(string) {
    try {
      const url = new URL(string);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
      return false;
    }
  }
}

module.exports = new ScratchCardService();