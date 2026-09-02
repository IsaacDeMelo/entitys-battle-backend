require('dotenv').config();
const mongoose = require('mongoose');
const { BaseEntity, NPC, GameMap, ItemDefinition, PlayerSkin, BossEvent } = require('../models');
const { uploadBase64 } = require('../lib/cloudinary');

const MONGO_URI = process.env.MONGO_URI;
const DELAY_MS = 300;

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function isBase64DataUrl(s) {
    return typeof s === 'string' && s.startsWith('data:image');
}

function isBase64Raw(s) {
    if (typeof s !== 'string' || s.length < 100) return false;
    return /^[A-Za-z0-9+/=\s]{100,}$/.test(s);
}

async function migrateEntities() {
    const docs = await BaseEntity.find({}).lean();
    let migrated = 0;
    for (const doc of docs) {
        if (!doc.sprite || !isBase64DataUrl(doc.sprite)) continue;
        try {
            console.log(`  [entities] ${doc.id || doc._id} — uploading sprite...`);
            const url = await uploadBase64(doc.sprite, 'entities', `entity_${doc.id || doc._id}`);
            await BaseEntity.updateOne({ _id: doc._id }, { $set: { sprite: url } });
            migrated++;
            console.log(`  [entities] ${doc.id || doc._id} — OK → ${url.substring(0, 60)}...`);
        } catch (e) {
            console.error(`  [entities] ${doc.id || doc._id} — FAILED: ${e.message}`);
        }
        await sleep(DELAY_MS);
    }
    return migrated;
}

async function migrateNPCs() {
    const docs = await NPC.find({}).lean();
    let migrated = 0;
    for (const doc of docs) {
        let changed = false;
        const updates = {};

        if (doc.skin && isBase64DataUrl(doc.skin)) {
            try {
                const url = await uploadBase64(doc.skin, 'npcs', `npc_skin_${doc._id}`);
                updates.skin = url;
                updates.isCustomSkin = true;
                changed = true;
                console.log(`  [npcs] ${doc._id} skin — OK`);
            } catch (e) {
                console.error(`  [npcs] ${doc._id} skin — FAILED: ${e.message}`);
            }
            await sleep(DELAY_MS);
        }

        if (doc.battleBackground && isBase64DataUrl(doc.battleBackground)) {
            try {
                const url = await uploadBase64(doc.battleBackground, 'npcs', `npc_bg_${doc._id}`);
                updates.battleBackground = url;
                changed = true;
                console.log(`  [npcs] ${doc._id} battleBg — OK`);
            } catch (e) {
                console.error(`  [npcs] ${doc._id} battleBg — FAILED: ${e.message}`);
            }
            await sleep(DELAY_MS);
        }

        if (changed) {
            await NPC.updateOne({ _id: doc._id }, { $set: updates });
            migrated++;
        }
    }
    return migrated;
}

async function migrateMaps() {
    const docs = await GameMap.find({}).lean();
    let migrated = 0;
    for (const doc of docs) {
        let changed = false;
        const updates = {};

        for (const field of ['bgImage', 'foregroundImage', 'battleBackground']) {
            if (doc[field] && isBase64DataUrl(doc[field])) {
                try {
                    const url = await uploadBase64(doc[field], 'maps', `map_${doc._id}_${field}`);
                    updates[field] = url;
                    changed = true;
                    console.log(`  [maps] ${doc._id} ${field} — OK`);
                } catch (e) {
                    console.error(`  [maps] ${doc._id} ${field} — FAILED: ${e.message}`);
                }
                await sleep(DELAY_MS);
            }
        }

        if (doc.objects && Array.isArray(doc.objects)) {
            let objsChanged = false;
            for (let i = 0; i < doc.objects.length; i++) {
                const obj = doc.objects[i];
                if (obj.image && isBase64DataUrl(obj.image)) {
                    try {
                        const url = await uploadBase64(obj.image, 'maps', `map_${doc._id}_obj${i}`);
                        obj.image = url;
                        objsChanged = true;
                        console.log(`  [maps] ${doc._id} object[${i}] — OK`);
                    } catch (e) {
                        console.error(`  [maps] ${doc._id} object[${i}] — FAILED: ${e.message}`);
                    }
                    await sleep(DELAY_MS);
                }
            }
            if (objsChanged) {
                updates.objects = doc.objects;
                changed = true;
            }
        }

        if (changed) {
            await GameMap.updateOne({ _id: doc._id }, { $set: updates });
            migrated++;
        }
    }
    return migrated;
}

