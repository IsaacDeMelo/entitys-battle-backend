const EntityType = { 
    BEAST: 'beast',      // Natural/Physical creatures (Normal/Fighter)
    FLAME: 'flame',      // Fire elements
    AQUA: 'aqua',        // Water/Ice elements
    FOREST: 'forest',    // Nature/Plants/Insects
    SKY: 'sky',          // Air/Wind/Lightning
    EARTH: 'earth',      // Ground/Rock/Minerals
    MYSTIC: 'mystic',    // Magic/Psychic/Fairy
    SHADOW: 'shadow',    // Dark/Ghost/Undead
    METAL: 'metal',      // Steel/Machine
    VENOM: 'venom',      // Poison/Toxic
    // Pokémon types (Gen 1+)
    NORMAL: 'normal',
    FIRE: 'fire',
    WATER: 'water',
    GRASS: 'grass',
    ELECTRIC: 'electric',
    ICE: 'ice',
    FIGHTING: 'fighting',
    POISON: 'poison',
    GROUND: 'ground',
    FLYING: 'flying',
    PSYCHIC: 'psychic',
    BUG: 'bug',
    ROCK: 'rock',
    GHOST: 'ghost',
    DRAGON: 'dragon',
    DARK: 'dark',
    STEEL: 'steel',
    FAIRY: 'fairy'
};

const MoveType = { ATTACK: 'attack', HEAL: 'heal', DEFEND: 'defend' };
const EffectType = { DOT: 'dot' }; 

