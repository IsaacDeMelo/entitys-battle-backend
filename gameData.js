// =====================
// DEFINIÇÕES DE TIPOS
// =====================
const EntityType = { 
    NORMAL: 'normal', FIRE: 'fire', WATER: 'water', PLANT: 'plant', 
    ELECTRIC: 'electric', ICE: 'ice', FIGHTER: 'fighter', 
    POISON: 'poison', GROUND: 'ground', FLYING: 'flying', 
    PSYCHIC: 'psychic', BUG: 'bug', ROCK: 'rock', 
    GHOST: 'ghost', DRAGON: 'dragon', DARK: 'dark', STEEL: 'steel', FAIRY: 'fairy'
};

const MoveType = { ATTACK: 'attack', HEAL: 'heal', DEFEND: 'defend' };
const EffectType = { DOT: 'dot' }; 

// =====================
// MATRIZ DE EFETIVIDADE (1.5x Super Efetivo)
// =====================
// Se a combinação não estiver aqui, o dano é x1 (Neutro)
const TypeChart = {
    [EntityType.NORMAL]:   { [EntityType.ROCK]: 0.5, [EntityType.GHOST]: 0, [EntityType.STEEL]: 0.5 },
    [EntityType.FIRE]:     { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 0.5, [EntityType.PLANT]: 1.5, [EntityType.ICE]: 1.5, [EntityType.BUG]: 1.5, [EntityType.ROCK]: 0.5, [EntityType.DRAGON]: 0.5, [EntityType.STEEL]: 1.5 },
    [EntityType.WATER]:    { [EntityType.FIRE]: 1.5, [EntityType.WATER]: 0.5, [EntityType.PLANT]: 0.5, [EntityType.GROUND]: 1.5, [EntityType.ROCK]: 1.5, [EntityType.DRAGON]: 0.5 },
    [EntityType.PLANT]:    { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 1.5, [EntityType.PLANT]: 0.5, [EntityType.POISON]: 0.5, [EntityType.GROUND]: 1.5, [EntityType.FLYING]: 0.5, [EntityType.BUG]: 0.5, [EntityType.ROCK]: 1.5, [EntityType.DRAGON]: 0.5, [EntityType.STEEL]: 0.5 },
    [EntityType.ELECTRIC]: { [EntityType.WATER]: 1.5, [EntityType.PLANT]: 0.5, [EntityType.ELECTRIC]: 0.5, [EntityType.GROUND]: 0, [EntityType.FLYING]: 1.5, [EntityType.DRAGON]: 0.5 },
    [EntityType.ICE]:      { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 0.5, [EntityType.PLANT]: 1.5, [EntityType.ICE]: 0.5, [EntityType.GROUND]: 1.5, [EntityType.FLYING]: 1.5, [EntityType.DRAGON]: 1.5, [EntityType.STEEL]: 0.5 },
    [EntityType.FIGHTER]:  { [EntityType.NORMAL]: 1.5, [EntityType.ICE]: 1.5, [EntityType.POISON]: 0.5, [EntityType.FLYING]: 0.5, [EntityType.PSYCHIC]: 0.5, [EntityType.BUG]: 0.5, [EntityType.ROCK]: 1.5, [EntityType.GHOST]: 0, [EntityType.DARK]: 1.5, [EntityType.STEEL]: 1.5, [EntityType.FAIRY]: 0.5 },
    [EntityType.POISON]:   { [EntityType.PLANT]: 1.5, [EntityType.POISON]: 0.5, [EntityType.GROUND]: 0.5, [EntityType.ROCK]: 0.5, [EntityType.GHOST]: 0.5, [EntityType.STEEL]: 0, [EntityType.FAIRY]: 1.5 },
    [EntityType.GROUND]:   { [EntityType.FIRE]: 1.5, [EntityType.PLANT]: 0.5, [EntityType.ELECTRIC]: 1.5, [EntityType.POISON]: 1.5, [EntityType.FLYING]: 0, [EntityType.BUG]: 0.5, [EntityType.ROCK]: 1.5, [EntityType.STEEL]: 1.5 },
    [EntityType.FLYING]:   { [EntityType.PLANT]: 1.5, [EntityType.ELECTRIC]: 0.5, [EntityType.FIGHTER]: 1.5, [EntityType.BUG]: 1.5, [EntityType.ROCK]: 0.5, [EntityType.STEEL]: 0.5 },
    [EntityType.PSYCHIC]:  { [EntityType.FIGHTER]: 1.5, [EntityType.POISON]: 1.5, [EntityType.PSYCHIC]: 0.5, [EntityType.DARK]: 0, [EntityType.STEEL]: 0.5 },
    [EntityType.BUG]:      { [EntityType.FIRE]: 0.5, [EntityType.PLANT]: 1.5, [EntityType.FIGHTER]: 0.5, [EntityType.POISON]: 0.5, [EntityType.FLYING]: 0.5, [EntityType.PSYCHIC]: 1.5, [EntityType.GHOST]: 0.5, [EntityType.DARK]: 1.5, [EntityType.STEEL]: 0.5, [EntityType.FAIRY]: 0.5 },
    [EntityType.ROCK]:     { [EntityType.FIRE]: 1.5, [EntityType.ICE]: 1.5, [EntityType.FIGHTER]: 0.5, [EntityType.GROUND]: 0.5, [EntityType.FLYING]: 1.5, [EntityType.BUG]: 1.5, [EntityType.STEEL]: 0.5 },
    [EntityType.GHOST]:    { [EntityType.NORMAL]: 0, [EntityType.PSYCHIC]: 1.5, [EntityType.GHOST]: 1.5, [EntityType.DARK]: 0.5 },
    [EntityType.DRAGON]:   { [EntityType.DRAGON]: 1.5, [EntityType.STEEL]: 0.5, [EntityType.FAIRY]: 0 },
    [EntityType.DARK]:     { [EntityType.FIGHTER]: 0.5, [EntityType.PSYCHIC]: 1.5, [EntityType.GHOST]: 1.5, [EntityType.DARK]: 0.5, [EntityType.FAIRY]: 0.5 },
    [EntityType.STEEL]:    { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 0.5, [EntityType.ELECTRIC]: 0.5, [EntityType.ICE]: 1.5, [EntityType.ROCK]: 1.5, [EntityType.STEEL]: 0.5, [EntityType.FAIRY]: 1.5 },
    [EntityType.FAIRY]:    { [EntityType.FIRE]: 0.5, [EntityType.FIGHTER]: 1.5, [EntityType.POISON]: 0.5, [EntityType.DRAGON]: 1.5, [EntityType.DARK]: 1.5, [EntityType.STEEL]: 0.5 }
};

