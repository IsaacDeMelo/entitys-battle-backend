const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

const { BasePokemon, User, NPC, GameMap } = require('./models');
const { EntityType, MoveType, TypeChart, MOVES_LIBRARY, getXpForNextLevel, getTypeEffectiveness } = require('./gameData');
const { MONGO_URI } = require('./config'); 

const SKIN_COUNT = 12; 
const GLOBAL_GRASS_CHANCE = 0.35

// --- CONEXÃO BANCO ---
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Conectado');
        await fixLegacyUsers();
    })
    .catch(e => console.log('❌ Erro no Mongo:', e));

async function fixLegacyUsers() {
    try {
        const users = await mongoose.connection.db.collection('users').find({}).toArray();
        for (let u of users) {
            if (u.defeatedNPCs && u.defeatedNPCs.length > 0) {
                if (typeof u.defeatedNPCs[0] === 'string') {
                    const newFormat = u.defeatedNPCs.map(id => ({ npcId: id, defeatedAt: 0 }));
                    await mongoose.connection.db.collection('users').updateOne({ _id: u._id }, { $set: { defeatedNPCs: newFormat } });
                }
            }
        }
    } catch (e) { console.error("Erro migração:", e); }
}

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
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

const activeBattles = {}; 
const onlineBattles = {}; 
const players = {}; 
let matchmakingQueue = []; 
const roomSpectators = {}; 

const GRASS_PATCHES = ['grass1', 'grass2', 'city_grass1', 'city_grass2'];
const GRASS_CHANCE = { grass1: 0.35, grass2: 0.35, city_grass1: 0.35, city_grass2: 0.35 };

// --- FUNÇÕES AUXILIARES ---
function pickWeightedPokemon(pokemonList) {
    let totalWeight = 0; pokemonList.forEach(p => totalWeight += (p.spawnChance || 1));
    let random = Math.random() * totalWeight;
    for (let i = 0; i < pokemonList.length; i++) {
        const weight = pokemonList[i].spawnChance || 1;
        if (random < weight) return pokemonList[i];
        random -= weight;
    }
    return pokemonList[0]; 
}

async function seedDatabase() { try { const count = await BasePokemon.countDocuments(); if (count === 0) console.log('🌱 Banco vazio.'); } catch (e) { console.error(e); } }

function calculateStats(base, level) { 
    const mult = 1 + (level * 0.025); 
    return { 
        hp: Math.floor((base.hp * 1.5 * level / 100) + level + 10), 
        energy: Math.floor(base.energy + (level * 0.1)), 
        attack: Math.floor(base.attack * mult), 
        defense: Math.floor(base.defense * mult), 
        speed: Math.floor(base.speed * mult) 
    }; 
}

async function createBattleInstance(baseId, level) { 
    const base = await BasePokemon.findOne({ id: baseId }).lean(); if(!base) return null; 
    const stats = calculateStats(base.baseStats, level); 
    let moves = base.movePool ? base.movePool.filter(m => m.level <= level).map(m => m.moveId) : []; 
    if(moves.length === 0) moves = ['tackle']; 
    if(moves.length > 4) moves = moves.sort(() => 0.5 - Math.random()).slice(0, 4); 
    return { 
        instanceId: 'wild_' + Date.now(), 
        baseId: base.id, name: base.name, type: base.type, level: level, 
        maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy, stats: stats, 
        moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id), 
        sprite: base.sprite, catchRate: base.catchRate || 0.5, xpYield: Math.max(5, Math.floor(level * 25)), 
        isWild: true, status: null 
    }; 
}

function userPokemonToEntity(userPoke, baseData) { 
    const movesObj = userPoke.moves.map(mid => { const libMove = MOVES_LIBRARY[mid]; return libMove ? { ...libMove, id: mid } : null; }).filter(m => m !== null); 
    return { 
        instanceId: userPoke._id.toString(), baseId: userPoke.baseId, name: userPoke.nickname || baseData.name, 
        type: baseData.type, level: userPoke.level, maxHp: userPoke.stats.hp, hp: userPoke.currentHp > 0 ? userPoke.currentHp : 0, 
        maxEnergy: userPoke.stats.energy, energy: userPoke.stats.energy, stats: userPoke.stats, 
        moves: movesObj, sprite: baseData.sprite, isWild: false, xp: userPoke.xp, xpToNext: getXpForNextLevel(userPoke.level), status: null 
    }; 
}

function applyStatusDamage(pokemon, events) {
    if (!pokemon.status || pokemon.hp <= 0) return;
    if (pokemon.status.type === 'poison') {
        const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8)); pokemon.hp -= dmg; if (pokemon.hp < 0) pokemon.hp = 0; pokemon.status.turns--;
        events.push({ type: 'STATUS_DAMAGE', targetId: pokemon.instanceId || 'wild', damage: dmg, newHp: pokemon.hp, status: 'poison', text: `${pokemon.name} sofreu pelo veneno!` });
        if (pokemon.status.turns <= 0) { pokemon.status = null; events.push({ type: 'STATUS_END', targetId: pokemon.instanceId || 'wild', text: `O veneno de ${pokemon.name} passou.` }); }
    }
}

function processAction(attacker, defender, move, logArray) {
    if(!move) { logArray.push({ type: 'MSG', text: `${attacker.name} hesitou!` }); return; }
    if (attacker.energy >= move.cost) attacker.energy -= move.cost; else { logArray.push({ type: 'MSG', text: `${attacker.name} cansou!` }); return; }
    logArray.push({ type: 'USE_MOVE', actorId: attacker.instanceId || 'wild', moveName: move.name, moveIcon: move.icon, moveElement: move.element || 'normal', moveCategory: move.category || 'physical', moveType: move.type, cost: move.cost, newEnergy: attacker.energy });
    
    if(move.type === 'heal') { 
        const oldHp = attacker.hp; 
        const healAmount = move.power + Math.floor(attacker.maxHp * 0.1); 
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount); 
        logArray.push({ type: 'HEAL', actorId: attacker.instanceId || 'wild', amount: attacker.hp - oldHp, newHp: attacker.hp }); 
    } 
    else if (move.type === 'defend') { logArray.push({ type: 'MSG', text: `${attacker.name} se protegeu!` }); } 
    else { 
        const multiplier = getTypeEffectiveness(move.element, defender.type);
        const level = attacker.level || 1; const atk = attacker.stats.attack; const def = defender.stats.defense;
        const random = (Math.floor(Math.random() * 16) + 85) / 100;
        let damage = Math.floor((((level * 0.2 + 1.5) * move.power * (atk / def)) / 65 + 2) * multiplier * random);
        if (damage < 1) damage = 1; 
        defender.hp -= damage; if (defender.hp < 0) defender.hp = 0;
        logArray.push({ type: 'ATTACK_HIT', attackerId: attacker.instanceId || 'wild', targetId: defender.instanceId || 'wild', damage, newHp: defender.hp, isEffective: multiplier > 1, isNotEffective: multiplier < 1 && multiplier > 0, isBlocked: multiplier === 0 }); 
        if (move.element === 'poison' && !defender.status && defender.hp > 0 && Math.random() < 0.25) { defender.status = { type: 'poison', turns: 2 }; logArray.push({ type: 'STATUS_APPLIED', targetId: defender.instanceId || 'wild', status: 'poison', text: `${defender.name} foi envenenado!` }); }
    }
}

