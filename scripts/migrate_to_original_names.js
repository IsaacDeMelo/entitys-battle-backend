/**
 * Script para:
 * 1. Renomear coleção basepokemons para entities
 * 2. Remover nomes "pokemon" do schema
 * 3. Corrigir tipos de monstros
 * 4. Unificar inventory em "bag"
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');

async function runMigration() {
    try {
        console.log('🔗 Conectando ao MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado!\n');

        const db = mongoose.connection.db;

        // ========== 1. RENOMEAR COLEÇÃO basepokemons → entities ==========
        console.log('📦 Verificando colções...');
        const collections = await db.listCollections().toArray();
        const hasBasePokemons = collections.some(c => c.name === 'basepokemons');
        const hasEntities = collections.some(c => c.name === 'entities');

        if (hasBasePokemons && !hasEntities) {
            console.log('  Renomeando: basepokemons → entities');
            await db.collection('basepokemons').rename('entities');
            console.log('  ✅ Coleção renomeada!\n');
        } else if (hasEntities) {
            console.log('  Coleção "entities" já existe\n');
        } else {
            console.log('  ⚠️ Nenhuma coleção basepokemons encontrada\n');
        }

        // ========== 2. CORRIGIR TIPOS EM entities ==========
        const TYPE_MAPPING = {
            'water': 'aqua',
            'fire': 'flame',
            'plant': 'forest',
            'grass': 'forest',
            'bug': 'beast',
            'normal': 'beast',
            'flying': 'sky',
            'poison': 'venom',
            'ghost': 'shadow',
            'rock': 'earth',
            'ground': 'earth',
            'steel': 'metal',
            'psychic': 'mystic',
            'dragon': 'mystic',
            'dark': 'shadow',
            'fairy': 'mystic',
            'ice': 'aqua',
            'electric': 'sky',
            'fighter': 'beast',
            'fighting': 'beast'
        };

        console.log('🔄 Atualizando tipos em "entities"...');
        let entitiesCount = 0;
        for (const [oldType, newType] of Object.entries(TYPE_MAPPING)) {
            const result = await db.collection('entities').updateMany(
                { type: oldType },
                { $set: { type: newType } }
            );
            if (result.modifiedCount > 0) {
                console.log(`  ${oldType} → ${newType}: ${result.modifiedCount} documentos`);
                entitiesCount += result.modifiedCount;
            }
        }
        console.log(`✅ Total: ${entitiesCount} entidades atualizadas\n`);

        // ========== 3. CONSOLIDAR INVENTORY EM "bag" NOS USUÁRIOS ==========
        console.log('👜 Consolidando inventário dos usuários em "bag"...');
        const users = await db.collection('users').find({}).toArray();
        console.log(`  Processando ${users.length} usuários...`);

        let usersUpdated = 0;
        for (const user of users) {
            const bag = {};

            // Adiciona captureCubes
            if (user.captureCubes) {
                bag.captureCube = user.captureCubes;
            }

            // Adiciona levelUpCrystal
            if (user.levelUpCrystal) {
                bag.levelUpCrystal = user.levelUpCrystal;
            }

            // Adiciona itens do inventory existente
            if (user.inventory && typeof user.inventory === 'object') {
                Object.assign(bag, user.inventory);
            }

            // Se não tem nada, inicializa com valores padrão
            if (Object.keys(bag).length === 0) {
                bag.captureCube = 5;
                bag.levelUpCrystal = 0;
            }

            // Atualiza o usuário
            await db.collection('users').updateOne(
                { _id: user._id },
                {
                    $set: { bag },
                    $unset: { captureCubes: '', levelUpCrystal: '', inventory: '' }
                }
            );
            usersUpdated++;
        }
        console.log(`✅ ${usersUpdated} usuários atualizados\n`);

        // ========== RELATÓRIO FINAL ==========
        console.log('═══════════════════════════════════');
        console.log('✨ MIGRAÇÃO COMPLETADA COM SUCESSO!');
        console.log('═══════════════════════════════════');
        console.log(`
📊 Resumo:
  • Coleção: basepokemons → entities
  • Tipos: ${entitiesCount} entidades corrigidas
  • Usuários: ${usersUpdated} consolidados em "bag"
  
📝 Próximos passos:
  1. Atualize models.js para usar "bag" em vez de inventory/captureCubes/levelUpCrystal
  2. Atualize index.js para usar o novo campo "bag"
  3. Atualize views para referenciar a nova estrutura
        `);

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] !== '--confirm') {
        console.log(`
🚨 AVISO: Esta migração vai:
  1. Renomear coleção basepokemons → entities
  2. Corrigir tipos de monstros
  3. Consolidar inventory dos usuários em um campo "bag"
  
Para confirmar, rode: node scripts/migrate_to_original_names.js --confirm
        `);
        process.exit(0);
    }
    runMigration();
}

module.exports = { runMigration };
