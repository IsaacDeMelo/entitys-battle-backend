const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

const { BaseEntity, User, NPC, GameMap, ItemDefinition, PlayerSkin, DevSettings, DevLog, BossEvent } = require('./models');
const { processPngBuffer } = require('./lib/chromaKey');
const { EntityType, MoveType, TypeChart, MOVES_LIBRARY, getXpForNextLevel, getTypeEffectiveness } = require('./gameData');
const { calculateStats, getLearnedMovesFromPool, pickDeterministicMovesFromPool, normalizeEntityType, validateEntityDefinition, isEntityBattleReady } = require('./lib/gameRules');
const { MONGO_URI } = require('./config'); 

const SKIN_COUNT = 12; 
const BASE_GRASS_CHANCE = 0.08;
const ENCOUNTER_COOLDOWN_MS = 7000;

// === SISTEMA DE ENERGIA BALANCEADO ===
const ENERGY_CONFIG = {
    maxEnergy: 10,           // Máximo de energia por combatente
    energyPerTurn: 1,        // Regeneração lenta para forçar escolhas estratégicas
    restBonus: 2,            // REST não pode ser spam infinito
};

// Contratos de batalha (desafios opt-in em vez de encontros selvagens)
const CONTRACTS = [
    { id: 'spar_easy',   name: 'Treino Fácil',   levelOffset: -1, rewardMoney: 50 },
    { id: 'spar_medium', name: 'Treino Médio',   levelOffset: 0,  rewardMoney: 120 },
    { id: 'spar_hard',   name: 'Treino Difícil', levelOffset: 2,  rewardMoney: 250 }
];

function getContractById(id) {
    const clean = String(id || '').trim();
    return CONTRACTS.find(c => c.id === clean) || null;
}

function getEncounterChanceForMap(mapId) {
    const normalizedMapId = String(mapId || '').trim().toLowerCase();
    if (!normalizedMapId) return 0;
    return BASE_GRASS_CHANCE;
}

function buildDefaultMapData(mapId) {
    const normalizedMapId = String(mapId || 'city').trim() || 'city';
    const defaults = {
        mapId: normalizedMapId,
        name: 'Mapa',
        bgImage: '/uploads/route_map.png',
        foregroundImage: '',
        collisions: [],
        grass: [],
        interacts: [],
        portals: [],
        storyBarriers: [],
        objects: [],
        spawnPoint: null,
        width: 100,
        height: 100,
        darknessLevel: 0,
        battleBackground: 'battle_bg.png',
        battleBgPosX: 50,
        battleBgPosY: 50,
        battleBgZoom: 100
    };

    return defaults;
}

function normalizeMapData(mapId, mapData) {
    const fallback = buildDefaultMapData(mapId);
    const merged = {
        ...fallback,
        ...(mapData || {})
    };

    if (!Array.isArray(merged.collisions)) merged.collisions = fallback.collisions;
    if (!Array.isArray(merged.grass)) merged.grass = fallback.grass;
    if (!Array.isArray(merged.interacts)) merged.interacts = fallback.interacts;
    if (!Array.isArray(merged.portals)) merged.portals = fallback.portals;
    if (!Array.isArray(merged.storyBarriers)) merged.storyBarriers = fallback.storyBarriers;
    if (!Array.isArray(merged.objects)) merged.objects = fallback.objects;
    if (!merged.spawnPoint && fallback.spawnPoint) merged.spawnPoint = fallback.spawnPoint;
    if (!merged.bgImage) merged.bgImage = fallback.bgImage;
    if (!merged.battleBackground) merged.battleBackground = fallback.battleBackground;
    if (!Number.isFinite(merged.battleBgPosX)) merged.battleBgPosX = fallback.battleBgPosX;
    if (!Number.isFinite(merged.battleBgPosY)) merged.battleBgPosY = fallback.battleBgPosY;
    if (!Number.isFinite(merged.battleBgZoom)) merged.battleBgZoom = fallback.battleBgZoom;
    if (!Number.isFinite(merged.darknessLevel)) merged.darknessLevel = fallback.darknessLevel;
    if (!Number.isFinite(merged.width)) merged.width = fallback.width;
    if (!Number.isFinite(merged.height)) merged.height = fallback.height;
    merged.name = String(merged.name || fallback.name || merged.mapId || 'Mapa').trim() || 'Mapa';
    merged.grass = sanitizeGrassList(merged.grass, merged.mapId || mapId);

    return merged;
}

function normalizeEncounterKey(value) {
    return String(value || '').trim();
}

function clampEncounterRate(value, fallback = BASE_GRASS_CHANCE) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(1, n));
}

function sanitizeGrassPatch(rawPatch, mapId) {
    if (!rawPatch || typeof rawPatch !== 'object') return null;

    const x = Number(rawPatch.x);
    const y = Number(rawPatch.y);
    const w = Number(rawPatch.w);
    const h = Number(rawPatch.h);
    if (![x, y, w, h].every(Number.isFinite)) return null;
    if (w <= 0 || h <= 0) return null;

    const sanitized = {
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
        w: Math.max(0.5, Math.min(100, w)),
        h: Math.max(0.5, Math.min(100, h)),
        encounterRate: clampEncounterRate(rawPatch.encounterRate, getEncounterChanceForMap(mapId))
    };

    const encounterKey = normalizeEncounterKey(rawPatch.encounterKey);
    const label = String(rawPatch.label || '').trim();
    if (encounterKey) sanitized.encounterKey = encounterKey;
    if (label) sanitized.label = label;

    return sanitized;
}

function sanitizeGrassList(grassList, mapId) {
    if (!Array.isArray(grassList)) return [];
    return grassList
        .map(patch => sanitizeGrassPatch(patch, mapId))
        .filter(Boolean);
}

async function getWildSpawnCandidates(mapName, encounterKey = '') {
    const normalizedMapName = String(mapName || 'city').trim() || 'city';
    const normalizedEncounterKey = normalizeEncounterKey(encounterKey);

    if (normalizedEncounterKey) {
        const byEncounterKey = await BaseEntity.find({ spawnLocation: normalizedEncounterKey }).lean();
        const byEncounterKeyValid = byEncounterKey.filter(isEntityBattleReady);
        if (byEncounterKeyValid.length > 0) return byEncounterKeyValid;
    }

    const exact = await BaseEntity.find({ spawnLocation: normalizedMapName }).lean();
    const exactValid = exact.filter(isEntityBattleReady);
    if (exactValid.length > 0) return exactValid;

    const any = await BaseEntity.find({}).sort({ dexOrder: 1, name: 1 }).lean();
    return any.filter(isEntityBattleReady);
}

async function buildEncounterZoneSummary(mapId, mapData) {
    const normalizedMapId = String(mapId || 'city').trim() || 'city';
    const safeMapData = normalizeMapData(normalizedMapId, mapData);
    const grassEntries = Array.isArray(safeMapData.grass) ? safeMapData.grass : [];
    const zones = [];
    const zoneKeys = new Set([normalizedMapId]);

    grassEntries.forEach((patch, index) => {
        const encounterKey = normalizeEncounterKey(patch.encounterKey) || normalizedMapId;
        zoneKeys.add(encounterKey);
        zones.push({
            zoneId: `${encounterKey}::${index}`,
            encounterKey,
            label: String(patch.label || '').trim() || `Zona ${index + 1}`,
            encounterRate: clampEncounterRate(patch.encounterRate, getEncounterChanceForMap(normalizedMapId)),
            patchCount: 1,
            source: encounterKey === normalizedMapId ? 'map' : 'zone',
            entities: []
        });
    });

    if (zones.length === 0) {
        zones.push({
            zoneId: `${normalizedMapId}::default`,
            encounterKey: normalizedMapId,
            label: safeMapData.name || normalizedMapId,
            encounterRate: getEncounterChanceForMap(normalizedMapId),
            patchCount: 0,
            source: 'map',
            entities: []
        });
    }

    const spawnLocations = Array.from(zoneKeys);
    const candidates = await BaseEntity.find({ spawnLocation: { $in: spawnLocations } }).sort({ dexOrder: 1, name: 1 }).lean();
    const validCandidates = candidates.filter(isEntityBattleReady);
    const byLocation = new Map();

    validCandidates.forEach(entity => {
        const key = normalizeEncounterKey(entity.spawnLocation);
        if (!byLocation.has(key)) byLocation.set(key, []);
        byLocation.get(key).push(entity);
    });

    zones.forEach(zone => {
        const exact = byLocation.get(zone.encounterKey) || [];
        const fallback = byLocation.get(normalizedMapId) || [];
        const pool = exact.length > 0 ? exact : fallback;
        zone.source = exact.length > 0 ? zone.source : 'fallback-map';
        zone.entities = pool.map(entity => ({
            id: entity.id,
            name: entity.name,
            spawnChance: Math.max(0, parseInt(entity.spawnChance, 10) || 0),
            minLevel: Math.max(1, parseInt(entity.minSpawnLevel, 10) || 1),
            maxLevel: Math.max(1, parseInt(entity.maxSpawnLevel, 10) || 1)
        }));
    });

    return {
        mapId: normalizedMapId,
        mapName: String(safeMapData.name || normalizedMapId).trim() || normalizedMapId,
        zoneCount: zones.length,
        zones
    };
}

async function getOrCreateDevSettings(userId) {
    if (!userId) return null;
    let settings = await DevSettings.findOne({ userId });
    if (!settings) {
        settings = await DevSettings.create({ userId, devMode: false, panelOpen: true, showDebugHud: true, updatedAt: Date.now() });
    }
    return settings;
}

async function recordDevLog(userId, action, meta = {}) {
    try {
        if (!userId) return;
        await DevLog.create({ userId, action: String(action || ''), meta: meta || {}, createdAt: Date.now() });
    } catch (_) {
        // silencioso: logs nao devem quebrar o fluxo
    }
}

// --- BOSS EVENT (global) ---
async function getOrCreateBossEventConfig() {
    let cfg = await BossEvent.findOne({ key: 'global' });
    if (!cfg) {
        cfg = await BossEvent.create({
            key: 'global',
            enabled: false,
            eventKey: 'event1',
            title: 'Evento Boss',
            trainerSkin: 'char2',
            trainerIsCustomSkin: false,
            miniBosses: [
                { slot: 'mini1', baseId: '', level: 5, name: '', moneyReward: 0, reward: { type: 'none', value: '', qty: 1, level: 1, keyItem: false, unique: false } },
                { slot: 'mini2', baseId: '', level: 10, name: '', moneyReward: 0, reward: { type: 'none', value: '', qty: 1, level: 1, keyItem: false, unique: false } },
                { slot: 'mini3', baseId: '', level: 15, name: '', moneyReward: 0, reward: { type: 'none', value: '', qty: 1, level: 1, keyItem: false, unique: false } }
            ],
            boss: { baseId: '', level: 20, name: '', moneyReward: 0, reward: { type: 'none', value: '', qty: 1, level: 1, keyItem: false, unique: false } },
            updatedAt: Date.now()
        });
    }

    // Compat: garante defaults em configs antigas
    if (cfg.trainerSkin == null || String(cfg.trainerSkin).trim() === '') cfg.trainerSkin = 'char2';
    if (cfg.trainerIsCustomSkin == null) cfg.trainerIsCustomSkin = false;

    return cfg;
}

function bossEventDefeatFlag(eventKey, slot) {
    const ek = String(eventKey || '').trim() || 'event1';
    const s = String(slot || '').trim();
    return `boss_event_${ek}_${s}_defeated`;
}

// --- STARTER (criatura inicial obtida via NPC no jogo) ---
const STARTER_FLAG_ID = 'starter_chosen';

function readStoryFlag(storyFlags, key) {
    if (!storyFlags) return false;

    // Suporta formato array: ['flag_a', 'flag_b']
    if (Array.isArray(storyFlags)) {
        return storyFlags.some(f => String(f || '').trim() === String(key || '').trim());
    }

    if (typeof storyFlags !== 'object') return false;

    const v = storyFlags[key];
    if (v === true) return true;
    if (v === false || v == null) return false;
    if (typeof v === 'number') return v === 1;
    if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        return s === 'true' || s === '1' || s === 'yes' || s === 'y';
    }
    return false;
}

async function getStarterOptions() {
    // Preferência: criaturas marcadas como isStarter.
    let starters = await BaseEntity.find({ isStarter: true }).sort({ id: 1 }).limit(3).lean();

    // Fallback: se o DB não tem 3 starters marcados, pega os 3 primeiros por id.
    // (Evita ficar travado "sem starter" por falta de configuração.)
    if (!Array.isArray(starters) || starters.length < 3) {
        starters = await BaseEntity.find({}).sort({ id: 1 }).limit(3).lean();
    }

    return (starters || [])
        .filter(isEntityBattleReady)
        .map(s => ({ 
            id: s.id, 
            name: s.name, 
            sprite: s.sprite || null, 
            type: normalizeEntityType(s.type) || EntityType.BEAST,
            baseStats: s.baseStats || { hp: 0, attack: 0, defense: 0, speed: 0 }
        }));
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

    const docs = await BaseEntity.find({ id: { $in: unique } }).lean();
    const byId = new Map(docs.map(d => [String(d.id), d]));
    const options = unique
        .map(id => {
            const d = byId.get(id);
            if (!d || !isEntityBattleReady(d)) return null;
            return { 
                id: d.id, 
                name: d.name, 
                sprite: d.sprite || null,
                type: normalizeEntityType(d.type) || EntityType.BEAST,
                baseStats: d.baseStats || { hp: 0, attack: 0, defense: 0, speed: 0 }
            };
        })
        .filter(Boolean);
    return options;
}


// --- CONEXÃO BANCO ---
const dbReady = mongoose.connect(MONGO_URI)
    .then(() => {
        console.log('✅ MongoDB Conectado');
        return Promise.all([
            fixLegacyUsers(),
            ensureDefaultItemCatalog(),
            refreshItemCatalogCache()
        ]);
    });

