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

// --- CONFIGURAÇÃO MONGO ---
// IMPORTANTE: Verifique se sua senha e usuário estão corretos aqui!
const MONGO_URI = "mongodb+srv://isaachonorato41:brasil2021@cluster0.rxemo.mongodb.net/?appName=Cluster0";

// Adicionei opções para evitar alguns erros de timeout
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Conectado'))
    .catch(e => console.log('❌ Erro na conexão do MongoDB:', e.message));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

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

// SEED DATABASE
async function seedDatabase() {
    try {
        // Verifica se a conexão está pronta antes de tentar consultar
        if (mongoose.connection.readyState !== 1) return;

        const count = await BasePokemon.countDocuments();
        if (count === 0) {
            console.log("🌱 Banco vazio. Criando Iniciais...");
            const starters = [
                { id: 'bulbasaur', name: 'Bulbasaur', type: 'plant', baseStats: { hp: 45, energy: 25, attack: 49, defense: 49, speed: 45 }, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/1.png', spawnLocation: 'forest', minSpawnLevel: 2, maxSpawnLevel: 5, catchRate: 0.6, movePool: [{level: 1, moveId: 'tackle'}, {level: 3, moveId: 'vine_whip'}, {level: 8, moveId: 'solar_beam'}] },
                { id: 'charmander', name: 'Charmander', type: 'fire', baseStats: { hp: 39, energy: 25, attack: 52, defense: 43, speed: 65 }, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/4.png', spawnLocation: 'forest', minSpawnLevel: 2, maxSpawnLevel: 5, catchRate: 0.6, movePool: [{level: 1, moveId: 'scratch'}, {level: 3, moveId: 'ember'}, {level: 8, moveId: 'flamethrower'}] },
                { id: 'squirtle', name: 'Squirtle', type: 'water', baseStats: { hp: 44, energy: 25, attack: 48, defense: 65, speed: 43 }, sprite: 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/7.png', spawnLocation: 'forest', minSpawnLevel: 2, maxSpawnLevel: 5, catchRate: 0.6, movePool: [{level: 1, moveId: 'tackle'}, {level: 3, moveId: 'water_gun'}, {level: 8, moveId: 'hydro_pump'}] }
            ];
            await BasePokemon.insertMany(starters);
            console.log("✅ Iniciais criados com sucesso!");
        }
    } catch (e) { console.error("Erro no Seed (pode ser conexão):", e.message); }
}

function calculateStats(base, level) {
    const mult = 1 + (level * 0.05); 
    return {
        hp: Math.floor((base.hp * 2 * level / 100) + level + 10),
        energy: Math.floor(base.energy + (level * 0.1)), 
        attack: Math.floor(base.attack * mult),
        defense: Math.floor(base.defense * mult),
        speed: Math.floor(base.speed * mult)
    };
}

async function createBattleInstance(baseId, level) {
    const base = await BasePokemon.findOne({ id: baseId }).lean();
    if(!base) return null;
    const stats = calculateStats(base.baseStats, level);
    let moves = base.movePool ? base.movePool.filter(m => m.level <= level).map(m => m.moveId) : [];
    if(moves.length === 0) moves = ['tackle'];
    return {
        instanceId: 'wild_' + Date.now(), baseId: base.id, name: base.name, type: base.type, level: level,
        maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy,
        stats: stats, moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id),
        sprite: base.sprite, catchRate: base.catchRate || 0.5, xpYield: level * 20, isWild: true
    };
}

function userPokemonToEntity(userPoke, baseData) {
    const movesObj = userPoke.moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id);
    return {
        instanceId: userPoke._id.toString(), baseId: userPoke.baseId, name: userPoke.nickname || baseData.name,
        type: baseData.type, level: userPoke.level, maxHp: userPoke.stats.hp,
        hp: userPoke.currentHp > 0 ? userPoke.currentHp : userPoke.stats.hp,
        maxEnergy: userPoke.stats.energy, energy: userPoke.stats.energy,
        stats: userPoke.stats, moves: movesObj, sprite: baseData.sprite, isWild: false,
        xp: userPoke.xp, xpToNext: getXpForNextLevel(userPoke.level)
    };
}

// --- ROTAS (Com Try/Catch para não crashar se o banco falhar) ---

app.get('/', async (req, res) => { 
    try {
        const starters = await BasePokemon.find().limit(3).lean();
        res.render('login', { error: null, skinCount: SKIN_COUNT, starters }); 
    } catch (e) {
        // Se der erro no banco, renderiza sem starters para não crashar a página
        console.error("Erro ao carregar home:", e.message);
        res.render('login', { error: "Erro de conexão com o banco", skinCount: SKIN_COUNT, starters: [] }); 
    }
});

app.post('/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        const user = await User.findOne({ username, password });
        if (user) {
            res.redirect('/lobby?userId=' + user._id);
        } else {
            // Se senha errada, tenta buscar starters de novo
            let starters = [];
            try { starters = await BasePokemon.find().limit(3).lean(); } catch(e){}
            res.render('login', { error: 'Credenciais inválidas', skinCount: SKIN_COUNT, starters });
        }
    } catch (e) {
        res.render('login', { error: 'Erro no servidor/banco', skinCount: SKIN_COUNT, starters: [] });
    }
});

