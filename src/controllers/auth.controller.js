const authService = require('../services/auth.service');

class AuthController {
  /**
   * Registra um novo usuário
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async register(req, res) {
    try {
      const { email, phone, password, full_name, cpf, invite_code } = req.body;
      
      console.log('Dados recebidos no registro:', { email, phone, cpf, full_name, invite_code });

      // Validações básicas
      if (!email || !password || !cpf) {
        return res.status(400).json({
          success: false,
          message: 'Todos os campos obrigatórios devem ser preenchidos',
          required_fields: ['email', 'password', 'cpf']
        });
      }

      // Validar formato do email
      if (!authService.validateEmail(email)) {
        return res.status(400).json({
          success: false,
          message: 'Formato de email inválido'
        });
      }

      // Validar formato do telefone (se fornecido)
      if (phone && !authService.validatePhone(phone)) {
        return res.status(400).json({
          success: false,
          message: 'Formato de telefone inválido. Use o formato brasileiro (10 ou 11 dígitos)'
        });
      }

      // Validar CPF
      if (!authService.validateCPF(cpf)) {
        return res.status(400).json({
          success: false,
          message: 'CPF inválido'
        });
      }

      // Validar força da senha
      const passwordValidation = authService.validatePassword(password);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Senha não atende aos requisitos de segurança',
          requirements: passwordValidation.requirements
        });
      }

      // Registrar usuário
      console.log('Enviando para o serviço de autenticação:', { email, phone, cpf, full_name, invite_code });
      
      const result = await authService.register({
        email,
        phone,
        password,
        full_name,
        cpf,
        invite_code
      });
      
      console.log('Resultado do registro:', { userId: result.user.id, invite_code });

      res.status(201).json({
        success: true,
        data: result,
        message: 'Usuário registrado com sucesso'
      });

    } catch (error) {
      console.error('Erro no registro:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Erro interno do servidor'
      });
    }
  }

  /**
   * Realiza login do usuário
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async login(req, res) {
    try {
      const { identifier, password } = req.body;

      // Validações básicas
      if (!identifier || !password) {
        return res.status(400).json({
          success: false,
          message: 'Email/telefone e senha são obrigatórios'
        });
      }

      // Realizar login
      const result = await authService.login({ identifier, password });

      res.status(200).json({
        success: true,
        data: result,
        message: 'Login realizado com sucesso'
      });

    } catch (error) {
      console.error('Erro no login:', error);
      res.status(401).json({
        success: false,
        message: error.message || 'Credenciais inválidas'
      });
    }
  }

  /**
   * Verifica se o token JWT é válido
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async verifyToken(req, res) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '');

      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Token não fornecido'
        });
      }

      const user = await authService.verifyToken(token);

      res.status(200).json({
        success: true,
        data: { user },
        message: 'Token válido'
      });

    } catch (error) {
      console.error('Erro na verificação do token:', error);
      res.status(401).json({
        success: false,
        message: error.message || 'Token inválido'
      });
    }
  }

  /**
   * Busca dados do perfil do usuário autenticado
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async getProfile(req, res) {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      const profile = await authService.getProfile(userId);

      res.status(200).json({
        success: true,
        data: { profile },
        message: 'Perfil recuperado com sucesso'
      });

    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Erro ao buscar perfil'
      });
    }
  }

  /**
   * Altera a senha do usuário
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async changePassword(req, res) {
    try {
      const userId = req.user?.id;
      const { currentPassword, newPassword } = req.body;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: 'Usuário não autenticado'
        });
      }

      if (!currentPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          message: 'Senha atual e nova senha são obrigatórias'
        });
      }

      // Validar força da nova senha
      const passwordValidation = authService.validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        return res.status(400).json({
          success: false,
          message: 'Nova senha não atende aos requisitos de segurança',
          requirements: passwordValidation.requirements
        });
      }

      const result = await authService.changePassword(userId, currentPassword, newPassword);

      res.status(200).json({
        success: true,
        data: result,
        message: 'Senha alterada com sucesso'
      });

    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      res.status(400).json({
        success: false,
        message: error.message || 'Erro ao alterar senha'
      });
    }
  }

  /**
   * Logout do usuário (invalidar token no frontend)
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async logout(req, res) {
    try {
      // Como estamos usando JWT stateless, o logout é feito no frontend
      // removendo o token do storage. Aqui apenas confirmamos a ação.
      res.status(200).json({
        success: true,
        message: 'Logout realizado com sucesso'
      });

    } catch (error) {
      console.error('Erro no logout:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }

  /**
   * Valida dados de entrada para registro
   * @param {Object} req - Request object
   * @param {Object} res - Response object
   */
  async validateRegistrationData(req, res) {
    try {
      const { email, phone, cpf } = req.body;
      const validations = {};

      if (email) {
        validations.email = {
          isValid: authService.validateEmail(email),
          message: authService.validateEmail(email) ? 'Email válido' : 'Formato de email inválido'
        };
      }

      if (phone) {
        validations.phone = {
          isValid: authService.validatePhone(phone),
          message: authService.validatePhone(phone) ? 'Telefone válido' : 'Formato de telefone inválido'
        };
      }

      if (cpf) {
        validations.cpf = {
          isValid: authService.validateCPF(cpf),
          message: authService.validateCPF(cpf) ? 'CPF válido' : 'CPF inválido'
        };
      }

      res.status(200).json({
        success: true,
        data: { validations },
        message: 'Validações realizadas'
      });

    } catch (error) {
      console.error('Erro na validação:', error);
      res.status(500).json({
        success: false,
        message: 'Erro interno do servidor'
      });
    }
  }
}

module.exports = new AuthController();