function performEnemyTurn(attacker, defender, events) { const move = attacker.moves[Math.floor(Math.random() * attacker.moves.length)]; processAction(attacker, defender, move, events); }

// --- ROTAS GERAIS ---
app.get('/', async (req, res) => { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: null, skinCount: SKIN_COUNT, starters }); });
app.post('/login', async (req, res) => { const { username, password } = req.body; const user = await User.findOne({ username, password }); if (user) { res.redirect('/lobby?userId=' + user._id); } else { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: 'Credenciais inválidas', skinCount: SKIN_COUNT, starters }); } });
app.post('/register', async (req, res) => { 
    const { username, password, skin, starterId } = req.body; 
    try { 
        let starterTeam = []; 
        let dex = [];
        if (starterId) { 
            const starter = await BasePokemon.findOne({ id: starterId, isStarter: true }); 
            if (starter) { 
                const initialStats = calculateStats(starter.baseStats, 1); 
                let initialMoves = starter.movePool.filter(m => m.level <= 1).map(m => m.moveId); 
                if(initialMoves.length === 0) initialMoves = ['tackle']; 
                starterTeam.push({ baseId: starter.id, nickname: starter.name, level: 1, currentHp: initialStats.hp, stats: initialStats, moves: initialMoves, learnedMoves: initialMoves }); 
                dex.push(starter.id);
            } 
        } 
        const newUser = new User({ username, password, skin, pokemonTeam: starterTeam, pc: [], dex: dex }); 
        await newUser.save(); 
        res.redirect('/lobby?userId=' + newUser._id); 
    } catch (e) { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: 'Usuário já existe.', skinCount: SKIN_COUNT, starters }); } 
});

app.get('/lobby', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const teamData = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({id: p.baseId}); if(base) teamData.push(userPokemonToEntity(p, base)); } const allPokes = await BasePokemon.find().lean(); res.render('room', { user, playerName: user.username, playerSkin: user.skin, entities: allPokes, team: teamData, isAdmin: user.isAdmin, skinCount: SKIN_COUNT }); });
app.get('/forest', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const allPokes = await BasePokemon.find().lean(); res.render('forest', { user, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin, skinCount: SKIN_COUNT, entities: allPokes }); });

// --- ROTA DA CIDADE (CORRIGIDA PARA CARREGAR SPAWN POINT) ---
app.get('/city', async (req, res) => {
    const { userId, from, map } = req.query;
    const user = await User.findById(userId);
    if (!user) return res.redirect('/');
    
    const mapId = map || 'city';
    
    // Tenta achar no banco
    let mapData = await GameMap.findOne({ mapId }).lean();

    // Cria default se não existir
    if (!mapData) {
        mapData = {
            mapId: mapId,
            name: mapId === 'city' ? 'Cidade' : 'Interior',
            bgImage: mapId === 'city' ? '/uploads/route_map.png' : '/uploads/room_bg.png',
            collisions: [],
            grass: [],
            interacts: [],
            portals: [],
            spawnPoint: null,
            width: 100,
            height: 100
        };
    }

    // Lógica de spawn priorizada: URL > Spawn Salvo > Default
    let startX = 50, startY = 50;

    if (req.query.x && req.query.y) {
        // Se a URL mandar (Portal), obedece a URL
        startX = parseFloat(req.query.x);
        startY = parseFloat(req.query.y);
    } else if (mapData.spawnPoint && mapData.spawnPoint.x !== undefined) {
        // Se não tiver na URL, usa o Spawn Point salvo (se existir)
        startX = mapData.spawnPoint.x;
        startY = mapData.spawnPoint.y;
    } else if (from === 'forest') {
        startX = 50; startY = 92;
    }

    const allPokes = await BasePokemon.find().lean();
    const teamData = []; 
    for(let p of user.pokemonTeam) { 
        const base = await BasePokemon.findOne({id: p.baseId}); 
        if(base) teamData.push(userPokemonToEntity(p, base)); 
    }
    
    res.render('city', { 
        user, 
        playerName: user.username, 
        playerSkin: user.skin, 
        isAdmin: user.isAdmin, 
        skinCount: SKIN_COUNT,
        startX, startY,
        entities: allPokes,
        team: teamData,
        mapData: mapData
    }); 
});

