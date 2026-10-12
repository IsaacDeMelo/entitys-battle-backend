const test = require('node:test');
const assert = require('node:assert/strict');

const {
    applyStatusDamage,
    processAction,
    pickEnemyMove,
    calculateCaptureChance,
    isImmobilizedByStatus,
} = require('../lib/battleEngine');

function mkEntity(over = {}) {
    return {
        instanceId: 't1', name: 'Test', level: 5,
        hp: 100, maxHp: 100, energy: 10, maxEnergy: 10,
        stats: { attack: 50, defense: 50, speed: 50 },
        moves: [], status: null, defending: false,
        ...over,
    };
}

test('burn causa 1/16 e poison 1/8; frozen/paralyzed só expiram', () => {
    const p = mkEntity({ status: { type: 'poison', turns: 3 } });
    applyStatusDamage(p, []);
    assert.equal(p.hp, 100 - Math.floor(100 / 8));

    const b = mkEntity({ status: { type: 'burn', turns: 3 } });
    applyStatusDamage(b, []);
    assert.equal(b.hp, 100 - Math.floor(100 / 16));

    const f = mkEntity({ status: { type: 'frozen', turns: 3 } });
    applyStatusDamage(f, []);
    assert.equal(f.hp, 100);
    assert.equal(f.status.turns, 2);
});

test('frozen/paralyzed podem imobilizar; poison/burn nunca', () => {
    assert.equal(isImmobilizedByStatus(mkEntity(), () => 0), false);
    assert.equal(isImmobilizedByStatus(mkEntity({ status: { type: 'poison', turns: 3 } }), () => 0), false);
    assert.equal(isImmobilizedByStatus(mkEntity({ status: { type: 'frozen', turns: 3 } }), () => 0), true);
    assert.equal(isImmobilizedByStatus(mkEntity({ status: { type: 'frozen', turns: 3 } }), () => 0.99), false);
});

test('rest usa caminho único: cura + restBonus, sem +5 fantasma', () => {
    const a = mkEntity({ hp: 50, energy: 5 });
    const d = mkEntity();
    const move = { id: 'rest', name: 'Rest', type: 'heal', power: 60, cost: 0 };
    processAction(a, d, move, [], () => 0.99, { maxEnergy: 10, restBonus: 2 });
    assert.ok(a.hp > 50);
    assert.equal(a.energy, 7);
});

test('defesa não dura para sempre: consome ao ser atingido', () => {
    const a = mkEntity();
    const d = mkEntity({ defending: true, _defendUsed: false, hp: 100, maxHp: 100 });
    const move = { id: 'strike', name: 'Strike', type: 'attack', power: 40, cost: 1, element: 'beast' };
    processAction(a, d, move, [], () => 0.99);
    assert.equal(d.defending, false);
});

test('inimigo prefere golpe que tem energia para usar', () => {
    const atk = mkEntity({ energy: 1, moves: [
        { id: 'big', name: 'Big', type: 'attack', power: 120, cost: 6 },
        { id: 'small', name: 'Small', type: 'attack', power: 20, cost: 1 },
    ]});
    const picked = pickEnemyMove(atk, () => 0);
    assert.equal(picked.id, 'small');
});

test('captura: HP baixo + status aumenta chance, clamp 5%-98%', () => {
    const low = calculateCaptureChance({ hp: 1, maxHp: 100, catchRate: 0.5, hasStatus: true });
    const high = calculateCaptureChance({ hp: 100, maxHp: 100, catchRate: 0.5, hasStatus: false });
    assert.ok(low > high);
    assert.ok(low <= 0.98 && high >= 0.05);
});
