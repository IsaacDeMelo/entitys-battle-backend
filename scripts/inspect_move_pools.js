/*
 * Diagnóstico de movePool em BaseEntity (Mongo)
 * - Lista entidades com movePool vazio/ausente
 * - Detecta formatos legados (ex: { id, level } ao invés de { moveId, level })
 * - Detecta golpes que não existem no MOVES_LIBRARY
 *
 * Uso:
 *   MONGO_URI='...' node scripts/inspect_move_pools.js
 * ou apenas:
 *   node scripts/inspect_move_pools.js
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');
const { BaseEntity } = require('../models');
const { MOVES_LIBRARY } = require('../gameData');

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

async function main() {
    console.log('🔎 Inspecionando movePools em BaseEntity...');

    await mongoose.connect(MONGO_URI);

    const entities = await BaseEntity.find({}, { id: 1, name: 1, type: 1, movePool: 1 }).lean();
    console.log(`Total de entidades: ${entities.length}`);

    const missingOrEmpty = [];
    const legacyIdKey = [];
    const invalidMoves = new Map();

    const signatureCounts = new Map();

    for (const e of entities) {
        const poolRaw = e.movePool;
        const poolNorm = normalizeMovePool(poolRaw);

        if (!Array.isArray(poolRaw) || poolNorm.length === 0) {
            missingOrEmpty.push(e);
        }

        // Detecta formato legado
        if (Array.isArray(poolRaw) && poolRaw.some(x => x && typeof x === 'object' && x.id != null && x.moveId == null)) {
            legacyIdKey.push(e);
        }

        // Detecta golpes inexistentes
        for (const m of poolNorm) {
            if (!MOVES_LIBRARY[m.moveId]) {
                const list = invalidMoves.get(e.id) || { entity: e, moveIds: new Set() };
                list.moveIds.add(m.moveId);
                invalidMoves.set(e.id, list);
            }
        }

        const sig = signatureFor(poolRaw);
        signatureCounts.set(sig, (signatureCounts.get(sig) || 0) + 1);
    }

    console.log(`\nmovePool ausente/vazio: ${missingOrEmpty.length}`);
    missingOrEmpty.slice(0, 20).forEach(e => console.log(`- ${e.id} | ${e.name} | ${e.type}`));
    if (missingOrEmpty.length > 20) console.log(`... +${missingOrEmpty.length - 20} outros`);

    console.log(`\nFormato legado (usa { id } ao invés de { moveId }): ${legacyIdKey.length}`);
    legacyIdKey.slice(0, 20).forEach(e => console.log(`- ${e.id} | ${e.name} | ${e.type}`));
    if (legacyIdKey.length > 20) console.log(`... +${legacyIdKey.length - 20} outros`);

    console.log(`\nEntidades com golpes inválidos (fora do MOVES_LIBRARY): ${invalidMoves.size}`);
    Array.from(invalidMoves.values()).slice(0, 20).forEach(({ entity, moveIds }) => {
        console.log(`- ${entity.id} | ${entity.name}: ${Array.from(moveIds).join(', ')}`);
    });
    if (invalidMoves.size > 20) console.log(`... +${invalidMoves.size - 20} outros`);

    const topSignatures = Array.from(signatureCounts.entries())
        .filter(([sig, count]) => count > 1)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);

    console.log(`\nTop 10 movePools repetidos (assinatura -> quantidade):`);
    if (topSignatures.length === 0) {
        console.log('- (nenhum repetido)');
    } else {
        topSignatures.forEach(([sig, count]) => {
            const pretty = sig ? sig : '(vazio)';
            console.log(`- ${count}x -> ${pretty}`);
        });
    }

    await mongoose.disconnect();
    console.log('\n✅ Diagnóstico concluído.');
}

main().catch(async (e) => {
    console.error('❌ Falha no diagnóstico:', e && e.message ? e.message : e);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
});