app.post('/register', async (req, res) => { 
    const { username, password, skin, starterId } = req.body; 
    try { 
        let starterTeam = []; 
        if (starterId) { 
            const starter = await BasePokemon.findOne({ id: starterId }); 
            if (starter) { 
                const initialStats = calculateStats(starter.baseStats, 1); 
                let initialMoves = starter.movePool.filter(m => m.level <= 1).map(m => m.moveId); 
                if(initialMoves.length === 0) initialMoves = ['tackle']; 
                starterTeam.push({ 
                    baseId: starter.id, nickname: starter.name, level: 1, currentHp: initialStats.hp, 
                    stats: initialStats, moves: initialMoves, learnedMoves: initialMoves 
                }); 
            } 
        } 
        const newUser = new User({ username, password, skin, pokemonTeam: starterTeam }); 
        await newUser.save(); 
        res.redirect('/lobby?userId=' + newUser._id); 
    } catch (e) { 
        let starters = [];
        try { starters = await BasePokemon.find().limit(3).lean(); } catch(err){}
        res.render('login', { error: 'Usuário já existe ou erro no banco.', skinCount: SKIN_COUNT, starters }); 
    } 
});

app.get('/lobby', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const teamData = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({id: p.baseId}); if(base) teamData.push(userPokemonToEntity(p, base)); } const allPokes = await BasePokemon.find().lean(); res.render('room', { user, playerName: user.username, playerSkin: user.skin, entities: allPokes, team: teamData, isAdmin: user.isAdmin, skinCount: SKIN_COUNT }); });
app.get('/forest', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); res.render('forest', { user, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin }); });
app.get('/lab', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user || !user.isAdmin) return res.redirect('/'); const pokemons = await BasePokemon.find(); res.render('create', { types: EntityType, moves: MOVES_LIBRARY, pokemons, user }); });
app.post('/lab/create', upload.single('sprite'), async (req, res) => { const { name, type, hp, energy, atk, def, spd, location, minLvl, maxLvl, catchRate, movesJson, evoTarget, evoLevel, existingId } = req.body; const stats = { hp: parseInt(hp), energy: parseInt(energy), attack: parseInt(atk), defense: parseInt(def), speed: parseInt(spd) }; let movePool = []; try { movePool = JSON.parse(movesJson); } catch(e){} const data = { name, type, baseStats: stats, spawnLocation: location, minSpawnLevel: parseInt(minLvl), maxSpawnLevel: parseInt(maxLvl), catchRate: parseFloat(catchRate), evolution: { targetId: evoTarget, level: parseInt(evoLevel) || 100 }, movePool: movePool }; if(req.file) data.sprite = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; if(existingId) await BasePokemon.findOneAndUpdate({ id: existingId }, data); else { data.id = Date.now().toString(); await new BasePokemon(data).save(); } res.redirect(req.header('Referer') || '/'); });
app.post('/api/heal', async (req, res) => { const { userId } = req.body; const user = await User.findById(userId); if (!user) return res.status(404).json({ error: 'Usuário não encontrado' }); let count = 0; for (let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); if (base) { p.stats = calculateStats(base.baseStats, p.level); p.currentHp = p.stats.hp; count++; } } await user.save(); res.json({ success: true, message: `${count} Pokémons curados!` }); });
app.get('/api/fix-stats', async (req, res) => { const users = await User.find(); let count = 0; for(let u of users) { for(let p of u.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); if(base) { p.stats = calculateStats(base.baseStats, p.level); if(!p.learnedMoves || p.learnedMoves.length === 0) p.learnedMoves = [...p.moves]; count++; } } await u.save(); } res.send(`Stats corrigidos para ${count} pokémons!`); });
app.get('/api/me', async (req, res) => { const { userId } = req.query; if(!userId) return res.status(400).json({ error: 'No ID' }); const user = await User.findById(userId); if(!user) return res.status(404).json({ error: 'User not found' }); const teamWithSprites = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); const nextXp = getXpForNextLevel(p.level); const allLearned = p.learnedMoves && p.learnedMoves.length > 0 ? p.learnedMoves : p.moves; teamWithSprites.push({ instanceId: p._id, name: p.nickname, level: p.level, hp: p.currentHp, maxHp: p.stats.hp, xp: p.xp, xpToNext: nextXp, sprite: base ? base.sprite : '', moves: p.moves, learnedMoves: allLearned }); } res.json({ team: teamWithSprites, allMoves: MOVES_LIBRARY }); });
app.post('/api/equip-move', async (req, res) => { const { userId, pokemonId, moves } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const poke = user.pokemonTeam.id(pokemonId); if(!poke) return res.json({error: "Pokemon not found"}); if(moves.length < 1 || moves.length > 4) return res.json({error: "Deve ter entre 1 e 4 ataques."}); const validMoves = moves.every(m => poke.learnedMoves.includes(m) || poke.moves.includes(m)); if(!validMoves) return res.json({error: "Ataque inválido."}); poke.moves = moves; await user.save(); res.json({success: true}); });

