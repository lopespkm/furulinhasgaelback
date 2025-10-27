const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { prisma } = require('../config/database');

class AuthService {
  constructor() {
    this.jwtSecret = process.env.JWT_SECRET || 'your-secret-key';
    this.jwtExpiresIn = process.env.JWT_EXPIRES_IN || '7d';
    this.saltRounds = 12;
  }

  /**
   * Registra um novo usuário
   * @param {Object} userData - Dados do usuário
   * @param {string} userData.email - Email do usuário
   * @param {string} userData.phone - Telefone do usuário
   * @param {string} userData.password - Senha do usuário
   * @param {string} userData.full_name - Nome completo do usuário
   * @param {string} userData.cpf - CPF do usuário
   * @param {string} [userData.inviteCode] - Código de convite (opcional)
   * @returns {Object} Usuário criado e token JWT
   */
  async register(userData) {
    try {
      const { email, phone, password, full_name, cpf, invite_code } = userData;
      
      console.log('[AuthService] Iniciando registro com dados:', { email, phone, cpf, full_name, invite_code });

      // Validar se email, telefone e CPF já existem
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { email: email },
            { phone: phone },
            { cpf: cpf }
          ]
        }
      });

      if (existingUser) {
        if (existingUser.email === email) {
          throw new Error('Email já está em uso');
        }
        if (existingUser.phone === phone) {
          throw new Error('Telefone já está em uso');
        }
        if (existingUser.cpf === cpf) {
          throw new Error('CPF já está em uso');
        }
      }

      // Gerar username único baseado no full_name ou email
      const username = await this.generateUniqueUsername(full_name || email);

      // Validar código de convite se fornecido
      let inviterUserId = null;
      if (invite_code) {
        console.log('[AuthService] Validando código de convite:', invite_code);
        
        const inviteCodeRecord = await prisma.inviteCode.findFirst({
          where: { code: invite_code, is_active: true }
        });

        console.log('[AuthService] Resultado da busca do código de convite:', inviteCodeRecord);

        if (!inviteCodeRecord) {
          throw new Error('Código de convite inválido ou inativo');
        }

        inviterUserId = inviteCodeRecord.userId;
        console.log('[AuthService] ID do usuário que convidou:', inviterUserId);
      }

      // Hash da senha
      const hashedPassword = await bcrypt.hash(password, this.saltRounds);

      // Criar usuário em uma transação
      const result = await prisma.$transaction(async (tx) => {
        // Criar usuário
        console.log('[AuthService] Criando usuário com invitedBy:', inviterUserId);
        
        const newUser = await tx.user.create({
          data: {
            email,
            phone,
            cpf,
            username,
            password: hashedPassword,
            full_name,
            invitedBy: inviterUserId
          },
          select: {
            id: true,
            email: true,
            phone: true,
            full_name: true,
            is_admin: true,
            created_at: true
          }
        });

        // Criar carteira para o usuário
        await tx.wallet.create({
          data: {
            userId: newUser.id
          }
        });

        // Criar código de convite único para o novo usuário
        const userInviteCode = await this.generateUniqueInviteCode();
        await tx.inviteCode.create({
          data: {
            userId: newUser.id,
            code: userInviteCode
          }
        });

        // Atualizar estatísticas do convite se houver
        if (inviterUserId) {
          console.log('[AuthService] Atualizando estatísticas do convite para userId:', inviterUserId);
          
          try {
            const updateResult = await tx.inviteCode.update({
              where: { userId: inviterUserId },
              data: {
                total_invites: { increment: 1 }
              }
            });
            
            console.log('[AuthService] Estatísticas do convite atualizadas:', updateResult);
          } catch (updateError) {
            console.error('[AuthService] Erro ao atualizar estatísticas do convite:', updateError);
            // Não lançamos o erro para não interromper o fluxo de registro
          }
        }

        return newUser;
      });

      // Gerar token JWT
      const token = this.generateToken(result.id);

      return {
        user: result,
        token,
        message: 'Usuário registrado com sucesso'
      };

    } catch (error) {
      console.error('Erro no registro:', error);
      throw error;
    }
  }

  /**
   * Realiza login do usuário
   * @param {Object} credentials - Credenciais de login
   * @param {string} credentials.identifier - Email ou telefone
   * @param {string} credentials.password - Senha
   * @returns {Object} Usuário e token JWT
   */
  async login(credentials) {
    try {
      const { identifier, password } = credentials;

      // Buscar usuário por email ou telefone
      const whereConditions = [{ email: identifier }];
      if (identifier.includes('@')) {
        // Se contém @, é email
        whereConditions.push({ email: identifier });
      } else {
        // Se não contém @, pode ser telefone
        whereConditions.push({ phone: identifier });
      }
      
      const user = await prisma.user.findFirst({
        where: {
          OR: whereConditions,
          deleted_at: null
        },
        include: {
          wallet: true,
          inviteCode: true
        }
      });

      if (!user) {
        throw new Error('Credenciais inválidas');
      }

      // Verificar senha
      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        throw new Error('Credenciais inválidas');
      }

      // Gerar token JWT
      const token = this.generateToken(user.id);

      // Remover senha do retorno
      const { password: _, ...userWithoutPassword } = user;

      return {
        user: userWithoutPassword,
        token,
        message: 'Login realizado com sucesso'
      };

    } catch (error) {
      console.error('Erro no login:', error);
      throw error;
    }
  }

  /**
   * Verifica e decodifica um token JWT
   * @param {string} token - Token JWT
   * @returns {Object} Dados do usuário
   */
  async verifyToken(token) {
    try {
      const decoded = jwt.verify(token, this.jwtSecret);
      
      const user = await prisma.user.findUnique({
        where: { 
          id: decoded.userId,
          deleted_at: null
        },
        select: {
          id: true,
          email: true,
          phone: true,
          full_name: true,
          is_admin: true,
          created_at: true
        }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      return user;
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        throw new Error('Token inválido');
      }
      if (error.name === 'TokenExpiredError') {
        throw new Error('Token expirado');
      }
      throw error;
    }
  }

  /**
   * Atualiza a senha do usuário
   * @param {string} userId - ID do usuário
   * @param {string} currentPassword - Senha atual
   * @param {string} newPassword - Nova senha
   * @returns {Object} Resultado da operação
   */
  async changePassword(userId, currentPassword, newPassword) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      // Verificar senha atual
      const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
      if (!isCurrentPasswordValid) {
        throw new Error('Senha atual incorreta');
      }

      // Hash da nova senha
      const hashedNewPassword = await bcrypt.hash(newPassword, this.saltRounds);

      // Atualizar senha
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedNewPassword }
      });

      return {
        message: 'Senha alterada com sucesso'
      };

    } catch (error) {
      console.error('Erro ao alterar senha:', error);
      throw error;
    }
  }

  /**
   * Busca dados do perfil do usuário
   * @param {string} userId - ID do usuário
   * @returns {Object} Dados do perfil
   */
  async getProfile(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
          wallet: true,
          inviteCode: true,
          _count: {
            select: {
              games: true,
              invitedUsers: true
            }
          }
        }
      });

      if (!user) {
        throw new Error('Usuário não encontrado');
      }

      // Remover senha do retorno
      const { password: _, ...userProfile } = user;

      return userProfile;
    } catch (error) {
      console.error('Erro ao buscar perfil:', error);
      throw error;
    }
  }

  /**
   * Gera um token JWT
   * @param {string} userId - ID do usuário
   * @returns {string} Token JWT
   */
  generateToken(userId) {
    return jwt.sign(
      { userId },
      this.jwtSecret,
      { expiresIn: this.jwtExpiresIn }
    );
  }

  /**
   * Gera um código de convite único
   * @returns {string} Código de convite
   */
  async generateUniqueInviteCode() {
    let code;
    let isUnique = false;

    while (!isUnique) {
      // Gerar código alfanumérico de 8 caracteres
      code = Math.random().toString(36).substring(2, 10).toUpperCase();
      
      // Verificar se já existe
      const existingCode = await prisma.inviteCode.findUnique({
        where: { code }
      });

      if (!existingCode) {
        isUnique = true;
      }
    }

    return code;
  }

  /**
   * Valida formato de email
   * @param {string} email - Email para validar
   * @returns {boolean} Se o email é válido
   */
  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Valida formato de telefone brasileiro
   * @param {string} phone - Telefone para validar
   * @returns {boolean} Se o telefone é válido
   */
  validatePhone(phone) {
    // Remove caracteres não numéricos
    const cleanPhone = phone.replace(/\D/g, '');
    // Valida formato brasileiro (11 dígitos com DDD)
    return /^\d{10,11}$/.test(cleanPhone);
  }

  /**
   * Valida força da senha
   * @param {string} password - Senha para validar
   * @returns {Object} Resultado da validação
   */
  validatePassword(password) {
    const minLength = 4;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const isValid = password.length >= minLength;

    return {
      isValid,
      requirements: {
        minLength: password.length >= minLength,
      }
    };
  }

  /**
   * Gera um username único baseado no full_name ou email
   * @param {string} nameOrEmail - Nome completo do usuário ou email
   * @returns {string} Username único
   */
  async generateUniqueUsername(nameOrEmail) {
    // Se for email, usar a parte antes do @
    let baseName = nameOrEmail;
    if (nameOrEmail.includes('@')) {
      baseName = nameOrEmail.split('@')[0];
    }
    
    // Normalizar o nome: remover acentos, espaços e caracteres especiais
    let baseUsername = baseName
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^a-z0-9]/g, '') // Remove caracteres especiais e espaços
      .substring(0, 15); // Limita a 15 caracteres

    let username = baseUsername;
    let counter = 1;
    let isUnique = false;

    while (!isUnique) {
      // Verificar se o username já existe
      const existingUser = await prisma.user.findUnique({
        where: { username }
      });

      if (!existingUser) {
        isUnique = true;
      } else {
        // Se já existe, adicionar um número sequencial
        username = `${baseUsername}${counter}`;
        counter++;
      }
    }

    return username;
  }

  /**
   * Valida formato de CPF brasileiro
   * @param {string} cpf - CPF para validar
   * @returns {boolean} Se o CPF é válido
   */
  validateCPF(cpf) {
    // Remove caracteres não numéricos
    const cleanCPF = cpf.replace(/\D/g, '');
    
    // Verifica se tem 11 dígitos
    if (cleanCPF.length !== 11) return false;
    
    // Verifica se todos os dígitos são iguais
    if (/^(\d)\1{10}$/.test(cleanCPF)) return false;
    
    // Validação dos dígitos verificadores
    let sum = 0;
    for (let i = 0; i < 9; i++) {
      sum += parseInt(cleanCPF.charAt(i)) * (10 - i);
    }
    let remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.charAt(9))) return false;
    
    sum = 0;
    for (let i = 0; i < 10; i++) {
      sum += parseInt(cleanCPF.charAt(i)) * (11 - i);
    }
    remainder = (sum * 10) % 11;
    if (remainder === 10 || remainder === 11) remainder = 0;
    if (remainder !== parseInt(cleanCPF.charAt(10))) return false;
    
    return true;
  }
}

module.exports = new AuthService();