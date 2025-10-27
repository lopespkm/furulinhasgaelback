const scratchCardService = require('../services/scratchcard.service');
const uploadMiddleware = require('../middleware/upload.middleware');

class ScratchCardController {
  // Listar todas as raspadinhas ativas
  async getActiveScratchCards(req, res) {
    try {
      const scratchCards = await scratchCardService.getActiveScratchCards();
      
      res.status(200).json({
        success: true,
        message: 'Raspadinhas recuperadas com sucesso',
        data: scratchCards,
        count: scratchCards.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Upload de imagem para raspadinha
   * POST /api/scratchcards/upload-image
   */
  async uploadImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum arquivo foi enviado'
        });
      }

      // Gerar URL pública para a imagem
      const imageUrl = uploadMiddleware.generatePublicUrl(req.file.filename, 'scratchcards');

      res.status(200).json({
        success: true,
        message: 'Imagem enviada com sucesso',
        data: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          url: imageUrl,
          path: req.file.path
        }
      });
    } catch (error) {
      console.error('❌ Erro ao fazer upload da imagem:', error.message);
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Upload de imagem para prêmio
   * POST /api/scratchcards/upload-prize-image
   */
  async uploadPrizeImage(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'Nenhum arquivo foi enviado'
        });
      }

      // Gerar URL pública para a imagem
      const imageUrl = uploadMiddleware.generatePublicUrl(req.file.filename, 'prizes');

      res.status(200).json({
        success: true,
        message: 'Imagem do prêmio enviada com sucesso',
        data: {
          filename: req.file.filename,
          originalName: req.file.originalname,
          size: req.file.size,
          mimetype: req.file.mimetype,
          url: imageUrl,
          path: req.file.path
        }
      });
    } catch (error) {
      console.error('❌ Erro ao fazer upload da imagem do prêmio:', error.message);
      
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Buscar uma raspadinha específica
  async getScratchCardById(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      const scratchCard = await scratchCardService.getScratchCardById(id);
      
      res.status(200).json({
        success: true,
        message: 'Raspadinha recuperada com sucesso',
        data: scratchCard
      });
    } catch (error) {
      const statusCode = error.message.includes('não encontrada') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Comprar e jogar uma raspadinha
  async playScratchCard(req, res) {
    try {
      const { scratchCardId } = req.body;
      const userId = req.user.id;
      
      if (!scratchCardId) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      const gameResult = await scratchCardService.playScratchCard(userId, scratchCardId);
      
      res.status(200).json({
        success: true,
        message: gameResult.is_winner 
          ? `Parabéns! Você ganhou ${gameResult.prize?.name || 'um prêmio'}!`
          : 'Que pena! Tente novamente na próxima.',
        data: {
          game: gameResult,
          result: {
            isWinner: gameResult.is_winner,
            amountWon: gameResult.amount_won,
            prize: gameResult.prize,
            scratchCard: gameResult.scratchCard
          }
        }
      });
    } catch (error) {
      let statusCode = 500;
      
      if (error.message.includes('Saldo insuficiente')) {
        statusCode = 400;
      } else if (error.message.includes('não encontrada')) {
        statusCode = 404;
      } else if (error.message.includes('Usuário não encontrado')) {
        statusCode = 404;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Buscar estatísticas de uma raspadinha
  async getScratchCardStats(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      const stats = await scratchCardService.getScratchCardStats(id);
      
      res.status(200).json({
        success: true,
        message: 'Estatísticas recuperadas com sucesso',
        data: stats
      });
    } catch (error) {
      const statusCode = error.message.includes('não encontrada') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Buscar histórico de jogos de uma raspadinha
  async getScratchCardGameHistory(req, res) {
    try {
      const { id } = req.params;
      const { limit = 50 } = req.query;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      const games = await scratchCardService.getScratchCardGameHistory(id, parseInt(limit));
      
      res.status(200).json({
        success: true,
        message: 'Histórico de jogos recuperado com sucesso',
        data: games,
        count: games.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Validar compra de raspadinha (verificar saldo antes de comprar)
  async validatePurchase(req, res) {
    try {
      const { scratchCardId } = req.body;
      const userId = req.user.id;
      
      if (!scratchCardId) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      // Buscar dados do usuário e da raspadinha
      const [user, scratchCard] = await Promise.all([
        require('../services/user.service').getUserWithWallet(userId),
        scratchCardService.getScratchCardById(scratchCardId)
      ]);

      const wallet = user.wallet[0];
      const hasBalance = Number(wallet.balance) >= Number(scratchCard.price);
      
      res.status(200).json({
        success: true,
        message: 'Validação concluída',
        data: {
          canPurchase: hasBalance,
          userBalance: wallet.balance,
          scratchCardPrice: scratchCard.price,
          balanceAfterPurchase: hasBalance ? Number(wallet.balance) - Number(scratchCard.price) : null,
          scratchCard: {
            id: scratchCard.id,
            name: scratchCard.name,
            price: scratchCard.price,
            image_url: scratchCard.image_url
          }
        }
      });
    } catch (error) {
      let statusCode = 500;
      
      if (error.message.includes('não encontrada')) {
        statusCode = 404;
      } else if (error.message.includes('Usuário não encontrado')) {
        statusCode = 404;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // ==================== MÉTODOS DE ADMINISTRAÇÃO ====================

  /**
   * Criar nova raspadinha apenas com JSON (sem upload de imagens)
   */
  async createScratchCardJSON(req, res) {
    try {
      // Verificar se req.body existe
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Dados não fornecidos. Envie os dados da raspadinha e prêmios.'
        });
      }

      const { scratchCard, prizes } = req.body;

      // Validar estrutura dos dados
      if (!scratchCard || typeof scratchCard !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Dados da raspadinha são obrigatórios e devem ser um objeto válido'
        });
      }

      if (!prizes || !Array.isArray(prizes) || prizes.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Prêmios são obrigatórios e devem ser um array com pelo menos um item'
        });
      }

      // Validar campos obrigatórios da raspadinha
      const requiredScratchCardFields = ['name', 'description', 'price', 'target_rtp'];
      const missingScratchCardFields = requiredScratchCardFields.filter(field => !scratchCard[field]);
      
      if (missingScratchCardFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Campos obrigatórios da raspadinha ausentes: ${missingScratchCardFields.join(', ')}`
        });
      }

      // Validar campos obrigatórios dos prêmios
      const requiredPrizeFields = ['name', 'description', 'type', 'probability'];
      for (let i = 0; i < prizes.length; i++) {
        const prize = prizes[i];
        const missingPrizeFields = requiredPrizeFields.filter(field => !prize[field]);
        
        if (missingPrizeFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Campos obrigatórios do prêmio ${i + 1} ausentes: ${missingPrizeFields.join(', ')}`
          });
        }

        // Validar tipo de prêmio
        if (!['MONEY', 'PRODUCT'].includes(prize.type)) {
          return res.status(400).json({
            success: false,
            message: `Tipo de prêmio inválido no prêmio ${i + 1}. Use 'MONEY' ou 'PRODUCT'`
          });
        }

        // Validar campos específicos por tipo
        if (prize.type === 'MONEY' && !prize.value) {
          return res.status(400).json({
            success: false,
            message: `Campo 'value' é obrigatório para prêmios do tipo MONEY no prêmio ${i + 1}`
          });
        }

        if (prize.type === 'PRODUCT' && (!prize.product_name || !prize.redemption_value)) {
          return res.status(400).json({
            success: false,
            message: `Campos 'product_name' e 'redemption_value' são obrigatórios para prêmios do tipo PRODUCT no prêmio ${i + 1}`
          });
        }
      }

      const result = await scratchCardService.createScratchCardWithPrizes(scratchCard, prizes);

      res.status(201).json({
        success: true,
        message: 'Raspadinha criada com sucesso',
        data: result
      });
    } catch (error) {
      console.error('Erro ao criar raspadinha:', error);
      
      // Determinar status code baseado no tipo de erro
      let statusCode = 500;
      if (error.message.includes('deve') || 
          error.message.includes('obrigatório') || 
          error.message.includes('inválido') ||
          error.message.includes('não pode')) {
        statusCode = 400;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  /**
   * Criar nova raspadinha com múltiplos prêmios e upload de imagens para o Supabase
   */
  async createScratchCard(req, res) {
    try {
      // Verificar se req.body existe
      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Dados não fornecidos. Envie os dados da raspadinha e prêmios.'
        });
      }

      let scratchCardData, prizesData;
      
      try {
        // Parse dos dados JSON se enviados como string (multipart/form-data)
        if (req.body.scratchCard) {
          if (typeof req.body.scratchCard === 'string') {
            scratchCardData = JSON.parse(req.body.scratchCard);
          } else {
            scratchCardData = req.body.scratchCard;
          }
        } else {
          // Se não há campo scratchCard, assumir que os dados estão diretamente no body
          scratchCardData = req.body;
        }
        
        if (req.body.prizes) {
          if (typeof req.body.prizes === 'string') {
            prizesData = JSON.parse(req.body.prizes);
          } else {
            prizesData = req.body.prizes;
          }
        } else {
          prizesData = [];
        }
      } catch (parseError) {
        return res.status(400).json({
          success: false,
          message: 'Dados JSON mal formatados. Verifique a estrutura dos dados enviados.',
          error: parseError.message
        });
      }

      // Validar estrutura dos dados
      if (!scratchCardData || typeof scratchCardData !== 'object') {
        return res.status(400).json({
          success: false,
          message: 'Dados da raspadinha são obrigatórios e devem ser um objeto válido'
        });
      }

      if (!prizesData || !Array.isArray(prizesData) || prizesData.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Prêmios são obrigatórios e devem ser um array com pelo menos um item'
        });
      }

      // Validar campos obrigatórios da raspadinha (removendo image_url da validação obrigatória)
      const requiredScratchCardFields = ['name', 'description', 'price', 'target_rtp'];
      const missingScratchCardFields = requiredScratchCardFields.filter(field => !scratchCardData[field]);
      
      if (missingScratchCardFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Campos obrigatórios da raspadinha ausentes: ${missingScratchCardFields.join(', ')}`
        });
      }

      // Validar campos obrigatórios dos prêmios (removendo image_url da validação obrigatória)
      const requiredPrizeFields = ['name', 'description', 'type', 'probability'];
      for (let i = 0; i < prizesData.length; i++) {
        const prize = prizesData[i];
        const missingPrizeFields = requiredPrizeFields.filter(field => !prize[field]);
        
        if (missingPrizeFields.length > 0) {
          return res.status(400).json({
            success: false,
            message: `Campos obrigatórios do prêmio ${i + 1} ausentes: ${missingPrizeFields.join(', ')}`
          });
        }

        // Validar tipo de prêmio
        if (!['MONEY', 'PRODUCT'].includes(prize.type)) {
          return res.status(400).json({
            success: false,
            message: `Tipo de prêmio inválido no prêmio ${i + 1}. Use 'MONEY' ou 'PRODUCT'`
          });
        }

        // Validar campos específicos por tipo
        if (prize.type === 'MONEY' && !prize.value) {
          return res.status(400).json({
            success: false,
            message: `Campo 'value' é obrigatório para prêmios do tipo MONEY no prêmio ${i + 1}`
          });
        }

        if (prize.type === 'PRODUCT' && (!prize.product_name || !prize.redemption_value)) {
          return res.status(400).json({
            success: false,
            message: `Campos 'product_name' e 'redemption_value' são obrigatórios para prêmios do tipo PRODUCT no prêmio ${i + 1}`
          });
        }
      }

      // Preparar dados para upload de imagens
      const files = {
        scratchCardImage: req.files?.scratchcard_image?.[0] || null,
        prizeImages: req.files?.prize_images || []
      };

      const result = await scratchCardService.createScratchCardWithPrizesAndImages(scratchCardData, prizesData, files);

      res.status(201).json({
        success: true,
        message: 'Raspadinha criada com sucesso',
        data: result
      });
    } catch (error) {
      console.error('Erro ao criar raspadinha:', error);
      
      // Determinar status code baseado no tipo de erro
      let statusCode = 500;
      if (error.message.includes('deve') || 
          error.message.includes('obrigatório') || 
          error.message.includes('inválido') ||
          error.message.includes('não pode')) {
        statusCode = 400;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message || 'Erro interno do servidor',
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Atualizar raspadinha
  async updateScratchCard(req, res) {
    try {
      const { id } = req.params;
      const updateData = req.body;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      const updatedScratchCard = await scratchCardService.updateScratchCard(id, updateData);
      
      res.status(200).json({
        success: true,
        message: 'Raspadinha atualizada com sucesso',
        data: updatedScratchCard
      });
    } catch (error) {
      let statusCode = 500;
      
      if (error.message.includes('não encontrada')) {
        statusCode = 404;
      } else if (error.message.includes('deve') || error.message.includes('obrigatório')) {
        statusCode = 400;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Excluir raspadinha
  async deleteScratchCard(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      const result = await scratchCardService.deleteScratchCard(id);
      
      const message = result.action === 'deactivated' 
        ? 'Raspadinha desativada (possui jogos ativos)'
        : 'Raspadinha excluída com sucesso';
      
      res.status(200).json({
        success: true,
        message,
        data: {
          action: result.action,
          scratchCard: result.scratchCard
        }
      });
    } catch (error) {
      const statusCode = error.message.includes('não encontrada') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Listar todas as raspadinhas (para admin)
  async getAllScratchCards(req, res) {
    try {
      const { includeInactive = false } = req.query;
      
      const scratchCards = await scratchCardService.getAllScratchCards(includeInactive === 'true');
      
      res.status(200).json({
        success: true,
        message: 'Raspadinhas recuperadas com sucesso',
        data: scratchCards,
        count: scratchCards.length
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Adicionar prêmio a uma raspadinha
  async addPrize(req, res) {
    try {
      const { id } = req.params;
      const prizeData = req.body;
      
      if (!id) {
        return res.status(400).json({
          success: false,
          message: 'ID da raspadinha é obrigatório'
        });
      }

      const prize = await scratchCardService.addPrizeToScratchCard(id, prizeData);
      
      res.status(201).json({
        success: true,
        message: 'Prêmio adicionado com sucesso',
        data: prize
      });
    } catch (error) {
      let statusCode = 500;
      
      if (error.message.includes('não encontrada')) {
        statusCode = 404;
      } else if (error.message.includes('deve') || error.message.includes('obrigatório')) {
        statusCode = 400;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Atualizar prêmio
  async updatePrize(req, res) {
    try {
      const { prizeId } = req.params;
      const updateData = req.body;
      
      if (!prizeId) {
        return res.status(400).json({
          success: false,
          message: 'ID do prêmio é obrigatório'
        });
      }

      const updatedPrize = await scratchCardService.updatePrize(prizeId, updateData);
      
      res.status(200).json({
        success: true,
        message: 'Prêmio atualizado com sucesso',
        data: updatedPrize
      });
    } catch (error) {
      let statusCode = 500;
      
      if (error.message.includes('não encontrado')) {
        statusCode = 404;
      } else if (error.message.includes('deve') || error.message.includes('obrigatório')) {
        statusCode = 400;
      }
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

  // Excluir prêmio
  async deletePrize(req, res) {
    try {
      const { prizeId } = req.params;
      
      if (!prizeId) {
        return res.status(400).json({
          success: false,
          message: 'ID do prêmio é obrigatório'
        });
      }

      const result = await scratchCardService.deletePrize(prizeId);
      
      const message = result.action === 'deactivated' 
        ? 'Prêmio desativado (possui jogos que o ganharam)'
        : 'Prêmio excluído com sucesso';
      
      res.status(200).json({
        success: true,
        message,
        data: {
          action: result.action,
          prize: result.prize
        }
      });
    } catch (error) {
      const statusCode = error.message.includes('não encontrado') ? 404 : 500;
      
      res.status(statusCode).json({
        success: false,
        message: error.message,
        error: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
}

module.exports = new ScratchCardController();