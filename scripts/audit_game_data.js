const fs = require('fs');
const path = require('path');
const { validateEntityDefinition } = require('../lib/gameRules');

function loadJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function mapLegacyEntity(raw) {
    return {
        id: raw.id,
        name: raw.name,
        type: raw.type,
        baseStats: {
            hp: raw.hp,
            energy: raw.energy,
            attack: raw.stats && raw.stats.attack,
            defense: raw.stats && raw.stats.defense,
            speed: raw.stats && raw.stats.speed
        },
        movePool: Array.isArray(raw.moves) ? raw.moves.map(move => ({ moveId: move.id, level: 1 })) : []
    };
}

function main() {
    const databasePath = path.join(__dirname, '..', 'database.json');
    const rawEntries = loadJson(databasePath);
    const entries = Array.isArray(rawEntries) ? rawEntries : [];
    const issues = [];

    entries.forEach((entry, index) => {
        const validation = validateEntityDefinition(mapLegacyEntity(entry));
        if (!validation.ok) {
            issues.push({
                index,
                id: entry && entry.id,
                name: entry && entry.name,
                errors: validation.errors
            });
        }
    });

    if (issues.length === 0) {
        console.log('Audit OK: nenhum problema encontrado em database.json');
        return;
    }

    console.error(`Audit FAILED: ${issues.length} entidade(s) inválida(s) em database.json`);
    for (const issue of issues) {
        console.error(`- [${issue.index}] ${issue.name || '(sem nome)'} (${issue.id || 'sem id'}): ${issue.errors.join('; ')}`);
    }
    process.exitCode = 1;
}

main();