// BATTLES
app.post('/battle/wild', async (req, res) => { const { userId } = req.body; const user = await User.findById(userId); const possibleSpawns = await BasePokemon.find({ spawnLocation: 'forest' }); if(possibleSpawns.length === 0) return res.json({ error: "Nenhum pokemon." }); const wildBase = possibleSpawns[Math.floor(Math.random() * possibleSpawns.length)]; const wildLevel = Math.floor(Math.random() * (wildBase.maxSpawnLevel - wildBase.minSpawnLevel + 1)) + wildBase.minSpawnLevel; const wildEntity = await createBattleInstance(wildBase.id, wildLevel); const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0]; if(!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Seus pokemons estão desmaiados!" }); const userBase = await BasePokemon.findOne({ id: userPokeData.baseId }); const userEntity = userPokemonToEntity(userPokeData, userBase); userEntity.playerName = user.username; userEntity.skin = user.skin; const battleId = `wild_${Date.now()}`; activeBattles[battleId] = { p1: userEntity, p2: wildEntity, type: 'wild', userId: user._id, turn: 1 }; res.json({ battleId }); });
app.post('/battle', async (req, res) => { const { fighterId, playerName, playerSkin, userId } = req.body; const user = await User.findById(userId); if(!user) return res.redirect('/'); const userPokeData = user.pokemonTeam.id(fighterId); if(!userPokeData || userPokeData.currentHp <= 0) { return res.redirect('/lobby?userId=' + userId); } const b1Base = await BasePokemon.findOne({ id: userPokeData.baseId }); const p1 = userPokemonToEntity(userPokeData, b1Base); p1.playerName = playerName; p1.skin = playerSkin; const allBases = await BasePokemon.find(); if(allBases.length === 0) return res.redirect('/lobby?userId=' + userId); const randomBase = allBases[Math.floor(Math.random() * allBases.length)]; const cpuLevel = Math.max(1, p1.level + (Math.random() > 0.5 ? 1 : -1)); const s2 = calculateStats(randomBase.baseStats, cpuLevel); let cpuMoves = randomBase.movePool ? randomBase.movePool.filter(m => m.level <= cpuLevel).map(m => m.moveId) : []; if(cpuMoves.length === 0) cpuMoves = ['tackle']; const p2 = { instanceId: 'p2_cpu_' + Date.now(), baseId: randomBase.id, name: randomBase.name, type: randomBase.type, level: cpuLevel, hp: s2.hp, maxHp: s2.hp, energy: s2.energy, maxEnergy: s2.energy, stats: s2, moves: cpuMoves.map(mid => ({...MOVES_LIBRARY[mid], id:mid})), sprite: randomBase.sprite, playerName: 'CPU', skin: 'char2' }; const battleId = 'local_' + Date.now(); activeBattles[battleId] = { p1, p2, type: 'local', userId, turn: 1, mode: 'manual' }; res.redirect('/battle/' + battleId); });
app.get('/battle/:id', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const battle = activeBattles[req.params.id]; if(!battle) return res.redirect('/'); const bg = battle.type === 'wild' ? 'forest_bg.png' : 'battle_bg.png'; res.render('battle', { p1: battle.p1, p2: battle.p2, battleId: req.params.id, battleMode: battle.type === 'local' ? 'manual' : battle.type, isSpectator: false, myRoleId: battle.p1.instanceId, realUserId: battle.userId, playerName: battle.p1.playerName, playerSkin: battle.p1.skin, bgImage: bg, battleData: JSON.stringify({ log: [{type: 'INIT'}] }) }); });
app.post('/battle/online', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const { roomId, meData, opponentData } = req.body; if (!onlineBattles[roomId]) return res.redirect('/'); const me = JSON.parse(meData); const op = JSON.parse(opponentData); res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, realUserId: me.userId, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, bgImage: 'battle_bg.png', battleData: JSON.stringify({ log: [{type: 'INIT'}] }) }); });
app.post('/battle/spectate', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const { roomId, playerName, playerSkin } = req.body; const battle = onlineBattles[roomId]; if (!battle) return res.redirect('/'); res.render('battle', { p1: battle.p1, p2: battle.p2, battleMode: 'online', battleId: roomId, myRoleId: 'spectator', realUserId: '', playerName: playerName, playerSkin: playerSkin, isSpectator: true, bgImage: 'battle_bg.png', battleData: JSON.stringify({ log: [] }) }); });

