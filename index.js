const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const { BasePokemon, User } = require('./models');
const { EntityType, MoveType, TypeChart, MOVES_LIBRARY, getXpForNextLevel, getTypeEffectiveness } = require('./gameData');

const SKIN_COUNT = 6;

// CONEXÃO MONGODB
const { MONGO_URI } = require('./config');
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Conectado')).catch(e=>console.log(e));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

process.on('uncaughtException', (err) => { console.error('UNCAUGHT EXCEPTION:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('UNHANDLED REJECTION:', reason); });

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const activeBattles = {}; 
const onlineBattles = {}; 
const players = {}; 
let matchmakingQueue = []; 
const roomSpectators = {}; 

const GRASS_PATCHES = ['grass1', 'grass2'];
const GRASS_CHANCE = { grass1: 0.35, grass2: 0.35 };

function pickWeightedPokemon(pokemonList) {
    let totalWeight = 0;
    pokemonList.forEach(p => { totalWeight += (p.spawnChance || 1); });
    let random = Math.random() * totalWeight;
    for (let i = 0; i < pokemonList.length; i++) {
        const weight = pokemonList[i].spawnChance || 1;
        if (random < weight) return pokemonList[i];
        random -= weight;
    }
    return pokemonList[0];
}

async function seedDatabase() { 
    try { 
        const count = await BasePokemon.countDocuments(); 
        if (count === 0) { 
            const starters = [ 
                { id: 'bulbasaur', name: 'Bulbasaur', type: 'plant', baseStats: { hp: 45, energy: 25, attack: 49, defense: 49, speed: 45 }, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png', spawnLocation: 'forest', minSpawnLevel: 2, maxSpawnLevel: 5, catchRate: 0.6, spawnChance: 20, isStarter: true, movePool: [{level: 1, moveId: 'tackle'}, {level: 3, moveId: 'vine_whip'}, {level: 8, moveId: 'solar_beam'}] }, 
                { id: 'charmander', name: 'Charmander', type: 'fire', baseStats: { hp: 39, energy: 25, attack: 52, defense: 43, speed: 65 }, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png', spawnLocation: 'forest', minSpawnLevel: 2, maxSpawnLevel: 5, catchRate: 0.6, spawnChance: 20, isStarter: true, movePool: [{level: 1, moveId: 'scratch'}, {level: 3, moveId: 'ember'}, {level: 8, moveId: 'flamethrower'}] }, 
                { id: 'squirtle', name: 'Squirtle', type: 'water', baseStats: { hp: 44, energy: 25, attack: 48, defense: 65, speed: 43 }, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png', spawnLocation: 'forest', minSpawnLevel: 2, maxSpawnLevel: 5, catchRate: 0.6, spawnChance: 20, isStarter: true, movePool: [{level: 1, moveId: 'tackle'}, {level: 3, moveId: 'water_gun'}, {level: 8, moveId: 'hydro_pump'}] } 
            ]; 
            await BasePokemon.insertMany(starters); 
        } 
    } catch (e) { console.error(e); } 
}

function calculateStats(base, level) { const mult = 1 + (level * 0.05); return { hp: Math.floor((base.hp * 2 * level / 100) + level + 10), energy: Math.floor(base.energy + (level * 0.1)), attack: Math.floor(base.attack * mult), defense: Math.floor(base.defense * mult), speed: Math.floor(base.speed * mult) }; }
async function createBattleInstance(baseId, level) { const base = await BasePokemon.findOne({ id: baseId }).lean(); if(!base) return null; const stats = calculateStats(base.baseStats, level); let moves = base.movePool ? base.movePool.filter(m => m.level <= level).map(m => m.moveId) : []; if(moves.length === 0) moves = ['tackle']; if(moves.length > 4) moves = moves.sort(() => 0.5 - Math.random()).slice(0, 4); return { instanceId: 'wild_' + Date.now(), baseId: base.id, name: base.name, type: base.type, level: level, maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy, stats: stats, moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id), sprite: base.sprite, catchRate: base.catchRate || 0.5, xpYield: Math.max(5, Math.floor(level * 25)), isWild: true }; }
function userPokemonToEntity(userPoke, baseData) { const movesObj = userPoke.moves.map(mid => { const libMove = MOVES_LIBRARY[mid]; return libMove ? { ...libMove, id: mid } : null; }).filter(m => m !== null); return { instanceId: userPoke._id.toString(), baseId: userPoke.baseId, name: userPoke.nickname || baseData.name, type: baseData.type, level: userPoke.level, maxHp: userPoke.stats.hp, hp: userPoke.currentHp > 0 ? userPoke.currentHp : 0, maxEnergy: userPoke.stats.energy, energy: userPoke.stats.energy, stats: userPoke.stats, moves: movesObj, sprite: baseData.sprite, isWild: false, xp: userPoke.xp, xpToNext: getXpForNextLevel(userPoke.level) }; }

// ROTAS
app.get('/', async (req, res) => { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: null, skinCount: SKIN_COUNT, starters }); });
app.post('/login', async (req, res) => { const { username, password } = req.body; const user = await User.findOne({ username, password }); if (user) { res.redirect('/lobby?userId=' + user._id); } else { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: 'Credenciais inválidas', skinCount: SKIN_COUNT, starters }); } });
app.post('/register', async (req, res) => { const { username, password, skin, starterId } = req.body; try { let starterTeam = []; if (starterId) { const starter = await BasePokemon.findOne({ id: starterId, isStarter: true }); if (starter) { const initialStats = calculateStats(starter.baseStats, 1); let initialMoves = starter.movePool.filter(m => m.level <= 1).map(m => m.moveId); if(initialMoves.length === 0) initialMoves = ['tackle']; starterTeam.push({ baseId: starter.id, nickname: starter.name, level: 1, currentHp: initialStats.hp, stats: initialStats, moves: initialMoves, learnedMoves: initialMoves }); } } const newUser = new User({ username, password, skin, pokemonTeam: starterTeam, pc: [] }); await newUser.save(); res.redirect('/lobby?userId=' + newUser._id); } catch (e) { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: 'Usuário já existe.', skinCount: SKIN_COUNT, starters }); } });
app.get('/lobby', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const teamData = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({id: p.baseId}); if(base) teamData.push(userPokemonToEntity(p, base)); } const allPokes = await BasePokemon.find().lean(); res.render('room', { user, playerName: user.username, playerSkin: user.skin, entities: allPokes, team: teamData, isAdmin: user.isAdmin, skinCount: SKIN_COUNT }); });
app.get('/forest', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const allPokes = await BasePokemon.find().lean(); res.render('forest', { user, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin, skinCount: SKIN_COUNT, entities: allPokes }); });
app.get('/lab', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user || !user.isAdmin) return res.redirect('/'); const pokemons = await BasePokemon.find(); res.render('create', { types: EntityType, moves: MOVES_LIBRARY, pokemons, user }); });

