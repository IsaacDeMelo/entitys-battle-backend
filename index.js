const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const { BasePokemon, User } = require('./models');
const { EntityType, MoveType, TypeChart, MOVES_LIBRARY, getXpForNextLevel } = require('./gameData');

const SKIN_COUNT = 6;

// MONGODB
const MONGO_URI = "mongodb+srv://isaachonorato41:<db_password>@cluster0.rxemo.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Conectado'))
    .catch(err => console.error('Erro Mongo:', err));

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// ESTADOS
const activeBattles = {}; 
const onlineBattles = {}; 
const players = {}; 
let matchmakingQueue = []; 
const roomSpectators = {}; 

// --- FUNÇÕES AUXILIARES ---
function calculateStats(base, level) {
    const mult = 1 + (level * 0.1); 
    return {
        hp: Math.floor(base.hp * mult),
        energy: Math.floor(base.energy * mult),
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
        instanceId: 'wild_' + Date.now(),
        baseId: base.id, name: base.name, type: base.type, level: level,
        maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy,
        stats: stats,
        moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id),
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

// LÓGICA DE DUELO AUTOMÁTICO (CORRIGIDA PARA NÃO FICAR INFINITA)
function duelAutomatic(entityA, entityB) {
    const events = []; events.push({ type: 'INIT' });
    let attacker = entityA.stats.speed >= entityB.stats.speed ? entityA : entityB; 
    let defender = attacker === entityA ? entityB : entityA; 
    let turnCount = 0;
    
    // Limite reduzido para 20 turnos para evitar travamentos
    while (entityA.hp > 0 && entityB.hp > 0 && turnCount < 20) {
        turnCount++; 
        // Lógica simplificada de Auto-Battle
        let move = attacker.moves[Math.floor(Math.random() * attacker.moves.length)];
        
        if (attacker.energy >= move.cost) {
            processAction(attacker, defender, move, events);
        } else {
            attacker.energy += 5; // Rest
            events.push({ type: 'REST', actorId: attacker.instanceId || attacker.id, newEnergy: attacker.energy });
        }

        if (defender.hp <= 0) break; 
        [attacker, defender] = [defender, attacker];
    }
    
    let winner = null; 
    if (entityA.hp > 0 && entityB.hp <= 0) winner = entityA; 
    else if (entityB.hp > 0 && entityA.hp <= 0) winner = entityB;
    
    return { winnerId: winner ? (winner.instanceId || winner.id) : null, log: events };
}

function performEnemyTurn(attacker, defender, events) { 
    const move = attacker.moves[Math.floor(Math.random() * attacker.moves.length)]; 
    processAction(attacker, defender, move, events); 
}

function processAction(attacker, defender, move, logArray) {
    // Validação básica
    if(!move) { logArray.push({ type: 'MSG', text: `${attacker.name} hesitou!` }); return; }
    
    // Custo de Energia
    attacker.energy -= move.cost;

    logArray.push({ type: 'USE_MOVE', actorId: attacker.instanceId || attacker.id || 'wild', moveName: move.name, moveIcon: move.icon, cost: move.cost, newEnergy: attacker.energy });
    
    if(move.type === 'heal') { 
        const oldHp = attacker.hp; 
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + move.power); 
        logArray.push({ type: 'HEAL', actorId: attacker.instanceId || 'wild', amount: attacker.hp - oldHp, newHp: attacker.hp }); 
    } else { 
        let multiplier = 1; 
        if (TypeChart[move.element] && TypeChart[move.element][defender.type] !== undefined) multiplier = TypeChart[move.element][defender.type]; 
        
        // CORREÇÃO: Dano mínimo de 2 para evitar batalhas infinitas
        let damage = Math.floor(((move.power + attacker.stats.attack) - defender.stats.defense) * multiplier); 
        if (damage < 2) damage = 2; 
        
        defender.hp -= damage; 
        logArray.push({ type: 'ATTACK_HIT', attackerId: attacker.instanceId || 'wild', targetId: defender.instanceId || 'wild', damage, newHp: defender.hp, isEffective: multiplier > 1, isNotEffective: multiplier < 1 }); 
    }
}

