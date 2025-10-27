const axios = require('axios');

class PixupService {
    constructor() {
        this.baseURL = process.env.PIXUP_BASE_URL || 'https://api.pixupbr.com/v2';
        this.clientId = process.env.PIXUP_CI;
        this.clientSecret = process.env.PIXUP_CS;
        this.accessToken = null;
        this.tokenExpiry = null;
    }

    // Criar header de autenticação Basic Auth
    createBasicAuthHeader() {
        if (!this.clientId || !this.clientSecret) {
            throw new Error('PixUp credentials not configured');
        }

        // Concatenar client_id e client_secret com ':'
        const credentials = `${this.clientId}:${this.clientSecret}`;
        
        // Codificar em Base64
        const base64Credentials = Buffer.from(credentials).toString('base64');
        
        return `Basic ${base64Credentials}`;
    }

    // Criar token de acesso
    async createAccessToken() {
        try {
            const response = await axios.post(
                `${this.baseURL}/oauth/token`,
                {},
                {
                    headers: {
                        'Authorization': this.createBasicAuthHeader(),
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.access_token) {
                this.accessToken = response.data.access_token;
                // Definir expiração (geralmente em segundos, convertemos para timestamp)
                const expiresIn = response.data.expires_in || 3600; // Default 1 hora
                this.tokenExpiry = Date.now() + (expiresIn * 1000);
                
                return {
                    success: true,
                    token: this.accessToken,
                    expires_in: expiresIn
                };
            }

            throw new Error('Invalid response from PixUp API');
        } catch (error) {
            console.error('Error creating PixUp access token:', error.response?.data || error.message);
            throw new Error(`Failed to create PixUp access token: ${error.response?.data?.message || error.message}`);
        }
    }

    // Verificar se o token é válido
    isTokenValid() {
        return this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry;
    }

    // Obter token válido (criar novo se necessário)
    async getValidToken() {
        if (!this.isTokenValid()) {
            await this.createAccessToken();
        }
        return this.accessToken;
    }

    // Criar pagamento PIX (compatível com interface do deposit service)
    async createPixPayment(paymentData) {
        try {
            const token = await this.getValidToken();
            
            // URL base para webhook (pode ser configurada via env)
            const postbackUrl = `${process.env.BACKEND_URL}/v1/api/payments/webhook/pixup`;
            
            const pixData = {
                amount: paymentData.amount,
                payerQuestion: paymentData.metadata?.description || `Depósito de R$ ${paymentData.amount}`,
                external_id: paymentData.metadata?.orderId || paymentData.metadata?.depositId,
                postbackUrl: postbackUrl,
                payer: {
                    name: this.generateRandomName(),
                    document: this.generateValidCPF(),
                    email: paymentData.customerData?.email
                },
                // split: [
                //     {
                //         username: "odesenvolvedor",
                //         percentageSplit: 1
                //     }
                // ]
            };

            const response = await axios.post(
                `${this.baseURL}/pix/qrcode`,
                pixData,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            if (response.data && response.data.qrcode) {
                return {
                    success: true,
                    transactionId: response.data.id || response.data.transaction_id,
                    qrCode: response.data.qrcode,
                    qrCodeBase64: response.data.qrcode_base64 || response.data.qrcode,
                    pixKey: response.data.pix_key || response.data.key,
                    expiresAt: response.data.expires_at || new Date(Date.now() + 30 * 60 * 1000), // 30 minutos padrão
                    amount: paymentData.amount,
                    status: 'PENDING'
                };
            }

            throw new Error('Invalid response from PixUp API - missing qrcode');
        } catch (error) {
            console.error('Error creating PixUp PIX payment:', error.response?.data || error.message);
            throw new Error(`Failed to create PixUp PIX payment: ${error.response?.data?.message || error.message}`);
        }
    }

    // Processar webhook do PixUp
    processWebhook(webhookData) {
        try {
            // Extrair dados do requestBody se presente
            const requestBody = webhookData.requestBody || webhookData;
            
            // Validar estrutura básica do webhook
            if (!requestBody || (!requestBody.transactionId && !requestBody.id)) {
                return {
                    isValid: false,
                    error: 'Invalid webhook data - missing transaction ID'
                };
            }

            // Mapear status do PixUp para status padrão
            const statusMap = {
                'PAID': 'PAID',
                'paid': 'PAID',
                'COMPLETED': 'COMPLETED',
                'completed': 'COMPLETED',
                'approved': 'PAID',
                'PENDING': 'PENDING',
                'pending': 'PENDING',
                'CANCELLED': 'CANCELLED',
                'cancelled': 'CANCELLED',
                'EXPIRED': 'EXPIRED',
                'expired': 'EXPIRED',
                'FAILED': 'FAILED',
                'failed': 'FAILED'
            };

            const status = statusMap[requestBody.status] || requestBody.status;

            // Processar data de aprovação
            let paidAt = null;
            if (requestBody.dateApproval) {
                // Converter formato "2024-10-07 16:07:10" para Date
                paidAt = new Date(requestBody.dateApproval.replace(' ', 'T'));
            }

            return {
                isValid: true,
                transactionId: requestBody.transactionId || requestBody.id,
                externalId: requestBody.external_id,
                status: status,
                amount: requestBody.amount,
                paymentType: requestBody.paymentType,
                transactionType: requestBody.transactionType,
                paidAt: paidAt,
                creditParty: requestBody.creditParty,
                debitParty: requestBody.debitParty,
                rawData: webhookData
            };
        } catch (error) {
            console.error('Error processing PixUp webhook:', error.message);
            return {
                isValid: false,
                error: `Webhook processing failed: ${error.message}`
            };
        }
    }

    // Processar pagamento (Cash-out)
    async processPayment(paymentData) {
        try {
            const token = await this.getValidToken();

            const paymentPayload = {
                amount: paymentData.amount,
                description: paymentData.description || 'Saque via plataforma',
                external_id: paymentData.external_id,
                creditParty: {
                    key: paymentData.pixKey,
                    name: paymentData.recipientName,
                    keyType: paymentData.keyType, // Adicionando o tipo da chave PIX
                    taxId: paymentData.taxId // Adicionando o documento (CPF/CNPJ)
                }
            };

            const response = await axios.post(
                `${this.baseURL}/pix/payment`,
                paymentPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: true,
                data: response.data,
                pixupTransactionId: response.data.id,
                status: response.data.status
            };

        } catch (error) {
            console.error('Erro ao processar pagamento PixUp:', error.response?.data || error.message);
            
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                errorCode: error.response?.status
            };
        }
    }

    // Gerar nome aleatório para testes
    generateRandomName() {
        const firstNames = [
            'João', 'Maria', 'José', 'Ana', 'Carlos', 'Francisca', 'Antonio', 'Antonia',
            'Manoel', 'Helena', 'Francisco', 'Conceição', 'Adriano', 'Aparecida', 'Sebastião',
            'Marcia', 'Eduardo', 'Rita', 'Paulo', 'Rosa', 'Raimundo', 'Izabel', 'Marcos',
            'Solange', 'Benedito', 'Lúcia', 'Antônio', 'Fernanda', 'Carlos', 'Regina'
        ];
        
        const lastNames = [
            'Silva', 'Santos', 'Oliveira', 'Souza', 'Rodrigues', 'Ferreira', 'Alves', 'Pereira',
            'Lima', 'Gomes', 'Ribeiro', 'Carvalho', 'Almeida', 'Lopes', 'Soares', 'Fernandes',
            'Vieira', 'Barbosa', 'Rocha', 'Dias', 'Monteiro', 'Cardoso', 'Reis', 'Araújo',
            'Cavalcanti', 'Nascimento', 'Moreira', 'Mendes', 'Freitas', 'Ramos'
        ];
        
        const firstName = firstNames[Math.floor(Math.random() * firstNames.length)];
        const lastName = lastNames[Math.floor(Math.random() * lastNames.length)];
        
        return `${firstName} ${lastName}`;
    }

    // Gerar CPF válido para testes
    generateValidCPF() {
        // Gerar os 9 primeiros dígitos
        let cpf = '';
        for (let i = 0; i < 9; i++) {
            cpf += Math.floor(Math.random() * 10);
        }
        
        // Calcular primeiro dígito verificador
        let sum = 0;
        for (let i = 0; i < 9; i++) {
            sum += parseInt(cpf.charAt(i)) * (10 - i);
        }
        let remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        cpf += remainder;
        
        // Calcular segundo dígito verificador
        sum = 0;
        for (let i = 0; i < 10; i++) {
            sum += parseInt(cpf.charAt(i)) * (11 - i);
        }
        remainder = (sum * 10) % 11;
        if (remainder === 10 || remainder === 11) remainder = 0;
        cpf += remainder;
        
        // Retornar apenas números
        return cpf;
    }
}

module.exports = new PixupService();