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
    [EntityType.FIGHTER]: { [EntityType.NORMAL]: 2, [EntityType.ICE]: 2, [EntityType.POISON]: 0.5, [EntityType.FLYING]: 0.5, [EntityType.PSYCHIC]: 0.5, [EntityType.BUG]: 0.5, [EntityType.ROCK]: 2, [EntityType.GHOST]: 0, [EntityType.DARK]: 2, [EntityType.STEEL]: 2, [EntityType.FAIRY]: 0.5 },
    [EntityType.POISON]: { [EntityType.PLANT]: 2, [EntityType.POISON]: 0.5, [EntityType.GROUND]: 0.5, [EntityType.ROCK]: 0.5, [EntityType.GHOST]: 0.5, [EntityType.STEEL]: 0, [EntityType.FAIRY]: 2 },
    [EntityType.GROUND]: { [EntityType.FIRE]: 2, [EntityType.ELECTRIC]: 2, [EntityType.PLANT]: 0.5, [EntityType.POISON]: 2, [EntityType.FLYING]: 0, [EntityType.BUG]: 0.5, [EntityType.ROCK]: 2, [EntityType.STEEL]: 2 },
    [EntityType.FLYING]: { [EntityType.ELECTRIC]: 0.5, [EntityType.PLANT]: 2, [EntityType.FIGHTER]: 2, [EntityType.BUG]: 2, [EntityType.ROCK]: 0.5, [EntityType.STEEL]: 0.5 },
    [EntityType.PSYCHIC]: { [EntityType.FIGHTER]: 2, [EntityType.POISON]: 2, [EntityType.PSYCHIC]: 0.5, [EntityType.DARK]: 0, [EntityType.STEEL]: 0.5 },
    [EntityType.BUG]: { [EntityType.FIRE]: 0.5, [EntityType.PLANT]: 2, [EntityType.FIGHTER]: 0.5, [EntityType.POISON]: 0.5, [EntityType.FLYING]: 0.5, [EntityType.PSYCHIC]: 2, [EntityType.GHOST]: 0.5, [EntityType.DARK]: 2, [EntityType.STEEL]: 0.5, [EntityType.FAIRY]: 0.5 },
    [EntityType.ROCK]: { [EntityType.FIRE]: 2, [EntityType.ICE]: 2, [EntityType.FIGHTER]: 0.5, [EntityType.GROUND]: 0.5, [EntityType.FLYING]: 2, [EntityType.BUG]: 2, [EntityType.STEEL]: 0.5 },
    [EntityType.GHOST]: { [EntityType.NORMAL]: 0, [EntityType.PSYCHIC]: 2, [EntityType.GHOST]: 2, [EntityType.DARK]: 0.5 },
    [EntityType.DRAGON]: { [EntityType.DRAGON]: 2, [EntityType.STEEL]: 0.5, [EntityType.FAIRY]: 0 },
    [EntityType.DARK]: { [EntityType.FIGHTER]: 0.5, [EntityType.PSYCHIC]: 2, [EntityType.GHOST]: 2, [EntityType.DARK]: 0.5, [EntityType.FAIRY]: 0.5 },
    [EntityType.STEEL]: { [EntityType.FIRE]: 0.5, [EntityType.WATER]: 0.5, [EntityType.ELECTRIC]: 0.5, [EntityType.ICE]: 2, [EntityType.ROCK]: 2, [EntityType.STEEL]: 0.5, [EntityType.FAIRY]: 2 },
    [EntityType.FAIRY]: { [EntityType.FIRE]: 0.5, [EntityType.FIGHTER]: 2, [EntityType.POISON]: 0.5, [EntityType.DRAGON]: 2, [EntityType.DARK]: 2, [EntityType.STEEL]: 0.5 }
};