// --- ROTAS ---
// (MANTIDAS IGUAIS AO ANTERIOR, SÓ COPIANDO PARA GARANTIR INTEGRIDADE)
app.get('/', (req, res) => { res.render('login', { error: null, skinCount: SKIN_COUNT }); });
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) {
        const teamData = [];
        for(let p of user.pokemonTeam) {
            const base = await BasePokemon.findOne({id: p.baseId});
            if(base) teamData.push(userPokemonToEntity(p, base));
        }
        res.render('room', { user, playerName: user.username, playerSkin: user.skin, team: teamData, isAdmin: user.isAdmin, entities: teamData, skinCount: SKIN_COUNT });
    } else {
        res.render('login', { error: 'Credenciais inválidas', skinCount: SKIN_COUNT });
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
                starterTeam.push({ baseId: starter.id, nickname: starter.name, level: 1, currentHp: initialStats.hp, stats: initialStats, moves: initialMoves });
            }
        }
        const newUser = new User({ username, password, skin, pokemonTeam: starterTeam });
        await newUser.save();
        res.render('login', { error: 'Conta criada! Faça login.', skinCount: SKIN_COUNT });
    } catch (e) {
        res.render('login', { error: 'Usuário já existe.', skinCount: SKIN_COUNT });
    }
});
app.get('/lobby', async (req, res) => {
    const { userId } = req.query; const user = await User.findById(userId);
    if(!user) return res.redirect('/');
    const teamData = [];
    for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({id: p.baseId}); if(base) teamData.push(userPokemonToEntity(p, base)); }
    const allPokes = await BasePokemon.find().lean();
    res.render('room', { user, playerName: user.username, playerSkin: user.skin, entities: allPokes, team: teamData, isAdmin: user.isAdmin, skinCount: SKIN_COUNT });
});
app.get('/forest', async (req, res) => {
    const { userId } = req.query; const user = await User.findById(userId);
    if(!user) return res.redirect('/');
    res.render('forest', { user, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin });
});
app.get('/lab', async (req, res) => {
    const { userId } = req.query; const user = await User.findById(userId);
    if(!user || !user.isAdmin) return res.redirect('/');
    const pokemons = await BasePokemon.find();
    res.render('create', { types: EntityType, moves: MOVES_LIBRARY, pokemons, user });
});
app.post('/lab/create', upload.single('sprite'), async (req, res) => {
    const { name, type, hp, energy, atk, def, spd, location, minLvl, maxLvl, catchRate, movesJson, evoTarget, evoLevel, existingId } = req.body;
    const stats = { hp: parseInt(hp), energy: parseInt(energy), attack: parseInt(atk), defense: parseInt(def), speed: parseInt(spd) };
    let movePool = []; try { movePool = JSON.parse(movesJson); } catch(e){}
    const data = { name, type, baseStats: stats, spawnLocation: location, minSpawnLevel: parseInt(minLvl), maxSpawnLevel: parseInt(maxLvl), catchRate: parseFloat(catchRate), evolution: { targetId: evoTarget, level: parseInt(evoLevel) || 100 }, movePool: movePool };
    if(req.file) data.sprite = req.file.filename;
    if(existingId) await BasePokemon.findOneAndUpdate({ id: existingId }, data); else { data.id = Date.now().toString(); await new BasePokemon(data).save(); }
    res.redirect(req.header('Referer') || '/');
});
app.post('/battle/wild', async (req, res) => {
    const { userId } = req.body; const user = await User.findById(userId);
    const possibleSpawns = await BasePokemon.find({ spawnLocation: 'forest' });
    if(possibleSpawns.length === 0) return res.json({ error: "Nenhum pokemon." });
    const wildBase = possibleSpawns[Math.floor(Math.random() * possibleSpawns.length)];
    const wildLevel = Math.floor(Math.random() * (wildBase.maxSpawnLevel - wildBase.minSpawnLevel + 1)) + wildBase.minSpawnLevel;
    const wildEntity = await createBattleInstance(wildBase.id, wildLevel);
    const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0];
    if(!userPokeData) return res.json({ error: "Seus pokemons desmaiaram!" });
    const userBase = await BasePokemon.findOne({ id: userPokeData.baseId });
    const userEntity = userPokemonToEntity(userPokeData, userBase);
    userEntity.playerName = user.username; userEntity.skin = user.skin;
    const battleId = `wild_${Date.now()}`;
    activeBattles[battleId] = { p1: userEntity, p2: wildEntity, type: 'wild', userId: user._id, turn: 1 };
    res.json({ battleId });
});
app.get('/battle/:id', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const battle = activeBattles[req.params.id];
    if(!battle) return res.redirect('/');
    res.render('battle', { p1: battle.p1, p2: battle.p2, battleId: req.params.id, battleMode: 'wild', isSpectator: false, myRoleId: battle.p1.instanceId, playerName: battle.p1.playerName, playerSkin: battle.p1.skin, battleData: JSON.stringify({ log: [{type: 'INIT'}] }) });
});
app.post('/battle/online', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const { roomId, meData, opponentData } = req.body;
    if (!onlineBattles[roomId]) return res.redirect('/');
    const me = JSON.parse(meData); const op = JSON.parse(opponentData);
    res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, battleData: JSON.stringify({ log: [{type: 'INIT'}] }) });
});
app.post('/battle/spectate', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const { roomId, playerName, playerSkin } = req.body;
    const battle = onlineBattles[roomId];
    if (!battle) return res.redirect('/');
    res.render('battle', { p1: battle.p1, p2: battle.p2, battleMode: 'online', battleId: roomId, myRoleId: 'spectator', playerName: playerName, playerSkin: playerSkin, isSpectator: true, battleData: JSON.stringify({ log: [] }) });
});
app.post('/battle', (req, res) => {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    const { fighter1, fighter2, mode, playerName, playerSkin } = req.body;
    // Lógica para batalha local/auto (apenas simulada para teste)
    if (mode === 'manual') {
        // Redireciona para home pois manual local precisa de lógica complexa, focamos no Wild/Online
        return res.redirect('/'); 
    } else {
         // Auto Battle (Simulação rápida)
         // Para simplificar, vou redirecionar. Se quiser Auto Local, precisa adaptar o createBattleInstance
         return res.redirect('/');
    }
});

