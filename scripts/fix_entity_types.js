/**
 * Script para corrigir tipos de monstros (uppercase para novos tipos)
 * Converte tipos como WATER, FIRE, etc. para aqua, flame, etc.
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');

async function fixTypes() {
    try {
        console.log('🔗 Conectando ao MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado!\n');

        const db = mongoose.connection.db;

        // Mapeamento de tipos atuais (uppercase e lowercase) para novos tipos
        const TYPE_MAPPING = {
            // Uppercase
            'WATER': 'aqua',
            'FIRE': 'flame',
            'PLANT': 'forest',
            'GRASS': 'forest',
            'BUG': 'beast',
            'NORMAL': 'beast',
            'FLYING': 'sky',
            'POISON': 'venom',
            'GHOST': 'shadow',
            'ROCK': 'earth',
            'GROUND': 'earth',
            'STEEL': 'metal',
            'PSYCHIC': 'mystic',
            'DRAGON': 'mystic',
            'DARK': 'shadow',
            'FAIRY': 'mystic',
            'ICE': 'aqua',
            'ELECTRIC': 'sky',
            'FIGHTER': 'beast',
            'FIGHTING': 'beast',
            // Lowercase
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
        let totalUpdated = 0;
        const changes = [];

        for (const [oldType, newType] of Object.entries(TYPE_MAPPING)) {
            const result = await db.collection('entities').updateMany(
                { type: oldType },
                { $set: { type: newType } }
            );
            if (result.modifiedCount > 0) {
                console.log(`  ${oldType} → ${newType}: ${result.modifiedCount} entidades`);
                totalUpdated += result.modifiedCount;
                changes.push(`${oldType} → ${newType}`);
            }
        }

        console.log(`\n✅ Total atualizado: ${totalUpdated} entidades\n`);

        // Mostra resultado
        console.log('═══════════════════════════════════');
        console.log('✨ CORREÇÃO CONCLUÍDA COM SUCESSO!');
        console.log('═══════════════════════════════════');
        console.log(`
📊 Tipos corrigidos:
${changes.map(c => `  • ${c}`).join('\n')}
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
🚨 AVISO: Este script vai corrigir os tipos dos monstros em "entities"
Convertendo de tipos antigos (WATER, FIRE, etc.) para novos tipos (aqua, flame, etc.)

Para confirmar, rode: node scripts/fix_entity_types.js --confirm
        `);
        process.exit(0);
    }
    fixTypes();
}

module.exports = { fixTypes };