app.post('/api/turn', async (req, res) => {
    const { battleId, action, moveId } = req.body; const battle = activeBattles[battleId];
    if(!battle) return res.json({ finished: true });
    const p1 = battle.p1; const p2 = battle.p2; const events = [];

    if (action === 'catch') {
        if(battle.type === 'local') { events.push({type:'MSG', text:'Não pode capturar em treino!'}); } else {
            events.push({ type: 'MSG', text: `Você jogou uma Pokébola!` });
            const hpPercent = p2.hp / p2.maxHp; const chance = (p2.catchRate * (1 - hpPercent)) + 0.1;
            if (Math.random() < chance) {
                events.push({ type: 'MSG', text: `Gotcha! ${p2.name} foi capturado!` });
                const user = await User.findById(battle.userId);
                const newStats = calculateStats(p2.stats, p2.level);
                user.pokemonTeam.push({ 
                    baseId: p2.baseId, nickname: p2.name, level: p2.level, currentHp: newStats.hp, 
                    stats: newStats, moves: p2.moves.map(m => m.id), learnedMoves: p2.moves.map(m => m.id)
                });
                await user.save();
                delete activeBattles[battleId];
                return res.json({ events, finished: true, win: true, captured: true, winnerId: p1.instanceId });
            } else { events.push({ type: 'MSG', text: `${p2.name} escapou!` }); performEnemyTurn(p2, p1, events); }
        }
    } else if (action === 'run') {
        if (Math.random() > 0.4) { delete activeBattles[battleId]; return res.json({ events: [{type:'MSG', text:'Você fugiu!'}], finished: true, fled: true }); }
        else { events.push({ type: 'MSG', text: `Falha ao fugir!` }); performEnemyTurn(p2, p1, events); }
    } else if (action === 'move') {
        const p1Move = p1.moves.find(m => m.id === moveId);
        if (p1.stats.speed >= p2.stats.speed) { processAction(p1, p2, p1Move, events); if (p2.hp > 0) performEnemyTurn(p2, p1, events); } 
        else { performEnemyTurn(p2, p1, events); if (p1.hp > 0) processAction(p1, p2, p1Move, events); }
    }

    if (p1.hp <= 0) { 
        const user = await User.findById(battle.userId);
        if(user) { 
            let poke = null;
            try { poke = user.pokemonTeam.id(p1.instanceId); } catch(e) { poke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId); }
            if(poke) { poke.currentHp = 0; await user.save(); }
        }
        delete activeBattles[battleId]; 
        return res.json({ events, finished: true, win: false, winnerId: p2.instanceId }); 
    }
    if (p2.hp <= 0) {
        let xpGained = 0;
        if(battle.type === 'wild') xpGained = p2.xpYield || 10;
        else if(battle.type === 'local') xpGained = 5;
        if(xpGained > 0) {
            events.push({ type: 'MSG', text: `Ganhou ${xpGained} XP!` });
            const user = await User.findById(battle.userId); 
            if(user) {
                let poke = null;
                try { poke = user.pokemonTeam.id(p1.instanceId); } catch(e) { poke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId); }
                if (poke) { 
                    poke.xp += xpGained;
                    const xpNext = getXpForNextLevel(poke.level);
                    if (poke.xp >= xpNext && poke.level < 100) {
                        poke.level++; poke.xp = 0; events.push({ type: 'MSG', text: `${poke.nickname} subiu para o nível ${poke.level}!` });
                        const baseData = await BasePokemon.findOne({ id: poke.baseId });
                        if (baseData.movePool) { 
                            const newMove = baseData.movePool.find(m => m.level === poke.level); 
                            if(newMove) { 
                                if(!poke.learnedMoves) poke.learnedMoves = [...poke.moves];
                                if(!poke.learnedMoves.includes(newMove.moveId)) {
                                    poke.learnedMoves.push(newMove.moveId);
                                    events.push({ type: 'MSG', text: `Aprendeu ${MOVES_LIBRARY[newMove.moveId].name}!` }); 
                                    if(poke.moves.length < 4) poke.moves.push(newMove.moveId);
                                }
                            } 
                        }
                        if (baseData.evolution && poke.level >= baseData.evolution.level) { const nextPoke = await BasePokemon.findOne({ id: baseData.evolution.targetId }); if(nextPoke) { poke.baseId = nextPoke.id; poke.nickname = nextPoke.name; events.push({ type: 'MSG', text: `Evoluiu para ${nextPoke.name}!` }); } }
                        const currentBase = await BasePokemon.findOne({ id: poke.baseId }); poke.stats = calculateStats(currentBase.baseStats, poke.level);
                    }
                    poke.currentHp = p1.hp;
                    await user.save(); 
                }
            }
        }
        delete activeBattles[battleId]; return res.json({ events, finished: true, win: true, winnerId: p1.instanceId });
    }
    res.json({ events, p1State: { hp: p1.hp, energy: p1.energy }, p2State: { hp: p2.hp } });
});