// --- API PARA PEGAR DADOS DE UM MAPA (PREVIEW) ---
app.get('/api/map/:mapId', async (req, res) => {
    try {
        const { mapId } = req.params;
        let map = await GameMap.findOne({ mapId }).lean();
        
        // Se não existir, retorna dados padrão para não quebrar
        if (!map) {
            return res.json({ 
                bgImage: mapId === 'city' ? '/uploads/route_map.png' : '/uploads/room_bg.png',
                width: 100,
                height: 100
            });
        }
        
        res.json(map);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- ROTA DE SALVAR MAPA (CORRIGIDA PARA SALVAR SPAWN POINT) ---
app.post('/api/map/save', async (req, res) => {
    const { userId, mapId, mapData } = req.body;
    
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Sem permissão' });

    try {
        await GameMap.findOneAndUpdate(
            { mapId: mapId },
            { 
                $set: {
                    collisions: mapData.collisions,
                    grass: mapData.grass,
                    interacts: mapData.interacts,
                    portals: mapData.portals,
                    bgImage: mapData.bgImage,
                    width: mapData.width || 100,
                    height: mapData.height || 100,
                    spawnPoint: mapData.spawnPoint // <--- AGORA SALVA O SPAWN!
                }
            },
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) {
        res.json({ error: e.message });
    }
});

// ... (RESTO DAS ROTAS /lab, /battle, etc. MANTIDAS IGUAIS) ...

app.get('/lab', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user || !user.isAdmin) return res.redirect('/'); const pokemons = await BasePokemon.find(); const npcs = await NPC.find(); res.render('create', { types: EntityType, moves: MOVES_LIBRARY, pokemons, npcs, user }); });

app.post('/lab/create', upload.single('sprite'), async (req, res) => { const { name, type, hp, energy, atk, def, spd, location, minLvl, maxLvl, catchRate, spawnChance, isStarter, movesJson, evoTarget, evoLevel, existingId } = req.body; const stats = { hp: parseInt(hp), energy: parseInt(energy), attack: parseInt(atk), defense: parseInt(def), speed: parseInt(spd) }; let movePool = []; try { movePool = JSON.parse(movesJson); } catch(e){} const data = { name, type, baseStats: stats, spawnLocation: location, minSpawnLevel: parseInt(minLvl), maxSpawnLevel: parseInt(maxLvl), catchRate: parseFloat(catchRate), spawnChance: parseFloat(spawnChance) || 10, isStarter: isStarter === 'on', evolution: { targetId: evoTarget, level: parseInt(evoLevel) || 100 }, movePool: movePool }; if(req.file) data.sprite = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; if(existingId) await BasePokemon.findOneAndUpdate({ id: existingId }, data); else { data.id = Date.now().toString(); await new BasePokemon(data).save(); } res.redirect(req.header('Referer') || '/'); });
app.post('/lab/delete', async (req, res) => { try { const { id } = req.body; if (id) await BasePokemon.deleteOne({ id }); res.redirect(req.get('referer')); } catch (e) { res.send('Erro ao excluir: ' + e.message); } });
app.post('/lab/create-npc', upload.single('npcSkinFile'), async (req, res) => { try { const { npcId, name, map, x, y, direction, skinSelect, dialogue, winDialogue, cooldownDialogue, money, teamJson, rewardType, rewardVal, rewardQty, cooldownMinutes, userId, battleBg } = req.body; let finalSkin = skinSelect; let isCustom = false; if (req.file) { finalSkin = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; isCustom = true; } else if (npcId) { if(!skinSelect && !req.file) { const old = await NPC.findById(npcId); if(old) { finalSkin = old.skin; isCustom = old.isCustomSkin; } } } let team = []; try { team = JSON.parse(teamJson); } catch (e) {} const reward = { type: rewardType || 'none', value: rewardVal || '', qty: parseInt(rewardQty) || 1, level: (rewardType === 'pokemon') ? (parseInt(rewardQty) || 1) : 1 }; const npcData = { name, map, x: parseInt(x)||50, y: parseInt(y)||50, direction: direction||'down', skin: finalSkin, isCustomSkin: isCustom, dialogue, winDialogue, cooldownDialogue, moneyReward: parseInt(money)||0, cooldownMinutes: parseInt(cooldownMinutes) || 0, team, reward, battleBackground: battleBg || 'battle_bg.png' }; if (npcId) { if (!req.file && skinSelect && !skinSelect.startsWith('data:')) { npcData.skin = skinSelect; npcData.isCustomSkin = false; } await NPC.findByIdAndUpdate(npcId, npcData); } else { await new NPC(npcData).save(); } res.redirect('/lab?userId=' + userId); } catch (e) { console.error(e); res.send("Erro: " + e.message); } });
app.post('/lab/delete-npc', async (req, res) => { try { const { id } = req.body; if(id) await NPC.findByIdAndDelete(id); res.redirect(req.get('referer')); } catch(e) { res.send("Erro"); } });

app.get('/api/pc', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if (!user) return res.json({ error: 'User not found' }); const formatList = async (list) => { const output = []; for (let p of list) { const base = await BasePokemon.findOne({ id: p.baseId }); if (base) output.push(userPokemonToEntity(p, base)); } return output; }; const pcList = user.pc || []; const team = await formatList(user.pokemonTeam); const pc = await formatList(pcList); res.json({ team, pc }); });
app.post('/api/pc/move', async (req, res) => { const { userId, pokemonId, from, to } = req.body; const user = await User.findById(userId); if (!user) return res.json({ error: 'Usuário não encontrado.' }); if (!user.pc) user.pc = []; const sourceList = from === 'team' ? user.pokemonTeam : user.pc; const destList = to === 'team' ? user.pokemonTeam : user.pc; if (from === to) return res.json({ success: true }); if (to === 'team' && destList.length >= 6) return res.json({ error: 'Sua equipe já tem 6 Monstros!' }); if (from === 'team' && sourceList.length <= 1) return res.json({ error: 'Você não pode ficar sem Monstros na equipe!' }); const index = sourceList.findIndex(p => p._id.toString() === pokemonId); if (index === -1) return res.json({ error: 'Monstro não encontrado.' }); const [poke] = sourceList.splice(index, 1); destList.push(poke); await user.save(); res.json({ success: true }); });
app.get('/api/me', async (req, res) => { const { userId } = req.query; if(!userId) return res.status(400).json({ error: 'No ID' }); const user = await User.findById(userId); if(!user) return res.status(404).json({ error: 'User not found' }); const teamWithSprites = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); const nextXp = getXpForNextLevel(p.level); const allLearned = p.learnedMoves && p.learnedMoves.length > 0 ? p.learnedMoves : p.moves; teamWithSprites.push({ instanceId: p._id, name: p.nickname, level: p.level, hp: p.currentHp, maxHp: p.stats.hp, xp: p.xp, xpToNext: nextXp, sprite: base ? base.sprite : '', moves: p.moves, learnedMoves: allLearned }); } res.json({ team: teamWithSprites, allMoves: MOVES_LIBRARY, money: user.money || 0, pokeballs: user.pokeballs || 0, rareCandy: user.rareCandy || 0 }); });
app.post('/api/heal', async (req, res) => { const { userId } = req.body; const user = await User.findById(userId); if (!user) return res.status(404).json({ error: 'Usuário não encontrado' }); let count = 0; for (let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); if (base) { p.stats = calculateStats(base.baseStats, p.level); p.currentHp = p.stats.hp; count++; } } await user.save(); res.json({ success: true, message: `${count} Monstros curados!` }); });
app.post('/api/equip-move', async (req, res) => { const { userId, pokemonId, moves } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const poke = user.pokemonTeam.id(pokemonId); if(!poke) return res.json({error: "Pokemon not found"}); if(moves.length < 1 || moves.length > 4) return res.json({error: "Deve ter entre 1 e 4 ataques."}); poke.moves = moves; await user.save(); res.json({success: true}); });
app.post('/api/set-lead', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if (index > 0) { const poke = user.pokemonTeam.splice(index, 1)[0]; user.pokemonTeam.unshift(poke); await user.save(); res.json({success: true}); } else { res.json({success: true}); } });
app.post('/api/abandon-pokemon', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if(user.pokemonTeam.length <= 1) return res.json({ error: 'Não pode abandonar o último monstro.' }); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if(index === -1) return res.json({ error: 'Pokemon not found' }); user.pokemonTeam.splice(index, 1); await user.save(); res.json({ success: true }); });
app.post('/api/buy-item', async (req, res) => { const { userId, itemId, qty } = req.body; const q = Math.max(1, parseInt(qty) || 1); const prices = { pokeball: 50, rareCandy: 2000 }; if(!prices[itemId]) return res.json({ error: 'Item inválido' }); const cost = prices[itemId] * q; const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if((user.money || 0) < cost) return res.json({ error: 'Saldo insuficiente' }); user.money = (user.money || 0) - cost; if(itemId === 'pokeball') user.pokeballs = (user.pokeballs || 0) + q; if(itemId === 'rareCandy') user.rareCandy = (user.rareCandy || 0) + q; await user.save(); res.json({ success: true, money: user.money, pokeballs: user.pokeballs, rareCandy: user.rareCandy }); });
app.post('/api/use-item', async (req, res) => { const { userId, itemId, pokemonId, qty } = req.body; const q = Math.max(1, parseInt(qty) || 1); const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if(itemId === 'rareCandy') { if(!pokemonId) return res.json({ error: 'pokemonId required' }); let poke = null; try { poke = user.pokemonTeam.id(pokemonId); } catch(e) { poke = user.pokemonTeam.find(p => p._id.toString() === (pokemonId || '')); } if(!poke) return res.json({ error: 'Pokemon not found' }); if((user.rareCandy || 0) < q) return res.json({ error: 'Not enough RareCandy' }); const oldLevel = poke.level || 1; poke.level = Math.min(100, oldLevel + q); user.rareCandy = (user.rareCandy || 0) - q; let base = await BasePokemon.findOne({ id: poke.baseId }); let evolved = false; if (base) { if (base.movePool) { const newMove = base.movePool.find(m => m.level === poke.level); if (newMove) { if (!poke.learnedMoves) poke.learnedMoves = [...poke.moves]; if (!poke.learnedMoves.includes(newMove.moveId)) { poke.learnedMoves.push(newMove.moveId); if(poke.moves.length < 4) poke.moves.push(newMove.moveId); } } } if (base.evolution && poke.level >= base.evolution.level) { const nextPoke = await BasePokemon.findOne({ id: base.evolution.targetId }); if (nextPoke) { poke.baseId = nextPoke.id; poke.nickname = nextPoke.name; base = nextPoke; evolved = true; if (!user.dex) user.dex = []; if (!user.dex.includes(nextPoke.id)) { user.dex.push(nextPoke.id); } } } poke.stats = calculateStats(base.baseStats, poke.level); poke.currentHp = poke.stats.hp; } await user.save(); return res.json({ success: true, rareCandy: user.rareCandy, evolved: evolved, pokemon: { instanceId: poke._id, level: poke.level, hp: poke.currentHp, name: poke.nickname } }); } return res.json({ error: 'Item cannot be used here' }); });

