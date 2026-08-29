const { EntityType, MoveType, MOVES_LIBRARY } = require('../gameData');

const ENTITY_TYPES = new Set(Object.values(EntityType));

function toFiniteNumber(value, fallback = 0) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function normalizeEntityType(type) {
    const normalized = String(type || '').trim().toLowerCase();
    return ENTITY_TYPES.has(normalized) ? normalized : '';
}

function sanitizeBaseStats(baseStats) {
    const src = (baseStats && typeof baseStats === 'object') ? baseStats : {};
    return {
        hp: Math.max(1, Math.floor(toFiniteNumber(src.hp, 1))),
        energy: Math.max(0, Math.floor(toFiniteNumber(src.energy, 0))),
        attack: Math.max(0, Math.floor(toFiniteNumber(src.attack, 0))),
        defense: Math.max(0, Math.floor(toFiniteNumber(src.defense, 0))),
        speed: Math.max(0, Math.floor(toFiniteNumber(src.speed, 0)))
    };
}

function sanitizeLevel(level, min = 1, max = 100) {
    return clamp(Math.floor(toFiniteNumber(level, min)), min, max);
}

function calculateStats(baseStats, level) {
    const safeBase = sanitizeBaseStats(baseStats);
    const safeLevel = sanitizeLevel(level);
    const mult = 1 + (safeLevel * 0.025);

    return {
        hp: Math.floor((safeBase.hp * 1.5 * safeLevel / 100) + safeLevel + 10),
        energy: Math.max(1, Math.floor(safeBase.energy + (safeLevel * 0.1))),
        attack: Math.floor(safeBase.attack * mult),
        defense: Math.floor(safeBase.defense * mult),
        speed: Math.floor(safeBase.speed * mult)
    };
}

function buildAutoMovePoolForType(entityType) {
    const type = normalizeEntityType(entityType);
    const levelSlots = [1, 5, 10, 15, 20, 25, 35, 45, 55];
    const entries = Object.entries(MOVES_LIBRARY)
        .filter(([_, move]) => normalizeEntityType(move.element) === type);

    if (!entries.length) return [{ moveId: 'strike', level: 1 }];

    const attacks = entries
        .filter(([_, move]) => move.type === MoveType.ATTACK)
        .sort((a, b) => (a[1].power || 0) - (b[1].power || 0));

    const statuses = entries
        .filter(([_, move]) => move.type !== MoveType.ATTACK)
        .sort((a, b) => (a[1].cost || 0) - (b[1].cost || 0));

    return [...attacks, ...statuses].map(([id], index) => ({
        moveId: id,
        level: levelSlots[Math.min(index, levelSlots.length - 1)]
    }));
}

function normalizeMovePool(movePool, entityType = null) {
    const rawPool = Array.isArray(movePool) ? movePool : [];
    const unique = new Map();

    for (const entry of rawPool) {
        const moveId = String(entry && entry.moveId || '').trim();
        if (!moveId || !MOVES_LIBRARY[moveId]) continue;
        const level = sanitizeLevel(entry.level || 1, 1, 100);
        const existing = unique.get(moveId);
        if (!existing || level < existing.level) {
            unique.set(moveId, { moveId, level });
        }
    }

    const normalized = Array.from(unique.values())
        .sort((a, b) => (a.level - b.level) || a.moveId.localeCompare(b.moveId));

    if (normalized.length > 0) return normalized;
    if (normalizeEntityType(entityType)) return buildAutoMovePoolForType(entityType);
    return [{ moveId: 'strike', level: 1 }];
}

function getLearnedMovesFromPool(movePool, level, entityType = null) {
    const safeLevel = sanitizeLevel(level);
    const pool = normalizeMovePool(movePool, entityType);
    return pool
        .filter(entry => entry.level <= safeLevel)
        .map(entry => entry.moveId)
        .slice(-12)
        .filter(Boolean);
}

function pickDeterministicMovesFromPool(movePool, level, maxMoves = 4, entityType = null) {
    const learned = getLearnedMovesFromPool(movePool, level, entityType);
    const picked = learned.slice(-Math.max(1, maxMoves));
    return picked.length > 0 ? picked : ['strike'];
}

function validateBaseStats(baseStats) {
    const errors = [];
    const src = (baseStats && typeof baseStats === 'object') ? baseStats : null;
    if (!src) return ['baseStats ausente ou inválido'];

    const fields = ['hp', 'energy', 'attack', 'defense', 'speed'];
    for (const field of fields) {
        const value = toFiniteNumber(src[field], NaN);
        if (!Number.isFinite(value)) {
            errors.push(`baseStats.${field} inválido`);
            continue;
        }
        if (field === 'hp' && value < 1) {
            errors.push('baseStats.hp deve ser >= 1');
            continue;
        }
        if (field !== 'hp' && value < 0) {
            errors.push(`baseStats.${field} deve ser >= 0`);
        }
    }

    return errors;
}

