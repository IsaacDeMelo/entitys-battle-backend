// lib/battleEngine.js
// Motor de batalha puro e testável — fonte única de verdade.
// Corrige: rest duplicado, status sem efeito, defesa eterna, captura com stats errados.
// Todas as funções aceitam `rng` injetável para testes determinísticos.
const { MOVES_LIBRARY, getTypeEffectiveness } = require('../gameData');

const DEFAULT_ENERGY_CONFIG = {
    maxEnergy: 10,
    energyPerTurn: 1,
    restBonus: 2,
};

const STATUS_DOT = {
    poison: { divisor: 8, label: 'veneno' },
    burn: { divisor: 16, label: 'queimadura' },
};

const STATUS_IMMOBILIZE_CHANCE = {
    frozen: 0.5,
    paralyzed: 0.25,
};

const STATUS_MESSAGES = {
    poison: (n) => `${n} foi envenenado!`,
    burn: (n) => `${n} foi queimado!`,
    frozen: (n) => `${n} foi congelado!`,
    paralyzed: (n) => `${n} foi paralisado!`,
};

function toFinite(n, fallback = 0) {
    const v = Number(n);
    return Number.isFinite(v) ? v : fallback;
}

function isImmobilizedByStatus(entity, rng = Math.random) {
    if (!entity || !entity.status) return false;
    const chance = STATUS_IMMOBILIZE_CHANCE[entity.status.type] || 0;
    if (chance <= 0) return false;
    return rng() < chance;
}

function immobilizeLabel(type) {
    if (type === 'frozen') return 'congelado';
    if (type === 'paralyzed') return 'paralisado';
    return 'imobilizado';
}

// Dano por status no fim do turno. Suporta poison/burn com DOT;
// frozen/paralyzed apenas decrementam duração (efeito é imobilizar no processAction).
function applyStatusDamage(entity, events) {
    if (!entity || !entity.status || entity.hp <= 0) return;
    const type = entity.status.type;
    const dot = STATUS_DOT[type];
    if (dot) {
        const dmg = Math.max(1, Math.floor(entity.maxHp / dot.divisor));
        entity.hp = Math.max(0, entity.hp - dmg);
        entity.status.turns = toFinite(entity.status.turns, 3) - 1;
        events.push({
            type: 'STATUS_DAMAGE', targetId: entity.instanceId || 'wild',
            damage: dmg, newHp: entity.hp, status: type,
            text: `${entity.name} sofreu por ${dot.label}! (-${dmg})`,
        });
        if (entity.status.turns <= 0 || entity.hp <= 0) {
            const label = dot.label === 'veneno' ? 'O veneno' : 'A queimadura';
            entity.status = null;
            events.push({ type: 'STATUS_END', targetId: entity.instanceId || 'wild', text: `${label} de ${entity.name} passou.` });
        }
        return;
    }
    // frozen / paralyzed: só expira por turnos
    entity.status.turns = toFinite(entity.status.turns, 3) - 1;
    if (entity.status.turns <= 0) {
        const name = entity.name || 'Monstro';
        entity.status = null;
        events.push({ type: 'STATUS_END', targetId: entity.instanceId || 'wild', text: `${name} se recuperou!` });
    }
}

function clearExpiredDefense(entity) {
    // Defesa dura até o dono agir de novo OU até ser atingido — o que vier primeiro.
    // Chamado no início do próprio turno para não durar para sempre.
    if (entity && entity.defending && entity._defendUsed) {
        entity.defending = false;
        entity._defendUsed = false;
    }
}