// --- BATTLE ROUTES ---
app.post('/battle/wild', async (req, res) => { 
    const { userId, currentMap, currentX, currentY } = req.body; 
    const user = await User.findById(userId); 
    const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0]; 
    if(!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Todos os seus Monstros estão desmaiados!" }); 
    
    let mapName = 'city'; 
    if (currentMap) {
        if (currentMap.includes('map=')) { const match = currentMap.match(/map=([^&]+)/); if (match && match[1]) mapName = match[1]; } 
        else if (currentMap !== 'city' && !currentMap.includes('?')) mapName = currentMap;
    }
    
    const possibleSpawns = await BasePokemon.find({ spawnLocation: mapName }); 
    if(possibleSpawns.length === 0) return res.json({ error: `Nada selvagem em '${mapName}'.` }); 
    
    const wildBase = pickWeightedPokemon(possibleSpawns); 
    const wildLevel = Math.floor(Math.random() * (wildBase.maxSpawnLevel - wildBase.minSpawnLevel + 1)) + wildBase.minSpawnLevel; 
    const wildEntity = await createBattleInstance(wildBase.id, wildLevel); 
    const userBase = await BasePokemon.findOne({ id: userPokeData.baseId }); 
    const userEntity = userPokemonToEntity(userPokeData, userBase); 
    userEntity.playerName = user.username; 
    userEntity.skin = user.skin; 
    
    const battleId = `wild_${Date.now()}`; 
    
    let returnMapUrl = currentMap;
    if (mapName !== 'city' && mapName !== 'forest' && !currentMap.includes('city?')) {
        returnMapUrl = `city?map=${mapName}`;
    }

    activeBattles[battleId] = { 
        p1: userEntity, p2: wildEntity, type: 'wild', userId: user._id, turn: 1,
        returnMap: returnMapUrl, returnX: currentX || 50, returnY: currentY || 50
    }; 
    res.json({ battleId }); 
});

app.post('/battle/npc', async (req, res) => {
    const { userId, npcId, currentMap, currentX, currentY } = req.body; 
    const user = await User.findById(userId); 
    const npc = await NPC.findById(npcId);
    if (!user || !npc) return res.json({ error: "Erro: NPC/Usuário não encontrado." });

    const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0];
    if (!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Seus Monstros estão desmaiados!" });
    
    const userBase = await BasePokemon.findOne({ id: userPokeData.baseId });
    const p1Entity = userPokemonToEntity(userPokeData, userBase); 
    p1Entity.playerName = user.username; 
    p1Entity.skin = user.skin;

    const npcTeamInstances = [];
    if (!npc.team || npc.team.length === 0) return res.json({ error: "Este NPC não tem Monstros!" });

    for (let member of npc.team) {
        const base = await BasePokemon.findOne({ id: member.baseId });
        if (base) {
            const stats = calculateStats(base.baseStats, member.level);
            let moves = base.movePool ? base.movePool.filter(m => m.level <= member.level).map(m => m.moveId) : ['tackle'];
            if(moves.length > 4) moves = moves.sort(() => 0.5 - Math.random()).slice(0, 4);
            
            npcTeamInstances.push({
                instanceId: 'npc_mon_' + Math.random().toString(36).substr(2, 9) + Date.now(), 
                baseId: base.id, name: base.name, type: base.type, level: member.level, 
                maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy, stats: stats, 
                moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id), 
                sprite: base.sprite, playerName: npc.name, skin: npc.skin, isCustomSkin: npc.isCustomSkin, 
                isWild: false, status: null
            });
        }
    }

    const battleId = `npc_${Date.now()}`; 
    activeBattles[battleId] = { 
        p1: p1Entity, p2: npcTeamInstances[0], npcReserve: npcTeamInstances, type: 'local', userId: user._id, turn: 1, npcId: npc._id,
        returnMap: currentMap || 'lobby', returnX: currentX || 50, returnY: currentY || 50, customBackground: npc.battleBackground
    }; 
    res.json({ battleId });
});

app.post('/battle/online', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const { roomId, meData, opponentData } = req.body; if (!onlineBattles[roomId]) return res.redirect('/'); const me = JSON.parse(meData); const op = JSON.parse(opponentData); res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, realUserId: me.userId, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, bgImage: 'battle_bg.png', battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable: [], returnUrl: '/lobby' }); });
app.post('/battle', async (req, res) => { const { fighterId, playerName, playerSkin, userId } = req.body; const user = await User.findById(userId); if(!user) return res.redirect('/'); const userPokeData = user.pokemonTeam.id(fighterId); if(!userPokeData || userPokeData.currentHp <= 0) return res.redirect('/lobby?userId=' + userId); const b1Base = await BasePokemon.findOne({ id: userPokeData.baseId }); const p1 = userPokemonToEntity(userPokeData, b1Base); p1.playerName = playerName; p1.skin = playerSkin; const allBases = await BasePokemon.find(); if(allBases.length === 0) return res.redirect('/lobby?userId=' + userId); const randomBase = allBases[Math.floor(Math.random() * allBases.length)]; const cpuLevel = Math.max(1, p1.level); const s2 = calculateStats(randomBase.baseStats, cpuLevel); let cpuMoves = randomBase.movePool ? randomBase.movePool.filter(m => m.level <= cpuLevel).map(m => m.moveId) : []; if(cpuMoves.length === 0) cpuMoves = ['tackle']; if(cpuMoves.length > 4) cpuMoves = cpuMoves.sort(() => 0.5 - Math.random()).slice(0, 4); const p2 = { instanceId: 'p2_cpu_' + Date.now(), baseId: randomBase.id, name: randomBase.name, type: randomBase.type, level: cpuLevel, hp: s2.hp, maxHp: s2.hp, energy: s2.energy, maxEnergy: s2.energy, stats: s2, moves: cpuMoves.map(mid => ({...MOVES_LIBRARY[mid], id:mid})), sprite: randomBase.sprite, playerName: 'CPU', skin: 'char2', status: null }; const battleId = 'local_' + Date.now(); activeBattles[battleId] = { p1, p2, type: 'local', userId, turn: 1, mode: 'manual', returnMap: 'lobby' }; res.redirect('/battle/' + battleId); });

app.post('/api/npc/move', async (req, res) => {
    const { userId, npcId, x, y, mapId } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const updated = await NPC.findByIdAndUpdate(npcId, { x: x, y: y, map: mapId }, { new: true });
        if (updated) {
            const mapNpcs = await NPC.find({ map: mapId }).lean();
            io.to(mapId).emit('npcs_list', mapNpcs);
            res.json({ success: true });
        } else res.json({ error: 'NPC não encontrado' });
    } catch (e) { console.error(e); res.json({ error: e.message }); }
});