async function ensureDefaultItemCatalog() {
    try {
        const defaults = [
            { id: 'captureCube', name: 'Capture Cube', type: 'consumable', price: 0 },
            { id: 'levelUpCrystal', name: 'Level Crystal', type: 'consumable', price: 0 }
        ];
        for (const it of defaults) {
            const existing = await ItemDefinition.findOne({ id: it.id });
            if (!existing) {
                await ItemDefinition.create({
                    id: it.id,
                    name: it.name,
                    type: it.type,
                    price: Number.isFinite(it.price) ? it.price : 0,
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
// Servir imagens e uploads salvos em /uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

const activeBattles = {}; 
const onlineBattles = {}; 
const players = {}; 
let matchmakingQueue = []; // Declarado globalmente
const playerChallenges = {};
const roomSpectators = {}; 

// Cache da lista de NPCs por mapa (para sockets/patrol sem query constante)
const npcCacheByMap = {};

const storage = multer.memoryStorage();
// Upload genérico (NPCs, mapas): 20 MB
const upload = multer({ storage: storage, limits: { fileSize: 20 * 1024 * 1024 } });
// Upload maior só para chroma key (evita 413 em imagens grandes)
const chromaUpload = multer({ storage: storage, limits: { fileSize: 30 * 1024 * 1024 } });

const skinUpload = multer({
    storage,
    limits: {
        fileSize: 1024 * 1024 // 1MB
    }
});

function isLegacyCharSkinId(s) {
    return /^char\d+$/i.test(String(s || '').trim());
}

function isSocketInOnlineBattle(socketId) {
    return Object.values(onlineBattles).some(b => b && ((b.p1 && b.p1.id === socketId) || (b.p2 && b.p2.id === socketId)));
}

function hasActiveChallengeForSocket(socketId) {
    return Object.values(playerChallenges).some(ch => ch && (ch.fromSocketId === socketId || ch.toSocketId === socketId));
}

function cleanupChallengesForSocket(socketId) {
    Object.keys(playerChallenges).forEach((id) => {
        const ch = playerChallenges[id];
        if (ch && (ch.fromSocketId === socketId || ch.toSocketId === socketId)) delete playerChallenges[id];
    });
}

function createChallenge(fromSocketId, toSocketId) {
    const id = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const expiresAt = Date.now() + 45000;
    playerChallenges[id] = { id, fromSocketId, toSocketId, expiresAt };
    setTimeout(() => {
        const ch = playerChallenges[id];
        if (ch && ch.expiresAt <= Date.now()) {
            delete playerChallenges[id];
            io.to(ch.fromSocketId).emit('player_challenge_expired', { challengeId: id });
            io.to(ch.toSocketId).emit('player_challenge_expired', { challengeId: id });
        }
    }, 46000);
    return id;
}

async function createDirectOnlineBattle(p1SocketId, p2SocketId) {
    const p1Player = players[p1SocketId];
    const p2Player = players[p2SocketId];
    if (!p1Player || !p2Player) return { success: false, error: 'Jogador offline.' };

    const userA = await User.findById(p1Player.userId);
    const userB = await User.findById(p2Player.userId);
    if (!userA || !userB) return { success: false, error: 'Jogador inválido.' };

    const pickAlive = async (user, playerInfo, socketId) => {
        const pokeData = (user.entityTeam || []).find(p => p && p.currentHp > 0);
        if (!pokeData) return null;
        const base = await BaseEntity.findOne({ id: pokeData.baseId });
        if (!base) return null;
        const entity = userEntityToEntity(pokeData, base);
        entity.userId = user._id;
        entity.id = socketId;
        entity.playerName = playerInfo.name || 'Jogador';
        entity.skin = playerInfo.skin || 'char1';
        return entity;
    };

    const p1Entity = await pickAlive(userA, p1Player, p1SocketId);
    const p2Entity = await pickAlive(userB, p2Player, p2SocketId);
    if (!p1Entity || !p2Entity) return { success: false, error: 'Time inválido.' };

    const roomId = `room_${Date.now()}`;
    onlineBattles[roomId] = { p1: p1Entity, p2: p2Entity, turn: 1, bet: 0, mode: 'challenge' };
    return { success: true, roomId, p1: p1Entity, p2: p2Entity };
}

async function applyPvpRankingResult(battle, winnerId, events = []) {
    try {
        const winnerUser = (String(winnerId) === String(battle.p1.userId)) ? await User.findById(battle.p1.userId) : await User.findById(battle.p2.userId);
        const loserUser = (String(winnerId) === String(battle.p1.userId)) ? await User.findById(battle.p2.userId) : await User.findById(battle.p1.userId);
        if (!winnerUser || !loserUser) return;
        const WIN_POINTS = 10;
        const LOSS_POINTS = 5;
        winnerUser.pvpPoints = Math.max(0, (winnerUser.pvpPoints || 0) + WIN_POINTS);
        loserUser.pvpPoints = Math.max(0, (loserUser.pvpPoints || 0) - LOSS_POINTS);
        winnerUser.pvpWins = (winnerUser.pvpWins || 0) + 1;
        loserUser.pvpLosses = (loserUser.pvpLosses || 0) + 1;
        await winnerUser.save();
        await loserUser.save();
        events.push({ type: 'MSG', text: `Rank: +${WIN_POINTS} para ${winnerUser.username}` });
    } catch (e) {
        console.error(e);
    }
}

async function getDefaultSkinId() {
    const s = await PlayerSkin.findOne({}).sort({ name: 1 }).lean();
    return s ? String(s._id) : null;
}

async function ensureUserHasValidSkin(user) {
    if (!user) return null;

    const current = String(user.skin || '').trim();
    if (current && !isLegacyCharSkinId(current)) {
        const exists = await PlayerSkin.exists({ _id: current });
        if (exists) return current;
    }

    const defId = await getDefaultSkinId();
    if (!defId) return null;

    if (String(user.skin || '') !== defId) {
        user.skin = defId;
        await user.save();
    }
    return defId;
}

function isPngBuffer(buf) {
    return Buffer.isBuffer(buf) && buf.length >= 8 && buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]));
}

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
            price: Number.isFinite(x.price) ? x.price : (parseInt(x.price, 10) || 0),
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
    if (!user.bag || typeof user.bag !== 'object') {
        user.bag = { captureCube: 5, levelUpCrystal: 0 };
    }
    if (!Array.isArray(user.keyItems)) user.keyItems = [];
    if (!user.storyFlags || typeof user.storyFlags !== 'object') user.storyFlags = {};

    // Normaliza a flag global do starter: evita casos onde ela ficou salva como string (ex.: "false"),
    // o que quebraria checks com !! e esconderia opções no cliente.
    if (Object.prototype.hasOwnProperty.call(user.storyFlags, STARTER_FLAG_ID)) {
        user.storyFlags[STARTER_FLAG_ID] = readStoryFlag(user.storyFlags, STARTER_FLAG_ID);
    }
}

function getShopPurchaseFlag(npcId, itemId) {
    return `npc_shop_${String(npcId || '').trim()}_${normalizeItemId(itemId)}`;
}

function normalizeShopItems(rawItems) {
    if (!Array.isArray(rawItems)) return [];

    return rawItems
        .map(entry => {
            const itemId = normalizeItemId(entry && (entry.itemId || entry.id));
            const def = getItemDefFromCache(itemId);
            const rawPrice = Number(entry && entry.price);
            const price = Math.max(0, Number.isFinite(rawPrice) ? Math.floor(rawPrice) : Math.floor(def && Number.isFinite(def.price) ? def.price : 0));
            const qty = Math.max(1, parseInt(entry && (entry.qty || entry.amount), 10) || 1);
            const oneTimePerUser = !!(entry && (entry.oneTimePerUser === true || entry.oneTimePerUser === 'true' || entry.unique === true || entry.unique === 'true')) || !!(def && def.type === 'key');

            if (!itemId || price <= 0) return null;
            return { itemId, price, qty, oneTimePerUser };
        })
        .filter(Boolean);
}

function decorateShopItemsForClient(shopItems, npcId) {
    return normalizeShopItems(shopItems).map(entry => {
        const def = getItemDefFromCache(entry.itemId);
        return {
            ...entry,
            name: def && def.name ? def.name : entry.itemId,
            type: def && def.type === 'key' ? 'key' : 'consumable',
            purchaseFlag: entry.oneTimePerUser ? getShopPurchaseFlag(npcId, entry.itemId) : ''
        };
    });
}

async function purchaseCatalogItemForUser({ userId, itemId, qty, totalCost, oneTimePerUser = false, purchaseFlag = '' }) {
    const normalizedId = normalizeItemId(itemId);
    const amount = Math.max(1, parseInt(qty, 10) || 1);
    const cost = Math.max(0, parseInt(totalCost, 10) || 0);
    const def = getItemDefFromCache(normalizedId);

    if (!normalizedId || !def || cost <= 0) {
        return { ok: false, error: 'invalid_item' };
    }

    const query = { _id: userId, money: { $gte: cost } };
    if (oneTimePerUser && purchaseFlag) query[`storyFlags.${purchaseFlag}`] = { $ne: true };
    if (def.type === 'key') query.keyItems = { $ne: normalizedId };

    const inc = { money: -cost };
    if (def.type !== 'key') inc[`bag.${normalizedId}`] = amount;

    const update = { $inc: inc };
    if (def.type === 'key') update.$addToSet = { keyItems: normalizedId };
    if (oneTimePerUser && purchaseFlag) update.$set = { [`storyFlags.${purchaseFlag}`]: true };

    const updatedUser = await User.findOneAndUpdate(query, update, { new: true });
    if (!updatedUser) {
        const currentUser = await User.findById(userId).lean();
        const hasMoney = !!(currentUser && (currentUser.money || 0) >= cost);
        const alreadyPurchased = !!(currentUser && purchaseFlag && readStoryFlag(currentUser.storyFlags, purchaseFlag));
        const alreadyHasKey = !!(currentUser && Array.isArray(currentUser.keyItems) && currentUser.keyItems.includes(normalizedId));

        if (!hasMoney) return { ok: false, error: 'Saldo insuficiente.' };
        if (alreadyPurchased || alreadyHasKey) return { ok: false, error: 'Você já comprou este item.' };
        return { ok: false, error: 'Não foi possível concluir a compra.' };
    }

    ensureUserInventories(updatedUser);
    return { ok: true, user: updatedUser, def };
}

// Seleciona diálogo do NPC baseado em StoryFlags
// Sistema de diálogos: retorna null quando não deve falar (para diferenciar de string vazia intencional)
function resolveNpcDialogue(npc, user, key) {
    if (!npc || !user) {
        console.log(`[resolveNpcDialogue] NPC ou User null`);
        return null;
    }
    
    try {
        const conditionals = Array.isArray(npc.conditionalDialogues) ? npc.conditionalDialogues : [];
        const hasConditionals = conditionals.length > 0;
        
        console.log(`[resolveNpcDialogue] NPC: ${npc.name}, Key: ${key}`);
        console.log(`[resolveNpcDialogue] Has conditionals: ${hasConditionals}, Count: ${conditionals.length}`);
        
        // Se não há condicionais configuradas, usa a fala padrão do NPC
        if (!hasConditionals) {
            const defaultText = npc[key] || '';
            console.log(`[resolveNpcDialogue] Sem condicionais. Retorna padrão: "${defaultText.substring(0, 50)}"`);
            return defaultText;
        }
        
        // Há condicionais: verificar se alguma flag está ativa
        const flags = user.storyFlags || {};
        console.log(`[resolveNpcDialogue] User flags:`, JSON.stringify(flags));
        
        // Debug cada condicional
        conditionals.forEach((c, i) => {
            if (c && c.flagId) {
                const isActive = readStoryFlag(flags, c.flagId);
                console.log(`[resolveNpcDialogue] Conditional ${i}: flagId="${c.flagId}", active=${isActive}, dialogue="${(c.dialogue || '').substring(0, 30)}"`);
            }
        });
        
        const activeConditionals = conditionals
            .filter(c => c && c.flagId && readStoryFlag(flags, c.flagId))
            .sort((a, b) => (b.priority || 0) - (a.priority || 0));
        
        console.log(`[resolveNpcDialogue] Active conditionals count: ${activeConditionals.length}`);
        
        // Se alguma flag está ativa, usa o texto dela
        if (activeConditionals.length > 0) {
            const matched = activeConditionals.find(c => c[key]);
            if (matched && matched[key]) {
                console.log(`[resolveNpcDialogue] Flag "${matched.flagId}" ativa! Retorna: "${matched[key].substring(0, 50)}"`);
                return matched[key];
            }
            console.log(`[resolveNpcDialogue] Flag ativa mas sem texto para key "${key}"`);
        }
        
        // Há condicionais MAS nenhuma flag ativa: usa o diálogo padrão do NPC como fallback
        const defaultText = npc[key] || '';
        console.log(`[resolveNpcDialogue] Nenhuma flag ativa. Usa diálogo padrão: "${defaultText.substring(0, 50)}"`);
        return defaultText;
        
    } catch (e) {
        console.error(`[resolveNpcDialogue] ERRO:`, e);
        return null;
    }
}

function userHasAnyEntity(user) {
    return !!(user && Array.isArray(user.entityTeam) && user.entityTeam.length > 0);
}

function getItemCount(user, itemId) {
    if (!user) return 0;
    ensureUserInventories(user);
    const id = normalizeItemId(itemId);
    if (!id) return 0;

    if (user.keyItems.includes(id)) return 1;

    const raw = user.bag[id];
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

    if (isKeyItem || id === 'key' || id.startsWith('key_')) {
        if (unique && user.keyItems.includes(id)) {
            return { ok: false, reason: 'already_has_key_item' };
        }
        if (!user.keyItems.includes(id)) {
            user.keyItems.push(id);
            if (typeof user.markModified === 'function') user.markModified('keyItems');
        }
        return { ok: true, added: 1, storage: 'keyItems' };
    }

    const prev = getItemCount(user, id);
    user.bag[id] = prev + amount;
    if (typeof user.markModified === 'function') user.markModified('bag');
    return { ok: true, added: amount, storage: 'bag' };
}

function removeItemFromUser(user, itemId, qty = 1) {
    ensureUserInventories(user);
    const id = normalizeItemId(itemId);
    const amount = Math.max(1, parseInt(qty, 10) || 1);
    if (!id) return { ok: false, reason: 'invalid_item' };

    // Remoção de item-chave (único)
    if (user.keyItems.includes(id)) {
        user.keyItems = user.keyItems.filter(k => k !== id);
        if (typeof user.markModified === 'function') user.markModified('keyItems');
        return { ok: true, removed: 1, storage: 'keyItems' };
    }

    // Remoção de itens consumíveis da mochila
    const prev = getItemCount(user, id);
    if (prev < amount) return { ok: false, reason: 'not_enough' };
    const next = prev - amount;
    if (next <= 0) delete user.bag[id];
    else user.bag[id] = next;
    if (typeof user.markModified === 'function') user.markModified('bag');
    return { ok: true, removed: amount, storage: 'bag' };
}

function shouldRenameOnEvolution(currentNickname, currentBaseName) {
    const nick = String(currentNickname || '').trim();
    const base = String(currentBaseName || '').trim();
    if (!nick) return true;
    if (!base) return false;
    return nick.toLowerCase() === base.toLowerCase();
}

async function applyOwnedEntityProgression(user, entityId, options = {}) {
    if (!user || !entityId) return { ok: false, error: 'invalid_params' };

    const session = options.session;
    const entityList = Array.isArray(user.entityTeam) ? user.entityTeam : [];
    let poke = null;
    try {
        poke = user.entityTeam && typeof user.entityTeam.id === 'function'
            ? user.entityTeam.id(entityId)
            : null;
    } catch (_) {
        poke = null;
    }
    if (!poke) poke = entityList.find(entry => entry && String(entry._id) === String(entityId));
    if (!poke) return { ok: false, error: 'entity_not_found' };

    const xpGain = Math.max(0, parseInt(options.xpGain, 10) || 0);
    let manualLevels = Math.max(0, parseInt(options.levelGain, 10) || 0);
    const restoreHpMode = options.restoreHp === true ? 'full' : (options.restoreHp === 'full' ? 'full' : 'keep');

    if (!Array.isArray(poke.moves)) poke.moves = [];
    if (!Array.isArray(poke.learnedMoves) || poke.learnedMoves.length === 0) poke.learnedMoves = [...poke.moves];
    if (!Array.isArray(user.dex)) user.dex = [];

    const baseCache = new Map();
    const loadBase = async (baseId) => {
        const id = String(baseId || '').trim();
        if (!id) return null;
        if (baseCache.has(id)) return baseCache.get(id);
        const query = BaseEntity.findOne({ id });
        if (session) query.session(session);
        const base = await query;
        baseCache.set(id, base || null);
        return base || null;
    };

    let currentBase = await loadBase(poke.baseId);
    if (!currentBase) return { ok: false, error: 'base_not_found' };

    let carryXp = Math.max(0, parseInt(poke.xp, 10) || 0) + xpGain;
    const learnedMoves = [];
    const evolutions = [];
    let levelsGained = 0;
    let levelCapReached = false;
    const visitedEvolutionIds = new Set([String(currentBase.id)]);

    while (poke.level < 100) {
        const xpNeeded = getXpForNextLevel(poke.level);
        const canLevelFromXp = carryXp >= xpNeeded;
        const canLevelFromManual = manualLevels > 0;
        if (!canLevelFromXp && !canLevelFromManual) break;

        if (canLevelFromManual) {
            manualLevels -= 1;
        } else {
            carryXp -= xpNeeded;
        }

        poke.level += 1;
        levelsGained += 1;

        const movePool = Array.isArray(currentBase.movePool) ? currentBase.movePool : [];
        movePool
            .filter(move => move && (parseInt(move.level, 10) || 1) === poke.level)
            .forEach(move => {
                const moveId = String(move.moveId || '').trim();
                if (!moveId || !MOVES_LIBRARY[moveId]) return;
                if (!poke.learnedMoves.includes(moveId)) {
                    poke.learnedMoves.push(moveId);
                    learnedMoves.push(moveId);
                }
                if (!poke.moves.includes(moveId) && poke.moves.length < 4) {
                    poke.moves.push(moveId);
                }
            });

        while (currentBase && currentBase.evolution && currentBase.evolution.targetId && poke.level >= (parseInt(currentBase.evolution.level, 10) || 1)) {
            const nextBase = await loadBase(currentBase.evolution.targetId);
            if (!nextBase) break;
            if (visitedEvolutionIds.has(String(nextBase.id))) break;

            evolutions.push({
                fromId: currentBase.id,
                fromName: currentBase.name,
                toId: nextBase.id,
                toName: nextBase.name,
                level: poke.level
            });

            const renameToBaseName = shouldRenameOnEvolution(poke.nickname, currentBase.name);
            poke.baseId = nextBase.id;
            if (renameToBaseName) poke.nickname = nextBase.name;
            if (!user.dex.includes(nextBase.id)) user.dex.push(nextBase.id);
            currentBase = nextBase;
            visitedEvolutionIds.add(String(nextBase.id));
        }
    }

    if (poke.level >= 100) {
        poke.level = 100;
        carryXp = 0;
        levelCapReached = true;
    }

    poke.xp = Math.max(0, carryXp);
    poke.stats = calculateStats(currentBase.baseStats, poke.level);
    if (restoreHpMode === 'full') {
        poke.currentHp = poke.stats.hp;
    } else {
        const prevHp = Math.max(0, parseInt(poke.currentHp, 10) || 0);
        poke.currentHp = Math.min(poke.stats.hp, prevHp);
    }

    return {
        ok: true,
        entity: poke,
        base: currentBase,
        levelsGained,
        learnedMoves,
        evolutions,
        xpToNext: poke.level >= 100 ? 0 : getXpForNextLevel(poke.level),
        levelCapReached
    };
}

function buildProgressionMessages(progression, displayName) {
    if (!progression || !progression.ok) return [];
    const messages = [];
    const safeName = String(displayName || 'Monstro').trim() || 'Monstro';

    if (progression.levelsGained > 0) {
        if (progression.levelsGained === 1) {
            messages.push(`${safeName} subiu para o nível ${progression.entity.level}!`);
        } else {
            messages.push(`${safeName} subiu ${progression.levelsGained} níveis e agora está no nível ${progression.entity.level}!`);
        }
    }

    progression.learnedMoves.forEach(moveId => {
        const move = MOVES_LIBRARY[moveId];
        if (move && move.name) messages.push(`Aprendeu ${move.name}!`);
    });

    progression.evolutions.forEach(evo => {
        messages.push(`Evoluiu para ${evo.toName}!`);
    });

    if (progression.levelCapReached) {
        messages.push(`${safeName} atingiu o nível máximo.`);
    }

    return messages;
}

async function getEntityEvolutionPreview(baseId, level) {
    const base = await BaseEntity.findOne({ id: baseId }).lean();
    if (!base || !base.evolution || !base.evolution.targetId) return null;

    const atLevel = Math.max(1, parseInt(base.evolution.level, 10) || 1);
    const nextBase = await BaseEntity.findOne({ id: base.evolution.targetId }).lean();
    return {
        ready: Math.max(1, parseInt(level, 10) || 1) >= atLevel,
        atLevel,
        targetId: base.evolution.targetId,
        targetName: nextBase ? nextBase.name : base.evolution.targetId,
        levelsRemaining: Math.max(0, atLevel - (Math.max(1, parseInt(level, 10) || 1)))
    };
}

function pickWeightedEntity(list) {
    let total = 0; list.forEach(e => total += (e.spawnChance || 1));
    let r = Math.random() * total;
    for (let i = 0; i < list.length; i++) {
        const w = list[i].spawnChance || 1;
        if (r < w) return list[i];
        r -= w;
    }
    return list[0]; 
}

async function createBattleInstance(baseId, level, knownBase = null) {
    const base = knownBase || await BaseEntity.findOne({ id: baseId }).lean(); if(!base || !isEntityBattleReady(base)) return null;
    const stats = calculateStats(base.baseStats, level); 
    let moves = pickDeterministicMovesFromPool(base.movePool, level, 4, base.type);
    return { 
        instanceId: 'wild_' + Date.now(), 
        baseId: base.id, name: base.name, type: normalizeEntityType(base.type) || EntityType.BEAST, level: level, 
        maxHp: stats.hp, hp: stats.hp, maxEnergy: ENERGY_CONFIG.maxEnergy, energy: ENERGY_CONFIG.maxEnergy, stats: stats, 
        moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m.id), 
        sprite: base.sprite, catchRate: base.catchRate || 0.5, xpYield: Math.max(5, Math.floor(level * 25)), 
        isWild: true, status: null, combo: 0, defending: false
    }; 
}

function userEntityToEntity(userEntity, baseData) { 
    if (!userEntity || !baseData) return null;

    const instanceId =
        (userEntity._id && typeof userEntity._id.toString === 'function')
            ? userEntity._id.toString()
            : (userEntity.instanceId ? String(userEntity.instanceId) : `entity_${Date.now()}_${Math.random().toString(16).slice(2)}`);

    const level = Number.isFinite(userEntity.level) ? userEntity.level : parseInt(userEntity.level) || 1;
    const stats = (userEntity.stats && Number.isFinite(userEntity.stats.hp)) ? userEntity.stats : calculateStats(baseData.baseStats, level);

    // Prefer equipped moves (1-4 chosen in "equipe"); fall back to learnedMoves.
    const equippedMoves = Array.isArray(userEntity.moves) ? userEntity.moves : [];
    const learnedMoves = Array.isArray(userEntity.learnedMoves) ? userEntity.learnedMoves : [];
    const rawMoves = (equippedMoves.length > 0 ? equippedMoves : learnedMoves)
        .filter(Boolean)
        .slice(0, 4);

    const movesObj = rawMoves
        .map(mid => { const libMove = MOVES_LIBRARY[mid]; return libMove ? { ...libMove, id: mid } : null; })
        .filter(m => m !== null);

    const currentHp = Number.isFinite(userEntity.currentHp) ? userEntity.currentHp : stats.hp;

    return {
        instanceId,
        baseId: userEntity.baseId,
        name: userEntity.nickname || baseData.name,
        type: normalizeEntityType(baseData.type) || EntityType.BEAST,
        level,
        maxHp: stats.hp,
        hp: currentHp > 0 ? currentHp : 0,
        maxEnergy: ENERGY_CONFIG.maxEnergy,
        energy: ENERGY_CONFIG.maxEnergy,
        stats,
        moves: movesObj,
        sprite: baseData.sprite,
        isWild: false,
        xp: Number.isFinite(userEntity.xp) ? userEntity.xp : 0,
        xpToNext: getXpForNextLevel(level),
        status: null,
        defending: false
    }; 
}

async function buildFollowerInfo(user) {
    try {
        if (!user || !user.followingEntityId) {
            return { followingEntityId: '', sprite: '', name: '' };
        }
        const followId = String(user.followingEntityId);
        const team = Array.isArray(user.entityTeam) ? user.entityTeam : [];
        const entry = team.find(p => String(p && (p._id || p.instanceId)) === followId);
        if (!entry) return { followingEntityId: '', sprite: '', name: '' };
        const base = await BaseEntity.findOne({ id: entry.baseId }).lean();
        return {
            followingEntityId: followId,
            sprite: (base && base.sprite) ? base.sprite : '',
            name: entry.nickname || (base ? base.name : '')
        };
    } catch (_) {
        return { followingEntityId: '', sprite: '', name: '' };
    }
}

function applyStatusDamage(entity, events) {
    if (!entity.status || entity.hp <= 0) return;
    if (entity.status.type === 'poison') {
        const dmg = Math.max(1, Math.floor(entity.maxHp / 8)); entity.hp -= dmg; if (entity.hp < 0) entity.hp = 0; entity.status.turns--;
        events.push({ type: 'STATUS_DAMAGE', targetId: entity.instanceId || 'wild', damage: dmg, newHp: entity.hp, status: 'poison', text: `${entity.name} sofreu pelo veneno!` });
        if (entity.status.turns <= 0) { entity.status = null; events.push({ type: 'STATUS_END', targetId: entity.instanceId || 'wild', text: `O veneno de ${entity.name} passou.` }); }
    }
}

function processAction(attacker, defender, move, logArray) {
    if(!move) { logArray.push({ type: 'MSG', text: `${attacker.name} hesitou!` }); return; }
    
    const cost = move.cost || 0;
    
    // VALIDAÇÃO: Checar energia ANTES de descontar
    if (attacker.energy < cost) { 
        logArray.push({ 
            type: 'MSG', 
            text: `${attacker.name} não tem energia suficiente! Precisa ${cost}, tem ${attacker.energy}.` 
        }); 
        return; 
    }
    
    // Descontar energia
    attacker.energy -= cost; 
    
    logArray.push({ type: 'USE_MOVE', actorId: attacker.instanceId || 'wild', moveName: move.name, moveIcon: move.icon, moveElement: move.element || 'beast', moveCategory: move.category || 'physical', moveType: move.type, cost: cost, newEnergy: attacker.energy });
    
    if(move.type === 'heal') { 
        const oldHp = attacker.hp; 
        const healAmount = move.power + Math.floor(attacker.maxHp * 0.1); 
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount); 
        
        // REST também restaura energia extra (novo sistema!)
        if (move.id === 'rest') {
            const energyBonus = ENERGY_CONFIG.restBonus;
            attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + energyBonus);
            logArray.push({ 
                type: 'HEAL', 
                actorId: attacker.instanceId || 'wild', 
                amount: attacker.hp - oldHp, 
                newHp: attacker.hp,
                energyRestored: energyBonus,
                newEnergy: attacker.energy
            }); 
        } else {
            logArray.push({ type: 'HEAL', actorId: attacker.instanceId || 'wild', amount: attacker.hp - oldHp, newHp: attacker.hp }); 
        }
        
        // Quebra combo (decisão tática: atacar ou curar)
        if (attacker.combo) attacker.combo = 0;
    } 
    else if (move.type === 'defend') { 
        // Sistema de defesa: reduz dano recebido no próximo turno
        attacker.defending = true;
        logArray.push({ type: 'MSG', text: `${attacker.name} se protegeu!` }); 
        // Quebra combo (decisão tática: atacar ou defender)
        if (attacker.combo) attacker.combo = 0;
    } 
    else { 
        // --- SISTEMA DE COMBATE APRIMORADO ---
        
        // 1. EVASÃO: Chance de esquivar baseada em velocidade
        const evasionChance = Math.min(0.15, defender.stats.speed / 1000); // Máx 15%
        if (Math.random() < evasionChance) {
            logArray.push({ type: 'MSG', text: `${defender.name} esquivou!` });
            // Quebra o combo do atacante
            if (attacker.combo) attacker.combo = 0;
            return;
        }
        
        // 2. DEFESA REDUZ DANO
        const defenseMultiplier = defender.defending ? 0.5 : 1.0;
        defender.defending = false; // Remove estado de defesa após ser atacado
        
        // Cálculo de dano melhorado
        const multiplier = getTypeEffectiveness(move.element, defender.type);
        const level = attacker.level || 1; 
        const atk = attacker.stats.attack; 
        const def = defender.stats.defense;
        const random = (Math.floor(Math.random() * 16) + 85) / 100;
        
        let damage = Math.floor((((level * 0.2 + 1.5) * move.power * (atk / def)) / 65 + 2) * multiplier * random);
        
        // Aplicar defesa
        damage = Math.floor(damage * defenseMultiplier);
        
        if (damage < 1) damage = 1; 
        
        defender.hp -= damage; 
        if (defender.hp < 0) defender.hp = 0;
        
        logArray.push({ 
            type: 'ATTACK_HIT', 
            attackerId: attacker.instanceId || 'wild', 
            targetId: defender.instanceId || 'wild', 
            damage, 
            newHp: defender.hp, 
            isEffective: multiplier > 1, 
            isNotEffective: multiplier < 1 && multiplier > 0, 
            isBlocked: multiplier === 0
        }); 
        
        // 5. EFEITOS ESPECIAIS: Chance de aplicar status baseado no elemento
        if (!defender.status && defender.hp > 0) {
            let statusChance = 0;
            let statusType = null;
            
            // Cada elemento tem chance de causar status diferente
            if (move.element === 'venom') {
                statusChance = 0.30; // 30% de envenenar
                statusType = 'poison';
            } else if (move.element === 'flame') {
                statusChance = 0.15; // 15% de queimar
                statusType = 'burn';
            } else if (move.element === 'aqua') {
                statusChance = 0.10; // 10% de congelar
                statusType = 'frozen';
            } else if (move.element === 'sky') {
                statusChance = 0.20; // 20% de paralisia
                statusType = 'paralyzed';
            }
            
            if (statusType && Math.random() < statusChance) {
                defender.status = { type: statusType, turns: 3 };
                const statusMsg = {
                    poison: `${defender.name} foi envenenado!`,
                    burn: `${defender.name} foi queimado!`,
                    frozen: `${defender.name} foi congelado!`,
                    paralyzed: `${defender.name} foi paralisado!`
                };
                logArray.push({ 
                    type: 'STATUS_APPLIED', 
                    targetId: defender.instanceId || 'wild', 
                    status: statusType, 
                    text: statusMsg[statusType] || `${defender.name} foi afetado!`
                });
            }
        }
        
    }
}

function performEnemyTurn(attacker, defender, events) {
    try {
        const movesArr = Array.isArray(attacker && attacker.moves) ? attacker.moves : [];

        // Fallback seguro para evitar travar batalhas quando um NPC/monstro não tem movePool válido.
        const fallbackMoveId = (MOVES_LIBRARY && MOVES_LIBRARY.rapid_punch) ? 'rapid_punch'
            : (MOVES_LIBRARY && MOVES_LIBRARY.wing_slice) ? 'wing_slice'
            : (MOVES_LIBRARY && MOVES_LIBRARY.rest) ? 'rest'
            : (MOVES_LIBRARY ? Object.keys(MOVES_LIBRARY)[0] : null);
        const fallbackMove = (fallbackMoveId && MOVES_LIBRARY && MOVES_LIBRARY[fallbackMoveId])
            ? { ...MOVES_LIBRARY[fallbackMoveId], id: fallbackMoveId }
            : null;

        const picked = movesArr.length
            ? movesArr[Math.floor(Math.random() * movesArr.length)]
            : fallbackMove;

        if (!picked) {
            if (events) events.push({ type: 'MSG', text: `${attacker && attacker.name ? attacker.name : 'Inimigo'} ficou sem ataques!` });
            return;
        }
        processAction(attacker, defender, picked, events);
    } catch (e) {
        console.error('performEnemyTurn error:', e);
        if (events) events.push({ type: 'MSG', text: 'O inimigo hesitou...' });
    }
}

// --- ROTAS GERAIS ---
app.get('/', async (req, res) => {
    const skins = await PlayerSkin.find({}).sort({ name: 1 }).lean();
    const err = (req.query && req.query.error) ? String(req.query.error) : null;
    res.render('login', { error: err, skinCount: SKIN_COUNT, skins: skins || [] });
});

app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username, password });
    if (user) {
        const okSkin = await ensureUserHasValidSkin(user);
        if (!okSkin) {
            const skins = await PlayerSkin.find({}).sort({ name: 1 }).lean();
            return res.render('login', { error: 'Nenhuma skin cadastrada. Admin: crie skins no LAB antes de jogar.', skinCount: SKIN_COUNT, skins: skins || [] });
        }
        // Não força casa: deixa /city decidir com base na última localização
        res.redirect('/city?userId=' + user._id);
    } else {
        const skins = await PlayerSkin.find({}).sort({ name: 1 }).lean();
        res.render('login', { error: 'Credenciais inválidas', skinCount: SKIN_COUNT, skins: skins || [] });
    }
});
app.post('/register', async (req, res) => {
    const { username, password, skin } = req.body;
    try {
        const available = await PlayerSkin.find({}).sort({ name: 1 }).lean();
        if (!available || available.length === 0) {
            return res.render('login', { error: 'Nenhuma skin cadastrada. Admin: crie skins no LAB antes de registrar.', skinCount: SKIN_COUNT, skins: [] });
        }

        const chosen = String(skin || '').trim();
        if (!chosen || isLegacyCharSkinId(chosen)) {
            return res.render('login', { error: 'Selecione uma skin válida (as skins antigas foram desativadas).', skinCount: SKIN_COUNT, skins: available });
        }
        const exists = await PlayerSkin.exists({ _id: chosen });
        if (!exists) {
            return res.render('login', { error: 'Skin inválida. Selecione uma das skins cadastradas.', skinCount: SKIN_COUNT, skins: available });
        }

        const newUser = new User({ username, password, skin: chosen, entityTeam: [], pc: [], dex: [] });
        await newUser.save();
        res.redirect('/city?userId=' + newUser._id);
    } catch (e) {
        const skins = await PlayerSkin.find({}).sort({ name: 1 }).lean();
        res.render('login', { error: 'Usuário já existe.', skinCount: SKIN_COUNT, skins: skins || [] });
    }
});

