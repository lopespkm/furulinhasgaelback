const { PrismaClient } = require('../generated/prisma');
const prisma = new PrismaClient();

class LicenseService {
    /**
     * Obter a licença atual (última licença criada)
     */
    async getCurrentLicense() {
        const license = await prisma.license.findFirst({
            orderBy: {
                id: 'desc'
            }
        });

        if (!license) {
            throw new Error('Nenhuma licença encontrada');
        }

        return license;
    }
    
    /**
     * Verificar o status da licença
     * @returns {Object} - Objeto com informações sobre o status da licença
     */
    async checkLicenseStatus() {
        try {
            const license = await this.getCurrentLicense();
            
            return {
                success: true,
                is_active: license.is_active,
                has_credits: license.credits > 0,
                credits: license.credits,
                credits_used: license.credits_used,
                credits_value: license.credits_value,
                ggr_percentage: license.ggr_percentage,
                total_earnings: license.total_earnings,
                license
            };
        } catch (error) {
            return {
                success: false,
                message: error.message,
                error
            };
        }
    }

    /**
     * Editar créditos da licença
     */
    async editCredits(newCredits) {
        const lastLicense = await this.getCurrentLicense();

        return await prisma.license.update({
            where: {
                id: lastLicense.id
            },
            data: {
                credits: newCredits
            }
        });
    }

    /**
     * Adicionar saldo à licença (incrementar earnings)
     */
    async addEarnings(amount) {
        const lastLicense = await this.getCurrentLicense();

        return await prisma.license.update({
            where: {
                id: lastLicense.id
            },
            data: {
                total_earnings: {
                    increment: amount
                }
            }
        });
    }

    /**
     * Editar parâmetros da licença (GGR, créditos, valor do crédito, status)
     */
    async updateLicenseParams(params) {
        const lastLicense = await this.getCurrentLicense();
        const updateData = {};

        // Verificar quais campos foram fornecidos e atualizá-los
        if (params.credits !== undefined) {
            updateData.credits = params.credits;
        }
        
        if (params.credits_value !== undefined) {
            updateData.credits_value = params.credits_value;
        }
        
        if (params.ggr_percentage !== undefined) {
            updateData.ggr_percentage = params.ggr_percentage;
        }
        
        if (params.is_active !== undefined) {
            updateData.is_active = params.is_active;
        }

        return await prisma.license.update({
            where: {
                id: lastLicense.id
            },
            data: updateData
        });
    }

    /**
     * Verificar se a licença tem créditos suficientes para uma operação
     * @param {number} amount - Valor da operação
     * @returns {Object} - Objeto com informações sobre a disponibilidade de créditos
     */
    async hasEnoughCredits(amount) {
        const license = await this.getCurrentLicense();
        
        if (!license.is_active) {
            return {
                success: false,
                message: 'Licença inativa',
                license
            };
        }
        
        // Calcular quantos créditos serão necessários para esta operação
        const creditsNeeded = license.credits_value > 0 ? 
            Math.ceil(Number(amount) / Number(license.credits_value)) : 1;
            
        if (license.credits < creditsNeeded) {
            return {
                success: false,
                message: 'Créditos insuficientes',
                creditsNeeded,
                creditsAvailable: license.credits,
                license
            };
        }
        
        return {
            success: true,
            creditsNeeded,
            creditsAvailable: license.credits,
            license
        };
    }


    /**
     * Consumir créditos e registrar ganhos em uma única operação
     * @param {Object} params - Parâmetros da operação
     * @param {number} params.amount - Valor da operação
     * @param {string} params.userId - ID do usuário que está realizando a operação
     * @param {string} params.scratchCardId - ID da raspadinha sendo jogada
     * @param {Object} [params.tx] - Transação Prisma (opcional)
     * @returns {Object} - Resultado da operação
     */
    async consumeCreditsAndAddEarnings(params) {
        const { amount, userId, scratchCardId, tx } = params;
        const licenseCheck = await this.hasEnoughCredits(amount);
        
        if (!licenseCheck.success) {
            return {
                success: false,
                message: licenseCheck.message,
                licenseCheck
            };
        }
        
        const license = licenseCheck.license;
        const creditsToConsume = licenseCheck.creditsNeeded;
        const ggrAmount = Number(amount) * (Number(license.ggr_percentage) / 100);
        
        // Determinar qual cliente Prisma usar (transação ou cliente global)
        const prismaClient = tx || prisma;
        
        try {
            // Atualizar a licença
            await prismaClient.license.update({
                where: { id: license.id },
                data: {
                    credits_used: { increment: creditsToConsume },
                    credits: { decrement: creditsToConsume },
                    total_earnings: { increment: ggrAmount }
                }
            });
            
            // Registrar o uso da licença para fins de auditoria e relatórios
            await prismaClient.usageLicense.create({
                data: {
                    userId,
                    licenseId: license.id,
                    scratchCardId,
                    credits_used: creditsToConsume
                }
            });
            
            return {
                success: true,
                creditsConsumed: creditsToConsume,
                ggrAmount,
                license
            };
        } catch (error) {
            return {
                success: false,
                message: `Erro ao consumir créditos: ${error.message}`,
                error
            };
        }
    }