app.get('/battle/:id', async (req, res) => { 
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); 
    const battle = activeBattles[req.params.id]; 
    if(!battle) return res.redirect('/'); 
    
    let switchable = []; 
    if (battle.userId) { 
        const user = await User.findById(battle.userId); 
        if (user) { 
            for (let p of user.pokemonTeam) { 
                if (p._id.toString() !== battle.p1.instanceId && p.currentHp > 0) { 
                    const b = await BasePokemon.findOne({ id: p.baseId }); 
                    if(b) switchable.push(userPokemonToEntity(p, b)); 
                } 
            } 
        } 
    } 
    
    let bg = 'battle_bg.png';
    if (battle.type === 'wild') bg = 'forest_bg.png';
    else if (battle.customBackground) bg = battle.customBackground;

    let returnUrl = '/lobby';
    if(battle.returnMap) {
        const separator = battle.returnMap.includes('?') ? '&' : '?';
        returnUrl = `/${battle.returnMap}${separator}userId=${battle.userId}`;
        if(battle.returnX) returnUrl += `&x=${battle.returnX}`;
        if(battle.returnY) returnUrl += `&y=${battle.returnY}`;
    } else {
        returnUrl = `/lobby?userId=${battle.userId}`;
    }

    res.render('battle', { p1: battle.p1, p2: battle.p2, battleId: req.params.id, battleMode: battle.type === 'local' ? 'manual' : battle.type, isSpectator: false, myRoleId: battle.p1.instanceId, realUserId: battle.userId, playerName: battle.p1.playerName, playerSkin: battle.p1.skin, bgImage: bg, battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable, returnUrl }); 
});

app.get('/admin', async (req, res) => { try { const { userId } = req.query; if (!userId) return res.send("Acesso negado."); const user = await User.findById(userId); if (!user || !user.isAdmin) return res.send("Acesso negado."); const pokemons = await BasePokemon.find({}, '-_id -__v').sort({ id: 1 }).lean(); res.render('admin', { pokemonsJSON: JSON.stringify(pokemons, null, 4), userId: user._id }); } catch (e) { res.send("Erro: " + e.message); } });
app.post('/admin/save', async (req, res) => { try { const { userId, jsonData } = req.body; const user = await User.findById(userId); if (!user || !user.isAdmin) return res.status(403).json({ error: "Não autorizado" }); let data; try { data = JSON.parse(jsonData); } catch (e) { return res.status(400).json({ error: "JSON Inválido" }); } if (!Array.isArray(data)) return res.status(400).json({ error: "O JSON deve ser uma lista" }); const incomingIds = data.map(p => p.id).filter(id => id); await BasePokemon.deleteMany({ id: { $nin: incomingIds } }); const bulkOps = data.map(p => ({ updateOne: { filter: { id: p.id }, update: { $set: p }, upsert: true } })); if (bulkOps.length > 0) { await BasePokemon.bulkWrite(bulkOps); } res.json({ success: true, count: bulkOps.length }); } catch (e) { res.status(500).json({ error: "Erro interno" }); } });