function processAction(attacker, defender, move, logArray, rng = Math.random, energyConfig = DEFAULT_ENERGY_CONFIG) {
    if (!attacker || !defender || !logArray) return;
    // Defesa do atacante expira quando ele volta a agir (evita defesa eterna).
    if (attacker.defending && attacker._defendUsed && (!move || move.type !== 'defend')) {
        attacker.defending = false;
        attacker._defendUsed = false;
    }
    if (!move) { logArray.push({ type: 'MSG', text: `${attacker.name} hesitou!` }); return; }

    // Imobilização por frozen/paralyzed — antes de gastar energia.
    if (attacker.status && STATUS_IMMOBILIZE_CHANCE[attacker.status.type]) {
        if (rng() < STATUS_IMMOBILIZE_CHANCE[attacker.status.type]) {
            logArray.push({ type: 'MSG', text: `${attacker.name} está ${immobilizeLabel(attacker.status.type)} e não conseguiu agir!` });
            return;
        }
    }

    const cost = toFinite(move.cost, 0);
    if (toFinite(attacker.energy, 0) < cost) {
        logArray.push({
            type: 'MSG',
            text: `${attacker.name} não tem energia suficiente! Precisa ${cost}, tem ${toFinite(attacker.energy, 0)}.`,
        });
        return;
    }
    attacker.energy = toFinite(attacker.energy, 0) - cost;

    logArray.push({
        type: 'USE_MOVE', actorId: attacker.instanceId || 'wild',
        moveName: move.name, moveIcon: move.icon,
        moveElement: move.element || 'beast', moveCategory: move.category || 'physical',
        moveType: move.type, cost, newEnergy: attacker.energy,
    });

    if (move.type === 'heal') {
        const oldHp = attacker.hp;
        const healAmount = toFinite(move.power, 0) + Math.floor(toFinite(attacker.maxHp, 1) * 0.1);
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + healAmount);
        // CAMINHO ÚNICO do rest: cura + bônus de energia (resolve duplicação +5 vs +2).
        if (move.id === 'rest') {
            const bonus = toFinite(energyConfig.restBonus, 2);
            attacker.energy = Math.min(toFinite(attacker.maxEnergy, 10), attacker.energy + bonus);
            logArray.push({
                type: 'HEAL', actorId: attacker.instanceId || 'wild',
                amount: attacker.hp - oldHp, newHp: attacker.hp,
                energyRestored: bonus, newEnergy: attacker.energy,
            });
        } else {
            logArray.push({ type: 'HEAL', actorId: attacker.instanceId || 'wild', amount: attacker.hp - oldHp, newHp: attacker.hp });
        }
        if (attacker.combo) attacker.combo = 0;
        return;
    }

    if (move.type === 'defend') {
        attacker.defending = true;
        attacker._defendUsed = false; // será consumido no próximo turno próprio ou ao ser atingido
        logArray.push({ type: 'MSG', text: `${attacker.name} se protegeu!` });
        if (attacker.combo) attacker.combo = 0;
        return;
    }

    // Ataque
    const evasionChance = Math.min(0.15, toFinite(defender.stats && defender.stats.speed, 0) / 1000);
    if (rng() < evasionChance) {
        logArray.push({ type: 'MSG', text: `${defender.name} esquivou!` });
        if (attacker.combo) attacker.combo = 0;
        return;
    }

    const defenseMultiplier = defender.defending ? 0.5 : 1.0;
    if (defender.defending) { defender.defending = false; defender._defendUsed = false; }

    const multiplier = getTypeEffectiveness(move.element, defender.type);
    const level = toFinite(attacker.level, 1) || 1;
    const atk = toFinite(attacker.stats && attacker.stats.attack, 1) || 1;
    const def = toFinite(defender.stats && defender.stats.defense, 1) || 1;
    const random = (Math.floor(rng() * 16) + 85) / 100;

    let damage = Math.floor((((level * 0.2 + 1.5) * toFinite(move.power, 0) * (atk / def)) / 65 + 2) * multiplier * random);
    damage = Math.floor(damage * defenseMultiplier);
    if (damage < 1) damage = 1;

    defender.hp = Math.max(0, toFinite(defender.hp, 0) - damage);

    logArray.push({
        type: 'ATTACK_HIT',
        attackerId: attacker.instanceId || 'wild',
        targetId: defender.instanceId || 'wild',
        damage, newHp: defender.hp,
        isEffective: multiplier > 1,
        isNotEffective: multiplier < 1 && multiplier > 0,
        isBlocked: multiplier === 0,
    });

    if (!defender.status && defender.hp > 0) {
        let statusChance = 0;
        let statusType = null;
        if (move.element === 'venom') { statusChance = 0.30; statusType = 'poison'; }
        else if (move.element === 'flame') { statusChance = 0.15; statusType = 'burn'; }
        else if (move.element === 'aqua') { statusChance = 0.10; statusType = 'frozen'; }
        else if (move.element === 'sky') { statusChance = 0.20; statusType = 'paralyzed'; }
        if (statusType && rng() < statusChance) {
            defender.status = { type: statusType, turns: 3 };
            logArray.push({
                type: 'STATUS_APPLIED', targetId: defender.instanceId || 'wild',
                status: statusType, text: (STATUS_MESSAGES[statusType] || ((n) => `${n} foi afetado!`))(defender.name),
            });
        }
    }
}

function pickEnemyMove(attacker, rng = Math.random) {
    const movesArr = Array.isArray(attacker && attacker.moves) ? attacker.moves : [];
    const energy = toFinite(attacker && attacker.energy, 999);
    const affordable = movesArr.filter((m) => m && toFinite(m.cost, 0) <= energy);
    const pool = affordable.length > 0 ? affordable : movesArr;
    if (pool.length > 0) return pool[Math.floor(rng() * pool.length)];
    const fallbackId = (MOVES_LIBRARY && MOVES_LIBRARY.rest) ? 'rest' : Object.keys(MOVES_LIBRARY || {})[0];
    if (!fallbackId) return null;
    return { ...MOVES_LIBRARY[fallbackId], id: fallbackId };
}

function performEnemyTurn(attacker, defender, events, rng = Math.random, energyConfig = DEFAULT_ENERGY_CONFIG) {
    try {
        const picked = pickEnemyMove(attacker, rng);
        if (!picked) {
            if (events) events.push({ type: 'MSG', text: `${(attacker && attacker.name) || 'Inimigo'} ficou sem ataques!` });
            return;
        }
        processAction(attacker, defender, picked, events, rng, energyConfig);
    } catch (e) {
        if (events) events.push({ type: 'MSG', text: 'O inimigo hesitou...' });
    }
}

// Fórmula de captura pura — mesma do jogo, extraída para teste.
function calculateCaptureChance({ hp, maxHp, catchRate, hasStatus }) {
    const hpPercent = maxHp > 0 ? hp / maxHp : 1;
    const hpBonus = 1 - Math.max(0, Math.min(1, hpPercent));
    const statusMultiplier = hasStatus ? 2.0 : 1.0;
    const baseChance = Number(catchRate) || 0.3;
    const chance = baseChance * (0.3 + hpBonus * 0.7) * statusMultiplier;
    return Math.max(0.05, Math.min(0.98, chance));
}

function rollCapture(chance, rng = Math.random) {
    return rng() < chance;
}

module.exports = {
    DEFAULT_ENERGY_CONFIG,
    applyStatusDamage,
    processAction,
    performEnemyTurn,
    pickEnemyMove,
    calculateCaptureChance,
    rollCapture,
    isImmobilizedByStatus,
    clearExpiredDefense,
};
