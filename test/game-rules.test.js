const test = require('node:test');
const assert = require('node:assert/strict');

const { getTypeEffectiveness, getXpForNextLevel } = require('../gameData');
const { calculateStats, normalizeMovePool, pickDeterministicMovesFromPool, validateEntityDefinition } = require('../lib/gameRules');

test('calculateStats sanitiza stats negativos e clampa nível inválido', () => {
    const stats = calculateStats({ hp: 0, energy: -5, attack: -1, defense: 8, speed: -10 }, 0);
    assert.equal(stats.hp, 11);
    assert.equal(stats.energy, 1);
    assert.equal(stats.attack, 0);
    assert.equal(stats.defense, 8);
    assert.equal(stats.speed, 0);
});

test('validateEntityDefinition rejeita tipo, stats e movePool inválidos', () => {
    const result = validateEntityDefinition({
        name: 'Broken',
        type: 'laser',
        baseStats: { hp: -1, energy: 2, attack: 3, defense: 4, speed: 5 },
        movePool: [{ moveId: 'nao_existe', level: 1 }]
    });

    assert.equal(result.ok, false);
    assert.match(result.errors.join(' | '), /type inválido/);
    assert.match(result.errors.join(' | '), /baseStats.hp deve ser >= 1/);
    assert.match(result.errors.join(' | '), /moveId desconhecido/);
});

test('normalizeMovePool remove moves desconhecidos e gera fallback por tipo', () => {
    const pool = normalizeMovePool([{ moveId: 'invalido', level: 1 }], 'flame');
    assert.ok(pool.length > 0);
    assert.equal(pool[0].level, 1);
});

test('pickDeterministicMovesFromPool mantém somente moves válidos e ordenados', () => {
    const moves = pickDeterministicMovesFromPool([
        { moveId: 'strike', level: 1 },
        { moveId: 'rapid_punch', level: 5 },
        { moveId: 'ghost_move', level: 10 },
        { moveId: 'steel_claw', level: 7 }
    ], 10, 2, 'metal');

    assert.deepEqual(moves, ['rapid_punch', 'steel_claw']);
});

test('type chart mantém bônus e fallback neutro', () => {
    assert.equal(getTypeEffectiveness('flame', 'forest'), 1.5);
    assert.equal(getTypeEffectiveness('desconhecido', 'forest'), 1);
    assert.equal(getTypeEffectiveness('flame', null), 1);
});

test('xp cresce de forma monotônica', () => {
    assert.ok(getXpForNextLevel(2) > getXpForNextLevel(1));
    assert.ok(getXpForNextLevel(10) > getXpForNextLevel(5));
});