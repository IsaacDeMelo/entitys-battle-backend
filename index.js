const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

const { BasePokemon, User, NPC, GameMap, ItemDefinition } = require('./models');
const { processPngBuffer } = require('./lib/chromaKey');
const { EntityType, MoveType, TypeChart, MOVES_LIBRARY, getXpForNextLevel, getTypeEffectiveness } = require('./gameData');
const { MONGO_URI } = require('./config'); 

const SKIN_COUNT = 12; 
const GLOBAL_GRASS_CHANCE = 0.35;

// --- STARTER (obtido via NPC no jogo) ---
const STARTER_FLAG_ID = 'starter_chosen';

async function getStarterOptions() {
    const starters = await BasePokemon.find({ isStarter: true }).sort({ id: 1 }).limit(3).lean();
    return starters.map(s => ({ id: s.id, name: s.name, sprite: s.sprite || null }));
}

async function getStarterOptionsForNpc(npc) {
    const interact = npc && npc.interact ? npc.interact : null;
    const raw = interact && Array.isArray(interact.starterOptions) ? interact.starterOptions : [];
    const list = raw
        .map(x => String(x || '').trim())
        .filter(Boolean);

    // Compatibilidade: se não configurou, cai no global (isStarter=true)
    if (!list.length) return await getStarterOptions();

    // Se configurou parcialmente, melhor avisar (evita escolha inválida)
    const unique = Array.from(new Set(list));
    if (unique.length < 3) return { error: 'Este NPC está configurado como starter, mas tem menos de 3 opções em starterOptions.' };

    const docs = await BasePokemon.find({ id: { $in: unique } }).lean();
    const byId = new Map(docs.map(d => [String(d.id), d]));
    const options = unique
        .map(id => {
            const d = byId.get(id);
            if (!d) return null;
            return { id: d.id, name: d.name, sprite: d.sprite || null };
        })
        .filter(Boolean);
    return options;
}


// --- CONEXÃO BANCO ---
mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('✅ MongoDB Conectado');
        await fixLegacyUsers();
        await ensureDefaultItemCatalog();
        await refreshItemCatalogCache();
    })
    .catch(e => console.log('❌ Erro no Mongo:', e));

async function ensureDefaultItemCatalog() {
    try {
        const defaults = [
            { id: 'pokeball', name: 'CatchCube', type: 'consumable' },
            { id: 'rareCandy', name: 'Rare Candy', type: 'consumable' }
        ];
        for (const it of defaults) {
            const existing = await ItemDefinition.findOne({ id: it.id });
            if (!existing) {
                await ItemDefinition.create({
                    id: it.id,
                    name: it.name,
                    type: it.type,
                    iconPngBase64: '',
                    updatedAt: Date.now()
                });
            }
        }
    } catch (e) {
        console.error('Erro ao garantir catálogo padrão:', e);
    }
}

async function fixLegacyUsers() {
    try {
        const users = await mongoose.connection.db.collection('users').find({}).toArray();
        for (let u of users) {
            if (u.defeatedNPCs && u.defeatedNPCs.length > 0 && typeof u.defeatedNPCs[0] === 'string') {
                const newFormat = u.defeatedNPCs.map(id => ({ npcId: id, defeatedAt: 0 }));
                await mongoose.connection.db.collection('users').updateOne({ _id: u._id }, { $set: { defeatedNPCs: newFormat } });
            }
        }
    } catch (e) { console.error("Erro migração:", e); }
}

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    maxHttpBufferSize: 1e8, 
    cors: { origin: "*" }
});

app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));

const activeBattles = {}; 
const onlineBattles = {}; 
const players = {}; 
let matchmakingQueue = []; // Declarado globalmente
const roomSpectators = {}; 

// Cache da lista de NPCs por mapa (para sockets/patrol sem query constante)
const npcCacheByMap = {};

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// --- CATÁLOGO DE ITENS (central, cacheado) ---
let ITEM_CATALOG_CACHE = [];
let ITEM_CATALOG_MAP = new Map();

function normalizeCatalogItemId(id) {
    return String(id || '').trim();
}

async function refreshItemCatalogCache() {
    try {
        const list = await ItemDefinition.find({}).sort({ id: 1 }).lean();
        ITEM_CATALOG_CACHE = Array.isArray(list) ? list.map(x => ({
            id: String(x.id || '').trim(),
            name: String(x.name || x.id || '').trim(),
            type: (String(x.type || 'consumable').trim() === 'key') ? 'key' : 'consumable',
            hasIcon: !!(x.iconPngBase64 && String(x.iconPngBase64).trim()),
            updatedAt: x.updatedAt || 0
        })).filter(x => x.id) : [];
        ITEM_CATALOG_MAP = new Map(ITEM_CATALOG_CACHE.map(it => [it.id, it]));
    } catch (e) {
        ITEM_CATALOG_CACHE = [];
        ITEM_CATALOG_MAP = new Map();
        console.error('Erro ao atualizar cache do catálogo:', e);
    }
}

function getItemDefFromCache(itemId) {
    const id = normalizeCatalogItemId(itemId);
    if (!id) return null;
    return ITEM_CATALOG_MAP.get(id) || null;
}

function parsePngDimensions(buf) {
    try {
        if (!Buffer.isBuffer(buf) || buf.length < 24) return null;
        // PNG signature
        const sig = buf.slice(0, 8);
        const pngSig = Buffer.from([0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A]);
        if (!sig.equals(pngSig)) return null;
        // IHDR chunk starts at offset 8: length(4) type(4) data...
        const chunkType = buf.slice(12, 16).toString('ascii');
        if (chunkType !== 'IHDR') return null;
        const width = buf.readUInt32BE(16);
        const height = buf.readUInt32BE(20);
        return { width, height };
    } catch (_) {
        return null;
    }
}

// --- FUNÇÕES AUXILIARES ---

// --- INVENTÁRIO / ITENS-CHAVE (retrocompatível) ---
function normalizeItemId(itemId) {
    return String(itemId || '').trim();
}

function ensureUserInventories(user) {
    if (!user) return;
    if (!user.inventory || typeof user.inventory !== 'object') user.inventory = {};
    if (!Array.isArray(user.keyItems)) user.keyItems = [];
    if (!user.storyFlags || typeof user.storyFlags !== 'object') user.storyFlags = {};
}

function getItemCount(user, itemId) {
    if (!user) return 0;
    ensureUserInventories(user);
    const id = normalizeItemId(itemId);
    if (!id) return 0;

    if (id === 'pokeball') return user.pokeballs || 0;
    if (id === 'rareCandy') return user.rareCandy || 0;
    if (user.keyItems.includes(id)) return 1;

    const raw = user.inventory[id];
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
}

function addItemToUser(user, itemId, qty = 1, opts = {}) {
    ensureUserInventories(user);
    const id = normalizeItemId(itemId);
    const amount = Math.max(1, parseInt(qty, 10) || 1);
    const def = getItemDefFromCache(id);
    const isKeyItem = !!opts.keyItem || (def && def.type === 'key');
    const unique = !!opts.unique;

    if (!id) return { ok: false, reason: 'invalid_item' };

    if (id === 'pokeball') {
        user.pokeballs = (user.pokeballs || 0) + amount;
        return { ok: true, added: amount, storage: 'pokeballs' };
    }
    if (id === 'rareCandy') {
        user.rareCandy = (user.rareCandy || 0) + amount;
        return { ok: true, added: amount, storage: 'rareCandy' };
    }

    if (isKeyItem || id === 'key' || id.startsWith('key_')) {
        if (unique && user.keyItems.includes(id)) {
            return { ok: false, reason: 'already_has_key_item' };
        }
        if (!user.keyItems.includes(id)) user.keyItems.push(id);
        return { ok: true, added: 1, storage: 'keyItems' };
    }

    const prev = getItemCount(user, id);
    user.inventory[id] = prev + amount;
    return { ok: true, added: amount, storage: 'inventory' };
}

function removeItemFromUser(user, itemId, qty = 1) {
    ensureUserInventories(user);
    const id = normalizeItemId(itemId);
    const amount = Math.max(1, parseInt(qty, 10) || 1);
    if (!id) return { ok: false, reason: 'invalid_item' };

    if (id === 'pokeball') {
        if ((user.pokeballs || 0) < amount) return { ok: false, reason: 'not_enough' };
        user.pokeballs -= amount;
        return { ok: true, removed: amount };
    }
    if (id === 'rareCandy') {
        if ((user.rareCandy || 0) < amount) return { ok: false, reason: 'not_enough' };
        user.rareCandy -= amount;
        return { ok: true, removed: amount };
    }

    if (user.keyItems.includes(id)) {
        // Itens-chave são tratados como 1 unidade
        user.keyItems = user.keyItems.filter(k => k !== id);
        return { ok: true, removed: 1 };
    }

    const prev = getItemCount(user, id);
    if (prev < amount) return { ok: false, reason: 'not_enough' };
    const next = prev - amount;
    if (next <= 0) delete user.inventory[id];
    else user.inventory[id] = next;
    return { ok: true, removed: amount };
}

function pickWeightedPokemon(list) {
    let total = 0; list.forEach(p => total += (p.spawnChance || 1));
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) {
        const w = list[i].spawnChance || 1;
        if (r < w) return list[i];
        r -= w;
    }
    return list[0]; 
}

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
    if (!userPoke || !baseData) return null;

    const instanceId =
        (userPoke._id && typeof userPoke._id.toString === 'function')
            ? userPoke._id.toString()
            : (userPoke.instanceId ? String(userPoke.instanceId) : `poke_${Date.now()}_${Math.random().toString(16).slice(2)}`);

    const level = Number.isFinite(userPoke.level) ? userPoke.level : parseInt(userPoke.level) || 1;
    const stats = (userPoke.stats && Number.isFinite(userPoke.stats.hp)) ? userPoke.stats : calculateStats(baseData.baseStats, level);

    const rawMoves = (Array.isArray(userPoke.learnedMoves) && userPoke.learnedMoves.length > 0)
        ? userPoke.learnedMoves
        : (Array.isArray(userPoke.moves) ? userPoke.moves : []);

    const movesObj = rawMoves
        .map(mid => { const libMove = MOVES_LIBRARY[mid]; return libMove ? { ...libMove, id: mid } : null; })
        .filter(m => m !== null);

    const currentHp = Number.isFinite(userPoke.currentHp) ? userPoke.currentHp : stats.hp;

    return {
        instanceId,
        baseId: userPoke.baseId,
        name: userPoke.nickname || baseData.name,
        type: baseData.type,
        level,
        maxHp: stats.hp,
        hp: currentHp > 0 ? currentHp : 0,
        maxEnergy: stats.energy,
        energy: stats.energy,
        stats,
        moves: movesObj,
        sprite: baseData.sprite,
        isWild: false,
        xp: Number.isFinite(userPoke.xp) ? userPoke.xp : 0,
        xpToNext: getXpForNextLevel(level),
        status: null
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
    
    const cost = move.cost || 0;
    if (attacker.energy >= cost) { attacker.energy -= cost; } 
    else { logArray.push({ type: 'MSG', text: `${attacker.name} cansou!` }); return; }
    
    logArray.push({ type: 'USE_MOVE', actorId: attacker.instanceId || 'wild', moveName: move.name, moveIcon: move.icon, moveElement: move.element || 'normal', moveCategory: move.category || 'physical', moveType: move.type, cost: cost, newEnergy: attacker.energy });
    
    if(move.type === 'heal') { 
        const oldHp = attacker.hp; const healAmount = move.power + Math.floor(attacker.maxHp * 0.1); 
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
app.get('/', async (req, res) => {
    res.render('login', { error: null, skinCount: SKIN_COUNT });
});
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) {
        res.redirect('/city?map=house1&userId=' + user._id);
    } else {
        res.render('login', { error: 'Credenciais inválidas', skinCount: SKIN_COUNT });
    }
});
app.post('/register', async (req, res) => {
    const { username, password, skin } = req.body;
    try {
        const newUser = new User({ username, password, skin, pokemonTeam: [], pc: [], dex: [] });
        await newUser.save();
        res.redirect('/city?map=house1&userId=' + newUser._id);
    } catch (e) {
        res.render('login', { error: 'Usuário já existe.', skinCount: SKIN_COUNT });
    }
});