function validateMovePool(movePool) {
    const errors = [];
    if (movePool == null) return errors;
    if (!Array.isArray(movePool)) return ['movePool inválido'];

    movePool.forEach((entry, index) => {
        const moveId = String(entry && entry.moveId || '').trim();
        if (!moveId) {
            errors.push(`movePool[${index}] sem moveId`);
            return;
        }
        if (!MOVES_LIBRARY[moveId]) {
            errors.push(`movePool[${index}] usa moveId desconhecido: ${moveId}`);
        }
        const level = toFiniteNumber(entry.level, NaN);
        if (!Number.isFinite(level) || level < 1) {
            errors.push(`movePool[${index}] tem level inválido`);
        }
    });

    return errors;
}

function validateEntityDefinition(entity, options = {}) {
    const source = (entity && typeof entity === 'object') ? entity : {};
    const errors = [];
    const type = normalizeEntityType(source.type);
    const allowLegacyShape = options.allowLegacyShape === true;
    const baseStats = source.baseStats || (allowLegacyShape ? {
        hp: source.hp,
        energy: source.energy,
        attack: source.stats && source.stats.attack,
        defense: source.stats && source.stats.defense,
        speed: source.stats && source.stats.speed
    } : null);

    if (!String(source.name || '').trim()) errors.push('name é obrigatório');
    if (!type) errors.push(`type inválido: ${source.type || '(vazio)'}`);

    errors.push(...validateBaseStats(baseStats));
    errors.push(...validateMovePool(source.movePool));

    const minSpawnLevel = toFiniteNumber(source.minSpawnLevel, NaN);
    const maxSpawnLevel = toFiniteNumber(source.maxSpawnLevel, NaN);
    if (Number.isFinite(minSpawnLevel) && minSpawnLevel < 1) errors.push('minSpawnLevel deve ser >= 1');
    if (Number.isFinite(maxSpawnLevel) && maxSpawnLevel < 1) errors.push('maxSpawnLevel deve ser >= 1');
    if (Number.isFinite(minSpawnLevel) && Number.isFinite(maxSpawnLevel) && minSpawnLevel > maxSpawnLevel) {
        errors.push('minSpawnLevel não pode ser maior que maxSpawnLevel');
    }

    const catchRate = toFiniteNumber(source.catchRate, NaN);
    if (Number.isFinite(catchRate) && (catchRate < 0 || catchRate > 1)) {
        errors.push('catchRate deve ficar entre 0 e 1');
    }

    const spawnChance = toFiniteNumber(source.spawnChance, NaN);
    if (Number.isFinite(spawnChance) && spawnChance < 0) {
        errors.push('spawnChance deve ser >= 0');
    }

    return {
        ok: errors.length === 0,
        errors,
        normalized: {
            type: type || EntityType.BEAST,
            baseStats: sanitizeBaseStats(baseStats),
            movePool: normalizeMovePool(source.movePool, type || EntityType.BEAST)
        }
    };
}

function isEntityBattleReady(entity) {
    if (!entity || !String(entity.id || '').trim()) return false;
    const legacyStats = entity.baseStats || {
        hp: entity.hp,
        energy: entity.energy,
        attack: entity.stats && entity.stats.attack,
        defense: entity.stats && entity.stats.defense,
        speed: entity.stats && entity.stats.speed
    };
    const safeStats = Object.fromEntries(
        Object.entries(legacyStats || {}).map(([key, value]) => [key, Math.max(0, Number(value) || 0)])
    );
    safeStats.hp = Math.max(1, safeStats.hp);

    // Legacy catalogs can contain obsolete move ids; the battle builder already
    // supplies a type-based fallback when those moves are discarded.
    const safeMovePool = Array.isArray(entity.movePool)
        ? entity.movePool.filter(entry => entry && MOVES_LIBRARY[entry.moveId])
        : [];
    return validateEntityDefinition({
        ...entity,
        baseStats: safeStats,
        movePool: safeMovePool
    }, { allowLegacyShape: true }).ok;
}

module.exports = {
    buildAutoMovePoolForType,
    calculateStats,
    getLearnedMovesFromPool,
    isEntityBattleReady,
    normalizeEntityType,
    normalizeMovePool,
    pickDeterministicMovesFromPool,
    sanitizeBaseStats,
    sanitizeLevel,
    validateBaseStats,
    validateEntityDefinition,
    validateMovePool
};