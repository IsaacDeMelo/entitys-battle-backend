const Types = { 
    NORMAL: 'normal', FIRE: 'fire', WATER: 'water', PLANT: 'plant', 
    ELECTRIC: 'electric', ICE: 'ice', FIGHTING: 'fighting', 
    POISON: 'poison', GROUND: 'ground', FLYING: 'flying', 
    PSYCHIC: 'psychic', BUG: 'bug', ROCK: 'rock', 
    GHOST: 'ghost', DRAGON: 'dragon', DARK: 'dark', STEEL: 'steel', FAIRY: 'fairy'
};

// Exporta como lista para o EJS não dar erro
const EntityType = Object.values(Types);

const MoveType = { ATTACK: 'attack', HEAL: 'heal', DEFEND: 'defend' };
const EffectType = { DOT: 'dot' }; 

const TypeChart = {
    [Types.NORMAL]: { [Types.ROCK]: 0.5, [Types.GHOST]: 0, [Types.STEEL]: 0.5 },
    [Types.FIRE]: { [Types.FIRE]: 0.5, [Types.WATER]: 0.5, [Types.PLANT]: 2, [Types.ICE]: 2, [Types.BUG]: 2, [Types.ROCK]: 0.5, [Types.DRAGON]: 0.5, [Types.STEEL]: 2 },
    [Types.WATER]: { [Types.FIRE]: 2, [Types.WATER]: 0.5, [Types.PLANT]: 0.5, [Types.GROUND]: 2, [Types.ROCK]: 2, [Types.DRAGON]: 0.5 },
    [Types.PLANT]: { [Types.FIRE]: 0.5, [Types.WATER]: 2, [Types.PLANT]: 0.5, [Types.POISON]: 0.5, [Types.GROUND]: 2, [Types.FLYING]: 0.5, [Types.BUG]: 0.5, [Types.ROCK]: 2, [Types.DRAGON]: 0.5, [Types.STEEL]: 0.5 },
    [Types.ELECTRIC]: { [Types.WATER]: 2, [Types.PLANT]: 0.5, [Types.ELECTRIC]: 0.5, [Types.GROUND]: 0, [Types.FLYING]: 2, [Types.DRAGON]: 0.5 },
    [Types.ICE]: { [Types.FIRE]: 0.5, [Types.WATER]: 0.5, [Types.PLANT]: 2, [Types.ICE]: 0.5, [Types.GROUND]: 2, [Types.FLYING]: 2, [Types.DRAGON]: 2, [Types.STEEL]: 0.5 },
    [Types.FIGHTING]: { [Types.NORMAL]: 2, [Types.ICE]: 2, [Types.POISON]: 0.5, [Types.FLYING]: 0.5, [Types.PSYCHIC]: 0.5, [Types.BUG]: 0.5, [Types.ROCK]: 2, [Types.GHOST]: 0, [Types.DARK]: 2, [Types.STEEL]: 2, [Types.FAIRY]: 0.5 },
    [Types.POISON]: { [Types.PLANT]: 2, [Types.POISON]: 0.5, [Types.GROUND]: 0.5, [Types.ROCK]: 0.5, [Types.GHOST]: 0.5, [Types.STEEL]: 0, [Types.FAIRY]: 2 },
    [Types.GROUND]: { [Types.FIRE]: 2, [Types.ELECTRIC]: 2, [Types.PLANT]: 0.5, [Types.POISON]: 2, [Types.FLYING]: 0, [Types.BUG]: 0.5, [Types.ROCK]: 2, [Types.STEEL]: 2 },
    [Types.FLYING]: { [Types.ELECTRIC]: 0.5, [Types.PLANT]: 2, [Types.FIGHTING]: 2, [Types.BUG]: 2, [Types.ROCK]: 0.5, [Types.STEEL]: 0.5 },
    [Types.PSYCHIC]: { [Types.FIGHTING]: 2, [Types.POISON]: 2, [Types.PSYCHIC]: 0.5, [Types.DARK]: 0, [Types.STEEL]: 0.5 },
    [Types.BUG]: { [Types.FIRE]: 0.5, [Types.PLANT]: 2, [Types.FIGHTING]: 0.5, [Types.POISON]: 0.5, [Types.FLYING]: 0.5, [Types.PSYCHIC]: 2, [Types.GHOST]: 0.5, [Types.DARK]: 2, [Types.STEEL]: 0.5, [Types.FAIRY]: 0.5 },
    [Types.ROCK]: { [Types.FIRE]: 2, [Types.ICE]: 2, [Types.FIGHTING]: 0.5, [Types.GROUND]: 0.5, [Types.FLYING]: 2, [Types.BUG]: 2, [Types.STEEL]: 0.5 },
    [Types.GHOST]: { [Types.NORMAL]: 0, [Types.PSYCHIC]: 2, [Types.GHOST]: 2, [Types.DARK]: 0.5 },
    [Types.DRAGON]: { [Types.DRAGON]: 2, [Types.STEEL]: 0.5, [Types.FAIRY]: 0 },
    [Types.DARK]: { [Types.FIGHTING]: 0.5, [Types.PSYCHIC]: 2, [Types.GHOST]: 2, [Types.DARK]: 0.5, [Types.FAIRY]: 0.5 },
    [Types.STEEL]: { [Types.FIRE]: 0.5, [Types.WATER]: 0.5, [Types.ELECTRIC]: 0.5, [Types.ICE]: 2, [Types.ROCK]: 2, [Types.STEEL]: 0.5, [Types.FAIRY]: 2 },
    [Types.FAIRY]: { [Types.FIRE]: 0.5, [Types.FIGHTING]: 2, [Types.POISON]: 0.5, [Types.DRAGON]: 2, [Types.DARK]: 2, [Types.STEEL]: 0.5 }
};