app.post('/lab/create', upload.single('sprite'), async (req, res) => { const { name, type, hp, energy, atk, def, spd, location, minLvl, maxLvl, catchRate, spawnChance, isStarter, movesJson, evoTarget, evoLevel, existingId } = req.body; const stats = { hp: parseInt(hp), energy: parseInt(energy), attack: parseInt(atk), defense: parseInt(def), speed: parseInt(spd) }; let movePool = []; try { movePool = JSON.parse(movesJson); } catch(e){} const data = { name, type, baseStats: stats, spawnLocation: location, minSpawnLevel: parseInt(minLvl), maxSpawnLevel: parseInt(maxLvl), catchRate: parseFloat(catchRate), spawnChance: parseFloat(spawnChance) || 10, isStarter: isStarter === 'on', evolution: { targetId: evoTarget, level: parseInt(evoLevel) || 100 }, movePool: movePool }; if(req.file) data.sprite = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; if(existingId) await BasePokemon.findOneAndUpdate({ id: existingId }, data); else { data.id = Date.now().toString(); await new BasePokemon(data).save(); } res.redirect(req.header('Referer') || '/'); });

app.get('/api/pc', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if (!user) return res.json({ error: 'User not found' }); const formatList = async (list) => { const output = []; for (let p of list) { const base = await BasePokemon.findOne({ id: p.baseId }); if (base) output.push(userPokemonToEntity(p, base)); } return output; }; const pcList = user.pc || []; const team = await formatList(user.pokemonTeam); const pc = await formatList(pcList); res.json({ team, pc }); });
app.get('/api/pokedex', async (req, res) => { const { userId } = req.query; if (!userId) return res.status(400).json({ error: 'userId required' }); try { const user = await User.findById(userId); if (!user) return res.status(404).json({ error: 'User not found' }); const seen = new Set(); const addFromList = (list) => { if (!list) return; for (const p of list) { if (p && p.baseId) seen.add(String(p.baseId).toLowerCase()); } }; addFromList(user.pokemonTeam); addFromList(user.pc); return res.json({ list: Array.from(seen) }); } catch (e) { console.error('api/pokedex error', e); return res.status(500).json({ error: 'internal' }); } });
app.post('/api/pc/move', async (req, res) => { const { userId, pokemonId, from, to } = req.body; const user = await User.findById(userId); if (!user) return res.json({ error: 'Usuário não encontrado.' }); if (!user.pc) user.pc = []; const sourceList = from === 'team' ? user.pokemonTeam : user.pc; const destList = to === 'team' ? user.pokemonTeam : user.pc; if (from === to) return res.json({ success: true }); if (to === 'team' && destList.length >= 6) return res.json({ error: 'Sua equipe já tem 6 Pokémons!' }); if (from === 'team' && sourceList.length <= 1) return res.json({ error: 'Você não pode ficar sem Pokémons na equipe!' }); const index = sourceList.findIndex(p => p._id.toString() === pokemonId); if (index === -1) return res.json({ error: 'Pokémon não encontrado.' }); const [poke] = sourceList.splice(index, 1); destList.push(poke); await user.save(); res.json({ success: true }); });
app.get('/api/me', async (req, res) => { const { userId } = req.query; if(!userId) return res.status(400).json({ error: 'No ID' }); const user = await User.findById(userId); if(!user) return res.status(404).json({ error: 'User not found' }); const teamWithSprites = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); const nextXp = getXpForNextLevel(p.level); const allLearned = p.learnedMoves && p.learnedMoves.length > 0 ? p.learnedMoves : p.moves; teamWithSprites.push({ instanceId: p._id, name: p.nickname, level: p.level, hp: p.currentHp, maxHp: p.stats.hp, xp: p.xp, xpToNext: nextXp, sprite: base ? base.sprite : '', moves: p.moves, learnedMoves: allLearned }); } res.json({ team: teamWithSprites, allMoves: MOVES_LIBRARY, money: user.money || 0, pokeballs: user.pokeballs || 0, rareCandy: user.rareCandy || 0 }); });
app.post('/api/heal', async (req, res) => { const { userId } = req.body; const user = await User.findById(userId); if (!user) return res.status(404).json({ error: 'Usuário não encontrado' }); let count = 0; for (let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); if (base) { p.stats = calculateStats(base.baseStats, p.level); p.currentHp = p.stats.hp; count++; } } await user.save(); res.json({ success: true, message: `${count} Pokémons curados!` }); });
app.post('/api/equip-move', async (req, res) => { const { userId, pokemonId, moves } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const poke = user.pokemonTeam.id(pokemonId); if(!poke) return res.json({error: "Pokemon not found"}); if(moves.length < 1 || moves.length > 4) return res.json({error: "Deve ter entre 1 e 4 ataques."}); const validMoves = moves.every(m => poke.learnedMoves.includes(m) || poke.moves.includes(m)); if(!validMoves) return res.json({error: "Ataque inválido."}); poke.moves = moves; await user.save(); res.json({success: true}); });
app.post('/api/set-lead', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if (index > 0) { const poke = user.pokemonTeam.splice(index, 1)[0]; user.pokemonTeam.unshift(poke); await user.save(); res.json({success: true}); } else { res.json({success: true}); } });
app.post('/api/abandon-pokemon', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if(!pokemonId) return res.json({ error: 'No pokemon id' }); if(user.pokemonTeam.length <= 1) return res.json({ error: 'Não pode abandonar o último pokémon.' }); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if(index === -1) return res.json({ error: 'Pokemon not found' }); user.pokemonTeam.splice(index, 1); await user.save(); res.json({ success: true }); });
app.post('/api/buy-item', async (req, res) => { const { userId, itemId, qty } = req.body; const q = Math.max(1, parseInt(qty) || 1); const prices = { pokeball: 50, rareCandy: 2000 }; if(!prices[itemId]) return res.json({ error: 'Item inválido' }); const cost = prices[itemId] * q; const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if((user.money || 0) < cost) return res.json({ error: 'Saldo insuficiente' }); user.money = (user.money || 0) - cost; if(itemId === 'pokeball') user.pokeballs = (user.pokeballs || 0) + q; if(itemId === 'rareCandy') user.rareCandy = (user.rareCandy || 0) + q; await user.save(); res.json({ success: true, money: user.money, pokeballs: user.pokeballs, rareCandy: user.rareCandy }); });