// =====================
// BIBLIOTECA DE MOVIMENTOS
// =====================
const MOVES_LIBRARY = {
    // --- BASIC ---
    'smash': { id:'smash', name: 'Smash', type: MoveType.ATTACK, power: 5, cost: 2, icon: '👊', element: EntityType.FIGHTER },
    'tackle': { id:'tackle', name: 'Tackle', type: MoveType.ATTACK, power: 5, cost: 1, icon: '💥', element: EntityType.NORMAL },
    'scratch': { id:'scratch', name: 'Scratch', type: MoveType.ATTACK, power: 6, cost: 2, icon: '💅', element: EntityType.NORMAL },
    
    // --- FIRE ---
    'fireball': { id:'fireball', name: 'Fireball', type: MoveType.ATTACK, power: 8, cost: 4, icon: '🔥', element: EntityType.FIRE },
    'flamethrower': { id:'flamethrower', name: 'Flamethrower', type: MoveType.ATTACK, power: 12, cost: 6, icon: '🌋', element: EntityType.FIRE },
    
    // --- WATER ---
    'water_gun': { id:'water_gun', name: 'Water Gun', type: MoveType.ATTACK, power: 6, cost: 3, icon: '🔫', element: EntityType.WATER },
    'hydro_pump': { id:'hydro_pump', name: 'Hydro Pump', type: MoveType.ATTACK, power: 10, cost: 5, icon: '💧', element: EntityType.WATER },
    
    // --- PLANT ---
    'vine_whip': { id:'vine_whip', name: 'Vine Whip', type: MoveType.ATTACK, power: 7, cost: 3, icon: '🍃', element: EntityType.PLANT },
    'solar_beam': { id:'solar_beam', name: 'Solar Beam', type: MoveType.ATTACK, power: 14, cost: 7, icon: '☀️', element: EntityType.PLANT },
    
    // --- ELECTRIC ---
    'thunder_shock': { id:'thunder_shock', name: 'Thunder Shock', type: MoveType.ATTACK, power: 6, cost: 3, icon: '⚡', element: EntityType.ELECTRIC },
    'thunderbolt': { id:'thunderbolt', name: 'Thunderbolt', type: MoveType.ATTACK, power: 10, cost: 5, icon: '🌩️', element: EntityType.ELECTRIC },
    
    // --- ICE ---
    'ice_shard': { id:'ice_shard', name: 'Ice Shard', type: MoveType.ATTACK, power: 5, cost: 2, icon: '🧊', element: EntityType.ICE },
    'ice_beam': { id:'ice_beam', name: 'Ice Beam', type: MoveType.ATTACK, power: 10, cost: 5, icon: '❄️', element: EntityType.ICE },
    
    // --- FLYING ---
    'peck': { id:'peck', name: 'Peck', type: MoveType.ATTACK, power: 5, cost: 1, icon: '🐦', element: EntityType.FLYING },
    'air_slash': { id:'air_slash', name: 'Air Slash', type: MoveType.ATTACK, power: 9, cost: 4, icon: '🌪️', element: EntityType.FLYING },
    
    // --- GHOST/DARK/FIGHTER ---
    'shadow_ball': { id:'shadow_ball', name: 'Shadow Ball', type: MoveType.ATTACK, power: 10, cost: 6, icon: '🟣', element: EntityType.GHOST },
    'bite': { id:'bite', name: 'Bite', type: MoveType.ATTACK, power: 7, cost: 3, icon: '🦷', element: EntityType.DARK },
    'karate_chop': { id:'karate_chop', name: 'Karate Chop', type: MoveType.ATTACK, power: 8, cost: 3, icon: '🥋', element: EntityType.FIGHTER },

    // --- SUPPORT ---
    'quick_heal': { id:'quick_heal', name: 'Quick Heal', type: MoveType.HEAL, power: 6, cost: 3, icon: '💚' },
    'mega_heal': { id:'mega_heal', name: 'Mega Heal', type: MoveType.HEAL, power: 15, cost: 7, icon: '🧪' },
    'iron_defense': { id:'iron_defense', name: 'Iron Defense', type: MoveType.DEFEND, power: 0, cost: 2, icon: '🛡️' },
    'poison_jab': { id:'poison_jab', name: 'Poison Jab', type: MoveType.ATTACK, power: 4, cost: 3, icon: '☠️', element: EntityType.POISON, effect: { name: 'Poison', type: EffectType.DOT, duration: 3, value: 4 } },
    'ultimate': { id:'ultimate', name: 'Hyper Beam', type: MoveType.ATTACK, power: 22, cost: 12, icon: '💥', element: EntityType.NORMAL }
};

module.exports = { EntityType, MoveType, EffectType, TypeChart, MOVES_LIBRARY };