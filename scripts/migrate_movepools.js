const mongoose = require('mongoose');
const { BaseEntity } = require('../models');
const { MOVES_LIBRARY } = require('../gameData');
const { MONGO_URI } = require('../config');

// Mapeamento dos IDs antigos para os novos
const MOVE_MAPPING = {
    // Antigos moves de Pokémon -> Novos IDs
    'tackle': 'strike',
    'scratch': 'claw_swipe',
    'ember': 'spark_shot',
    'water_gun': 'aqua_shot',
    'vine_whip': 'vine_lash',
    'gust': 'wind_gust',
    'rock_throw': 'stone_throw',
    'confusion': 'mind_pulse',
    'lick': 'shadow_lick',
    'metal_claw': 'metal_slash',
    'poison_sting': 'venom_sting',
    
    // Outros moves comuns que podem ter sido renomeados
    'flamethrower': 'inferno_blast',
    'hydro_pump': 'hydro_cannon',
    'solar_beam': 'solar_ray',
    'thunderbolt': 'thunder_strike',
    'earthquake': 'earth_tremor',
    'psychic': 'psycho_blast',
    'shadow_ball': 'shadow_sphere',
    'iron_tail': 'steel_tail',
    'sludge_bomb': 'toxic_blast',
    
    'bite': 'shadow_bite',
    'quick_attack': 'rush',
    'body_slam': 'body_crash',
    'hyper_beam': 'rampage',
    'fire_blast': 'phoenix_charge',
    'surf': 'tidal_surge',
    'leaf_blade': 'razor_leaf',
    'air_slash': 'air_cutter',
    'stone_edge': 'stone_spike',
    'zen_headbutt': 'mind_crush',
    'night_slash': 'dark_slash',
    'flash_cannon': 'iron_beam',
    'gunk_shot': 'sludge_cannon'
};

async function migrateMovePools() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado ao MongoDB');
        
        const entities = await BaseEntity.find({});
        console.log(`📊 Encontrados ${entities.length} monstros`);
        
        let updated = 0;
        let untouched = 0;
        
        for (const entity of entities) {
            if (!entity.movePool || entity.movePool.length === 0) {
                console.log(`⚠️  ${entity.name} (${entity.id}) não tem movePool - NÃO FOI ALTERADO`);
                untouched++;
                continue;
            }
            
            let changed = false;
            const newMovePool = entity.movePool.map(move => {
                const oldId = move.moveId;
                
                // Se o move já existe no novo MOVES_LIBRARY, mantém exatamente como está
                if (MOVES_LIBRARY[oldId]) {
                    return move;
                }
                
                // Se tem mapeamento, usa o novo ID MAS MANTÉM O NÍVEL ORIGINAL
                if (MOVE_MAPPING[oldId]) {
                    console.log(`  🔄 ${entity.name}: ${oldId} -> ${MOVE_MAPPING[oldId]} (nível ${move.level})`);
                    changed = true;
                    return { moveId: MOVE_MAPPING[oldId], level: move.level };
                }
                
                // Se não encontrou mapeamento, MANTÉM o move original (não remove)
                console.log(`  ⚠️  ${entity.name}: Move "${oldId}" sem mapeamento, MANTIDO como está`);
                return move;
            });
            
            if (changed) {
                entity.movePool = newMovePool;
                await entity.save();
                updated++;
                console.log(`✅ ${entity.name} atualizado (${entity.movePool.length} moves preservados)`);
            } else {
                untouched++;
            }
        }
        
        console.log(`\n📈 Resumo:`);
        console.log(`   ✅ ${updated} monstros com moves mapeados`);
        console.log(`   ⏭️  ${untouched} monstros sem alterações`);
        console.log(`\n🎉 Migração concluída! Seus níveis foram preservados.`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro na migração:', error);
        process.exit(1);
    }
}

migrateMovePools();
