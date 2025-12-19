const EntityType = { 
    NORMAL: 'normal', FIRE: 'fire', WATER: 'water', PLANT: 'plant', 
    ELECTRIC: 'electric', ICE: 'ice', FIGHTER: 'fighter', 
    POISON: 'poison', GROUND: 'ground', FLYING: 'flying', 
    PSYCHIC: 'psychic', BUG: 'bug', ROCK: 'rock', 
    GHOST: 'ghost', DRAGON: 'dragon', DARK: 'dark', STEEL: 'steel', FAIRY: 'fairy'
};

const MoveType = { ATTACK: 'attack', HEAL: 'heal', DEFEND: 'defend' };
const EffectType = { DOT: 'dot' }; 

const TypeChart = {
    [EntityType.NORMAL]: { [EntityType.ROCK]: 0.5, [EntityType.GHOST]: 0, [EntityType.STEEL]: 0.5 },
    [EntityType.FIRE]: { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 0.5, [EntityType.PLANT]: 2, [EntityType.ICE]: 2, [EntityType.BUG]: 2, [EntityType.ROCK]: 0.5, [EntityType.DRAGON]: 0.5, [EntityType.STEEL]: 2 },
    [EntityType.WATER]: { [EntityType.FIRE]: 2, [EntityType.WATER]: 0.5, [EntityType.PLANT]: 0.5, [EntityType.GROUND]: 2, [EntityType.ROCK]: 2, [EntityType.DRAGON]: 0.5 },
    [EntityType.PLANT]: { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 2, [EntityType.PLANT]: 0.5, [EntityType.POISON]: 0.5, [EntityType.GROUND]: 2, [EntityType.FLYING]: 0.5, [EntityType.BUG]: 0.5, [EntityType.ROCK]: 2, [EntityType.DRAGON]: 0.5, [EntityType.STEEL]: 0.5 },
    [EntityType.ELECTRIC]: { [EntityType.WATER]: 2, [EntityType.PLANT]: 0.5, [EntityType.ELECTRIC]: 0.5, [EntityType.GROUND]: 0, [EntityType.FLYING]: 2, [EntityType.DRAGON]: 0.5 },
    [EntityType.ICE]: { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 0.5, [EntityType.PLANT]: 2, [EntityType.ICE]: 0.5, [EntityType.GROUND]: 2, [EntityType.FLYING]: 2, [EntityType.DRAGON]: 2, [EntityType.STEEL]: 0.5 },
    [EntityType.FIGHTER]: { [EntityType.NORMAL]: 2, [EntityType.ICE]: 2, [EntityType.POISON]: 0.5, [EntityType.FLYING]: 0.5, [EntityType.PSYCHIC]: 0.5, [EntityType.BUG]: 0.5, [EntityType.ROCK]: 2, [EntityType.GHOST]: 0, [EntityType.DARK]: 2, [EntityType.STEEL]: 2, [EntityType.FAIRY]: 0.5 }
};

const MOVES_LIBRARY = {
    'tackle': { id:'tackle', name: 'Tackle', type: MoveType.ATTACK, power: 40, cost: 0, icon: '💥', element: EntityType.NORMAL },
    'scratch': { id:'scratch', name: 'Scratch', type: MoveType.ATTACK, power: 40, cost: 2, icon: '💅', element: EntityType.NORMAL },
    'ember': { id:'ember', name: 'Ember', type: MoveType.ATTACK, power: 40, cost: 4, icon: '🔥', element: EntityType.FIRE },
    'flamethrower': { id:'flamethrower', name: 'Flamethrower', type: MoveType.ATTACK, power: 90, cost: 6, icon: '🌋', element: EntityType.FIRE },
    'water_gun': { id:'water_gun', name: 'Water Gun', type: MoveType.ATTACK, power: 40, cost: 3, icon: '🔫', element: EntityType.WATER },
    'hydro_pump': { id:'hydro_pump', name: 'Hydro Pump', type: MoveType.ATTACK, power: 110, cost: 6, icon: '💧', element: EntityType.WATER },
    'vine_whip': { id:'vine_whip', name: 'Vine Whip', type: MoveType.ATTACK, power: 45, cost: 3, icon: '🍃', element: EntityType.PLANT },
    'solar_beam': { id:'solar_beam', name: 'Solar Beam', type: MoveType.ATTACK, power: 120, cost: 8, icon: '☀️', element: EntityType.PLANT },
    'thunder_shock': { id:'thunder_shock', name: 'Thunder Shock', type: MoveType.ATTACK, power: 40, cost: 3, icon: '⚡', element: EntityType.ELECTRIC },
    'thunderbolt': { id:'thunderbolt', name: 'Thunderbolt', type: MoveType.ATTACK, power: 90, cost: 5, icon: '🌩️', element: EntityType.ELECTRIC },
    'bite': { id:'bite', name: 'Bite', type: MoveType.ATTACK, power: 60, cost: 4, icon: '🦷', element: EntityType.DARK },
    'peck': { id:'peck', name: 'Peck', type: MoveType.ATTACK, power: 35, cost: 1, icon: '🐦', element: EntityType.FLYING },
    'quick_heal': { id:'quick_heal', name: 'Quick Heal', type: MoveType.HEAL, power: 50, cost: 4, icon: '💚' },
    'mega_heal': { id:'mega_heal', name: 'Mega Heal', type: MoveType.HEAL, power: 100, cost: 8, icon: '🧪' },
    'iron_defense': { id:'iron_defense', name: 'Iron Defense', type: MoveType.DEFEND, power: 0, cost: 2, icon: '🛡️' },
    'poison_jab': { id:'poison_jab', name: 'Poison Jab', type: MoveType.ATTACK, power: 80, cost: 3, icon: '☠️', element: EntityType.POISON, effect: { name: 'Poison', type: EffectType.DOT, duration: 3, value: 4 } },
};

function getXpForNextLevel(level) {
    return level * 100;
}

function getTypeEffectiveness(atkType, defType) {
    if (!TypeChart[atkType]) return 1;
    const val = TypeChart[atkType][defType];
    return val === undefined ? 1 : val;
}

module.exports = { EntityType, MoveType, EffectType, TypeChart, getTypeEffectiveness, MOVES_LIBRARY, getXpForNextLevel };