const TypeChart = {
    // BEAST: Strong against Earth (trampling), weak to Metal (weapons) and Mystic (magic)
    [EntityType.BEAST]: { 
        [EntityType.EARTH]: 2, 
        [EntityType.METAL]: 0.5, 
        [EntityType.MYSTIC]: 0.5,
        [EntityType.SHADOW]: 0.5 
    },
    
    // FLAME: Strong against Forest and Metal (melts), weak to Aqua and Earth (smothered)
    [EntityType.FLAME]: { 
        [EntityType.FOREST]: 2, 
        [EntityType.METAL]: 2,
        [EntityType.FLAME]: 0.5,
        [EntityType.AQUA]: 0.5, 
        [EntityType.EARTH]: 0.5 
    },
    
    // AQUA: Strong against Flame and Earth (erosion), weak to Forest (absorbs) and Sky (evaporates)
    [EntityType.AQUA]: { 
        [EntityType.FLAME]: 2, 
        [EntityType.EARTH]: 2,
        [EntityType.AQUA]: 0.5,
        [EntityType.FOREST]: 0.5, 
        [EntityType.SKY]: 0.5 
    },
    
    // FOREST: Strong against Aqua (absorbs) and Earth (roots), weak to Flame, Venom, and Sky
    [EntityType.FOREST]: { 
        [EntityType.AQUA]: 2, 
        [EntityType.EARTH]: 2,
        [EntityType.FOREST]: 0.5,
        [EntityType.FLAME]: 0.5, 
        [EntityType.VENOM]: 0.5,
        [EntityType.SKY]: 0.5,
        [EntityType.METAL]: 0.5 
    },
    
    // SKY: Strong against Forest (wind cuts), Beast (aerial advantage), Aqua (evaporate), weak to Earth (grounded)
    [EntityType.SKY]: { 
        [EntityType.FOREST]: 2,
        [EntityType.BEAST]: 2,
        [EntityType.SKY]: 0.5,
        [EntityType.EARTH]: 0.5, 
        [EntityType.METAL]: 0.5 
    },
    
    // EARTH: Strong against Flame (smothers), Metal (ores), Sky (gravity), Venom (absorbs), weak to Aqua, Forest
    [EntityType.EARTH]: { 
        [EntityType.FLAME]: 2, 
        [EntityType.METAL]: 2,
        [EntityType.SKY]: 2,
        [EntityType.VENOM]: 2,
        [EntityType.AQUA]: 0.5, 
        [EntityType.FOREST]: 0.5
    },
    
    // MYSTIC: Strong against Beast (magic vs physical), Venom (purifies), weak to Shadow and Metal
    [EntityType.MYSTIC]: { 
        [EntityType.BEAST]: 2, 
        [EntityType.VENOM]: 2,
        [EntityType.MYSTIC]: 0.5,
        [EntityType.SHADOW]: 0.5, 
        [EntityType.METAL]: 0.5 
    },
    
    // SHADOW: Strong against Mystic (dark magic), weak to itself and Mystic light
    [EntityType.SHADOW]: { 
        [EntityType.MYSTIC]: 2, 
        [EntityType.BEAST]: 0.5,
        [EntityType.SHADOW]: 0.5
    },
    
    // METAL: Strong against Beast (weapons), Mystic (science vs magic), Earth (ore), weak to Flame, Aqua
    [EntityType.METAL]: { 
        [EntityType.BEAST]: 2, 
        [EntityType.MYSTIC]: 2,
        [EntityType.EARTH]: 2,
        [EntityType.FLAME]: 0.5, 
        [EntityType.METAL]: 0.5,
        [EntityType.AQUA]: 0.5 
    },
    
    // VENOM: Strong against Forest (poison plants), Beast (toxins), Mystic (corrupts), weak to Earth (absorbs), Shadow
    [EntityType.VENOM]: { 
        [EntityType.FOREST]: 2, 
        [EntityType.VENOM]: 0.5,
        [EntityType.EARTH]: 0.5, 
        [EntityType.SHADOW]: 0.5 
    },

    // === POKÉMON TYPE CHART (Gen 1) ===
    [EntityType.NORMAL]: {
        [EntityType.ROCK]: 0.5,
        [EntityType.GHOST]: 0,
        [EntityType.STEEL]: 0.5
    },
    [EntityType.FIRE]: {
        [EntityType.FIRE]: 0.5,
        [EntityType.WATER]: 0.5,
        [EntityType.GRASS]: 2,
        [EntityType.ICE]: 2,
        [EntityType.BUG]: 2,
        [EntityType.ROCK]: 0.5,
        [EntityType.DRAGON]: 0.5,
        [EntityType.STEEL]: 2
    },
    [EntityType.WATER]: {
        [EntityType.FIRE]: 2,
        [EntityType.WATER]: 0.5,
        [EntityType.GRASS]: 0.5,
        [EntityType.GROUND]: 2,
        [EntityType.ROCK]: 2,
        [EntityType.DRAGON]: 0.5
    },
    [EntityType.GRASS]: {
        [EntityType.FIRE]: 0.5,
        [EntityType.WATER]: 2,
        [EntityType.GRASS]: 0.5,
        [EntityType.POISON]: 0.5,
        [EntityType.GROUND]: 2,
        [EntityType.FLYING]: 0.5,
        [EntityType.BUG]: 0.5,
        [EntityType.ROCK]: 2,
        [EntityType.DRAGON]: 0.5,
        [EntityType.STEEL]: 0.5
    },
    [EntityType.ELECTRIC]: {
        [EntityType.WATER]: 2,
        [EntityType.GRASS]: 0.5,
        [EntityType.ELECTRIC]: 0.5,
        [EntityType.GROUND]: 0,
        [EntityType.FLYING]: 2,
        [EntityType.DRAGON]: 0.5,
        [EntityType.STEEL]: 0.5
    },
    [EntityType.ICE]: {
        [EntityType.FIRE]: 0.5,
        [EntityType.WATER]: 0.5,
        [EntityType.GRASS]: 2,
        [EntityType.ICE]: 0.5,
        [EntityType.GROUND]: 2,
        [EntityType.FLYING]: 2,
        [EntityType.DRAGON]: 2,
        [EntityType.STEEL]: 0.5
    },
    [EntityType.FIGHTING]: {
        [EntityType.NORMAL]: 2,
        [EntityType.ICE]: 2,
        [EntityType.POISON]: 0.5,
        [EntityType.FLYING]: 0.5,
        [EntityType.PSYCHIC]: 0.5,
        [EntityType.BUG]: 0.5,
        [EntityType.ROCK]: 2,
        [EntityType.GHOST]: 0,
        [EntityType.DARK]: 0.5,
        [EntityType.STEEL]: 2,
        [EntityType.FAIRY]: 0.5
    },
    [EntityType.POISON]: {
        [EntityType.GRASS]: 2,
        [EntityType.POISON]: 0.5,
        [EntityType.GROUND]: 0.5,
        [EntityType.ROCK]: 0.5,
        [EntityType.GHOST]: 0.5,
        [EntityType.STEEL]: 0,
        [EntityType.FAIRY]: 2
    },
    [EntityType.GROUND]: {
        [EntityType.FIRE]: 2,
        [EntityType.ELECTRIC]: 2,
        [EntityType.GRASS]: 0.5,
        [EntityType.POISON]: 2,
        [EntityType.FLYING]: 0,
        [EntityType.BUG]: 0.5,
        [EntityType.ROCK]: 2,
        [EntityType.STEEL]: 2
    },
    [EntityType.FLYING]: {
        [EntityType.GRASS]: 2,
        [EntityType.ELECTRIC]: 0.5,
        [EntityType.FIGHTING]: 2,
        [EntityType.BUG]: 2,
        [EntityType.ROCK]: 0.5,
        [EntityType.STEEL]: 0.5
    },
    [EntityType.PSYCHIC]: {
        [EntityType.FIGHTING]: 2,
        [EntityType.POISON]: 2,
        [EntityType.PSYCHIC]: 0.5,
        [EntityType.DARK]: 0,
        [EntityType.STEEL]: 0.5
    },
    [EntityType.BUG]: {
        [EntityType.FIRE]: 0.5,
        [EntityType.GRASS]: 2,
        [EntityType.FIGHTING]: 0.5,
        [EntityType.POISON]: 0.5,
        [EntityType.FLYING]: 0.5,
        [EntityType.PSYCHIC]: 2,
        [EntityType.GHOST]: 0.5,
        [EntityType.DARK]: 2,
        [EntityType.STEEL]: 0.5,
        [EntityType.FAIRY]: 0.5
    },
    [EntityType.ROCK]: {
        [EntityType.FIRE]: 2,
        [EntityType.ICE]: 2,
        [EntityType.FIGHTING]: 0.5,
        [EntityType.GROUND]: 0.5,
        [EntityType.FLYING]: 2,
        [EntityType.BUG]: 2,
        [EntityType.STEEL]: 0.5
    },
    [EntityType.GHOST]: {
        [EntityType.NORMAL]: 0,
        [EntityType.PSYCHIC]: 2,
        [EntityType.GHOST]: 2,
        [EntityType.DARK]: 0.5
    },
    [EntityType.DRAGON]: {
        [EntityType.DRAGON]: 2,
        [EntityType.STEEL]: 0.5,
        [EntityType.FAIRY]: 0
    },
    [EntityType.DARK]: {
        [EntityType.FIGHTING]: 0.5,
        [EntityType.PSYCHIC]: 2,
        [EntityType.GHOST]: 2,
        [EntityType.DARK]: 0.5,
        [EntityType.FAIRY]: 0.5
    },
    [EntityType.STEEL]: {
        [EntityType.FIRE]: 0.5,
        [EntityType.WATER]: 0.5,
        [EntityType.ELECTRIC]: 0.5,
        [EntityType.ICE]: 2,
        [EntityType.ROCK]: 2,
        [EntityType.STEEL]: 0.5,
        [EntityType.FAIRY]: 2
    },
    [EntityType.FAIRY]: {
        [EntityType.FIRE]: 0.5,
        [EntityType.FIGHTING]: 2,
        [EntityType.POISON]: 0.5,
        [EntityType.DRAGON]: 2,
        [EntityType.DARK]: 2,
        [EntityType.STEEL]: 0.5
    }
};

