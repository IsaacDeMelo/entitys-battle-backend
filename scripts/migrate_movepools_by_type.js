/*
 * Migração: preencher movePool por tipo (BaseEntity)
 *
 * Contexto: se todas as entidades estiverem com o mesmo movePool, o Custom Battle
 * (e batalhas em geral) acabam com golpes iguais.
 *
 * Regra:
 * - Por padrão, só altera entidades que ainda estejam com o "movePool padrão" (beast)
 * - Com --force, sobrescreve todas.
 * - Sempre garante 'strike' em nível 1.
 * - Seleciona golpes do MOVES_LIBRARY cujo element bate com entity.type.
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');
const { BaseEntity } = require('../models');
const { MOVES_LIBRARY, EntityType } = require('../gameData');

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

const DEFAULT_BAD_SIGNATURE = 'body_crash|claw_swipe|headbutt|primal_roar|rend|rush|strike';

function buildMovePoolForType(type) {
    const t = String(type || '').toLowerCase();
    const validType = Object.values(EntityType).includes(t) ? t : EntityType.BEAST;

    const candidates = Object.entries(MOVES_LIBRARY)
        .map(([id, def]) => ({ id, def }))
        .filter(x => x.def && x.def.element === validType)
        .filter(x => x.id !== 'strike');

    // Ordena por poder (baixo -> alto) pra distribuir melhor por nível
    candidates.sort((a, b) => (a.def.power || 0) - (b.def.power || 0));

    // pega até 8 golpes do tipo
    const picked = candidates.slice(0, 8).map(x => x.id);

    // distribuição de níveis simples (progressão)
    const levelBuckets = [1, 1, 5, 5, 10, 10, 20, 20];

    const pool = [{ moveId: 'strike', level: 1 }];
    for (let i = 0; i < picked.length; i++) {
        pool.push({ moveId: picked[i], level: levelBuckets[i] || 1 });
    }

    // remove duplicados e garante formato
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
    console.log('🛠️ Migração de movePool por tipo...');
    console.log(FORCE ? 'Modo: --force (sobrescreve tudo)' : 'Modo: seguro (só corrige movePool padrão)');

    await mongoose.connect(MONGO_URI);

    const entities = await BaseEntity.find({}, { id: 1, name: 1, type: 1, movePool: 1 }).lean();
    let changed = 0;
    let skipped = 0;

    for (const e of entities) {
        const sig = signatureFor(e.movePool);
        const shouldChange = FORCE || sig === DEFAULT_BAD_SIGNATURE;

        if (!shouldChange) {
            skipped++;
            continue;
        }

        const newPool = buildMovePoolForType(e.type);
        await BaseEntity.updateOne({ id: e.id }, { $set: { movePool: newPool } });
        changed++;
    }

    await mongoose.disconnect();

    console.log(`✅ Concluído. Alteradas: ${changed} | Mantidas: ${skipped}`);
    console.log('Dica: rode node scripts/inspect_move_pools.js para validar.');
}

main().catch(async (e) => {
    console.error('❌ Falha na migração:', e && e.message ? e.message : e);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
});