// --- ROTA DE USO DE ITEM (ESSENCIAL PARA RARE CANDY) ---
app.post('/api/use-item', async (req, res) => { 
    const { userId, itemId, pokemonId, qty } = req.body; 
    const q = Math.max(1, parseInt(qty) || 1); 
    const user = await User.findById(userId); 
    if(!user) return res.json({ error: 'User not found' }); 
    
    if(itemId === 'rareCandy') { 
        if(!pokemonId) return res.json({ error: 'pokemonId required' }); 
        let poke = null; 
        try { poke = user.pokemonTeam.id(pokemonId); } catch(e) { poke = user.pokemonTeam.find(p => p._id.toString() === (pokemonId || '')); } 
        if(!poke) return res.json({ error: 'Pokemon not found' }); 
        if((user.rareCandy || 0) < q) return res.json({ error: 'Sem doces suficientes.' }); 
        
        const base = await BasePokemon.findOne({ id: poke.baseId }); 
        const oldLevel = poke.level || 1; 
        
        if (oldLevel >= 100) return res.json({ error: 'Nível máximo atingido!' });
        
        poke.level = Math.min(100, oldLevel + q); 
        if(base) poke.stats = calculateStats(base.baseStats, poke.level); 
        poke.currentHp = poke.stats.hp; // Cura ao subir de nível
        
        user.rareCandy = (user.rareCandy || 0) - q; 
        await user.save(); 
        return res.json({ success: true, rareCandy: user.rareCandy, pokemon: { instanceId: poke._id, level: poke.level, hp: poke.currentHp, maxHp: poke.stats.hp } }); 
    } 
    return res.json({ error: 'Item cannot be used here' }); 
});