// --- LÓGICA DE TURNO ---
app.post('/api/turn', async (req, res) => {
    const { battleId, action, moveId, isForced } = req.body; const battle = activeBattles[battleId]; if(!battle) { return res.json({ finished: true }); }
    try {
        let p1 = battle.p1; const p2 = battle.p2; const events = []; let threwPokeball = false;
        
        if (action === 'switch') { 
            const user = await User.findById(battle.userId); if (!user) return res.json({ events: [{type:'MSG', text:'Erro'}]}); 
            if (!isForced) { const prevPoke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId); if(prevPoke) prevPoke.currentHp = p1.hp; } 
            const newPokeData = user.pokemonTeam.find(p => p._id.toString() === moveId); 
            if (!newPokeData || newPokeData.currentHp <= 0) return res.json({ events: [{type:'MSG', text:'Desmaiado!'}]}); 
            const base = await BasePokemon.findOne({ id: newPokeData.baseId }); 
            const newEntity = userPokemonToEntity(newPokeData, base); newEntity.playerName = p1.playerName; newEntity.skin = p1.skin; 
            
            battle.p1 = newEntity; p1 = battle.p1; await user.save(); 
            events.push({ type: 'MSG', text: `Vai, ${p1.name}!` }); 
            
            if (p2.hp > 0 && !isForced) { 
                performEnemyTurn(p2, p1, events); 
                applyStatusDamage(p1, events); 
                applyStatusDamage(p2, events); 
            } 
            return res.json({ events, p1State: { hp: p1.hp, maxHp: p1.maxHp, energy: p1.energy, maxEnergy: p1.maxEnergy, name: p1.name, level: p1.level, sprite: p1.sprite, moves: p1.moves }, p2State: { hp: p2.hp }, switched: true, newP1Id: p1.instanceId }); 
        }

        if (action === 'catch') { 
            if (battle.type !== 'wild') { events.push({ type: 'MSG', text: 'Não pode capturar.' }); return res.json({ events }); } 
            try { 
                const user = await User.findById(battle.userId); 
                if((user.pokeballs || 0) <= 0) { events.push({ type: 'MSG', text: 'Sem CatchCubes!' }); return res.json({ events }); } 
                user.pokeballs--; threwPokeball = true; 
                const chance = (p2.catchRate * (1 - (p2.hp / p2.maxHp))) + 0.15 + (p2.status ? 0.2 : 0); 
                
                if (Math.random() < chance) { 
                    const activeP1Index = user.pokemonTeam.findIndex(p => p._id.toString() === p1.instanceId); 
                    if (activeP1Index !== -1) user.pokemonTeam[activeP1Index].currentHp = p1.hp; 
                    const newStats = calculateStats(p2.stats, p2.level); 
                    const newPokeObj = { baseId: p2.baseId, nickname: p2.name, level: p2.level, currentHp: newStats.hp, stats: newStats, moves: p2.moves.map(m => m.id), learnedMoves: p2.moves.map(m => m.id) }; 
                    let sentToPC = false; 
                    if (!user.pc) user.pc = []; 
                    if (user.pokemonTeam.length < 6) user.pokemonTeam.push(newPokeObj); else { user.pc.push(newPokeObj); sentToPC = true; } 
                    
                    if (!user.dex) user.dex = [];
                    if (!user.dex.includes(p2.baseId)) { user.dex.push(p2.baseId); }

                    await user.save(); 
                    delete activeBattles[battleId]; 
                    return res.json({ events, finished: true, win: true, captured: true, sentToPC, winnerId: p1.instanceId, threw: threwPokeball }); 
                } else { 
                    await user.save(); 
                    events.push({ type: 'MSG', text: `${p2.name} escapou!` }); 
                    performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); 
                } 
            } catch (e) { events.push({ type: 'MSG', text: 'Erro.' }); return res.json({ events }); } 
        } 
        else if (action === 'run') { if (Math.random() > 0.4) { delete activeBattles[battleId]; return res.json({ events: [{type:'MSG', text:'Fugiu!'}], finished: true, fled: true }); } else { events.push({ type: 'MSG', text: `Falha ao fugir!` }); performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); } } 
        else if (action === 'move') { const p1Move = p1.moves.find(m => m.id === moveId); if (p1.stats.speed >= p2.stats.speed) { processAction(p1, p2, p1Move, events); if (p2.hp > 0) performEnemyTurn(p2, p1, events); } else { performEnemyTurn(p2, p1, events); if (p1.hp > 0) processAction(p1, p2, p1Move, events); } if (p1.hp > 0) applyStatusDamage(p1, events); if (p2.hp > 0) applyStatusDamage(p2, events); }
        if (p1.hp <= 0) { const user = await User.findById(battle.userId); if(user) { const poke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId); if(poke) { poke.currentHp = 0; await user.save(); } const hasAlive = user.pokemonTeam.some(p => p.currentHp > 0); if (hasAlive) { events.push({ type: 'MSG', text: `${p1.name} desmaiou!` }); let switchable = []; for (let p of user.pokemonTeam) { if (p.currentHp > 0) { const b = await BasePokemon.findOne({ id: p.baseId }); if(b) switchable.push(userPokemonToEntity(p, b)); } } return res.json({ events, forceSwitch: true, switchable }); } } delete activeBattles[battleId]; return res.json({ events, finished: true, win: false, winnerId: p2.instanceId, threw: threwPokeball }); }
        
        if (p2.hp <= 0) {
            let xpGained = battle.type === 'wild' ? (p2.xpYield || 25) : 30; 
            events.push({ type: 'MSG', text: `${p2.name} desmaiou!` }); 
            events.push({ type: 'MSG', text: `Ganhou ${xpGained} XP!` });
            
            const user = await User.findById(battle.userId); 
            if(user) {
                let poke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId);
                if (poke) { 
                    poke.xp += xpGained; const xpNext = getXpForNextLevel(poke.level);
                    if (poke.xp >= xpNext && poke.level < 100) {
                        poke.level++; poke.xp = 0; events.push({ type: 'MSG', text: `${poke.nickname} subiu para o nível ${poke.level}!` });
                        const baseData = await BasePokemon.findOne({ id: poke.baseId });
                        if (baseData.movePool) { const newMove = baseData.movePool.find(m => m.level === poke.level); if(newMove && !poke.learnedMoves.includes(newMove.moveId)) { poke.learnedMoves.push(newMove.moveId); events.push({ type: 'MSG', text: `Aprendeu ${MOVES_LIBRARY[newMove.moveId].name}!` }); if(poke.moves.length < 4) poke.moves.push(newMove.moveId); } }
                        if (baseData.evolution && poke.level >= baseData.evolution.level) { 
                            const nextPoke = await BasePokemon.findOne({ id: baseData.evolution.targetId }); 
                            if(nextPoke) { 
                                poke.baseId = nextPoke.id; poke.nickname = nextPoke.name; events.push({ type: 'MSG', text: `Evoluiu para ${nextPoke.name}!` }); 
                                if (!user.dex) user.dex = [];
                                if (!user.dex.includes(nextPoke.id)) { user.dex.push(nextPoke.id); }
                            } 
                        }
                        const currentBase = await BasePokemon.findOne({ id: poke.baseId }); poke.stats = calculateStats(currentBase.baseStats, poke.level);
                    }
                    poke.currentHp = p1.hp; await user.save(); 
                }
            }

            if (battle.npcReserve) {
                const currentInReserve = battle.npcReserve.find(p => p.instanceId === p2.instanceId);
                if (currentInReserve) currentInReserve.hp = 0;
                const nextNpcPoke = battle.npcReserve.find(p => p.hp > 0);
                if (nextNpcPoke) {
                    battle.p2 = nextNpcPoke;
                    events.push({ type: 'MSG', text: `${battle.p2.playerName} vai usar ${nextNpcPoke.name}!` });
                    return res.json({ events, switched: true, p2Switched: true, newP1Id: p1.instanceId, p1State: p1, p2State: nextNpcPoke });
                }
            }

            if (battle.type === 'local' && battle.npcId) { 
                try { 
                    const npc = await NPC.findById(battle.npcId);
                    if (user) { 
                        let reward = 0;
                        if(npc && npc.moneyReward > 0) reward = npc.moneyReward;
                        else reward = Math.max(5, (p2.level || 1) * 5 * (battle.npcReserve ? battle.npcReserve.length : 1));

                        user.money = (user.money || 0) + reward; 
                        
                        if (!user.defeatedNPCs) user.defeatedNPCs = [];
                        const npcIdStr = String(battle.npcId);
                        const recordIndex = user.defeatedNPCs.findIndex(r => String(r.npcId) === npcIdStr);
                        if (recordIndex !== -1) {
                            user.defeatedNPCs[recordIndex].defeatedAt = Date.now();
                        } else {
                            user.defeatedNPCs.push({ npcId: npcIdStr, defeatedAt: Date.now() });
                        }

                        events.push({ type: 'MSG', text: `Ganhou ${reward} moedas!` }); 

                        if (npc && npc.reward && npc.reward.type !== 'none') {
                            if (npc.reward.type === 'item') {
                                const itemMap = { 'pokeball': 'pokeballs', 'rareCandy': 'rareCandy' };
                                const field = itemMap[npc.reward.value];
                                if (field) {
                                    user[field] = (user[field] || 0) + (npc.reward.qty || 1);
                                    events.push({ type: 'MSG', text: `Recebeu ${npc.reward.qty}x ${npc.reward.value}!` });
                                }
                            } else if (npc.reward.type === 'pokemon') {
                                const rewardBase = await BasePokemon.findOne({ id: npc.reward.value });
                                if (rewardBase) {
                                    const rewardLvl = npc.reward.level || 1;
                                    const rStats = calculateStats(rewardBase.baseStats, rewardLvl);
                                    let rMoves = rewardBase.movePool ? rewardBase.movePool.filter(m => m.level <= rewardLvl).map(m => m.moveId) : ['tackle'];
                                    const newPoke = { baseId: rewardBase.id, nickname: rewardBase.name, level: rewardLvl, currentHp: rStats.hp, stats: rStats, moves: rMoves, learnedMoves: rMoves };
                                    if (user.pokemonTeam.length < 6) user.pokemonTeam.push(newPoke); else user.pc.push(newPoke);
                                    
                                    if (!user.dex) user.dex = [];
                                    if (!user.dex.includes(rewardBase.id)) { user.dex.push(rewardBase.id); }

                                    events.push({ type: 'MSG', text: `Recebeu ${rewardBase.name}!` });
                                }
                            }
                        }
                        await user.save(); 
                    } 
                } catch (e) { console.error(e); } 
            }
            delete activeBattles[battleId]; 
            return res.json({ events, finished: true, win: true, winnerId: p1.instanceId, threw: threwPokeball });
        }
        return res.json({ events, p1State: { hp: p1.hp, energy: p1.energy }, p2State: { hp: p2.hp }, threw: threwPokeball });
    } catch (err) { console.error(err); return res.json({ events: [{ type: 'MSG', text: 'Erro interno.' }], finished: true }); }
});