async function migratePlayerSkins() {
    const docs = await PlayerSkin.find({}).lean();
    let migrated = 0;
    for (const doc of docs) {
        const val = String(doc.pngBase64 || '');
        if (val.startsWith('http')) continue;
        if (!doc.pngBase64) continue;
        try {
            console.log(`  [skins] ${doc._id} — uploading...`);
            const url = await uploadBase64(doc.pngBase64, 'skins', `skin_${doc._id}`, 'image/png');
            await PlayerSkin.updateOne({ _id: doc._id }, { $set: { pngBase64: url } });
            migrated++;
            console.log(`  [skins] ${doc._id} — OK → ${url.substring(0, 60)}...`);
        } catch (e) {
            console.error(`  [skins] ${doc._id} — FAILED: ${e.message}`);
        }
        await sleep(DELAY_MS);
    }
    return migrated;
}

async function migrateItemIcons() {
    const docs = await ItemDefinition.find({}).lean();
    let migrated = 0;
    for (const doc of docs) {
        const val = String(doc.iconPngBase64 || '');
        if (val.startsWith('http')) continue;
        if (!doc.iconPngBase64) continue;
        try {
            console.log(`  [items] ${doc.id} — uploading icon...`);
            const buf = Buffer.from(doc.iconPngBase64, 'base64');
            const { uploadBuffer } = require('../lib/cloudinary');
            const url = await uploadBuffer(buf, 'items', `item_${doc.id}`, 'image/png');
            await ItemDefinition.updateOne({ _id: doc._id }, { $set: { iconPngBase64: url } });
            migrated++;
            console.log(`  [items] ${doc.id} — OK → ${url.substring(0, 60)}...`);
        } catch (e) {
            console.error(`  [items] ${doc.id} — FAILED: ${e.message}`);
        }
        await sleep(DELAY_MS);
    }
    return migrated;
}

async function migrateBossEvents() {
    const docs = await BossEvent.find({}).lean();
    let migrated = 0;
    for (const doc of docs) {
        let changed = false;
        const updates = {};

        const fields = ['trainerSkin'];
        if (doc.miniBosses && Array.isArray(doc.miniBosses)) {
            for (let i = 0; i < doc.miniBosses.length; i++) {
                fields.push(`miniBosses.${i}.trainerSkin`);
            }
        }
        if (doc.boss && doc.boss.trainerSkin) {
            fields.push('boss.trainerSkin');
        }

        for (const field of fields) {
            const val = field.split('.').reduce((o, k) => o && o[k], doc);
            if (val && isBase64DataUrl(val)) {
                try {
                    const safeName = field.replace(/\./g, '_');
                    const url = await uploadBase64(val, 'bosses', `boss_${doc._id}_${safeName}`);
                    updates[field] = url;
                    changed = true;
                    console.log(`  [bosses] ${doc._id} ${field} — OK`);
                } catch (e) {
                    console.error(`  [bosses] ${doc._id} ${field} — FAILED: ${e.message}`);
                }
                await sleep(DELAY_MS);
            }
        }

        if (changed) {
            await BossEvent.updateOne({ _id: doc._id }, { $set: updates });
            migrated++;
        }
    }
    return migrated;
}

async function main() {
    console.log('=== MIGRAÇÃO BASE64 → CLOUDINARY ===\n');

    await mongoose.connect(MONGO_URI);
    console.log('Conectado ao MongoDB.\n');

    console.log('1/6 — Entity sprites...');
    const e = await migrateEntities();
    console.log(`  → ${e} entities migrados.\n`);

    console.log('2/6 — NPC skins + battle backgrounds...');
    const n = await migrateNPCs();
    console.log(`  → ${n} NPCs migrados.\n`);

    console.log('3/6 — Map images...');
    const m = await migrateMaps();
    console.log(`  → ${m} maps migrados.\n`);

    console.log('4/6 — Player skins...');
    const s = await migratePlayerSkins();
    console.log(`  → ${s} skins migradas.\n`);

    console.log('5/6 — Item icons...');
    const i = await migrateItemIcons();
    console.log(`  → ${i} items migrados.\n`);

    console.log('6/6 — Boss event skins...');
    const b = await migrateBossEvents();
    console.log(`  → ${b} boss events migrados.\n`);

    console.log('=== MIGRAÇÃO CONCLUÍDA ===');
    console.log(`Total: ${e} entities, ${n} NPCs, ${m} maps, ${s} skins, ${i} items, ${b} boss events`);

    await mongoose.disconnect();
    process.exit(0);
}

main().catch(e => {
    console.error('ERRO FATAL:', e);
    process.exit(1);
});
