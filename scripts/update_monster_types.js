/**
 * Script para mudar os tipos dos monstros no banco de dados MongoDB
 * 
 * Uso:
 * node scripts/update_monster_types.js
 * 
 * Você pode editar o TYPE_MAPPING abaixo para definir as conversões desejadas.
 * Por exemplo, mudar todos os "water" para "aqua", ou reverter para tipos antigos.
 */

const mongoose = require('mongoose');
const { BaseEntity } = require('../models');
const { MONGO_URI } = require('../config');

// ===== EDITE ESTE MAPPING PARA MUDAR OS TIPOS =====
// Formato: "tipo_atual": "novo_tipo"
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
// ===== FIM DA CONFIGURAÇÃO =====

async function updateMonsterTypes() {
    try {
        console.log('Conectando ao MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado!\n');

        // Pega todas as entidades
        const entities = await BaseEntity.find({});
        console.log(`📊 Encontradas ${entities.length} entidades\n`);

        if (entities.length === 0) {
            console.log('⚠️ Nenhuma entidade encontrada!');
            process.exit(0);
        }

        let updatedCount = 0;
        const changes = [];

        for (const entity of entities) {
            const oldType = entity.type;
            const newType = TYPE_MAPPING[oldType];

            if (newType && newType !== oldType) {
                entity.type = newType;
                await entity.save();
                updatedCount++;
                changes.push(`  • ${entity.name} (${oldType} → ${newType})`);
            }
        }

        console.log(`🔄 Mudanças aplicadas:\n`);
        changes.forEach(c => console.log(c));
        console.log(`\n✅ Total atualizado: ${updatedCount}/${entities.length} entidades\n`);

        console.log('💾 Salvando no banco de dados...');
        console.log('✨ Migração concluída com sucesso!');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

// Verifica antes de executar
if (require.main === module) {
    console.log('\n🚨 AVISO: Este script vai mudar os tipos dos monstros no banco de dados!');
    console.log('Verifique o TYPE_MAPPING no arquivo antes de executar.\n');
    
    const args = process.argv.slice(2);
    if (args[0] !== '--confirm') {
        console.log('Para confirmar e executar, rode com: node scripts/update_monster_types.js --confirm\n');
        process.exit(0);
    }

    updateMonsterTypes();
}

module.exports = { updateMonsterTypes, TYPE_MAPPING };