app.get('/lobby', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const teamData = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({id: p.baseId}); if(base) teamData.push(userPokemonToEntity(p, base)); } const allPokes = await BasePokemon.find().lean(); res.render('room', { user, playerName: user.username, playerSkin: user.skin, entities: allPokes, team: teamData, isAdmin: user.isAdmin, skinCount: SKIN_COUNT }); });
app.get('/forest', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const allPokes = await BasePokemon.find().lean(); res.render('forest', { user, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin, skinCount: SKIN_COUNT, entities: allPokes }); });

// --- ROTA CIDADE (ENGINE DE MAPA) ---
app.get('/city', async (req, res) => {
    const { userId, from, map } = req.query;
    const user = await User.findById(userId);
    if (!user) return res.redirect('/');
    
    // Tratamento de URL
    let mapId = map || 'city';
    if(mapId.includes('?')) mapId = mapId.split('?')[0];

    // Carrega mapa do DB
    let mapData = await GameMap.findOne({ mapId }).lean();
    if (!mapData) {
        mapData = { mapId: mapId, name: 'Mapa', bgImage: '/uploads/route_map.png', collisions: [], grass: [], interacts: [], portals: [], objects: [], spawnPoint: null, width: 100, height: 100, darknessLevel: 0 };
    }

    // Spawn Logic
    let startX = 50, startY = 50;
    if (req.query.x && req.query.y) {
        startX = parseFloat(req.query.x); startY = parseFloat(req.query.y);
    } else if (mapData.spawnPoint && typeof mapData.spawnPoint.x === 'number') {
        startX = mapData.spawnPoint.x; startY = mapData.spawnPoint.y;
    } else if (from === 'forest') {
        startX = 50; startY = 92;
    }

    const allPokes = await BasePokemon.find().lean();
    const teamData = []; 
    for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({id: p.baseId}); if(base) teamData.push(userPokemonToEntity(p, base)); }
    
    res.render('city', { user, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin, skinCount: SKIN_COUNT, startX, startY, entities: allPokes, team: teamData, mapData: mapData }); 
});

