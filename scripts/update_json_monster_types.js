/**
 * Script para mudar os tipos dos monstros no arquivo database.json
 * 
 * Uso:
 * node scripts/update_json_monster_types.js
 * 
 * Este script atualiza o arquivo database.json com novos tipos de monstros.
 * Útil para sincronizar com as mudanças do MongoDB.
 */

const fs = require('fs');
const path = require('path');

// ===== EDITE ESTE MAPPING PARA MUDAR OS TIPOS =====
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

async function updateJsonMonsterTypes() {
    try {
        const dbPath = path.join(__dirname, '../database.json');
        
        console.log('📂 Lendo database.json...');
        const data = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        console.log(`📊 Encontrados ${data.length} monstros\n`);

        if (!Array.isArray(data) || data.length === 0) {
            console.log('⚠️ Arquivo vazio ou inválido!');
            process.exit(0);
        }

        let updatedCount = 0;
        const changes = [];

        for (const monster of data) {
            const oldType = monster.type;
            const newType = TYPE_MAPPING[oldType];

            if (newType && newType !== oldType) {
                monster.type = newType;
                updatedCount++;
                changes.push(`  • ${monster.name} (${oldType} → ${newType})`);
            }
        }

        console.log(`🔄 Mudanças:\n`);
        changes.forEach(c => console.log(c));
        console.log(`\n✅ Total atualizado: ${updatedCount}/${data.length} monstros\n`);

        // Backup do arquivo original
        const backupPath = dbPath + '.backup';
        fs.copyFileSync(dbPath, backupPath);
        console.log(`💾 Backup criado em: ${backupPath}`);

        // Salva o arquivo atualizado
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
        console.log(`✨ Arquivo salvo com sucesso!\n`);

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

// Verifica antes de executar
if (require.main === module) {
    console.log('\n🚨 AVISO: Este script vai mudar os tipos dos monstros em database.json!');
    console.log('Um backup será criado automaticamente.\n');
    
    const args = process.argv.slice(2);
    if (args[0] !== '--confirm') {
        console.log('Para confirmar e executar, rode com: node scripts/update_json_monster_types.js --confirm\n');
        process.exit(0);
    }

    updateJsonMonsterTypes();
}

module.exports = { updateJsonMonsterTypes, TYPE_MAPPING };