const MOVES_LIBRARY = {
    // --- NORMAL (Physical / Special) ---
    'tackle': { id: 'tackle', name: 'Tackle', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 0, icon: '💥', element: EntityType.NORMAL },
    'scratch': { id: 'scratch', name: 'Scratch', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 2, icon: '💅', element: EntityType.NORMAL },
    'pound': { id: 'pound', name: 'Pound', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 1, icon: '👊', element: EntityType.NORMAL },
    'quick_attack': { id: 'quick_attack', name: 'Quick Attack', type: MoveType.ATTACK, category: 'physical', power: 45, cost: 2, icon: '⚡', element: EntityType.NORMAL },
    'slash': { id: 'slash', name: 'Slash', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 4, icon: '🔪', element: EntityType.NORMAL },
    'swift': { id: 'swift', name: 'Swift', type: MoveType.ATTACK, category: 'special', power: 60, cost: 3, icon: '⭐', element: EntityType.NORMAL },
    'tri_attack': { id: 'tri_attack', name: 'Tri Attack', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '🔺', element: EntityType.NORMAL },
    'hyper_beam': { id: 'hyper_beam', name: 'Hyper Beam', type: MoveType.ATTACK, category: 'special', power: 150, cost: 10, icon: '🌌', element: EntityType.NORMAL },
    'giga_impact': { id: 'giga_impact', name: 'Giga Impact', type: MoveType.ATTACK, category: 'physical', power: 150, cost: 10, icon: '💥', element: EntityType.NORMAL },
    'body_slam': { id: 'body_slam', name: 'Body Slam', type: MoveType.ATTACK, category: 'physical', power: 85, cost: 5, icon: '🏋️', element: EntityType.NORMAL },

    // --- FIRE ---
    'ember': { id: 'ember', name: 'Ember', type: MoveType.ATTACK, category: 'special', power: 40, cost: 3, icon: '🔥', element: EntityType.FIRE },
    'flamethrower': { id: 'flamethrower', name: 'Flamethrower', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '🌋', element: EntityType.FIRE },
    'fire_punch': { id: 'fire_punch', name: 'Fire Punch', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 5, icon: '🥊', element: EntityType.FIRE },
    'fire_spin': { id: 'fire_spin', name: 'Fire Spin', type: MoveType.ATTACK, category: 'special', power: 35, cost: 3, icon: '🌀', element: EntityType.FIRE },
    'flare_blitz': { id: 'flare_blitz', name: 'Flare Blitz', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 9, icon: '🧨', element: EntityType.FIRE },
    'heat_wave': { id: 'heat_wave', name: 'Heat Wave', type: MoveType.ATTACK, category: 'special', power: 95, cost: 6, icon: '♨️', element: EntityType.FIRE },
    'fire_blast': { id: 'fire_blast', name: 'Fire Blast', type: MoveType.ATTACK, category: 'special', power: 110, cost: 8, icon: '大', element: EntityType.FIRE },
    'flame_wheel': { id: 'flame_wheel', name: 'Flame Wheel', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 4, icon: '🎡', element: EntityType.FIRE },

    // --- WATER ---
    'water_gun': { id: 'water_gun', name: 'Water Gun', type: MoveType.ATTACK, category: 'special', power: 40, cost: 3, icon: '🔫', element: EntityType.WATER },
    'bubble': { id: 'bubble', name: 'Bubble', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🫧', element: EntityType.WATER },
    'aqua_jet': { id: 'aqua_jet', name: 'Aqua Jet', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 2, icon: '🚤', element: EntityType.WATER },
    'bubble_beam': { id: 'bubble_beam', name: 'Bubble Beam', type: MoveType.ATTACK, category: 'special', power: 65, cost: 4, icon: '🛁', element: EntityType.WATER },
    'waterfall': { id: 'waterfall', name: 'Waterfall', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '🌊', element: EntityType.WATER },
    'surf': { id: 'surf', name: 'Surf', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '🏄', element: EntityType.WATER },
    'aqua_tail': { id: 'aqua_tail', name: 'Aqua Tail', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 6, icon: '🐋', element: EntityType.WATER },
    'hydro_pump': { id: 'hydro_pump', name: 'Hydro Pump', type: MoveType.ATTACK, category: 'special', power: 110, cost: 7, icon: '💧', element: EntityType.WATER },

    // --- PLANT (GRASS) ---
    'vine_whip': { id: 'vine_whip', name: 'Vine Whip', type: MoveType.ATTACK, category: 'physical', power: 45, cost: 3, icon: '🍃', element: EntityType.PLANT },
    'razor_leaf': { id: 'razor_leaf', name: 'Razor Leaf', type: MoveType.ATTACK, category: 'physical', power: 55, cost: 4, icon: '✂️', element: EntityType.PLANT },
    'mega_drain': { id: 'mega_drain', name: 'Mega Drain', type: MoveType.ATTACK, category: 'special', power: 60, cost: 5, icon: '🥤', element: EntityType.PLANT },
    'seed_bomb': { id: 'seed_bomb', name: 'Seed Bomb', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '💣', element: EntityType.PLANT },
    'energy_ball': { id: 'energy_ball', name: 'Energy Ball', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '🟢', element: EntityType.PLANT },
    'leaf_blade': { id: 'leaf_blade', name: 'Leaf Blade', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 6, icon: '⚔️', element: EntityType.PLANT },
    'solar_beam': { id: 'solar_beam', name: 'Solar Beam', type: MoveType.ATTACK, category: 'special', power: 120, cost: 8, icon: '☀️', element: EntityType.PLANT },
    'petal_dance': { id: 'petal_dance', name: 'Petal Dance', type: MoveType.ATTACK, category: 'special', power: 120, cost: 8, icon: '🌸', element: EntityType.PLANT },

    // --- ELECTRIC ---
    'thunder_shock': { id: 'thunder_shock', name: 'Thunder Shock', type: MoveType.ATTACK, category: 'special', power: 40, cost: 3, icon: '⚡', element: EntityType.ELECTRIC },
    'spark': { id: 'spark', name: 'Spark', type: MoveType.ATTACK, category: 'physical', power: 65, cost: 4, icon: '✨', element: EntityType.ELECTRIC },
    'thunder_punch': { id: 'thunder_punch', name: 'Thunder Punch', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 5, icon: '🤜', element: EntityType.ELECTRIC },
    'discharge': { id: 'discharge', name: 'Discharge', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '💡', element: EntityType.ELECTRIC },
    'thunderbolt': { id: 'thunderbolt', name: 'Thunderbolt', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '🌩️', element: EntityType.ELECTRIC },
    'wild_charge': { id: 'wild_charge', name: 'Wild Charge', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 6, icon: '🐂', element: EntityType.ELECTRIC },
    'thunder': { id: 'thunder', name: 'Thunder', type: MoveType.ATTACK, category: 'special', power: 110, cost: 8, icon: '⛈️', element: EntityType.ELECTRIC },
    'volt_tackle': { id: 'volt_tackle', name: 'Volt Tackle', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 9, icon: '⚡️', element: EntityType.ELECTRIC },

    // --- ICE ---
    'ice_shard': { id: 'ice_shard', name: 'Ice Shard', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 2, icon: '🧊', element: EntityType.ICE },
    'powder_snow': { id: 'powder_snow', name: 'Powder Snow', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '❄️', element: EntityType.ICE },
    'aurora_beam': { id: 'aurora_beam', name: 'Aurora Beam', type: MoveType.ATTACK, category: 'special', power: 65, cost: 4, icon: '🌈', element: EntityType.ICE },
    'ice_punch': { id: 'ice_punch', name: 'Ice Punch', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 5, icon: '🥶', element: EntityType.ICE },
    'ice_beam': { id: 'ice_beam', name: 'Ice Beam', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '❄️', element: EntityType.ICE },
    'icicle_crash': { id: 'icicle_crash', name: 'Icicle Crash', type: MoveType.ATTACK, category: 'physical', power: 85, cost: 5, icon: '📉', element: EntityType.ICE },
    'blizzard': { id: 'blizzard', name: 'Blizzard', type: MoveType.ATTACK, category: 'special', power: 110, cost: 8, icon: '🌬️', element: EntityType.ICE },

    // --- FIGHTING ---
    'karate_chop': { id: 'karate_chop', name: 'Karate Chop', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 3, icon: '🥋', element: EntityType.FIGHTER },
    'mach_punch': { id: 'mach_punch', name: 'Mach Punch', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 2, icon: '👊', element: EntityType.FIGHTER },
    'seismic_toss': { id: 'seismic_toss', name: 'Seismic Toss', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 4, icon: '🌏', element: EntityType.FIGHTER },
    'brick_break': { id: 'brick_break', name: 'Brick Break', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 5, icon: '🧱', element: EntityType.FIGHTER },
    'aura_sphere': { id: 'aura_sphere', name: 'Aura Sphere', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '🔵', element: EntityType.FIGHTER },
    'cross_chop': { id: 'cross_chop', name: 'Cross Chop', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 7, icon: '❌', element: EntityType.FIGHTER },
    'focus_blast': { id: 'focus_blast', name: 'Focus Blast', type: MoveType.ATTACK, category: 'special', power: 120, cost: 8, icon: '🧘', element: EntityType.FIGHTER },
    'close_combat': { id: 'close_combat', name: 'Close Combat', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 8, icon: '⚔️', element: EntityType.FIGHTER },

    // --- POISON ---
    'poison_sting': { id: 'poison_sting', name: 'Poison Sting', type: MoveType.ATTACK, category: 'physical', power: 15, cost: 1, icon: '💉', element: EntityType.POISON },
    'acid': { id: 'acid', name: 'Acid', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🧪', element: EntityType.POISON },
    'sludge': { id: 'sludge', name: 'Sludge', type: MoveType.ATTACK, category: 'special', power: 65, cost: 4, icon: '💩', element: EntityType.POISON },
    'poison_jab': { id: 'poison_jab', name: 'Poison Jab', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '☠️', element: EntityType.POISON },
    'sludge_bomb': { id: 'sludge_bomb', name: 'Sludge Bomb', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '💣', element: EntityType.POISON },
    'gunk_shot': { id: 'gunk_shot', name: 'Gunk Shot', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 8, icon: '🗑️', element: EntityType.POISON },

    // --- GROUND ---
    'mud_slap': { id: 'mud_slap', name: 'Mud Slap', type: MoveType.ATTACK, category: 'special', power: 20, cost: 1, icon: '💩', element: EntityType.GROUND },
    'mud_shot': { id: 'mud_shot', name: 'Mud Shot', type: MoveType.ATTACK, category: 'special', power: 55, cost: 3, icon: '🔫', element: EntityType.GROUND },
    'bulldoze': { id: 'bulldoze', name: 'Bulldoze', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 4, icon: '🚜', element: EntityType.GROUND },
    'dig': { id: 'dig', name: 'Dig', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '⛏️', element: EntityType.GROUND },
    'earth_power': { id: 'earth_power', name: 'Earth Power', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '🌋', element: EntityType.GROUND },
    'earthquake': { id: 'earthquake', name: 'Earthquake', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 7, icon: '📉', element: EntityType.GROUND },

    // --- FLYING ---
    'peck': { id: 'peck', name: 'Peck', type: MoveType.ATTACK, category: 'physical', power: 35, cost: 1, icon: '🐦', element: EntityType.FLYING },
    'gust': { id: 'gust', name: 'Gust', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '💨', element: EntityType.FLYING },
    'wing_attack': { id: 'wing_attack', name: 'Wing Attack', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 4, icon: '🦅', element: EntityType.FLYING },
    'aerial_ace': { id: 'aerial_ace', name: 'Aerial Ace', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 4, icon: '✈️', element: EntityType.FLYING },
    'air_slash': { id: 'air_slash', name: 'Air Slash', type: MoveType.ATTACK, category: 'special', power: 75, cost: 5, icon: '🌬️', element: EntityType.FLYING },
    'fly': { id: 'fly', name: 'Fly', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 6, icon: '🛫', element: EntityType.FLYING },
    'brave_bird': { id: 'brave_bird', name: 'Brave Bird', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 9, icon: '🔥', element: EntityType.FLYING },
    'hurricane': { id: 'hurricane', name: 'Hurricane', type: MoveType.ATTACK, category: 'special', power: 110, cost: 8, icon: '🌪️', element: EntityType.FLYING },

    // --- PSYCHIC ---
    'confusion': { id: 'confusion', name: 'Confusion', type: MoveType.ATTACK, category: 'special', power: 50, cost: 3, icon: '😵', element: EntityType.PSYCHIC },
    'psybeam': { id: 'psybeam', name: 'Psybeam', type: MoveType.ATTACK, category: 'special', power: 65, cost: 4, icon: '🌈', element: EntityType.PSYCHIC },
    'psycho_cut': { id: 'psycho_cut', name: 'Psycho Cut', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 4, icon: '🔪', element: EntityType.PSYCHIC },
    'zen_headbutt': { id: 'zen_headbutt', name: 'Zen Headbutt', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '💆', element: EntityType.PSYCHIC },
    'psychic': { id: 'psychic', name: 'Psychic', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '🧠', element: EntityType.PSYCHIC },
    'future_sight': { id: 'future_sight', name: 'Future Sight', type: MoveType.ATTACK, category: 'special', power: 120, cost: 8, icon: '🔮', element: EntityType.PSYCHIC },

    // --- BUG ---
    'fury_cutter': { id: 'fury_cutter', name: 'Fury Cutter', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 2, icon: '⚔️', element: EntityType.BUG },
    'bug_bite': { id: 'bug_bite', name: 'Bug Bite', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 4, icon: '🐛', element: EntityType.BUG },
    'signal_beam': { id: 'signal_beam', name: 'Signal Beam', type: MoveType.ATTACK, category: 'special', power: 75, cost: 5, icon: '🚦', element: EntityType.BUG },
    'x_scissor': { id: 'x_scissor', name: 'X-Scissor', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '✂️', element: EntityType.BUG },
    'bug_buzz': { id: 'bug_buzz', name: 'Bug Buzz', type: MoveType.ATTACK, category: 'special', power: 90, cost: 6, icon: '🐝', element: EntityType.BUG },
    'megahorn': { id: 'megahorn', name: 'Megahorn', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 8, icon: '🦏', element: EntityType.BUG },

    // --- ROCK ---
    'rock_throw': { id: 'rock_throw', name: 'Rock Throw', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 3, icon: '🪨', element: EntityType.ROCK },
    'rollout': { id: 'rollout', name: 'Rollout', type: MoveType.ATTACK, category: 'physical', power: 30, cost: 2, icon: '🔄', element: EntityType.ROCK },
    'ancient_power': { id: 'ancient_power', name: 'Ancient Power', type: MoveType.ATTACK, category: 'special', power: 60, cost: 4, icon: '🏺', element: EntityType.ROCK },
    'rock_slide': { id: 'rock_slide', name: 'Rock Slide', type: MoveType.ATTACK, category: 'physical', power: 75, cost: 5, icon: '⛰️', element: EntityType.ROCK },
    'power_gem': { id: 'power_gem', name: 'Power Gem', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '💎', element: EntityType.ROCK },
    'stone_edge': { id: 'stone_edge', name: 'Stone Edge', type: MoveType.ATTACK, category: 'physical', power: 100, cost: 7, icon: '🔪', element: EntityType.ROCK },

    // --- GHOST ---
    'lick': { id: 'lick', name: 'Lick', type: MoveType.ATTACK, category: 'physical', power: 30, cost: 2, icon: '👅', element: EntityType.GHOST },
    'shadow_sneak': { id: 'shadow_sneak', name: 'Shadow Sneak', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 2, icon: '👤', element: EntityType.GHOST },
    'hex': { id: 'hex', name: 'Hex', type: MoveType.ATTACK, category: 'special', power: 65, cost: 4, icon: '🧙', element: EntityType.GHOST },
    'shadow_claw': { id: 'shadow_claw', name: 'Shadow Claw', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 4, icon: '💅', element: EntityType.GHOST },
    'shadow_ball': { id: 'shadow_ball', name: 'Shadow Ball', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '🟣', element: EntityType.GHOST },
    'phantom_force': { id: 'phantom_force', name: 'Phantom Force', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 6, icon: '👻', element: EntityType.GHOST },

    // --- DRAGON ---
    'twister': { id: 'twister', name: 'Twister', type: MoveType.ATTACK, category: 'special', power: 40, cost: 3, icon: '🌪️', element: EntityType.DRAGON },
    'dragon_breath': { id: 'dragon_breath', name: 'Dragon Breath', type: MoveType.ATTACK, category: 'special', power: 60, cost: 4, icon: '😮‍💨', element: EntityType.DRAGON },
    'dragon_claw': { id: 'dragon_claw', name: 'Dragon Claw', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '🐉', element: EntityType.DRAGON },
    'dragon_pulse': { id: 'dragon_pulse', name: 'Dragon Pulse', type: MoveType.ATTACK, category: 'special', power: 85, cost: 6, icon: '🐲', element: EntityType.DRAGON },
    'outrage': { id: 'outrage', name: 'Outrage', type: MoveType.ATTACK, category: 'physical', power: 120, cost: 9, icon: '😡', element: EntityType.DRAGON },
    'draco_meteor': { id: 'draco_meteor', name: 'Draco Meteor', type: MoveType.ATTACK, category: 'special', power: 130, cost: 10, icon: '☄️', element: EntityType.DRAGON },

    // --- DARK ---
    'bite': { id: 'bite', name: 'Bite', type: MoveType.ATTACK, category: 'physical', power: 60, cost: 4, icon: '🦷', element: EntityType.DARK },
    'snarl': { id: 'snarl', name: 'Snarl', type: MoveType.ATTACK, category: 'special', power: 55, cost: 3, icon: '🤬', element: EntityType.DARK },
    'night_slash': { id: 'night_slash', name: 'Night Slash', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 4, icon: '🌑', element: EntityType.DARK },
    'sucker_punch': { id: 'sucker_punch', name: 'Sucker Punch', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 4, icon: '👊', element: EntityType.DARK },
    'crunch': { id: 'crunch', name: 'Crunch', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '🦴', element: EntityType.DARK },
    'dark_pulse': { id: 'dark_pulse', name: 'Dark Pulse', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '⚫', element: EntityType.DARK },

    // --- STEEL ---
    'bullet_punch': { id: 'bullet_punch', name: 'Bullet Punch', type: MoveType.ATTACK, category: 'physical', power: 40, cost: 2, icon: '🚅', element: EntityType.STEEL },
    'metal_claw': { id: 'metal_claw', name: 'Metal Claw', type: MoveType.ATTACK, category: 'physical', power: 50, cost: 3, icon: '⚙️', element: EntityType.STEEL },
    'steel_wing': { id: 'steel_wing', name: 'Steel Wing', type: MoveType.ATTACK, category: 'physical', power: 70, cost: 4, icon: '🛡️', element: EntityType.STEEL },
    'iron_head': { id: 'iron_head', name: 'Iron Head', type: MoveType.ATTACK, category: 'physical', power: 80, cost: 5, icon: '🤕', element: EntityType.STEEL },
    'flash_cannon': { id: 'flash_cannon', name: 'Flash Cannon', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '🔦', element: EntityType.STEEL },
    'meteor_mash': { id: 'meteor_mash', name: 'Meteor Mash', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 6, icon: '☄️', element: EntityType.STEEL },

    // --- FAIRY ---
    'disarming_voice': { id: 'disarming_voice', name: 'Disarming Voice', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🎤', element: EntityType.FAIRY },
    'fairy_wind': { id: 'fairy_wind', name: 'Fairy Wind', type: MoveType.ATTACK, category: 'special', power: 40, cost: 2, icon: '🧚', element: EntityType.FAIRY },
    'dazzling_gleam': { id: 'dazzling_gleam', name: 'Dazzling Gleam', type: MoveType.ATTACK, category: 'special', power: 80, cost: 5, icon: '✨', element: EntityType.FAIRY },
    'play_rough': { id: 'play_rough', name: 'Play Rough', type: MoveType.ATTACK, category: 'physical', power: 90, cost: 6, icon: '🤼', element: EntityType.FAIRY },
    'moonblast': { id: 'moonblast', name: 'Moonblast', type: MoveType.ATTACK, category: 'special', power: 95, cost: 6, icon: '🌑', element: EntityType.FAIRY },

    // --- STATUS (HEAL & DEFEND) ---
    // Category 'status' is important for animations (no attack dash)
    'quick_heal': { id: 'quick_heal', name: 'Quick Heal', type: MoveType.HEAL, category: 'status', power: 50, cost: 4, icon: '💚' },
    'mega_heal': { id: 'mega_heal', name: 'Mega Heal', type: MoveType.HEAL, category: 'status', power: 100, cost: 8, icon: '🧪' },
    'recover': { id: 'recover', name: 'Recover', type: MoveType.HEAL, category: 'status', power: 80, cost: 6, icon: '♻️' },
    'synthesis': { id: 'synthesis', name: 'Synthesis', type: MoveType.HEAL, category: 'status', power: 70, cost: 5, icon: '☀️' },
    'roost': { id: 'roost', name: 'Roost', type: MoveType.HEAL, category: 'status', power: 60, cost: 4, icon: '🪶' },
    'iron_defense': { id: 'iron_defense', name: 'Iron Defense', type: MoveType.DEFEND, category: 'status', power: 0, cost: 2, icon: '🛡️' },
    'protect': { id: 'protect', name: 'Protect', type: MoveType.DEFEND, category: 'status', power: 0, cost: 3, icon: '✋' },
    'harden': { id: 'harden', name: 'Harden', type: MoveType.DEFEND, category: 'status', power: 0, cost: 1, icon: '🧱' },
    'barrier': { id: 'barrier', name: 'Barrier', type: MoveType.DEFEND, category: 'status', power: 0, cost: 3, icon: '🚧' }
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
    return val === undefined ? 1 : val;
}

module.exports = { EntityType, MoveType, EffectType, TypeChart, getTypeEffectiveness, MOVES_LIBRARY, getXpForNextLevel };