// Serve skins do DB como PNG
app.get('/skins/:id.png', async (req, res) => {
    try {
        const id = String(req.params.id || '').trim();
        if (!id) return res.status(404).end();
        const skin = await PlayerSkin.findById(id).lean();
        if (!skin || !skin.pngBase64) return res.status(404).end();
        const buf = Buffer.from(String(skin.pngBase64), 'base64');
        if (!isPngBuffer(buf)) return res.status(415).end();
        res.setHeader('Content-Type', 'image/png');
        res.setHeader('Cache-Control', 'public, max-age=3600');
        return res.end(buf);
    } catch (e) {
        return res.status(500).end();
    }
});

app.get('/lobby', async (req, res) => {
    const { userId } = req.query;
    const user = await User.findById(userId);
    if (!user) return res.redirect('/');
    const okSkin = await ensureUserHasValidSkin(user);
    if (!okSkin) return res.redirect('/?error=' + encodeURIComponent('Nenhuma skin cadastrada. Admin: crie skins no LAB antes de jogar.'));

    // Projeto focado no mapa/engine do City (modo "mobile" mesmo no PC).
    return res.redirect('/city?from=lobby&userId=' + encodeURIComponent(userId));
});

app.get('/forest', async (req, res) => {
    const { userId } = req.query;
    // Projeto focado no mapa/engine do City.
    return res.redirect('/city?from=forest&userId=' + encodeURIComponent(userId));
});

app.get('/room', async (req, res) => {
    const { userId } = req.query;
    return res.redirect('/city?from=lobby&userId=' + encodeURIComponent(userId || ''));
});

// --- ROTA CIDADE (ENGINE DE MAPA) ---
app.get('/city', async (req, res) => {
    const { userId, from, map } = req.query;
    const user = await User.findById(userId);
    if (!user) return res.redirect('/');

    // Bloqueia uso de skins antigas: força uma skin do DB (ou impede jogar se não existir)
    const okSkin = await ensureUserHasValidSkin(user);
    if (!okSkin) {
        return res.redirect('/?error=' + encodeURIComponent('Nenhuma skin cadastrada. Admin: crie skins no LAB antes de jogar.'));
    }
    
    // Tratamento de URL
    const lastLoc = (user && user.lastLocation) ? user.lastLocation : null;
    let mapId = map || (lastLoc && lastLoc.mapId) || 'house1';
    if(mapId.includes('?')) mapId = mapId.split('?')[0];

    // Carrega mapa do DB
    let mapData = await GameMap.findOne({ mapId }).lean();
    mapData = normalizeMapData(mapId, mapData);

    function asFiniteNumber(n) {
        const v = parseFloat(n);
        return Number.isFinite(v) ? v : null;
    }

    function clamp01to100(n, fallback = 50) {
        const v = asFiniteNumber(n);
        if (v === null) return fallback;
        return Math.max(0, Math.min(100, v));
    }

    function pointHitsCollision(mapData, x, y) {
        const px = asFiniteNumber(x);
        const py = asFiniteNumber(y);
        if (px === null || py === null) return false;
        const list = Array.isArray(mapData && mapData.collisions) ? mapData.collisions : [];
        for (const r of list) {
            if (!r) continue;
            const rx = asFiniteNumber(r.x);
            const ry = asFiniteNumber(r.y);
            const rw = asFiniteNumber(r.w);
            const rh = asFiniteNumber(r.h);
            if (rx === null || ry === null || rw === null || rh === null) continue;
            if (px >= rx && px <= (rx + rw) && py >= ry && py <= (ry + rh)) return true;
        }
        return false;
    }

    function findNearestSafePoint(mapData, x, y) {
        let sx = clamp01to100(x, 50);
        let sy = clamp01to100(y, 50);
        if (!pointHitsCollision(mapData, sx, sy)) return { x: sx, y: sy };

        // Procura em anéis (perímetro) ao redor do ponto inicial.
        const STEP = 0.75; // em %
        const MAX_R = 15; // em %
        for (let r = STEP; r <= MAX_R; r += STEP) {
            // perímetro do quadrado [-r,r]
            for (let dx = -r; dx <= r; dx += STEP) {
                const top = { x: clamp01to100(sx + dx, sx), y: clamp01to100(sy - r, sy) };
                if (!pointHitsCollision(mapData, top.x, top.y)) return top;
                const bottom = { x: clamp01to100(sx + dx, sx), y: clamp01to100(sy + r, sy) };
                if (!pointHitsCollision(mapData, bottom.x, bottom.y)) return bottom;
            }
            for (let dy = -r; dy <= r; dy += STEP) {
                const left = { x: clamp01to100(sx - r, sx), y: clamp01to100(sy + dy, sy) };
                if (!pointHitsCollision(mapData, left.x, left.y)) return left;
                const right = { x: clamp01to100(sx + r, sx), y: clamp01to100(sy + dy, sy) };
                if (!pointHitsCollision(mapData, right.x, right.y)) return right;
            }
        }

        // Fallback final: tenta centro.
        const cx = 50, cy = 50;
        if (!pointHitsCollision(mapData, cx, cy)) return { x: cx, y: cy };
        return { x: sx, y: sy };
    }

    // Spawn Logic
    let startX = 50, startY = 50;
    let startDir = 'down';
    if (req.query.x && req.query.y) {
        startX = parseFloat(req.query.x); startY = parseFloat(req.query.y);
    } else if (lastLoc && lastLoc.mapId === mapId && typeof lastLoc.x === 'number' && typeof lastLoc.y === 'number') {
        startX = lastLoc.x;
        startY = lastLoc.y;
        if (lastLoc.direction) startDir = String(lastLoc.direction);
    } else if (mapData.spawnPoint && mapData.spawnPoint.x != null && mapData.spawnPoint.y != null) {
        // Aceita number e string numérica
        startX = parseFloat(mapData.spawnPoint.x);
        startY = parseFloat(mapData.spawnPoint.y);
    } else if (from === 'forest') {
        startX = 50; startY = 92;
    }

    // Sanitiza
    if (!Number.isFinite(startX)) startX = 50;
    if (!Number.isFinite(startY)) startY = 50;
    startX = Math.max(0, Math.min(100, startX));
    startY = Math.max(0, Math.min(100, startY));
    startDir = ['up', 'down', 'left', 'right'].includes(startDir) ? startDir : 'down';

    // Garante que o spawn não fique dentro de colisões (parede)
    try {
        const safe = findNearestSafePoint(mapData, startX, startY);
        startX = safe.x;
        startY = safe.y;
    } catch (_) {
        // best-effort
    }

    const baseIds = [...new Set((user.entityTeam || []).map(p => String(p.baseId || '')).filter(Boolean))];
    const [allEntities, teamBases] = await Promise.all([
        BaseEntity.find().sort({ dexOrder: 1, name: 1 }).lean(),
        baseIds.length ? BaseEntity.find({ id: { $in: baseIds } }).lean() : []
    ]);
    const baseById = new Map(teamBases.map(base => [String(base.id), base]));
    const teamData = (user.entityTeam || [])
        .map(p => {
            const base = baseById.get(String(p.baseId || ''));
            return base ? userEntityToEntity(p, base) : null;
        })
        .filter(Boolean);
    
    res.render('city', { user, userId: user._id, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin, skinCount: SKIN_COUNT, startX, startY, startDir, entities: allEntities, team: teamData, mapData: mapData }); 
});

function clampPct(n, fallback = 50) {
    const v = parseFloat(n);
    if (!Number.isFinite(v)) return fallback;
    return Math.max(0, Math.min(100, v));
}

function clampZoomPct(n, fallback = 100) {
    const v = parseFloat(n);
    if (!Number.isFinite(v)) return fallback;
    // Zoom em %: 50% a 250%
    return Math.max(50, Math.min(250, v));
}

function normalizeDir(dir) {
    const d = String(dir || '').trim();
    return ['up', 'down', 'left', 'right'].includes(d) ? d : 'down';
}

async function persistUserLocation(userId, mapId, x, y, direction) {
    try {
        if (!userId) return;
        const update = {
            lastLocation: {
                mapId: String(mapId || 'house1'),
                x: clampPct(x, 50),
                y: clampPct(y, 50),
                direction: normalizeDir(direction),
                updatedAt: Date.now()
            }
        };
        await User.findByIdAndUpdate(userId, { $set: update }).exec();
    } catch (_) {
        // silencioso: não deve derrubar o jogo
    }
}

// --- API MAPAS ---
app.post('/api/map/save', async (req, res) => {
    const { userId, mapId, mapData } = req.body;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.status(403).json({ error: 'Sem permissão' });
    try {
        const normalizedMap = normalizeMapData(mapId, { ...(mapData || {}), mapId });
        await GameMap.findOneAndUpdate(
            { mapId: mapId },
            { $set: { 
                name: normalizedMap.name,
                collisions: normalizedMap.collisions, 
                grass: normalizedMap.grass, 
                interacts: normalizedMap.interacts, 
                portals: normalizedMap.portals, 
                objects: normalizedMap.objects || [],
                storyBarriers: normalizedMap.storyBarriers || [],
                foregroundImage: normalizedMap.foregroundImage || '',
                bgImage: normalizedMap.bgImage, 
                width: normalizedMap.width || 100, 
                height: normalizedMap.height || 100, 
                spawnPoint: normalizedMap.spawnPoint,
                darknessLevel: normalizedMap.darknessLevel || 0, 
                battleBackground: normalizedMap.battleBackground,
                battleBgPosX: clampPct(normalizedMap.battleBgPosX, 50),
                battleBgPosY: clampPct(normalizedMap.battleBgPosY, 50),
                battleBgZoom: clampZoomPct(normalizedMap.battleBgZoom, 100)
            }},
            { upsert: true, new: true }
        );
        res.json({ success: true });
    } catch (e) { res.json({ error: e.message }); }
});

