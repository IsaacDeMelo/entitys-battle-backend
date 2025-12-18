const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');
const http = require('http');
const { Server } = require("socket.io");

let GameData;
try { GameData = require('./gameData'); } 
catch (e) { GameData = { EntityType: {}, MoveType: {}, TypeChart: {}, MOVES_LIBRARY: {} }; }
const { EntityType, MoveType, EffectType, TypeChart, MOVES_LIBRARY } = GameData;

// CONFIG SKINS
const SKIN_COUNT = 6; 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const DB_FILE = path.join(__dirname, 'database.json');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

function readDB() {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch (e) { return []; }
}
function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const activeBattles = {}; 
const onlineBattles = {}; 
const lobbyPlayers = {}; 
let matchmakingQueue = []; 
const roomSpectators = {}; 

class Entity {
    constructor(data) {
        this.id = data.id;
        this.name = data.name || "Sem Nome";
        this.type = data.type || "normal";
        this.maxHp = parseInt(data.maxHp || data.hp || 100);
        this.hp = parseInt(data.hp || 100);
        this.maxEnergy = parseInt(data.maxEnergy || data.energy || 50);
        this.energy = parseInt(data.energy || 50);
        const statsSource = data.stats || data; 
        this.stats = { 
            attack: parseInt(statsSource.attack || 10), 
            defense: parseInt(statsSource.defense || 5), 
            speed: parseInt(statsSource.speed || 5) 
        };
        this.effects = []; 
        this.sprite = data.sprite; 
        this.isDefending = false;
        this.playerName = data.playerName || null;
        this.skin = data.skin || 'char1';

        const movesList = data.moves || [];
        this.moves = movesList.map(m => {
            if(m && m.id && MOVES_LIBRARY[m.id]) return { ...MOVES_LIBRARY[m.id], id: m.id };
            if(m && m.name) { 
                const key = Object.keys(MOVES_LIBRARY).find(k => MOVES_LIBRARY[k].name === m.name);
                if(key) return { ...MOVES_LIBRARY[key], id: key };
            }
            return { ...MOVES_LIBRARY['tackle'], id: 'tackle' };
        });
        if(this.moves.length === 0) this.moves.push({ ...MOVES_LIBRARY['tackle'], id: 'tackle' });
    }
}

// ... (Funções processAction, processStartTurn, duelAutomatic MANTIDAS IGUAIS - sem alterações) ...
function processAction(attacker, defender, move, logArray) {
    attacker.isDefending = false; attacker.energy -= move.cost;
    logArray.push({ type: 'USE_MOVE', actorId: attacker.id, moveName: move.name, moveIcon: move.icon || '⚡', moveType: move.type, cost: move.cost, newEnergy: attacker.energy });
    if (move.type === 'defend') { attacker.isDefending = true; logArray.push({ type: 'DEFEND', actorId: attacker.id }); } 
    else if (move.type === 'heal') { const oldHp = attacker.hp; attacker.hp = Math.min(attacker.maxHp, attacker.hp + move.power); logArray.push({ type: 'HEAL', actorId: attacker.id, amount: attacker.hp - oldHp, newHp: attacker.hp }); } 
    else if (move.type === 'attack') {
        let multiplier = 1; const atkType = move.element || 'normal'; const defType = defender.type;
        if (TypeChart[atkType] && TypeChart[atkType][defType] !== undefined) multiplier = TypeChart[atkType][defType];
        let stab = (attacker.type === atkType) ? 1.25 : 1;
        let damage = (move.power + attacker.stats.attack) - defender.stats.defense;
        if (damage < 1) damage = 1;
        let blocked = false; if (defender.isDefending) { damage = Math.floor(damage / 2); blocked = true; }
        damage = Math.floor(damage * multiplier * stab); defender.hp -= damage;
        if (move.effect) { const existing = defender.effects.find(e => e.name === move.effect.name); if(existing) existing.duration = move.effect.duration; else defender.effects.push({ ...move.effect }); }
        logArray.push({ type: 'ATTACK_HIT', attackerId: attacker.id, targetId: defender.id, damage: damage, newHp: defender.hp, isEffective: multiplier > 1, isNotEffective: multiplier < 1 && multiplier > 0, isBlocked: blocked });
    }
}
function processStartTurn(entity, logArray) {
    entity.effects.forEach(eff => { if(eff.type === 'dot') { entity.hp -= eff.value; logArray.push({ type: 'EFFECT_TICK', targetId: entity.id, damage: eff.value, effectName: eff.name, newHp: entity.hp }); } eff.duration--; });
    entity.effects = entity.effects.filter(e => e.duration > 0);
    if(entity.hp > 0 && entity.energy < entity.maxEnergy) entity.energy += 1;
}
function duelAutomatic(entityA, entityB) {
    const events = []; events.push({ type: 'INIT' });
    let attacker = entityA.stats.speed >= entityB.stats.speed ? entityA : entityB; let defender = attacker === entityA ? entityB : entityA; let turnCount = 0;
    while (entityA.hp > 0 && entityB.hp > 0 && turnCount < 50) {
        turnCount++; processStartTurn(attacker, events);
        if(attacker.hp <= 0) break;
        let possibleMoves = attacker.moves.filter(m => attacker.energy >= m.cost);
        if (attacker.hp >= attacker.maxHp) possibleMoves = possibleMoves.filter(m => m.type !== 'heal');
        let move = possibleMoves.length > 0 ? possibleMoves[Math.floor(Math.random() * possibleMoves.length)] : null;
        if (!move) { attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 5); attacker.isDefending = false; events.push({ type: 'REST', actorId: attacker.id, newEnergy: attacker.energy }); } 
        else { processAction(attacker, defender, move, events); }
        if (defender.hp <= 0) break; [attacker, defender] = [defender, attacker];
    }
    let winner = null; if (entityA.hp > 0 && entityB.hp <= 0) winner = entityA; else if (entityB.hp > 0 && entityA.hp <= 0) winner = entityB;
    return { winnerId: winner ? winner.id : null, log: events };
}

