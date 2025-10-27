const authService = require('../services/auth.service');

class AuthMiddleware {
  /**
   * Middleware para verificar se o usuário está autenticado
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  async authenticate(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        return res.status(401).json({
          success: false,
          message: 'Token de acesso não fornecido'
        });
      }

      const token = authHeader.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Formato de token inválido'
        });
      }

      // Verificar e decodificar o token
      const user = await authService.verifyToken(token);
      
      // Adicionar dados do usuário ao request
      req.user = user;
      req.token = token;
      
      next();
    } catch (error) {
      console.error('Erro na autenticação:', error);
      return res.status(401).json({
        success: false,
        message: error.message || 'Token inválido ou expirado'
      });
    }
  }

  /**
   * Middleware para verificar se o usuário é administrador
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  async requireAdmin(req, res, next) {
    try {
      console.log('Usuário autenticado:', req.user);
      // Verificar se o usuário está autenticado
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      // Verificar se é administrador
      if (!req.user.is_admin) {
        return res.status(403).json({
          success: false,
          message: 'Acesso negado. Privilégios de administrador necessários'
        });
      }

      next();
    } catch (error) {
      console.error('Erro na verificação de admin:', error);
      return res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  /**
   * Middleware opcional de autenticação (não bloqueia se não autenticado)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  async optionalAuth(req, res, next) {
    try {
      const authHeader = req.headers.authorization;
      
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        
        if (token) {
          try {
            const user = await authService.verifyToken(token);
            req.user = user;
            req.token = token;
          } catch (error) {
            // Token inválido, mas não bloqueia a requisição
            console.log('Token opcional inválido:', error.message);
          }
        }
      }
      
      next();
    } catch (error) {
      console.error('Erro na autenticação opcional:', error);
      next(); // Continua mesmo com erro
    }
  }

  /**
   * Middleware para verificar se o usuário pode acessar seus próprios dados
   * @param {string} paramName - Nome do parâmetro que contém o ID do usuário
   * @returns {Function} Middleware function
   */
  requireOwnershipOrAdmin(paramName = 'userId') {
    return async (req, res, next) => {
      try {
        if (!req.user) {
          return res.status(401).json({
            success: false,
            message: 'Usuário não autenticado'
          });
        }

        const targetUserId = req.params[paramName] || req.body[paramName];
        
        if (!targetUserId) {
          return res.status(400).json({
            success: false,
            message: `Parâmetro ${paramName} é obrigatório`
          });
        }

        // Permitir se for admin ou se for o próprio usuário
        if (req.user.is_admin || req.user.id === targetUserId) {
          next();
        } else {
          return res.status(403).json({
            success: false,
            message: 'Acesso negado. Você só pode acessar seus próprios dados'
          });
        }
      } catch (error) {
        console.error('Erro na verificação de propriedade:', error);
        return res.status(500).json({
          success: false,
          message: 'Erro interno do servidor'
        });
      }
    };
  }

  /**
   * Middleware para rate limiting básico
   * @param {number} maxRequests - Máximo de requisições por janela
   * @param {number} windowMs - Janela de tempo em milissegundos
   * @returns {Function} Middleware function
   */
  rateLimit(maxRequests = 15000, windowMs = 15 * 60 * 1000) {
    const requests = new Map();
    
    return (req, res, next) => {
      const clientId = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      
      // Limpar registros antigos
      for (const [key, data] of requests.entries()) {
        if (now - data.firstRequest > windowMs) {
          requests.delete(key);
        }
      }
      
      const clientRequests = requests.get(clientId);
      
      if (!clientRequests) {
        requests.set(clientId, {
          count: 1,
          firstRequest: now
        });
        return next();
      }
      
      if (now - clientRequests.firstRequest > windowMs) {
        // Reset da janela
        requests.set(clientId, {
          count: 1,
          firstRequest: now
        });
        return next();
      }
      
      if (clientRequests.count >= maxRequests) {
        return res.status(429).json({
          success: false,
          message: 'Muitas requisições. Tente novamente mais tarde',
          retryAfter: Math.ceil((windowMs - (now - clientRequests.firstRequest)) / 1000)
        });
      }
      
      clientRequests.count++;
      next();
    };
  }

  /**
   * Middleware para validar campos obrigatórios
   * @param {Array} requiredFields - Array com nomes dos campos obrigatórios
   * @returns {Function} Middleware function
   */
  validateRequiredFields(requiredFields) {
    return (req, res, next) => {
      const missingFields = [];
      
      for (const field of requiredFields) {
        if (!req.body[field] && req.body[field] !== 0 && req.body[field] !== false) {
          missingFields.push(field);
        }
      }
      
      if (missingFields.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Campos obrigatórios não fornecidos',
          missing_fields: missingFields
        });
      }
      
      next();
    };
  }

  /**
   * Middleware para sanitizar dados de entrada
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  sanitizeInput(req, res, next) {
    try {
      // Sanitizar strings no body
      if (req.body && typeof req.body === 'object') {
        for (const key in req.body) {
          if (typeof req.body[key] === 'string') {
            // Remover espaços em branco no início e fim
            req.body[key] = req.body[key].trim();
            
            // Remover caracteres potencialmente perigosos
            req.body[key] = req.body[key].replace(/[<>"']/g, '');
          }
        }
      }
      
      next();
    } catch (error) {
      console.error('Erro na sanitização:', error);
      next();
    }
  }

  /**
   * Middleware para log de requisições
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  logRequest(req, res, next) {
    const timestamp = new Date().toISOString();
    const method = req.method;
    const url = req.originalUrl;
    const ip = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const userId = req.user?.id || 'anonymous';
    
    console.log(`[${timestamp}] ${method} ${url} - IP: ${ip} - User: ${userId} - UA: ${userAgent}`);
    
    next();
  }

  /**
   * Middleware para tratar erros globais
   * @param {Error} error - Error object
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   * @param {Function} next - Next function
   */
  errorHandler(error, req, res, next) {
    console.error('Erro global capturado:', error);
    
    // Verificar se a resposta já foi enviada
    if (res.headersSent) {
      return next(error);
    }
    
    // Erro de parsing JSON
    if (error.type === 'entity.parse.failed' || error.message === 'JSON inválido') {
      return res.status(400).json({
        success: false,
        message: 'JSON inválido'
      });
    }
    
    // Erro de validação do body-parser
    if (error.type === 'entity.verify.failed') {
      return res.status(400).json({
        success: false,
        message: 'Dados inválidos na requisição'
      });
    }
    
    // Erro de validação do Prisma
    if (error.code === 'P2002') {
      return res.status(400).json({
        success: false,
        message: 'Dados duplicados. Verifique os campos únicos'
      });
    }
    
    // Erro de registro não encontrado
    if (error.code === 'P2025') {
      return res.status(404).json({
        success: false,
        message: 'Registro não encontrado'
      });
    }
    
    // Erro genérico
    const statusCode = error.status || error.statusCode || 500;
    res.status(statusCode).json({
      success: false,
      message: process.env.NODE_ENV === 'production' 
        ? 'Erro interno do servidor' 
        : error.message
    });
  }
}

module.exports = new AuthMiddleware();