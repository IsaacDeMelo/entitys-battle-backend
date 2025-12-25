const mongoose = require('mongoose');

const BasePokemonSchema = new mongoose.Schema({
    id: { type: String, unique: true },
    name: String,
    type: String,
    baseStats: {
        hp: Number,
        energy: Number,
        attack: Number,
        defense: Number,
        speed: Number
    },
    spawnLocation: String,
    minSpawnLevel: Number,
    maxSpawnLevel: Number,
    catchRate: Number,
    spawnChance: Number,
    isStarter: Boolean,
    evolution: { targetId: String, level: Number },
    movePool: [{ level: Number, moveId: String }],
    sprite: String
});

const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true },
    password: String,
    skin: String,
    money: { type: Number, default: 0 },
    pokeballs: { type: Number, default: 5 },
    rareCandy: { type: Number, default: 0 },
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
    pc: [{
        baseId: String,
        nickname: String,
        level: Number,
        currentHp: Number,
        xp: { type: Number, default: 0 },
        stats: Object,
        moves: [String],
        learnedMoves: [String]
    }],
    defeatedNPCs: [{ npcId: String, defeatedAt: Number }],
    // NOVO CAMPO: Histórico da Pokedex
    dex: { type: [String], default: [] },
    isAdmin: { type: Boolean, default: false }
});

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
    team: [{ baseId: String, level: Number }],
    reward: { type: String, value: String, qty: Number, level: Number }
});

module.exports = {
    BasePokemon: mongoose.model('BasePokemon', BasePokemonSchema),
    User: mongoose.model('User', UserSchema),
    NPC: mongoose.model('NPC', NPCSchema)
};
