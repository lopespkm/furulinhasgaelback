const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

class DigitoService {
    constructor() {
        this.baseURL = process.env.DIGITO_BASE_URL || 'https://api.digitopayoficial.com.br';
        this.clientId = process.env.DIGITO_CI;
        this.clientSecret = process.env.DIGITO_CS;
        this.accessToken = null;
        this.tokenExpiry = null;
        
        if (!this.clientId || !this.clientSecret) {
            throw new Error('DIGITO_CI e DIGITO_CS não configurados nas variáveis de ambiente');
        }

        this.client = axios.create({
            baseURL: this.baseURL,
            timeout: 30000
        });
    }

    /**
     * Cria um token de acesso para autenticação
     * @returns {Promise<Object>} Token de acesso e data de expiração
     */
    async createAccessToken() {
        try {
            const payload = {
                clientId: this.clientId,
                secret: this.clientSecret,
            };

            const response = await this.client.post('/api/token/api', payload);

            this.accessToken = response.data.accessToken;
            this.tokenExpiry = response.data.expiration;

            return {
                success: true,
                token: this.accessToken,
                expires_in: response.data.expiration
            };
        } catch (error) {
            console.error('[DigitoService] Erro ao criar token de acesso:', error.response?.data || error.message);
            throw new Error(`Falha ao obter token de acesso: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Verifica se o token é válido
     * @returns {boolean} Se o token está válido
     */
    isTokenValid() {
        return this.accessToken && this.tokenExpiry && new Date(this.tokenExpiry) > new Date();
    }

    /**
     * Obter token válido (criar novo se necessário)
     * @returns {Promise<string>} Token de acesso
     */
    async getValidToken() {
        if (!this.isTokenValid()) {
            await this.createAccessToken();
        }
        return this.accessToken;
    }

    /**
     * Criar pagamento PIX (compatível com interface do deposit service)
     * @param {Object} paymentData - Dados do pagamento
     * @param {number} paymentData.amount - Valor do pagamento
     * @param {Object} paymentData.customerData - Dados do cliente
     * @param {string} paymentData.customerData.name - Nome do cliente
     * @param {string} paymentData.customerData.document - CPF do cliente
     * @param {string} paymentData.customerData.email - Email do cliente
     * @param {Object} paymentData.metadata - Metadados adicionais
     * @returns {Promise<Object>} Dados do pagamento PIX
     */
    async createPixPayment(paymentData) {
        let payload;
        
        try {
            const token = await this.getValidToken();
            
            // URL base para webhook (pode ser configurada via env)
            const callbackUrl = `https://api.raspa.ae/api/deposits/webhook/digito`;
            
            const depositData = {
                value: paymentData.amount,
                cpf: paymentData.customerData.document,
                name: paymentData.customerData.name,
                callbackUrl: callbackUrl,
                idempotencyKey: paymentData.metadata?.orderId || paymentData.metadata?.depositId || uuidv4(),
                dueDate: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 horas
            };

            console.log('🔄 Criando pagamento PIX no DigitoPay:', {
                amount: depositData.value,
                orderId: depositData.idempotencyKey
            });

            payload = {
                dueDate: depositData.dueDate.toISOString(),
                paymentOptions: ['PIX'],
                person: {
                    cpf: depositData.cpf.replace(/\D/g, ''), // Remove caracteres não numéricos
                    name: depositData.name
                },
                value: depositData.value,
                callbackUrl: depositData.callbackUrl,
                idempotencyKey: depositData.idempotencyKey
            };

            console.log('📤 Payload sendo enviado para DigitoPay:', JSON.stringify(payload, null, 2));

            const response = await this.client.post('/api/deposit', payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ Pagamento PIX criado com sucesso no DigitoPay:', response.data);

            return {
                success: true,
                transactionId: response.data.id,
                qrCode: response.data.pixCopiaECola,
                qrCodeBase64: response.data.qrCodeBase64,
                pixKey: response.data.pixCopiaECola, // O próprio PIX Copia e Cola pode ser usado como chave
                expiresAt: depositData.dueDate,
                amount: response.data.value || paymentData.amount,
                status: 'PENDING',
                metadata: {
                    idempotencyKey: response.data.idempotencyKey,
                    endToEndId: response.data.endToEndId,
                    txid: response.data.txid
                }
            };
        } catch (error) {
            console.error('❌ Erro ao criar pagamento PIX no DigitoPay:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            // Log detalhado para erro 422 (validação)
            if (error.response?.status === 422) {
                console.error('🔍 Detalhes do erro de validação:');
                if (payload) {
                    console.error('📋 Payload enviado:', JSON.stringify(payload, null, 2));
                }
                console.error('❌ Erros de validação:', error.response?.data?.errors);
                
                if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
                    error.response.data.errors.forEach((err, index) => {
                        console.error(`  Erro ${index + 1}:`, {
                            property: err.propertyName,
                            message: err.errorMessage
                        });
                    });
                }
            }

            if (error.response?.status === 401) {
                // Token expirado, tenta renovar e fazer novamente
                this.accessToken = null;
                this.tokenExpiry = null;
                return this.createPixPayment(paymentData);
            }

            throw new Error(`Erro no DigitoPay: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Verificar status de um pagamento
     * @param {string} transactionId - ID da transação
     * @returns {Promise<Object>} Status do pagamento
     */
    async checkPaymentStatus(transactionId) {
        try {
            const token = await this.getValidToken();
            
            console.log('🔍 Verificando status do pagamento DigitoPay:', transactionId);

            const response = await this.client.get(`/api/cash-in/${transactionId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                transactionId: response.data.id,
                status: response.data.status,
                amount: response.data.valor || response.data.value,
                paidAt: response.data.movementDate ? new Date(response.data.movementDate) : null,
                metadata: response.data
            };
        } catch (error) {
            console.error('❌ Erro ao verificar status do pagamento DigitoPay:', {
                transactionId,
                message: error.message,
                response: error.response?.data
            });

            if (error.response?.status === 401) {
                this.accessToken = null;
                this.tokenExpiry = null;
                return this.checkPaymentStatus(transactionId);
            }

            throw new Error(`Erro ao verificar pagamento: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Cancela um depósito pendente
     * @param {string} depositId - ID do depósito
     * @returns {Promise<Object>} Resultado do cancelamento
     */
    async cancelCashIn(depositId) {
        try {
            const token = await this.getValidToken();

            const response = await this.client.delete(`/api/cash-in/${depositId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            return {
                success: true,
                data: response.data,
                message: 'Depósito cancelado com sucesso'
            };

        } catch (error) {
            console.error('❌ Erro ao cancelar depósito DigitoPay:', error.response?.data || error.message);
            
            if (error.response?.status === 401) {
                this.accessToken = null;
                this.tokenExpiry = null;
                return this.cancelCashIn(depositId);
            }

            throw new Error(error.response?.data?.message || 'Falha ao cancelar depósito');
        }
    }

    /**
     * Processar pagamento (Cash Out) - Compatível com interface do admin service
     * @param {Object} paymentData - Dados do pagamento
     * @param {number} paymentData.amount - Valor do pagamento
     * @param {string} paymentData.description - Descrição do pagamento
     * @param {string} paymentData.external_id - ID externo para rastreamento
     * @param {string} paymentData.pixKey - Chave PIX
     * @param {string} paymentData.recipientName - Nome do destinatário
     * @param {string} paymentData.keyType - Tipo da chave PIX (CPF, CNPJ, EMAIL, PHONE, EVP)
     * @param {string} paymentData.taxId - CPF/CNPJ do destinatário
     * @returns {Promise<Object>} Resultado do processamento
     */
    async processPayment(paymentData) {
        try {
            const token = await this.getValidToken();
            
            // URL base para webhook (pode ser configurada via env)
            const callbackUrl = `https://api.raspa.ae/api/withdraws/webhook/digito`;
            
            // Validar valor mínimo
            if (paymentData.amount < 10) {
                throw new Error('Valor mínimo para saque é R$10');
            }

            // Mapear tipo de chave PIX
            const pixKeyTypeMap = {
                'CPF': 'CPF',
                'CNPJ': 'CNPJ', 
                'EMAIL': 'EMAIL',
                'PHONE': 'PHONE',
                'EVP': 'EVP'
            };

            const pixKeyType = pixKeyTypeMap[paymentData.keyType?.toUpperCase()] || 'CPF';

            // Formatar chave PIX conforme tipo
            let formattedPixKey = paymentData.pixKey;
            if (pixKeyType === 'CPF' || pixKeyType === 'CNPJ') {
                formattedPixKey = paymentData.pixKey.replace(/\D/g, ''); // Remove caracteres não numéricos
            } else if (pixKeyType === 'EMAIL') {
                formattedPixKey = paymentData.pixKey.toLowerCase();
            } else if (pixKeyType === 'PHONE') {
                formattedPixKey = paymentData.pixKey.replace(/\D/g, ''); // Remove caracteres não numéricos
            } else if (pixKeyType === 'EVP') {
                formattedPixKey = paymentData.pixKey.trim(); // Remove espaços
            }

            const payload = {
                paymentOptions: ['PIX'],
                person: {
                    pixKeyTypes: pixKeyType,
                    pixKey: formattedPixKey,
                    name: paymentData.recipientName,
                    cpf: paymentData.taxId.replace(/\D/g, '') // Remove caracteres não numéricos
                },
                value: paymentData.amount,
                callbackUrl: callbackUrl,
                idempotencyKey: paymentData.external_id || uuidv4()
            };

            console.log('🔄 Processando pagamento Cash Out no DigitoPay:', {
                amount: payload.value,
                pixKeyType: payload.person.pixKeyTypes,
                recipientName: payload.person.name,
                externalId: payload.idempotencyKey
            });

            console.log('📤 Payload Cash Out sendo enviado para DigitoPay:', JSON.stringify(payload, null, 2));

            const response = await this.client.post('/api/withdraw', payload, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            console.log('✅ Pagamento Cash Out criado com sucesso no DigitoPay:', response.data);

            return {
                success: true,
                data: response.data,
                digitoTransactionId: response.data.id,
                status: response.data.status || 'EM PROCESSAMENTO'
            };

        } catch (error) {
            console.error('❌ Erro ao processar pagamento Cash Out no DigitoPay:', {
                message: error.message,
                response: error.response?.data,
                status: error.response?.status
            });

            // Log detalhado para erro 422 (validação)
            if (error.response?.status === 422) {
                console.error('🔍 Detalhes do erro de validação Cash Out:');
                console.error('❌ Erros de validação:', error.response?.data?.errors);
                
                if (error.response?.data?.errors && Array.isArray(error.response.data.errors)) {
                    error.response.data.errors.forEach((err, index) => {
                        console.error(`  Erro ${index + 1}:`, {
                            property: err.propertyName,
                            message: err.errorMessage
                        });
                    });
                }
            }

            if (error.response?.status === 401) {
                // Token expirado, tenta renovar e fazer novamente
                this.accessToken = null;
                this.tokenExpiry = null;
                return this.processPayment(paymentData);
            }

            return {
                success: false,
                error: error.response?.data?.message || error.message,
                errorCode: error.response?.status
            };
        }
    }

    /**
     * Webhook para receber notificações de pagamento
     * @param {Object} webhookData - Dados do webhook
     * @returns {Object} Dados processados do webhook
     */
    processWebhook(webhookData) {
        try {
            console.log('📨 Processando webhook do DigitoPay:', {
                transactionId: webhookData.id,
                status: webhookData.status
            });

            // Validações básicas
            if (!webhookData.id || !webhookData.status || !webhookData.valor || !webhookData.idempotencyKey) {
                return {
                    isValid: false,
                    error: 'Dados obrigatórios do webhook não fornecidos'
                };
            }

            // Mapear status do DigitoPay para status padrão
            const statusMap = {
                'PENDENTE': 'PENDING',
                'pending': 'PENDING',
                'REALIZADO': 'PAID',
                'realizado': 'PAID',
                'completed': 'PAID',
                'CANCELADO': 'CANCELLED',
                'cancelado': 'CANCELLED',
                'cancelled': 'CANCELLED'
            };

            const status = statusMap[webhookData.status] || webhookData.status;

            // Processar data de pagamento
            let paidAt = null;
            if (webhookData.movementDate) {
                paidAt = new Date(webhookData.movementDate);
            }

            return {
                isValid: true,
                transactionId: webhookData.id,
                externalId: webhookData.idempotencyKey,
                status: status,
                amount: webhookData.valor,
                paidAt: paidAt,
                payer: webhookData.pagador || null,
                rawData: webhookData
            };
        } catch (error) {
            console.error('❌ Erro ao processar webhook DigitoPay:', error.message);
            return {
                isValid: false,
                error: `Webhook processing failed: ${error.message}`
            };
        }
    }

    /**
     * Validar configuração do serviço
     * @returns {boolean} Se a configuração está válida
     */
    isConfigured() {
        return !!(this.clientId && this.clientSecret && this.baseURL);
    }

    /**
     * Testar conectividade com a API
     * @returns {Promise<boolean>} Se a conexão está funcionando
     */
    async testConnection() {
        try {
            await this.getValidToken();
            return true;
        } catch (error) {
            console.error('❌ Erro ao testar conexão com DigitoPay:', error.message);
            return false;
        }
    }

    /**
     * Valida CPF brasileiro
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

    /**
     * Gera uma chave de idempotência única
     * @returns {string} Chave de idempotência
     */
    generateIdempotencyKey() {
        return uuidv4();
    }
}

module.exports = new DigitoService();