io.on('connection', (socket) => {
    socket.on('enter_lobby', (data) => {
        const chosenSkin = data.skin || data.charId || 'char1';
        lobbyPlayers[socket.id] = { id: socket.id, name: data.name || `Player`, skin: chosenSkin, x: 50, y: 80, direction: 'down', isMoving: false };
        socket.emit('lobby_state', lobbyPlayers); socket.broadcast.emit('player_joined', lobbyPlayers[socket.id]);
    });
    socket.on('move_player', (coords) => {
        if (lobbyPlayers[socket.id]) {
            const p = lobbyPlayers[socket.id]; const dx = coords.x - p.x; const dy = coords.y - p.y;
            let dir = p.direction; if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'; else dir = dy > 0 ? 'down' : 'up';
            p.x = coords.x; p.y = coords.y; p.direction = dir; p.isMoving = true;
            io.emit('player_moved', { id: socket.id, x: coords.x, y: coords.y, direction: dir });
        }
    });
    
    // --- CHAT MODIFICADO (Suporta salas) ---
    socket.on('send_chat', (data) => {
        // data pode ser string (formato antigo) ou objeto { msg, roomId }
        let message = "";
        let targetRoom = null;

        if (typeof data === 'object') {
            message = data.msg;
            targetRoom = data.roomId;
        } else {
            message = data;
        }

        const sanitized = message.substring(0, 50);
        const payload = { id: socket.id, msg: sanitized };

        if (targetRoom) {
            io.to(targetRoom).emit('chat_message', payload);
        } else {
            io.emit('chat_message', payload);
        }
    });

    socket.on('join_room', (roomId) => socket.join(roomId));
    
    socket.on('request_active_battles', () => {
        const list = Object.keys(onlineBattles).map(roomId => {
            const b = onlineBattles[roomId];
            return {
                id: roomId,
                p1Name: b.p1.playerName, p1Skin: b.p1.skin,
                p2Name: b.p2.playerName, p2Skin: b.p2.skin,
                turn: b.turn
            };
        });
        socket.emit('active_battles_list', list);
    });

    socket.on('join_spectator', ({ roomId, name, skin }) => {
        socket.join(roomId);
        if (!roomSpectators[roomId]) roomSpectators[roomId] = {};
        roomSpectators[roomId][socket.id] = { id: socket.id, name, skin, x: Math.random() * 90, y: Math.random() * 80 };
        socket.emit('spectators_update', roomSpectators[roomId]);
        io.to(roomId).emit('spectator_joined', roomSpectators[roomId][socket.id]);
    });

    socket.on('spectator_move', ({ roomId, x, y }) => {
        if (roomSpectators[roomId] && roomSpectators[roomId][socket.id]) {
            roomSpectators[roomId][socket.id].x = x;
            roomSpectators[roomId][socket.id].y = y;
            io.to(roomId).emit('spectator_moved', { id: socket.id, x, y });
        }
    });

    socket.on('find_match', (monsterId, playerName, playerSkin) => {
        const entities = readDB(); const monsterData = entities.find(e => e.id == monsterId); if(!monsterData) return;
        const playerEntity = new Entity(monsterData); playerEntity.id = socket.id; playerEntity.playerName = playerName; playerEntity.skin = playerSkin;
        matchmakingQueue.push({ socket, entity: playerEntity });
        if (matchmakingQueue.length >= 2) {
            const p1 = matchmakingQueue.shift(); const p2 = matchmakingQueue.shift(); const roomId = `room_${Date.now()}`;
            onlineBattles[roomId] = { p1: p1.entity, p2: p2.entity, turn: 1 };
            p1.socket.emit('match_found', { roomId, me: p1.entity, opponent: p2.entity }); p2.socket.emit('match_found', { roomId, me: p2.entity, opponent: p1.entity });
        }
    });

    socket.on('online_move', ({ roomId, moveId, playerId }) => {
        const battle = onlineBattles[roomId]; if (!battle || battle.processing) return;
        const isP1 = (playerId === battle.p1.id); const attacker = isP1 ? battle.p1 : battle.p2;
        let chosenMove = null; if (moveId !== 'rest') chosenMove = attacker.moves.find(m => m.id === moveId);
        if (chosenMove && attacker.energy < chosenMove.cost) chosenMove = null;
        attacker.nextMove = chosenMove || 'rest'; attacker.ready = true;
        if (battle.p1.ready && battle.p2.ready) {
            battle.processing = true; const events = []; const p1 = battle.p1; const p2 = battle.p2;
            processStartTurn(p1, events); processStartTurn(p2, events);
            if (p1.hp > 0 && p2.hp > 0) {
                let first = p1.stats.speed >= p2.stats.speed ? p1 : p2; let second = first === p1 ? p2 : p1;
                const runMove = (atk, def) => { if (atk.nextMove === 'rest') { atk.energy = Math.min(atk.maxEnergy, atk.energy + 5); atk.isDefending = false; events.push({ type: 'REST', actorId: atk.id, newEnergy: atk.energy }); } else { processAction(atk, def, atk.nextMove, events); } };
                runMove(first, second); if (second.hp > 0) runMove(second, first);
            }
            p1.ready = false; p2.ready = false; delete p1.nextMove; delete p2.nextMove; battle.processing = false;
            let winnerId = null; if (p1.hp <= 0 || p2.hp <= 0) { if (p1.hp > 0) winnerId = p1.id; else if (p2.hp > 0) winnerId = p2.id; else winnerId = 'draw'; if (winnerId !== 'draw') { const wName = (winnerId === p1.id) ? p1.playerName : p2.playerName; const lName = (winnerId === p1.id) ? p2.playerName : p1.playerName; const wMon = (winnerId === p1.id) ? p1.name : p2.name; io.emit('global_message', { type: 'win', msg: `🏆 ${wName} (${wMon}) venceu ${lName}!` }); } delete onlineBattles[roomId]; }
            io.to(roomId).emit('turn_result', { events, winnerId });
        } else { socket.to(roomId).emit('opponent_ready'); }
    });

    socket.on('disconnect', () => { 
        if (lobbyPlayers[socket.id]) { delete lobbyPlayers[socket.id]; io.emit('player_left', socket.id); } 
        matchmakingQueue = matchmakingQueue.filter(p => p.socket.id !== socket.id); 
        for (const roomId in roomSpectators) {
            if (roomSpectators[roomId][socket.id]) {
                delete roomSpectators[roomId][socket.id];
                io.to(roomId).emit('spectator_left', socket.id);
            }
        }
    });
});