const MOVES_LIBRARY = {
    // --- BEAST (Physical / Natural) ---
    'strike': { id: 'strike', name: 'Pancada Valente', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '💥', element: EntityType.BEAST },
    'claw_swipe': { id: 'claw_swipe', name: 'Arranhão Feroz', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '💅', element: EntityType.BEAST },
    'headbutt': { id: 'headbutt', name: 'Cabeçada Trovão', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '👊', element: EntityType.BEAST },
    'rush': { id: 'rush', name: 'Investida Relâmpago', type: MoveType.ATTACK, category: 'physical', power: 45, cost: 2, icon: '⚡', element: EntityType.BEAST },
    'rend': { id: 'rend', name: 'Garras do Caos', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🔪', element: EntityType.BEAST },
    'star_burst': { id: 'star_burst', name: 'Explosão Estelar', type: MoveType.ATTACK, category: 'special', power: 60, cost: 3, icon: '⭐', element: EntityType.BEAST },
    'triple_strike': { id: 'triple_strike', name: 'Trinca Brutal', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '🔺', element: EntityType.BEAST },
    'primal_roar': { id: 'primal_roar', name: 'Rugido Ancestral', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '🦁', element: EntityType.BEAST },
    'rampage': { id: 'rampage', name: 'Fúria Desenfreada', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 6, icon: '💥', element: EntityType.BEAST },
    'body_crash': { id: 'body_crash', name: 'Queda de Titã', type: MoveType.ATTACK, category: 'physical', power: 85, cost: 4, icon: '🏋️', element: EntityType.BEAST },

    // --- FLAME (Fire) ---
    'spark_shot': { id: 'spark_shot', name: 'Faísca Foguete', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🔥', element: EntityType.FLAME },
    'inferno_blast': { id: 'inferno_blast', name: 'Rajada do Inferno', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🌋', element: EntityType.FLAME },
    'blazing_fist': { id: 'blazing_fist', name: 'Soco Incandescente', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '🥊', element: EntityType.FLAME },
    'flame_spiral': { id: 'flame_spiral', name: 'Espiral de Brasa', type: MoveType.ATTACK, category: 'special', power: 35, cost: 1, icon: '🌀', element: EntityType.FLAME },
    'phoenix_charge': { id: 'phoenix_charge', name: 'Mergulho da Fênix', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 6, icon: '🧨', element: EntityType.FLAME },
    'scorching_wave': { id: 'scorching_wave', name: 'Onda Carbonizante', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '♨️', element: EntityType.FLAME },
    'magma_burst': { id: 'magma_burst', name: 'Ruptura Vulcânica', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌋', element: EntityType.FLAME },
    'burning_wheel': { id: 'burning_wheel', name: 'Roda Flamejante', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🎡', element: EntityType.FLAME },

    // --- AQUA (Water/Ice) ---
    'stream': { id: 'stream', name: "Jato D'Água", type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🔫', element: EntityType.AQUA },
    'bubble_pop': { id: 'bubble_pop', name: 'Bolha Estourada', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🫧', element: EntityType.AQUA },
    'tidal_rush': { id: 'tidal_rush', name: 'Investida da Maré', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '🚤', element: EntityType.AQUA },
    'frost_beam': { id: 'frost_beam', name: 'Raio Congelante', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '❄️', element: EntityType.AQUA },
    'cascade': { id: 'cascade', name: 'Cascata Brutal', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '🌊', element: EntityType.AQUA },
    'wave_rider': { id: 'wave_rider', name: 'Surfista da Onda', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🏄', element: EntityType.AQUA },
    'whirlpool_tail': { id: 'whirlpool_tail', name: 'Cauda Redemoinho', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '🐋', element: EntityType.AQUA },
    'tidal_surge': { id: 'tidal_surge', name: 'Fúria da Maré', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '💧', element: EntityType.AQUA },
    'ice_shard': { id: 'ice_shard', name: 'Estilhaço de Gelo', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '🧊', element: EntityType.AQUA },
    'blizzard_storm': { id: 'blizzard_storm', name: 'Tempestade de Neve', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌬️', element: EntityType.AQUA },

    // --- FOREST (Nature/Plants/Insects) ---
    'root_lash': { id: 'root_lash', name: 'Chicote de Raiz', type: MoveType.ATTACK, category: 'physical', power: 45, cost: 2, icon: '🍃', element: EntityType.FOREST },
    'leaf_cutter': { id: 'leaf_cutter', name: 'Lâmina Folha', type: MoveType.ATTACK, category: 'physical', power: 55, cost: 2, icon: '✂️', element: EntityType.FOREST },
    'life_drain': { id: 'life_drain', name: 'Dreno Vital', type: MoveType.ATTACK, category: 'special', power: 60, cost: 3, icon: '🥤', element: EntityType.FOREST },
    'spore_bomb': { id: 'spore_bomb', name: 'Bomba de Esporos', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '💣', element: EntityType.FOREST },
    'nature_pulse': { id: 'nature_pulse', name: 'Pulso da Mata', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🟢', element: EntityType.FOREST },
    'thorn_blade': { id: 'thorn_blade', name: 'Lâmina de Espinhos', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '⚔️', element: EntityType.FOREST },
    'photon_ray': { id: 'photon_ray', name: 'Raio Fotônico', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '☀️', element: EntityType.FOREST },
    'petal_storm': { id: 'petal_storm', name: 'Vendaval de Pétalas', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '🌸', element: EntityType.FOREST },
    'wing_slice': { id: 'wing_slice', name: 'Corte Alado', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '⚔️', element: EntityType.FOREST },
    'swarm_attack': { id: 'swarm_attack', name: 'Enxame Furioso', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🐝', element: EntityType.FOREST },

    // --- SKY (Air/Lightning) ---
    'sky_bolt': { id: 'sky_bolt', name: 'Raio do Céu', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '⚡', element: EntityType.SKY },
    'wind_gust': { id: 'wind_gust', name: 'Sopro Travesso', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '💨', element: EntityType.SKY },
    'static_strike': { id: 'static_strike', name: 'Choque Estático', type: MoveType.ATTACK, category: 'physical', power: 65, cost: 3, icon: '✨', element: EntityType.SKY },
    'wing_bash': { id: 'wing_bash', name: 'Asa Demolidora', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🦅', element: EntityType.SKY },
    'voltage_fist': { id: 'voltage_fist', name: 'Soco de Voltagem', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '🤜', element: EntityType.SKY },
    'lightning_strike': { id: 'lightning_strike', name: 'Castigo do Trovão', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🌩️', element: EntityType.SKY },
    'tempest': { id: 'tempest', name: 'Fúria da Tempestade', type: MoveType.ATTACK, category: 'special', power: 110, cost: 5, icon: '⛈️', element: EntityType.SKY },
    'thunder_crash': { id: 'thunder_crash', name: 'Estrondo Celestial', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '⚡️', element: EntityType.SKY },
    'aerial_blade': { id: 'aerial_blade', name: 'Lâmina do Vento', type: MoveType.ATTACK, category: 'special', power: 75, cost: 3, icon: '🌬️', element: EntityType.SKY },
    'cyclone': { id: 'cyclone', name: 'Ciclone Giratório', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌪️', element: EntityType.SKY },

    // --- EARTH (Ground/Rock) ---
    'dirt_toss': { id: 'dirt_toss', name: 'Poeira na Cara', type: MoveType.ATTACK, category: 'special', power: 20, cost: 1, icon: '💩', element: EntityType.EARTH },
    'mud_blast': { id: 'mud_blast', name: 'Rajada de Lama', type: MoveType.ATTACK, category: 'special', power: 55, cost: 2, icon: '🔫', element: EntityType.EARTH },
    'tremor': { id: 'tremor', name: 'Tremor Brutamontes', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🚜', element: EntityType.EARTH },
    'boulder_throw': { id: 'boulder_throw', name: 'Pedrada Colossal', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '🪨', element: EntityType.EARTH },
    'tunnel_strike': { id: 'tunnel_strike', name: 'Golpe Subterrâneo', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '⛏️', element: EntityType.EARTH },
    'terra_force': { id: 'terra_force', name: 'Força da Terra', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🌋', element: EntityType.EARTH },
    'quake': { id: 'quake', name: 'Abalo Sísmico', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '📉', element: EntityType.EARTH },
    'rock_slide': { id: 'rock_slide', name: 'Avalanche de Pedras', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '⛰️', element: EntityType.EARTH },
    'crystal_shard': { id: 'crystal_shard', name: 'Estilhaço Cristalino', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '💎', element: EntityType.EARTH },
    'stone_spear': { id: 'stone_spear', name: 'Lança de Granito', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '🔪', element: EntityType.EARTH },

    // --- MYSTIC (Magic/Psychic/Fairy) ---
    'mind_shock': { id: 'mind_shock', name: 'Estalo Mental', type: MoveType.ATTACK, category: 'special', power: 50, cost: 2, icon: '😵', element: EntityType.MYSTIC },
    'mystic_ray': { id: 'mystic_ray', name: 'Raio Místico', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '🌈', element: EntityType.MYSTIC },
    'soul_cut': { id: 'soul_cut', name: 'Corte da Alma', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🔪', element: EntityType.MYSTIC },
    'spirit_bash': { id: 'spirit_bash', name: 'Murro Espiritual', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '💆', element: EntityType.MYSTIC },
    'telepathy': { id: 'telepathy', name: 'Sussurro Psíquico', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🧠', element: EntityType.MYSTIC },
    'oracle_vision': { id: 'oracle_vision', name: 'Visão do Oráculo', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '🔮', element: EntityType.MYSTIC },
    'charm_voice': { id: 'charm_voice', name: 'Voz Encantadora', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🎤', element: EntityType.MYSTIC },
    'fairy_spark': { id: 'fairy_spark', name: 'Faísca de Fada', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🧚', element: EntityType.MYSTIC },
    'radiant_burst': { id: 'radiant_burst', name: 'Clarão Radiante', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '✨', element: EntityType.MYSTIC },
    'moon_strike': { id: 'moon_strike', name: 'Golpe Lunar', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌑', element: EntityType.MYSTIC },

    // --- SHADOW (Dark/Ghost) ---
    'dark_bite': { id: 'dark_bite', name: 'Mordida das Trevas', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🦷', element: EntityType.SHADOW },
    'ghost_touch': { id: 'ghost_touch', name: 'Toque Fantasma', type: MoveType.ATTACK, category: 'physical', power: 30, cost: 1, icon: '👅', element: EntityType.SHADOW },
    'shade_sneak': { id: 'shade_sneak', name: 'Espreita Sombria', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '👤', element: EntityType.SHADOW },
    'curse': { id: 'curse', name: 'Praga Malandra', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '🧙', element: EntityType.SHADOW },
    'night_claw': { id: 'night_claw', name: 'Garra da Noite', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '💅', element: EntityType.SHADOW },
    'void_sphere': { id: 'void_sphere', name: 'Esfera do Vazio', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '🟣', element: EntityType.SHADOW },
    'phantom_strike': { id: 'phantom_strike', name: 'Investida Fantasma', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '👻', element: EntityType.SHADOW },
    'darkness_pulse': { id: 'darkness_pulse', name: 'Pulso da Escuridão', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '⚫', element: EntityType.SHADOW },
    'howl': { id: 'howl', name: 'Uivo Assombrado', type: MoveType.ATTACK, category: 'special', power: 55, cost: 2, icon: '🤬', element: EntityType.SHADOW },
    'shadow_ambush': { id: 'shadow_ambush', name: 'Emboscada Sombria', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '👊', element: EntityType.SHADOW },

    // --- METAL (Steel/Machine) ---
    'rapid_punch': { id: 'rapid_punch', name: 'Metralhadora de Socos', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '🚅', element: EntityType.METAL },
    'steel_claw': { id: 'steel_claw', name: 'Garra de Aço', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '⚙️', element: EntityType.METAL },
    'iron_wing': { id: 'iron_wing', name: 'Asa de Ferro', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🛡️', element: EntityType.METAL },
    'steel_head': { id: 'steel_head', name: 'Cabeçada de Aço', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '🤕', element: EntityType.METAL },
    'photon_cannon': { id: 'photon_cannon', name: 'Canhão de Fótons', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '🔦', element: EntityType.METAL },
    'comet_strike': { id: 'comet_strike', name: 'Cometa de Impacto', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '☄️', element: EntityType.METAL },

    // --- VENOM (Poison/Toxic) ---
    'toxic_sting': { id: 'toxic_sting', name: 'Picada Tóxica', type: MoveType.ATTACK, category: 'physical', power: 15, cost: 1, icon: '💉', element: EntityType.VENOM },
    'acid_spray': { id: 'acid_spray', name: 'Jato de Ácido', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🧪', element: EntityType.VENOM },
    'toxic_wave': { id: 'toxic_wave', name: 'Onda Peçonhenta', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '💩', element: EntityType.VENOM },
    'venom_fang': { id: 'venom_fang', name: 'Presa Venenosa', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '☠️', element: EntityType.VENOM },
    'poison_burst': { id: 'poison_burst', name: 'Estouro Tóxico', type: MoveType.ATTACK, category: 'special', power: 85, cost: 4, icon: '💣', element: EntityType.VENOM },
    'toxic_shot': { id: 'toxic_shot', name: 'Disparo Contaminante', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '🗑️', element: EntityType.VENOM },

    // --- STATUS (HEAL & DEFEND) ---
    'quick_mend': { id: 'quick_mend', name: 'Cura Ligeira', type: MoveType.HEAL, category: 'status', power: 50, cost: 3, icon: '💚', element: EntityType.MYSTIC },
    'full_restore': { id: 'full_restore', name: 'Cura Completa', type: MoveType.HEAL, category: 'status', power: 100, cost: 5, icon: '🧪', element: EntityType.MYSTIC },
    'regenerate': { id: 'regenerate', name: 'Renovação Verde', type: MoveType.HEAL, category: 'status', power: 80, cost: 4, icon: '♻️', element: EntityType.FOREST },
    'photosynthesis': { id: 'photosynthesis', name: 'Banho de Sol', type: MoveType.HEAL, category: 'status', power: 70, cost: 4, icon: '☀️', element: EntityType.FOREST },
    'rest': { id: 'rest', name: 'Soneca Revigorante', type: MoveType.HEAL, category: 'status', power: 60, cost: 0, icon: '🪶', element: EntityType.MYSTIC },
    'fortify': { id: 'fortify', name: 'Couraça Reforçada', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🛡️', element: EntityType.METAL },
    'shield': { id: 'shield', name: 'Escudo Valente', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '✋', element: EntityType.METAL },
    'harden': { id: 'harden', name: 'Pele de Pedra', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🧱', element: EntityType.EARTH },
    'barrier': { id: 'barrier', name: 'Muralha de Aço', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '🚧', element: EntityType.METAL },

    // === POKÉMON MOVES (Gen 1) ===
    // --- NORMAL ---
    'tackle': { id: 'tackle', name: 'Investida', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '💥', element: EntityType.NORMAL },
    'scratch': { id: 'scratch', name: 'Arranhão', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '💅', element: EntityType.NORMAL },
    'quick_attack': { id: 'quick_attack', name: 'Ataque Rápido', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '⚡', element: EntityType.NORMAL },
    'slam': { id: 'slam', name: 'Golpe Brutal', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 3, icon: '💪', element: EntityType.NORMAL },
    'body_slam': { id: 'body_slam', name: 'Golpe Corpo', type: MoveType.ATTACK, category: 'physical', power: 85, cost: 4, icon: '🏋️', element: EntityType.NORMAL },
    'hyper_beam': { id: 'hyper_beam', name: 'Hiperrai', type: MoveType.ATTACK, category: 'special', power: 150, cost: 6, icon: '💫', element: EntityType.NORMAL },
    'swift': { id: 'swift', name: 'Cometa', type: MoveType.ATTACK, category: 'special', power: 60, cost: 2, icon: '⭐', element: EntityType.NORMAL },
    'double_edge': { id: 'double_edge', name: 'Fundo do Poço', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 5, icon: '🔄', element: EntityType.NORMAL },
    'cut': { id: 'cut', name: 'Corte', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '✂️', element: EntityType.NORMAL },
    'strength': { id: 'strength', name: 'Força', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 3, icon: '💪', element: EntityType.NORMAL },
    'pay_day': { id: 'pay_day', name: 'Dia de Pagamento', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '💰', element: EntityType.NORMAL },
    'fury_swipes': { id: 'fury_swipes', name: 'Golpes Furtivos', type: MoveType.ATTACK, category: 'physical', power: 18, cost: 1, icon: '🐾', element: EntityType.NORMAL },
    'skull_bash': { id: 'skull_bash', name: 'Cabeçada', type: MoveType.ATTACK, category: 'physical', power: 130, cost: 5, icon: '💀', element: EntityType.NORMAL },
    'razor_wind': { id: 'razor_wind', name: 'Lâmina de Vento', type: MoveType.ATTACK, category: 'special', power: 80, cost: 3, icon: '🌬️', element: EntityType.NORMAL },
    'vine_whip': { id: 'vine_whip', name: 'Chicote de Vinha', type: MoveType.ATTACK, category: 'physical', power: 45, cost: 1, icon: '🌿', element: EntityType.NORMAL },

    // --- FIRE ---
    'ember': { id: 'ember', name: 'Brasa', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🔥', element: EntityType.FIRE },
    'fire_punch': { id: 'fire_punch', name: 'Soco de Fogo', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '🥊', element: EntityType.FIRE },
    'flamethrower': { id: 'flamethrower', name: 'Lança-Chamas', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🔥', element: EntityType.FIRE },
    'fire_blast': { id: 'fire_blast', name: 'Explosão de Fogo', type: MoveType.ATTACK, category: 'special', power: 110, cost: 5, icon: '💥', element: EntityType.FIRE },
    'fire_spin': { id: 'fire_spin', name: 'Redemoinho de Fogo', type: MoveType.ATTACK, category: 'special', power: 35, cost: 1, icon: '🌀', element: EntityType.FIRE },

    // --- WATER ---
    'water_gun': { id: 'water_gun', name: 'Pistola d\'Água', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🔫', element: EntityType.WATER },
    'bubble': { id: 'bubble', name: 'Bolha', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🫧', element: EntityType.WATER },
    'bubble_beam': { id: 'bubble_beam', name: 'Raio de Bolhas', type: MoveType.ATTACK, category: 'special', power: 65, cost: 2, icon: '🫧', element: EntityType.WATER },
    'surf': { id: 'surf', name: 'Surf', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🌊', element: EntityType.WATER },
    'hydro_pump': { id: 'hydro_pump', name: 'Hidrobomba', type: MoveType.ATTACK, category: 'special', power: 110, cost: 5, icon: '💧', element: EntityType.WATER },
    'waterfall': { id: 'waterfall', name: 'Cachoeira', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 3, icon: '瀑布', element: EntityType.WATER },

    // --- GRASS ---
    'razor_leaf': { id: 'razor_leaf', name: 'Lâmina de Folha', type: MoveType.ATTACK, category: 'physical', power: 55, cost: 2, icon: '🍃', element: EntityType.GRASS },
    'solar_beam': { id: 'solar_beam', name: 'Raio Solar', type: MoveType.ATTACK, category: 'special', power: 120, cost: 5, icon: '☀️', element: EntityType.GRASS },
    'mega_drain': { id: 'mega_drain', name: 'Dreno Mega', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🥤', element: EntityType.GRASS },
    'absorb': { id: 'absorb', name: 'Absorver', type: MoveType.ATTACK, category: 'special', power: 20, cost: 1, icon: '🪥', element: EntityType.GRASS },
    'leech_seed': { id: 'leech_seed', name: 'Semente Suga', type: MoveType.ATTACK, category: 'status', power: 0, cost: 2, icon: '🌱', element: EntityType.GRASS },
    'spore': { id: 'spore', name: 'Esporo', type: MoveType.ATTACK, category: 'status', power: 0, cost: 2, icon: '🍄', element: EntityType.GRASS },
    'seed_bomb': { id: 'seed_bomb', name: 'Bomba de Sementes', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 3, icon: '💣', element: EntityType.GRASS },

    // --- ELECTRIC ---
    'thunder_shock': { id: 'thunder_shock', name: 'Choque do Trovão', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '⚡', element: EntityType.ELECTRIC },
    'thunderbolt': { id: 'thunderbolt', name: 'Raio', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '⚡', element: EntityType.ELECTRIC },
    'thunder': { id: 'thunder', name: 'Trovoada', type: MoveType.ATTACK, category: 'special', power: 110, cost: 5, icon: '🌩️', element: EntityType.ELECTRIC },
    'thunder_punch': { id: 'thunder_punch', name: 'Soco de Trovão', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '⚡', element: EntityType.ELECTRIC },

    // --- ICE ---
    'ice_shard': { id: 'ice_shard', name: 'Estilhaço de Gelo', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '🧊', element: EntityType.ICE },
    'ice_beam': { id: 'ice_beam', name: 'Raio de Gelo', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '❄️', element: EntityType.ICE },
    'blizzard': { id: 'blizzard', name: 'Nevasca', type: MoveType.ATTACK, category: 'special', power: 110, cost: 5, icon: '🌬️', element: EntityType.ICE },
    'ice_punch': { id: 'ice_punch', name: 'Soco de Gelo', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '🧊', element: EntityType.ICE },

    // --- FIGHTING ---
    'karate_chop': { id: 'karate_chop', name: 'Golpe de Karatê', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '🥋', element: EntityType.FIGHTING },
    'double_kick': { id: 'double_kick', name: 'Chute Duplo', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 2, icon: '🦵', element: EntityType.FIGHTING },
    'submission': { id: 'submission', name: 'Sumissão', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 3, icon: '🤲', element: EntityType.FIGHTING },
    'low_kick': { id: 'low_kick', name: 'Pé Baixo', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '🦶', element: EntityType.FIGHTING },
    'jump_kick': { id: 'jump_kick', name: 'Chute Pulado', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🦿', element: EntityType.FIGHTING },
    'high_jump_kick': { id: 'high_jump_kick', name: 'Chute Alto', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 4, icon: '🦿', element: EntityType.FIGHTING },
    'close_combat': { id: 'close_combat', name: 'Corpo a Corpo', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 5, icon: '👊', element: EntityType.FIGHTING },

    // --- POISON ---
    'poison_sting': { id: 'poison_sting', name: 'Ferrão Venenoso', type: MoveType.ATTACK, category: 'physical', power: 15, cost: 1, icon: '💉', element: EntityType.POISON },
    'sludge': { id: 'sludge', name: 'Lama Tóxica', type: MoveType.ATTACK, category: 'special', power: 65, cost: 2, icon: '🧪', element: EntityType.POISON },
    'toxic': { id: 'toxic', name: 'Tóxico', type: MoveType.ATTACK, category: 'status', power: 0, cost: 2, icon: '☠️', element: EntityType.POISON },
    'poison_gas': { id: 'poison_gas', name: 'Gás Venenoso', type: MoveType.ATTACK, category: 'status', power: 0, cost: 1, icon: '💨', element: EntityType.POISON },
    'acid': { id: 'acid', name: 'Ácido', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🧪', element: EntityType.POISON },

    // --- GROUND ---
    'dig': { id: 'dig', name: 'Escavar', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 3, icon: '⛏️', element: EntityType.GROUND },
    'earthquake': { id: 'earthquake', name: 'Terremoto', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '🌋', element: EntityType.GROUND },
    'bone_club': { id: 'bone_club', name: 'Osso de Clava', type: MoveType.ATTACK, category: 'physical', power: 65, cost: 2, icon: '🦴', element: EntityType.GROUND },
    'mud_slap': { id: 'mud_slap', name: 'Tapa de Lama', type: MoveType.ATTACK, category: 'special', power: 20, cost: 1, icon: '💩', element: EntityType.GROUND },
    'fissure': { id: 'fissure', name: 'Fissura', type: MoveType.ATTACK, category: 'physical', power: 150, cost: 6, icon: '📉', element: EntityType.GROUND },

    // --- FLYING ---
    'gust': { id: 'gust', name: 'Rajada', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '💨', element: EntityType.FLYING },
    'wing_attack': { id: 'wing_attack', name: 'Golpe de Asa', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 2, icon: '🦅', element: EntityType.FLYING },
    'fly': { id: 'fly', name: 'Voo', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '🕊️', element: EntityType.FLYING },
    'aerial_ace': { id: 'aerial_ace', name: 'Asa Aérea', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 2, icon: '✈️', element: EntityType.FLYING },
    'sky_attack': { id: 'sky_attack', name: 'Ataque Aéreo', type: MoveType.ATTACK, category: 'physical', power: 140, cost: 6, icon: '🛩️', element: EntityType.FLYING },
    'mirror_move': { id: 'mirror_move', name: 'Movimento Espelho', type: MoveType.ATTACK, category: 'status', power: 0, cost: 2, icon: '🪞', element: EntityType.FLYING },

    // --- PSYCHIC ---
    'confusion': { id: 'confusion', name: 'Confusão', type: MoveType.ATTACK, category: 'special', power: 50, cost: 2, icon: '😵', element: EntityType.PSYCHIC },
    'psychic': { id: 'psychic', name: 'Psíquico', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🧠', element: EntityType.PSYCHIC },
    'amnesia': { id: 'amnesia', name: 'Amnésia', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '🙈', element: EntityType.PSYCHIC },
    'light_screen': { id: 'light_screen', name: 'Tela de Luz', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '💡', element: EntityType.PSYCHIC },
    'reflect': { id: 'reflect', name: 'Reflexo', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '🪞', element: EntityType.PSYCHIC },

    // --- BUG ---
    'pin_missile': { id: 'pin_missile', name: 'Misseis de Alfinetes', type: MoveType.ATTACK, category: 'physical', power: 25, cost: 1, icon: '📌', element: EntityType.BUG },
    'string_shot': { id: 'string_shot', name: 'Tiro de Fio', type: MoveType.ATTACK, category: 'status', power: 0, cost: 1, icon: '🕸️', element: EntityType.BUG },
    'twineedle': { id: 'twineedle', name: 'Agulha Dupla', type: MoveType.ATTACK, category: 'physical', power: 25, cost: 1, icon: '🪡', element: EntityType.BUG },
    'leech_life': { id: 'leech_life', name: 'Vida Suga', type: MoveType.ATTACK, category: 'physical', power: 20, cost: 1, icon: '🦟', element: EntityType.BUG },

    // --- ROCK ---
    'rock_throw': { id: 'rock_throw', name: 'Arremesso de Pedra', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '🪨', element: EntityType.ROCK },
    'rock_slide': { id: 'rock_slide', name: 'Deslize de Pedra', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '⛰️', element: EntityType.ROCK },
    'sandstorm': { id: 'sandstorm', name: 'Tempestade de Areia', type: MoveType.ATTACK, category: 'status', power: 0, icon: '🌪️', cost: 2, element: EntityType.ROCK },

    // --- GHOST ---
    'lick': { id: 'lick', name: 'Lamber', type: MoveType.ATTACK, category: 'physical', power: 30, cost: 1, icon: '👅', element: EntityType.GHOST },
    'night_shade': { id: 'night_shade', name: 'Noite escura', type: MoveType.ATTACK, category: 'special', power: 50, cost: 2, icon: '🌙', element: EntityType.GHOST },
    'destiny_bond': { id: 'destiny_bond', name: 'Ligação do Destino', type: MoveType.ATTACK, category: 'status', power: 0, cost: 3, icon: '🪢', element: EntityType.GHOST },

    // --- DRAGON ---
    'dragon_rage': { id: 'dragon_rage', name: 'Fúria do Dragão', type: MoveType.ATTACK, category: 'special', power: 60, cost: 3, icon: '🐉', element: EntityType.DRAGON },
    'dragon_dance': { id: 'dragon_dance', name: 'Dança do Dragão', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '💃', element: EntityType.DRAGON },

    // --- DARK ---
    'bite': { id: 'bite', name: 'Mordida', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 2, icon: '🦷', element: EntityType.DARK },
    'dark_pulse': { id: 'dark_pulse', name: 'Pulso Negro', type: MoveType.ATTACK, category: 'special', power: 80, cost: 3, icon: '⚫', element: EntityType.DARK },
    'crunch': { id: 'crunch', name: 'Tritura', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 3, icon: '🦷', element: EntityType.DARK },

    // --- STEEL ---
    'metal_claw': { id: 'metal_claw', name: 'Garra de Metal', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '⚙️', element: EntityType.STEEL },
    'iron_tail': { id: 'iron_tail', name: 'Cauda de Ferro', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 4, icon: '🔩', element: EntityType.STEEL },
    'metal_sound': { id: 'metal_sound', name: 'Som Metálico', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🔔', element: EntityType.STEEL },
    'steel_wing': { id: 'steel_wing', name: 'Asa de Aço', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🛡️', element: EntityType.STEEL },

    // --- FAIRY ---
    'fairy_wind': { id: 'fairy_wind', name: 'Vento de Fada', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🧚', element: EntityType.FAIRY },
    'moonblast': { id: 'moonblast', name: 'Impacto Lunar', type: MoveType.ATTACK, category: 'special', power: 95, cost: 4, icon: '🌙', element: EntityType.FAIRY },
    'charm': { id: 'charm', name: 'Encanto', type: MoveType.ATTACK, category: 'status', power: 0, cost: 2, icon: '💕', element: EntityType.FAIRY },

    // --- POKÉMON STATUS ---
    'growl': { id: 'growl', name: 'Rugido', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '📢', element: EntityType.NORMAL },
    'tail_whip': { id: 'tail_whip', name: 'Chocalho de Cauda', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🐕', element: EntityType.NORMAL },
    'leer': { id: 'leer', name: 'Olhar Feroz', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '👁️', element: EntityType.NORMAL },
    'harden': { id: 'harden', name: 'Endurecer', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🧱', element: EntityType.NORMAL },
    'swords_dance': { id: 'swords_dance', name: 'Dança das Espadas', type: MoveType.DEFEND, category: 'status', power: 0, cost: 3, icon: '⚔️', element: EntityType.NORMAL }
};

function getXpForNextLevel(level) {
    // Nova fórmula: mais suave nos níveis iniciais e progressivamente mais íngreme.
    const BASE = 30;
    const EXPONENT = 1.4;
    return Math.max(10, Math.floor(BASE * Math.pow(Math.max(1, level), EXPONENT)));
}

function getTypeEffectiveness(atkType, defType) {
    // Proteção: Se algum dos tipos vier nulo ou indefinido, retorna dano normal
    if (!atkType || !defType) return 1;

    // Força ambos para minúsculo antes de buscar na tabela
    const atk = atkType.toLowerCase().trim(); // .trim() remove espaços extras "fire " -> "fire"
    const def = defType.toLowerCase().trim();

    if (!TypeChart[atk]) return 1;
    
    const val = TypeChart[atk][def];
    if (val === undefined) return 1;
    // Nerf: super efetivo era 2x e estava muito alto
    if (val === 2) return 1.5;
    return val;
}

module.exports = { EntityType, MoveType, EffectType, TypeChart, getTypeEffectiveness, MOVES_LIBRARY, getXpForNextLevel };