// API DE TURNO (CORRIGIDA)
app.post('/api/turn', async (req, res) => {
    const { battleId, action, moveId } = req.body;
    const battle = activeBattles[battleId];
    if(!battle) return res.json({ finished: true });

    const p1 = battle.p1; const p2 = battle.p2; const events = [];

    // CAPTURA
    if (action === 'catch') {
        events.push({ type: 'MSG', text: `Você jogou uma Pokébola!` });
        const hpPercent = p2.hp / p2.maxHp;
        const chance = (p2.catchRate * (1 - hpPercent)) + 0.1;
        if (Math.random() < chance) {
            events.push({ type: 'MSG', text: `Gotcha! ${p2.name} foi capturado!` });
            const user = await User.findById(battle.userId);
            const newStats = calculateStats(p2.stats, p2.level);
            user.pokemonTeam.push({ baseId: p2.baseId, nickname: p2.name, level: p2.level, currentHp: newStats.hp, stats: newStats, moves: p2.moves.map(m => m.id) });
            await user.save();
            delete activeBattles[battleId];
            return res.json({ events, finished: true, win: true, captured: true, winnerId: p1.instanceId });
        } else {
            events.push({ type: 'MSG', text: `${p2.name} escapou!` });
            performEnemyTurn(p2, p1, events);
        }
    }
    // FUGA
    else if (action === 'run') {
        if (Math.random() > 0.4) { delete activeBattles[battleId]; return res.json({ events: [{type:'MSG', text:'Você fugiu!'}], finished: true, fled: true }); }
        else { events.push({ type: 'MSG', text: `Falha ao fugir!` }); performEnemyTurn(p2, p1, events); }
    }
    // ATAQUE
    else if (action === 'move') {
        const p1Move = p1.moves.find(m => m.id === moveId);
        if (p1.stats.speed >= p2.stats.speed) { processAction(p1, p2, p1Move, events); if (p2.hp > 0) performEnemyTurn(p2, p1, events); } 
        else { performEnemyTurn(p2, p1, events); if (p1.hp > 0) processAction(p1, p2, p1Move, events); }
    }

    if (p1.hp <= 0) { delete activeBattles[battleId]; return res.json({ events, finished: true, win: false, winnerId: p2.instanceId }); }
    if (p2.hp <= 0) {
        const xpGained = p2.xpYield || 10; p1.xp += xpGained; events.push({ type: 'MSG', text: `Ganhou ${xpGained} XP!` });
        if (p1.xp >= p1.xpToNext && p1.level < 100) {
            p1.level++; p1.xp = 0; p1.xpToNext = getXpForNextLevel(p1.level); events.push({ type: 'MSG', text: `${p1.name} subiu para o nível ${p1.level}!` });
            const baseData = await BasePokemon.findOne({ id: p1.baseId });
            if (baseData.movePool) { const newMove = baseData.movePool.find(m => m.level === p1.level); if(newMove && !p1.moves.find(m=>m.id === newMove.moveId)) { p1.moves.push({ ...MOVES_LIBRARY[newMove.moveId], id: newMove.moveId }); events.push({ type: 'MSG', text: `Aprendeu ${MOVES_LIBRARY[newMove.moveId].name}!` }); } }
            if (baseData.evolution && p1.level >= baseData.evolution.level) { const nextPoke = await BasePokemon.findOne({ id: baseData.evolution.targetId }); if(nextPoke) { p1.baseId = nextPoke.id; p1.name = nextPoke.name; p1.sprite = nextPoke.sprite; events.push({ type: 'MSG', text: `Evoluiu para ${nextPoke.name}!` }); } }
        }
        const user = await User.findById(battle.userId); const pokeIndex = user.pokemonTeam.findIndex(p => p._id.toString() === p1.instanceId);
        if (pokeIndex > -1) { 
            user.pokemonTeam[pokeIndex].level = p1.level; user.pokemonTeam[pokeIndex].xp = p1.xp; user.pokemonTeam[pokeIndex].currentHp = p1.hp; user.pokemonTeam[pokeIndex].baseId = p1.baseId; 
            user.pokemonTeam[pokeIndex].moves = p1.moves.map(m=>m.id); 
            const currentBase = await BasePokemon.findOne({ id: p1.baseId });
            if (currentBase) user.pokemonTeam[pokeIndex].stats = calculateStats(currentBase.baseStats, p1.level);
            await user.save(); 
        }
        delete activeBattles[battleId]; return res.json({ events, finished: true, win: true, winnerId: p1.instanceId });
    }
    res.json({ events, p1State: { hp: p1.hp, energy: p1.energy }, p2State: { hp: p2.hp } });
});