app.post('/battle/wild', async (req, res) => { const { userId } = req.body; const user = await User.findById(userId); const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0]; if(!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Todos os seus Pokémons estão desmaiados! Cure-os no Centro." }); const possibleSpawns = await BasePokemon.find({ spawnLocation: 'forest' }); if(possibleSpawns.length === 0) return res.json({ error: "Nenhum pokemon." }); const wildBase = pickWeightedPokemon(possibleSpawns); const wildLevel = Math.floor(Math.random() * (wildBase.maxSpawnLevel - wildBase.minSpawnLevel + 1)) + wildBase.minSpawnLevel; const wildEntity = await createBattleInstance(wildBase.id, wildLevel); const userBase = await BasePokemon.findOne({ id: userPokeData.baseId }); const userEntity = userPokemonToEntity(userPokeData, userBase); userEntity.playerName = user.username; userEntity.skin = user.skin; const battleId = `wild_${Date.now()}`; activeBattles[battleId] = { p1: userEntity, p2: wildEntity, type: 'wild', userId: user._id, turn: 1 }; res.json({ battleId }); });
app.post('/battle', async (req, res) => { const { fighterId, playerName, playerSkin, userId } = req.body; const user = await User.findById(userId); if(!user) return res.redirect('/'); const userPokeData = user.pokemonTeam.id(fighterId); if(!userPokeData || userPokeData.currentHp <= 0) { return res.redirect('/lobby?userId=' + userId); } const b1Base = await BasePokemon.findOne({ id: userPokeData.baseId }); const p1 = userPokemonToEntity(userPokeData, b1Base); p1.playerName = playerName; p1.skin = playerSkin; const allBases = await BasePokemon.find(); if(allBases.length === 0) return res.redirect('/lobby?userId=' + userId); const randomBase = allBases[Math.floor(Math.random() * allBases.length)]; const cpuLevel = Math.max(1, p1.level + (Math.random() > 0.5 ? 1 : -1)); const s2 = calculateStats(randomBase.baseStats, cpuLevel); let cpuMoves = randomBase.movePool ? randomBase.movePool.filter(m => m.level <= cpuLevel).map(m => m.moveId) : []; if(cpuMoves.length === 0) cpuMoves = ['tackle']; if(cpuMoves.length > 4) cpuMoves = cpuMoves.sort(() => 0.5 - Math.random()).slice(0, 4); const p2 = { instanceId: 'p2_cpu_' + Date.now(), baseId: randomBase.id, name: randomBase.name, type: randomBase.type, level: cpuLevel, hp: s2.hp, maxHp: s2.hp, energy: s2.energy, maxEnergy: s2.energy, stats: s2, moves: cpuMoves.map(mid => ({...MOVES_LIBRARY[mid], id:mid})), sprite: randomBase.sprite, playerName: 'CPU', skin: 'char2' }; const battleId = 'local_' + Date.now(); activeBattles[battleId] = { p1, p2, type: 'local', userId, turn: 1, mode: 'manual' }; res.redirect('/battle/' + battleId); });
app.get('/battle/:id', async (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const battle = activeBattles[req.params.id]; if(!battle) return res.redirect('/'); let switchable = []; if (battle.userId) { const user = await User.findById(battle.userId); if (user) { for (let p of user.pokemonTeam) { if (p._id.toString() !== battle.p1.instanceId && p.currentHp > 0) { const b = await BasePokemon.findOne({ id: p.baseId }); if(b) switchable.push(userPokemonToEntity(p, b)); } } } } const bg = battle.type === 'wild' ? 'forest_bg.png' : 'battle_bg.png'; res.render('battle', { p1: battle.p1, p2: battle.p2, battleId: req.params.id, battleMode: battle.type === 'local' ? 'manual' : battle.type, isSpectator: false, myRoleId: battle.p1.instanceId, realUserId: battle.userId, playerName: battle.p1.playerName, playerSkin: battle.p1.skin, bgImage: bg, battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable }); });
app.post('/battle/online', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const { roomId, meData, opponentData } = req.body; if (!onlineBattles[roomId]) return res.redirect('/'); const me = JSON.parse(meData); const op = JSON.parse(opponentData); res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, realUserId: me.userId, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, bgImage: 'battle_bg.png', battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable: [] }); });
app.post('/battle/spectate', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const { roomId, playerName, playerSkin } = req.body; const battle = onlineBattles[roomId]; if (!battle) return res.redirect('/'); res.render('battle', { p1: battle.p1, p2: battle.p2, battleMode: 'online', battleId: roomId, myRoleId: 'spectator', realUserId: '', playerName: playerName, playerSkin: playerSkin, isSpectator: true, bgImage: 'battle_bg.png', battleData: JSON.stringify({ log: [] }), switchable: [] }); });
app.post('/api/turn', async (req, res) => {
    const { battleId, action, moveId, isForced } = req.body; 
    const battle = activeBattles[battleId];
    if(!battle) { return res.json({ finished: true }); }
    try {
        let p1 = battle.p1; const p2 = battle.p2; const events = [];
        let threwPokeball = false;
        if (action === 'switch') {
            const user = await User.findById(battle.userId);
            if (!user) return res.json({ events: [{type:'MSG', text:'Erro de usuário'}]});
            if (!isForced) { const prevPoke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId); if(prevPoke) { prevPoke.currentHp = p1.hp; } }
            const newPokeData = user.pokemonTeam.find(p => p._id.toString() === moveId); 
            if (!newPokeData || newPokeData.currentHp <= 0) return res.json({ events: [{type:'MSG', text:'Pokemon inválido ou desmaiado!'}]});
            const base = await BasePokemon.findOne({ id: newPokeData.baseId });
            const newEntity = userPokemonToEntity(newPokeData, base); newEntity.playerName = p1.playerName; newEntity.skin = p1.skin;
            battle.p1 = newEntity; p1 = battle.p1; 
            await user.save();
            events.push({ type: 'MSG', text: `Vai, ${p1.name}!` });
            if (p2.hp > 0 && !isForced) { performEnemyTurn(p2, p1, events); }
            return res.json({ events, p1State: { hp: p1.hp, energy: p1.energy, maxHp: p1.maxHp, name: p1.name, level: p1.level, sprite: p1.sprite, moves: p1.moves }, p2State: { hp: p2.hp }, switched: true, newP1Id: p1.instanceId });
        }
        if (action === 'catch') {
            if (battle.type !== 'wild') { events.push({ type: 'MSG', text: 'Não é possível capturar aqui.' }); return res.json({ events }); } 
            else {
                try {
                    const user = await User.findById(battle.userId);
                    if(!user) { events.push({ type: 'MSG', text: 'Erro de usuário.' }); return res.json({ events }); }
                    if((user.pokeballs || 0) <= 0) { events.push({ type: 'MSG', text: 'Sem Pokébolas!' }); return res.json({ events }); }
                    user.pokeballs = (user.pokeballs || 0) - 1; threwPokeball = true;
                    const hpPercent = p2.hp / p2.maxHp; 
                    const chance = (p2.catchRate * (1 - hpPercent)) + 0.15; 
                    if (Math.random() < chance) {
                        const activeP1Index = user.pokemonTeam.findIndex(p => p._id.toString() === p1.instanceId);
                        if (activeP1Index !== -1) user.pokemonTeam[activeP1Index].currentHp = p1.hp;
                        const newStats = calculateStats(p2.stats, p2.level);
                        const newPokeObj = { baseId: p2.baseId, nickname: p2.name, level: p2.level, currentHp: newStats.hp, stats: newStats, moves: p2.moves.map(m => m.id), learnedMoves: p2.moves.map(m => m.id) };
                        let sentToPC = false; if (!user.pc) user.pc = [];
                        if (user.pokemonTeam.length < 6) { user.pokemonTeam.push(newPokeObj); events.push({ type: 'MSG', text: `Gotcha! ${p2.name} capturado!` }); } 
                        else { user.pc.push(newPokeObj); sentToPC = true; events.push({ type: 'MSG', text: `Time cheio! ${p2.name} foi enviado para o PC.` }); }
                        await user.save(); delete activeBattles[battleId];
                        return res.json({ events, finished: true, win: true, captured: true, sentToPC, winnerId: p1.instanceId, threw: threwPokeball });
                    } else { await user.save(); events.push({ type: 'MSG', text: `${p2.name} escapou!` }); performEnemyTurn(p2, p1, events); }
                } catch (e) { console.error('catch error', e); events.push({ type: 'MSG', text: 'Erro interno.' }); return res.json({ events }); }
            }
        } 
        else if (action === 'run') {
            if (Math.random() > 0.4) { delete activeBattles[battleId]; return res.json({ events: [{type:'MSG', text:'Você fugiu!'}], finished: true, fled: true }); }
            else { events.push({ type: 'MSG', text: `Falha ao fugir!` }); performEnemyTurn(p2, p1, events); }
        } 
        else if (action === 'move') {
            const p1Move = p1.moves.find(m => m.id === moveId);
            if (p1.stats.speed >= p2.stats.speed) { processAction(p1, p2, p1Move, events); if (p2.hp > 0) performEnemyTurn(p2, p1, events); } 
            else { performEnemyTurn(p2, p1, events); if (p1.hp > 0) processAction(p1, p2, p1Move, events); }
        }
        if (p1.hp <= 0) { 
            const user = await User.findById(battle.userId);
            if(user) { 
                const poke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId);
                if(poke) { poke.currentHp = 0; await user.save(); }
                const hasAlive = user.pokemonTeam.some(p => p.currentHp > 0);
                if (hasAlive) {
                    events.push({ type: 'MSG', text: `${p1.name} desmaiou!` });
                    let switchable = [];
                    for (let p of user.pokemonTeam) { if (p.currentHp > 0) { const b = await BasePokemon.findOne({ id: p.baseId }); if(b) switchable.push(userPokemonToEntity(p, b)); } }
                    return res.json({ events, forceSwitch: true, switchable });
                }
            }
            delete activeBattles[battleId]; return res.json({ events, finished: true, win: false, winnerId: p2.instanceId, threw: threwPokeball }); 
        }
        if (p2.hp <= 0) {
            let xpGained = 0; if(battle.type === 'wild') xpGained = p2.xpYield || 25; else if(battle.type === 'local') xpGained = 30;
            if(xpGained > 0) {
                events.push({ type: 'MSG', text: `Ganhou ${xpGained} XP!` });
                const user = await User.findById(battle.userId); 
                if(user) {
                    let poke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId);
                    if (poke) { 
                        poke.xp += xpGained; const xpNext = getXpForNextLevel(poke.level);
                        if (poke.xp >= xpNext && poke.level < 100) {
                            poke.level++; poke.xp = 0; events.push({ type: 'MSG', text: `${poke.nickname} subiu para o nível ${poke.level}!` });
                            const baseData = await BasePokemon.findOne({ id: poke.baseId });
                            if (baseData.movePool) { const newMove = baseData.movePool.find(m => m.level === poke.level); if(newMove) { if(!poke.learnedMoves) poke.learnedMoves = [...poke.moves]; if(!poke.learnedMoves.includes(newMove.moveId)) { poke.learnedMoves.push(newMove.moveId); events.push({ type: 'MSG', text: `Aprendeu ${MOVES_LIBRARY[newMove.moveId].name}!` }); if(poke.moves.length < 4) poke.moves.push(newMove.moveId); } } } 
                            if (baseData.evolution && poke.level >= baseData.evolution.level) { const nextPoke = await BasePokemon.findOne({ id: baseData.evolution.targetId }); if(nextPoke) { poke.baseId = nextPoke.id; poke.nickname = nextPoke.name; events.push({ type: 'MSG', text: `Evoluiu para ${nextPoke.name}!` }); } }
                            const currentBase = await BasePokemon.findOne({ id: poke.baseId }); poke.stats = calculateStats(currentBase.baseStats, poke.level);
                        }
                        poke.currentHp = p1.hp; await user.save(); 
                    }
                }
            }
            if (battle.type === 'local') { try { const user = await User.findById(battle.userId); if (user) { const reward = Math.max(5, (p2.level || 1) * 5); user.money = (user.money || 0) + reward; await user.save(); events.push({ type: 'MSG', text: `Ganhou ${reward} moedas!` }); } } catch (e) {} }
            delete activeBattles[battleId]; return res.json({ events, finished: true, win: true, winnerId: p1.instanceId, threw: threwPokeball });
        }
        return res.json({ events, p1State: { hp: p1.hp, energy: p1.energy }, p2State: { hp: p2.hp }, threw: threwPokeball });
    } catch (err) { console.error('api/turn error', err); return res.json({ events: [{ type: 'MSG', text: 'Erro interno da batalha.' }], finished: true }); }
});

