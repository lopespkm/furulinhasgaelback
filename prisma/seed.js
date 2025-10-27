const { PrismaClient } = require('../src/generated/prisma');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

/**
 * Função para gerar username único a partir do nome completo
 */
function generateUsername(fullName) {
  return fullName
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove acentos
    .replace(/[^a-z0-9\s]/g, '') // Remove caracteres especiais
    .replace(/\s+/g, '_') // Substitui espaços por underscore
    .substring(0, 20); // Limita a 20 caracteres
}

/**
 * Função principal de seed
 */
async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  try {
    // Limpar dados existentes para permitir re-execução do seed
    console.log('🧹 Limpando dados existentes...');
    await prisma.usageLicense.deleteMany();
    await prisma.license.deleteMany();
    await prisma.setting.deleteMany();
    await prisma.game.deleteMany();
    await prisma.prize.deleteMany();
    await prisma.scratchCard.deleteMany();
    await prisma.inviteCode.deleteMany();
    await prisma.withdraw.deleteMany();
    await prisma.deposit.deleteMany();
    await prisma.wallet.deleteMany();
    await prisma.user.deleteMany();
    console.log('✅ Dados limpos com sucesso!');

    // Hash da senha do admin
    const adminPasswordHash = await bcrypt.hash('6zMhmEN641wX90e', 12);

    console.log('👤 Criando usuário administrador...');
    
    // Criar usuário administrador
    const adminUser = await prisma.user.create({
      data: {
        email: 'admin@hero.io',
        phone: '11999999999',
        password: adminPasswordHash,
        full_name: 'Administrador Sistema',
        cpf: '11111111111',
        username: 'administrator',
        is_admin: true,
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    // Criar carteira para o administrador
    await prisma.wallet.create({
      data: {
        userId: adminUser.id,
        balance: 1000.00, // Saldo inicial de R$ 1000
        created_at: new Date(),
        updated_at: new Date()
      }
    });

    console.log('✅ Usuário administrador criado:');
    console.log(`   📧 Email: ${adminUser.email}`);
    console.log(`   📱 Telefone: ${adminUser.phone}`);
    console.log(`   🔑 Senha: admin123`);
    console.log(`   👤 Username: ${adminUser.username}`);
    console.log(`   🆔 ID: ${adminUser.id}`);

    console.log('\n⚙️ Criando configurações da plataforma...');
    
    // Criar configurações da plataforma
    const settings = await prisma.setting.create({
      data: {
        plataform_name: 'Hero.io',
        plataform_description: 'A plataforma de raspadinhas online mais confiável do Brasil. Ganhe prêmios incríveis e dinheiro real de forma segura e divertida.',
        pluggou_base_url: 'https://api.pluggou.com',
        pluggou_api_key: 'sua_api_key_aqui',
        pluggou_organization_id: 'sua_organization_id_aqui'
      }
    });

    console.log('✅ Configurações criadas:');
    console.log(`   🏢 Nome da plataforma: ${settings.plataform_name}`);
    console.log(`   📝 Descrição: ${settings.plataform_description}`);

    console.log('\n📜 Criando licença do sistema...');
    
    // Criar licença do sistema
    const license = await prisma.license.create({
      data: {
        credits: 1000000, // 10.000 créditos iniciais
        credits_used: 0,
        credits_value: 1.00, // R$ 1,00 por crédito
        ggr_percentage: 5.00, // 15% de GGR
        total_earnings: 0.00,
        is_active: true
      }
    });

    console.log('✅ Licença criada:');
    console.log(`   💳 Créditos disponíveis: ${license.credits.toLocaleString()}`);
    console.log(`   💰 Valor por crédito: R$ ${license.credits_value}`);
    console.log(`   📊 GGR: ${license.ggr_percentage}%`);

    console.log('\n📊 Resumo do seed:');
    console.log('   👨‍💼 1 Administrador criado');
    console.log('   💰 1 Carteira criada');
    console.log('   ⚙️ 1 Configuração da plataforma criada');
    console.log('   📜 1 Licença do sistema criada');
    
    console.log('\n🎉 Seed concluído com sucesso!');
    console.log('\n🔑 Credenciais do administrador:');
    console.log('   📧 Email: admin@hero.io');
    console.log('   🔑 Senha: 6zMhmEN641wX90e');
    
  } catch (error) {
    console.error('❌ Erro durante o seed:', error);
    throw error;
  }
}

// Executar seed
main()
  .catch((e) => {
    console.error('💥 Erro fatal no seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    console.log('🔌 Conexão com banco de dados encerrada');
  });

module.exports = main;