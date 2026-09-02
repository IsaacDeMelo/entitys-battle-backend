#!/usr/bin/env node
/**
 * Import Pokémon Gen 1 (Kanto) from PokéAPI into BaseEntity.
 * Usage: node scripts/import_pokemon_gen1.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const https = require('https');
const { BaseEntity, Move } = require('../models');

const POKEAPI = 'https://pokeapi.co/api/v2';
const GEN1_MAX = 151;
const DELAY_MS = 250;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function fetchJSON(url) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers: { 'User-Agent': 'entity-battle-import/1.0' } }, (res) => {
            if (res.statusCode === 404) return resolve(null);
            if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
        }).on('error', reject);
    });
}

// Map Pokémon type names to our EntityType values
const TYPE_MAP = {
    'normal': 'normal', 'fire': 'fire', 'water': 'water', 'grass': 'grass',
    'electric': 'electric', 'ice': 'ice', 'fighting': 'fighting', 'poison': 'poison',
    'ground': 'ground', 'flying': 'flying', 'psychic': 'psychic', 'bug': 'bug',
    'rock': 'rock', 'ghost': 'ghost', 'dragon': 'dragon', 'dark': 'dark',
    'steel': 'steel', 'fairy': 'fairy'
};

// Portuguese names for Pokémon types
const TYPE_NAMES_PT = {
    'normal': 'Normal', 'fire': 'Fogo', 'water': 'Água', 'grass': 'Grama',
    'electric': 'Elétrico', 'ice': 'Gelo', 'fighting': 'Lutador', 'poison': 'Venenoso',
    'ground': 'Terrestre', 'flying': 'Voador', 'psychic': 'Psíquico', 'bug': 'Inseto',
    'rock': 'Pedra', 'ghost': 'Fantasma', 'dragon': 'Dragão', 'dark': 'Sombrio',
    'steel': 'Aço', 'fairy': 'Fada'
};

// Portuguese names for Gen 1 Pokémon
const POKE_NAMES_PT = {
    1: 'Bulbasaur', 2: 'Ivysaur', 3: 'Venusaur',
    4: 'Charmander', 5: 'Charmeleon', 6: 'Charizard',
    7: 'Squirtle', 8: 'Wartortle', 9: 'Blastoise',
    10: 'Caterpie', 11: 'Metapod', 12: 'Butterfree',
    13: 'Weedle', 14: 'Kakuna', 15: 'Beedrill',
    16: 'Pidgey', 17: 'Pidgeotto', 18: 'Pidgeot',
    19: 'Rattata', 20: 'Raticate',
    21: 'Spearow', 22: 'Fearow',
    23: 'Ekans', 24: 'Arbok',
    25: 'Pikachu', 26: 'Raichu',
    27: 'Sandshrew', 28: 'Sandslash',
    29: 'Nidoran♀', 30: 'Nidorina', 31: 'Nidoqueen',
    32: 'Nidoran♂', 33: 'Nidorino', 34: 'Nidoking',
    35: 'Clefairy', 36: 'Clefable',
    37: 'Vulpix', 38: 'Ninetales',
    39: 'Jigglypuff', 40: 'Wigglytuff',
    41: 'Zubat', 42: 'Golbat',
    43: 'Oddish', 44: 'Gloom', 45: 'Vileplume',
    46: 'Paras', 47: 'Parasect',
    48: 'Venonat', 49: 'Venomoth',
    50: 'Diglett', 51: 'Dugtrio',
    52: 'Meowth', 53: 'Persian',
    54: 'Psyduck', 55: 'Golduck',
    56: 'Mankey', 57: 'Primeape',
    58: 'Growlithe', 59: 'Arcanine',
    60: 'Poliwag', 61: 'Poliwhirl', 62: 'Poliwrath',
    63: 'Abra', 64: 'Kadabra', 65: 'Alakazam',
    66: 'Machop', 67: 'Machoke', 68: 'Machamp',
    69: 'Bellsprout', 70: 'Weepinbell', 71: 'Victreebel',
    72: 'Tentacool', 73: 'Tentacruel',
    74: 'Geodude', 75: 'Graveler', 76: 'Golem',
    77: 'Ponyta', 78: 'Rapidash',
    79: 'Slowpoke', 80: 'Slowbro',
    81: 'Magnemite', 82: 'Magneton',
    83: 'Farfetch\'d', 84: 'Doduo', 85: 'Dodrio',
    86: 'Seel', 87: 'Dewgong',
    88: 'Grimer', 89: 'Muk',
    90: 'Shellder', 91: 'Cloyster',
    92: 'Gastly', 93: 'Haunter', 94: 'Gengar',
    95: 'Onix',
    96: 'Drowzee', 97: 'Hypno',
    98: 'Krabby', 99: 'Kingler',
    100: 'Voltorb', 101: 'Electrode',
    102: 'Exeggcute', 103: 'Exeggutor',
    104: 'Cubone', 105: 'Marowak',
    106: 'Hitmonlee', 107: 'Hitmonchan',
    108: 'Lickitung', 109: 'Koffing', 110: 'Weezing',
    111: 'Rhyhorn', 112: 'Rhydon',
    113: 'Chansey', 114: 'Tangela',
    115: 'Kangaskhan',
    116: 'Horsea', 117: 'Seadra',
    118: 'Goldeen', 119: 'Seaking',
    120: 'Staryu', 121: 'Starmie',
    122: 'Mr. Mime', 123: 'Scyther',
    124: 'Jynx', 125: 'Electabuzz', 126: 'Magmar',
    127: 'Pinsir', 128: 'Tauros',
    129: 'Magikarp', 130: 'Gyarados', 131: 'Lapras',
    132: 'Ditto',
    133: 'Eevee', 134: 'Vaporeon', 135: 'Jolteon', 136: 'Flareon',
    137: 'Porygon', 138: 'Omanyte', 139: 'Omastar',
    140: 'Kabuto', 141: 'Kabutops',
    142: 'Aerodactyl', 143: 'Snorlax',
    144: 'Articuno', 145: 'Zapdos', 146: 'Moltres',
    147: 'Dratini', 148: 'Dragonair', 149: 'Dragonite',
    150: 'Mewtwo', 151: 'Mew'
};

// Move name → our move ID mapping (PokéAPI move name → MOVES_LIBRARY id)
const MOVE_ID_MAP = {
    'tackle': 'tackle', 'scratch': 'scratch', 'quick-attack': 'quick_attack',
    'slam': 'slam', 'body-slam': 'body_slam', 'hyper-beam': 'hyper_beam',
    'swift': 'swift', 'double-edge': 'double_edge', 'cut': 'cut',
    'strength': 'strength', 'pay-day': 'pay_day', 'fury-swipes': 'fury_swipes',
    'skull-bash': 'skull_bash', 'razor-wind': 'razor_wind', 'vine-whip': 'vine_whip',
    'ember': 'ember', 'fire-punch': 'fire_punch', 'flamethrower': 'flamethrower',
    'fire-blast': 'fire_blast', 'fire-spin': 'fire_spin',
    'water-gun': 'water_gun', 'bubble': 'bubble', 'bubble-beam': 'bubble_beam',
    'surf': 'surf', 'hydro-pump': 'hydro_pump', 'waterfall': 'waterfall',
    'razor-leaf': 'razor_leaf', 'solar-beam': 'solar_beam', 'mega-drain': 'mega_drain',
    'absorb': 'absorb', 'leech-seed': 'leech_seed', 'spore': 'spore', 'seed-bomb': 'seed_bomb',
    'thunder-shock': 'thunder_shock', 'thunderbolt': 'thunderbolt', 'thunder': 'thunder',
    'thunder-punch': 'thunder_punch',
    'ice-shard': 'ice_shard', 'ice-beam': 'ice_beam', 'blizzard': 'blizzard',
    'ice-punch': 'ice_punch',
    'karate-chop': 'karate_chop', 'double-kick': 'double_kick', 'submission': 'submission',
    'low-kick': 'low_kick', 'jump-kick': 'jump_kick', 'high-jump-kick': 'high_jump_kick',
    'close-combat': 'close_combat',
    'poison-sting': 'poison_sting', 'sludge': 'sludge', 'toxic': 'toxic',
    'poison-gas': 'poison_gas', 'acid': 'acid',
    'dig': 'dig', 'earthquake': 'earthquake', 'bone-club': 'bone_club',
    'mud-slap': 'mud_slap', 'fissure': 'fissure',
    'gust': 'gust', 'wing-attack': 'wing_attack', 'fly': 'fly',
    'aerial-ace': 'aerial_ace', 'sky-attack': 'sky_attack', 'mirror-move': 'mirror_move',
    'confusion': 'confusion', 'psychic': 'psychic', 'amnesia': 'amnesia',
    'light-screen': 'light_screen', 'reflect': 'reflect',
    'pin-missile': 'pin_missile', 'string-shot': 'string_shot', 'twineedle': 'twineedle',
    'leech-life': 'leech_life',
    'rock-throw': 'rock_throw', 'rock-slide': 'rock_slide', 'sandstorm': 'sandstorm',
    'lick': 'lick', 'night-shade': 'night_shade', 'destiny-bond': 'destiny_bond',
    'dragon-rage': 'dragon_rage', 'dragon-dance': 'dragon_dance',
    'bite': 'bite', 'dark-pulse': 'dark_pulse', 'crunch': 'crunch',
    'metal-claw': 'metal_claw', 'iron-tail': 'iron_tail', 'metal-sound': 'metal_sound',
    'steel-wing': 'steel_wing',
    'fairy-wind': 'fairy_wind', 'moonblast': 'moonblast', 'charm': 'charm',
    'growl': 'growl', 'tail-whip': 'tail_whip', 'leer': 'leer',
    'harden': 'harden', 'swords-dance': 'swords_dance'
};

// Pokémon → evolution chain ID mapping (we'll fetch these)
const EVOLUTION_CHAIN_IDS = {};

// Species ID → evolution chain URL cache
const evoChainCache = {};

async function fetchEvolutionChain(speciesId) {
    if (evoChainCache[speciesId]) return evoChainCache[speciesId];
    const species = await fetchJSON(`${POKEAPI}/pokemon-species/${speciesId}`);
    if (!species || !species.evolution_chain) return null;
    const chainId = species.evolution_chain.url.match(/\/(\d+)\/?$/)[1];
    const chain = await fetchJSON(species.evolution_chain.url);
    evoChainCache[speciesId] = chain;
    return chain;
}

function parseEvolutionChain(chain, currentSpeciesId) {
    if (!chain || !chain.chain) return null;
    
    // Find current species in the chain
    function findInChain(node) {
        const speciesNum = parseInt(node.species.url.match(/\/(\d+)\/?$/)[1]);
        if (speciesNum === currentSpeciesId) {
            // This is the current Pokémon, find what it evolves into
            if (node.evolves_to && node.evolves_to.length > 0) {
                const evo = node.evolves_to[0];
                const targetNum = parseInt(evo.species.url.match(/\/(\d+)\/?$/)[1]);
                if (targetNum <= GEN1_MAX) {
                    const detail = evo.evolution_details[0] || {};
                    return {
                        targetId: String(targetNum),
                        level: detail.min_level || 16 // default level if not specified
                    };
                }
            }
            return null;
        }
        // Recurse into evolves_to
        for (const child of (node.evolves_to || [])) {
            const result = findInChain(child);
            if (result) return result;
        }
        return null;
    }
    
    return findInChain(chain.chain);
}

// Species ID → evolution chain IDs (to avoid refetching)
const speciesToChainId = {};

async function getEvolution(speciesId) {
    try {
        const chain = await fetchEvolutionChain(speciesId);
        return parseEvolutionChain(chain, speciesId);
    } catch (e) {
        return null;
    }
}

// Map move version group learn methods to level learned
function getLevelMoves(moveName, versionGroupDetails) {
    const moves = [];
    for (const vgd of versionGroupDetails) {
        // Only Gen 1 version groups (red-blue, yellow)
        const vgName = vgd.version_group.name;
        if (vgName !== 'red-blue' && vgName !== 'yellow') continue;
        
        const learnMethod = vgd.move_learn_method.name;
        if (learnMethod === 'level-up') {
            moves.push({
                name: moveName,
                level: vgd.level_learned_at
            });
        }
    }
    return moves;
}

async function importPokemon() {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Conectado ao MongoDB.\n');
    
    let imported = 0, skipped = 0, failed = 0;
    
    for (let id = 1; id <= GEN1_MAX; id++) {
        try {
            // Check if already exists
            const existing = await BaseEntity.findOne({ id: String(id) }).lean();
            if (existing) {
                console.log(`#${id} ${POKE_NAMES_PT[id] || '?'} — já existe, pulando`);
                skipped++;
                continue;
            }
            
            console.log(`#${id} ${POKE_NAMES_PT[id] || '?'} — buscando dados...`);
            
            // Fetch Pokémon data
            const pokemon = await fetchJSON(`${POKEAPI}/pokemon/${id}`);
            if (!pokemon) {
                console.log(`  ✗ Não encontrado`);
                failed++;
                continue;
            }
            
            await sleep(DELAY_MS);
            
            // Fetch species for capture_rate and evolution
            const species = await fetchJSON(`${POKEAPI}/pokemon-species/${id}`);
            await sleep(DELAY_MS);
            
            // Types
            const types = pokemon.types
                .sort((a, b) => a.slot - b.slot)
                .map(t => TYPE_MAP[t.type.name] || t.type.name);
            const primaryType = types[0] || 'normal';
            
            // Stats (Pokémon has hp, attack, defense, sp-atk, sp-def, speed)
            const stats = {};
            for (const s of pokemon.stats) {
                stats[s.stat.name] = s.base_stat;
            }
            
            // Map to our schema: hp, energy, attack, defense, speed
            // Average physical and special for attack/defense
            const atk = Math.round(((stats.attack || 50) + (stats['sp-attack'] || 50)) / 2);
            const def = Math.round(((stats.defense || 50) + (stats['sp-defense'] || 50)) / 2);
            const spd = stats.speed || 50;
            const hp = stats.hp || 50;
            const energy = 50 + Math.floor(spd / 10); // energy based on speed
            
            // Capture rate (lower = harder to catch, like Pokémon)
            // PokéAPI gives 0-255, normalize to 0-1
            const captureRateRaw = species ? species.capture_rate : 45;
            const captureRate = Math.min(1, captureRateRaw / 255);
            
            // Evolution
            const evolution = await getEvolution(id);
            
            // Moves by level (Gen 1 only)
            const levelMoves = [];
            for (const moveData of pokemon.moves) {
                const movesByGen = getLevelMoves(moveData.move.name, moveData.version_group_details);
                for (const m of movesByGen) {
                    const moveId = MOVE_ID_MAP[m.name];
                    if (moveId) {
                        levelMoves.push({ moveId, level: m.level });
                    }
                }
            }
            
            // Sort moves by level
            levelMoves.sort((a, b) => a.level - b.level);
            
            // Sprites
            const battleSprite = pokemon.sprites.front_default || ''; // 96x96 pra batalha
            const gen8Icons = pokemon.sprites?.versions?.['generation-viii']?.icons;
            const iconSprite = (gen8Icons?.front_default || pokemon.sprites?.front_default) || ''; // 32x32 pro PC/equipe
            
// Build entity
            const entity = {
                id: String(id),
                name: POKE_NAMES_PT[id] || pokemon.name,
                type: primaryType,
                baseStats: {
                    hp,
                    energy,
                    attack: atk,
                    defense: def,
                    speed: spd
                },
                spawnLocation: 'city',
                minSpawnLevel: Math.max(1, Math.floor(id / 20)),
                maxSpawnLevel: Math.min(50, Math.floor(id / 10) + 10),
                catchRate: captureRate,
                spawnChance: Math.max(0.05, 1 - (captureRate / 255)),
                isStarter: [1, 4, 7, 25].includes(id),
                sprite: battleSprite,
                icon: iconSprite,
                dexOrder: id,
                ...(evolution ? { evolution } : {}),
                movePool: levelMoves.length > 0 ? levelMoves : [{ moveId: 'tackle', level: 1 }]
            };
            
            await BaseEntity.create(entity);
            imported++;
            console.log(`  ✓ ${entity.name} (${types.join('/')}) — HP:${hp} ATK:${atk} DEF:${def} SPD:${spd} — ${levelMoves.length} moves`);
            
        } catch (e) {
            console.error(`  ✗ Erro: ${e.message}`);
            failed++;
        }
    }
    
    console.log(`\n=== IMPORTAÇÃO CONCLUÍDA ===`);
    console.log(`Importados: ${imported} | Pulados: ${skipped} | Falharam: ${failed}`);
    
    await mongoose.disconnect();
}

importPokemon().catch(e => {
    console.error('Erro fatal:', e);
    process.exit(1);
});