// --- API MAPAS ---
app.post('/api/map/save', async (req, res) => {
    const { userId, mapId, mapData } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Sem permissão' });
    try {
        await GameMap.findOneAndUpdate(
            { mapId: mapId },
            { $set: { 
                collisions: mapData.collisions, 
                grass: mapData.grass, 
                interacts: mapData.interacts, 
                portals: mapData.portals, 
                objects: mapData.objects || [],
                bgImage: mapData.bgImage, 
                width: mapData.width || 100, 
                height: mapData.height || 100, 
                spawnPoint: mapData.spawnPoint,
                darknessLevel: mapData.darknessLevel || 0, 
                battleBackground: mapData.battleBackground 
            }},
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) { res.json({ error: e.message }); }
});

app.get('/api/map/:mapId', async (req, res) => {
    try { const { mapId } = req.params; let map = await GameMap.findOne({ mapId }).lean(); if (!map) return res.json({ bgImage: '/uploads/room_bg.png', width: 100, height: 100 }); res.json(map); } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- TOOL: CHROMA KEY (UI) ---
app.get('/tools/chroma', async (req, res) => {
    const { userId, map } = req.query;
    const user = await User.findById(userId);
    if (!user) return res.redirect('/');
    const mapId = (map && String(map).trim()) ? String(map).trim() : 'city';

    res.render('chroma', {
        user,
        mapId,
        error: null,
        defaults: { key: 'ff00ff', tolerance: 55, feather: 0, despeckle: 30 }
    });
});

app.post('/tools/chroma', upload.single('image'), async (req, res) => {
    try {
        const { userId, key, tolerance, feather, despeckle, returnMap } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(403).send('Sem permissão');
        if (!req.file || !req.file.buffer) {
            return res.status(400).send('Arquivo inválido');
        }

        const { outputBuffer, meta } = processPngBuffer(req.file.buffer, {
            key: key || 'ff00ff',
            tolerance,
            feather,
            despeckle,
        });

        const baseName = (req.file.originalname || 'image.png').replace(/\.[^.]+$/, '');
        const outName = `${baseName}_alpha.png`;

        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Content-Disposition', `attachment; filename="${outName}"`);
        res.setHeader('X-Chroma-Key', meta.key);
        res.setHeader('X-Chroma-Tolerance', String(meta.tolerance));
        res.setHeader('X-Chroma-Feather', String(meta.feather));
        res.setHeader('X-Chroma-Despeckle', String(meta.despeckle));
        res.end(outputBuffer);
    } catch (e) {
        try {
            const user = await User.findById(req.body.userId);
            const mapId = (req.body.returnMap && String(req.body.returnMap).trim()) ? String(req.body.returnMap).trim() : 'city';
            if (user) {
                return res.status(400).render('chroma', {
                    user,
                    mapId,
                    error: e.message,
                    defaults: {
                        key: req.body.key || 'ff00ff',
                        tolerance: req.body.tolerance || 55,
                        feather: req.body.feather || 0,
                        despeckle: req.body.despeckle || 30,
                    }
                });
            }
        } catch (_) {}
        res.status(400).send(e.message);
    }
});

app.post('/api/npc/move', async (req, res) => {
    const { userId, npcId, x, y, mapId } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const updated = await NPC.findByIdAndUpdate(npcId, { x: x, y: y, map: mapId }, { new: true });
        if (updated) {
            const mapNpcs = await NPC.find({ map: mapId }).lean();
            npcCacheByMap[mapId] = mapNpcs;
            io.to(mapId).emit('npcs_list', mapNpcs);
            res.json({ success: true });
        }
        else res.json({ error: 'NPC não encontrado' });
    } catch (e) { res.json({ error: e.message }); }
});

// --- API NPC (CRUD) ---
const npcUploadApi = upload.fields([{ name: 'npcSkinFile', maxCount: 1 }, { name: 'battleBgFile', maxCount: 1 }]);
app.post('/api/npc/save', npcUploadApi, async (req, res) => {
    const {
        userId,
        npcId,
        npcType,
        name,
        map,
        x,
        y,
        direction,
        skinSelect,
        dialogue,
        winDialogue,
        cooldownDialogue,
        money,
        teamJson,
        rewardType,
        rewardVal,
        rewardQty,
        cooldownMinutes,
        rewardKeyItem,
        rewardUnique,
        blocksMovement,

        patrolEnabled,
        patrolMode,
        patrolSpeed,
        patrolPingAx,
        patrolPingAy,
        patrolPingBx,
        patrolPingBy,
        patrolCircleCx,
        patrolCircleCy,
        patrolCircleRadius,
        patrolCircleClockwise,

        patrolPathJson,

        interactEnabled,
        interactRequiresItemId,
        interactRequiresItemQty,
        interactConsumesRequiredItem,
        interactGivesItemId,
        interactGivesItemQty,
        interactGivesKeyItem,
        interactGivesUnique,
        interactFlagId,
        interactSuccessDialogue,
        interactNeedItemDialogue,
        interactAlreadyDoneDialogue,
        interactMoveDx,
        interactMoveDy,
        interactMoveDirection,

        interactServiceType,
        interactHealDialogue,
        interactShopItemsJson,
        interactStarterOptionsJson
    } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });

    try {
        const previous = npcId ? await NPC.findById(npcId).lean() : null;

        let finalSkin = skinSelect, isCustom = false;
        if (req.files && req.files['npcSkinFile'] && req.files['npcSkinFile'][0]) {
            finalSkin = `data:${req.files['npcSkinFile'][0].mimetype};base64,${req.files['npcSkinFile'][0].buffer.toString('base64')}`;
            isCustom = true;
        } else if (npcId && (!skinSelect || skinSelect === '')) {
            if (previous) {
                finalSkin = previous.skin;
                isCustom = !!previous.isCustomSkin;
            }
        }

        let finalBattleBg = 'battle_bg.png';
        if (req.files && req.files['battleBgFile'] && req.files['battleBgFile'][0]) {
            finalBattleBg = `data:${req.files['battleBgFile'][0].mimetype};base64,${req.files['battleBgFile'][0].buffer.toString('base64')}`;
        } else if (npcId && previous && previous.battleBackground) {
            finalBattleBg = previous.battleBackground;
        }

        let team = [];
        try { team = JSON.parse(teamJson || '[]'); } catch (e) {}

        const reward = {
            type: rewardType || 'none',
            value: rewardVal || '',
            qty: parseInt(rewardQty) || 1,
            level: (rewardType === 'pokemon') ? (parseInt(rewardQty) || 1) : 1,
            keyItem: rewardKeyItem === 'on' || rewardKeyItem === true || rewardKeyItem === 'true',
            unique: rewardUnique === 'on' || rewardUnique === true || rewardUnique === 'true'
        };

        const interact = {
            enabled: interactEnabled === 'on' || interactEnabled === true || interactEnabled === 'true',

            serviceType: (interactServiceType || '').trim(),
            healDialogue: interactHealDialogue || '',
            shopItems: (() => {
                if (!interactShopItemsJson) return [];
                try {
                    const arr = JSON.parse(interactShopItemsJson);
                    if (!Array.isArray(arr)) return [];
                    return arr
                        .map(x => ({
                            itemId: (x && x.itemId) ? String(x.itemId).trim() : '',
                            price: Math.max(0, parseInt(x && x.price, 10) || 0)
                        }))
                        .filter(x => x.itemId && x.price > 0);
                } catch (_) {
                    return [];
                }
            })(),

            starterOptions: (() => {
                if (!interactStarterOptionsJson) return [];
                try {
                    const raw = JSON.parse(interactStarterOptionsJson);
                    const arr = Array.isArray(raw) ? raw : [];
                    return Array.from(new Set(arr.map(x => String(x || '').trim()).filter(Boolean)));
                } catch (_) {
                    // Compat: também aceita lista "id1,id2,id3"
                    return Array.from(
                        new Set(
                            String(interactStarterOptionsJson || '')
                                .split(',')
                                .map(s => s.trim())
                                .filter(Boolean)
                        )
                    );
                }
            })(),

            requiresItemId: interactRequiresItemId || '',
            requiresItemQty: parseInt(interactRequiresItemQty) || 1,
            consumesRequiredItem: interactConsumesRequiredItem === 'on' || interactConsumesRequiredItem === true || interactConsumesRequiredItem === 'true',
            givesItemId: interactGivesItemId || '',
            givesItemQty: parseInt(interactGivesItemQty) || 1,
            givesKeyItem: interactGivesKeyItem === 'on' || interactGivesKeyItem === true || interactGivesKeyItem === 'true',
            givesUnique: interactGivesUnique === 'on' || interactGivesUnique === true || interactGivesUnique === 'true',
            flagId: interactFlagId || '',
            successDialogue: interactSuccessDialogue || '',
            needItemDialogue: interactNeedItemDialogue || '',
            alreadyDoneDialogue: interactAlreadyDoneDialogue || '',
            moveDx: parseFloat(interactMoveDx) || 0,
            moveDy: parseFloat(interactMoveDy) || 0,
            moveDirection: interactMoveDirection || ''
        };

        const patrolIsEnabled = patrolEnabled === 'on' || patrolEnabled === true || patrolEnabled === 'true';

        const parsedPath = (() => {
            if (!patrolPathJson) {
                const prev = (previous && previous.patrol && previous.patrol.path) ? previous.patrol.path : null;
                if (prev && Array.isArray(prev.points)) {
                    return {
                        loop: !!prev.loop,
                        points: prev.points
                            .map(p => ({
                                x: Math.max(0, Math.min(100, parseFloat(p && p.x))),
                                y: Math.max(0, Math.min(100, parseFloat(p && p.y)))
                            }))
                            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
                    };
                }
                return { loop: false, points: [] };
            }
            try {
                const raw = JSON.parse(patrolPathJson);
                const obj = Array.isArray(raw) ? { loop: false, points: raw } : raw;
                const loop = !!(obj && obj.loop);
                const pts = Array.isArray(obj && obj.points) ? obj.points : [];
                const points = pts
                    .map(p => ({
                        x: Math.max(0, Math.min(100, parseFloat(p && p.x))),
                        y: Math.max(0, Math.min(100, parseFloat(p && p.y)))
                    }))
                    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
                return { loop, points };
            } catch (_) {
                return { loop: false, points: [] };
            }
        })();

        const nextPatrol = {
            enabled: patrolIsEnabled,
            mode: (patrolMode || '').trim(),
            speed: Math.max(0.1, parseFloat(patrolSpeed) || 6),
            pingPong: {
                ax: parseFloat(patrolPingAx) || 0,
                ay: parseFloat(patrolPingAy) || 0,
                bx: parseFloat(patrolPingBx) || 0,
                by: parseFloat(patrolPingBy) || 0
            },
            circle: {
                cx: parseFloat(patrolCircleCx) || 0,
                cy: parseFloat(patrolCircleCy) || 0,
                radius: Math.max(0, parseFloat(patrolCircleRadius) || 0),
                clockwise: patrolCircleClockwise === 'on' || patrolCircleClockwise === true || patrolCircleClockwise === 'true'
            },
            path: {
                loop: parsedPath.loop,
                points: parsedPath.points
            },
            phaseOffsetMs: (previous && previous.patrol && Number.isFinite(previous.patrol.phaseOffsetMs))
                ? previous.patrol.phaseOffsetMs
                : Math.floor(Math.random() * 10000)
        };

        const npcData = {
            npcType: (npcType || '').trim(),
            name,
            map,
            x: parseInt(x) || 50,
            y: parseInt(y) || 50,
            direction: direction || 'down',
            skin: finalSkin,
            isCustomSkin: isCustom,
            dialogue,
            winDialogue,
            cooldownDialogue,
            moneyReward: parseInt(money) || 0,
            cooldownMinutes: parseInt(cooldownMinutes) || 0,
            team,
            reward,
            blocksMovement: blocksMovement === 'on' || blocksMovement === true || blocksMovement === 'true',
            interact,
            patrol: nextPatrol,
            battleBackground: finalBattleBg
        };

        let saved;
        if (npcId) {
            if (!req.files?.['npcSkinFile'] && skinSelect && !skinSelect.startsWith('data:')) {
                npcData.skin = skinSelect;
                npcData.isCustomSkin = false;
            }
            saved = await NPC.findByIdAndUpdate(npcId, npcData, { new: true });
        } else {
            saved = await new NPC(npcData).save();
        }

        // Atualiza listas em tempo real
        const newMapId = npcData.map;
        if (previous && previous.map && previous.map !== newMapId) {
            const oldList = await NPC.find({ map: previous.map }).lean();
            npcCacheByMap[previous.map] = oldList;
            io.to(previous.map).emit('npcs_list', oldList);
        }
        const mapList = await NPC.find({ map: newMapId }).lean();
        npcCacheByMap[newMapId] = mapList;
        io.to(newMapId).emit('npcs_list', mapList);

        res.json({ success: true, npc: saved });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/npc/delete', async (req, res) => {
    const { userId, npcId } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Acesso negado' });
    try {
        const npc = await NPC.findById(npcId).lean();
        if (!npc) return res.json({ error: 'NPC não encontrado' });
        await NPC.findByIdAndDelete(npcId);
        const mapList = await NPC.find({ map: npc.map }).lean();
        npcCacheByMap[npc.map] = mapList;
        io.to(npc.map).emit('npcs_list', mapList);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

// --- API NPC (INTERAÇÃO DE HISTÓRIA/ITENS) ---
app.post('/api/npc/interact', async (req, res) => {
    try {
        const { userId, npcId, playerX, playerY } = req.body;
        const user = await User.findById(userId);
        const npc = await NPC.findById(npcId);
        if (!user || !npc) return res.status(404).json({ error: 'NPC ou usuário não encontrado' });

        ensureUserInventories(user);
        const interact = npc.interact || {};
        if (!interact.enabled) {
            return res.json({ success: false, noInteraction: true, text: npc.dialogue || '...' });
        }

        // Se o cliente enviou posição do player, faz o NPC olhar para ele e pausa a patrulha por alguns segundos.
        // (Não salva no DB; é só em memória no cache)
        try {
            const px = parseFloat(playerX);
            const py = parseFloat(playerY);
            if (Number.isFinite(px) && Number.isFinite(py) && npc && npc.map) {
                const mapId = npc.map;
                let list = npcCacheByMap[mapId];
                if (!Array.isArray(list)) {
                    list = await NPC.find({ map: mapId }).lean();
                    npcCacheByMap[mapId] = list;
                }
                const idx = list.findIndex(n => n && String(n._id) === String(npc._id));
                if (idx >= 0) {
                    const n = list[idx];
                    const nx = typeof n.x === 'number' ? n.x : parseFloat(n.x) || 0;
                    const ny = typeof n.y === 'number' ? n.y : parseFloat(n.y) || 0;
                    const dx = px - nx;
                    const dy = py - ny;
                    const dir = computeDirectionFromDelta(dx, dy);
                    list[idx] = { ...n, direction: dir, _faceDirection: dir, _pauseUntil: Date.now() + 8000 };
                    io.to(mapId).emit('npcs_list', list);
                }
            }
        } catch (_) {}

        const serviceType = (interact.serviceType || '').trim();

        const flagId = (interact.flagId && String(interact.flagId).trim()) ? String(interact.flagId).trim() : `npc_interact_${npc._id}`;

        // Starter: usa flag global (não depende do flagId do NPC).
        // Não marca flag aqui (marca só quando escolher). Só retorna ação com opções.
        if (serviceType === 'starter') {
            const already = !!user.storyFlags[STARTER_FLAG_ID];
            if (already) {
                const text = interact.alreadyDoneDialogue || 'Você já escolheu o seu monstro inicial.';
                return res.json({ success: true, alreadyDone: true, text, inventory: user.inventory, keyItems: user.keyItems, storyFlags: user.storyFlags });
            }

            const optionsRes = await getStarterOptionsForNpc(npc);
            if (optionsRes && optionsRes.error) {
                return res.json({ success: false, error: optionsRes.error });
            }
            const options = optionsRes;
            if (!options || options.length < 3) {
                return res.json({ success: false, error: 'Não há 3 monstros iniciais configurados (por NPC ou via isStarter=true).' });
            }

            const text = interact.successDialogue || npc.dialogue || 'Escolha o seu monstro inicial.';
            return res.json({
                success: true,
                text,
                action: { type: 'starter', options, flagId: STARTER_FLAG_ID, npcId: String(npc._id) },
                inventory: user.inventory,
                keyItems: user.keyItems,
                storyFlags: user.storyFlags
            });
        }

        // Para quests (serviceType=''), mantém o comportamento antigo (marca flag sempre).
        // Para serviços (heal/shop), só usa flag quando for algo único (givesUnique).
        const shouldUseFlag = serviceType === '' || !!interact.givesUnique;
        const alreadyDone = shouldUseFlag ? !!user.storyFlags[flagId] : false;

        if (alreadyDone && interact.givesUnique) {
            const text = interact.alreadyDoneDialogue || npc.winDialogue || 'Já fiz isso por você.';
            return res.json({ success: true, alreadyDone: true, text, inventory: user.inventory, keyItems: user.keyItems, storyFlags: user.storyFlags });
        }

        const requiresId = normalizeItemId(interact.requiresItemId);
        const requiresQty = Math.max(1, parseInt(interact.requiresItemQty, 10) || 1);
        if (requiresId) {
            const hasQty = getItemCount(user, requiresId);
            if (hasQty < requiresQty) {
                const needText = interact.needItemDialogue || `Você precisa de ${requiresQty}x ${requiresId}.`;
                return res.json({ success: true, needsItem: true, text: needText, inventory: user.inventory, keyItems: user.keyItems, storyFlags: user.storyFlags });
            }
        }

        if (requiresId && interact.consumesRequiredItem) {
            const removed = removeItemFromUser(user, requiresId, requiresQty);
            if (!removed.ok) {
                const needText = interact.needItemDialogue || `Você precisa de ${requiresQty}x ${requiresId}.`;
                return res.json({ success: true, needsItem: true, text: needText, inventory: user.inventory, keyItems: user.keyItems, storyFlags: user.storyFlags });
            }
        }

        const giveId = normalizeItemId(interact.givesItemId);
        const giveQty = Math.max(1, parseInt(interact.givesItemQty, 10) || 1);
        let giveMsg = '';
        if (giveId) {
            const addRes = addItemToUser(user, giveId, giveQty, { keyItem: !!interact.givesKeyItem, unique: !!interact.givesUnique });
            if (addRes.ok) {
                giveMsg = addRes.storage === 'keyItems' ? `Recebeu o item-chave ${giveId}!` : `Recebeu ${giveQty}x ${giveId}!`;
            } else if (addRes.reason === 'already_has_key_item') {
                giveMsg = `Você já tem o item-chave ${giveId}.`;
            }
        }

        if (shouldUseFlag) {
            user.storyFlags[flagId] = true;
        }

        // Move NPC após sucesso (se configurado)
        let npcMoved = false;
        if ((interact.moveDx || 0) !== 0 || (interact.moveDy || 0) !== 0 || (interact.moveDirection && String(interact.moveDirection).trim())) {
            const dx = parseFloat(interact.moveDx) || 0;
            const dy = parseFloat(interact.moveDy) || 0;
            npc.x = Math.max(0, Math.min(100, (npc.x || 0) + dx));
            npc.y = Math.max(0, Math.min(100, (npc.y || 0) + dy));
            if (interact.moveDirection) npc.direction = interact.moveDirection;
            await npc.save();
            npcMoved = true;
            try {
                const mapList = await NPC.find({ map: npc.map }).lean();
                npcCacheByMap[npc.map] = mapList;
                io.to(npc.map).emit('npcs_list', mapList);
            } catch (_) {}
        }

        await user.save();

        // Serviços: heal / shop
        if (serviceType === 'heal') {
            let count = 0;
            for (let p of user.pokemonTeam) {
                const base = await BasePokemon.findOne({ id: p.baseId });
                if (base) {
                    p.stats = calculateStats(base.baseStats, p.level);
                    p.currentHp = p.stats.hp;
                    count++;
                }
            }
            await user.save();
            const text = interact.healDialogue || interact.successDialogue || `Seus monstros foram curados! (${count})`;
            return res.json({
                success: true,
                text,
                action: { type: 'heal', healed: count },
                npcMoved,
                inventory: user.inventory,
                keyItems: user.keyItems,
                storyFlags: user.storyFlags
            });
        }

        if (serviceType === 'shop') {
            const items = Array.isArray(interact.shopItems) ? interact.shopItems : [];
            const cleaned = items
                .map(x => ({
                    itemId: x && x.itemId ? String(x.itemId).trim() : '',
                    price: Math.max(0, parseInt(x && x.price, 10) || 0)
                }))
                .filter(x => x.itemId && x.price > 0);

            const text = interact.successDialogue || npc.dialogue || 'O que você quer comprar?';
            return res.json({
                success: true,
                text,
                action: { type: 'shop', items: cleaned },
                npcMoved,
                inventory: user.inventory,
                keyItems: user.keyItems,
                storyFlags: user.storyFlags
            });
        }

        const successText = interact.successDialogue || giveMsg || npc.dialogue || 'Feito.';
        return res.json({
            success: true,
            text: successText,
            npcMoved,
            inventory: user.inventory,
            keyItems: user.keyItems,
            storyFlags: user.storyFlags
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- STARTER API (opções e escolha) ---
app.get('/api/starter/options', async (req, res) => {
    try {
        const { userId } = req.query;
        const user = userId ? await User.findById(userId) : null;
        if (!user) return res.status(404).json({ error: 'User not found' });
        ensureUserInventories(user);
        const options = await getStarterOptions();
        const chosen = !!user.storyFlags[STARTER_FLAG_ID];
        return res.json({ success: true, chosen, options });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

app.post('/api/starter/choose', async (req, res) => {
    try {
        const { userId, baseId, npcId } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        ensureUserInventories(user);

        if (user.storyFlags[STARTER_FLAG_ID]) {
            return res.status(400).json({ error: 'Você já escolheu o seu monstro inicial.' });
        }

        let allowedIds;
        if (npcId) {
            const npc = await NPC.findById(npcId);
            const svc = npc && npc.interact ? String(npc.interact.serviceType || '').trim() : '';
            if (!npc || svc !== 'starter') {
                return res.status(400).json({ error: 'NPC de starter inválido.' });
            }
            const optionsRes = await getStarterOptionsForNpc(npc);
            if (optionsRes && optionsRes.error) {
                return res.status(400).json({ error: optionsRes.error });
            }
            allowedIds = new Set((optionsRes || []).map(o => o.id));
        } else {
            const options = await getStarterOptions();
            allowedIds = new Set((options || []).map(o => o.id));
        }
        const pick = String(baseId || '').trim();
        if (!allowedIds.has(pick)) {
            return res.status(400).json({ error: 'Escolha inválida.' });
        }

        const starter = await BasePokemon.findOne({ id: pick }).lean();
        if (!starter) return res.status(404).json({ error: 'Monstro não encontrado.' });

        const stats = calculateStats(starter.baseStats, 1);
        let moves = starter.movePool ? starter.movePool.filter(m => m.level <= 1).map(m => m.moveId) : [];
        if (!moves.length) moves = ['tackle'];

        user.pokemonTeam = Array.isArray(user.pokemonTeam) ? user.pokemonTeam : [];
        user.pokemonTeam.push({
            baseId: starter.id,
            nickname: starter.name,
            level: 1,
            currentHp: stats.hp,
            stats,
            moves,
            learnedMoves: moves,
            xp: 0
        });

        user.dex = Array.isArray(user.dex) ? user.dex : [];
        if (!user.dex.includes(starter.id)) user.dex.push(starter.id);

        user.storyFlags[STARTER_FLAG_ID] = true;
        await user.save();

        return res.json({ success: true, picked: { id: starter.id, name: starter.name, sprite: starter.sprite || null }, storyFlags: user.storyFlags });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- API NPC (ENGAGE): pausa patrulha e faz o NPC olhar pro player ---
app.post('/api/npc/engage', async (req, res) => {
    try {
        const { npcId, playerX, playerY, pauseMs } = req.body;
        const npc = await NPC.findById(npcId).lean();
        if (!npc) return res.status(404).json({ error: 'NPC não encontrado' });
        const mapId = npc.map;
        if (!mapId) return res.json({ success: true });

        let list = npcCacheByMap[mapId];
        if (!Array.isArray(list)) {
            list = await NPC.find({ map: mapId }).lean();
            npcCacheByMap[mapId] = list;
        }

        const px = parseFloat(playerX);
        const py = parseFloat(playerY);
        const pauseFor = Math.max(500, parseInt(pauseMs, 10) || 8000);

        const idx = list.findIndex(n => n && String(n._id) === String(npcId));
        if (idx >= 0 && Number.isFinite(px) && Number.isFinite(py)) {
            const n = list[idx];
            const nx = typeof n.x === 'number' ? n.x : parseFloat(n.x) || 0;
            const ny = typeof n.y === 'number' ? n.y : parseFloat(n.y) || 0;
            const dx = px - nx;
            const dy = py - ny;
            const dir = computeDirectionFromDelta(dx, dy);
            list[idx] = { ...n, direction: dir, _faceDirection: dir, _pauseUntil: Date.now() + pauseFor };
            io.to(mapId).emit('npcs_list', list);
        }

        return res.json({ success: true });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- API NPC (DISENGAGE): retoma patrulha após conversa/batalha ---
app.post('/api/npc/disengage', async (req, res) => {
    try {
        const { npcId } = req.body;
        const npc = await NPC.findById(npcId).lean();
        if (!npc) return res.status(404).json({ error: 'NPC não encontrado' });
        const mapId = npc.map;
        if (!mapId) return res.json({ success: true });

        let list = npcCacheByMap[mapId];
        if (!Array.isArray(list)) {
            list = await NPC.find({ map: mapId }).lean();
            npcCacheByMap[mapId] = list;
        }

        const idx = list.findIndex(n => n && String(n._id) === String(npcId));
        if (idx >= 0) {
            const n = list[idx];
            // Zera o estado efêmero de pausa/face (não persiste no DB)
            const cleared = { ...n, _pauseUntil: 0 };
            delete cleared._faceDirection;
            list[idx] = cleared;
            io.to(mapId).emit('npcs_list', list);
        }

        return res.json({ success: true });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- API NPC SHOP (BUY) ---
app.post('/api/npc/shop/buy', async (req, res) => {
    try {
        const { userId, npcId, itemId, qty } = req.body;
        const q = Math.max(1, parseInt(qty, 10) || 1);
        const user = await User.findById(userId);
        const npc = await NPC.findById(npcId);
        if (!user || !npc) return res.status(404).json({ error: 'NPC ou usuário não encontrado' });

        ensureUserInventories(user);

        const interact = npc.interact || {};
        if (!interact.enabled || String(interact.serviceType || '').trim() !== 'shop') {
            return res.status(400).json({ error: 'Este NPC não é uma loja.' });
        }

        const targetId = normalizeItemId(itemId);
        if (!targetId) return res.status(400).json({ error: 'Item inválido.' });

        const shopItems = Array.isArray(interact.shopItems) ? interact.shopItems : [];
        const entry = shopItems.find(x => x && String(x.itemId).trim() === targetId);
        const price = Math.max(0, parseInt(entry && entry.price, 10) || 0);
        if (!entry || !price) return res.status(400).json({ error: 'Item não vendido por este NPC.' });

        const cost = price * q;
        if ((user.money || 0) < cost) return res.status(400).json({ error: 'Saldo insuficiente.' });
        user.money = (user.money || 0) - cost;

        // Compatibilidade: itens clássicos continuam atualizando campos próprios.
        if (targetId === 'pokeball') {
            user.pokeballs = (user.pokeballs || 0) + q;
        } else if (targetId === 'rareCandy') {
            user.rareCandy = (user.rareCandy || 0) + q;
        } else {
            const addRes = addItemToUser(user, targetId, q, { keyItem: false, unique: false });
            if (!addRes.ok) return res.status(400).json({ error: 'Não foi possível adicionar o item.' });
        }

        await user.save();
        return res.json({
            success: true,
            money: user.money,
            pokeballs: user.pokeballs,
            rareCandy: user.rareCandy,
            inventory: user.inventory,
            keyItems: user.keyItems,
            storyFlags: user.storyFlags
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- CRIAÇÃO DE NPC ---
app.get('/lab', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user || !user.isAdmin) return res.redirect('/'); const pokemons = await BasePokemon.find(); const npcs = await NPC.find(); res.render('create', { types: EntityType, moves: MOVES_LIBRARY, pokemons, npcs, user }); });
const npcUpload = upload.fields([{ name: 'npcSkinFile', maxCount: 1 }, { name: 'battleBgFile', maxCount: 1 }]);
app.post('/lab/create-npc', npcUpload, async (req, res) => { 
    try { 
        const {
            npcId,
            name,
            map,
            x,
            y,
            direction,
            skinSelect,
            dialogue,
            winDialogue,
            cooldownDialogue,
            money,
            teamJson,
            rewardType,
            rewardVal,
            rewardQty,
            cooldownMinutes,
            rewardKeyItem,
            rewardUnique,
            blocksMovement,

            patrolEnabled,
            patrolMode,
            patrolSpeed,
            patrolPingAx,
            patrolPingAy,
            patrolPingBx,
            patrolPingBy,
            patrolCircleCx,
            patrolCircleCy,
            patrolCircleRadius,
            patrolCircleClockwise,

            patrolPathJson,

            interactEnabled,
            interactRequiresItemId,
            interactRequiresItemQty,
            interactConsumesRequiredItem,
            interactGivesItemId,
            interactGivesItemQty,
            interactGivesKeyItem,
            interactGivesUnique,
            interactFlagId,
            interactSuccessDialogue,
            interactNeedItemDialogue,
            interactAlreadyDoneDialogue,
            interactMoveDx,
            interactMoveDy,
            interactMoveDirection,

            interactServiceType,
            interactHealDialogue,
            interactShopItemsJson,

            userId,
            battleBg
        } = req.body; 
        let finalSkin = skinSelect, isCustom = false; 
        if (req.files['npcSkinFile']) { finalSkin = `data:${req.files['npcSkinFile'][0].mimetype};base64,${req.files['npcSkinFile'][0].buffer.toString('base64')}`; isCustom = true; } 
        else if (npcId && !skinSelect) { const old = await NPC.findById(npcId); if(old) { finalSkin = old.skin; isCustom = old.isCustomSkin; } } 
        let finalBattleBg = 'battle_bg.png';
        if (req.files['battleBgFile']) { finalBattleBg = `data:${req.files['battleBgFile'][0].mimetype};base64,${req.files['battleBgFile'][0].buffer.toString('base64')}`; }
        else if (npcId) { const old = await NPC.findById(npcId); if(old && old.battleBackground) finalBattleBg = old.battleBackground; }
        let team = []; try { team = JSON.parse(teamJson); } catch (e) {} 
        const reward = {
            type: rewardType || 'none',
            value: rewardVal || '',
            qty: parseInt(rewardQty) || 1,
            level: (rewardType === 'pokemon') ? (parseInt(rewardQty) || 1) : 1,
            keyItem: rewardKeyItem === 'on' || rewardKeyItem === true || rewardKeyItem === 'true',
            unique: rewardUnique === 'on' || rewardUnique === true || rewardUnique === 'true'
        }; 

        const interact = {
            enabled: interactEnabled === 'on' || interactEnabled === true || interactEnabled === 'true',

            serviceType: (interactServiceType || '').trim(),
            healDialogue: interactHealDialogue || '',
            shopItems: (() => {
                if (!interactShopItemsJson) return [];
                try {
                    const arr = JSON.parse(interactShopItemsJson);
                    if (!Array.isArray(arr)) return [];
                    return arr
                        .map(x => ({
                            itemId: (x && x.itemId) ? String(x.itemId).trim() : '',
                            price: Math.max(0, parseInt(x && x.price, 10) || 0)
                        }))
                        .filter(x => x.itemId && x.price > 0);
                } catch (_) {
                    return [];
                }
            })(),

            requiresItemId: interactRequiresItemId || '',
            requiresItemQty: parseInt(interactRequiresItemQty) || 1,
            consumesRequiredItem: interactConsumesRequiredItem === 'on' || interactConsumesRequiredItem === true || interactConsumesRequiredItem === 'true',
            givesItemId: interactGivesItemId || '',
            givesItemQty: parseInt(interactGivesItemQty) || 1,
            givesKeyItem: interactGivesKeyItem === 'on' || interactGivesKeyItem === true || interactGivesKeyItem === 'true',
            givesUnique: interactGivesUnique === 'on' || interactGivesUnique === true || interactGivesUnique === 'true',
            flagId: interactFlagId || '',
            successDialogue: interactSuccessDialogue || '',
            needItemDialogue: interactNeedItemDialogue || '',
            alreadyDoneDialogue: interactAlreadyDoneDialogue || '',
            moveDx: parseFloat(interactMoveDx) || 0,
            moveDy: parseFloat(interactMoveDy) || 0,
            moveDirection: interactMoveDirection || ''
        };

        const prevNpc = npcId ? await NPC.findById(npcId).lean() : null;
        const patrolIsEnabled = patrolEnabled === 'on' || patrolEnabled === true || patrolEnabled === 'true';

        const parsedPath = (() => {
            if (!patrolPathJson) {
                const prev = (prevNpc && prevNpc.patrol && prevNpc.patrol.path) ? prevNpc.patrol.path : null;
                if (prev && Array.isArray(prev.points)) {
                    return {
                        loop: !!prev.loop,
                        points: prev.points
                            .map(p => ({
                                x: Math.max(0, Math.min(100, parseFloat(p && p.x))),
                                y: Math.max(0, Math.min(100, parseFloat(p && p.y)))
                            }))
                            .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
                    };
                }
                return { loop: false, points: [] };
            }
            try {
                const raw = JSON.parse(patrolPathJson);
                const obj = Array.isArray(raw) ? { loop: false, points: raw } : raw;
                const loop = !!(obj && obj.loop);
                const pts = Array.isArray(obj && obj.points) ? obj.points : [];
                const points = pts
                    .map(p => ({
                        x: Math.max(0, Math.min(100, parseFloat(p && p.x))),
                        y: Math.max(0, Math.min(100, parseFloat(p && p.y)))
                    }))
                    .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
                return { loop, points };
            } catch (_) {
                return { loop: false, points: [] };
            }
        })();

        const patrol = {
            enabled: patrolIsEnabled,
            mode: (patrolMode || '').trim(),
            speed: Math.max(0.1, parseFloat(patrolSpeed) || 6),
            pingPong: {
                ax: parseFloat(patrolPingAx) || 0,
                ay: parseFloat(patrolPingAy) || 0,
                bx: parseFloat(patrolPingBx) || 0,
                by: parseFloat(patrolPingBy) || 0
            },
            circle: {
                cx: parseFloat(patrolCircleCx) || 0,
                cy: parseFloat(patrolCircleCy) || 0,
                radius: Math.max(0, parseFloat(patrolCircleRadius) || 0),
                clockwise: patrolCircleClockwise === 'on' || patrolCircleClockwise === true || patrolCircleClockwise === 'true'
            },
            path: {
                loop: parsedPath.loop,
                points: parsedPath.points
            },
            phaseOffsetMs: (prevNpc && prevNpc.patrol && Number.isFinite(prevNpc.patrol.phaseOffsetMs))
                ? prevNpc.patrol.phaseOffsetMs
                : Math.floor(Math.random() * 10000)
        };

        const npcData = {
            name,
            map,
            x: parseInt(x)||50,
            y: parseInt(y)||50,
            direction: direction||'down',
            skin: finalSkin,
            isCustomSkin: isCustom,
            dialogue,
            winDialogue,
            cooldownDialogue,
            moneyReward: parseInt(money)||0,
            cooldownMinutes: parseInt(cooldownMinutes) || 0,
            team,
            reward,
            blocksMovement: blocksMovement === 'on' || blocksMovement === true || blocksMovement === 'true',
            interact,
            patrol,
            battleBackground: finalBattleBg
        }; 
        if (npcId) { if (!req.files['npcSkinFile'] && skinSelect && !skinSelect.startsWith('data:')) { npcData.skin = skinSelect; npcData.isCustomSkin = false; } await NPC.findByIdAndUpdate(npcId, npcData); } else { await new NPC(npcData).save(); } 
        res.redirect('/lab?userId=' + userId); 
    } catch (e) { console.error(e); res.send("Erro: " + e.message); } 
});

// --- CACHE & PATROL DE NPCs (MOVIMENTO AUTOMÁTICO) ---
// Mantém a última lista de NPCs por mapa para evitar query no DB a cada tick.

function computeDirectionFromDelta(dx, dy) {
    if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'down' : 'up';
}

function computeNpcPatrolPosition(npc, nowMs) {
    if (npc && npc._pauseUntil && nowMs < npc._pauseUntil) {
        return {
            x: (typeof npc.x === 'number') ? npc.x : parseFloat(npc.x) || 0,
            y: (typeof npc.y === 'number') ? npc.y : parseFloat(npc.y) || 0,
            direction: npc._faceDirection || npc.direction || 'down'
        };
    }
    const p = npc && npc.patrol;
    if (!p || !p.enabled) return null;
    const mode = (p.mode || '').trim();
    const speed = Math.max(0.1, parseFloat(p.speed) || 6); // %/s
    const phase = parseInt(p.phaseOffsetMs, 10) || 0;
    const tNow = nowMs + phase;

    if (mode === 'pingpong') {
        const ax = (p.pingPong && Number.isFinite(p.pingPong.ax)) ? p.pingPong.ax : 0;
        const ay = (p.pingPong && Number.isFinite(p.pingPong.ay)) ? p.pingPong.ay : 0;
        const bx = (p.pingPong && Number.isFinite(p.pingPong.bx)) ? p.pingPong.bx : 0;
        const by = (p.pingPong && Number.isFinite(p.pingPong.by)) ? p.pingPong.by : 0;
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.hypot(dx, dy);
        if (!Number.isFinite(dist) || dist < 0.01) return null;

        const travelMs = (dist / speed) * 1000;
        const period = Math.max(1, travelMs * 2);
        const phaseIn = (tNow % period) / travelMs; // 0..2
        const goingToB = phaseIn <= 1;
        const u = goingToB ? phaseIn : (2 - phaseIn); // 0..1
        const x = ax + dx * u;
        const y = ay + dy * u;
        const dir = goingToB ? computeDirectionFromDelta(dx, dy) : computeDirectionFromDelta(-dx, -dy);
        return { x, y, direction: dir };
    }

    if (mode === 'circle') {
        const cx = (p.circle && Number.isFinite(p.circle.cx)) ? p.circle.cx : 0;
        const cy = (p.circle && Number.isFinite(p.circle.cy)) ? p.circle.cy : 0;
        const r = (p.circle && Number.isFinite(p.circle.radius)) ? Math.max(0, p.circle.radius) : 0;
        if (r <= 0.01) return null;

        const circumference = 2 * Math.PI * r;
        const period = Math.max(1, (circumference / speed) * 1000);
        const frac = (tNow % period) / period; // 0..1
        const clockwise = !!(p.circle && p.circle.clockwise);
        const ang = (clockwise ? 1 : -1) * (frac * 2 * Math.PI);

        const x = cx + r * Math.cos(ang);
        const y = cy + r * Math.sin(ang);

        // Tangente para direção
        const tx = clockwise ? (-Math.sin(ang)) : (Math.sin(ang));
        const ty = clockwise ? (Math.cos(ang)) : (-Math.cos(ang));
        const dir = computeDirectionFromDelta(tx, ty);
        return { x, y, direction: dir };
    }

    if (mode === 'path') {
        const ptsRaw = (p.path && Array.isArray(p.path.points)) ? p.path.points : [];
        const pts = ptsRaw
            .map(q => ({
                x: Number.isFinite(q && q.x) ? q.x : parseFloat(q && q.x) || 0,
                y: Number.isFinite(q && q.y) ? q.y : parseFloat(q && q.y) || 0
            }))
            .filter(q => Number.isFinite(q.x) && Number.isFinite(q.y));

        if (pts.length < 2) return null;

        const segs = [];
        let total = 0;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i];
            const b = pts[i + 1];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len > 0.0001) {
                segs.push({ a, b, dx, dy, len });
                total += len;
            }
        }
        // Fecha o loop (último -> primeiro)
        const loop = !!(p.path && p.path.loop);
        if (loop) {
            const a = pts[pts.length - 1];
            const b = pts[0];
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const len = Math.hypot(dx, dy);
            if (len > 0.0001) {
                segs.push({ a, b, dx, dy, len });
                total += len;
            }
        }

        if (!Number.isFinite(total) || total < 0.0001 || segs.length === 0) return null;

        const distPerMs = speed / 1000;
        const traveled = (tNow * distPerMs);

        // loop=true => percurso circular
        // loop=false => vai-e-volta pela rota (pingpong)
        const period = loop ? total : (total * 2);
        const posInPeriod = ((traveled % period) + period) % period;
        const goingForward = loop ? true : (posInPeriod <= total);
        const distAlong = loop ? posInPeriod : (goingForward ? posInPeriod : (period - posInPeriod));

        let acc = 0;
        for (const s of segs) {
            if (acc + s.len >= distAlong) {
                const u = (distAlong - acc) / s.len;
                const x = s.a.x + s.dx * u;
                const y = s.a.y + s.dy * u;
                const dir = goingForward
                    ? computeDirectionFromDelta(s.dx, s.dy)
                    : computeDirectionFromDelta(-s.dx, -s.dy);
                return { x, y, direction: dir };
            }
            acc += s.len;
        }

        // fallback: fim do trajeto
        const last = segs[segs.length - 1];
        const dir = goingForward
            ? computeDirectionFromDelta(last.dx, last.dy)
            : computeDirectionFromDelta(-last.dx, -last.dy);
        return { x: last.b.x, y: last.b.y, direction: dir };
    }

    return null;
}

const NPC_PATROL_TICK_MS = 350;
setInterval(async () => {
    try {
        const now = Date.now();
        const activeMaps = Array.from(new Set(Object.values(players || {}).map(p => p && p.map).filter(Boolean)));
        if (activeMaps.length === 0) return;

        for (const mapId of activeMaps) {
            let list = npcCacheByMap[mapId];
            if (!Array.isArray(list)) {
                try {
                    list = await NPC.find({ map: mapId }).lean();
                    npcCacheByMap[mapId] = list;
                } catch (_) {
                    continue;
                }
            }

            let hasPatrol = false;
            const updated = list.map(n => {
                const pos = computeNpcPatrolPosition(n, now);
                if (!pos) return n;
                hasPatrol = true;
                return { ...n, x: pos.x, y: pos.y, direction: pos.direction };
            });

            if (hasPatrol) {
                io.to(mapId).emit('npcs_list', updated);
            }
        }
    } catch (e) {
        console.error('NPC patrol tick error', e);
    }
}, NPC_PATROL_TICK_MS);
app.post('/lab/create', upload.single('sprite'), async (req, res) => { const { name, type, hp, energy, atk, def, spd, location, minLvl, maxLvl, catchRate, spawnChance, isStarter, movesJson, evoTarget, evoLevel, existingId } = req.body; const stats = { hp: parseInt(hp), energy: parseInt(energy), attack: parseInt(atk), defense: parseInt(def), speed: parseInt(spd) }; let movePool = []; try { movePool = JSON.parse(movesJson); } catch(e){} const data = { name, type, baseStats: stats, spawnLocation: location, minSpawnLevel: parseInt(minLvl), maxSpawnLevel: parseInt(maxLvl), catchRate: parseFloat(catchRate), spawnChance: parseFloat(spawnChance) || 10, isStarter: isStarter === 'on', evolution: { targetId: evoTarget, level: parseInt(evoLevel) || 100 }, movePool: movePool }; if(req.file) data.sprite = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; if(existingId) await BasePokemon.findOneAndUpdate({ id: existingId }, data); else { data.id = Date.now().toString(); await new BasePokemon(data).save(); } res.redirect(req.header('Referer') || '/'); });
app.post('/lab/delete', async (req, res) => { try { const { id } = req.body; if (id) await BasePokemon.deleteOne({ id }); res.redirect(req.get('referer')); } catch (e) { res.send('Erro ao excluir: ' + e.message); } });
app.post('/lab/delete-npc', async (req, res) => { try { const { id } = req.body; if(id) await NPC.findByIdAndDelete(id); res.redirect(req.get('referer')); } catch(e) { res.send("Erro"); } });
app.get('/api/pc', async (req, res) => {
    const { userId } = req.query;
    const user = await User.findById(userId);
    if (!user) return res.json({ error: 'User not found' });

    const formatList = async (list) => {
        const output = [];
        const safeList = Array.isArray(list) ? list : [];
        for (let p of safeList) {
            if (!p || !p.baseId) continue;
            const base = await BasePokemon.findOne({ id: p.baseId });
            if (!base) continue;
            const ent = userPokemonToEntity(p, base);
            if (ent) output.push(ent);
        }
        return output;
    };

    const pcList = Array.isArray(user.pc) ? user.pc : [];
    const team = await formatList(user.pokemonTeam);
    const pc = await formatList(pcList);
    res.json({ team, pc });
});
app.post('/api/pc/move', async (req, res) => {
    const { userId, pokemonId, from, to } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.json({ error: 'Usuário não encontrado.' });
    if (!user.pc) user.pc = [];
    if (!user.pokemonTeam) user.pokemonTeam = [];

    const sourceList = from === 'team' ? user.pokemonTeam : user.pc;
    const destList = to === 'team' ? user.pokemonTeam : user.pc;
    if (from === to) return res.json({ success: true });
    if (to === 'team' && destList.length >= 6) return res.json({ error: 'Sua equipe já tem 6 Monstros!' });
    if (from === 'team' && sourceList.length <= 1) return res.json({ error: 'Você não pode ficar sem Monstros na equipe!' });

    const index = sourceList.findIndex(p => {
        if (!p) return false;
        const pid = (p._id && typeof p._id.toString === 'function') ? p._id.toString() : (p.instanceId ? String(p.instanceId) : '');
        return pid === pokemonId;
    });
    if (index === -1) return res.json({ error: 'Monstro não encontrado.' });
    const [poke] = sourceList.splice(index, 1);
    destList.push(poke);
    await user.save();
    res.json({ success: true });
});
app.get('/api/me', async (req, res) => {
    const { userId } = req.query;
    if(!userId) return res.status(400).json({ error: 'No ID' });
    const user = await User.findById(userId);
    if(!user) return res.status(404).json({ error: 'User not found' });
    ensureUserInventories(user);

    const teamWithSprites = [];
    for(let p of (user.pokemonTeam || [])) {
        const base = await BasePokemon.findOne({ id: p.baseId });
        const nextXp = getXpForNextLevel(p.level);
        const allLearned = p.learnedMoves && p.learnedMoves.length > 0 ? p.learnedMoves : p.moves;
        teamWithSprites.push({
            instanceId: p._id,
            name: p.nickname,
            level: p.level,
            hp: p.currentHp,
            maxHp: p.stats.hp,
            xp: p.xp,
            xpToNext: nextXp,
            sprite: base ? base.sprite : '',
            moves: p.moves,
            learnedMoves: allLearned
        });
    }

    res.json({
        team: teamWithSprites,
        allMoves: MOVES_LIBRARY,
        money: user.money || 0,
        pokeballs: user.pokeballs || 0,
        rareCandy: user.rareCandy || 0,
        inventory: user.inventory,
        keyItems: user.keyItems,
        storyFlags: user.storyFlags
    });
});

// Catálogo central de itens (no DB)
app.get('/api/items/catalog', async (req, res) => {
    try {
        // garante cache pelo menos uma vez
        if (!ITEM_CATALOG_CACHE || !Array.isArray(ITEM_CATALOG_CACHE)) await refreshItemCatalogCache();
        res.json({ success: true, items: ITEM_CATALOG_CACHE });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Falha ao carregar catálogo.' });
    }
});

// Servir ícone PNG do catálogo (32x32) direto do DB
app.get('/api/items/icon/:itemId.png', async (req, res) => {
    try {
        const itemId = String(req.params.itemId || '').trim();
        if (!itemId) return res.status(400).end();
        const it = await ItemDefinition.findOne({ id: itemId }).lean();
        if (!it || !it.iconPngBase64) return res.status(404).end();
        const buf = Buffer.from(String(it.iconPngBase64), 'base64');
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.end(buf);
    } catch (e) {
        return res.status(500).end();
    }
});

// Admin: criar/atualizar item no catálogo
app.post('/api/items/upsert', async (req, res) => {
    try {
        const { userId, item } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatório' });
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissão' });

        const rawId = item && (item.id || item.itemId);
        const id = String(rawId || '').trim();
        if (!id) return res.status(400).json({ success: false, error: 'id obrigatório' });

        const name = String((item && item.name) || id).trim();
        const type = (String((item && item.type) || 'consumable').trim() === 'key') ? 'key' : 'consumable';

        const existing = await ItemDefinition.findOne({ id });
        if (!existing) {
            await ItemDefinition.create({ id, name, type, iconPngBase64: '', updatedAt: Date.now() });
        } else {
            existing.name = name;
            existing.type = type;
            existing.updatedAt = Date.now();
            await existing.save();
        }

        await refreshItemCatalogCache();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao salvar item.' });
    }
});

// Admin: remover item do catálogo
app.post('/api/items/delete', async (req, res) => {
    try {
        const { userId, itemId } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatório' });
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissão' });
        const id = String(itemId || '').trim();
        if (!id) return res.status(400).json({ success: false, error: 'itemId obrigatório' });

        await ItemDefinition.deleteOne({ id });
        await refreshItemCatalogCache();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao remover item.' });
    }
});

// Admin: setar ícone PNG 32x32 (base64) no catálogo
app.post('/api/items/icon/set', async (req, res) => {
    try {
        const { userId, itemId, pngBase64 } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatório' });
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissão' });

        const id = String(itemId || '').trim();
        if (!id) return res.status(400).json({ success: false, error: 'itemId obrigatório' });
        const b64 = String(pngBase64 || '').trim();
        if (!b64) return res.status(400).json({ success: false, error: 'pngBase64 obrigatório' });

        const buf = Buffer.from(b64, 'base64');
        const dim = parsePngDimensions(buf);
        if (!dim) return res.status(400).json({ success: false, error: 'Arquivo não é PNG válido.' });
        if (dim.width !== 32 || dim.height !== 32) {
            return res.status(400).json({ success: false, error: `Ícone precisa ser 32x32. Recebido: ${dim.width}x${dim.height}` });
        }

        const it = await ItemDefinition.findOne({ id });
        if (!it) return res.status(404).json({ success: false, error: 'Item não existe no catálogo.' });
        it.iconPngBase64 = b64;
        it.updatedAt = Date.now();
        await it.save();

        await refreshItemCatalogCache();
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao salvar ícone.' });
    }
});

// Dev/Admin: dar item para jogador (usa catálogo pra key/consumable)
app.post('/api/dev/inventory/grant', async (req, res) => {
    try {
        const { userId, targetUserId, itemId, qty } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatório' });
        const admin = await User.findById(userId);
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissão' });

        const tgtId = String(targetUserId || userId).trim();
        const user = await User.findById(tgtId);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário alvo não encontrado' });
        ensureUserInventories(user);

        const id = String(itemId || '').trim();
        const amount = Math.max(1, parseInt(qty, 10) || 1);
        if (!id) return res.status(400).json({ success: false, error: 'itemId obrigatório' });

        const def = getItemDefFromCache(id);
        const isKey = def && def.type === 'key';
        const result = addItemToUser(user, id, amount, { keyItem: !!isKey, unique: !!isKey });
        if (!result.ok) return res.status(400).json({ success: false, error: result.reason || 'Falha ao adicionar item' });

        await user.save();
        res.json({ success: true, inventory: user.inventory, keyItems: user.keyItems });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao dar item.' });
    }
});

// Dev/Admin: remover item do jogador
app.post('/api/dev/inventory/revoke', async (req, res) => {
    try {
        const { userId, targetUserId, itemId, qty } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatório' });
        const admin = await User.findById(userId);
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissão' });

        const tgtId = String(targetUserId || userId).trim();
        const user = await User.findById(tgtId);
        if (!user) return res.status(404).json({ success: false, error: 'Usuário alvo não encontrado' });
        ensureUserInventories(user);

        const id = String(itemId || '').trim();
        const amount = Math.max(1, parseInt(qty, 10) || 1);
        if (!id) return res.status(400).json({ success: false, error: 'itemId obrigatório' });

        const result = removeItemFromUser(user, id, amount);
        if (!result.ok) return res.status(400).json({ success: false, error: result.reason || 'Falha ao remover item' });
        await user.save();
        res.json({ success: true, inventory: user.inventory, keyItems: user.keyItems });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao remover item.' });
    }
});
app.post('/api/heal', async (req, res) => { const { userId } = req.body; const user = await User.findById(userId); if (!user) return res.status(404).json({ error: 'Usuário não encontrado' }); let count = 0; for (let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); if (base) { p.stats = calculateStats(base.baseStats, p.level); p.currentHp = p.stats.hp; count++; } } await user.save(); res.json({ success: true, message: `${count} Monstros curados!` }); });
app.post('/api/equip-move', async (req, res) => { const { userId, pokemonId, moves } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const poke = user.pokemonTeam.id(pokemonId); if(!poke) return res.json({error: "Pokemon not found"}); if(moves.length < 1 || moves.length > 4) return res.json({error: "Deve ter entre 1 e 4 ataques."}); poke.moves = moves; await user.save(); res.json({success: true}); });
app.post('/api/set-lead', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if (index > 0) { const poke = user.pokemonTeam.splice(index, 1)[0]; user.pokemonTeam.unshift(poke); await user.save(); res.json({success: true}); } else { res.json({success: true}); } });
app.post('/api/abandon-pokemon', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if(user.pokemonTeam.length <= 1) return res.json({ error: 'Não pode abandonar o último monstro.' }); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if(index === -1) return res.json({ error: 'Pokemon not found' }); user.pokemonTeam.splice(index, 1); await user.save(); res.json({ success: true }); });
app.post('/api/buy-item', async (req, res) => { const { userId, itemId, qty } = req.body; const q = Math.max(1, parseInt(qty) || 1); const prices = { pokeball: 50, rareCandy: 2000 }; if(!prices[itemId]) return res.json({ error: 'Item inválido' }); const cost = prices[itemId] * q; const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if((user.money || 0) < cost) return res.json({ error: 'Saldo insuficiente' }); user.money = (user.money || 0) - cost; if(itemId === 'pokeball') user.pokeballs = (user.pokeballs || 0) + q; if(itemId === 'rareCandy') user.rareCandy = (user.rareCandy || 0) + q; await user.save(); res.json({ success: true, money: user.money, pokeballs: user.pokeballs, rareCandy: user.rareCandy }); });
app.post('/api/use-item', async (req, res) => { const { userId, itemId, pokemonId, qty } = req.body; const q = Math.max(1, parseInt(qty) || 1); const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if(itemId === 'rareCandy') { if(!pokemonId) return res.json({ error: 'pokemonId required' }); let poke = null; try { poke = user.pokemonTeam.id(pokemonId); } catch(e) { poke = user.pokemonTeam.find(p => p._id.toString() === (pokemonId || '')); } if(!poke) return res.json({ error: 'Pokemon not found' }); if((user.rareCandy || 0) < q) return res.json({ error: 'Not enough RareCandy' }); const oldLevel = poke.level || 1; poke.level = Math.min(100, oldLevel + q); user.rareCandy = (user.rareCandy || 0) - q; let base = await BasePokemon.findOne({ id: poke.baseId }); let evolved = false; if (base) { if (base.movePool) { const newMove = base.movePool.find(m => m.level === poke.level); if (newMove) { if (!poke.learnedMoves) poke.learnedMoves = [...poke.moves]; if (!poke.learnedMoves.includes(newMove.moveId)) { poke.learnedMoves.push(newMove.moveId); if(poke.moves.length < 4) poke.moves.push(newMove.moveId); } } } if (base.evolution && poke.level >= base.evolution.level) { const nextPoke = await BasePokemon.findOne({ id: base.evolution.targetId }); if (nextPoke) { poke.baseId = nextPoke.id; poke.nickname = nextPoke.name; base = nextPoke; evolved = true; if (!user.dex) user.dex = []; if (!user.dex.includes(nextPoke.id)) { user.dex.push(nextPoke.id); } } } poke.stats = calculateStats(base.baseStats, poke.level); poke.currentHp = poke.stats.hp; } await user.save(); return res.json({ success: true, rareCandy: user.rareCandy, evolved: evolved, pokemon: { instanceId: poke._id, level: poke.level, hp: poke.currentHp, name: poke.nickname } }); } return res.json({ error: 'Item cannot be used here' }); });

// Consumir item do inventário genérico / itens-chave
app.post('/api/inventory/consume', async (req, res) => {
    try {
        const { userId, itemId, qty } = req.body;
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'User not found' });
        ensureUserInventories(user);

        const q = Math.max(1, parseInt(qty, 10) || 1);
        const removed = removeItemFromUser(user, itemId, q);
        if (!removed.ok) return res.json({ error: 'Not enough items' });

        await user.save();
        return res.json({ success: true, inventory: user.inventory, keyItems: user.keyItems, storyFlags: user.storyFlags });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- BATTLE ROUTES ---
app.post('/battle/wild', async (req, res) => { 
    const { userId, currentMap, currentX, currentY } = req.body; 
    const user = await User.findById(userId); 
    if (!user) return res.json({ error: 'User not found' });
    if (!user.pokemonTeam || user.pokemonTeam.length === 0) return res.json({ error: 'Você precisa pegar seu monstro inicial com o Professor.', needStarter: true });
    const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0]; 
    if(!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Todos os seus Monstros estão desmaiados!" }); 
    
    // CORREÇÃO MAPA
    let mapName = 'city'; 
    if (currentMap) {
        if (currentMap.includes('map=')) { const match = currentMap.match(/map=([^&]+)/); if (match && match[1]) mapName = match[1]; } 
        else if (currentMap !== 'city' && !currentMap.includes('?')) mapName = currentMap;
    }
    
    // BG
    const mapDoc = await GameMap.findOne({ mapId: mapName }).lean();
    let battleBgToUse = 'forest_bg.png';
    if (mapDoc && mapDoc.battleBackground) battleBgToUse = mapDoc.battleBackground;

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
    
    // CORREÇÃO RETURN URL
    let returnMapUrl = currentMap;
    // Se não tiver parametros e for custom map, adiciona map=
    if (mapName !== 'city' && mapName !== 'forest' && !currentMap.includes('map=')) {
        returnMapUrl = `city?map=${mapName}`;
    }

    activeBattles[battleId] = { 
        p1: userEntity, p2: wildEntity, type: 'wild', userId: user._id, turn: 1, returnMap: returnMapUrl, returnX: currentX || 50, returnY: currentY || 50, customBackground: battleBgToUse 
    }; 
    res.json({ battleId }); 
});

app.post('/battle/npc', async (req, res) => {
    const { userId, npcId, currentMap, currentX, currentY } = req.body; 
    const user = await User.findById(userId); 
    const npc = await NPC.findById(npcId);
    if (!user || !npc) return res.json({ error: "NPC não encontrado." });

    // Enforce: treinador uma vez (cooldownMinutes<=0) ou repetível com cooldown.
    try {
        const record = Array.isArray(user.defeatedNPCs)
            ? user.defeatedNPCs.find(r => r && String(r.npcId) === String(npc._id))
            : null;
        if (record) {
            const defeatedAt = record.defeatedAt || 0;
            const cooldownMins = npc.cooldownMinutes || 0;
            if (cooldownMins <= 0) {
                return res.json({ error: npc.winDialogue || 'Você já me venceu! Bom trabalho.', alreadyDefeated: true });
            }
            const diffMinutes = (Date.now() - defeatedAt) / 60000;
            if (diffMinutes < cooldownMins) {
                const remaining = Math.ceil(cooldownMins - diffMinutes);
                return res.json({
                    error: (npc.cooldownDialogue || 'Estou descansando...') + ` (${remaining}m)`,
                    cooldownRemainingMinutes: remaining
                });
            }
        }
    } catch (_) {}

    if (!user.pokemonTeam || user.pokemonTeam.length === 0) return res.json({ error: 'Você precisa pegar seu monstro inicial com o Professor.', needStarter: true });
    const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0];
    if (!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Seus Monstros estão desmaiados!" });
    
    const userBase = await BasePokemon.findOne({ id: userPokeData.baseId });
    const p1Entity = userPokemonToEntity(userPokeData, userBase); 
    p1Entity.playerName = user.username; 
    p1Entity.skin = user.skin;

    let mapName = 'city';
    if (currentMap && currentMap.includes('map=')) { const match = currentMap.match(/map=([^&]+)/); if (match) mapName = match[1]; }
    const mapDoc = await GameMap.findOne({ mapId: mapName }).lean();
    let finalBg = 'battle_bg.png';
    if (mapDoc && mapDoc.battleBackground) finalBg = mapDoc.battleBackground;
    if (npc.battleBackground && npc.battleBackground !== 'battle_bg.png') finalBg = npc.battleBackground;

    const npcTeamInstances = [];
    if (!npc.team || npc.team.length === 0) return res.json({ error: "Este NPC não tem Monstros!" });

    for (let member of npc.team) {
        const base = await BasePokemon.findOne({ id: member.baseId });
        if (base) {
            const stats = calculateStats(base.baseStats, member.level);
            let moves = base.movePool ? base.movePool.filter(m => m.level <= member.level).map(m => m.moveId) : ['tackle'];
            if(moves.length > 4) moves = moves.sort(() => 0.5 - Math.random()).slice(0, 4);
            npcTeamInstances.push({
                instanceId: 'npc_mon_' + Date.now() + Math.random(), baseId: base.id, name: base.name, type: base.type, level: member.level, 
                maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy, stats: stats, 
                moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id), 
                sprite: base.sprite, playerName: npc.name, skin: npc.skin, isCustomSkin: npc.isCustomSkin, isWild: false, status: null
            });
        }
    }

    const battleId = `npc_${Date.now()}`; 
    
    // CORREÇÃO RETURN URL
    let returnMapUrl = currentMap;
    if (mapName !== 'city' && mapName !== 'forest' && !currentMap.includes('map=')) { returnMapUrl = `city?map=${mapName}`; }

    activeBattles[battleId] = { 
        p1: p1Entity, p2: npcTeamInstances[0], npcReserve: npcTeamInstances, type: 'local', userId: user._id, turn: 1, npcId: npc._id,
        returnMap: returnMapUrl, returnX: currentX || 50, returnY: currentY || 50, customBackground: finalBg
    }; 
    res.json({ battleId });
});

app.post('/battle/online', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const { roomId, meData, opponentData } = req.body; if (!onlineBattles[roomId]) return res.redirect('/'); const me = JSON.parse(meData); const op = JSON.parse(opponentData); res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, realUserId: me.userId, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, bgImage: 'battle_bg.png', battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable: [], returnUrl: '/lobby' }); });
app.post('/battle', async (req, res) => { const { fighterId, playerName, playerSkin, userId } = req.body; const user = await User.findById(userId); if(!user) return res.redirect('/'); const userPokeData = user.pokemonTeam.id(fighterId); if(!userPokeData || userPokeData.currentHp <= 0) return res.redirect('/lobby?userId=' + userId); const b1Base = await BasePokemon.findOne({ id: userPokeData.baseId }); const p1 = userPokemonToEntity(userPokeData, b1Base); p1.playerName = playerName; p1.skin = playerSkin; const allBases = await BasePokemon.find(); if(allBases.length === 0) return res.redirect('/lobby?userId=' + userId); const randomBase = allBases[Math.floor(Math.random() * allBases.length)]; const cpuLevel = Math.max(1, p1.level); const s2 = calculateStats(randomBase.baseStats, cpuLevel); let cpuMoves = randomBase.movePool ? randomBase.movePool.filter(m => m.level <= cpuLevel).map(m => m.moveId) : []; if(cpuMoves.length === 0) cpuMoves = ['tackle']; if(cpuMoves.length > 4) cpuMoves = cpuMoves.sort(() => 0.5 - Math.random()).slice(0, 4); const p2 = { instanceId: 'p2_cpu_' + Date.now(), baseId: randomBase.id, name: randomBase.name, type: randomBase.type, level: cpuLevel, hp: s2.hp, maxHp: s2.hp, energy: s2.energy, maxEnergy: s2.energy, stats: s2, moves: cpuMoves.map(mid => ({...MOVES_LIBRARY[mid], id:mid})), sprite: randomBase.sprite, playerName: 'CPU', skin: 'char2', status: null }; const battleId = 'local_' + Date.now(); activeBattles[battleId] = { p1, p2, type: 'local', userId, turn: 1, mode: 'manual', returnMap: 'lobby' }; res.redirect('/battle/' + battleId); });

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
    if (battle.customBackground) bg = battle.customBackground;

    // CORREÇÃO CRÍTICA DE URL
    let returnUrl = '/lobby';
    if(battle.returnMap) {
        // Remove barra inicial se houver
        const cleanMap = battle.returnMap.startsWith('/') ? battle.returnMap.substring(1) : battle.returnMap;
        // Verifica se já tem ?
        const separator = cleanMap.includes('?') ? '&' : '?';
        returnUrl = `/${cleanMap}${separator}userId=${battle.userId}`;
        
        if(battle.returnX) returnUrl += `&x=${battle.returnX}`;
        if(battle.returnY) returnUrl += `&y=${battle.returnY}`;

        // Se foi batalha contra NPC, ao voltar retoma patrulha imediatamente.
        if (battle.type === 'local' && battle.npcId) {
            returnUrl += `&resumeNpcId=${encodeURIComponent(String(battle.npcId))}`;
        }
    } else {
        returnUrl = `/lobby?userId=${battle.userId}`;
    }

    res.render('battle', { 
        p1: battle.p1, p2: battle.p2, battleId: req.params.id, battleMode: battle.type === 'local' ? 'manual' : battle.type, 
        isSpectator: false, myRoleId: battle.p1.instanceId, realUserId: battle.userId, playerName: battle.p1.playerName, playerSkin: battle.p1.skin, 
        bgImage: bg, battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable, returnUrl 
    }); 
});

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
            if (p2.hp > 0 && !isForced) { performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); } 
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
                    await user.save(); delete activeBattles[battleId]; 
                    return res.json({ events, finished: true, win: true, captured: true, sentToPC, winnerId: p1.instanceId, threw: threwPokeball }); 
                } else { 
                    await user.save(); 
                    events.push({ type: 'MSG', text: `${p2.name} escapou!` }); 
                    performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); 
                } 
            } catch (e) { events.push({ type: 'MSG', text: 'Erro.' }); return res.json({ events }); } 
        } 
        else if (action === 'run') { if (Math.random() > 0.4) { delete activeBattles[battleId]; return res.json({ events: [{type:'MSG', text:'Fugiu!'}], finished: true, fled: true }); } else { events.push({ type: 'MSG', text: `Falha ao fugir!` }); performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); } } 
        else if (action === 'move') { 
            if (moveId === 'rest') {
                p1.energy = Math.min(p1.maxEnergy, p1.energy + 5);
                events.push({ type: 'REST', actorId: p1.instanceId, newEnergy: p1.energy });
                if (p2.hp > 0) performEnemyTurn(p2, p1, events);
            } else {
                const p1Move = p1.moves.find(m => m.id === moveId); 
                if (p1.stats.speed >= p2.stats.speed) { processAction(p1, p2, p1Move, events); if (p2.hp > 0) performEnemyTurn(p2, p1, events); } 
                else { performEnemyTurn(p2, p1, events); if (p1.hp > 0) processAction(p1, p2, p1Move, events); } 
            }
            if (p1.hp > 0) applyStatusDamage(p1, events); if (p2.hp > 0) applyStatusDamage(p2, events); 
        }
        
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
                        if (baseData.evolution && poke.level >= baseData.evolution.level) { const nextPoke = await BasePokemon.findOne({ id: baseData.evolution.targetId }); if(nextPoke) { poke.baseId = nextPoke.id; poke.nickname = nextPoke.name; events.push({ type: 'MSG', text: `Evoluiu para ${nextPoke.name}!` }); if (!user.dex) user.dex = []; if (!user.dex.includes(nextPoke.id)) { user.dex.push(nextPoke.id); } } }
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
                        let reward = 0; if(npc && npc.moneyReward > 0) reward = npc.moneyReward; else reward = Math.max(5, (p2.level || 1) * 5 * (battle.npcReserve ? battle.npcReserve.length : 1));
                        user.money = (user.money || 0) + reward; 
                        if (!user.defeatedNPCs) user.defeatedNPCs = [];
                        const npcIdStr = String(battle.npcId);
                        const recordIndex = user.defeatedNPCs.findIndex(r => String(r.npcId) === npcIdStr);
                        if (recordIndex !== -1) { user.defeatedNPCs[recordIndex].defeatedAt = Date.now(); } else { user.defeatedNPCs.push({ npcId: npcIdStr, defeatedAt: Date.now() }); }
                        events.push({ type: 'MSG', text: `Ganhou ${reward} moedas!` }); 
                        if (npc && npc.reward && npc.reward.type !== 'none') {
                            if (npc.reward.type === 'item') {
                                ensureUserInventories(user);
                                const itemId = normalizeItemId(npc.reward.value);
                                const qty = Math.max(1, parseInt(npc.reward.qty, 10) || 1);
                                const addRes = addItemToUser(user, itemId, qty, { keyItem: !!npc.reward.keyItem, unique: !!npc.reward.unique });
                                if (addRes.ok) {
                                    const msg = (addRes.storage === 'keyItems')
                                        ? `Recebeu o item-chave ${itemId}!`
                                        : `Recebeu ${qty}x ${itemId}!`;
                                    events.push({ type: 'MSG', text: msg });
                                } else if (addRes.reason === 'already_has_key_item') {
                                    events.push({ type: 'MSG', text: `Você já tem o item-chave ${itemId}.` });
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
        try {
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
            let mapNpcs = [];
            try { mapNpcs = await NPC.find({ map: data.map }).lean(); } catch(e) {}
            npcCacheByMap[data.map] = mapNpcs;
            socket.emit('npcs_list', mapNpcs);
            
            const startX = data.x || 50; 
            const startY = data.y || 50; 
            
            players[socket.id] = { id: socket.id, userId: data.userId, ...data, x: startX, y: startY, direction: 'down', isSearching: false }; 
            const mapPlayers = Object.values(players).filter(p => p.map === data.map); 
            socket.emit('map_state', mapPlayers); 
            socket.to(data.map).emit('player_joined', players[socket.id]);
        } catch(e) { console.error('Erro no socket enter_map', e); }
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server ON Port ${PORT}`));