function performEnemyTurn(attacker, defender, events) { const move = attacker.moves[Math.floor(Math.random() * attacker.moves.length)]; processAction(attacker, defender, move, events); }
function processAction(attacker, defender, move, logArray) {
    if(!move) { logArray.push({ type: 'MSG', text: `${attacker.name} hesitou!` }); return; }
    if (attacker.energy >= move.cost) attacker.energy -= move.cost; else { logArray.push({ type: 'MSG', text: `${attacker.name} cansou!` }); return; }
    logArray.push({ type: 'USE_MOVE', actorId: attacker.instanceId || 'wild', moveName: move.name, moveIcon: move.icon, cost: move.cost, newEnergy: attacker.energy });
    if(move.type === 'heal') { const oldHp = attacker.hp; attacker.hp = Math.min(attacker.maxHp, attacker.hp + move.power); logArray.push({ type: 'HEAL', actorId: attacker.instanceId || 'wild', amount: attacker.hp - oldHp, newHp: attacker.hp }); } 
    else { 
        const multiplier = getTypeEffectiveness(move.element, defender.type);
        const level = attacker.level || 1;
        const atk = attacker.stats.attack;
        const def = defender.stats.defense;
        const random = (Math.floor(Math.random() * 16) + 85) / 100;
        let damage = Math.floor((((2 * level / 5 + 2) * move.power * (atk / def)) / 50 + 2) * multiplier * random);
        if (damage < 1) damage = 1;
        defender.hp -= damage; 
        logArray.push({ type: 'ATTACK_HIT', attackerId: attacker.instanceId || 'wild', targetId: defender.instanceId || 'wild', damage, newHp: defender.hp, isEffective: multiplier > 1, isNotEffective: multiplier < 1 && multiplier > 0, isBlocked: multiplier === 0 }); 
    }
}