app.get('/', (req, res) => { res.render('login', { skinCount: SKIN_COUNT }); });
app.post('/room', (req, res) => { const rawList = readDB(); const entities = rawList.map(data => new Entity(data)); const playerName = req.body.playerName || "Visitante"; const playerSkin = req.body.charId || req.body.skin || "char1"; res.render('room', { playerName, playerSkin, entities, skinCount: SKIN_COUNT }); });
app.get('/create', (req, res) => { const { playerName, playerSkin } = req.query; res.render('create', { types: EntityType, moves: MOVES_LIBRARY, playerName: playerName || '', playerSkin: playerSkin || 'char1' }); });
app.post('/create', upload.single('sprite'), (req, res) => { const { name, type, hp, energy, attack, defense, speed, selectedMoves, playerName, playerSkin } = req.body; const movesKeys = [].concat(selectedMoves || []); const finalMoves = movesKeys.map(k => MOVES_LIBRARY[k] ? { ...MOVES_LIBRARY[k], id: k } : null).filter(Boolean); if(finalMoves.length === 0) finalMoves.push({ ...MOVES_LIBRARY['tackle'], id: 'tackle' }); const newEntity = { id: Date.now().toString(), name, type, hp, energy, stats: { attack, defense, speed }, moves: finalMoves, sprite: req.file ? req.file.filename : null }; const entities = readDB(); entities.push(newEntity); saveDB(entities); const updatedEntities = readDB().map(data => new Entity(data)); res.render('room', { playerName: playerName || "Treinador", playerSkin: playerSkin || "char1", entities: updatedEntities, skinCount: SKIN_COUNT }); });
app.post('/battle/online', (req, res) => { const { roomId, meData, opponentData } = req.body; const me = JSON.parse(meData); const op = JSON.parse(opponentData); res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, battleData: JSON.stringify({ log: [{type: 'INIT'}] }) }); });
app.post('/battle/spectate', (req, res) => { const { roomId, playerName, playerSkin } = req.body; const battle = onlineBattles[roomId]; if (!battle) return res.render('room', { playerName, playerSkin, entities: readDB().map(d=>new Entity(d)), skinCount: SKIN_COUNT }); res.render('battle', { p1: battle.p1, p2: battle.p2, battleMode: 'online', battleId: roomId, myRoleId: 'spectator', playerName: playerName, playerSkin: playerSkin, isSpectator: true, battleData: JSON.stringify({ log: [] }) }); });
app.post('/battle', (req, res) => { const { fighter1, fighter2, mode, playerName, playerSkin } = req.body; const entities = readDB(); const e1 = entities.find(e => e.id == fighter1); const e2 = entities.find(e => e.id == fighter2); if (!e1 || !e2) return res.redirect('/'); try { const entityA = new Entity(e1); entityA.id = 'p1_' + entityA.id; entityA.playerName = playerName || "Você"; entityA.skin = playerSkin; const entityB = new Entity(e2); entityB.id = 'p2_' + entityB.id; entityB.playerName = "CPU"; if (mode === 'manual') { const battleId = Date.now().toString(); activeBattles[battleId] = { p1: entityA, p2: entityB }; res.render('battle', { p1: entityA, p2: entityB, battleMode: 'manual', battleId: battleId, myRoleId: entityA.id, playerName, playerSkin, isSpectator: false, battleData: JSON.stringify({ log: [{type: 'INIT'}] }) }); } else { const simP1 = new Entity(e1); simP1.id = entityA.id; const simP2 = new Entity(e2); simP2.id = entityB.id; const result = duelAutomatic(simP1, simP2); res.render('battle', { p1: entityA, p2: entityB, battleMode: 'auto', battleId: null, myRoleId: null, playerName, playerSkin, isSpectator: false, battleData: JSON.stringify(result) }); } } catch (err) { res.redirect('/'); } });
app.post('/api/turn', (req, res) => { const { battleId, moveId } = req.body; const battle = activeBattles[battleId]; if(!battle) return res.status(404).json({ error: 'Batalha expirou' }); const p1 = battle.p1; const p2 = battle.p2; const events = []; processStartTurn(p1, events); processStartTurn(p2, events); if(p1.hp <= 0 || p2.hp <= 0) { let winner = p1.hp > 0 ? p1 : (p2.hp > 0 ? p2 : null); return res.json({ events, winnerId: winner ? winner.id : 'draw' }); } let p1Move = moveId !== 'rest' ? p1.moves.find(m => m.id === moveId) : null; if(p1Move && p1.energy < p1Move.cost) p1Move = null; let possibleMovesP2 = p2.moves.filter(m => p2.energy >= m.cost); if(p2.hp >= p2.maxHp) possibleMovesP2 = possibleMovesP2.filter(m => m.type !== 'heal'); let p2Move = possibleMovesP2.length > 0 ? possibleMovesP2[Math.floor(Math.random() * possibleMovesP2.length)] : null; let first, second; if(p1.stats.speed >= p2.stats.speed) { first = { actor: p1, target: p2, move: p1Move }; second = { actor: p2, target: p1, move: p2Move }; } else { first = { actor: p2, target: p1, move: p2Move }; second = { actor: p1, target: p2, move: p1Move }; } const runMove = (atk, def, mv) => { if (!mv) { atk.energy = Math.min(atk.maxEnergy, atk.energy + 5); atk.isDefending = false; events.push({ type: 'REST', actorId: atk.id, newEnergy: atk.energy }); } else { processAction(atk, def, mv, events); } }; runMove(first.actor, first.target, first.move); if(second.actor.hp > 0) runMove(second.actor, second.target, second.move); let winnerId = null; if (p1.hp <= 0 || p2.hp <= 0) { winnerId = p1.hp > 0 ? p1.id : p2.id; delete activeBattles[battleId]; } res.json({ events, winnerId }); });

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));