io.on('connection', (socket) => {
    socket.on('join_room', (roomId) => { socket.join(roomId); });
    socket.on('enter_map', async (data) => { 
        if (data && data.userId) { 
            const existingEntry = Object.entries(players).find(([sid, p]) => p.userId && p.userId.toString() === data.userId.toString()); 
            if (existingEntry) { 
                const [prevId, prevPlayer] = existingEntry;
                if (prevId !== socket.id) {
                    try { io.sockets.sockets.get(prevId)?.disconnect(true); } catch(e){} 
                    delete players[prevId]; 
                    if (prevPlayer.map && prevPlayer.map !== data.map) io.to(prevPlayer.map).emit('player_left', prevId);
                }
            } 
        } 
        
        socket.join(data.map); 
        const mapNpcs = await NPC.find({ map: data.map }).lean(); 
        socket.emit('npcs_list', mapNpcs);
        
        const startX = data.x || 50; 
        const startY = data.y || 50; 
        
        players[socket.id] = { id: socket.id, userId: data.userId, ...data, x: startX, y: startY, direction: 'down', isSearching: false }; 
        const mapPlayers = Object.values(players).filter(p => p.map === data.map); 
        socket.emit('map_state', mapPlayers); 
        socket.to(data.map).emit('player_joined', players[socket.id]); 
    });
    socket.on('move_player', (data) => { if (players[socket.id]) { const p = players[socket.id]; const dx = data.x - p.x; const dy = data.y - p.y; let dir = p.direction; if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left'; else dir = dy > 0 ? 'down' : 'up'; p.x = data.x; p.y = data.y; p.direction = dir; io.to(p.map).emit('player_moved', { id: socket.id, x: data.x, y: data.y, direction: dir }); } });
    socket.on('send_chat', (data) => { const p = players[socket.id]; if (p) { const payload = { id: socket.id, msg: (typeof data === 'object' ? data.msg : data).substring(0, 50) }; const room = (typeof data === 'object' ? data.roomId : null) || p.map; io.to(room).emit('chat_message', payload); } });
    
  socket.on('check_encounter', (data) => { 
        if (data.grassId && data.grassId.includes('grass') && Math.random() < GLOBAL_GRASS_CHANCE) {
            socket.emit('encounter_found'); 
        }
    });
    
    socket.on('disconnect', () => { matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id); if (players[socket.id]) { const map = players[socket.id].map; delete players[socket.id]; io.to(map).emit('player_left', socket.id); } });
    socket.on('cancel_match', () => { matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id); if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } });
    
    socket.on('find_match', async (fighterId, userId, playerName, playerSkin, bet = 0) => { 
        if(matchmakingQueue.find(u => u.socket.id === socket.id)) return; 
        if(players[socket.id]) { players[socket.id].isSearching = true; io.emit('player_updated', players[socket.id]); } 
        try { 
            const user = await User.findById(userId); 
            if(!user) { socket.emit('search_error', 'User error'); return; } 
            if(bet && user.money < bet) { socket.emit('search_error', 'Saldo insuficiente'); if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } return; } 
            const userPokeData = user.pokemonTeam.id(fighterId); 
            if(!userPokeData || userPokeData.currentHp <= 0) { if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } socket.emit('search_error', 'Pokémon inválido!'); return; } 
            const base = await BasePokemon.findOne({ id: userPokeData.baseId }); 
            const playerEntity = userPokemonToEntity(userPokeData, base); playerEntity.userId = userId; playerEntity.id = socket.id; playerEntity.playerName = playerName; playerEntity.skin = playerSkin; 
            matchmakingQueue.push({ socket, entity: playerEntity, bet: Number(bet) || 0, userId }); 
            if (matchmakingQueue.length >= 2) { 
                let pairIndex = -1; let p1 = null; let p2 = null; 
                for (let i = 0; i < matchmakingQueue.length; i++) { 
                    for (let j = i+1; j < matchmakingQueue.length; j++) { 
                        const a = matchmakingQueue[i]; const b = matchmakingQueue[j]; 
                        const betToUse = Math.min(a.bet || 0, b.bet || 0); 
                        try { const userA = await User.findById(a.userId); const userB = await User.findById(b.userId); if(userA && userB && userA.money >= betToUse && userB.money >= betToUse) { p1 = a; p2 = b; pairIndex = i; break; } } catch(e) { continue; } 
                    } 
                    if(pairIndex !== -1) break; 
                } 
                if(p1 && p2) { 
                    matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== p1.socket.id && u.socket.id !== p2.socket.id); 
                    if(players[p1.socket.id]) { players[p1.socket.id].isSearching = false; io.emit('player_updated', players[p1.socket.id]); } 
                    if(players[p2.socket.id]) { players[p2.socket.id].isSearching = false; io.emit('player_updated', players[p2.socket.id]); } 
                    const roomId = `room_${Date.now()}`; const betAmount = Math.min(p1.bet || 0, p2.bet || 0); 
                    onlineBattles[roomId] = { p1: p1.entity, p2: p2.entity, turn: 1, bet: betAmount }; 
                    p1.socket.emit('match_found', { roomId, me: p1.entity, opponent: p2.entity, bet: betAmount }); 
                    p2.socket.emit('match_found', { roomId, me: p2.entity, opponent: p1.entity, bet: betAmount }); 
                } 
            } 
        } catch(e) { console.error(e); } 
    });
    
    socket.on('join_spectator', ({ roomId, name, skin }) => { socket.join(roomId); if (!roomSpectators[roomId]) roomSpectators[roomId] = {}; roomSpectators[roomId][socket.id] = { id: socket.id, name, skin, x: Math.random() * 90, y: Math.random() * 80 }; socket.emit('spectators_update', roomSpectators[roomId]); io.to(roomId).emit('spectator_joined', roomSpectators[roomId][socket.id]); });
    socket.on('spectator_move', ({ roomId, x, y }) => { if (roomSpectators[roomId] && roomSpectators[roomId][socket.id]) { roomSpectators[roomId][socket.id].x = x; roomSpectators[roomId][socket.id].y = y; io.to(roomId).emit('spectator_moved', { id: socket.id, x, y }); } });
    socket.on('request_active_battles', () => { const list = Object.keys(onlineBattles).map(roomId => { const b = onlineBattles[roomId]; return { id: roomId, p1Name: b.p1.playerName, p1Skin: b.p1.skin, p2Name: b.p2.playerName, p2Skin: b.p2.skin, turn: b.turn }; }); socket.emit('active_battles_list', list); });
    
    socket.on('online_action', async ({ roomId, action, value, playerId }) => { 
        const battle = onlineBattles[roomId]; 
        if (!battle || battle.processing) return; 

        const isP1 = (String(playerId) === String(battle.p1.userId)); 
        const actor = isP1 ? battle.p1 : battle.p2; 
        
        if (actor.hp <= 0 && action === 'switch') {
            const user = await User.findById(actor.userId);
            const newPokeData = user.pokemonTeam.find(p => p._id.toString() === value);
            
            if (newPokeData && newPokeData.currentHp > 0) {
                const base = await BasePokemon.findOne({ id: newPokeData.baseId });
                const newEntity = userPokemonToEntity(newPokeData, base);
                newEntity.userId = actor.userId;
                newEntity.id = actor.id;
                newEntity.playerName = actor.playerName;
                newEntity.skin = actor.skin;
                newEntity.ready = false;

                if (isP1) battle.p1 = newEntity; else battle.p2 = newEntity;

                const events = [
                    { type: 'MSG', text: `${actor.playerName} trocou para ${newEntity.name}!` },
                    { type: 'SWITCH_ANIM', side: isP1 ? 'p1' : 'p2', newSprite: newEntity.sprite, newHp: newEntity.hp, maxHp: newEntity.maxHp, newName: newEntity.name, newLevel: newEntity.level, newId: newEntity.instanceId }
                ];
                
                const payload = { events, switched: true };
                if (isP1) { payload.p1State = battle.p1; payload.newP1Id = battle.p1.instanceId; }
                else { payload.p2State = battle.p2; payload.p2Switched = true; }

                io.to(roomId).emit('turn_result', payload);
                return;
            }
        }

        if (action === 'forfeit') {
            const events = [{ type: 'MSG', text: `${actor.playerName} desistiu da batalha!` }];
            io.to(roomId).emit('turn_result', { events, winnerId: isP1 ? battle.p2.userId : battle.p1.userId });
            delete onlineBattles[roomId];
            return;
        }

        if (action === 'switch') {
            const user = await User.findById(actor.userId);
            const newPokeData = user.pokemonTeam.find(p => p._id.toString() === value);
            if (newPokeData && newPokeData.currentHp > 0) {
                actor.nextAction = { type: 'switch', data: newPokeData };
                actor.ready = true;
            }
        } 
        else if (action === 'move') {
            if (value === 'rest') {
                actor.nextAction = { type: 'rest' };
            } else {
                const chosenMove = actor.moves.find(m => m.id === value);
                if (chosenMove) actor.nextAction = { type: 'move', move: chosenMove };
            }
            if (actor.nextAction) actor.ready = true;
        }

        if (battle.p1.ready && battle.p2.ready) { 
            battle.processing = true; 
            const events = []; 
            const p1 = battle.p1; 
            const p2 = battle.p2; 
            
            const executeAction = async (act, opp, isP1Action) => {
                const actionData = act.nextAction;
                if (actionData.type === 'switch') {
                    const base = await BasePokemon.findOne({ id: actionData.data.baseId });
                    const user = await User.findById(act.userId);
                    const prevPoke = user.pokemonTeam.find(p => p._id.toString() === act.instanceId);
                    if(prevPoke) prevPoke.currentHp = act.hp;
                    await user.save();

                    const newEntity = userPokemonToEntity(actionData.data, base);
                    newEntity.userId = act.userId;
                    newEntity.id = act.id; 
                    newEntity.playerName = act.playerName;
                    newEntity.skin = act.skin;
                    newEntity.ready = false;

                    if (isP1Action) battle.p1 = newEntity; else battle.p2 = newEntity;
                    events.push({ type: 'MSG', text: `${act.playerName} trocou para ${newEntity.name}!` });
                    events.push({ type: 'SWITCH_ANIM', side: isP1Action ? 'p1' : 'p2', newSprite: newEntity.sprite, newHp: newEntity.hp, maxHp: newEntity.maxHp, newName: newEntity.name, newLevel: newEntity.level, newId: newEntity.instanceId });
                    return isP1Action ? battle.p1 : battle.p2;
                } 
                if (actionData.type === 'rest') {
                    act.energy += 5; 
                    events.push({ type: 'REST', actorId: act.instanceId, newEnergy: act.energy });
                } 
                if (actionData.type === 'move') {
                    processAction(act, opp, actionData.move, events);
                }
                return act; 
            };

            let activeP1 = p1;
            let activeP2 = p2;
            
            if (p1.nextAction.type === 'switch') activeP1 = await executeAction(p1, p2, true);
            if (p2.nextAction.type === 'switch') activeP2 = await executeAction(p2, activeP1, false);

            const p1Acted = p1.nextAction.type === 'switch';
            const p2Acted = p2.nextAction.type === 'switch';

            if (!p1Acted && !p2Acted) {
                let first = activeP1.stats.speed >= activeP2.stats.speed ? activeP1 : activeP2; 
                let second = first === activeP1 ? activeP2 : activeP1; 
                await executeAction(first, second, first === activeP1);
                if (second.hp > 0) await executeAction(second, first, second === activeP1);
            } 
            else {
                if (!p1Acted && activeP1.hp > 0) await executeAction(activeP1, activeP2, true);
                if (!p2Acted && activeP2.hp > 0) await executeAction(activeP2, activeP1, false);
            }

            if (activeP1.hp > 0) applyStatusDamage(activeP1, events);
            if (activeP2.hp > 0) applyStatusDamage(activeP2, events);
            
            battle.p1.ready = false; battle.p2.ready = false; 
            delete battle.p1.nextAction; delete battle.p2.nextAction; 
            battle.processing = false; 

            let winnerId = null;
            let forceSwitch = null;

            if (battle.p1.hp <= 0) {
                 const user1 = await User.findById(battle.p1.userId);
                 const hasAlive1 = user1.pokemonTeam.some(p => p.currentHp > 0 && p._id.toString() !== battle.p1.instanceId); 
                 
                 const deadPoke = user1.pokemonTeam.find(p => p._id.toString() === battle.p1.instanceId);
                 if(deadPoke) { deadPoke.currentHp = 0; await user1.save(); }

                 if (hasAlive1) {
                     events.push({ type: 'MSG', text: `${battle.p1.name} desmaiou!` });
                     forceSwitch = { target: battle.p1.userId }; 
                 } else {
                     winnerId = battle.p2.userId; 
                 }
            }

            if (!winnerId && battle.p2.hp <= 0) {
                 const user2 = await User.findById(battle.p2.userId);
                 const hasAlive2 = user2.pokemonTeam.some(p => p.currentHp > 0 && p._id.toString() !== battle.p2.instanceId);
                 
                 const deadPoke2 = user2.pokemonTeam.find(p => p._id.toString() === battle.p2.instanceId);
                 if(deadPoke2) { deadPoke2.currentHp = 0; await user2.save(); }

                 if (hasAlive2) {
                     events.push({ type: 'MSG', text: `${battle.p2.name} desmaiou!` });
                     if (!forceSwitch) forceSwitch = { target: battle.p2.userId }; 
                 } else {
                     winnerId = battle.p1.userId; 
                 }
            }
            
            if (winnerId) {
                 const betAmount = (battle.bet) ? Number(battle.bet) : 0; 
                if (betAmount > 0) { 
                    try { 
                        const winnerUser = (String(winnerId) === String(battle.p1.userId)) ? await User.findById(battle.p1.userId) : await User.findById(battle.p2.userId); 
                        const loserUser = (String(winnerId) === String(battle.p1.userId)) ? await User.findById(battle.p2.userId) : await User.findById(battle.p1.userId); 
                        if (winnerUser && loserUser) { 
                            const actualDeduct = Math.min(loserUser.money || 0, betAmount); 
                            loserUser.money = Math.max(0, (loserUser.money || 0) - actualDeduct); 
                            winnerUser.money = (winnerUser.money || 0) + actualDeduct; 
                            await loserUser.save(); await winnerUser.save(); 
                            events.push({ type: 'MSG', text: `Aposta: ${winnerUser.username} ganhou ${actualDeduct}!` }); 
                        } 
                    } catch (e) { console.error(e); } 
                }
                delete onlineBattles[roomId];
            }
            
            const payload = { events, winnerId, forceSwitch };
            if (p1Acted || p2Acted) {
                payload.switched = true;
                if(p1Acted) {
                    payload.p1State = battle.p1;
                    payload.newP1Id = battle.p1.instanceId;
                }
                if(p2Acted) {
                    payload.p2State = battle.p2;
                    payload.p2Switched = true;
                }
                if(!payload.p1State) payload.p1State = battle.p1;
                if(!payload.p2State) payload.p2State = battle.p2;
            }

            io.to(roomId).emit('turn_result', payload);
        } else { 
            socket.to(roomId).emit('opponent_ready'); 
        } 
    });
});

seedDatabase().then(() => { const PORT = process.env.PORT || 3000; server.listen(PORT, () => console.log(`Server ON Port ${PORT}`)); });
