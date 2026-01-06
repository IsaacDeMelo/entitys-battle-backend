const mongoose = require('mongoose');
const { BaseEntity } = require('../models');
const { MONGO_URI } = require('../config');

// Mapeamento dos tipos antigos para novos
const TYPE_MAPPING = {
    'normal': 'beast',
    'flying': 'sky',
    'water': 'aqua',
    'fire': 'flame',
    'plant': 'forest',
    'grass': 'forest',
    'poison': 'venom',
    'ghost': 'shadow',
    'bug': 'beast',
    'fighter': 'beast',
    'fighting': 'beast',
    'rock': 'earth',
    'ground': 'earth',
    'steel': 'metal',
    'psychic': 'mystic',
    'dragon': 'mystic',
    'dark': 'shadow',
    'fairy': 'mystic',
    'ice': 'aqua',
    'electric': 'sky'
};

// Moves por tipo
const MOVES_BY_TYPE = {
    beast: [
        { moveId: 'strike', level: 1 },
        { moveId: 'claw_swipe', level: 5 },
        { moveId: 'headbutt', level: 10 },
        { moveId: 'rush', level: 15 },
        { moveId: 'rend', level: 20 },
        { moveId: 'body_crash', level: 30 },
        { moveId: 'primal_roar', level: 40 }
    ],
    flame: [
        { moveId: 'strike', level: 1 },
        { moveId: 'spark_shot', level: 5 },
        { moveId: 'flame_spiral', level: 10 },
        { moveId: 'blazing_fist', level: 15 },
        { moveId: 'inferno_blast', level: 25 },
        { moveId: 'scorching_wave', level: 35 },
        { moveId: 'phoenix_charge', level: 45 }
    ],
    aqua: [
        { moveId: 'strike', level: 1 },
        { moveId: 'aqua_shot', level: 5 },
        { moveId: 'bubble_beam', level: 10 },
        { moveId: 'aqua_slash', level: 15 },
        { moveId: 'tidal_surge', level: 25 },
        { moveId: 'hydro_cannon', level: 35 },
        { moveId: 'ocean_wrath', level: 45 }
    ],
    forest: [
        { moveId: 'strike', level: 1 },
        { moveId: 'vine_lash', level: 5 },
        { moveId: 'leaf_blade', level: 10 },
        { moveId: 'razor_leaf', level: 15 },
        { moveId: 'petal_storm', level: 25 },
        { moveId: 'solar_ray', level: 35 },
        { moveId: 'nature_wrath', level: 45 }
    ],
    sky: [
        { moveId: 'strike', level: 1 },
        { moveId: 'wind_gust', level: 5 },
        { moveId: 'air_cutter', level: 10 },
        { moveId: 'sky_bolt', level: 15 },
        { moveId: 'thunder_strike', level: 25 },
        { moveId: 'tempest', level: 35 },
        { moveId: 'storm_fury', level: 45 }
    ],
    earth: [
        { moveId: 'strike', level: 1 },
        { moveId: 'stone_throw', level: 5 },
        { moveId: 'rock_smash', level: 10 },
        { moveId: 'earth_tremor', level: 15 },
        { moveId: 'stone_spike', level: 25 },
        { moveId: 'boulder_crash', level: 35 },
        { moveId: 'seismic_slam', level: 45 }
    ],
    mystic: [
        { moveId: 'strike', level: 1 },
        { moveId: 'mind_pulse', level: 5 },
        { moveId: 'mystic_beam', level: 10 },
        { moveId: 'psycho_blast', level: 15 },
        { moveId: 'lunar_ray', level: 25 },
        { moveId: 'mind_crush', level: 35 },
        { moveId: 'cosmic_storm', level: 45 }
    ],
    shadow: [
        { moveId: 'strike', level: 1 },
        { moveId: 'shadow_lick', level: 5 },
        { moveId: 'shadow_bite', level: 10 },
        { moveId: 'dark_slash', level: 15 },
        { moveId: 'shadow_sphere', level: 25 },
        { moveId: 'void_pulse', level: 35 },
        { moveId: 'nightmare', level: 45 }
    ],
    metal: [
        { moveId: 'strike', level: 1 },
        { moveId: 'metal_slash', level: 5 },
        { moveId: 'iron_defense', level: 10 },
        { moveId: 'steel_tail', level: 15 },
        { moveId: 'metal_burst', level: 25 },
        { moveId: 'iron_beam', level: 35 },
        { moveId: 'chrome_crush', level: 45 }
    ],
    venom: [
        { moveId: 'strike', level: 1 },
        { moveId: 'venom_sting', level: 5 },
        { moveId: 'acid_spit', level: 10 },
        { moveId: 'poison_fang', level: 15 },
        { moveId: 'toxic_blast', level: 25 },
        { moveId: 'sludge_cannon', level: 35 },
        { moveId: 'venom_storm', level: 45 }
    ]
};

async function migrateTypesAndMoves() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado ao MongoDB\n');
        
        const entities = await BaseEntity.find({});
        console.log(`📊 Encontrados ${entities.length} monstros\n`);
        
        let updated = 0;
        
        for (const entity of entities) {
            const oldType = (entity.type || 'normal').toLowerCase();
            const newType = TYPE_MAPPING[oldType] || 'beast';
            const movesForType = MOVES_BY_TYPE[newType];
            
            entity.type = newType;
            entity.movePool = movesForType;
            await entity.save();
            
            console.log(`✅ ${entity.name.padEnd(20)} ${oldType.toUpperCase().padEnd(10)} -> ${newType.toUpperCase().padEnd(8)} (${movesForType.length} moves)`);
            updated++;
        }
        
        console.log(`\n📈 Resumo: ${updated} monstros migrados com sucesso!`);
        console.log(`🎉 Tipos e moves atualizados para o novo sistema!`);
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error);
        process.exit(1);
    }
}

migrateTypesAndMoves();
