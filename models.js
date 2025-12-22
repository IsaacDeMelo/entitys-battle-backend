const mongoose = require('mongoose');

// Schema para os golpes aprendidos (no histórico/pool)
const moveSchema = new mongoose.Schema({
    level: Number,
    moveId: String
});

// Schema para as espécies (Base)
const basePokemonSchema = new mongoose.Schema({
    id: String,
    name: String,
    type: String,
    baseStats: { hp: Number, attack: Number, defense: Number, speed: Number },
    sprite: String,
    spawnLocation: String,
    minSpawnLevel: Number,
    maxSpawnLevel: Number,
    catchRate: Number,
    spawnChance: Number,
    isStarter: Boolean,
    evolution: { targetId: String, level: Number },
    movePool: [moveSchema]
});

// --- NOVO SCHEMA PARA GOLPES EQUIPADOS (COM PP) ---
const equippedMoveSchema = new mongoose.Schema({
    moveId: String,
    pp: Number,
    maxPp: Number
}, { _id: false }); // _id: false evita criar ids para cada golpe

// Schema dos Pokémons do Jogador
const userPokemonSchema = new mongoose.Schema({
    baseId: String,
    nickname: String,
    level: Number,
    currentHp: Number,
    xp: { type: Number, default: 0 },
    stats: { hp: Number, attack: Number, defense: Number, speed: Number },
    
    // AQUI ESTÁ A MUDANÇA MÁGICA:
    moves: [equippedMoveSchema], // Agora aceita objetos {moveId, pp, maxPp}
    
    learnedMoves: [String]
});

// Schema do Usuário
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    skin: String,
    money: { type: Number, default: 100 },
    pokeballs: { type: Number, default: 5 },
    rareCandy: { type: Number, default: 0 },
    pokemonTeam: [userPokemonSchema],
    pc: [userPokemonSchema],
    isAdmin: { type: Boolean, default: false }
});

module.exports = {
    BasePokemon: mongoose.model('BasePokemon', basePokemonSchema),
    User: mongoose.model('User', userSchema)
};
