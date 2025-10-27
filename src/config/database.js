const { PrismaClient } = require('../generated/prisma');

// Configuração do Prisma Client com pooling e otimizações
const prismaConfig = {
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  // Configurações de connection pooling
  log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  errorFormat: 'pretty',
};

// Singleton pattern para evitar múltiplas instâncias do Prisma Client
class DatabaseConnection {
  constructor() {
    if (!DatabaseConnection.instance) {
      this.prisma = new PrismaClient(prismaConfig);
      DatabaseConnection.instance = this;
      
      // Event listeners para monitoramento da conexão
      this.setupEventListeners();
    }
    
    return DatabaseConnection.instance;
  }

  setupEventListeners() {
    // Log de conexão bem-sucedida
    this.prisma.$on('info', (e) => {
      console.log('📊 Database Info:', e.message);
    });

    // Log de queries em desenvolvimento
    if (process.env.NODE_ENV === 'development') {
      this.prisma.$on('query', (e) => {
        console.log('🔍 Query:', e.query);
        console.log('⏱️  Duration:', e.duration + 'ms');
      });
    }

    // Log de warnings
    this.prisma.$on('warn', (e) => {
      console.warn('⚠️  Database Warning:', e.message);
    });

    // Log de erros
    this.prisma.$on('error', (e) => {
      console.error('❌ Database Error:', e.message);
    });
  }

  // Método para obter a instância do Prisma
  getClient() {
    return this.prisma;
  }

  // Método para testar a conexão
  async testConnection() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection successful');
      return true;
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
      return false;
    }
  }

  // Método para desconectar (usado no shutdown da aplicação)
  async disconnect() {
    try {
      await this.prisma.$disconnect();
      console.log('🔌 Database disconnected successfully');
    } catch (error) {
      console.error('❌ Error disconnecting from database:', error.message);
    }
  }

  // Método para reconectar em caso de falha
  async reconnect() {
    try {
      await this.disconnect();
      this.prisma = new PrismaClient(prismaConfig);
      this.setupEventListeners();
      await this.testConnection();
      console.log('🔄 Database reconnected successfully');
    } catch (error) {
      console.error('❌ Error reconnecting to database:', error.message);
      throw error;
    }
  }
}

// Criar instância única
const databaseConnection = new DatabaseConnection();
const prisma = databaseConnection.getClient();

// Tratamento de sinais para graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, closing database connection...');
  await databaseConnection.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, closing database connection...');
  await databaseConnection.disconnect();
  process.exit(0);
});

// Tratamento de erros não capturados
process.on('uncaughtException', async (error) => {
  console.error('💥 Uncaught Exception:', error);
  await databaseConnection.disconnect();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  await databaseConnection.disconnect();
  process.exit(1);
});

// Exportar instância do Prisma e métodos utilitários
module.exports = {
  prisma,
  testConnection: () => databaseConnection.testConnection(),
  disconnect: () => databaseConnection.disconnect(),
  reconnect: () => databaseConnection.reconnect(),
  DatabaseConnection
};