// SOCKET
io.on('connection', (socket) => {
    socket.on('enter_map', (data) => { socket.join(data.map); players[socket.id] = { id: socket.id, ...data, x: 50, y: 80, direction: 'down' }; const mapPlayers = Object.values(players).filter(p => p.map === data.map); socket.emit('map_state', mapPlayers); socket.to(data.map).emit('player_joined', players[socket.id]); });
    socket.on('move_player', (data) => { if (players[socket.id]) { const p = players[socket.id]; const dx = data.x - p.x; const dy = data.y - p.y; let dir = p.direction; if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'; else dir = dy > 0 ? 'down' : 'up'; p.x = data.x; p.y = data.y; p.direction = dir; io.to(p.map).emit('player_moved', { id: socket.id, x: data.x, y: data.y, direction: dir }); } });
    socket.on('send_chat', (data) => { const p = players[socket.id]; if (p) { const payload = { id: socket.id, msg: (typeof data === 'object' ? data.msg : data).substring(0, 50) }; const room = (typeof data === 'object' ? data.roomId : null) || p.map; io.to(room).emit('chat_message', payload); } });
    socket.on('check_encounter', (data) => { if (data.x < 20 && Math.random() < 0.2) socket.emit('encounter_found'); });
    socket.on('disconnect', () => { if (players[socket.id]) { const map = players[socket.id].map; delete players[socket.id]; io.to(map).emit('player_left', socket.id); } });
    socket.on('find_match', async (monsterId, playerName, playerSkin) => { const monsterData = await BasePokemon.findOne({ id: monsterId }).lean(); if(!monsterData) return; const stats = calculateStats(monsterData.baseStats, 50); let moves = monsterData.movePool.map(m=>m.moveId); const playerEntity = { id: socket.id, name: monsterData.name, type: monsterData.type, maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy, stats, moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })), sprite: monsterData.sprite, playerName, skin: playerSkin }; matchmakingQueue.push({ socket, entity: playerEntity }); if (matchmakingQueue.length >= 2) { const p1 = matchmakingQueue.shift(); const p2 = matchmakingQueue.shift(); const roomId = `room_${Date.now()}`; onlineBattles[roomId] = { p1: p1.entity, p2: p2.entity, turn: 1 }; p1.socket.emit('match_found', { roomId, me: p1.entity, opponent: p2.entity }); p2.socket.emit('match_found', { roomId, me: p2.entity, opponent: p1.entity }); } });
    socket.on('join_spectator', ({ roomId, name, skin }) => { socket.join(roomId); if (!roomSpectators[roomId]) roomSpectators[roomId] = {}; roomSpectators[roomId][socket.id] = { id: socket.id, name, skin, x: Math.random() * 90, y: Math.random() * 80 }; socket.emit('spectators_update', roomSpectators[roomId]); io.to(roomId).emit('spectator_joined', roomSpectators[roomId][socket.id]); });
    socket.on('spectator_move', ({ roomId, x, y }) => { if (roomSpectators[roomId] && roomSpectators[roomId][socket.id]) { roomSpectators[roomId][socket.id].x = x; roomSpectators[roomId][socket.id].y = y; io.to(roomId).emit('spectator_moved', { id: socket.id, x, y }); } });
    socket.on('request_active_battles', () => { const list = Object.keys(onlineBattles).map(roomId => { const b = onlineBattles[roomId]; return { id: roomId, p1Name: b.p1.playerName, p1Skin: b.p1.skin, p2Name: b.p2.playerName, p2Skin: b.p2.skin, turn: b.turn }; }); socket.emit('active_battles_list', list); });
    socket.on('online_move', ({ roomId, moveId, playerId }) => { const battle = onlineBattles[roomId]; if (!battle || battle.processing) return; const isP1 = (playerId === battle.p1.id); const attacker = isP1 ? battle.p1 : battle.p2; let chosenMove = null; if (moveId !== 'rest') chosenMove = attacker.moves.find(m => m.id === moveId); attacker.nextMove = chosenMove || 'rest'; attacker.ready = true; if (battle.p1.ready && battle.p2.ready) { battle.processing = true; const events = []; const p1 = battle.p1; const p2 = battle.p2; if (p1.hp > 0 && p2.hp > 0) { let first = p1.stats.speed >= p2.stats.speed ? p1 : p2; let second = first === p1 ? p2 : p1; const runMove = (atk, def) => { if (atk.nextMove === 'rest') { atk.energy += 5; events.push({ type: 'REST', actorId: atk.id, newEnergy: atk.energy }); } else { processAction(atk, def, atk.nextMove, events); } }; runMove(first, second); if (second.hp > 0) runMove(second, first); } p1.ready = false; p2.ready = false; delete p1.nextMove; delete p2.nextMove; battle.processing = false; let winnerId = null; if (p1.hp <= 0 || p2.hp <= 0) { if (p1.hp > 0) winnerId = p1.id; else if (p2.hp > 0) winnerId = p2.id; else winnerId = 'draw'; delete onlineBattles[roomId]; } io.to(roomId).emit('turn_result', { events, winnerId }); } else { socket.to(roomId).emit('opponent_ready'); } });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ON Port ${PORT}`));
