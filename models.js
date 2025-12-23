const mongoose = require('mongoose');

const BasePokemonSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    type: String,
    baseStats: { hp: Number, energy: Number, attack: Number, defense: Number, speed: Number },
    sprite: String,
    spawnLocation: { type: String, default: 'none' },
    minSpawnLevel: { type: Number, default: 1 },
    maxSpawnLevel: { type: Number, default: 5 },
    catchRate: { type: Number, default: 0.5 },
    spawnChance: { type: Number, default: 50 }, 
    isStarter: { type: Boolean, default: false },
    evolution: { targetId: String, level: Number },
    movePool: [{ level: Number, moveId: String }]
});

const UserPokemonSchema = new mongoose.Schema({
    baseId: String, 
    nickname: String, 
    level: { type: Number, default: 1 },
    currentHp: Number, 
    xp: { type: Number, default: 0 },
    stats: { hp: Number, energy: Number, attack: Number, defense: Number, speed: Number }, 
    moves: [String], 
    learnedMoves: [String] 
});

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    skin: { type: String, default: 'char1' },
    isAdmin: { type: Boolean, default: false },
    x: { type: Number, default: 50 },
    y: { type: Number, default: 80 },
    money: { type: Number, default: 100 },
    pokeballs: { type: Number, default: 5 },
    rareCandy: { type: Number, default: 0 },
    pokemonTeam: [UserPokemonSchema],
    pc: [UserPokemonSchema],
    
    // CORRIGIDO AQUI:
    defeatedNPCs: {
        type: [{ 
            npcId: String, 
            defeatedAt: Number 
        }],
        default: []
    }
});

const NpcSchema = new mongoose.Schema({
    name: String,
    map: String, 
    x: Number,
    y: Number,
    direction: { type: String, default: 'down' },
    skin: String,
    isCustomSkin: { type: Boolean, default: false },
    
    dialogue: String,         // Fala antes da batalha
    winDialogue: String,      // Fala se já venceu (e for Tutorial/Único)
    cooldownDialogue: String, // Fala se estiver em cooldown (Carregando)
    
    moneyReward: { type: Number, default: 50 },
    
    // 0 = Único (Tutorial/Lendário), nunca mais batalha.
    // > 0 = Minutos para poder batalhar de novo.
    cooldownMinutes: { type: Number, default: 0 }, 

    reward: {
        type: { type: String, default: 'none' }, 
        value: String, 
        qty: { type: Number, default: 1 },
        level: { type: Number, default: 1 } 
    },
    team: [{ 
        baseId: String, 
        level: Number 
    }]
});

const NPC = mongoose.model('NPC', NpcSchema);
const BasePokemon = mongoose.model('BasePokemon', BasePokemonSchema);
const User = mongoose.model('User', UserSchema);

module.exports = { BasePokemon, User, NPC };