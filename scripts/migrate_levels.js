// scripts/migrate_levels.js
// Normaliza níveis de todos os usuários segundo a nova fórmula de XP.
// Uso: node scripts/migrate_levels.js [--dry]

const mongoose = require('mongoose');
const { getXpForNextLevel } = require('../gameData');
const { User, BasePokemon } = require('../models');

const { MONGO_URI } = require('../config');

function calculateStats(base, level) {
    const mult = 1 + (level * 0.05);
    return {
        hp: Math.floor((base.hp * 2 * level / 100) + level + 10),
        energy: Math.floor(base.energy + (level * 0.1)),
        attack: Math.floor(base.attack * mult),
        defense: Math.floor(base.defense * mult),
        speed: Math.floor(base.speed * mult)
    };
}

(async () => {
    const dry = process.argv.includes('--dry');
    console.log(`Connecting to DB ${MONGO_URI}... (dry=${dry})`);
    await mongoose.connect(MONGO_URI, { connectTimeoutMS: 5000 }).catch(e => { console.error('DB error', e); process.exit(1); });

    const users = await User.find();
    let totalLeveled = 0;
    for (let u of users) {
        let changed = false;
        for (let p of u.pokemonTeam) {
            const base = await BasePokemon.findOne({ id: p.baseId });
            if (!base) continue;
            // Normalize xp -> if xp is higher than threshold, level up until fits
            let loopCount = 0;
            while (p.level < 100 && p.xp >= getXpForNextLevel(p.level)) {
                const need = getXpForNextLevel(p.level);
                p.xp -= need;
                p.level += 1;
                loopCount++;
                changed = true;
            }
            if (loopCount > 0) {
                totalLeveled += loopCount;
                // Recalculate stats based on final level
                const newStats = calculateStats(base.baseStats, p.level);
                p.stats = newStats;
                // cap currentHp to new max
                if (!p.currentHp || p.currentHp > newStats.hp) p.currentHp = newStats.hp;
                console.log(`User ${u._id} - ${p.nickname || p.baseId}: +${loopCount} levels -> Lvl ${p.level}`);
            }
        }
        if (changed && !dry) await u.save();
    }

    console.log(`Done. Total levels applied: ${totalLeveled}`);
    process.exit(0);
})();