io.on('connection', (socket) => {
    socket.on('join_room', (roomId) => { socket.join(roomId); });
    socket.on('enter_map', (data) => { 
        socket.join(data.map); 
        const startX = data.x !== undefined ? data.x : 50; 
        const startY = data.y !== undefined ? data.y : 50; 
        players[socket.id] = { id: socket.id, ...data, x: startX, y: startY, direction: 'down', isSearching: false }; 
        const mapPlayers = Object.values(players).filter(p => p.map === data.map); 
        socket.emit('map_state', mapPlayers); 
        socket.to(data.map).emit('player_joined', players[socket.id]); 
    });
    
    socket.on('move_player', (data) => { if (players[socket.id]) { const p = players[socket.id]; const dx = data.x - p.x; const dy = data.y - p.y; let dir = p.direction; if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'; else dir = dy > 0 ? 'down' : 'up'; p.x = data.x; p.y = data.y; p.direction = dir; io.to(p.map).emit('player_moved', { id: socket.id, x: data.x, y: data.y, direction: dir }); } });
    socket.on('send_chat', (data) => { const p = players[socket.id]; if (p) { const payload = { id: socket.id, msg: (typeof data === 'object' ? data.msg : data).substring(0, 50) }; const room = (typeof data === 'object' ? data.roomId : null) || p.map; io.to(room).emit('chat_message', payload); } });
    socket.on('check_encounter', (data) => { if (data.x < 20 && Math.random() < 0.2) socket.emit('encounter_found'); });
    
    socket.on('disconnect', () => { 
        matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id); 
        if (players[socket.id]) { const map = players[socket.id].map; delete players[socket.id]; io.to(map).emit('player_left', socket.id); } 
    });

    socket.on('cancel_match', () => {
        matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id);
        if(players[socket.id]) {
            players[socket.id].isSearching = false;
            io.emit('player_updated', players[socket.id]); 
        }
    });

    socket.on('find_match', async (fighterId, userId, playerName, playerSkin) => { 
        if(matchmakingQueue.find(u => u.socket.id === socket.id)) return;
        if(players[socket.id]) {
            players[socket.id].isSearching = true;
            io.emit('player_updated', players[socket.id]);
        }
        try {
            const user = await User.findById(userId);
            if(!user) { socket.emit('search_error', 'User error'); return; }
            const userPokeData = user.pokemonTeam.id(fighterId);
            if(!userPokeData || userPokeData.currentHp <= 0) {
                if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); }
                socket.emit('search_error', 'Pokémon desmaiado ou inválido!'); return;
            }
            const base = await BasePokemon.findOne({ id: userPokeData.baseId });
            const playerEntity = userPokemonToEntity(userPokeData, base);
            playerEntity.userId = userId; // Guarda ID real para salvar depois
            playerEntity.id = socket.id; playerEntity.playerName = playerName; playerEntity.skin = playerSkin;
            matchmakingQueue.push({ socket, entity: playerEntity }); 
            if (matchmakingQueue.length >= 2) { 
                const p1 = matchmakingQueue.shift(); 
                const p2 = matchmakingQueue.shift(); 
                if(players[p1.socket.id]) { players[p1.socket.id].isSearching = false; io.emit('player_updated', players[p1.socket.id]); }
                if(players[p2.socket.id]) { players[p2.socket.id].isSearching = false; io.emit('player_updated', players[p2.socket.id]); }
                const roomId = `room_${Date.now()}`; 
                onlineBattles[roomId] = { p1: p1.entity, p2: p2.entity, turn: 1 }; 
                p1.socket.emit('match_found', { roomId, me: p1.entity, opponent: p2.entity }); 
                p2.socket.emit('match_found', { roomId, me: p2.entity, opponent: p1.entity }); 
            }
        } catch(e) { console.error(e); }
    });
    
    socket.on('join_spectator', ({ roomId, name, skin }) => { socket.join(roomId); if (!roomSpectators[roomId]) roomSpectators[roomId] = {}; roomSpectators[roomId][socket.id] = { id: socket.id, name, skin, x: Math.random() * 90, y: Math.random() * 80 }; socket.emit('spectators_update', roomSpectators[roomId]); io.to(roomId).emit('spectator_joined', roomSpectators[roomId][socket.id]); });
    socket.on('spectator_move', ({ roomId, x, y }) => { if (roomSpectators[roomId] && roomSpectators[roomId][socket.id]) { roomSpectators[roomId][socket.id].x = x; roomSpectators[roomId][socket.id].y = y; io.to(roomId).emit('spectator_moved', { id: socket.id, x, y }); } });
    socket.on('request_active_battles', () => { const list = Object.keys(onlineBattles).map(roomId => { const b = onlineBattles[roomId]; return { id: roomId, p1Name: b.p1.playerName, p1Skin: b.p1.skin, p2Name: b.p2.playerName, p2Skin: b.p2.skin, turn: b.turn }; }); socket.emit('active_battles_list', list); });
    socket.on('online_move', ({ roomId, moveId, playerId }) => { const battle = onlineBattles[roomId]; if (!battle || battle.processing) return; const isP1 = (playerId === battle.p1.id); const attacker = isP1 ? battle.p1 : battle.p2; let chosenMove = null; if (moveId !== 'rest') chosenMove = attacker.moves.find(m => m.id === moveId); attacker.nextMove = chosenMove || 'rest'; attacker.ready = true; if (battle.p1.ready && battle.p2.ready) { battle.processing = true; const events = []; const p1 = battle.p1; const p2 = battle.p2; if (p1.hp > 0 && p2.hp > 0) { let first = p1.stats.speed >= p2.stats.speed ? p1 : p2; let second = first === p1 ? p2 : p1; const runMove = (atk, def) => { if (atk.nextMove === 'rest') { atk.energy += 5; events.push({ type: 'REST', actorId: atk.id, newEnergy: atk.energy }); } else { processAction(atk, def, atk.nextMove, events); } }; runMove(first, second); if (second.hp > 0) runMove(second, first); } p1.ready = false; p2.ready = false; delete p1.nextMove; delete p2.nextMove; battle.processing = false; let winnerId = null; if (p1.hp <= 0 || p2.hp <= 0) { if (p1.hp > 0) winnerId = p1.id; else if (p2.hp > 0) winnerId = p2.id; else winnerId = 'draw'; delete onlineBattles[roomId]; } io.to(roomId).emit('turn_result', { events, winnerId }); } else { socket.to(roomId).emit('opponent_ready'); } });
});

seedDatabase().then(() => { const PORT = process.env.PORT || 3000; server.listen(PORT, () => console.log(`Server ON Port ${PORT}`)); });