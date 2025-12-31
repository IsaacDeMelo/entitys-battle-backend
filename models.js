const mongoose = require('mongoose');

// --- POKEMON SCHEMA ---
const PokemonSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    type: String,
    baseStats: {
        hp: Number,
        energy: Number,
        attack: Number,
        defense: Number,
        speed: Number
    },
    spawnLocation: String, // ex: 'forest', 'house1'
    minSpawnLevel: Number,
    maxSpawnLevel: Number,
    catchRate: Number,
    spawnChance: Number,
    isStarter: Boolean,
    sprite: String, // Base64 ou URL
    evolution: {
        targetId: String,
        level: Number
    },
    movePool: [{ moveId: String, level: Number }]
});

// --- USER SCHEMA ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    skin: { type: String, default: 'char1' },
    money: { type: Number, default: 1000 },
    pokeballs: { type: Number, default: 5 },
    rareCandy: { type: Number, default: 0 },
    isAdmin: { type: Boolean, default: false },
    pokemonTeam: [{
        baseId: String,
        nickname: String,
        level: Number,
        currentHp: Number,
        xp: { type: Number, default: 0 },
        stats: Object,
        moves: [String],
        learnedMoves: [String]
    }],
    pc: Array,
    dex: [String],
    defeatedNPCs: [{ npcId: String, defeatedAt: Number }]
});

// --- NPC SCHEMA ---
const NPCSchema = new mongoose.Schema({
    name: String,
    map: String,
    x: Number,
    y: Number,
    direction: String,
    skin: String,
    isCustomSkin: Boolean,
    dialogue: String,
    winDialogue: String,
    cooldownDialogue: String,
    moneyReward: Number,
    cooldownMinutes: Number,
    battleBackground: String, // Fundo de batalha específico
    team: [{
        baseId: String,
        level: Number
    }],
    reward: {
        type: { type: String }, // 'item', 'pokemon' ou 'none'
        value: String,
        qty: Number,
        level: Number
    }
});

// --- MAP SCHEMA (SISTEMA DINÂMICO) ---
const MapSchema = new mongoose.Schema({
    mapId: { type: String, required: true, unique: true }, // ex: 'city', 'house1'
    name: String,
    bgImage: String, // Base64 ou URL
    battleBackground: String, // Fundo de batalha padrão deste mapa
    width: { type: Number, default: 100 }, // Tamanho em %
    height: { type: Number, default: 100 }, // Tamanho em %
    darknessLevel: { type: Number, default: 0 }, // 0.0 a 0.9
    spawnPoint: { x: Number, y: Number }, // Ponto de nascimento padrão
    
    collisions: { type: Array, default: [] },
    grass: { type: Array, default: [] },
    interacts: { type: Array, default: [] },
    portals: { type: Array, default: [] },

    // Objetos decorativos do mapa (imagens PNG/base64 ou URL) com controle de z-index
    // Estrutura sugerida: { id, x, y, w, h, image, anchorY, zOffset, zMode }
    objects: { type: Array, default: [] }
});

const BasePokemon = mongoose.model('BasePokemon', PokemonSchema);
const User = mongoose.model('User', UserSchema);
const NPC = mongoose.model('NPC', NPCSchema);
const GameMap = mongoose.model('GameMap', MapSchema);

module.exports = { BasePokemon, User, NPC, GameMap };