function performEnemyTurn(attacker, defender, events) { const move = attacker.moves[Math.floor(Math.random() * attacker.moves.length)]; processAction(attacker, defender, move, events); }
function processAction(attacker, defender, move, logArray) {
    if(!move) { logArray.push({ type: 'MSG', text: `${attacker.name} hesitou!` }); return; }
    if (attacker.energy >= move.cost) attacker.energy -= move.cost; else { logArray.push({ type: 'MSG', text: `${attacker.name} cansou!` }); return; }
    logArray.push({ type: 'USE_MOVE', actorId: attacker.instanceId || 'wild', moveName: move.name, moveIcon: move.icon, moveElement: move.element || 'normal', moveCategory: move.category || 'physical', moveType: move.type, cost: move.cost, newEnergy: attacker.energy });
    if(move.type === 'heal') { const oldHp = attacker.hp; attacker.hp = Math.min(attacker.maxHp, attacker.hp + move.power); logArray.push({ type: 'HEAL', actorId: attacker.instanceId || 'wild', amount: attacker.hp - oldHp, newHp: attacker.hp }); } 
    else if (move.type === 'defend') { logArray.push({ type: 'MSG', text: `${attacker.name} se protegeu!` }); } 
    else { 
        const multiplier = getTypeEffectiveness(move.element, defender.type);
        const level = attacker.level || 1; const atk = attacker.stats.attack; const def = defender.stats.defense;
        const random = (Math.floor(Math.random() * 16) + 85) / 100;
        let damage = Math.floor((((2 * level / 5 + 2) * move.power * (atk / def)) / 50 + 2) * multiplier * random);
        if (damage < 1) damage = 1; defender.hp -= damage; 
        logArray.push({ type: 'ATTACK_HIT', attackerId: attacker.instanceId || 'wild', targetId: defender.instanceId || 'wild', damage, newHp: defender.hp, isEffective: multiplier > 1, isNotEffective: multiplier < 1 && multiplier > 0, isBlocked: multiplier === 0 }); 
    }
}

