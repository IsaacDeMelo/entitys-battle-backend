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
    spawnChance: { type: Number, default: 0.1 }, 
    evolution: { targetId: String, level: Number },
    movePool: [{ level: Number, moveId: String }]
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
    pokemonTeam: [{
        baseId: String, nickname: String, level: { type: Number, default: 1 },
        currentHp: Number, xp: { type: Number, default: 0 },
        stats: { hp: Number, energy: Number, attack: Number, defense: Number, speed: Number }, 
        moves: [String], // Active moves (Max 4)
        learnedMoves: [String] // History of all learned moves
    }]
});

const BasePokemon = mongoose.model('BasePokemon', BasePokemonSchema);
const User = mongoose.model('User', UserSchema);

module.exports = { BasePokemon, User };