/*
 * Migração: preencher movePool com golpes globais (independente do tipo)
 *
 * Requisito: qualquer monstro pode usar qualquer golpe, e golpes podem se repetir
 * entre monstros.
 *
 * Regra:
 * - Por padrão, só altera entidades que ainda estejam com o "movePool padrão" antigo
 *   (o mesmo pra todos), para evitar sobrescrever trabalho manual.
 * - Com --force, sobrescreve todas.
 * - Sempre garante 4 golpes disponíveis no nível 1: 'strike' + 3 aleatórios.
 * - Depois distribui mais golpes em níveis maiores.
 *
 * Uso:
 *   node scripts/migrate_movepools_any.js
 *   node scripts/migrate_movepools_any.js --force
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');
const { BaseEntity } = require('../models');
const { MOVES_LIBRARY } = require('../gameData');

const FORCE = process.argv.includes('--force');

function normalizeMovePool(raw) {
    const arr = Array.isArray(raw) ? raw : [];
    return arr
        .map(m => {
            if (!m) return null;
            if (typeof m === 'string') return { moveId: String(m).trim(), level: 1 };
            const moveIdRaw = (m.moveId != null) ? m.moveId : (m.id != null ? m.id : (m.move != null ? m.move : ''));
            const moveId = (moveIdRaw != null) ? String(moveIdRaw).trim() : '';
            const level = Number.isFinite(m.level) ? m.level : (parseInt(m.level, 10) || 1);
            if (!moveId) return null;
            return { moveId, level: Math.max(1, level) };
        })
        .filter(Boolean);
}

function signatureFor(pool) {
    const ids = normalizeMovePool(pool).map(m => m.moveId).filter(Boolean);
    const unique = Array.from(new Set(ids)).sort();
    return unique.join('|');
}

// Assinatura do "padrão antigo" (tudo BEAST). Isso evita sobrescrever movePools já variados.
const DEFAULT_BAD_SIGNATURE = 'body_crash|claw_swipe|headbutt|primal_roar|rend|rush|strike';

function hashStringToUint32(str) {
    // FNV-1a 32-bit
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed) {
    return function () {
        let t = (seed += 0x6D2B79F5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function shuffled(array, rand) {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

function buildMovePoolGlobal(entityId) {
    const allMoveIds = Object.keys(MOVES_LIBRARY)
        .filter(id => id && id !== 'strike');

    const rand = mulberry32(hashStringToUint32(String(entityId || '')));
    const pickOrder = shuffled(allMoveIds, rand);

    // Quantos golpes além do strike.
    // 3 no nível 1 (pra dar 4 golpes no começo) + 6 em níveis maiores.
    const picked = pickOrder.slice(0, 9);

    const pool = [{ moveId: 'strike', level: 1 }];

    // Nível 1: 3 golpes aleatórios
    for (let i = 0; i < Math.min(3, picked.length); i++) {
        pool.push({ moveId: picked[i], level: 1 });
    }

    // Restante em níveis maiores
    const rest = picked.slice(3);
    const levelBuckets = [5, 5, 10, 10, 20, 20];
    for (let i = 0; i < rest.length; i++) {
        pool.push({ moveId: rest[i], level: levelBuckets[i] || 5 });
    }

    // Remove duplicados dentro do próprio pool e valida
    const seen = new Set();
    return pool.filter(m => {
        if (!m || !m.moveId) return false;
        if (!MOVES_LIBRARY[m.moveId]) return false;
        if (seen.has(m.moveId)) return false;
        seen.add(m.moveId);
        return true;
    });
}

async function main() {
    console.log('🛠️ Migração de movePool global (qualquer tipo)...');
    console.log(FORCE ? 'Modo: --force (sobrescreve tudo)' : 'Modo: seguro (só corrige movePool padrão antigo)');

    await mongoose.connect(MONGO_URI);

    const entities = await BaseEntity.find({}, { id: 1, name: 1, movePool: 1 }).lean();
    let changed = 0;
    let skipped = 0;

    for (const e of entities) {
        const sig = signatureFor(e.movePool);
        const shouldChange = FORCE || sig === DEFAULT_BAD_SIGNATURE;

        if (!shouldChange) {
            skipped++;
            continue;
        }

        const newPool = buildMovePoolGlobal(e.id);
        await BaseEntity.updateOne({ id: e.id }, { $set: { movePool: newPool } });
        changed++;
    }

    await mongoose.disconnect();

    console.log(`✅ Concluído. Alteradas: ${changed} | Mantidas: ${skipped}`);
    console.log('Dica: rode npm run inspect:movepools para validar.');
}

main().catch(async (e) => {
    console.error('❌ Falha na migração:', e && e.message ? e.message : e);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
});