    /**
     * Listar registros de uso da licença
     * @param {Object} filters - Filtros opcionais para a consulta
     * @param {number} page - Número da página para paginação
     * @param {number} limit - Limite de registros por página
     * @returns {Object} - Registros de uso da licença paginados
     */

    /**
     * Obter estatísticas de uso da licença
     * @param {Object} filters - Filtros opcionais para a consulta (período, usuário, etc)
     * @returns {Object} - Estatísticas agregadas de uso da licença
     */
    async getLicenseUsageStats(filters = {}) {
        try {
            // Construir condições de filtro
            const where = {};
            
            if (filters.userId) {
                where.userId = filters.userId;
            }
            
            if (filters.licenseId) {
                where.licenseId = filters.licenseId;
            }
            
            if (filters.dateFrom && filters.dateTo) {
                where.createdAt = {
                    gte: new Date(filters.dateFrom),
                    lte: new Date(filters.dateTo)
                };
            } else if (filters.dateFrom) {
                where.createdAt = {
                    gte: new Date(filters.dateFrom)
                };
            } else if (filters.dateTo) {
                where.createdAt = {
                    lte: new Date(filters.dateTo)
                };
            }
            
            // Obter estatísticas agregadas
            const totalUsage = await prisma.usageLicense.aggregate({
                where,
                _sum: {
                    credits_used: true
                },
                _count: {
                    id: true
                }
            });
            
            // Obter estatísticas por usuário
            const userStats = await prisma.usageLicense.groupBy({
                by: ['userId'],
                where,
                _sum: {
                    credits_used: true
                },
                _count: {
                    id: true
                }
            });
            
            // Obter estatísticas por raspadinha
            const scratchCardStats = await prisma.usageLicense.groupBy({
                by: ['scratchCardId'],
                where,
                _sum: {
                    credits_used: true
                },
                _count: {
                    id: true
                }
            });
            
            // Obter a licença atual para informações adicionais
            const currentLicense = await this.getCurrentLicense();
            
            return {
                success: true,
                stats: {
                    totalTransactions: totalUsage._count.id || 0,
                    totalCreditsUsed: totalUsage._sum.credits_used || 0,
                    remainingCredits: currentLicense.credits,
                    totalEarnings: currentLicense.total_earnings,
                    userStats,
                    scratchCardStats
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `Erro ao obter estatísticas de uso: ${error.message}`,
                error
            };
        }
    }
    async listUsageRecords(filters = {}, page = 1, limit = 10) {
        try {
            const skip = (page - 1) * limit;
            
            // Construir condições de filtro
            const where = {};
            
            if (filters.userId) {
                where.userId = filters.userId;
            }
            
            if (filters.licenseId) {
                where.licenseId = filters.licenseId;
            }
            
            if (filters.scratchCardId) {
                where.scratchCardId = filters.scratchCardId;
            }
            
            if (filters.dateFrom && filters.dateTo) {
                where.createdAt = {
                    gte: new Date(filters.dateFrom),
                    lte: new Date(filters.dateTo)
                };
            } else if (filters.dateFrom) {
                where.createdAt = {
                    gte: new Date(filters.dateFrom)
                };
            } else if (filters.dateTo) {
                where.createdAt = {
                    lte: new Date(filters.dateTo)
                };
            }
            
            // Obter registros com paginação
            const records = await prisma.usageLicense.findMany({
                where,
                skip,
                take: limit,
                orderBy: {
                    createdAt: 'desc'
                },
                include: {
                    user: {
                        select: {
                            id: true,
                            username: true,
                            full_name: true,
                            email: true
                        }
                    },
                    license: {
                        select: {
                            id: true,
                            credits: true,
                            credits_used: true,
                            credits_value: true,
                            ggr_percentage: true
                        }
                    },
                    scratchCard: {
                        select: {
                            id: true,
                            name: true,
                            price: true
                        }
                    }
                }
            });
            
            // Contar total de registros para paginação
            const total = await prisma.usageLicense.count({ where });
            
            return {
                success: true,
                data: records,
                pagination: {
                    total,
                    page,
                    limit,
                    pages: Math.ceil(total / limit)
                }
            };
        } catch (error) {
            return {
                success: false,
                message: `Erro ao listar registros de uso: ${error.message}`,
                error
            };
        }
    }
}

module.exports = LicenseService;