const MOVES_LIBRARY = {
    // --- NORMAL ---
    'tackle': { id: 'tackle', name: 'Investida', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 35, icon: '💥', element: Types.NORMAL },
    'scratch': { id: 'scratch', name: 'Arranhão', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 35, icon: '💅', element: Types.NORMAL },
    'pound': { id: 'pound', name: 'Tapa', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 35, icon: '👊', element: Types.NORMAL },
    'quick_attack': { id: 'quick_attack', name: 'Ataque Rápido', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 30, icon: '⚡', element: Types.NORMAL },
    'slash': { id: 'slash', name: 'Talhada', type: MoveType.ATTACK, category: 'physical', power: 70, maxPp: 20, icon: '🔪', element: Types.NORMAL },
    'cut': { id: 'cut', name: 'Cortar', type: MoveType.ATTACK, category: 'physical', power: 50, maxPp: 30, icon: '✂️', element: Types.NORMAL },
    'body_slam': { id: 'body_slam', name: 'Pancada Corporal', type: MoveType.ATTACK, category: 'physical', power: 85, maxPp: 15, icon: '🏋️', element: Types.NORMAL },
    'hyper_beam': { id: 'hyper_beam', name: 'Hiper Raio', type: MoveType.ATTACK, category: 'special', power: 150, maxPp: 5, icon: '🌌', element: Types.NORMAL },
    'swift': { id: 'swift', name: 'Meteoro', type: MoveType.ATTACK, category: 'special', power: 60, maxPp: 20, icon: '⭐', element: Types.NORMAL },
    'tri_attack': { id: 'tri_attack', name: 'Tri-Ataque', type: MoveType.ATTACK, category: 'special', power: 80, maxPp: 10, icon: '🔺', element: Types.NORMAL },
    'giga_impact': { id: 'giga_impact', name: 'Giga Impacto', type: MoveType.ATTACK, category: 'physical', power: 150, maxPp: 5, icon: '💥', element: Types.NORMAL },
    
    // --- FIRE ---
    'ember': { id: 'ember', name: 'Brasa', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 25, icon: '🔥', element: Types.FIRE },
    'flamethrower': { id: 'flamethrower', name: 'Lança-Chamas', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 15, icon: '🌋', element: Types.FIRE },
    'fire_punch': { id: 'fire_punch', name: 'Soco de Fogo', type: MoveType.ATTACK, category: 'physical', power: 75, maxPp: 15, icon: '🥊', element: Types.FIRE },
    'fire_blast': { id: 'fire_blast', name: 'Explosão de Fogo', type: MoveType.ATTACK, category: 'special', power: 110, maxPp: 5, icon: '大', element: Types.FIRE },
    'flame_wheel': { id: 'flame_wheel', name: 'Roda de Fogo', type: MoveType.ATTACK, category: 'physical', power: 60, maxPp: 25, icon: '🎡', element: Types.FIRE },
    'heat_wave': { id: 'heat_wave', name: 'Onda de Calor', type: MoveType.ATTACK, category: 'special', power: 95, maxPp: 10, icon: '♨️', element: Types.FIRE },
    'fire_spin': { id: 'fire_spin', name: 'Redemoinho de Fogo', type: MoveType.ATTACK, category: 'special', power: 35, maxPp: 15, icon: '🌀', element: Types.FIRE },
    'flare_blitz': { id: 'flare_blitz', name: 'Blitz de Labareda', type: MoveType.ATTACK, category: 'physical', power: 120, maxPp: 15, icon: '🧨', element: Types.FIRE },

    // --- WATER ---
    'water_gun': { id: 'water_gun', name: 'Jato d\'Água', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 25, icon: '🔫', element: Types.WATER },
    'bubble': { id: 'bubble', name: 'Bolhas', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 30, icon: '🫧', element: Types.WATER },
    'surf': { id: 'surf', name: 'Surfar', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 15, icon: '🏄', element: Types.WATER },
    'hydro_pump': { id: 'hydro_pump', name: 'Hidro Bomba', type: MoveType.ATTACK, category: 'special', power: 110, maxPp: 5, icon: '💧', element: Types.WATER },
    'aqua_tail': { id: 'aqua_tail', name: 'Cauda d\'Água', type: MoveType.ATTACK, category: 'physical', power: 90, maxPp: 10, icon: '🐋', element: Types.WATER },
    'aqua_jet': { id: 'aqua_jet', name: 'Jato Aquático', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 20, icon: '🚤', element: Types.WATER },
    'bubble_beam': { id: 'bubble_beam', name: 'Raio de Bolhas', type: MoveType.ATTACK, category: 'special', power: 65, maxPp: 20, icon: '🛁', element: Types.WATER },
    'waterfall': { id: 'waterfall', name: 'Cachoeira', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 15, icon: '🌊', element: Types.WATER },

    // --- PLANT ---
    'vine_whip': { id: 'vine_whip', name: 'Chicote de Cipó', type: MoveType.ATTACK, category: 'physical', power: 45, maxPp: 25, icon: '🍃', element: Types.PLANT },
    'razor_leaf': { id: 'razor_leaf', name: 'Folha Navalha', type: MoveType.ATTACK, category: 'physical', power: 55, maxPp: 25, icon: '✂️', element: Types.PLANT },
    'energy_ball': { id: 'energy_ball', name: 'Bola de Energia', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 10, icon: '🟢', element: Types.PLANT },
    'solar_beam': { id: 'solar_beam', name: 'Raio Solar', type: MoveType.ATTACK, category: 'special', power: 120, maxPp: 10, icon: '☀️', element: Types.PLANT },
    'seed_bomb': { id: 'seed_bomb', name: 'Bomba de Sementes', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 15, icon: '💣', element: Types.PLANT },
    'mega_drain': { id: 'mega_drain', name: 'Mega Dreno', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 15, icon: '🥤', element: Types.PLANT },
    'leaf_blade': { id: 'leaf_blade', name: 'Lâmina de Folha', type: MoveType.ATTACK, category: 'physical', power: 90, maxPp: 15, icon: '⚔️', element: Types.PLANT },
    'petal_dance': { id: 'petal_dance', name: 'Dança das Pétalas', type: MoveType.ATTACK, category: 'special', power: 120, maxPp: 10, icon: '🌸', element: Types.PLANT },

    // --- ELECTRIC ---
    'thundershock': { id: 'thundershock', name: 'Choque do Trovão', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 30, icon: '⚡', element: Types.ELECTRIC },
    'thunderbolt': { id: 'thunderbolt', name: 'Relâmpago', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 15, icon: '🌩️', element: Types.ELECTRIC },
    'thunder': { id: 'thunder', name: 'Trovão', type: MoveType.ATTACK, category: 'special', power: 110, maxPp: 10, icon: '⛈️', element: Types.ELECTRIC },
    'spark': { id: 'spark', name: 'Faísca', type: MoveType.ATTACK, category: 'physical', power: 65, maxPp: 20, icon: '✨', element: Types.ELECTRIC },
    'thunder_punch': { id: 'thunder_punch', name: 'Soco do Trovão', type: MoveType.ATTACK, category: 'physical', power: 75, maxPp: 15, icon: '🤜', element: Types.ELECTRIC },
    'discharge': { id: 'discharge', name: 'Descarga', type: MoveType.ATTACK, category: 'special', power: 80, maxPp: 15, icon: '💡', element: Types.ELECTRIC },
    'wild_charge': { id: 'wild_charge', name: 'Carga Selvagem', type: MoveType.ATTACK, category: 'physical', power: 90, maxPp: 15, icon: '🐂', element: Types.ELECTRIC },
    'volt_tackle': { id: 'volt_tackle', name: 'Investida Trovão', type: MoveType.ATTACK, category: 'physical', power: 120, maxPp: 15, icon: '⚡️', element: Types.ELECTRIC },

    // --- ICE ---
    'ice_shard': { id: 'ice_shard', name: 'Caco de Gelo', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 30, icon: '🧊', element: Types.ICE },
    'ice_beam': { id: 'ice_beam', name: 'Raio de Gelo', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 10, icon: '❄️', element: Types.ICE },
    'blizzard': { id: 'blizzard', name: 'Nevasca', type: MoveType.ATTACK, category: 'special', power: 110, maxPp: 5, icon: '🌬️', element: Types.ICE },
    'ice_punch': { id: 'ice_punch', name: 'Soco de Gelo', type: MoveType.ATTACK, category: 'physical', power: 75, maxPp: 15, icon: '🥶', element: Types.ICE },
    'powder_snow': { id: 'powder_snow', name: 'Neve em Pó', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 25, icon: '❄️', element: Types.ICE },
    'aurora_beam': { id: 'aurora_beam', name: 'Raio Aurora', type: MoveType.ATTACK, category: 'special', power: 65, maxPp: 20, icon: '🌈', element: Types.ICE },
    'icicle_crash': { id: 'icicle_crash', name: 'Queda de Gelo', type: MoveType.ATTACK, category: 'physical', power: 85, maxPp: 10, icon: '📉', element: Types.ICE },

    // --- POISON ---
    'acid': { id: 'acid', name: 'Ácido', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 30, icon: '🧪', element: Types.POISON },
    'sludge_bomb': { id: 'sludge_bomb', name: 'Bomba de Lama', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 10, icon: '💣', element: Types.POISON },
    'poison_jab': { id: 'poison_jab', name: 'Golpe Venenoso', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 20, icon: '☠️', element: Types.POISON },
    'poison_powder': { id: 'poison_powder', name: 'Pó Venenoso', type: MoveType.ATTACK, category: 'special', power: 20, maxPp: 35, icon: '🦠', element: Types.POISON },
    'poison_sting': { id: 'poison_sting', name: 'Picada Venenosa', type: MoveType.ATTACK, category: 'physical', power: 15, maxPp: 35, icon: '💉', element: Types.POISON },
    'sludge': { id: 'sludge', name: 'Lama', type: MoveType.ATTACK, category: 'special', power: 65, maxPp: 20, icon: '💩', element: Types.POISON },
    'gunk_shot': { id: 'gunk_shot', name: 'Tiro de Lixo', type: MoveType.ATTACK, category: 'physical', power: 120, maxPp: 5, icon: '🗑️', element: Types.POISON },

    // --- FLYING ---
    'gust': { id: 'gust', name: 'Rajada de Vento', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 35, icon: '💨', element: Types.FLYING },
    'wing_attack': { id: 'wing_attack', name: 'Ataque de Asa', type: MoveType.ATTACK, category: 'physical', power: 60, maxPp: 35, icon: '🦅', element: Types.FLYING },
    'air_slash': { id: 'air_slash', name: 'Lâmina de Ar', type: MoveType.ATTACK, category: 'special', power: 75, maxPp: 15, icon: '🌬️', element: Types.FLYING },
    'peck': { id: 'peck', name: 'Bicada', type: MoveType.ATTACK, category: 'physical', power: 35, maxPp: 35, icon: '🐦', element: Types.FLYING },
    'fly': { id: 'fly', name: 'Voar', type: MoveType.ATTACK, category: 'physical', power: 90, maxPp: 15, icon: '🛫', element: Types.FLYING },
    'brave_bird': { id: 'brave_bird', name: 'Pássaro Bravo', type: MoveType.ATTACK, category: 'physical', power: 120, maxPp: 15, icon: '🔥', element: Types.FLYING },
    'hurricane': { id: 'hurricane', name: 'Furacão', type: MoveType.ATTACK, category: 'special', power: 110, maxPp: 10, icon: '🌪️', element: Types.FLYING },
    'aerial_ace': { id: 'aerial_ace', name: 'Ás Aéreo', type: MoveType.ATTACK, category: 'physical', power: 60, maxPp: 20, icon: '✈️', element: Types.FLYING },

    // --- GROUND ---
    'earthquake': { id: 'earthquake', name: 'Terremoto', type: MoveType.ATTACK, category: 'physical', power: 100, maxPp: 10, icon: '📉', element: Types.GROUND },
    'mud_shot': { id: 'mud_shot', name: 'Tiro de Lama', type: MoveType.ATTACK, category: 'special', power: 55, maxPp: 15, icon: '🔫', element: Types.GROUND },
    'dig': { id: 'dig', name: 'Cavar', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 10, icon: '⛏️', element: Types.GROUND },
    'mud_slap': { id: 'mud_slap', name: 'Tapa de Lama', type: MoveType.ATTACK, category: 'special', power: 20, maxPp: 10, icon: '💩', element: Types.GROUND },
    'bulldoze': { id: 'bulldoze', name: 'Terraplenagem', type: MoveType.ATTACK, category: 'physical', power: 60, maxPp: 20, icon: '🚜', element: Types.GROUND },
    'earth_power': { id: 'earth_power', name: 'Poder da Terra', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 10, icon: '🌋', element: Types.GROUND },

    // --- PSYCHIC ---
    'confusion': { id: 'confusion', name: 'Confusão', type: MoveType.ATTACK, category: 'special', power: 50, maxPp: 25, icon: '😵', element: Types.PSYCHIC },
    'psychic': { id: 'psychic', name: 'Psíquico', type: MoveType.ATTACK, category: 'special', power: 90, maxPp: 10, icon: '🧠', element: Types.PSYCHIC },
    'psybeam': { id: 'psybeam', name: 'Raio Psíquico', type: MoveType.ATTACK, category: 'special', power: 65, maxPp: 20, icon: '🌈', element: Types.PSYCHIC },
    'psycho_cut': { id: 'psycho_cut', name: 'Corte Psíquico', type: MoveType.ATTACK, category: 'physical', power: 70, maxPp: 20, icon: '🔪', element: Types.PSYCHIC },
    'zen_headbutt': { id: 'zen_headbutt', name: 'Cabeçada Zen', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 15, icon: '💆', element: Types.PSYCHIC },
    'future_sight': { id: 'future_sight', name: 'Previsão do Futuro', type: MoveType.ATTACK, category: 'special', power: 120, maxPp: 10, icon: '🔮', element: Types.PSYCHIC },

    // --- ROCK ---
    'rock_throw': { id: 'rock_throw', name: 'Lançamento de Rocha', type: MoveType.ATTACK, category: 'physical', power: 50, maxPp: 15, icon: '🪨', element: Types.ROCK },
    'rock_slide': { id: 'rock_slide', name: 'Deslizamento de Pedras', type: MoveType.ATTACK, category: 'physical', power: 75, maxPp: 10, icon: '⛰️', element: Types.ROCK },
    'stone_edge': { id: 'stone_edge', name: 'Gume de Pedra', type: MoveType.ATTACK, category: 'physical', power: 100, maxPp: 5, icon: '🔪', element: Types.ROCK },
    'rollout': { id: 'rollout', name: 'Rolagem', type: MoveType.ATTACK, category: 'physical', power: 30, maxPp: 20, icon: '🔄', element: Types.ROCK },
    'ancient_power': { id: 'ancient_power', name: 'Poder Antigo', type: MoveType.ATTACK, category: 'special', power: 60, maxPp: 5, icon: '🏺', element: Types.ROCK },
    'power_gem': { id: 'power_gem', name: 'Joia do Poder', type: MoveType.ATTACK, category: 'special', power: 80, maxPp: 20, icon: '💎', element: Types.ROCK },

    // --- GHOST ---
    'shadow_ball': { id: 'shadow_ball', name: 'Bola Sombria', type: MoveType.ATTACK, category: 'special', power: 80, maxPp: 15, icon: '🟣', element: Types.GHOST },
    'lick': { id: 'lick', name: 'Lambida', type: MoveType.ATTACK, category: 'physical', power: 30, maxPp: 30, icon: '👅', element: Types.GHOST },
    'shadow_claw': { id: 'shadow_claw', name: 'Garra Sombria', type: MoveType.ATTACK, category: 'physical', power: 70, maxPp: 15, icon: '💅', element: Types.GHOST },
    'shadow_sneak': { id: 'shadow_sneak', name: 'Sombra Furtiva', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 30, icon: '👤', element: Types.GHOST },
    'hex': { id: 'hex', name: 'Feitiço', type: MoveType.ATTACK, category: 'special', power: 65, maxPp: 10, icon: '🧙', element: Types.GHOST },
    'phantom_force': { id: 'phantom_force', name: 'Força Fantasma', type: MoveType.ATTACK, category: 'physical', power: 90, maxPp: 10, icon: '👻', element: Types.GHOST },

    // --- DRAGON ---
    'dragon_claw': { id: 'dragon_claw', name: 'Garra de Dragão', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 15, icon: '🐉', element: Types.DRAGON },
    'dragon_breath': { id: 'dragon_breath', name: 'Sopro do Dragão', type: MoveType.ATTACK, category: 'special', power: 60, maxPp: 20, icon: '😮‍💨', element: Types.DRAGON },
    'outrage': { id: 'outrage', name: 'Ultraje', type: MoveType.ATTACK, category: 'physical', power: 120, maxPp: 10, icon: '😡', element: Types.DRAGON },
    'twister': { id: 'twister', name: 'Tornado', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 20, icon: '🌪️', element: Types.DRAGON },
    'dragon_pulse': { id: 'dragon_pulse', name: 'Pulso do Dragão', type: MoveType.ATTACK, category: 'special', power: 85, maxPp: 10, icon: '🐲', element: Types.DRAGON },
    'draco_meteor': { id: 'draco_meteor', name: 'Draco Meteoro', type: MoveType.ATTACK, category: 'special', power: 130, maxPp: 5, icon: '☄️', element: Types.DRAGON },

    // --- DARK ---
    'bite': { id: 'bite', name: 'Mordida', type: MoveType.ATTACK, category: 'physical', power: 60, maxPp: 25, icon: '🦷', element: Types.DARK },
    'crunch': { id: 'crunch', name: 'Triturar', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 15, icon: '🦴', element: Types.DARK },
    'dark_pulse': { id: 'dark_pulse', name: 'Pulso Sombrio', type: MoveType.ATTACK, category: 'special', power: 80, maxPp: 15, icon: '⚫', element: Types.DARK },
    'sucker_punch': { id: 'sucker_punch', name: 'Soco Baixo', type: MoveType.ATTACK, category: 'physical', power: 70, maxPp: 5, icon: '👊', element: Types.DARK },
    'snarl': { id: 'snarl', name: 'Rosnado', type: MoveType.ATTACK, category: 'special', power: 55, maxPp: 15, icon: '🤬', element: Types.DARK },
    'night_slash': { id: 'night_slash', name: 'Talhada Noturna', type: MoveType.ATTACK, category: 'physical', power: 70, maxPp: 15, icon: '🌑', element: Types.DARK },

    // --- STEEL ---
    'bullet_punch': { id: 'bullet_punch', name: 'Soco Projétil', type: MoveType.ATTACK, category: 'physical', power: 40, maxPp: 30, icon: '🚅', element: Types.STEEL },
    'metal_claw': { id: 'metal_claw', name: 'Garra de Metal', type: MoveType.ATTACK, category: 'physical', power: 50, maxPp: 35, icon: '⚙️', element: Types.STEEL },
    'steel_wing': { id: 'steel_wing', name: 'Asa de Aço', type: MoveType.ATTACK, category: 'physical', power: 70, maxPp: 25, icon: '🛡️', element: Types.STEEL },
    'iron_head': { id: 'iron_head', name: 'Cabeça de Ferro', type: MoveType.ATTACK, category: 'physical', power: 80, maxPp: 15, icon: '🤕', element: Types.STEEL },
    'flash_cannon': { id: 'flash_cannon', name: 'Canhão de Luz', type: MoveType.ATTACK, category: 'special', power: 80, maxPp: 10, icon: '🔦', element: Types.STEEL },
    'meteor_mash': { id: 'meteor_mash', name: 'Meteoro Esmagador', type: MoveType.ATTACK, category: 'physical', power: 90, maxPp: 10, icon: '☄️', element: Types.STEEL },

    // --- FAIRY ---
    'disarming_voice': { id: 'disarming_voice', name: 'Voz Desarmante', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 15, icon: '🎤', element: Types.FAIRY },
    'fairy_wind': { id: 'fairy_wind', name: 'Vento de Fada', type: MoveType.ATTACK, category: 'special', power: 40, maxPp: 30, icon: '🧚', element: Types.FAIRY },
    'dazzling_gleam': { id: 'dazzling_gleam', name: 'Brilho Deslumbrante', type: MoveType.ATTACK, category: 'special', power: 80, maxPp: 10, icon: '✨', element: Types.FAIRY },
    'play_rough': { id: 'play_rough', name: 'Brincadeira Pesada', type: MoveType.ATTACK, category: 'physical', power: 90, maxPp: 10, icon: '🤼', element: Types.FAIRY },
    'moonblast': { id: 'moonblast', name: 'Explosão Lunar', type: MoveType.ATTACK, category: 'special', power: 95, maxPp: 15, icon: '🌑', element: Types.FAIRY },

    // --- HEAL/STATUS ---
    'rest': { id: 'rest', name: 'Descansar', type: MoveType.HEAL, category: 'status', power: 50, maxPp: 10, icon: '💤' },
    'recover': { id: 'recover', name: 'Recuperar', type: MoveType.HEAL, category: 'status', power: 50, maxPp: 10, icon: '♻️' },
    'quick_heal': { id: 'quick_heal', name: 'Cura Rápida', type: MoveType.HEAL, category: 'status', power: 50, maxPp: 10, icon: '💚' },
    'mega_heal': { id: 'mega_heal', name: 'Mega Cura', type: MoveType.HEAL, category: 'status', power: 100, maxPp: 5, icon: '🧪' },
    'synthesis': { id: 'synthesis', name: 'Síntese', type: MoveType.HEAL, category: 'status', power: 70, maxPp: 5, icon: '☀️' },
    'roost': { id: 'roost', name: 'Pouso', type: MoveType.HEAL, category: 'status', power: 60, maxPp: 10, icon: '🪶' },
    
    // --- DEFEND/STATUS ---
    'protect': { id: 'protect', name: 'Proteger', type: MoveType.DEFEND, category: 'status', power: 0, maxPp: 10, icon: '✋' },
    'iron_defense': { id: 'iron_defense', name: 'Defesa de Ferro', type: MoveType.DEFEND, category: 'status', power: 0, maxPp: 15, icon: '🛡️' },
    'harden': { id: 'harden', name: 'Endurecer', type: MoveType.DEFEND, category: 'status', power: 0, maxPp: 30, icon: '🧱' },
    'barrier': { id: 'barrier', name: 'Barreira', type: MoveType.DEFEND, category: 'status', power: 0, maxPp: 20, icon: '🚧' }
};

function getXpForNextLevel(level) {
    const BASE = 30;
    const EXPONENT = 1.4;
    return Math.max(10, Math.floor(BASE * Math.pow(Math.max(1, level), EXPONENT)));
}

function getTypeEffectiveness(atkType, defType) {
    if (!TypeChart[atkType]) return 1;
    const val = TypeChart[atkType][defType];
    return val === undefined ? 1 : val;
}

module.exports = { 
    EntityType, 
    MoveType, 
    EffectType, 
    TypeChart, 
    getTypeEffectiveness, 
    MOVES_LIBRARY, 
    getXpForNextLevel 
};
