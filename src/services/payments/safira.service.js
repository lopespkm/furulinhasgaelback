const axios = require('axios');

class SafiraService {
  constructor() {
    this.baseURL = process.env.SAFIRA_BASE_URL || 'https://api.safira.cash';
    this.apiKey = process.env.SAFIRA_API_KEY;
    
    if (!this.apiKey) {
      throw new Error('SAFIRA_API_KEY não configurada nas variáveis de ambiente');
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.apiKey
      },
      timeout: 30000
    });
  }

  /**
   * Gerar QR Code PIX para depósito
   * @param {Object} depositData - Dados do depósito
   * @param {number} depositData.amount - Valor do depósito
   * @param {Object} depositData.customerData - Dados do cliente
   * @param {string} depositData.customerData.name - Nome do cliente
   * @param {string} depositData.customerData.email - Email do cliente
   * @param {string} depositData.customerData.document - CPF do cliente
   * @param {string} depositData.customerData.phone - Telefone do cliente
   * @param {Object} depositData.metadata - Metadados adicionais
   * @returns {Promise<Object>} Dados do pagamento PIX
   */
  async createPixPayment(depositData) {
    try {
      const payload = {
        amount: depositData.amount,
        paymentMethod: 'PIX',
        customerData: {
          name: depositData.customerData.name,
          email: depositData.customerData.email,
          document: depositData.customerData.document,
          phone: depositData.customerData.phone
        },
        metadata: {
          orderId: depositData.metadata.orderId,
          description: depositData.metadata.description || 'Depósito via PIX',
          userId: depositData.metadata.userId,
          walletId: depositData.metadata.walletId
        }
      };

      console.log('🔄 Criando pagamento PIX na Safira:', {
        amount: payload.amount,
        orderId: payload.metadata.orderId
      });

      const response = await this.client.post('/api/payments/deposit', payload);
      
      console.log('✅ Pagamento PIX criado com sucesso:', response.data);

      // Gerar QR Code em base64 a partir do código PIX
      const pixQrCode = response.data.data?.pixQrCode || response.data.pixQrCode;
      const qrCodeBase64 = pixQrCode ? Buffer.from(pixQrCode).toString('base64') : null;

      return {
        success: true,
        transactionId: response.data.data?.transactionId || response.data.id,
        qrCode: pixQrCode,
        qrCodeBase64: qrCodeBase64,
        pixKey: response.data.data?.pixKey || response.data.pixKey,
        amount: response.data.data?.amount || response.data.amount,
        expiresAt: response.data.data?.expiresAt || response.data.expiresAt,
        status: response.data.data?.status || response.data.status,
        metadata: response.data.data || response.data.metadata
      };
    } catch (error) {
      console.error('❌ Erro ao criar pagamento PIX na Safira:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      throw new Error(`Erro na Safira: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Verificar status de um pagamento
   * @param {string} transactionId - ID da transação
   * @returns {Promise<Object>} Status do pagamento
   */
  async checkPaymentStatus(transactionId) {
    try {
      console.log('🔍 Verificando status do pagamento:', transactionId);

      const response = await this.client.get(`/api/payments/${transactionId}`);
      
      return {
        success: true,
        transactionId: response.data.id,
        status: response.data.status,
        amount: response.data.amount,
        paidAt: response.data.paidAt,
        metadata: response.data.metadata
      };
    } catch (error) {
      console.error('❌ Erro ao verificar status do pagamento:', {
        transactionId,
        message: error.message,
        response: error.response?.data
      });

      throw new Error(`Erro ao verificar pagamento: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Webhook para receber notificações de pagamento
   * @param {Object} webhookData - Dados do webhook
   * @returns {Object} Dados processados do webhook
   */
  processWebhook(webhookData) {
    try {
      console.log('📨 Processando webhook da Safira:', {
        transactionId: webhookData.id,
        status: webhookData.status
      });

      return {
        transactionId: webhookData.id,
        status: webhookData.status,
        amount: webhookData.amount,
        paidAt: webhookData.paidAt,
        metadata: webhookData.metadata,
        isValid: true
      };
    } catch (error) {
      console.error('❌ Erro ao processar webhook:', error.message);
      
      return {
        isValid: false,
        error: error.message
      };
    }
  }

  /**
   * Validar configuração do serviço
   * @returns {boolean} Se a configuração está válida
   */
  isConfigured() {
    return !!(this.apiKey && this.baseURL);
  }

  /**
   * Testar conectividade com a API
   * @returns {Promise<boolean>} Se a conexão está funcionando
   */
  async testConnection() {
    try {
      await this.client.get('/health');
      return true;
    } catch (error) {
      console.error('❌ Erro ao testar conexão com Safira:', error.message);
      return false;
    }
  }
}

module.exports = SafiraService;