app.get('/api/map/:mapId', async (req, res) => {
    try {
        const { mapId } = req.params;
        let map = await GameMap.findOne({ mapId }).lean();
        map = normalizeMapData(mapId, map);
        res.json(map);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- API: BUSCAR MAPA COMPLETO COM NPCS (para transições SPA) ---
app.get('/api/map/:mapId/full', async (req, res) => {
    try {
        const { mapId } = req.params;
        const { userId, x, y } = req.query;
        
        // Carrega mapa
        let mapData = await GameMap.findOne({ mapId }).lean();
        mapData = normalizeMapData(mapId, mapData);
        
        // Carrega NPCs do mapa
        const npcsRaw = await NPC.find({ map: mapId }).lean();
        npcCacheByMap[mapId] = npcsRaw;
        const npcs = npcsRaw.map(npc => ({
            id: npc._id.toString(),
            name: npc.name || 'NPC',
            x: npc.x || 50,
            y: npc.y || 50,
            direction: npc.direction || 'down',
            skin: npc.skin || 'char1',
            mapId: npc.mapId,
            type: npc.type || 'decor',
            npcType: npc.npcType || '',
            interact: npc.interact || {},
            team: npc.team || [],
            dialogLines: npc.dialogLines || [],
            battleEntityId: npc.battleEntityId,
            patrolRoute: npc.patrolRoute || [],
            shopItems: npc.shopItems || [],
            healAmount: npc.healAmount || 0,
            starterId: npc.starterId,
            requiredStoryFlag: npc.requiredStoryFlag,
            requiredItem: npc.requiredItem,
            givesStoryFlag: npc.givesStoryFlag,
            givesItem: npc.givesItem
        }));
        
        // Posição do spawn
        let startX = 50, startY = 50;
        if (x && y) {
            startX = parseFloat(x);
            startY = parseFloat(y);
        } else if (mapData.spawnPoint && mapData.spawnPoint.x != null && mapData.spawnPoint.y != null) {
            startX = parseFloat(mapData.spawnPoint.x);
            startY = parseFloat(mapData.spawnPoint.y);
        }
        
        // Sanitiza
        if (!Number.isFinite(startX)) startX = 50;
        if (!Number.isFinite(startY)) startY = 50;
        startX = Math.max(0, Math.min(100, startX));
        startY = Math.max(0, Math.min(100, startY));
        
        res.json({
            map: mapData,
            npcs: npcs,
            spawn: { x: startX, y: startY }
        });
    } catch (e) {
        console.error('Erro ao buscar mapa completo:', e);
        res.status(500).json({ error: e.message });
    }
});

app.get('/api/dev/encounter-zones/:mapId', async (req, res) => {
    try {
        const { mapId } = req.params;
        const { userId } = req.query;
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissão' });

        const mapData = await GameMap.findOne({ mapId }).lean();
        const summary = await buildEncounterZoneSummary(mapId, mapData);
        return res.json({ success: true, summary });
    } catch (e) {
        return res.status(500).json({ success: false, error: e.message || 'Erro interno' });
    }
});

// API: interagir com um objeto do mapa (garante que itens só sejam obtidos uma vez)
app.post('/api/map/interact', async (req, res) => {
    try {
        const { userId, mapId, obj } = req.body;
        if (!userId || !obj) return res.status(400).json({ error: 'missing_params' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'user_not_found' });
        ensureUserInventories(user);

        // Key to mark this object as already taken for this user
        const objKey = (obj.flagId && String(obj.flagId).trim()) ? String(obj.flagId).trim()
            : `map:${String(mapId||'')}:obj:${String(obj.x||0)}:${String(obj.y||0)}:${String(obj.w||0)}:${String(obj.h||0)}`;

        if (user.storyFlags && user.storyFlags[objKey]) {
            return res.json({ success: true, alreadyDone: true, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
        }

        if (!obj.itemId) {
            // Nothing to give — just mark as visited and return
            user.storyFlags = user.storyFlags || {};
            user.storyFlags[objKey] = true;
            if (typeof user.markModified === 'function') user.markModified('storyFlags');
            await user.save();
            return res.json({ success: true, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
        }

        const giveId = String(obj.itemId || '').trim();
        const giveQty = Math.max(1, parseInt(obj.qty || obj.givesQty || 1, 10) || 1);
        const addRes = addItemToUser(user, giveId, giveQty, { keyItem: !!obj.givesKeyItem, unique: !!obj.givesUnique });
        if (!addRes || !addRes.ok) return res.json({ success: false, error: addRes && addRes.reason ? addRes.reason : 'failed_add' });

        user.storyFlags = user.storyFlags || {};
        user.storyFlags[objKey] = true;
        if (typeof user.markModified === 'function') user.markModified('storyFlags');
        await user.save();

        return res.json({ success: true, added: addRes, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
});

// API: usar um item (pode ser key item) para ativar uma StoryFlag (por exemplo, remover barreira)
app.post('/api/map/use-key', async (req, res) => {
    try {
        const { userId, flagId, itemId, qty } = req.body;
        if (!userId || !flagId || !itemId) return res.status(400).json({ error: 'missing_params' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ error: 'user_not_found' });
        ensureUserInventories(user);

        const normalizedItem = normalizeItemId(itemId);
        const haveCount = getItemCount(user, normalizedItem);
        if (!haveCount || haveCount <= 0) return res.json({ success: false, needsItem: true, error: 'not_enough_item' });


        // If the item is a key item owned by the user, DO NOT remove it — key items are required/usable in-place.
        if (Array.isArray(user.keyItems) && user.keyItems.includes(normalizedItem)) {
            // just set the flag
            user.storyFlags = user.storyFlags || {};
            user.storyFlags[flagId] = true;
            if (typeof user.markModified === 'function') user.markModified('storyFlags');
            await user.save();
            return res.json({ success: true, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
        }

        // Otherwise attempt to remove from bag (consumables)
        const removeRes = removeItemFromUser(user, normalizedItem, qty || 1);
        if (!removeRes || !removeRes.ok) return res.json({ success: false, error: removeRes && removeRes.reason ? removeRes.reason : 'failed_remove' });

        // Set the story flag
        user.storyFlags = user.storyFlags || {};
        user.storyFlags[flagId] = true;
        if (typeof user.markModified === 'function') user.markModified('storyFlags');
        await user.save();

        return res.json({ success: true, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: e.message });
    }
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

app.post('/tools/chroma', (req, res, next) => {
    chromaUpload.single('image')(req, res, function(err) {
        if (err) {
            const msg = err && err.message ? err.message : 'Falha no upload';
            return res.status(413).send(`Erro no upload: ${msg} (tente uma imagem menor)`);
        }
        next();
    });
}, async (req, res) => {
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
        interactRange,
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
        interactBoxPrice,
        interactBoxRewardsJson,
        interactStarterOptionsJson,

        conditionalDialoguesJson
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
            level: (rewardType === 'entity') ? (parseInt(rewardQty) || 1) : 1,
            keyItem: rewardKeyItem === 'on' || rewardKeyItem === true || rewardKeyItem === 'true',
            unique: rewardUnique === 'on' || rewardUnique === true || rewardUnique === 'true'
        };

        const interact = {
            enabled: interactEnabled === 'on' || interactEnabled === true || interactEnabled === 'true',

            // 0 = usa o padrão do client
            range: Math.max(0, parseFloat(interactRange) || 0),

            serviceType: (interactServiceType || '').trim(),
            healDialogue: interactHealDialogue || '',
            shopItems: (() => {
                if (!interactShopItemsJson) return [];
                try {
                    return normalizeShopItems(JSON.parse(interactShopItemsJson));
                } catch (_) {
                    return [];
                }
            })(),

            box: (() => {
                const price = Math.max(0, parseInt(interactBoxPrice, 10) || 0);
                if (!interactBoxRewardsJson) return { price, rewards: [] };
                try {
                    const raw = JSON.parse(interactBoxRewardsJson);
                    const list = Array.isArray(raw) ? raw : [];
                    const rewards = list
                        .map(r => ({
                            baseId: r && r.baseId ? String(r.baseId).trim() : '',
                            weight: Math.max(0, parseFloat(r && r.weight) || 0),
                            minLevel: Math.max(1, parseInt(r && r.minLevel, 10) || 1),
                            maxLevel: Math.max(1, parseInt(r && r.maxLevel, 10) || 1)
                        }))
                        .filter(r => r.baseId && r.weight > 0)
                        .map(r => ({
                            ...r,
                            maxLevel: Math.max(r.minLevel, r.maxLevel)
                        }));
                    return { price, rewards };
                } catch (_) {
                    return { price, rewards: [] };
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

        const conditionalDialoguesParsed = (() => {
            const prevList = Array.isArray(previous && previous.conditionalDialogues) ? previous.conditionalDialogues : [];
            if (!conditionalDialoguesJson || !String(conditionalDialoguesJson).trim()) return prevList;
            try {
                const arr = JSON.parse(conditionalDialoguesJson);
                if (!Array.isArray(arr)) return prevList;
                return arr
                    .map(x => ({
                        flagId: String((x && x.flagId) || '').trim(),
                        dialogue: (x && x.dialogue) ? String(x.dialogue) : '',
                        winDialogue: (x && x.winDialogue) ? String(x.winDialogue) : '',
                        cooldownDialogue: (x && x.cooldownDialogue) ? String(x.cooldownDialogue) : '',
                        priority: Number.isFinite(x && x.priority) ? x.priority : (parseInt(x && x.priority, 10) || 0)
                    }))
                    .filter(x => x.flagId);
            } catch (_) {
                return prevList;
            }
        })();

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
                                y: Math.max(0, Math.min(100, parseFloat(p && p.y))),
                                waitMs: Math.max(0, parseInt(p && p.waitMs, 10) || 0),
                                map: p && p.map ? String(p.map) : (map || (previous && previous.map) || ''),
                                viaPortalId: p && p.viaPortalId ? String(p.viaPortalId) : ''
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
                        y: Math.max(0, Math.min(100, parseFloat(p && p.y))),
                        waitMs: Math.max(0, parseInt(p && p.waitMs, 10) || 0),
                        map: p && p.map ? String(p.map) : (map || (previous && previous.map) || ''),
                        viaPortalId: p && p.viaPortalId ? String(p.viaPortalId) : ''
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
            conditionalDialogues: conditionalDialoguesParsed,
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
// Endpoint para resolver diálogo de NPC (incluindo condicionais)
app.post('/api/npc/dialogue', async (req, res) => {
    try {
        const { userId, npcId } = req.body;
        const user = await User.findById(userId);
        const npc = await NPC.findById(npcId);
        if (!user || !npc) return res.status(404).json({ error: 'NPC ou usuário não encontrado' });
        
        console.log(`[/api/npc/dialogue] NPC: ${npc.name}, User: ${user.username}`);
        console.log(`[/api/npc/dialogue] User storyFlags:`, JSON.stringify(user.storyFlags));
        console.log(`[/api/npc/dialogue] NPC conditionalDialogues:`, JSON.stringify(npc.conditionalDialogues));
        
        const interact = npc.interact || {};
        // Serviço: gacha/roleta (preview antes de abrir)
        if (interact.enabled && interact.serviceType === 'box' && interact.boxDialogue) {
            return res.json({ text: String(interact.boxDialogue) });
        }

        const dialogueText = resolveNpcDialogue(npc, user, 'dialogue');
        const finalText = dialogueText !== null ? dialogueText : '...';
        
        console.log(`[/api/npc/dialogue] Resolved text: "${finalText}"`);
        
        res.json({ text: finalText });
    } catch (e) {
        console.error(`[/api/npc/dialogue] ERROR:`, e);
        res.status(400).json({ error: e.message });
    }
});

// DEBUG: endpoint para inspecionar NPC
app.get('/api/npc/debug/:id', async (req, res) => {
    try {
        const npc = await NPC.findById(req.params.id).lean();
        if (!npc) return res.status(404).json({ error: 'NPC não encontrado' });
        res.json(npc);
    } catch (e) {
        res.status(400).json({ error: e.message });
    }
});

app.post('/api/npc/interact', async (req, res) => {
    try {
        const { userId, npcId, playerX, playerY } = req.body;
        const user = await User.findById(userId);
        const npc = await NPC.findById(npcId);
        if (!user || !npc) return res.status(404).json({ error: 'NPC ou usuário não encontrado' });

        ensureUserInventories(user);
        const interact = npc.interact || {};
        if (!interact.enabled) {
            const dialogueText = resolveNpcDialogue(npc, user, 'dialogue');
            // Se retornou null, significa que tem condicionais mas nenhuma flag ativa
            const finalText = dialogueText !== null ? dialogueText : '...';
            return res.json({ success: false, noInteraction: true, text: finalText });
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
                    const now = Date.now();
                    const nx = typeof n.x === 'number' ? n.x : parseFloat(n.x) || 0;
                    const ny = typeof n.y === 'number' ? n.y : parseFloat(n.y) || 0;
                    const dx = px - nx;
                    const dy = py - ny;
                    const dir = computeDirectionFromDelta(dx, dy);
                    const pausedAccum = Number.isFinite(n._pauseAccumMs) ? n._pauseAccumMs : 0;
                    const updatedNpc = {
                        ...n,
                        direction: dir,
                        _faceDirection: dir,
                        _pauseUntil: now + 8000,
                        _pausedAt: now,
                        _pauseAccumMs: pausedAccum
                    };
                    list[idx] = updatedNpc;
                    npcCacheByMap[mapId] = list;
                    io.to(mapId).emit('npcs_list', list);
                }
            }
        } catch (_) {}

        const serviceType = String((interact.serviceType || npc.npcType || '')).trim();

        const flagId = (interact.flagId && String(interact.flagId).trim()) ? String(interact.flagId).trim() : `npc_interact_${npc._id}`;

        // Starter: usa flag global (não depende do flagId do NPC).
        // Não marca flag aqui (marca só quando escolher). Só retorna ação com opções.
        if (serviceType === 'starter') {
            // Regra: só pode escolher UMA vez. Fallback: se já tem qualquer pokémon, também bloqueia.
            // (Isso cobre casos onde a flag não persistiu por ser um Object "mixed".)
            let already = readStoryFlag(user.storyFlags, STARTER_FLAG_ID) || userHasAnyEntity(user);
            if (already) {
                const dialogueText = resolveNpcDialogue(npc, user, 'winDialogue');
                const finalText = dialogueText !== null ? dialogueText : (interact.alreadyDoneDialogue || 'Você já escolheu o seu monstro inicial.');
                return res.json({ success: true, alreadyDone: true, text: finalText, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
            }

            const optionsRes = await getStarterOptionsForNpc(npc);
            if (optionsRes && optionsRes.error) {
                return res.json({ success: false, error: optionsRes.error });
            }
            const options = optionsRes;
            if (!options || options.length < 3) {
                return res.json({ success: false, error: 'Não há 3 monstros iniciais configurados.' });
            }

            const dialogueText = resolveNpcDialogue(npc, user, 'dialogue');
            const finalText = dialogueText !== null ? dialogueText : (interact.successDialogue || 'Escolha o seu monstro inicial.');
            return res.json({
                success: true,
                text: finalText,
                action: { type: 'starter', options, flagId: STARTER_FLAG_ID, npcId: String(npc._id) },
                bag: user.bag,
                keyItems: user.keyItems,
                storyFlags: user.storyFlags
            });
        }

        // Para quests (serviceType=''), mantém o comportamento antigo (marca flag sempre).
        // Para serviços (heal/shop), só usa flag quando for algo único (givesUnique).
        const shouldUseFlag = serviceType === '' || !!interact.givesUnique;
        const alreadyDone = shouldUseFlag ? !!user.storyFlags[flagId] : false;

        if (alreadyDone && interact.givesUnique) {
            const dialogueText = resolveNpcDialogue(npc, user, 'winDialogue');
            const finalText = dialogueText !== null ? dialogueText : (interact.alreadyDoneDialogue || 'Já fiz isso por você.');
            return res.json({ success: true, alreadyDone: true, text: finalText, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
        }

        const requiresId = normalizeItemId(interact.requiresItemId);
        const requiresQty = Math.max(1, parseInt(interact.requiresItemQty, 10) || 1);
        if (requiresId) {
            const hasQty = getItemCount(user, requiresId);
            if (hasQty < requiresQty) {
                const needText = interact.needItemDialogue || `Você precisa de ${requiresQty}x ${requiresId}.`;
                return res.json({ success: true, needsItem: true, text: needText, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
            }
        }

        if (requiresId && interact.consumesRequiredItem) {
            const removed = removeItemFromUser(user, requiresId, requiresQty);
            if (!removed.ok) {
                const needText = interact.needItemDialogue || `Você precisa de ${requiresQty}x ${requiresId}.`;
                return res.json({ success: true, needsItem: true, text: needText, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
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
            for (let p of user.entityTeam) {
                const base = await BaseEntity.findOne({ id: p.baseId });
                if (base) {
                    p.stats = calculateStats(base.baseStats, p.level);
                    p.currentHp = p.stats.hp;
                    count++;
                }
            }
            await user.save();
            const dialogueText = resolveNpcDialogue(npc, user, 'dialogue');
            const finalText = dialogueText !== null ? dialogueText : (interact.healDialogue || `Seus monstros foram curados! (${count})`);
            return res.json({
                success: true,
                text: finalText,
                action: { type: 'heal', healed: count },
                npcMoved,
                bag: user.bag,
                keyItems: user.keyItems,
                storyFlags: user.storyFlags
            });
        }

        if (serviceType === 'shop') {
            const cleaned = decorateShopItemsForClient(interact.shopItems, npc._id);

            const dialogueText = resolveNpcDialogue(npc, user, 'dialogue');
            const finalText = dialogueText !== null ? dialogueText : 'O que você quer comprar?';
            return res.json({
                success: true,
                text: finalText,
                action: { type: 'shop', items: cleaned },
                npcMoved,
                bag: user.bag,
                keyItems: user.keyItems,
                storyFlags: user.storyFlags
            });
        }

        if (serviceType === 'box') {
            const boxCfg = interact.box || {};
            const price = Math.max(0, parseInt(boxCfg.price, 10) || 0);
            const rewardsRaw = Array.isArray(boxCfg.rewards) ? boxCfg.rewards : [];
            const rewards = rewardsRaw
                .map(r => ({
                    baseId: r && r.baseId ? String(r.baseId).trim() : '',
                    weight: Math.max(0, parseFloat(r && r.weight) || 0),
                    minLevel: Math.max(1, parseInt(r && r.minLevel, 10) || 1),
                    maxLevel: Math.max(1, parseInt(r && r.maxLevel, 10) || 1)
                }))
                .filter(r => r.baseId && r.weight > 0)
                .map(r => ({ ...r, maxLevel: Math.max(r.minLevel, r.maxLevel) }));

            if (!rewards.length) {
                return res.json({ success: false, error: 'box_not_configured', text: 'Esta box não tem prêmios configurados.' });
            }

            if ((user.money || 0) < price) {
                const missing = Math.max(0, price - (user.money || 0));
                const msg = interact.needItemDialogue || `Faltam ${missing} moedas para abrir esta box (custa ${price}).`;
                return res.json({ success: false, error: 'not_enough_money', text: msg, money: user.money });
            }

            if (price > 0) {
                user.money = Math.max(0, (user.money || 0) - price);
            }

            const total = rewards.reduce((sum, r) => sum + r.weight, 0);
            let roll = Math.random() * total;
            let chosen = rewards[0];
            for (let r of rewards) {
                if (roll < r.weight) { chosen = r; break; }
                roll -= r.weight;
            }

            const base = await BaseEntity.findOne({ id: chosen.baseId }).lean();
            if (!base) {
                return res.json({ success: false, error: 'invalid_reward', text: 'Prêmio configurado não existe no banco.' });
            }

            const levelMin = Math.max(1, chosen.minLevel || 1);
            const levelMax = Math.max(levelMin, chosen.maxLevel || levelMin);
            const level = levelMin === levelMax ? levelMin : (levelMin + Math.floor(Math.random() * (levelMax - levelMin + 1)));

            const stats = calculateStats(base.baseStats, level);
            const learnedMoves = getLearnedMovesFromPool(base.movePool, level, base.type);
            const moves = pickDeterministicMovesFromPool(base.movePool, level, 4, base.type);
            const newEntity = { baseId: base.id, nickname: base.name, level, currentHp: stats.hp, stats, moves, learnedMoves, xp: 0 };
            let storage = 'pc';
            if (!Array.isArray(user.entityTeam)) user.entityTeam = [];
            if (!Array.isArray(user.pc)) user.pc = [];
            if (user.entityTeam.length < 6) { user.entityTeam.push(newEntity); storage = 'team'; }
            else { user.pc.push(newEntity); storage = 'pc'; }

            if (!Array.isArray(user.dex)) user.dex = [];
            if (!user.dex.includes(base.id)) user.dex.push(base.id);

            await user.save();

            const whereText = storage === 'team' ? 'seu time' : 'o PC';
            const defaultText = `Você abriu a box e recebeu ${base.name} (nível ${level})! Foi enviado para ${whereText}.`;

            const tpl = (interact.boxResultDialogue && String(interact.boxResultDialogue).trim())
                ? String(interact.boxResultDialogue)
                : defaultText;
            const finalText = tpl
                .replace(/\{prizeName\}/g, String(base.name))
                .replace(/\{prizeLevel\}/g, String(level))
                .replace(/\{where\}/g, String(whereText))
                .replace(/\{spent\}/g, String(price));

            return res.json({
                success: true,
                text: finalText,
                action: {
                    type: 'box_result',
                    prize: { baseId: base.id, name: base.name, level, storage },
                    spent: price
                },
                npcMoved,
                bag: user.bag,
                keyItems: user.keyItems,
                storyFlags: user.storyFlags,
                money: user.money
            });
        }

        const dialogueText = resolveNpcDialogue(npc, user, 'dialogue');
        const successText = dialogueText !== null ? dialogueText : (giveMsg || 'Feito.');
        return res.json({
            success: true,
            text: successText,
            npcMoved,
            bag: user.bag,
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
        const { userId, npcId } = req.query;
        const user = userId ? await User.findById(userId) : null;
        if (!user) return res.status(404).json({ error: 'User not found' });
        ensureUserInventories(user);
        let options;
        if (npcId) {
            const npc = await NPC.findById(String(npcId)).lean();
            const svc = npc ? String(((npc.interact && npc.interact.serviceType) || npc.npcType || '')).trim() : '';
            if (!npc || svc !== 'starter') {
                return res.status(400).json({ error: 'NPC de starter inválido.' });
            }
            const optionsRes = await getStarterOptionsForNpc(npc);
            if (optionsRes && optionsRes.error) {
                return res.status(400).json({ error: optionsRes.error });
            }
            options = optionsRes;
        } else {
            options = await getStarterOptions();
        }
        const chosen = readStoryFlag(user.storyFlags, STARTER_FLAG_ID) || userHasAnyEntity(user);
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

        const alreadyChosen = readStoryFlag(user.storyFlags, STARTER_FLAG_ID) || userHasAnyEntity(user);
        if (alreadyChosen) {
            return res.status(400).json({ error: 'Você já escolheu o seu monstro inicial.' });
        }

        let allowedIds;
        if (npcId) {
            const npc = await NPC.findById(npcId);
            const svc = npc ? String(((npc.interact && npc.interact.serviceType) || npc.npcType || '')).trim() : '';
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

        const starter = await BaseEntity.findOne({ id: pick }).lean();
        if (!starter) return res.status(404).json({ error: 'Monstro não encontrado.' });
        if (!isEntityBattleReady(starter)) return res.status(400).json({ error: 'Starter configurado com dados inválidos.' });

        const stats = calculateStats(starter.baseStats, 1);
        const learnedMoves = getLearnedMovesFromPool(starter.movePool, 1, starter.type);
        const moves = pickDeterministicMovesFromPool(starter.movePool, 1, 4, starter.type);

        user.entityTeam = Array.isArray(user.entityTeam) ? user.entityTeam : [];
        user.entityTeam.push({
            baseId: starter.id,
            nickname: starter.name,
            level: 1,
            currentHp: stats.hp,
            stats,
            moves,
            learnedMoves,
            xp: 0
        });

        user.dex = Array.isArray(user.dex) ? user.dex : [];
        if (!user.dex.includes(starter.id)) user.dex.push(starter.id);

        user.storyFlags[STARTER_FLAG_ID] = true;
        // storyFlags é um objeto "mixed"; garante persistência
        user.markModified('storyFlags');
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
            const now = Date.now();
            const nx = typeof n.x === 'number' ? n.x : parseFloat(n.x) || 0;
            const ny = typeof n.y === 'number' ? n.y : parseFloat(n.y) || 0;
            const dx = px - nx;
            const dy = py - ny;
            const dir = computeDirectionFromDelta(dx, dy);
            const pausedAccum = Number.isFinite(n._pauseAccumMs) ? n._pauseAccumMs : 0;
            const updatedNpc = {
                ...n,
                direction: dir,
                _faceDirection: dir,
                _pauseUntil: now + pauseFor,
                _pausedAt: now,
                _pauseAccumMs: pausedAccum
            };
            list[idx] = updatedNpc;
            npcCacheByMap[mapId] = list;
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
            const now = Date.now();
            const pausedAt = Number.isFinite(n._pausedAt) ? n._pausedAt : null;
            const pausedAccum = Number.isFinite(n._pauseAccumMs) ? n._pauseAccumMs : 0;
            const delta = pausedAt ? Math.max(0, now - pausedAt) : 0;

            // Zera estado efêmero e acumula o tempo parado para compensar no cálculo da rota.
            const cleared = { 
                ...n, 
                _pauseUntil: 0,
                _pausedAt: 0,
                _pauseAccumMs: pausedAccum + delta
            };
            delete cleared._faceDirection;
            list[idx] = cleared;
            npcCacheByMap[mapId] = list;
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
        const npc = await NPC.findById(npcId);
        if (!npc) return res.status(404).json({ error: 'NPC não encontrado' });

        const interact = npc.interact || {};
        if (!interact.enabled || String(interact.serviceType || '').trim() !== 'shop') {
            return res.status(400).json({ error: 'Este NPC não é uma loja.' });
        }

        const targetId = normalizeItemId(itemId);
        if (!targetId) return res.status(400).json({ error: 'Item inválido.' });

        const shopItems = normalizeShopItems(interact.shopItems);
        const entry = shopItems.find(x => x && x.itemId === targetId);
        if (!entry) return res.status(400).json({ error: 'Item não vendido por este NPC.' });

        const multiplier = Math.max(1, parseInt(qty, 10) || 1);
        const bundleQty = Math.max(1, parseInt(entry.qty, 10) || 1);
        const cost = entry.price * multiplier;
        const totalQty = bundleQty * multiplier;
        const purchaseFlag = entry.oneTimePerUser ? getShopPurchaseFlag(npc._id, targetId) : '';
        const purchase = await purchaseCatalogItemForUser({
            userId,
            itemId: targetId,
            qty: totalQty,
            totalCost: cost,
            oneTimePerUser: !!entry.oneTimePerUser,
            purchaseFlag
        });
        if (!purchase.ok) return res.status(400).json({ error: purchase.error || 'Não foi possível concluir a compra.' });

        const user = purchase.user;
        return res.json({
            success: true,
            money: user.money,
            captureCube: (user.bag && user.bag.captureCube) || 0,
            levelUpCrystal: (user.bag && user.bag.levelUpCrystal) || 0,
            bag: user.bag,
            keyItems: user.keyItems,
            storyFlags: user.storyFlags,
            purchaseFlag,
            itemId: targetId,
            qtyAdded: totalQty,
            spent: cost
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- CRIAÇÃO DE NPC ---
app.get('/admin/dev', async (req, res) => {
    const { userId } = req.query;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.redirect('/');
    const settings = await getOrCreateDevSettings(user._id);
    res.render('dev', { userId: user._id, username: user.username, settings });
});

app.get('/lab', async (req, res) => {
    const { userId } = req.query;
    const user = await User.findById(userId);
    if (!user || !user.isAdmin) return res.redirect('/');
    const entities = await BaseEntity.find().sort({ dexOrder: 1, name: 1 }).lean();
    const npcs = await NPC.find().lean();
    const skins = await PlayerSkin.find({}).sort({ name: 1 }).lean();
    const bossEvent = await getOrCreateBossEventConfig();
    res.render('create', { types: EntityType, moves: MOVES_LIBRARY, entities, npcs, skins: skins || [], user, bossEvent });
});

// --- BOSS EVENT API ---
app.get('/api/boss-event', async (req, res) => {
    try {
        const { userId } = req.query;
        const user = userId ? await User.findById(userId).lean() : null;
        if (!user) return res.status(404).json({ error: 'User not found' });
        const cfg = await getOrCreateBossEventConfig();

        const eventKey = String(cfg.eventKey || '').trim() || 'event1';
        const enabled = !!cfg.enabled;

        const minis = Array.isArray(cfg.miniBosses) ? cfg.miniBosses : [];
        const miniSlots = ['mini1', 'mini2', 'mini3'];
        const miniFixed = miniSlots.map(slot => minis.find(m => String(m && m.slot) === slot) || { slot, baseId: '', level: 1, name: '', team: [], moneyReward: 0, reward: { type: 'none' } });

        const getDisplayMember = (entry) => {
            const team = (entry && Array.isArray(entry.team)) ? entry.team : [];
            const first = team.find(x => x && x.baseId) || null;
            if (first) {
                return {
                    baseId: String(first.baseId || '').trim(),
                    level: Math.max(1, parseInt(first.level, 10) || 1),
                    teamCount: team.length
                };
            }
            return {
                baseId: String((entry && entry.baseId) || '').trim(),
                level: Math.max(1, parseInt(entry && entry.level, 10) || 1),
                teamCount: (entry && entry.baseId) ? 1 : 0
            };
        };

        const baseIds = [];
        for (const m of miniFixed) {
            const d = getDisplayMember(m);
            if (d && d.baseId) baseIds.push(String(d.baseId));
        }
        const bossDisplay = getDisplayMember(cfg.boss || {});
        if (bossDisplay && bossDisplay.baseId) baseIds.push(String(bossDisplay.baseId));
        const uniqBaseIds = Array.from(new Set(baseIds.filter(Boolean)));
        const bases = uniqBaseIds.length ? await BaseEntity.find({ id: { $in: uniqBaseIds } }).lean() : [];
        const baseById = new Map((bases || []).map(b => [String(b.id), b]));

        const miniProgress = miniFixed.map(m => {
            const slot = String(m.slot || '').trim();
            const defeated = readStoryFlag(user.storyFlags, bossEventDefeatFlag(eventKey, slot));
            const d = getDisplayMember(m);
            const b = baseById.get(String(d.baseId || ''));
            return {
                slot,
                baseId: String(d.baseId || ''),
                level: Math.max(1, parseInt(d.level, 10) || 1),
                name: (m.name && String(m.name).trim()) ? String(m.name).trim() : (slot ? slot.toUpperCase() : ''),
                sprite: b ? (b.sprite || '') : '',
                defeated: !!defeated,
                moneyReward: Math.max(0, parseInt(m.moneyReward, 10) || 0),
                reward: m.reward || { type: 'none', value: '', qty: 1, level: 1, keyItem: false, unique: false },
                teamCount: d.teamCount
            };
        });

        const allMinisDefeated = miniProgress.every(x => x.defeated);
        const bossSlot = 'boss';
        const bossDefeated = readStoryFlag(user.storyFlags, bossEventDefeatFlag(eventKey, bossSlot));
        const bossBase = (bossDisplay && bossDisplay.baseId) ? baseById.get(String(bossDisplay.baseId || '')) : null;
        const boss = {
            slot: bossSlot,
            baseId: String((bossDisplay && bossDisplay.baseId) || ''),
            level: Math.max(1, parseInt(bossDisplay && bossDisplay.level, 10) || 1),
            name: (cfg.boss && cfg.boss.name && String(cfg.boss.name).trim()) ? String(cfg.boss.name).trim() : 'BOSS',
            sprite: bossBase ? (bossBase.sprite || '') : '',
            unlocked: !!allMinisDefeated,
            defeated: !!bossDefeated,
            moneyReward: Math.max(0, parseInt(cfg.boss && cfg.boss.moneyReward, 10) || 0),
            reward: (cfg.boss && cfg.boss.reward) ? cfg.boss.reward : { type: 'none', value: '', qty: 1, level: 1, keyItem: false, unique: false },
            teamCount: bossDisplay ? bossDisplay.teamCount : 0
        };

        return res.json({
            enabled,
            eventKey,
            title: String(cfg.title || 'Evento Boss'),
            trainerSkin: (cfg && cfg.trainerSkin) ? String(cfg.trainerSkin) : '',
            trainerIsCustomSkin: !!(cfg && cfg.trainerIsCustomSkin),
            miniBosses: miniProgress,
            boss
        });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

const bossEventUpload = upload.fields([{ name: 'trainerSkinFile', maxCount: 1 }]);
app.post('/lab/boss-event/save', bossEventUpload, async (req, res) => {
    try {
        const { userId } = req.body;
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.redirect('/');

        const cfg = await getOrCreateBossEventConfig();
        cfg.enabled = req.body.enabled === 'on' || req.body.enabled === true || req.body.enabled === 'true';
        cfg.eventKey = String(req.body.eventKey || cfg.eventKey || 'event1').trim() || 'event1';
        cfg.title = String(req.body.title || cfg.title || 'Evento Boss');

        // Skin do treinador do boss (mesma regra do NPC): upload => data-url + flag
        const trainerSkinSelect = String(req.body.trainerSkinSelect || '').trim();
        let trainerSkin = trainerSkinSelect;
        let trainerIsCustomSkin = false;

        if (req.files && req.files['trainerSkinFile'] && req.files['trainerSkinFile'][0]) {
            const img = req.files['trainerSkinFile'][0];
            const mime = img.mimetype || 'image/png';
            trainerSkin = `data:${mime};base64,` + img.buffer.toString('base64');
            trainerIsCustomSkin = true;
        }

        if (!trainerSkin) trainerSkin = 'char2';
        cfg.trainerSkin = trainerSkin;
        cfg.trainerIsCustomSkin = trainerIsCustomSkin;

        const parseReward = (prefix) => {
            const type = String(req.body[`${prefix}RewardType`] || 'none').trim();
            const value = String(req.body[`${prefix}RewardVal`] || '').trim();
            const qty = Math.max(1, parseInt(req.body[`${prefix}RewardQty`], 10) || 1);
            const lvl = Math.max(1, parseInt(req.body[`${prefix}RewardLevel`], 10) || 1);
            const keyItem = req.body[`${prefix}RewardKeyItem`] === 'on' || req.body[`${prefix}RewardKeyItem`] === true || req.body[`${prefix}RewardKeyItem`] === 'true';
            const unique = req.body[`${prefix}RewardUnique`] === 'on' || req.body[`${prefix}RewardUnique`] === true || req.body[`${prefix}RewardUnique`] === 'true';
            if (type !== 'item' && type !== 'entity') return { type: 'none', value: '', qty: 1, level: 1, keyItem: false, unique: false };
            return { type, value, qty, level: lvl, keyItem, unique };
        };

        const parseTeamJson = (raw) => {
            if (!raw || !String(raw).trim()) return [];
            let arr = [];
            try { arr = JSON.parse(String(raw)); } catch (_) { arr = []; }
            if (!Array.isArray(arr)) return [];
            return arr
                .map(x => ({
                    baseId: x && x.baseId ? String(x.baseId).trim() : '',
                    level: Math.max(1, parseInt(x && x.level, 10) || 1),
                    name: x && x.name ? String(x.name).trim() : ''
                }))
                .filter(x => x.baseId)
                .slice(0, 6);
        };

        const miniSlots = ['mini1', 'mini2', 'mini3'];
        cfg.miniBosses = miniSlots.map(slot => {
            const baseId = String(req.body[`${slot}BaseId`] || '').trim();
            const level = Math.max(1, parseInt(req.body[`${slot}Level`], 10) || 1);
            const name = String(req.body[`${slot}Name`] || '').trim();
            const moneyReward = Math.max(0, parseInt(req.body[`${slot}MoneyReward`], 10) || 0);
            const reward = parseReward(`${slot}`);
            const team = parseTeamJson(req.body[`${slot}TeamJson`]);
            return { slot, baseId, level, name, team, moneyReward, reward };
        });

        cfg.boss = {
            baseId: String(req.body.bossBaseId || '').trim(),
            level: Math.max(1, parseInt(req.body.bossLevel, 10) || 1),
            name: String(req.body.bossName || '').trim(),
            team: parseTeamJson(req.body.bossTeamJson),
            moneyReward: Math.max(0, parseInt(req.body.bossMoneyReward, 10) || 0),
            reward: parseReward('boss')
        };

        cfg.updatedAt = Date.now();
        await cfg.save();
        return res.redirect('/lab?userId=' + userId);
    } catch (e) {
        console.error(e);
        return res.status(500).send('Erro ao salvar evento');
    }
});

// Inicia batalha do Boss Event
app.post('/battle/boss-event', async (req, res) => {
    try {
        const { userId, slot, currentMap, currentX, currentY } = req.body;
        const [user, cfg] = await Promise.all([
            User.findById(userId),
            getOrCreateBossEventConfig()
        ]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!cfg.enabled) return res.status(400).json({ error: 'event_disabled' });
        if (!user.entityTeam || user.entityTeam.length === 0) return res.json({ error: 'Você precisa pegar seu monstro inicial com o Professor.', needStarter: true });
        const lead = user.entityTeam.find(p => p.currentHp > 0) || user.entityTeam[0];
        if (!lead || lead.currentHp <= 0) return res.json({ error: 'Seus Monstros estão desmaiados!' });

        const eventKey = String(cfg.eventKey || 'event1').trim() || 'event1';
        const s = String(slot || '').trim();
        const miniSlots = ['mini1', 'mini2', 'mini3'];
        const isBoss = (s === 'boss');
        const isMini = miniSlots.includes(s);
        if (!isBoss && !isMini) return res.status(400).json({ error: 'invalid_slot' });

        const alreadyDefeated = readStoryFlag(user.storyFlags, bossEventDefeatFlag(eventKey, s));
        if (alreadyDefeated) return res.status(400).json({ error: 'already_defeated' });

        // gating do boss principal
        if (isBoss) {
            const allMinisDefeated = miniSlots.every(ms => readStoryFlag(user.storyFlags, bossEventDefeatFlag(eventKey, ms)));
            if (!allMinisDefeated) return res.status(400).json({ error: 'boss_locked' });
        }

        const cfgMini = Array.isArray(cfg.miniBosses) ? cfg.miniBosses : [];
        const selected = isBoss
            ? (cfg.boss || null)
            : (cfgMini.find(m => String(m && m.slot) === s) || null);
        const selectedTeamRaw = (selected && Array.isArray(selected.team) && selected.team.length)
            ? selected.team
            : (selected && selected.baseId ? [{ baseId: selected.baseId, level: selected.level || 1, name: '' }] : []);

        const selectedTeam = (Array.isArray(selectedTeamRaw) ? selectedTeamRaw : [])
            .map(x => ({
                baseId: x && x.baseId ? String(x.baseId).trim() : '',
                level: Math.max(1, parseInt(x && x.level, 10) || 1),
                name: x && x.name ? String(x.name).trim() : ''
            }))
            .filter(x => x.baseId)
            .slice(0, 6);

        if (!selectedTeam.length) return res.status(400).json({ error: 'boss_not_configured' });

        const userBase = await BaseEntity.findOne({ id: lead.baseId }).lean();
        if (!userBase) return res.status(404).json({ error: 'Base do jogador não encontrada' });
        const p1 = userEntityToEntity(lead, userBase);
        p1.playerName = user.username;
        p1.skin = user.skin;

        const trainerSkin = (cfg && cfg.trainerSkin) ? String(cfg.trainerSkin).trim() : 'char2';
        const trainerIsCustomSkin = !!(cfg && cfg.trainerIsCustomSkin);
        const trainerName = (selected && selected.name && String(selected.name).trim())
            ? String(selected.name).trim()
            : (isBoss ? 'BOSS' : String(s || '').toUpperCase());

        const baseIds = Array.from(new Set(selectedTeam.map(x => x.baseId)));
        const bases = baseIds.length ? await BaseEntity.find({ id: { $in: baseIds } }).lean() : [];
        const baseById = new Map((bases || []).map(b => [String(b.id), b]));

        const npcReserve = [];
        for (let i = 0; i < selectedTeam.length; i++) {
            const member = selectedTeam[i];
            const b = baseById.get(String(member.baseId));
            if (!b) continue;
            const level = Math.max(1, parseInt(member.level, 10) || 1);
            const stats = calculateStats(b.baseStats, level);
            const moves = pickDeterministicMovesFromPool(b.movePool, level, 4, b.type);
            const monName = (member.name && String(member.name).trim()) ? String(member.name).trim() : b.name;
            npcReserve.push({
                instanceId: `boss_${s}_${i}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                baseId: b.id,
                name: monName,
                type: b.type,
                level,
                maxHp: stats.hp,
                hp: stats.hp,
                maxEnergy: ENERGY_CONFIG.maxEnergy,
                energy: ENERGY_CONFIG.maxEnergy,
                stats,
                moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m && m.id),
                sprite: b.sprite,
                playerName: trainerName,
                skin: trainerSkin || 'char2',
                isCustomSkin: trainerIsCustomSkin,
                isWild: false,
                status: null,
                defending: false
            });
        }

        if (!npcReserve.length) return res.status(404).json({ error: 'Base do boss não encontrada' });
        const p2 = npcReserve[0];

        // Background por mapa
        let mapName = 'city';
        if (currentMap) {
            if (String(currentMap).includes('map=')) {
                const match = String(currentMap).match(/map=([^&]+)/);
                if (match && match[1]) mapName = match[1];
            } else if (currentMap !== 'city' && !String(currentMap).includes('?')) {
                mapName = currentMap;
            }
        }
        const mapDoc = await GameMap.findOne({ mapId: mapName }).lean();
        let finalBg = 'battle_bg.png';
        if (mapDoc && mapDoc.battleBackground) finalBg = mapDoc.battleBackground;
        const battleBgPosX = (mapDoc && Number.isFinite(mapDoc.battleBgPosX)) ? mapDoc.battleBgPosX : 50;
        const battleBgPosY = (mapDoc && Number.isFinite(mapDoc.battleBgPosY)) ? mapDoc.battleBgPosY : 50;
        const battleBgZoom = (mapDoc && Number.isFinite(mapDoc.battleBgZoom)) ? mapDoc.battleBgZoom : 100;

        let returnMapUrl = currentMap || 'city';
        if (mapName !== 'city' && mapName !== 'forest' && currentMap && !String(currentMap).includes('map=')) {
            returnMapUrl = `city?map=${mapName}`;
        }

        const battleId = `boss_event_${s}_${Date.now()}`;
        activeBattles[battleId] = {
            p1,
            p2,
            npcReserve,
            type: 'boss_event',
            userId: user._id,
            turn: 1,
            mode: 'manual',
            returnMap: returnMapUrl,
            returnX: currentX || 50,
            returnY: currentY || 50,
            customBackground: finalBg,
            bgPosX: battleBgPosX,
            bgPosY: battleBgPosY,
            bgZoom: battleBgZoom,
            mapId: mapName,
            bossEventMeta: {
                eventKey,
                slot: s,
                moneyReward: Math.max(0, parseInt(selected && selected.moneyReward, 10) || 0),
                reward: selected && selected.reward ? selected.reward : { type: 'none' }
            }
        };
        return res.json({ battleId });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// Inicia uma RAID do Boss Event (mini1 -> mini2 -> mini3 -> boss), sem cura entre lutas e com recompensa por mini.
app.post('/battle/boss-raid', async (req, res) => {
    try {
        const { userId, currentMap, currentX, currentY, startSlot } = req.body;
        const [user, cfg] = await Promise.all([
            User.findById(userId),
            getOrCreateBossEventConfig()
        ]);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (!cfg.enabled) return res.status(400).json({ error: 'event_disabled' });
        if (!user.entityTeam || user.entityTeam.length === 0) return res.json({ error: 'Você precisa pegar seu monstro inicial com o Professor.', needStarter: true });
        const lead = user.entityTeam.find(p => p.currentHp > 0) || user.entityTeam[0];
        if (!lead || lead.currentHp <= 0) return res.json({ error: 'Seus Monstros estão desmaiados!' });

        const eventKey = String(cfg.eventKey || 'event1').trim() || 'event1';
        const order = ['mini1', 'mini2', 'mini3', 'boss'];
        const desiredStart = startSlot ? String(startSlot).trim() : '';

        const cfgMini = Array.isArray(cfg.miniBosses) ? cfg.miniBosses : [];
        const bySlot = new Map();
        for (const s of order) {
            if (s === 'boss') bySlot.set('boss', cfg.boss || null);
            else bySlot.set(s, cfgMini.find(m => String(m && m.slot) === s) || null);
        }

        // Monta fila de slots ainda não derrotados (inclui boss no final se não derrotado)
        const queue = [];
        for (const s of order) {
            const defeated = readStoryFlag(user.storyFlags, bossEventDefeatFlag(eventKey, s));
            if (defeated) continue;
            const selected = bySlot.get(s);
            const teamRaw = (selected && Array.isArray(selected.team) && selected.team.length)
                ? selected.team
                : (selected && selected.baseId ? [{ baseId: selected.baseId, level: selected.level || 1, name: '' }] : []);
            const team = (Array.isArray(teamRaw) ? teamRaw : [])
                .map(x => ({
                    baseId: x && x.baseId ? String(x.baseId).trim() : '',
                    level: Math.max(1, parseInt(x && x.level, 10) || 1),
                    name: x && x.name ? String(x.name).trim() : ''
                }))
                .filter(x => x.baseId)
                .slice(0, 6);
            if (!team.length) continue;
            queue.push({
                slot: s,
                name: (selected && selected.name) ? String(selected.name).trim() : '',
                team,
                moneyReward: Math.max(0, parseInt(selected && selected.moneyReward, 10) || 0),
                reward: selected && selected.reward ? selected.reward : { type: 'none' }
            });
        }
        if (!queue.length) return res.status(400).json({ error: 'already_defeated' });

        // Se quiser começar em um slot específico, reposiciona a fila (mas mantém ordem)
        let startIndex = 0;
        if (desiredStart) {
            const idx = queue.findIndex(q => String(q.slot) === desiredStart);
            if (idx >= 0) startIndex = idx;
        }

        const startStage = queue[startIndex];
        if (!startStage) return res.status(400).json({ error: 'boss_not_configured' });

        const userBase = await BaseEntity.findOne({ id: lead.baseId }).lean();
        if (!userBase) return res.status(404).json({ error: 'Base do jogador não encontrada' });
        const p1 = userEntityToEntity(lead, userBase);
        p1.playerName = user.username;
        p1.skin = user.skin;

        const trainerSkin = (cfg && cfg.trainerSkin) ? String(cfg.trainerSkin).trim() : 'char2';
        const trainerIsCustomSkin = !!(cfg && cfg.trainerIsCustomSkin);
        const trainerName = String(startStage.name || startStage.slot || '').trim() || String(startStage.slot).toUpperCase();

        const baseIds = Array.from(new Set(startStage.team.map(x => x.baseId)));
        const bases = baseIds.length ? await BaseEntity.find({ id: { $in: baseIds } }).lean() : [];
        const baseById = new Map((bases || []).map(b => [String(b.id), b]));

        const npcReserve = [];
        for (let i = 0; i < startStage.team.length; i++) {
            const member = startStage.team[i];
            const b = baseById.get(String(member.baseId));
            if (!b) continue;
            const level = Math.max(1, parseInt(member.level, 10) || 1);
            const stats = calculateStats(b.baseStats, level);
            const pickedIds = pickDeterministicMovesFromPool(b.movePool, level, 4, b.type);
            const moveObjs = (pickedIds || []).map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m && m.id);
            const moves = moveObjs.length
                ? moveObjs
                : (MOVES_LIBRARY.rapid_punch ? [{ ...MOVES_LIBRARY.rapid_punch, id: 'rapid_punch' }]
                    : MOVES_LIBRARY.wing_slice ? [{ ...MOVES_LIBRARY.wing_slice, id: 'wing_slice' }]
                        : MOVES_LIBRARY.rest ? [{ ...MOVES_LIBRARY.rest, id: 'rest' }]
                            : []);

            const monName = (member.name && String(member.name).trim()) ? String(member.name).trim() : b.name;
            npcReserve.push({
                instanceId: `boss_raid_${startStage.slot}_${i}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                baseId: b.id,
                name: monName,
                type: b.type,
                level,
                maxHp: stats.hp,
                hp: stats.hp,
                maxEnergy: ENERGY_CONFIG.maxEnergy,
                energy: ENERGY_CONFIG.maxEnergy,
                stats,
                moves,
                sprite: b.sprite,
                playerName: trainerName,
                skin: trainerSkin || 'char2',
                isCustomSkin: trainerIsCustomSkin,
                isWild: false,
                status: null,
                defending: false
            });
        }
        if (!npcReserve.length) return res.status(404).json({ error: 'Base do boss não encontrada' });

        // Background por mapa (reusa lógica do boss-event)
        let mapName = 'city';
        if (currentMap) {
            if (String(currentMap).includes('map=')) {
                const match = String(currentMap).match(/map=([^&]+)/);
                if (match && match[1]) mapName = match[1];
            } else if (currentMap !== 'city' && !String(currentMap).includes('?')) {
                mapName = currentMap;
            }
        }
        const mapDoc = await GameMap.findOne({ mapId: mapName }).lean();
        let finalBg = 'battle_bg.png';
        if (mapDoc && mapDoc.battleBackground) finalBg = mapDoc.battleBackground;
        const battleBgPosX = (mapDoc && Number.isFinite(mapDoc.battleBgPosX)) ? mapDoc.battleBgPosX : 50;
        const battleBgPosY = (mapDoc && Number.isFinite(mapDoc.battleBgPosY)) ? mapDoc.battleBgPosY : 50;
        const battleBgZoom = (mapDoc && Number.isFinite(mapDoc.battleBgZoom)) ? mapDoc.battleBgZoom : 100;

        let returnMapUrl = currentMap || 'city';
        if (mapName !== 'city' && mapName !== 'forest' && currentMap && !String(currentMap).includes('map=')) {
            returnMapUrl = `city?map=${mapName}`;
        }

        const battleId = `boss_raid_${Date.now()}`;
        activeBattles[battleId] = {
            p1,
            p2: npcReserve[0],
            npcReserve,
            type: 'boss_event_raid',
            userId: user._id,
            turn: 1,
            mode: 'manual',
            returnMap: returnMapUrl,
            returnX: currentX || 50,
            returnY: currentY || 50,
            customBackground: finalBg,
            bgPosX: battleBgPosX,
            bgPosY: battleBgPosY,
            bgZoom: battleBgZoom,
            mapId: mapName,
            raidQueue: queue,
            raidIndex: startIndex,
            raidTrainerSkin: trainerSkin || 'char2',
            raidTrainerIsCustomSkin: trainerIsCustomSkin,
            bossEventMeta: {
                eventKey,
                slot: String(startStage.slot),
                moneyReward: Math.max(0, parseInt(startStage.moneyReward, 10) || 0),
                reward: startStage.reward ? startStage.reward : { type: 'none' }
            }
        };
        return res.json({ battleId });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

app.post('/lab/skins/create', skinUpload.single('skinFile'), async (req, res) => {
    try {
        const { userId, name, skinId } = req.body;
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.redirect('/');

        const cleanName = String(name || '').trim();
        if (!cleanName) return res.status(400).send('Nome inválido');
        const id = String(skinId || '').trim();

        if (id) {
            const existing = await PlayerSkin.findById(id);
            if (!existing) return res.status(404).send('Skin não encontrada');
            existing.name = cleanName;
            if (req.file && req.file.buffer) {
                if (!isPngBuffer(req.file.buffer)) return res.status(415).send('Arquivo deve ser PNG');
                existing.pngBase64 = req.file.buffer.toString('base64');
            }
            existing.updatedAt = Date.now();
            await existing.save();
        } else {
            if (!req.file || !req.file.buffer) return res.status(400).send('Arquivo PNG obrigatório');
            if (!isPngBuffer(req.file.buffer)) return res.status(415).send('Arquivo deve ser PNG');
            const pngBase64 = req.file.buffer.toString('base64');
            await PlayerSkin.create({ name: cleanName, pngBase64, createdAt: Date.now(), updatedAt: Date.now() });
        }
        return res.redirect('/lab?userId=' + userId);
    } catch (e) {
        return res.status(400).send('Erro ao salvar skin (nome duplicado?)');
    }
});

app.post('/lab/skins/delete', async (req, res) => {
    try {
        const { userId, id } = req.body;
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.redirect('/');
        await PlayerSkin.deleteOne({ _id: id });
        return res.redirect('/lab?userId=' + userId);
    } catch (e) {
        return res.status(500).send('Erro ao excluir skin');
    }
});
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
            interactRange,
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
            interactBoxPrice,
            interactBoxRewardsJson,
            interactBoxDialogue,
            interactBoxResultDialogue,

            conditionalDialoguesJson,

            userId,
            battleBg
        } = req.body; 
        const prevNpc = npcId ? await NPC.findById(npcId).lean() : null;
        let finalSkin = skinSelect, isCustom = false; 
        if (req.files['npcSkinFile']) { finalSkin = `data:${req.files['npcSkinFile'][0].mimetype};base64,${req.files['npcSkinFile'][0].buffer.toString('base64')}`; isCustom = true; } 
        else if (prevNpc && !skinSelect) { finalSkin = prevNpc.skin; isCustom = prevNpc.isCustomSkin; } 
        let finalBattleBg = 'battle_bg.png';
        if (req.files['battleBgFile']) { finalBattleBg = `data:${req.files['battleBgFile'][0].mimetype};base64,${req.files['battleBgFile'][0].buffer.toString('base64')}`; }
        else if (prevNpc && prevNpc.battleBackground) { finalBattleBg = prevNpc.battleBackground; }
        let team = []; try { team = JSON.parse(teamJson); } catch (e) {} 
        const reward = {
            type: rewardType || 'none',
            value: rewardVal || '',
            qty: parseInt(rewardQty) || 1,
            level: (rewardType === 'entity') ? (parseInt(rewardQty) || 1) : 1,
            keyItem: rewardKeyItem === 'on' || rewardKeyItem === true || rewardKeyItem === 'true',
            unique: rewardUnique === 'on' || rewardUnique === true || rewardUnique === 'true'
        }; 

        const interact = {
            enabled: interactEnabled === 'on' || interactEnabled === true || interactEnabled === 'true',

            // 0 = usa o padrão do client
            range: Math.max(0, parseFloat(interactRange) || 0),

            serviceType: (interactServiceType || '').trim(),
            healDialogue: interactHealDialogue || '',
            boxDialogue: interactBoxDialogue || '',
            boxResultDialogue: interactBoxResultDialogue || '',
            shopItems: (() => {
                if (!interactShopItemsJson) return [];
                try {
                    return normalizeShopItems(JSON.parse(interactShopItemsJson));
                } catch (_) {
                    return [];
                }
            })(),

            box: (() => {
                // Se não veio nada do form, tenta manter o valor anterior no update.
                const prevBox = (prevNpc && prevNpc.interact && prevNpc.interact.box) ? prevNpc.interact.box : null;

                const priceRaw = (interactBoxPrice != null && String(interactBoxPrice).trim() !== '')
                    ? parseInt(interactBoxPrice, 10)
                    : (prevBox && prevBox.price != null ? prevBox.price : 0);
                const price = Math.max(0, Number.isFinite(priceRaw) ? priceRaw : 0);

                let rewards = [];
                const jsonRaw = (interactBoxRewardsJson != null) ? String(interactBoxRewardsJson) : '';
                if (jsonRaw && jsonRaw.trim()) {
                    try {
                        const arr = JSON.parse(jsonRaw);
                        if (Array.isArray(arr)) {
                            rewards = arr
                                .map(r => ({
                                    baseId: r && r.baseId ? String(r.baseId).trim() : '',
                                    weight: Math.max(0, parseFloat(r && r.weight) || 0),
                                    minLevel: Math.max(1, parseInt(r && r.minLevel, 10) || 1),
                                    maxLevel: Math.max(1, parseInt(r && r.maxLevel, 10) || 1)
                                }))
                                .filter(r => r.baseId && r.weight > 0)
                                .map(r => ({ ...r, maxLevel: Math.max(r.minLevel, r.maxLevel) }));
                        }
                    } catch (_) {
                        rewards = [];
                    }
                } else if (prevBox && Array.isArray(prevBox.rewards)) {
                    // fallback no update
                    rewards = prevBox.rewards;
                }

                return { price, rewards };
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

        // Compat: processa diálogos condicionais enviados pelo formulário do Lab
        const conditionalDialogues = (() => {
            if (!conditionalDialoguesJson) return [];
            try {
                const arr = JSON.parse(conditionalDialoguesJson);
                if (!Array.isArray(arr)) return [];
                return arr
                    .map(x => ({
                        flagId: String((x && x.flagId) || '').trim(),
                        dialogue: (x && x.dialogue) ? String(x.dialogue) : '',
                        winDialogue: (x && x.winDialogue) ? String(x.winDialogue) : '',
                        cooldownDialogue: (x && x.cooldownDialogue) ? String(x.cooldownDialogue) : '',
                        priority: Number.isFinite(x && x.priority) ? x.priority : (parseInt(x && x.priority, 10) || 0)
                    }))
                    .filter(x => x.flagId);
            } catch (_) {
                return [];
            }
        })();

        // Processa diálogos condicionais com fallback ao valor anterior
        const conditionalDialoguesParsed = (() => {
            const prevList = Array.isArray(prevNpc && prevNpc.conditionalDialogues) ? prevNpc.conditionalDialogues : [];
            if (!conditionalDialoguesJson || !String(conditionalDialoguesJson).trim()) return prevList;
            try {
                const arr = JSON.parse(conditionalDialoguesJson);
                if (!Array.isArray(arr)) return prevList;
                return arr
                    .map(x => ({
                        flagId: String((x && x.flagId) || '').trim(),
                        dialogue: (x && x.dialogue) ? String(x.dialogue) : '',
                        winDialogue: (x && x.winDialogue) ? String(x.winDialogue) : '',
                        cooldownDialogue: (x && x.cooldownDialogue) ? String(x.cooldownDialogue) : '',
                        priority: Number.isFinite(x && x.priority) ? x.priority : (parseInt(x && x.priority, 10) || 0)
                    }))
                    .filter(x => x.flagId);
            } catch (_) {
                return prevList;
            }
        })();

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
                                y: Math.max(0, Math.min(100, parseFloat(p && p.y))),
                                waitMs: Math.max(0, parseInt(p && p.waitMs, 10) || 0),
                                map: p && p.map ? String(p.map) : (map || (prevNpc && prevNpc.map) || ''),
                                viaPortalId: p && p.viaPortalId ? String(p.viaPortalId) : ''
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
                        y: Math.max(0, Math.min(100, parseFloat(p && p.y))),
                        waitMs: Math.max(0, parseInt(p && p.waitMs, 10) || 0),
                        map: p && p.map ? String(p.map) : (map || (prevNpc && prevNpc.map) || ''),
                        viaPortalId: p && p.viaPortalId ? String(p.viaPortalId) : ''
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
            conditionalDialogues: conditionalDialoguesParsed,
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
    // Pausa: mantém posição e direção, não avança tempo de rota
    if (npc && npc._pauseUntil && nowMs < npc._pauseUntil) {
        return {
            x: (typeof npc.x === 'number') ? npc.x : parseFloat(npc.x) || 0,
            y: (typeof npc.y === 'number') ? npc.y : parseFloat(npc.y) || 0,
            direction: npc._faceDirection || npc.direction || 'down',
            map: npc.map
        };
    }

    const p = npc && npc.patrol;
    if (!p || !p.enabled) return null;
    const mode = (p.mode || '').trim();
    const speed = Math.max(0.1, parseFloat(p.speed) || 6); // units/s
    const phase = parseInt(p.phaseOffsetMs, 10) || 0;
    const pausedAccum = Number.isFinite(npc && npc._pauseAccumMs) ? npc._pauseAccumMs : 0;
    const tNow = (nowMs - pausedAccum) + phase;

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
        const pts = Array.isArray(p.path && p.path.points) ? p.path.points : [];
        if (pts.length < 2) return null;

        const defaultMap = npc && npc.map ? String(npc.map) : '';
        const normPt = (pt) => ({
            x: Number.isFinite(pt && pt.x) ? pt.x : parseFloat(pt && pt.x) || 0,
            y: Number.isFinite(pt && pt.y) ? pt.y : parseFloat(pt && pt.y) || 0,
            waitMs: Math.max(0, parseInt(pt && pt.waitMs, 10) || 0),
            map: pt && pt.map ? String(pt.map) : defaultMap,
            viaPortalId: pt && pt.viaPortalId ? String(pt.viaPortalId) : ''
        });
        const points = pts.map(normPt);

        const loop = !!(p.path && p.path.loop);
        const phases = []; // [{durMs, type:'move'|'wait'|'teleport', map, ...}]

        const addPhase = (from, to) => {
            const sameMap = String(from.map || '') === String(to.map || '');
            const needsTeleport = !sameMap || !!to.viaPortalId;
            const dx = to.x - from.x;
            const dy = to.y - from.y;
            const dir = computeDirectionFromDelta(dx || 1, dy || 0);

            if (needsTeleport) {
                phases.push({ type: 'teleport', durMs: 0, from, to, map: to.map, dir });
            } else {
                const len = Math.hypot(dx, dy);
                if (len > 0.0001) {
                    const durMs = (len / speed) * 1000;
                    phases.push({ type: 'move', durMs, from, to, dx, dy, map: from.map, dir: computeDirectionFromDelta(dx, dy) });
                }
            }

            if (to.waitMs > 0) {
                phases.push({ type: 'wait', durMs: to.waitMs, at: to, map: to.map, dir });
            }
        };

        for (let i = 0; i < points.length - 1; i++) addPhase(points[i], points[i + 1]);
        if (loop) addPhase(points[points.length - 1], points[0]);

        // Se não houver fases (pontos iguais), aborta
        const totalMs = phases.reduce((s, ph) => s + (ph.durMs || 0), 0);
        if (!Number.isFinite(totalMs) || totalMs <= 0) return null;

        const posInPeriod = ((tNow % totalMs) + totalMs) % totalMs;
        let accMs = 0;
        let lastDir = points.length >= 2 ? computeDirectionFromDelta(points[1].x - points[0].x, points[1].y - points[0].y) : 'down';
        let lastMap = points[0].map || defaultMap;

        for (const ph of phases) {
            const nextAcc = accMs + (ph.durMs || 0);
            if (posInPeriod <= nextAcc + 1e-6) {
                if (ph.type === 'wait') {
                    return { x: ph.at.x, y: ph.at.y, direction: ph.dir || lastDir, map: ph.map || lastMap };
                }
                if (ph.type === 'teleport') {
                    return { x: ph.to.x, y: ph.to.y, direction: ph.dir || lastDir, map: ph.map || ph.to.map || lastMap };
                }
                // move phase
                const tRel = (posInPeriod - accMs) / (ph.durMs || 1);
                const x = ph.from.x + ph.dx * tRel;
                const y = ph.from.y + ph.dy * tRel;
                return { x, y, direction: ph.dir || lastDir, map: ph.map || lastMap };
            }
            accMs = nextAcc;
            if (ph.dir) lastDir = ph.dir;
            if (ph.map) lastMap = ph.map;
        }

        // fallback: final ponto
        const lastPt = points[points.length - 1];
        return { x: lastPt.x, y: lastPt.y, direction: lastDir, map: lastPt.map || defaultMap };
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
            const movers = [];
            const updated = list.map(n => {
                const pos = computeNpcPatrolPosition(n, now);
                if (!pos) return n;
                hasPatrol = true;
                const nextMap = pos.map || n.map;
                if (nextMap && nextMap !== n.map) {
                    // marca para mover de mapa
                    movers.push({ from: mapId, to: nextMap, npc: { ...n, x: pos.x, y: pos.y, direction: pos.direction, map: nextMap } });
                    return null; // será removido deste mapa
                }
                return { ...n, x: pos.x, y: pos.y, direction: pos.direction };
            }).filter(Boolean);

            if (movers.length) {
                // remove movidos deste mapa
                npcCacheByMap[mapId] = updated;
                // adiciona nos caches de destino
                for (const m of movers) {
                    if (!npcCacheByMap[m.to]) npcCacheByMap[m.to] = [];
                    npcCacheByMap[m.to].push(m.npc);
                }
            } else {
                npcCacheByMap[mapId] = updated;
            }

            if (hasPatrol) {
                io.to(mapId).emit('npcs_list', npcCacheByMap[mapId]);
            }
        }

        // Emite updates também para mapas de destino de movers que já estavam ativos
        const moverTargets = Object.keys(npcCacheByMap).filter(mid => activeMaps.includes(mid));
        for (const mid of moverTargets) {
            io.to(mid).emit('npcs_list', npcCacheByMap[mid]);
        }
    } catch (e) {
        console.error('NPC patrol tick error', e);
    }
}, NPC_PATROL_TICK_MS);
app.post('/lab/create', upload.single('sprite'), async (req, res) => {
    const { name, type, hp, energy, atk, def, spd, location, minLvl, maxLvl, catchRate, spawnChance, isStarter, movesJson, evoTarget, evoLevel, existingId, dexOrder } = req.body;
    const stats = { hp: parseInt(hp), energy: parseInt(energy), attack: parseInt(atk), defense: parseInt(def), speed: parseInt(spd) };
    let movePool = [];
    try { movePool = JSON.parse(movesJson); } catch(e){}

    const dexPos = parseInt(dexOrder, 10);
    const data = {
        name,
        type,
        baseStats: stats,
        spawnLocation: location,
        minSpawnLevel: parseInt(minLvl),
        maxSpawnLevel: parseInt(maxLvl),
        catchRate: parseFloat(catchRate),
        spawnChance: parseFloat(spawnChance) || 10,
        isStarter: isStarter === 'on',
        evolution: { targetId: evoTarget, level: parseInt(evoLevel) || 100 },
        movePool: movePool,
        dexOrder: dexPos
    };

    const validation = validateEntityDefinition(data);
    if (!validation.ok) {
        return res.status(400).send('Erro ao salvar entidade: ' + validation.errors.join(' | '));
    }

    data.type = validation.normalized.type;
    data.baseStats = validation.normalized.baseStats;
    data.movePool = validation.normalized.movePool;

    if (!Number.isFinite(dexPos)) delete data.dexOrder;
    if (req.file) data.sprite = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

    if (existingId) {
        const clean = String(existingId).trim();
        const updated = await BaseEntity.findOneAndUpdate({ id: clean }, data);
        if (!updated && mongoose.isValidObjectId(clean)) {
            await BaseEntity.findByIdAndUpdate(clean, data);
        }
    } else {
        data.id = Date.now().toString();
        await new BaseEntity(data).save();
    }

    res.redirect(req.header('Referer') || '/');
});
app.post('/lab/delete', async (req, res) => { try { const { id } = req.body; if (id) await BaseEntity.deleteOne({ id }); res.redirect(req.get('referer')); } catch (e) { res.send('Erro ao excluir: ' + e.message); } });
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
            const base = await BaseEntity.findOne({ id: p.baseId });
            if (!base) continue;
            const ent = userEntityToEntity(p, base);
            if (ent) output.push(ent);
        }
        return output;
    };

    const pcList = Array.isArray(user.pc) ? user.pc : [];
    const team = await formatList(user.entityTeam);
    const pc = await formatList(pcList);
    res.json({ team, pc });
});
app.post('/api/pc/move', async (req, res) => {
    const { userId, entityId, from, to } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.json({ error: 'Usuário não encontrado.' });
    if (!user.pc) user.pc = [];
    if (!user.entityTeam) user.entityTeam = [];

    const sourceList = from === 'team' ? user.entityTeam : user.pc;
    const destList = to === 'team' ? user.entityTeam : user.pc;
    if (from === to) return res.json({ success: true });
    if (to === 'team' && destList.length >= 6) return res.json({ error: 'Sua equipe já tem 6 Monstros!' });
    if (from === 'team' && sourceList.length <= 1) return res.json({ error: 'Você não pode ficar sem Monstros na equipe!' });

    const index = sourceList.findIndex(p => {
        if (!p) return false;
        const pid = (p._id && typeof p._id.toString === 'function') ? p._id.toString() : (p.instanceId ? String(p.instanceId) : '');
        return pid === entityId;
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
    const baseIds = Array.from(new Set((user.entityTeam || []).map(p => String(p && p.baseId || '').trim()).filter(Boolean)));
    const baseDocs = await BaseEntity.find({ id: { $in: baseIds } }).lean();
    const baseById = new Map(baseDocs.map(base => [String(base.id), base]));

    for(let p of (user.entityTeam || [])) {
        const base = baseById.get(String(p.baseId || '').trim()) || null;
        const nextXp = getXpForNextLevel(p.level);
        const allLearned = p.learnedMoves && p.learnedMoves.length > 0 ? p.learnedMoves : p.moves;
        const evolution = await getEntityEvolutionPreview(p.baseId, p.level);
        teamWithSprites.push({
            instanceId: p._id,
            name: p.nickname,
            level: p.level,
            hp: p.currentHp,
            maxHp: p.stats.hp,
            xp: p.xp,
            xpToNext: nextXp,
            evolution,
            sprite: base ? base.sprite : '',
            moves: p.moves,
            learnedMoves: allLearned
        });
    }

    res.json({
        team: teamWithSprites,
        allMoves: MOVES_LIBRARY,
        money: user.money || 0,
        pokeballs: (user.bag && user.bag.captureCube) || user.pokeballs || 0,
        rareCandy: (user.bag && user.bag.levelUpCrystal) || user.rareCandy || 0,
        bag: user.bag,
        keyItems: user.keyItems,
        storyFlags: user.storyFlags,
        defeatedNPCs: Array.isArray(user.defeatedNPCs) ? user.defeatedNPCs.map(d => String(d && d.npcId ? d.npcId : d)) : [],
        followingEntityId: user.followingEntityId || ''
    });
});

app.post('/api/following', async (req, res) => {
    try {
        const { userId, instanceId } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatorio' });
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ success: false, error: 'user_not_found' });

        const nextId = instanceId ? String(instanceId) : '';
        if (nextId) {
            const exists = (user.entityTeam || []).some(p => String(p._id || p.instanceId) === nextId);
            if (!exists) return res.status(400).json({ success: false, error: 'invalid_instance' });
            user.followingEntityId = nextId;
        } else {
            user.followingEntityId = '';
        }

        await user.save();

        try {
            const followerInfo = await buildFollowerInfo(user);
            const entry = Object.entries(players).find(([_, p]) => p && p.userId && String(p.userId) === String(userId));
            if (entry) {
                const [sid, p] = entry;
                p.followingEntityId = followerInfo.followingEntityId || '';
                p.followerSprite = followerInfo.sprite || '';
                p.followerName = followerInfo.name || '';
                if (p.map) {
                    io.to(p.map).emit('player_following_updated', {
                        id: sid,
                        userId: String(userId),
                        followingEntityId: p.followingEntityId,
                        followerSprite: p.followerSprite,
                        followerName: p.followerName
                    });
                }
            }
        } catch (_) {}

        return res.json({ success: true, followingEntityId: user.followingEntityId || '' });
    } catch (e) {
        return res.status(500).json({ success: false, error: 'erro_interno' });
    }
});

app.get('/api/rank', async (req, res) => {
    try {
        const list = await User.find({ pvpPoints: { $gt: 0 } })
            .sort({ pvpPoints: -1, pvpWins: -1, username: 1 })
            .limit(200)
            .select('username pvpPoints pvpWins pvpLosses')
            .lean();
        res.json({ success: true, list: list || [] });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao carregar rank.' });
    }
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
        const price = (() => {
            const raw = item && item.price;
            if (Number.isFinite(raw)) return Math.max(0, raw);
            const n = parseInt(raw, 10);
            return Number.isFinite(n) ? Math.max(0, n) : 0;
        })();

        const existing = await ItemDefinition.findOne({ id });
        if (!existing) {
            await ItemDefinition.create({ id, name, type, price, iconPngBase64: '', updatedAt: Date.now() });
        } else {
            existing.name = name;
            existing.type = type;
            existing.price = price;
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
        await recordDevLog(admin._id, 'inventory_grant', { targetUserId: user._id, itemId: id, qty: amount });
        res.json({ success: true, bag: user.bag, keyItems: user.keyItems });
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
        await recordDevLog(admin._id, 'inventory_revoke', { targetUserId: user._id, itemId: id, qty: amount });
        res.json({ success: true, bag: user.bag, keyItems: user.keyItems });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao remover item.' });
    }
});

// Dev/Admin: ajustar dinheiro do jogador
app.post('/api/dev/money', async (req, res) => {
    try {
        const { userId, targetUserId, delta, set } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatorio' });
        const admin = await User.findById(userId);
        if (!admin || !admin.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissao' });

        const tgtId = String(targetUserId || userId).trim();
        const user = await User.findById(tgtId);
        if (!user) return res.status(404).json({ success: false, error: 'Usuario alvo nao encontrado' });

        let newMoney = user.money || 0;
        if (set !== undefined && set !== null && set !== '') {
            const val = parseInt(set, 10);
            newMoney = Number.isFinite(val) ? Math.max(0, val) : newMoney;
        } else {
            const d = parseInt(delta, 10);
            newMoney = Number.isFinite(d) ? Math.max(0, newMoney + d) : newMoney;
        }

        user.money = newMoney;
        await user.save();
        await recordDevLog(admin._id, 'money_update', { targetUserId: user._id, money: newMoney });
        res.json({ success: true, money: user.money });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao atualizar dinheiro.' });
    }
});

// Dev/Admin: settings
app.get('/api/dev/settings', async (req, res) => {
    try {
        const { userId } = req.query || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatorio' });
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissao' });
        const settings = await getOrCreateDevSettings(user._id);
        res.json({ success: true, settings });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao carregar settings.' });
    }
});

app.post('/api/dev/settings', async (req, res) => {
    try {
        const { userId, settings } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatorio' });
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissao' });

        const allowed = ['devMode', 'panelOpen', 'showDebugHud'];
        const patch = {};
        allowed.forEach(k => {
            if (settings && Object.prototype.hasOwnProperty.call(settings, k)) {
                patch[k] = !!settings[k];
            }
        });
        patch.updatedAt = Date.now();

        const doc = await DevSettings.findOneAndUpdate(
            { userId: user._id },
            { $set: patch },
            { new: true, upsert: true }
        );
        await recordDevLog(user._id, 'settings_update', patch);
        res.json({ success: true, settings: doc });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao salvar settings.' });
    }
});

// Dev/Admin: logs
app.get('/api/dev/logs', async (req, res) => {
    try {
        const { userId, targetUserId, limit } = req.query || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatorio' });
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissao' });

        const tgtId = targetUserId ? String(targetUserId).trim() : String(user._id);
        const lim = Math.min(200, Math.max(10, parseInt(limit, 10) || 50));
        const logs = await DevLog.find({ userId: tgtId }).sort({ createdAt: -1 }).limit(lim).lean();
        res.json({ success: true, logs });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao carregar logs.' });
    }
});

app.post('/api/dev/logs/clear', async (req, res) => {
    try {
        const { userId, targetUserId } = req.body || {};
        if (!userId) return res.status(400).json({ success: false, error: 'userId obrigatorio' });
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ success: false, error: 'Sem permissao' });

        const tgtId = targetUserId ? String(targetUserId).trim() : String(user._id);
        await DevLog.deleteMany({ userId: tgtId });
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: 'Erro ao limpar logs.' });
    }
});
app.post('/api/heal', async (req, res) => {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    // Busca todas as bases de uma vez para evitar N+1 queries
    const baseIds = [...new Set(user.entityTeam.map(p => p.baseId).filter(Boolean))];
    const bases = await BaseEntity.find({ id: { $in: baseIds } }).lean();
    const baseMap = new Map(bases.map(b => [b.id, b]));

    let count = 0;
    for (let p of user.entityTeam) {
        const base = baseMap.get(p.baseId);
        if (base) {
            p.stats = calculateStats(base.baseStats, p.level);
            p.currentHp = p.stats.hp;
            count++;
        }
    }

    await user.save();
    res.json({ success: true, message: `${count} Monstros curados!` });
});
app.post('/api/equip-move', async (req, res) => { const { userId, entityId, moves } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const poke = user.entityTeam.id(entityId); if(!poke) return res.json({error: "Entity not found"}); if(moves.length < 1 || moves.length > 4) return res.json({error: "Deve ter entre 1 e 4 ataques."}); poke.moves = moves; await user.save(); res.json({success: true}); });
app.post('/api/set-lead', async (req, res) => { const { userId, entityId } = req.body; const user = await User.findById(userId); if(!user) return res.json({error: "User not found"}); const index = user.entityTeam.findIndex(p => p._id.toString() === entityId); if (index > 0) { const poke = user.entityTeam.splice(index, 1)[0]; user.entityTeam.unshift(poke); await user.save(); res.json({success: true}); } else { res.json({success: true}); } });
app.post('/api/abandon-entity', async (req, res) => { const { userId, entityId } = req.body; const user = await User.findById(userId); if(!user) return res.json({ error: 'User not found' }); if(user.entityTeam.length <= 1) return res.json({ error: 'Não pode abandonar o último monstro.' }); const index = user.entityTeam.findIndex(p => p._id.toString() === entityId); if(index === -1) return res.json({ error: 'Entity not found' }); user.entityTeam.splice(index, 1); await user.save(); res.json({ success: true }); });
app.post('/api/buy-item', async (req, res) => {
    const { userId, itemId, qty } = req.body;
    const q = Math.max(1, parseInt(qty) || 1);
    const normalizedId = String(itemId || '').trim();
    const itemDef = getItemDefFromCache(normalizedId);
    if (!itemDef || itemDef.type === 'key' || !Number.isFinite(itemDef.price) || itemDef.price <= 0) {
        return res.json({ error: 'Item inválido' });
    }

    const cost = itemDef.price * q;
    const purchase = await purchaseCatalogItemForUser({ userId, itemId: normalizedId, qty: q, totalCost: cost });
    if (!purchase.ok) return res.status(400).json({ error: purchase.error || 'Falha ao adicionar item' });

    const user = purchase.user;
    res.json({
        success: true,
        money: user.money,
        pokeballs: (user.bag && user.bag.captureCube) || user.pokeballs || 0,
        rareCandy: (user.bag && user.bag.levelUpCrystal) || user.rareCandy || 0,
        bag: user.bag
    });
});
app.post('/api/use-item', async (req, res) => {
    const { userId, itemId, pokemonId, qty } = req.body;
    const q = Math.max(1, parseInt(qty) || 1);
    const user = await User.findById(userId);
    if (!user) return res.json({ error: 'User not found' });

    // Aceita IDs legados e novos; usa sempre o bag
    const normalizedId = String(itemId || '').trim();

    if (normalizedId === 'levelUpCrystal') {
        if (!pokemonId) return res.json({ error: 'pokemonId required' });
        ensureUserInventories(user);
        if ((user.bag.levelUpCrystal || 0) < q) return res.json({ error: 'Not enough LevelUpCrystal' });

        // Usar transação para evitar race conditions entre leituras/escritas concorrentes
        const session = await mongoose.startSession();
        let progression = null;
        try {
            session.startTransaction();
            const userTx = await User.findById(user._id).session(session);
            if (!userTx) {
                await session.abortTransaction();
                session.endSession();
                return res.status(404).json({ error: 'User not found (tx)' });
            }
            // Re-checar inventário dentro da transação
            ensureUserInventories(userTx);
            if ((userTx.bag.levelUpCrystal || 0) < q) {
                await session.abortTransaction();
                session.endSession();
                return res.json({ error: 'Not enough LevelUpCrystal' });
            }

            progression = await applyOwnedEntityProgression(userTx, pokemonId, { levelGain: q, restoreHp: 'full', session });
            if (!progression.ok) {
                await session.abortTransaction();
                session.endSession();
                return res.json({ error: progression.error === 'entity_not_found' ? 'Entity not found (tx)' : 'Falha na progressão' });
            }
            userTx.bag.levelUpCrystal = (userTx.bag.levelUpCrystal || 0) - q;
            if (typeof userTx.markModified === 'function') userTx.markModified('bag');

            console.log(`[API] /api/use-item levelUpCrystal: (tx) saving user ${userTx._id}, new bag.levelUpCrystal=${userTx.bag.levelUpCrystal}`);
            await userTx.save({ session });
            await session.commitTransaction();
            session.endSession();
            console.log(`[API] /api/use-item levelUpCrystal: (tx) saved user ${userTx._id}`);
            // Atualizar a referência local 'user' para retornar dados atuais
            Object.assign(user, userTx.toObject());
        } catch (saveErr) {
            try { await session.abortTransaction(); } catch (_) {}
            session.endSession();
            console.error(`[API] /api/use-item ERROR saving user (tx) ${user && user._id}:`, saveErr);
            return res.status(500).json({ error: 'Failed to save user (tx)' });
        }
        return res.json({
            success: true,
            levelUpCrystal: user.bag.levelUpCrystal || 0,
            bag: user.bag,
            evolved: !!(progression && Array.isArray(progression.evolutions) && progression.evolutions.length > 0),
            progression: progression ? {
                levelsGained: progression.levelsGained,
                learnedMoves: progression.learnedMoves,
                evolutions: progression.evolutions,
                xpToNext: progression.xpToNext
            } : null,
            entity: progression ? { instanceId: progression.entity._id, level: progression.entity.level, hp: progression.entity.currentHp, name: progression.entity.nickname } : null
        });
    }
    return res.json({ error: 'Item cannot be used here' });
});

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
        return res.json({ success: true, bag: user.bag, keyItems: user.keyItems, storyFlags: user.storyFlags });
    } catch (e) {
        console.error(e);
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// --- BATTLE ROUTES ---
app.post('/battle/wild', async (req, res) => { 
    const { userId, currentMap, currentX, currentY, grassZone } = req.body; 
    const user = await User.findById(userId); 
    if (!user) return res.json({ error: 'User not found' });
    if (!user.entityTeam || user.entityTeam.length === 0) return res.json({ error: 'Você precisa pegar seu monstro inicial com o Professor.', needStarter: true });
    const userPokeData = user.entityTeam.find(p => p.currentHp > 0) || user.entityTeam[0]; 
    if(!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Todos os seus Monstros estão desmaiados!" }); 
    
    // CORREÇÃO MAPA
    let mapName = 'city'; 
    if (currentMap) {
        if (currentMap.includes('map=')) { const match = currentMap.match(/map=([^&]+)/); if (match && match[1]) mapName = match[1]; } 
        else if (currentMap !== 'city' && !currentMap.includes('?')) mapName = currentMap;
    }
    
    // BG
    const [mapDoc, possibleSpawns] = await Promise.all([
        GameMap.findOne({ mapId: mapName }).lean(),
        getWildSpawnCandidates(mapName, normalizeEncounterKey(grassZone))
    ]);
    let battleBgToUse = 'forest_bg.png';
    if (mapDoc && mapDoc.battleBackground) battleBgToUse = mapDoc.battleBackground;
    const battleBgPosX = (mapDoc && Number.isFinite(mapDoc.battleBgPosX)) ? mapDoc.battleBgPosX : 50;
    const battleBgPosY = (mapDoc && Number.isFinite(mapDoc.battleBgPosY)) ? mapDoc.battleBgPosY : 50;
    const battleBgZoom = (mapDoc && Number.isFinite(mapDoc.battleBgZoom)) ? mapDoc.battleBgZoom : 100;

    const encounterKey = normalizeEncounterKey(grassZone);
    if(possibleSpawns.length === 0) return res.json({ error: `Nada selvagem válido em '${mapName}'.` }); 
    
    const wildBase = pickWeightedEntity(possibleSpawns); 
    const minSpawnLevel = Number.isFinite(wildBase.minSpawnLevel) ? wildBase.minSpawnLevel : 1;
    const maxSpawnLevel = Number.isFinite(wildBase.maxSpawnLevel) ? Math.max(minSpawnLevel, wildBase.maxSpawnLevel) : minSpawnLevel;
    const wildLevel = Math.floor(Math.random() * (maxSpawnLevel - minSpawnLevel + 1)) + minSpawnLevel; 
    const wildEntity = await createBattleInstance(wildBase.id, wildLevel, wildBase);
    if (!wildEntity) return res.status(400).json({ error: 'A entidade selvagem selecionada está inválida.' });
    const userBase = await BaseEntity.findOne({ id: userPokeData.baseId }).lean(); 
    if (!userBase || !isEntityBattleReady(userBase)) return res.status(400).json({ error: 'Seu monstro ativo está com dados inválidos.' });
    const userEntity = userEntityToEntity(userPokeData, userBase); 
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
        p1: userEntity, p2: wildEntity, type: 'wild', userId: user._id, turn: 1, returnMap: returnMapUrl, returnX: currentX || 50, returnY: currentY || 50, customBackground: battleBgToUse,
        bgPosX: battleBgPosX, bgPosY: battleBgPosY,
        mapId: mapName,
        encounterKey
    }; 
    res.json({ battleId }); 
});

// Lista contratos disponíveis (desafios opt-in em vez de encontros aleatórios)
app.get('/api/contracts', async (_req, res) => {
    res.json({ contracts: CONTRACTS });
});

// Inicia batalha de contrato (PVE escalado)
app.post('/battle/contract', async (req, res) => {
    const { userId, contractId, currentMap, currentX, currentY } = req.body;
    const contract = getContractById(contractId);
    if (!contract) return res.status(400).json({ error: 'Contrato inválido' });

    const user = await User.findById(userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.entityTeam || user.entityTeam.length === 0) return res.status(400).json({ error: 'Time vazio. Pegue seu starter.' });
    const lead = user.entityTeam.find(p => p.currentHp > 0) || user.entityTeam[0];
    if (!lead || lead.currentHp <= 0) return res.status(400).json({ error: 'Nenhum monstro apto para lutar.' });

    const leadBase = await BaseEntity.findOne({ id: lead.baseId }).lean();
    if (!leadBase) return res.status(404).json({ error: 'Base do jogador não encontrada' });
    if (!isEntityBattleReady(leadBase)) return res.status(400).json({ error: 'A base do seu monstro está inválida.' });
    const p1 = userEntityToEntity(lead, leadBase); 
    p1.playerName = user.username; 
    p1.skin = user.skin;

    // Escolhe inimigo aleatório do catálogo, com nível escalado
    const sampled = await BaseEntity.aggregate([{ $sample: { size: 8 } }]);
    const enemyBase = Array.isArray(sampled) ? sampled.find(isEntityBattleReady) : null;
    if (!enemyBase) return res.status(400).json({ error: 'Sem criaturas cadastradas.' });

    const enemyLevel = Math.max(1, p1.level + (contract.levelOffset || 0));
    const enemyStats = calculateStats(enemyBase.baseStats, enemyLevel);
    const enemyMoves = pickDeterministicMovesFromPool(enemyBase.movePool, enemyLevel, 4, enemyBase.type);

    const p2 = {
        instanceId: 'contract_' + Date.now(),
        baseId: enemyBase.id,
        name: enemyBase.name,
        type: enemyBase.type,
        level: enemyLevel,
        hp: enemyStats.hp,
        maxHp: enemyStats.hp,
        energy: enemyStats.energy,
        maxEnergy: enemyStats.energy,
        stats: enemyStats,
        moves: enemyMoves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m && m.id),
        sprite: enemyBase.sprite,
        playerName: 'Desafio',
        skin: 'char2',
        status: null
    };

    const battleId = `contract_${contract.id}_${Date.now()}`;
    let returnMapUrl = currentMap || 'city';

    activeBattles[battleId] = { 
        p1, p2, type: 'contract', userId: user._id, turn: 1, mode: 'manual', returnMap: returnMapUrl, returnX: currentX || 50, returnY: currentY || 50,
        contractReward: contract.rewardMoney || 0,
        mapId: returnMapUrl
    };
    res.json({ battleId });
});

app.post('/battle/npc', async (req, res) => {
    const { userId, npcId, currentMap, currentX, currentY } = req.body; 
    const [user, npc] = await Promise.all([
        User.findById(userId).lean(),
        NPC.findById(npcId).lean()
    ]);
    if (!user || !npc) return res.json({ error: "NPC não encontrado." });

    const svcType = npc?.interact?.serviceType ? String(npc.interact.serviceType).trim() : '';
    const npcType = npc?.npcType ? String(npc.npcType).trim() : '';
    const isServiceNpc = (svcType === 'heal' || svcType === 'shop' || svcType === 'starter')
        || (npcType === 'heal' || npcType === 'shop' || npcType === 'starter');
    if (isServiceNpc) return res.json({ error: 'Este NPC não pode batalhar.' });

    // Enforce: treinador uma vez (cooldownMinutes<=0) ou repetível com cooldown.
    try {
        const record = Array.isArray(user.defeatedNPCs)
            ? user.defeatedNPCs.find(r => r && String(r.npcId) === String(npc._id))
            : null;
        if (record) {
            const defeatedAt = record.defeatedAt || 0;
            const cooldownMins = npc.cooldownMinutes || 0;
            if (cooldownMins <= 0) {
                return res.json({ error: resolveNpcDialogue(npc, user, 'winDialogue') || 'Você já me venceu! Bom trabalho.', alreadyDefeated: true });
            }
            const diffMinutes = (Date.now() - defeatedAt) / 60000;
            if (diffMinutes < cooldownMins) {
                const remaining = Math.ceil(cooldownMins - diffMinutes);
                const cooldownText = resolveNpcDialogue(npc, user, 'cooldownDialogue') || npc.cooldownDialogue || 'Estou descansando...';
                return res.json({
                    error: `${cooldownText} (${remaining}m)` ,
                    cooldownRemainingMinutes: remaining
                });
            }
        }
    } catch (_) {}

    if (!user.entityTeam || user.entityTeam.length === 0) return res.json({ error: 'Você precisa pegar seu monstro inicial com o Professor.', needStarter: true });
    const userPokeData = user.entityTeam.find(p => p.currentHp > 0) || user.entityTeam[0];
    if (!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Seus Monstros estão desmaiados!" });
    
    const userBase = await BaseEntity.findOne({ id: userPokeData.baseId }).lean();
    const p1Entity = userEntityToEntity(userPokeData, userBase); 
    p1Entity.playerName = user.username; 
    p1Entity.skin = user.skin;

    let mapName = 'city';
    if (currentMap) {
        if (currentMap.includes('map=')) {
            const match = currentMap.match(/map=([^&]+)/);
            if (match && match[1]) mapName = match[1];
        } else if (currentMap !== 'city' && !currentMap.includes('?')) {
            mapName = currentMap;
        }
    }
    const mapDoc = await GameMap.findOne({ mapId: mapName }).lean();
    let finalBg = 'battle_bg.png';
    if (mapDoc && mapDoc.battleBackground) finalBg = mapDoc.battleBackground;
    if (npc.battleBackground && npc.battleBackground !== 'battle_bg.png') finalBg = npc.battleBackground;
    const battleBgPosX = (mapDoc && Number.isFinite(mapDoc.battleBgPosX)) ? mapDoc.battleBgPosX : 50;
    const battleBgPosY = (mapDoc && Number.isFinite(mapDoc.battleBgPosY)) ? mapDoc.battleBgPosY : 50;
    const battleBgZoom = (mapDoc && Number.isFinite(mapDoc.battleBgZoom)) ? mapDoc.battleBgZoom : 100;

    const npcTeamInstances = [];
    if (!npc.team || npc.team.length === 0) return res.json({ error: "Este NPC não tem Monstros!" });

    const npcBaseIds = [...new Set(npc.team.map(m => String(m && m.baseId ? m.baseId : '')).filter(Boolean))];
    const npcBases = npcBaseIds.length > 0
        ? await BaseEntity.find({ id: { $in: npcBaseIds } }).lean()
        : [];
    const npcBaseById = new Map((npcBases || []).map(b => [String(b.id), b]));

    for (const member of npc.team) {
        const base = npcBaseById.get(String(member.baseId));
        if (!base) continue;

        const stats = calculateStats(base.baseStats, member.level);
        const moves = pickDeterministicMovesFromPool(base.movePool, member.level, 4, base.type);
        npcTeamInstances.push({
            instanceId: 'npc_mon_' + Date.now() + Math.random(), baseId: base.id, name: base.name, type: base.type, level: member.level, 
            maxHp: stats.hp, hp: stats.hp, maxEnergy: stats.energy, energy: stats.energy, stats: stats, 
            moves: moves.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m && m.id), 
            sprite: base.sprite, playerName: npc.name, skin: npc.skin, isCustomSkin: npc.isCustomSkin, isWild: false, status: null
        });
    }

    if (npcTeamInstances.length === 0) return res.json({ error: "Este NPC não tem Monstros válidos!" });

    const battleId = `npc_${Date.now()}`; 
    
    // CORREÇÃO RETURN URL
    let returnMapUrl = currentMap;
    if (mapName !== 'city' && mapName !== 'forest' && !currentMap.includes('map=')) { returnMapUrl = `city?map=${mapName}`; }

    activeBattles[battleId] = { 
        p1: p1Entity, p2: npcTeamInstances[0], npcReserve: npcTeamInstances, type: 'local', userId: user._id, turn: 1, npcId: npc._id,
        returnMap: returnMapUrl, returnX: currentX || 50, returnY: currentY || 50, customBackground: finalBg,
        bgPosX: battleBgPosX, bgPosY: battleBgPosY, bgZoom: battleBgZoom,
        mapId: mapName
    }; 
    res.json({ battleId });
});

// Atualiza somente o recorte/posição do battle background do mapa (admin)
app.post('/api/map/battlebg', async (req, res) => {
    try {
        const { userId, mapId, bgPosX, bgPosY, bgZoom } = req.body || {};
        const user = await User.findById(userId);
        if (!user || !user.isAdmin) return res.status(403).json({ error: 'Sem permissão' });
        const id = String(mapId || '').trim();
        if (!id) return res.status(400).json({ error: 'mapId inválido' });

        const x = clampPct(bgPosX, 50);
        const y = clampPct(bgPosY, 50);
        const z = clampZoomPct(bgZoom, 100);

        const updated = await GameMap.findOneAndUpdate(
            { mapId: id },
            { $set: { battleBgPosX: x, battleBgPosY: y, battleBgZoom: z } },
            { new: true, upsert: false }
        ).lean();

        if (!updated) return res.status(404).json({ error: 'Mapa não encontrado' });
        return res.json({
            success: true,
            battleBgPosX: updated.battleBgPosX,
            battleBgPosY: updated.battleBgPosY,
            battleBgZoom: updated.battleBgZoom
        });
    } catch (e) {
        return res.status(500).json({ error: 'Erro interno' });
    }
});

// (Custom Battle removido)

app.post('/battle/online', (req, res) => { res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); const { roomId, meData, opponentData } = req.body; if (!onlineBattles[roomId]) return res.redirect('/'); const me = JSON.parse(meData); const op = JSON.parse(opponentData); const returnUrl = me && me.userId ? `/city?userId=${me.userId}` : '/city'; res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, realUserId: me.userId, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, bgImage: 'battle_bg.png', bgPosX: 50, bgPosY: 50, bgZoom: 100, battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable: [], returnUrl, energyConfig: ENERGY_CONFIG }); });
app.post('/battle', async (req, res) => {
    const { fighterId, playerName, playerSkin, userId } = req.body;
    const user = await User.findById(userId);
    if(!user) return res.redirect('/');
    const userPokeData = user.entityTeam.id(fighterId);
    if(!userPokeData || userPokeData.currentHp <= 0) return res.redirect('/city?userId=' + userId);

    const b1Base = await BaseEntity.findOne({ id: userPokeData.baseId }).lean();
    const p1 = userEntityToEntity(userPokeData, b1Base);
    p1.playerName = playerName;
    p1.skin = playerSkin;

    // Evita carregar todas as entidades só para sortear 1.
    const sampled = await BaseEntity.aggregate([{ $sample: { size: 1 } }]);
    const randomBase = sampled && sampled[0] ? sampled[0] : null;
    if(!randomBase) return res.redirect('/city?userId=' + userId);

    const cpuLevel = Math.max(1, p1.level);
    const s2 = calculateStats(randomBase.baseStats, cpuLevel);
    const cpuMoves = pickDeterministicMovesFromPool(randomBase.movePool, cpuLevel, 4, randomBase.type);

    const p2 = {
        instanceId: 'p2_cpu_' + Date.now(),
        baseId: randomBase.id,
        name: randomBase.name,
        type: randomBase.type,
        level: cpuLevel,
        hp: s2.hp,
        maxHp: s2.hp,
        energy: s2.energy,
        maxEnergy: s2.energy,
        stats: s2,
        moves: cpuMoves.map(mid => ({...MOVES_LIBRARY[mid], id:mid})),
        sprite: randomBase.sprite,
        playerName: 'CPU',
        skin: 'char2',
        status: null
    };

    const battleId = 'local_' + Date.now();
    activeBattles[battleId] = { p1, p2, type: 'local', userId, turn: 1, mode: 'manual', returnMap: 'city' };
    res.redirect('/battle/' + battleId);
});

// Rota de teste: batalha 100% aleatória só pra ver o UI
app.get('/teste-ui-batalha', async (req, res) => {
    try {
        const allBases = await BaseEntity.find({}).lean();
        if (!allBases || allBases.length < 2) return res.status(500).send('Precisa de pelo menos 2 entidades no banco');

        const allSkins = await PlayerSkin.find({}).lean();
        const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
        const level = Math.floor(Math.random() * 20) + 1;

        const [b1Base, b2Base] = [pick(allBases), pick(allBases)].filter(Boolean);
        const s1 = calculateStats(b1Base.baseStats, level);
        const s2 = calculateStats(b2Base.baseStats, level);
        const m1 = pickDeterministicMovesFromPool(b1Base.movePool, level, 4, b1Base.type);
        const m2 = pickDeterministicMovesFromPool(b2Base.movePool, level, 4, b2Base.type);

        const skin1 = allSkins.length > 0 ? String(pick(allSkins)._id) : 'char1';
        const skin2 = allSkins.length > 0 ? String(pick(allSkins)._id) : 'char2';

        const p1 = {
            instanceId: 'test_p1_' + Date.now(),
            baseId: b1Base.id, name: b1Base.name, type: b1Base.type, level,
            hp: s1.hp, maxHp: s1.hp, energy: s1.energy || ENERGY_CONFIG.maxEnergy, maxEnergy: ENERGY_CONFIG.maxEnergy,
            stats: s1, moves: m1.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })),
            sprite: b1Base.sprite, playerName: 'Jogador', skin: skin1, status: null, xp: 0, xpToNext: 100
        };
        const p2 = {
            instanceId: 'test_p2_' + Date.now(),
            baseId: b2Base.id, name: b2Base.name, type: b2Base.type, level,
            hp: s2.hp, maxHp: s2.hp, energy: s2.energy || ENERGY_CONFIG.maxEnergy, maxEnergy: ENERGY_CONFIG.maxEnergy,
            stats: s2, moves: m2.map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })),
            sprite: b2Base.sprite, playerName: 'CPU Teste', skin: skin2, status: null
        };

        const battleId = 'test_' + Date.now();
        activeBattles[battleId] = { p1, p2, type: 'local', userId: '000000000000000000000001', turn: 1, mode: 'manual', returnMap: 'teste-ui-batalha' };
        res.redirect('/battle/' + battleId);
    } catch (e) {
        res.status(500).send('Erro: ' + e.message);
    }
});

app.get('/battle/:id', async (req, res) => { 
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private'); 
    const battle = activeBattles[req.params.id]; 
    if(!battle) return res.redirect('/'); 
    
    let switchable = []; 
    let canEditBg = false;
    
    // Normal Battle - use user.entityTeam
    if (battle.userId && require('mongoose').Types.ObjectId.isValid(battle.userId)) { 
        const user = await User.findById(battle.userId); 
        if (user) { 
            canEditBg = !!user.isAdmin;

            const candidates = user.entityTeam.filter(p => (p && p._id && p._id.toString() !== battle.p1.instanceId && p.currentHp > 0));
            const baseIds = [...new Set(candidates.map(p => String(p.baseId || '')).filter(Boolean))];
            const bases = baseIds.length > 0 ? await BaseEntity.find({ id: { $in: baseIds } }).lean() : [];
            const baseById = new Map((bases || []).map(b => [String(b.id), b]));

            for (const p of candidates) {
                const b = baseById.get(String(p.baseId));
                if (b) switchable.push(userEntityToEntity(p, b));
            }
        } 
    } 
    
    let bg = 'battle_bg.png';
    if (battle.customBackground) bg = battle.customBackground;
    const bgPosX = Number.isFinite(battle.bgPosX) ? battle.bgPosX : 50;
    const bgPosY = Number.isFinite(battle.bgPosY) ? battle.bgPosY : 50;
    const bgZoom = Number.isFinite(battle.bgZoom) ? battle.bgZoom : 100;

    // CORREÇÃO CRÍTICA DE URL
    let returnUrl = '/city';
    if(battle.returnMap) {
        // Remove barra inicial se houver
        const cleanMap = battle.returnMap.startsWith('/') ? battle.returnMap.substring(1) : battle.returnMap;
        const canonicalMap = (cleanMap === 'lobby' || cleanMap === 'forest') ? 'city' : cleanMap;
        // Verifica se já tem ?
        const separator = canonicalMap.includes('?') ? '&' : '?';
        returnUrl = `/${canonicalMap}${separator}userId=${battle.userId}`;
        
        if(battle.returnX) returnUrl += `&x=${battle.returnX}`;
        if(battle.returnY) returnUrl += `&y=${battle.returnY}`;

        // Se foi batalha contra NPC, ao voltar retoma patrulha imediatamente.
        if (battle.type === 'local' && battle.npcId) {
            returnUrl += `&resumeNpcId=${encodeURIComponent(String(battle.npcId))}`;
        }
    } else {
        returnUrl = `/city?userId=${battle.userId}`;
    }

    const normalizedBattleMode = (battle.type === 'online' || battle.type === 'wild')
        ? battle.type
        : 'manual';

    res.render('battle', { 
        p1: battle.p1, p2: battle.p2, battleId: req.params.id, battleMode: normalizedBattleMode, 
        isSpectator: false, myRoleId: battle.p1.instanceId, realUserId: battle.userId, playerName: battle.p1.playerName, playerSkin: battle.p1.skin, 
        bgImage: bg, bgPosX, bgPosY, bgZoom, battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable, returnUrl,
        battleMapId: battle.mapId || null,
        canEditBg,
        energyConfig: ENERGY_CONFIG
    }); 
});

// --- LÓGICA DE TURNO ---
app.post('/api/turn', async (req, res) => {
    const { battleId, action, moveId, isForced } = req.body; const battle = activeBattles[battleId]; if(!battle) { return res.json({ finished: true }); }
    try {
        let p1 = battle.p1; const p2 = battle.p2; const events = []; let threwCaptureCube = false;
        let npcDefeatedId = null;
        
        if (action === 'switch') { 
            // Normal battle - use user.entityTeam
            const user = await User.findById(battle.userId); if (!user) return res.json({ events: [{type:'MSG', text:'Erro'}]}); 
            if (!isForced) { const prevPoke = user.entityTeam.find(p => p._id.toString() === p1.instanceId); if(prevPoke) prevPoke.currentHp = p1.hp; } 
            const newPokeData = user.entityTeam.find(p => p._id.toString() === moveId); 
            if (!newPokeData || newPokeData.currentHp <= 0) return res.json({ events: [{type:'MSG', text:'Desmaiado!'}]}); 
            const base = await BaseEntity.findOne({ id: newPokeData.baseId }); 
            const newEntity = userEntityToEntity(newPokeData, base); newEntity.playerName = p1.playerName; newEntity.skin = p1.skin; 
            battle.p1 = newEntity; p1 = battle.p1; await user.save(); 
            events.push({ type: 'MSG', text: `Vai, ${p1.name}!` }); 
            if (p2.hp > 0 && !isForced) { performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); } 
            const userXp = await User.findById(battle.userId);
            const p1PokeData = userXp ? userXp.entityTeam.find(p => p._id.toString() === p1.instanceId) : null;
            const p1Xp = p1PokeData ? (p1PokeData.xp || 0) : 0;
            const p1XpNext = p1PokeData ? getXpForNextLevel(p1PokeData.level) : 100;
            return res.json({ events, p1State: { hp: p1.hp, maxHp: p1.maxHp, energy: p1.energy, maxEnergy: p1.maxEnergy, name: p1.name, level: p1.level, sprite: p1.sprite, moves: p1.moves, xp: p1Xp, xpToNext: p1XpNext }, p2State: { hp: p2.hp }, switched: true, newP1Id: p1.instanceId }); 
        }

        if (action === 'catch') { 
            if (battle.type !== 'wild') { events.push({ type: 'MSG', text: 'Não pode capturar.' }); return res.json({ events }); } 
            try { 
                const user = await User.findById(battle.userId); 
                ensureUserInventories(user);
                if((user.bag.captureCube || 0) <= 0) { events.push({ type: 'MSG', text: 'Sem Capture Cubes!' }); return res.json({ events }); } 
                user.bag.captureCube--; threwCaptureCube = true; 
                
                // --- SISTEMA DE CAPTURA SIMPLIFICADO ---
                
                // Fatores simples e claros:
                // 1. HP baixo (0-100% linear)
                const hpPercent = p2.hp / p2.maxHp;
                const hpBonus = 1 - hpPercent;
                
                // 2. Status dobra chances (recompensa estratégia)
                const statusMultiplier = p2.status ? 2.0 : 1.0;
                
                // 3. Raridade base
                const baseChance = (p2.catchRate || 0.3);
                
                // Fórmula transparente
                let captureChance = baseChance * (0.3 + (hpBonus * 0.7)) * statusMultiplier;
                captureChance = Math.max(0.05, Math.min(0.98, captureChance));
                
                const captured = Math.random() < captureChance;
                const chancePercent = Math.floor(captureChance * 100);
                
                // Feedback claro
                events.push({ type: 'CAPTURE_ATTEMPT', captured, chance: chancePercent });
                events.push({ type: 'MSG', text: `Chance de captura: ${chancePercent}%` });
                
                if (captured) { 
                                        events.push({ type: 'MSG', text: '✓ Capturado com sucesso!' });
                    const activeP1Index = user.entityTeam.findIndex(p => p._id.toString() === p1.instanceId); 
                    if (activeP1Index !== -1) user.entityTeam[activeP1Index].currentHp = p1.hp; 
                    const newStats = calculateStats(p2.stats, p2.level); 
                    const newPokeObj = { baseId: p2.baseId, nickname: p2.name, level: p2.level, currentHp: newStats.hp, stats: newStats, moves: p2.moves.map(m => m.id), learnedMoves: p2.moves.map(m => m.id) }; 
                    let sentToPC = false; 
                    if (!user.pc) user.pc = []; 
                    if (user.entityTeam.length < 6) user.entityTeam.push(newPokeObj); else { user.pc.push(newPokeObj); sentToPC = true; } 
                    if (!user.dex) user.dex = [];
                    if (!user.dex.includes(p2.baseId)) { user.dex.push(p2.baseId); }
                    await user.save(); delete activeBattles[battleId]; 
                    return res.json({ events, finished: true, win: true, captured: true, sentToPC, winnerId: p1.instanceId, threw: threwCaptureCube });
                } else { 
                    await user.save(); 
                    events.push({ type: 'MSG', text: `✗ ${p2.name} escapou! Estava com ${Math.floor(hpPercent*100)}% HP.` });
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
                if (!p1Move) {
                    events.push({ type: 'MSG', text: 'Esse movimento não está equipado.' });
                    return res.json({ events, p1State: { hp: p1.hp, energy: p1.energy }, p2State: { hp: p2.hp } });
                }
                if (p1.stats.speed >= p2.stats.speed) { processAction(p1, p2, p1Move, events); if (p2.hp > 0) performEnemyTurn(p2, p1, events); } 
                else { performEnemyTurn(p2, p1, events); if (p1.hp > 0) processAction(p1, p2, p1Move, events); } 
            }
            if (p1.hp > 0) applyStatusDamage(p1, events); if (p2.hp > 0) applyStatusDamage(p2, events); 
        }
        
        if (p1.hp <= 0) {
            // Normal Battle
            const user = await User.findById(battle.userId); 
            if(user) { 
                const poke = user.entityTeam.find(p => p._id.toString() === p1.instanceId); 
                if(poke) { poke.currentHp = 0; await user.save(); } 
                const hasAlive = user.entityTeam.some(p => p.currentHp > 0); 
                if (hasAlive) { 
                    events.push({ type: 'MSG', text: `${p1.name} desmaiou!` }); 
                    let switchable = []; 
                    for (let p of user.entityTeam) { 
                        if (p.currentHp > 0) { 
                            const b = await BaseEntity.findOne({ id: p.baseId }); 
                            if(b) switchable.push(userEntityToEntity(p, b)); 
                        } 
                    } 
                    return res.json({ events, forceSwitch: true, switchable }); 
                } 
            } 
            delete activeBattles[battleId]; 
            return res.json({ events, finished: true, win: false, winnerId: p2.instanceId, threw: threwCaptureCube }); 
        }
        
        if (p2.hp <= 0) {
            // Contrato (desafio opt-in): recompensa moedas fixa, sem time do NPC
            if (battle.type === 'contract') {
                events.push({ type: 'MSG', text: `${p2.name} desmaiou!` });
                const user = await User.findById(battle.userId);
                if (user && battle.contractReward) {
                    user.money = (user.money || 0) + battle.contractReward;
                    await user.save();
                    events.push({ type: 'MSG', text: `Recompensa do contrato: ${battle.contractReward} moedas.` });
                }
                delete activeBattles[battleId];
                return res.json({ events, finished: true, win: true, winnerId: p1.instanceId, threw: threwCaptureCube });
            }
            
            // Normal Battle - give XP
            let xpGained = battle.type === 'wild'
                ? Math.max(10, parseInt(p2.xpYield, 10) || 25)
                : Math.max(30, Math.floor(((p2.level || 1) * 12) + ((battle.npcReserve ? battle.npcReserve.length : 1) * 6)));
            // Valores de recompensa expostos para o front-end
            let moneyReward = 0;
            let expReward = 0;
            events.push({ type: 'MSG', text: `${p2.name} desmaiou!` }); 
            events.push({ type: 'MSG', text: `Ganhou ${xpGained} XP!` });
            const user = await User.findById(battle.userId); 
            if(user) {
                let poke = user.entityTeam.find(p => p._id.toString() === p1.instanceId);
                if (poke) { 
                    const progression = await applyOwnedEntityProgression(user, p1.instanceId, { xpGain: xpGained });
                    buildProgressionMessages(progression, poke.nickname).forEach(text => events.push({ type: 'MSG', text }));
                    poke.currentHp = p1.hp; await user.save(); 
                }
            }

            // Se é batalha de treinador (time inimigo), troca o próximo monstro antes de finalizar/recompensar.
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

            // Boss Event / Raid: recompensa + marca flags por jogador (por slot)
            if (battle.type === 'boss_event' || battle.type === 'boss_event_raid') {
                try {
                    const meta = battle.bossEventMeta || {};
                    const eventKey = String(meta.eventKey || 'event1').trim() || 'event1';
                    const slot = String(meta.slot || '').trim();

                    if (user && slot) {
                        user.storyFlags = user.storyFlags || {};
                        user.storyFlags[bossEventDefeatFlag(eventKey, slot)] = true;
                        if (typeof user.markModified === 'function') user.markModified('storyFlags');

                        const mReward = Math.max(0, parseInt(meta.moneyReward, 10) || 0);
                        if (mReward > 0) {
                            user.money = (user.money || 0) + mReward;
                            moneyReward = mReward;
                            events.push({ type: 'MSG', text: `Ganhou ${mReward} moedas!` });
                        }

                        const r = meta.reward || { type: 'none' };
                        if (r && r.type && r.type !== 'none') {
                            if (r.type === 'item') {
                                ensureUserInventories(user);
                                const itemId = normalizeItemId(r.value);
                                const qty = Math.max(1, parseInt(r.qty, 10) || 1);
                                const addRes = addItemToUser(user, itemId, qty, { keyItem: !!r.keyItem, unique: !!r.unique });
                                if (addRes.ok) {
                                    const msg = (addRes.storage === 'keyItems')
                                        ? `Recebeu o item-chave ${itemId}!`
                                        : `Recebeu ${qty}x ${itemId}!`;
                                    events.push({ type: 'MSG', text: msg });
                                } else if (addRes.reason === 'already_has_key_item') {
                                    events.push({ type: 'MSG', text: `Você já tem o item-chave ${itemId}.` });
                                }
                            } else if (r.type === 'entity') {
                                const rewardBase = await BaseEntity.findOne({ id: r.value });
                                if (rewardBase) {
                                    const rewardLvl = Math.max(1, parseInt(r.level, 10) || 1);
                                    const rStats = calculateStats(rewardBase.baseStats, rewardLvl);
                                    const learnedMoves = getLearnedMovesFromPool(rewardBase.movePool, rewardLvl, rewardBase.type);
                                    const rMoves = pickDeterministicMovesFromPool(rewardBase.movePool, rewardLvl, 4, rewardBase.type);
                                    const newPoke = { baseId: rewardBase.id, nickname: rewardBase.name, level: rewardLvl, currentHp: rStats.hp, stats: rStats, moves: rMoves, learnedMoves };
                                    if (!Array.isArray(user.entityTeam)) user.entityTeam = [];
                                    if (!Array.isArray(user.pc)) user.pc = [];
                                    if (user.entityTeam.length < 6) user.entityTeam.push(newPoke); else user.pc.push(newPoke);
                                    if (!user.dex) user.dex = [];
                                    if (!user.dex.includes(rewardBase.id)) { user.dex.push(rewardBase.id); }
                                    events.push({ type: 'MSG', text: `Recebeu ${rewardBase.name}!` });
                                }
                            }
                        }

                        expReward = xpGained;
                        await user.save();
                    }
                } catch (e) {
                    console.error('Erro aplicando boss_event reward:', e);
                }
            }
            if (battle.type === 'local' && battle.npcId) { 
                try { 
                    const npc = await NPC.findById(battle.npcId);
                    if (user) { 
                        let reward = 0; if(npc && npc.moneyReward > 0) reward = npc.moneyReward; else reward = Math.max(5, (p2.level || 1) * 5 * (battle.npcReserve ? battle.npcReserve.length : 1));
                        user.money = (user.money || 0) + reward; 
                        moneyReward = reward;
                        expReward = xpGained;
                        if (!user.defeatedNPCs) user.defeatedNPCs = [];
                        const npcIdStr = String(battle.npcId);
                        const recordIndex = user.defeatedNPCs.findIndex(r => String(r.npcId) === npcIdStr);
                        if (recordIndex !== -1) { user.defeatedNPCs[recordIndex].defeatedAt = Date.now(); } else { user.defeatedNPCs.push({ npcId: npcIdStr, defeatedAt: Date.now() }); }
                        events.push({ type: 'MSG', text: `Ganhou ${reward} moedas!` }); 
                        // adiciona diálogo de vitória do treinador (pré-desaparecimento)
                        try {
                            const winText = resolveNpcDialogue(npc, user, 'winDialogue') || npc.winDialogue || null;
                            if (winText) events.push({ type: 'MSG', text: winText });
                        } catch (e) {}
                        npcDefeatedId = npcIdStr;
                        if (npc && npc.reward && npc.reward.type !== 'none') {
                            const rewardIsUnique = !!npc.reward.unique;
                            const rewardFlagId = `npc_reward_${npcIdStr}`;
                            const rewardAlready = rewardIsUnique && readStoryFlag(user.storyFlags, rewardFlagId);

                            if (rewardAlready) {
                                events.push({ type: 'MSG', text: 'Recompensa já recebida.' });
                            } else {
                                let rewardGiven = false;

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
                                        rewardGiven = true;
                                    } else if (addRes.reason === 'already_has_key_item') {
                                        events.push({ type: 'MSG', text: `Você já tem o item-chave ${itemId}.` });
                                        rewardGiven = true;
                                    }
                                } else if (npc.reward.type === 'entity') {
                                    const rewardBase = await BaseEntity.findOne({ id: npc.reward.value });
                                    if (rewardBase) {
                                        const rewardLvl = npc.reward.level || 1;
                                        const rStats = calculateStats(rewardBase.baseStats, rewardLvl);
                                        const learnedMoves = getLearnedMovesFromPool(rewardBase.movePool, rewardLvl, rewardBase.type);
                                        const rMoves = pickDeterministicMovesFromPool(rewardBase.movePool, rewardLvl, 4, rewardBase.type);
                                        const newPoke = { baseId: rewardBase.id, nickname: rewardBase.name, level: rewardLvl, currentHp: rStats.hp, stats: rStats, moves: rMoves, learnedMoves };
                                        if (user.entityTeam.length < 6) user.entityTeam.push(newPoke); else user.pc.push(newPoke);
                                        if (!user.dex) user.dex = [];
                                        if (!user.dex.includes(rewardBase.id)) { user.dex.push(rewardBase.id); }
                                        events.push({ type: 'MSG', text: `Recebeu ${rewardBase.name}!` });
                                        rewardGiven = true;
                                    }
                                }

                                if (rewardIsUnique && rewardGiven) {
                                    user.storyFlags = user.storyFlags || {};
                                    user.storyFlags[rewardFlagId] = true;
                                    if (typeof user.markModified === 'function') user.markModified('storyFlags');
                                }
                            }
                        }
                        await user.save(); 
                    } 
                } catch (e) { console.error(e); } 
            }
            // Prepare p1State para retorno (XP/level atualizados) para o cliente animar a barra corretamente
            let p1State = null;
            try {
                if (user) {
                    const p1Poke = user.entityTeam.find(p => p._id.toString() === p1.instanceId);
                    if (p1Poke) {
                        const p1Xp = Number(p1Poke.xp || 0);
                        const p1Level = Number(p1Poke.level || 1);
                        const p1XpNext = getXpForNextLevel(p1Level) || 100;
                        p1State = { xp: p1Xp, xpToNext: p1XpNext, level: p1Level };
                    }
                }
            } catch (e) { console.error('Erro preparando p1State:', e); }

            // Boss Event RAID: ao finalizar o treinador atual, inicia o próximo sem curar o jogador
            if (battle.type === 'boss_event_raid' && battle.raidQueue && Array.isArray(battle.raidQueue) && Number.isFinite(battle.raidIndex)) {
                try {
                    const currentTrainerName = (battle.p2 && battle.p2.playerName) ? String(battle.p2.playerName) : '';
                    const nextIndex = battle.raidIndex + 1;
                    const nextStage = battle.raidQueue[nextIndex];
                    if (nextStage && nextStage.slot && Array.isArray(nextStage.team) && nextStage.team.length) {
                        const trainerName = String(nextStage.name || nextStage.slot || '').trim() || String(nextStage.slot).toUpperCase();
                        const trainerSkin = (battle.raidTrainerSkin ? String(battle.raidTrainerSkin) : (battle.p2 && battle.p2.skin)) || 'char2';
                        const trainerIsCustomSkin = !!battle.raidTrainerIsCustomSkin;

                        // Monta npcReserve do próximo treinador
                        const baseIds = Array.from(new Set(nextStage.team.map(x => String(x && x.baseId ? x.baseId : '').trim()).filter(Boolean)));
                        const bases = baseIds.length ? await BaseEntity.find({ id: { $in: baseIds } }).lean() : [];
                        const baseById = new Map((bases || []).map(b => [String(b.id), b]));

                        const npcReserve = [];
                        for (let i = 0; i < nextStage.team.length; i++) {
                            const member = nextStage.team[i];
                            const b = baseById.get(String(member.baseId));
                            if (!b) continue;
                            const level = Math.max(1, parseInt(member.level, 10) || 1);
                            const stats = calculateStats(b.baseStats, level);
                            const pickedIds = pickDeterministicMovesFromPool(b.movePool, level, 4, b.type);
                            const moveObjs = (pickedIds || []).map(mid => ({ ...MOVES_LIBRARY[mid], id: mid })).filter(m => m && m.id);
                            const moves = moveObjs.length
                                ? moveObjs
                                : (MOVES_LIBRARY.rapid_punch ? [{ ...MOVES_LIBRARY.rapid_punch, id: 'rapid_punch' }]
                                    : MOVES_LIBRARY.wing_slice ? [{ ...MOVES_LIBRARY.wing_slice, id: 'wing_slice' }]
                                        : MOVES_LIBRARY.rest ? [{ ...MOVES_LIBRARY.rest, id: 'rest' }]
                                            : []);

                            const monName = (member.name && String(member.name).trim()) ? String(member.name).trim() : b.name;
                            npcReserve.push({
                                instanceId: `boss_raid_${nextStage.slot}_${i}_${Date.now()}_${Math.random().toString(16).slice(2)}`,
                                baseId: b.id,
                                name: monName,
                                type: b.type,
                                level,
                                maxHp: stats.hp,
                                hp: stats.hp,
                                maxEnergy: ENERGY_CONFIG.maxEnergy,
                                energy: ENERGY_CONFIG.maxEnergy,
                                stats,
                                moves,
                                sprite: b.sprite,
                                playerName: trainerName,
                                skin: trainerSkin || 'char2',
                                isCustomSkin: trainerIsCustomSkin,
                                isWild: false,
                                status: null,
                                defending: false
                            });
                        }

                        if (npcReserve.length) {
                            battle.raidIndex = nextIndex;
                            battle.npcReserve = npcReserve;
                            battle.p2 = npcReserve[0];
                            battle.bossEventMeta = {
                                ...(battle.bossEventMeta || {}),
                                slot: String(nextStage.slot),
                                moneyReward: Math.max(0, parseInt(nextStage.moneyReward, 10) || 0),
                                reward: nextStage.reward ? nextStage.reward : { type: 'none' }
                            };
                            if (currentTrainerName) events.push({ type: 'MSG', text: `${currentTrainerName} foi derrotado e foi embora!` });
                            events.push({ type: 'MSG', text: `Próximo treinador apareceu: ${trainerName}!` });
                            events.push({ type: 'MSG', text: `${trainerName} vai usar ${battle.p2.name}!` });
                            return res.json({
                                events,
                                switched: true,
                                p2Switched: true,
                                newP1Id: p1.instanceId,
                                p1State: { hp: p1.hp, energy: p1.energy },
                                p2State: battle.p2
                            });
                        }
                    }
                } catch (e) {
                    console.error('Erro ao avançar boss_event_raid:', e);
                }
            }

            delete activeBattles[battleId];
            return res.json({ events, finished: true, win: true, winnerId: p1.instanceId, threw: threwCaptureCube, npcDefeatedId, moneyReward, expReward, p1State });
        }
        const user = await User.findById(battle.userId);
        const p1PokeData = user ? user.entityTeam.find(p => p._id.toString() === p1.instanceId) : null;
        const p1Xp = p1PokeData ? (p1PokeData.xp || 0) : 0;
        const p1XpNext = p1PokeData ? getXpForNextLevel(p1PokeData.level) : 100;
        return res.json({ events, p1State: { hp: p1.hp, energy: p1.energy, xp: p1Xp, xpToNext: p1XpNext }, p2State: { hp: p2.hp }, threw: threwCaptureCube });
    } catch (err) { console.error(err); return res.json({ events: [{ type: 'MSG', text: 'Erro interno.' }], finished: true }); }
});

io.on('connection', (socket) => {
    socket.on('join_room', (roomId) => { socket.join(roomId); });
    socket.on('enter_map', async (data) => { 
        try {
            // Se o usuário foi excluído do DB mas ainda está com a página aberta,
            // este socket pode continuar "online". Valida aqui e derruba o socket.
            if (data && data.userId) {
                const exists = await User.exists({ _id: data.userId });
                if (!exists) {
                    try { socket.emit('auth_error', { error: 'user_not_found' }); } catch (_) {}
                    try { socket.disconnect(true); } catch (_) {}
                    return;
                }
            }

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
            
            const prevMap = players[socket.id] && players[socket.id].map ? players[socket.id].map : null;
            if (prevMap && prevMap !== data.map) {
                try { socket.leave(prevMap); } catch (_) {}
                try { io.to(prevMap).emit('player_left', socket.id); } catch (_) {}
            }

            socket.join(data.map); 
            let mapNpcs = npcCacheByMap[data.map];
            if (!mapNpcs) {
                try { mapNpcs = await NPC.find({ map: data.map }).lean(); } catch(e) { mapNpcs = []; }
                npcCacheByMap[data.map] = mapNpcs;
            }
            socket.emit('npcs_list', mapNpcs);
            
            const startX = clampPct(data.x, 50);
            const startY = clampPct(data.y, 50);
            const startDir = normalizeDir(data.direction);
            let followerInfo = { followingEntityId: '', sprite: '', name: '' };
            try {
                if (data && data.userId) {
                    const user = await User.findById(data.userId).lean();
                    followerInfo = await buildFollowerInfo(user);
                }
            } catch (_) {}
            
            players[socket.id] = { id: socket.id, userId: data.userId, ...data, x: startX, y: startY, direction: startDir, followingEntityId: followerInfo.followingEntityId || '', followerSprite: followerInfo.sprite || '', followerName: followerInfo.name || '', isSearching: false, _lastPersistAt: 0, _lastUserCheckAt: Date.now(), _nextEncounterAt: 0 }; 
            const mapPlayers = Object.values(players).filter(p => p.map === data.map); 
            socket.emit('map_state', mapPlayers); 
            socket.to(data.map).emit('player_joined', players[socket.id]);

            // Salva a localização inicial do mapa (útil em refresh/relogin)
            persistUserLocation(data.userId, data.map, startX, startY, startDir);
        } catch(e) { console.error('Erro no socket enter_map', e); }
    });
    socket.on('move_player', async (data) => {
        if (players[socket.id]) {
            const p = players[socket.id];
            const incomingSeq = Number(data && data.seq) || 0;
            if (incomingSeq && p._lastSeq && incomingSeq < p._lastSeq) return;
            if (incomingSeq) p._lastSeq = incomingSeq;

            // Revalida o usuário no DB de tempos em tempos para não deixar "fantasma" online.
            const nowCheck = Date.now();
            if (p.userId && (!p._lastUserCheckAt || (nowCheck - p._lastUserCheckAt) >= 30000)) {
                p._lastUserCheckAt = nowCheck;
                try {
                    const exists = await User.exists({ _id: p.userId });
                    if (!exists) {
                        const map = p.map;
                        delete players[socket.id];
                        try { io.to(map).emit('player_left', socket.id); } catch (_) {}
                        try { socket.disconnect(true); } catch (_) {}
                        return;
                    }
                } catch (_) {
                    // se o DB falhar, não derruba o jogo
                }
            }

            const nextX = clampPct(data.x, p.x);
            const nextY = clampPct(data.y, p.y);

            const dx = nextX - p.x;
            const dy = nextY - p.y;
            let dir = p.direction;
            if (Math.abs(dx) > Math.abs(dy)) dir = dx > 0 ? 'right' : 'left';
            else dir = dy > 0 ? 'down' : 'up';

            p.x = nextX;
            p.y = nextY;
            p.direction = dir;
            io.to(p.map).emit('player_moved', { id: socket.id, x: nextX, y: nextY, direction: dir, seq: data && data.seq });

            // Persistência com throttle para não sobrecarregar o DB
            const now = Date.now();
            if (!p._lastPersistAt || (now - p._lastPersistAt) >= 2000) {
                p._lastPersistAt = now;
                persistUserLocation(p.userId, p.map, p.x, p.y, p.direction);
            }
        }
    });
    socket.on('send_chat', (data) => { const p = players[socket.id]; if (p) { const payload = { id: socket.id, msg: (typeof data === 'object' ? data.msg : data).substring(0, 50) }; const room = (typeof data === 'object' ? data.roomId : null) || p.map; io.to(room).emit('chat_message', payload); } });
    
  socket.on('check_encounter', (data) => { 
        const player = players[socket.id];
        if (!player) return;
        const now = Date.now();
        if (player._nextEncounterAt && now < player._nextEncounterAt) return;
        const baseChance = getEncounterChanceForMap(player && player.map);
        const requestedChance = (data && Number.isFinite(data.encounterRate)) ? data.encounterRate : null;
        const encounterChance = requestedChance == null ? baseChance : Math.max(0, Math.min(1, requestedChance));
        if (encounterChance > 0 && Math.random() < encounterChance) {
            player._nextEncounterAt = now + ENCOUNTER_COOLDOWN_MS;
            socket.emit('encounter_found'); 
        }
    });
    
    socket.on('disconnect', () => {
        matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id);
        cleanupChallengesForSocket(socket.id);
        if (players[socket.id]) {
            const p = players[socket.id];
            const map = p.map;
            // Salva a última posição ao sair
            persistUserLocation(p.userId, p.map, p.x, p.y, p.direction);
            delete players[socket.id];
            io.to(map).emit('player_left', socket.id);
        }
    });
    socket.on('cancel_match', () => { matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id); if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } });

    socket.on('player_challenge_request', (payload) => {
        const targetSocketId = payload && payload.targetSocketId ? String(payload.targetSocketId) : '';
        if (!targetSocketId || targetSocketId === socket.id) return;

        const fromPlayer = players[socket.id];
        const toPlayer = players[targetSocketId];
        if (!fromPlayer || !toPlayer) {
            socket.emit('player_challenge_error', 'Jogador offline.');
            return;
        }

        if (isSocketInOnlineBattle(socket.id) || isSocketInOnlineBattle(targetSocketId)) {
            socket.emit('player_challenge_error', 'Jogador em batalha.');
            return;
        }

        if (matchmakingQueue.find(u => u.socket.id === socket.id || u.socket.id === targetSocketId)) {
            socket.emit('player_challenge_error', 'Jogador ocupado.');
            return;
        }

        if (hasActiveChallengeForSocket(socket.id) || hasActiveChallengeForSocket(targetSocketId)) {
            socket.emit('player_challenge_error', 'Desafio pendente.');
            return;
        }

        const challengeId = createChallenge(socket.id, targetSocketId);
        socket.emit('player_challenge_sent', { challengeId, targetSocketId });
        io.to(targetSocketId).emit('player_challenge_request', {
            challengeId,
            from: { socketId: socket.id, userId: fromPlayer.userId, name: fromPlayer.name, skin: fromPlayer.skin }
        });
    });

    socket.on('player_challenge_decline', ({ challengeId }) => {
        const id = String(challengeId || '').trim();
        const ch = playerChallenges[id];
        if (!ch || ch.toSocketId !== socket.id) return;
        delete playerChallenges[id];
        io.to(ch.fromSocketId).emit('player_challenge_declined', { challengeId: id });
    });

    socket.on('player_challenge_accept', async ({ challengeId }) => {
        const id = String(challengeId || '').trim();
        const ch = playerChallenges[id];
        if (!ch || ch.toSocketId !== socket.id) return;

        delete playerChallenges[id];

        if (isSocketInOnlineBattle(ch.fromSocketId) || isSocketInOnlineBattle(ch.toSocketId)) {
            io.to(ch.fromSocketId).emit('player_challenge_error', 'Jogador em batalha.');
            io.to(ch.toSocketId).emit('player_challenge_error', 'Jogador em batalha.');
            return;
        }

        matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== ch.fromSocketId && u.socket.id !== ch.toSocketId);
        if (players[ch.fromSocketId]) { players[ch.fromSocketId].isSearching = false; io.emit('player_updated', players[ch.fromSocketId]); }
        if (players[ch.toSocketId]) { players[ch.toSocketId].isSearching = false; io.emit('player_updated', players[ch.toSocketId]); }

        try {
            const result = await createDirectOnlineBattle(ch.fromSocketId, ch.toSocketId);
            if (!result.success) {
                io.to(ch.fromSocketId).emit('player_challenge_error', result.error || 'Falha ao criar batalha.');
                io.to(ch.toSocketId).emit('player_challenge_error', result.error || 'Falha ao criar batalha.');
                return;
            }
            io.to(ch.fromSocketId).emit('match_found', { roomId: result.roomId, me: result.p1, opponent: result.p2, bet: 0 });
            io.to(ch.toSocketId).emit('match_found', { roomId: result.roomId, me: result.p2, opponent: result.p1, bet: 0 });
        } catch (e) {
            io.to(ch.fromSocketId).emit('player_challenge_error', 'Falha ao criar batalha.');
            io.to(ch.toSocketId).emit('player_challenge_error', 'Falha ao criar batalha.');
        }
    });
    
    socket.on('find_match', async (fighterId, userId, playerName, playerSkin, bet = 0) => { 
        if(matchmakingQueue.find(u => u.socket.id === socket.id)) return; 
        if(players[socket.id]) { players[socket.id].isSearching = true; io.emit('player_updated', players[socket.id]); } 
        try { 
            const user = await User.findById(userId); 
            if(!user) { socket.emit('search_error', 'User error'); return; } 
            if(bet && user.money < bet) { socket.emit('search_error', 'Saldo insuficiente'); if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } return; } 
            const userPokeData = user.entityTeam.id(fighterId); 
            if(!userPokeData || userPokeData.currentHp <= 0) { if(players[socket.id]) { players[socket.id].isSearching = false; io.emit('player_updated', players[socket.id]); } socket.emit('search_error', 'Pokémon inválido!'); return; } 
            const base = await BaseEntity.findOne({ id: userPokeData.baseId }); 
            const playerEntity = userEntityToEntity(userPokeData, base); playerEntity.userId = userId; playerEntity.id = socket.id; playerEntity.playerName = playerName; playerEntity.skin = playerSkin; 
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
            const newPokeData = user.entityTeam.find(p => p._id.toString() === value);
            
            if (newPokeData && newPokeData.currentHp > 0) {
                const base = await BaseEntity.findOne({ id: newPokeData.baseId });
                const newEntity = userEntityToEntity(newPokeData, base);
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
            const winnerId = isP1 ? battle.p2.userId : battle.p1.userId;
            await applyPvpRankingResult(battle, winnerId, events);
            io.to(roomId).emit('turn_result', { events, winnerId });
            delete onlineBattles[roomId];
            return;
        }

        if (action === 'switch') {
            const user = await User.findById(actor.userId);
            const newPokeData = user.entityTeam.find(p => p._id.toString() === value);
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
            
            // === REGENERAÇÃO DE ENERGIA NO INÍCIO DO TURNO ===
            p1.energy = Math.min(p1.maxEnergy, p1.energy + ENERGY_CONFIG.energyPerTurn);
            p2.energy = Math.min(p2.maxEnergy, p2.energy + ENERGY_CONFIG.energyPerTurn);
            
            // Notificar frontend da energia restaurada
            events.push({ 
                type: 'ENERGY_RESTORED', 
                p1Energy: p1.energy, 
                p2Energy: p2.energy, 
                restored: ENERGY_CONFIG.energyPerTurn 
            });
            
            const executeAction = async (act, opp, isP1Action) => {
                const actionData = act.nextAction;
                if (actionData.type === 'switch') {
                    const base = await BaseEntity.findOne({ id: actionData.data.baseId });
                    const user = await User.findById(act.userId);
                    const prevPoke = user.entityTeam.find(p => p._id.toString() === act.instanceId);
                    if(prevPoke) prevPoke.currentHp = act.hp;
                    await user.save();

                    const newEntity = userEntityToEntity(actionData.data, base);
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
                 const hasAlive1 = user1.entityTeam.some(p => p.currentHp > 0 && p._id.toString() !== battle.p1.instanceId); 
                 
                 const deadPoke = user1.entityTeam.find(p => p._id.toString() === battle.p1.instanceId);
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
                 const hasAlive2 = user2.entityTeam.some(p => p.currentHp > 0 && p._id.toString() !== battle.p2.instanceId);
                 
                 const deadPoke2 = user2.entityTeam.find(p => p._id.toString() === battle.p2.instanceId);
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
                await applyPvpRankingResult(battle, winnerId, events);
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
dbReady
    .then(() => server.listen(PORT, () => console.log(`Server ON Port ${PORT}`)))
    .catch(e => console.error('❌ Servidor não iniciado: MongoDB indisponível.', e));