// SOCKET.IO
io.on('connection', (socket) => {
    socket.on('join_room', (roomId) => { socket.join(roomId); });
    socket.on('enter_map', (data) => { if (data && data.userId) { const existing = Object.entries(players).find(([sid, p]) => p.userId && p.userId.toString() === data.userId.toString()); if (existing) { const prevId = existing[0]; try { const prevSocket = io.sockets.sockets.get(prevId); if (prevSocket) { prevSocket.emit('duplicate_session', { reason: 'another_session' }); prevSocket.disconnect(true); } } catch (e) { } if (players[prevId] && players[prevId].map) io.to(players[prevId].map).emit('player_left', prevId); delete players[prevId]; } } socket.join(data.map); const startX = data.x !== undefined ? data.x : 50; const startY = data.y !== undefined ? data.y : 50; players[socket.id] = { id: socket.id, userId: data.userId, ...data, x: startX, y: startY, direction: 'down', isSearching: false }; const mapPlayers = Object.values(players).filter(p => p.map === data.map); socket.emit('map_state', mapPlayers); socket.to(data.map).emit('player_joined', players[socket.id]); });
    socket.on('move_player', (data) => { if (players[socket.id]) { const p = players[socket.id]; const dx = data.x - p.x; const dy = data.y - p.y; let dir = p.direction; if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'; else dir = dy > 0 ? 'down' : 'up'; p.x = data.x; p.y = data.y; p.direction = dir; io.to(p.map).emit('player_moved', { id: socket.id, x: data.x, y: data.y, direction: dir }); } });
    socket.on('send_chat', (data) => { const p = players[socket.id]; if (p) { const payload = { id: socket.id, msg: (typeof data === 'object' ? data.msg : data).substring(0, 50) }; const room = (typeof data === 'object' ? data.roomId : null) || p.map; io.to(room).emit('chat_message', payload); } });
    socket.on('check_encounter', (data) => { const grassId = data && data.grassId; if (!grassId || !GRASS_PATCHES.includes(grassId)) return; const chance = GRASS_CHANCE[grassId] || 0.3; if (Math.random() < chance) socket.emit('encounter_found'); });
    socket.on('disconnect', () => { matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id); if (players[socket.id]) { const map = players[socket.id].map; delete players[socket.id]; io.to(map).emit('player_left', socket.id); } });
    socket.on('cancel_match', () => { matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id); if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } });
    socket.on('find_match', async (fighterId, userId, playerName, playerSkin, bet = 0) => { if(matchmakingQueue.find(u => u.socket.id === socket.id)) return; if(players[socket.id]) { players[socket.id].isSearching = true; io.emit('player_updated', players[socket.id]); } try { const user = await User.findById(userId); if(!user) { socket.emit('search_error', 'User error'); return; } if(bet && user.money < bet) { socket.emit('search_error', 'Saldo insuficiente para aposta'); if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } return; } const userPokeData = user.pokemonTeam.id(fighterId); if(!userPokeData || userPokeData.currentHp <= 0) { if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } socket.emit('search_error', 'Pokémon desmaiado ou inválido!'); return; } const base = await BasePokemon.findOne({ id: userPokeData.baseId }); const playerEntity = userPokemonToEntity(userPokeData, base); playerEntity.userId = userId; playerEntity.id = socket.id; playerEntity.playerName = playerName; playerEntity.skin = playerSkin; matchmakingQueue.push({ socket, entity: playerEntity, bet: Number(bet) || 0, userId }); if (matchmakingQueue.length >= 2) { let pairIndex = -1; let p1 = null; let p2 = null; for (let i = 0; i < matchmakingQueue.length; i++) { for (let j = i+1; j < matchmakingQueue.length; j++) { const a = matchmakingQueue[i]; const b = matchmakingQueue[j]; const betToUse = Math.min(a.bet || 0, b.bet || 0); try { const userA = await User.findById(a.userId); const userB = await User.findById(b.userId); if(userA && userB && userA.money >= betToUse && userB.money >= betToUse) { p1 = a; p2 = b; pairIndex = i; break; } } catch(e) { continue; } } if(pairIndex !== -1) break; } if(p1 && p2) { matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== p1.socket.id && u.socket.id !== p2.socket.id); if(players[p1.socket.id]) { players[p1.socket.id].isSearching = false; io.emit('player_updated', players[p1.socket.id]); } if(players[p2.socket.id]) { players[p2.socket.id].isSearching = false; io.emit('player_updated', players[p2.socket.id]); } const roomId = `room_${Date.now()}`; const betAmount = Math.min(p1.bet || 0, p2.bet || 0); onlineBattles[roomId] = { p1: p1.entity, p2: p2.entity, turn: 1, bet: betAmount }; p1.socket.emit('match_found', { roomId, me: p1.entity, opponent: p2.entity, bet: betAmount }); p2.socket.emit('match_found', { roomId, me: p2.entity, opponent: p1.entity, bet: betAmount }); } } } catch(e) { console.error(e); } });
    socket.on('join_spectator', ({ roomId, name, skin }) => { socket.join(roomId); if (!roomSpectators[roomId]) roomSpectators[roomId] = {}; roomSpectators[roomId][socket.id] = { id: socket.id, name, skin, x: Math.random() * 90, y: Math.random() * 80 }; socket.emit('spectators_update', roomSpectators[roomId]); io.to(roomId).emit('spectator_joined', roomSpectators[roomId][socket.id]); });
    socket.on('spectator_move', ({ roomId, x, y }) => { if (roomSpectators[roomId] && roomSpectators[roomId][socket.id]) { roomSpectators[roomId][socket.id].x = x; roomSpectators[roomId][socket.id].y = y; io.to(roomId).emit('spectator_moved', { id: socket.id, x, y }); } });
    socket.on('request_active_battles', () => { const list = Object.keys(onlineBattles).map(roomId => { const b = onlineBattles[roomId]; return { id: roomId, p1Name: b.p1.playerName, p1Skin: b.p1.skin, p2Name: b.p2.playerName, p2Skin: b.p2.skin, turn: b.turn }; }); socket.emit('active_battles_list', list); });
    socket.on('online_move', async ({ roomId, moveId, playerId }) => { const battle = onlineBattles[roomId]; if (!battle || battle.processing) return; const isP1 = (String(playerId) === String(battle.p1.id)); const attacker = isP1 ? battle.p1 : battle.p2; let chosenMove = null; if (moveId !== 'rest') chosenMove = attacker.moves.find(m => m.id === moveId); attacker.nextMove = chosenMove || 'rest'; attacker.ready = true; if (battle.p1.ready && battle.p2.ready) { battle.processing = true; const events = []; const p1 = battle.p1; const p2 = battle.p2; if (p1.hp > 0 && p2.hp > 0) { let first = p1.stats.speed >= p2.stats.speed ? p1 : p2; let second = first === p1 ? p2 : p1; const runMove = (atk, def) => { if (atk.nextMove === 'rest') { atk.energy += 5; events.push({ type: 'REST', actorId: atk.id, newEnergy: atk.energy }); } else { processAction(atk, def, atk.nextMove, events); } }; runMove(first, second); if (second.hp > 0) runMove(second, first); } p1.ready = false; p2.ready = false; delete p1.nextMove; delete p2.nextMove; battle.processing = false; let winnerId = null; if (p1.hp <= 0 || p2.hp <= 0) { if (p1.hp > 0) winnerId = p1.id; else if (p2.hp > 0) winnerId = p2.id; else winnerId = 'draw'; const betAmount = (battle && battle.bet) ? Number(battle.bet) : 0; if (betAmount > 0 && winnerId && winnerId !== 'draw') { try { const winner = (winnerId === p1.id) ? await User.findById(battle.p1.userId) : await User.findById(battle.p2.userId); const loser = (winnerId === p1.id) ? await User.findById(battle.p2.userId) : await User.findById(battle.p1.userId); if (winner && loser) { const actualDeduct = Math.min(loser.money || 0, betAmount); loser.money = Math.max(0, (loser.money || 0) - actualDeduct); winner.money = (winner.money || 0) + actualDeduct; await loser.save(); await winner.save(); events.push({ type: 'MSG', text: `${winner.username} ganhou ${actualDeduct} moedas!` }); } } catch (e) { console.error('bet transfer error', e); } } delete onlineBattles[roomId]; } io.to(roomId).emit('turn_result', { events, winnerId }); } else { socket.to(roomId).emit('opponent_ready'); } });
});

seedDatabase().then(() => { const PORT = process.env.PORT || 3000; server.listen(PORT, () => console.log(`Server ON Port ${PORT}`)); });
