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
    VENOM: 'venom'       // Poison/Toxic
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
    }
};

const MOVES_LIBRARY = {
    // --- BEAST (Physical / Natural) ---
    'strike': { id: 'strike', name: 'Strike', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '💥', element: EntityType.BEAST },
    'claw_swipe': { id: 'claw_swipe', name: 'Claw Swipe', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '💅', element: EntityType.BEAST },
    'headbutt': { id: 'headbutt', name: 'Headbutt', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '👊', element: EntityType.BEAST },
    'rush': { id: 'rush', name: 'Rush', type: MoveType.ATTACK, category: 'physical', power: 45, cost: 2, icon: '⚡', element: EntityType.BEAST },
    'rend': { id: 'rend', name: 'Rend', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🔪', element: EntityType.BEAST },
    'star_burst': { id: 'star_burst', name: 'Star Burst', type: MoveType.ATTACK, category: 'special', power: 60, cost: 3, icon: '⭐', element: EntityType.BEAST },
    'triple_strike': { id: 'triple_strike', name: 'Triple Strike', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '🔺', element: EntityType.BEAST },
    'primal_roar': { id: 'primal_roar', name: 'Primal Roar', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '🦁', element: EntityType.BEAST },
    'rampage': { id: 'rampage', name: 'Rampage', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 6, icon: '💥', element: EntityType.BEAST },
    'body_crash': { id: 'body_crash', name: 'Body Crash', type: MoveType.ATTACK, category: 'physical', power: 85, cost: 4, icon: '🏋️', element: EntityType.BEAST },

    // --- FLAME (Fire) ---
    'spark_shot': { id: 'spark_shot', name: 'Spark Shot', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🔥', element: EntityType.FLAME },
    'inferno_blast': { id: 'inferno_blast', name: 'Inferno Blast', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🌋', element: EntityType.FLAME },
    'blazing_fist': { id: 'blazing_fist', name: 'Blazing Fist', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '🥊', element: EntityType.FLAME },
    'flame_spiral': { id: 'flame_spiral', name: 'Flame Spiral', type: MoveType.ATTACK, category: 'special', power: 35, cost: 1, icon: '🌀', element: EntityType.FLAME },
    'phoenix_charge': { id: 'phoenix_charge', name: 'Phoenix Charge', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 6, icon: '🧨', element: EntityType.FLAME },
    'scorching_wave': { id: 'scorching_wave', name: 'Scorching Wave', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '♨️', element: EntityType.FLAME },
    'magma_burst': { id: 'magma_burst', name: 'Magma Burst', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌋', element: EntityType.FLAME },
    'burning_wheel': { id: 'burning_wheel', name: 'Burning Wheel', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🎡', element: EntityType.FLAME },

    // --- AQUA (Water/Ice) ---
    'stream': { id: 'stream', name: 'Stream', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🔫', element: EntityType.AQUA },
    'bubble_pop': { id: 'bubble_pop', name: 'Bubble Pop', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🫧', element: EntityType.AQUA },
    'tidal_rush': { id: 'tidal_rush', name: 'Tidal Rush', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '🚤', element: EntityType.AQUA },
    'frost_beam': { id: 'frost_beam', name: 'Frost Beam', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '❄️', element: EntityType.AQUA },
    'cascade': { id: 'cascade', name: 'Cascade', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '🌊', element: EntityType.AQUA },
    'wave_rider': { id: 'wave_rider', name: 'Wave Rider', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🏄', element: EntityType.AQUA },
    'whirlpool_tail': { id: 'whirlpool_tail', name: 'Whirlpool Tail', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '🐋', element: EntityType.AQUA },
    'tidal_surge': { id: 'tidal_surge', name: 'Tidal Surge', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '💧', element: EntityType.AQUA },
    'ice_shard': { id: 'ice_shard', name: 'Ice Shard', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '🧊', element: EntityType.AQUA },
    'blizzard_storm': { id: 'blizzard_storm', name: 'Blizzard Storm', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌬️', element: EntityType.AQUA },

    // --- FOREST (Nature/Plants/Insects) ---
    'root_lash': { id: 'root_lash', name: 'Root Lash', type: MoveType.ATTACK, category: 'physical', power: 45, cost: 2, icon: '🍃', element: EntityType.FOREST },
    'leaf_cutter': { id: 'leaf_cutter', name: 'Leaf Cutter', type: MoveType.ATTACK, category: 'physical', power: 55, cost: 2, icon: '✂️', element: EntityType.FOREST },
    'life_drain': { id: 'life_drain', name: 'Life Drain', type: MoveType.ATTACK, category: 'special', power: 60, cost: 3, icon: '🥤', element: EntityType.FOREST },
    'spore_bomb': { id: 'spore_bomb', name: 'Spore Bomb', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '💣', element: EntityType.FOREST },
    'nature_pulse': { id: 'nature_pulse', name: 'Nature Pulse', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🟢', element: EntityType.FOREST },
    'thorn_blade': { id: 'thorn_blade', name: 'Thorn Blade', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '⚔️', element: EntityType.FOREST },
    'photon_ray': { id: 'photon_ray', name: 'Photon Ray', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '☀️', element: EntityType.FOREST },
    'petal_storm': { id: 'petal_storm', name: 'Petal Storm', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '🌸', element: EntityType.FOREST },
    'wing_slice': { id: 'wing_slice', name: 'Wing Slice', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '⚔️', element: EntityType.FOREST },
    'swarm_attack': { id: 'swarm_attack', name: 'Swarm Attack', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🐝', element: EntityType.FOREST },

    // --- SKY (Air/Lightning) ---
    'sky_bolt': { id: 'sky_bolt', name: 'Sky Bolt', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '⚡', element: EntityType.SKY },
    'wind_gust': { id: 'wind_gust', name: 'Wind Gust', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '💨', element: EntityType.SKY },
    'static_strike': { id: 'static_strike', name: 'Static Strike', type: MoveType.ATTACK, category: 'physical', power: 65, cost: 3, icon: '✨', element: EntityType.SKY },
    'wing_bash': { id: 'wing_bash', name: 'Wing Bash', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🦅', element: EntityType.SKY },
    'voltage_fist': { id: 'voltage_fist', name: 'Voltage Fist', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '🤜', element: EntityType.SKY },
    'lightning_strike': { id: 'lightning_strike', name: 'Lightning Strike', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🌩️', element: EntityType.SKY },
    'tempest': { id: 'tempest', name: 'Tempest', type: MoveType.ATTACK, category: 'special', power: 110, cost: 5, icon: '⛈️', element: EntityType.SKY },
    'thunder_crash': { id: 'thunder_crash', name: 'Thunder Crash', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '⚡️', element: EntityType.SKY },
    'aerial_blade': { id: 'aerial_blade', name: 'Aerial Blade', type: MoveType.ATTACK, category: 'special', power: 75, cost: 3, icon: '🌬️', element: EntityType.SKY },
    'cyclone': { id: 'cyclone', name: 'Cyclone', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌪️', element: EntityType.SKY },

    // --- EARTH (Ground/Rock) ---
    'dirt_toss': { id: 'dirt_toss', name: 'Dirt Toss', type: MoveType.ATTACK, category: 'special', power: 20, cost: 1, icon: '💩', element: EntityType.EARTH },
    'mud_blast': { id: 'mud_blast', name: 'Mud Blast', type: MoveType.ATTACK, category: 'special', power: 55, cost: 2, icon: '🔫', element: EntityType.EARTH },
    'tremor': { id: 'tremor', name: 'Tremor', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🚜', element: EntityType.EARTH },
    'boulder_throw': { id: 'boulder_throw', name: 'Boulder Throw', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '🪨', element: EntityType.EARTH },
    'tunnel_strike': { id: 'tunnel_strike', name: 'Tunnel Strike', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '⛏️', element: EntityType.EARTH },
    'terra_force': { id: 'terra_force', name: 'Terra Force', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🌋', element: EntityType.EARTH },
    'quake': { id: 'quake', name: 'Quake', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '📉', element: EntityType.EARTH },
    'rock_slide': { id: 'rock_slide', name: 'Rock Slide', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 3, icon: '⛰️', element: EntityType.EARTH },
    'crystal_shard': { id: 'crystal_shard', name: 'Crystal Shard', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '💎', element: EntityType.EARTH },
    'stone_spear': { id: 'stone_spear', name: 'Stone Spear', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '🔪', element: EntityType.EARTH },

    // --- MYSTIC (Magic/Psychic/Fairy) ---
    'mind_shock': { id: 'mind_shock', name: 'Mind Shock', type: MoveType.ATTACK, category: 'special', power: 50, cost: 2, icon: '😵', element: EntityType.MYSTIC },
    'mystic_ray': { id: 'mystic_ray', name: 'Mystic Ray', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '🌈', element: EntityType.MYSTIC },
    'soul_cut': { id: 'soul_cut', name: 'Soul Cut', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🔪', element: EntityType.MYSTIC },
    'spirit_bash': { id: 'spirit_bash', name: 'Spirit Bash', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '💆', element: EntityType.MYSTIC },
    'telepathy': { id: 'telepathy', name: 'Telepathy', type: MoveType.ATTACK, category: 'special', power: 90, cost: 4, icon: '🧠', element: EntityType.MYSTIC },
    'oracle_vision': { id: 'oracle_vision', name: 'Oracle Vision', type: MoveType.ATTACK, category: 'special', power: 120, cost: 6, icon: '🔮', element: EntityType.MYSTIC },
    'charm_voice': { id: 'charm_voice', name: 'Charm Voice', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🎤', element: EntityType.MYSTIC },
    'fairy_spark': { id: 'fairy_spark', name: 'Fairy Spark', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🧚', element: EntityType.MYSTIC },
    'radiant_burst': { id: 'radiant_burst', name: 'Radiant Burst', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '✨', element: EntityType.MYSTIC },
    'moon_strike': { id: 'moon_strike', name: 'Moon Strike', type: MoveType.ATTACK, category: 'special', power: 95, cost: 5, icon: '🌑', element: EntityType.MYSTIC },

    // --- SHADOW (Dark/Ghost) ---
    'dark_bite': { id: 'dark_bite', name: 'Dark Bite', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 3, icon: '🦷', element: EntityType.SHADOW },
    'ghost_touch': { id: 'ghost_touch', name: 'Ghost Touch', type: MoveType.ATTACK, category: 'physical', power: 30, cost: 1, icon: '👅', element: EntityType.SHADOW },
    'shade_sneak': { id: 'shade_sneak', name: 'Shade Sneak', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '👤', element: EntityType.SHADOW },
    'curse': { id: 'curse', name: 'Curse', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '🧙', element: EntityType.SHADOW },
    'night_claw': { id: 'night_claw', name: 'Night Claw', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '💅', element: EntityType.SHADOW },
    'void_sphere': { id: 'void_sphere', name: 'Void Sphere', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '🟣', element: EntityType.SHADOW },
    'phantom_strike': { id: 'phantom_strike', name: 'Phantom Strike', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '👻', element: EntityType.SHADOW },
    'darkness_pulse': { id: 'darkness_pulse', name: 'Darkness Pulse', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '⚫', element: EntityType.SHADOW },
    'howl': { id: 'howl', name: 'Howl', type: MoveType.ATTACK, category: 'special', power: 55, cost: 2, icon: '🤬', element: EntityType.SHADOW },
    'shadow_ambush': { id: 'shadow_ambush', name: 'Shadow Ambush', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '👊', element: EntityType.SHADOW },

    // --- METAL (Steel/Machine) ---
    'rapid_punch': { id: 'rapid_punch', name: 'Rapid Punch', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '🚅', element: EntityType.METAL },
    'steel_claw': { id: 'steel_claw', name: 'Steel Claw', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 2, icon: '⚙️', element: EntityType.METAL },
    'iron_wing': { id: 'iron_wing', name: 'Iron Wing', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 3, icon: '🛡️', element: EntityType.METAL },
    'steel_head': { id: 'steel_head', name: 'Steel Head', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '🤕', element: EntityType.METAL },
    'photon_cannon': { id: 'photon_cannon', name: 'Photon Cannon', type: MoveType.ATTACK, category: 'special', power: 80, cost: 4, icon: '🔦', element: EntityType.METAL },
    'comet_strike': { id: 'comet_strike', name: 'Comet Strike', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 4, icon: '☄️', element: EntityType.METAL },

    // --- VENOM (Poison/Toxic) ---
    'toxic_sting': { id: 'toxic_sting', name: 'Toxic Sting', type: MoveType.ATTACK, category: 'physical', power: 15, cost: 1, icon: '💉', element: EntityType.VENOM },
    'acid_spray': { id: 'acid_spray', name: 'Acid Spray', type: MoveType.ATTACK, category: 'special', power: 40, cost: 1, icon: '🧪', element: EntityType.VENOM },
    'toxic_wave': { id: 'toxic_wave', name: 'Toxic Wave', type: MoveType.ATTACK, category: 'special', power: 65, cost: 3, icon: '💩', element: EntityType.VENOM },
    'venom_fang': { id: 'venom_fang', name: 'Venom Fang', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 4, icon: '☠️', element: EntityType.VENOM },
    'poison_burst': { id: 'poison_burst', name: 'Poison Burst', type: MoveType.ATTACK, category: 'special', power: 85, cost: 4, icon: '💣', element: EntityType.VENOM },
    'toxic_shot': { id: 'toxic_shot', name: 'Toxic Shot', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 5, icon: '🗑️', element: EntityType.VENOM },

    // --- STATUS (HEAL & DEFEND) ---
    'quick_mend': { id: 'quick_mend', name: 'Quick Mend', type: MoveType.HEAL, category: 'status', power: 50, cost: 3, icon: '💚', element: EntityType.MYSTIC },
    'full_restore': { id: 'full_restore', name: 'Full Restore', type: MoveType.HEAL, category: 'status', power: 100, cost: 5, icon: '🧪', element: EntityType.MYSTIC },
    'regenerate': { id: 'regenerate', name: 'Regenerate', type: MoveType.HEAL, category: 'status', power: 80, cost: 4, icon: '♻️', element: EntityType.FOREST },
    'photosynthesis': { id: 'photosynthesis', name: 'Photosynthesis', type: MoveType.HEAL, category: 'status', power: 70, cost: 4, icon: '☀️', element: EntityType.FOREST },
    'rest': { id: 'rest', name: 'Rest', type: MoveType.HEAL, category: 'status', power: 60, cost: 0, icon: '🪶', element: EntityType.MYSTIC },
    'fortify': { id: 'fortify', name: 'Fortify', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🛡️', element: EntityType.METAL },
    'shield': { id: 'shield', name: 'Shield', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '✋', element: EntityType.METAL },
    'harden': { id: 'harden', name: 'Harden', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🧱', element: EntityType.EARTH },
    'barrier': { id: 'barrier', name: 'Barrier', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '🚧', element: EntityType.METAL }
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
