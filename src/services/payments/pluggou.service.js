const axios = require('axios');
const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

class PluggouService {
    constructor() {
        this.baseURL = null;
        this.apiKey = null;
        this.organizationId = null;
        this.client = null;
    }

    async initialize() {
        // Sempre buscar as configurações mais recentes do banco
        const settings = await prisma.setting.findFirst();
        if (!settings) {
            throw new Error('Configurações não encontradas no banco de dados');
        }

        const newBaseURL = settings.pluggou_base_url;
        const newApiKey = settings.pluggou_api_key;
        const newOrganizationId = settings.pluggou_organization_id;

        if (!newApiKey) {
            throw new Error('PLUGGOU_API_KEY não configurada nas configurações');
        }

        // Verificar se as configurações mudaram ou se o cliente não existe
        const configChanged = 
            this.baseURL !== newBaseURL ||
            this.apiKey !== newApiKey ||
            this.organizationId !== newOrganizationId ||
            !this.client;

        if (configChanged) {
            console.log('🔄 Configurações Pluggou alteradas, recriando cliente...');
            
            // Atualizar as propriedades da instância
            this.baseURL = newBaseURL;
            this.apiKey = newApiKey;
            this.organizationId = newOrganizationId;

            // Recriar o cliente axios com as novas configurações
            this.client = axios.create({
                baseURL: this.baseURL,
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                },
                timeout: 30000
            });

            console.log('✅ Cliente Pluggou recriado com sucesso');
        }
    }

    /**
     * Força a reinicialização do cliente (útil para testes ou quando há mudanças de configuração)
     */
    async forceReinitialize() {
        console.log('🔄 Forçando reinicialização do cliente Pluggou...');
        this.client = null;
        this.baseURL = null;
        this.apiKey = null;
        this.organizationId = null;
        await this.initialize();
    }

    /**
     * Criar pagamento PIX (compatível com interface do deposit service)
     * @param {Object} depositData - Dados do pagamento
     * @returns {Promise<Object>} Dados do pagamento PIX
     */
    async createPixPayment(depositData) {
        try {
            await this.initialize();
            
            const payload = {
                amount: depositData.amount,
                customerName: depositData.customerData.name,
                customerEmail: depositData.customerData.email,
                organizationId: this.organizationId,
            };

            const response = await this.client.post('/api/payments/transactions', payload);
            const data = response.data;
            return {
                success: true,
                transactionId: data.id,
                qrCode: data.pix?.qrCode?.emv,
                qrCodeBase64: data.pix?.qrCode?.imagem,
                expiresAt: data.pix?.expirationDate,
                amount: data.paymentInfo?.amount || depositData.amount,
                status: data.status,
                metadata: {
                    referenceCode: data.referenceCode,
                    externalId: data.externalId,
                    txid: data.pix?.txid
                },
                raw: data
            };
        } catch (error) {
            console.error('❌ Erro ao criar pagamento PIX na Pluggou:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                errorCode: error.response?.status
            };
        }
    }

    /**
     * Processar webhook de eventos PIX da Pluggou
     * @param {Object} webhookData - Payload recebido do webhook
     * @returns {Object} Dados processados do webhook
     */
    processWebhook(webhookData) {
        try {
            console.log('🔄 Processando webhook Pluggou:', webhookData);
            // Extrair dados principais
            const { id, type, created_at, data } = webhookData;
            if (!id || !type || !data) {
                return {
                    isValid: false,
                    error: 'Webhook inválido: campos obrigatórios ausentes.'
                };
            }

            // Mapear status do Pluggou para status padrão
            const statusMap = {
                'APPROVED': 'PAID',
                'PROCESSING': 'PENDING',
                'FAILED': 'FAILED',
                'CANCELLED': 'CANCELLED',
                'REJECTED': 'REJECTED',
                'BLOCKED': 'BLOCKED',
                'REFUNDED': 'REFUNDED'
            };
            const status = statusMap[data.status] || data.status;

            // Mapear tipo de evento para tipo padrão
            const typeMap = {
                'pix.in.processing': 'PIX_IN_PROCESSING',
                'pix.in.confirmation': 'PIX_IN_CONFIRMED',
                'pix.out.processing': 'PIX_OUT_PROCESSING',
                'pix.out.confirmation': 'PIX_OUT_CONFIRMED',
                'pix.out.failure': 'PIX_OUT_FAILED',
                'pix.in.reversal.processing': 'PIX_IN_REVERSAL_PROCESSING',
                'pix.in.reversal.confirmation': 'PIX_IN_REVERSAL_CONFIRMED',
                'pix.out.reversal': 'PIX_OUT_REVERSAL'
            };
            const eventType = typeMap[type] || type;

            return {
                isValid: true,
                transactionId: data.id || id,
                externalId: data.externalId,
                status: status,
                eventType: eventType,
                amount: data.amount,
                paidAt: data.paymentAt ? new Date(data.paymentAt) : null,
                createdAt: data.createdAt ? new Date(data.createdAt) : null,
                pixKey: data.pixKey,
                pixKeyType: data.pixKeyType,
                customerName: data.customerName,
                customerEmail: data.customerEmail,
                customerDocument: data.customerDocument,
                endToEndId: data.endToEndId,
                referenceCode: data.referenceCode,
                netAmount: data.netAmount,
                totalFee: data.totalFee,
                rawData: webhookData
            };
        } catch (error) {
            console.error('❌ Erro ao processar webhook Pluggou:', error.message);
            return {
                isValid: false,
                error: `Webhook processing failed: ${error.message}`
            };
        }
    }

    async createPixCashOut(paymentData) {
        try {
            await this.initialize();
            
            const payload = {
                amount: paymentData.amount,
                pixKey: paymentData.pixKey,
                pixKeyType: paymentData.keyType,
                description: paymentData.description,
                organizationId: this.organizationId,
            };

            const response = await this.client.post('/api/payments/transfers/pix', payload);

            const data = response.data;
            return {
                success: true,
                transactionId: data.id,
                qrCode: data.pix?.qrCode?.emv,
                qrCodeBase64: data.pix?.qrCode?.imagem,
                expiresAt: data.pix?.expirationDate,
            };
        } catch (error) {
            console.error('❌ Erro ao criar saque PIX na Pluggou:', error.response?.data || error.message);
            return {
                success: false,
                error: error.response?.data?.message || error.message,
                errorCode: error.response?.status
            };
        }
    }

    /**
     * Processar confirmação de depósito e pagar comissão de convite se for o primeiro depósito
     * @param {Object} deposit - Objeto do depósito confirmado (deve conter userId, amount, status)
     * @returns {Promise<void>}
     */
    async processInviteCommissionOnFirstDeposit(deposit) {
        if (!deposit || !deposit.userId || !deposit.status) return;
        // Só processa se depósito está confirmado
        if (deposit.status !== true) return;
        // Verifica se é o primeiro depósito confirmado do usuário
        const depositCount = await prisma.deposit.count({
            where: { userId: deposit.userId, status: true }
        });
        if (depositCount !== 1) return; // Só paga no primeiro depósito

        // Buscar usuário, convidador e inviteCode
        const user = await prisma.user.findUnique({
            where: { id: deposit.userId },
            include: { inviter: { include: { wallet: true, inviteCode: true } } }
        });
        if (!user || !user.invitedBy || !user.inviter || !user.inviter.wallet?.length || !user.inviter.inviteCode) return;

        const commissionRate = Number(user.inviter.inviteCode.commission_rate) || 5.0;
        const commissionAmount = (Number(deposit.amount) * commissionRate) / 100;

        // Creditar comissão na wallet do convidador
        await prisma.wallet.update({
            where: { id: user.inviter.wallet[0].id },
            data: { balance: { increment: commissionAmount } }
        });

        // Atualizar total_commission do InviteCode
        await prisma.inviteCode.update({
            where: { id: user.inviter.inviteCode.id },
            data: { total_commission: { increment: commissionAmount } }
        });

        // (Opcional) Log
        console.log(`💸 Comissão de convite paga: R$${commissionAmount.toFixed(2)} para userId ${user.inviter.id} (primeiro depósito de ${user.id})`);
    }
}

module.exports = new PluggouService();