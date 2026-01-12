#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
let sharp;
try { sharp = require('sharp'); } catch (e) { console.error('Missing dependency sharp. Run `npm install` before using --apply.'); }
const { MONGO_URI } = require('../config');
const { GameMap } = require('../models');

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads', 'maps');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

function isBase64Image(s) {
    return typeof s === 'string' && s.trim().length > 200 && (s.startsWith('data:image/') || /^[A-Za-z0-9+/=\s]+$/.test(s));
}

function extractBase64(s) {
    if (!s) return null;
    if (s.indexOf('base64,') !== -1) return s.split('base64,')[1];
    return s.replace(/^data:[^;]+;base64,?/, '').trim();
}

async function processMap(map, applyChanges) {
    const updates = {};
    const backups = {};

    // bgImage
    if (isBase64Image(map.bgImage)) {
        const b64 = extractBase64(map.bgImage);
        const buf = Buffer.from(b64, 'base64');
        const outName = `${map.mapId.replace(/[^a-z0-9_-]/ig,'')}_bg.png`;
        const outPath = path.join(UPLOADS_DIR, outName);
        try {
            if (!sharp) throw new Error('sharp not installed');
            await sharp(buf).png({ compressionLevel: 8 }).toFile(outPath);
            updates.bgImage = `/uploads/maps/${outName}`;
            backups.bgImageBackup = map.bgImage;
            console.log(`Converted bgImage for ${map.mapId} -> ${outName}`);
        } catch (e) {
            console.error('sharp error:', e.message || e);
        }
    }

    // foregroundImage
    if (isBase64Image(map.foregroundImage)) {
        const b64 = extractBase64(map.foregroundImage);
        const buf = Buffer.from(b64, 'base64');
        const outName = `${map.mapId.replace(/[^a-z0-9_-]/ig,'')}_fg.png`;
        const outPath = path.join(UPLOADS_DIR, outName);
        try {
            if (!sharp) throw new Error('sharp not installed');
            await sharp(buf).png({ compressionLevel: 8 }).toFile(outPath);
            updates.foregroundImage = `/uploads/maps/${outName}`;
            backups.foregroundImageBackup = map.foregroundImage;
            console.log(`Converted foregroundImage for ${map.mapId} -> ${outName}`);
        } catch (e) { console.error('sharp error fg:', e.message || e); }
    }

    // objects[].image
    if (Array.isArray(map.objects)) {
        const objs = JSON.parse(JSON.stringify(map.objects));
        let changed = false;
        for (let i = 0; i < objs.length; i++) {
            const img = objs[i] && objs[i].image;
            if (isBase64Image(img)) {
                const b64 = extractBase64(img);
                const buf = Buffer.from(b64, 'base64');
                const outName = `${map.mapId.replace(/[^a-z0-9_-]/ig,'')}_obj${i}.png`;
                const outPath = path.join(UPLOADS_DIR, outName);
                try {
                    if (!sharp) throw new Error('sharp not installed');
                    await sharp(buf).png({ compressionLevel: 8 }).toFile(outPath);
                    objs[i].image = `/uploads/maps/${outName}`;
                    changed = true;
                    console.log(`Converted object ${i} for ${map.mapId} -> ${outName}`);
                } catch (e) { console.error('sharp obj error:', e.message || e); }
            }
        }
        if (changed) updates.objects = objs;
    }

    if (Object.keys(updates).length === 0) return { changed: false };

    if (!applyChanges) return { changed: true, updates, backups };

    try {
        const set = Object.assign({}, updates, backups);
        await GameMap.findOneAndUpdate({ mapId: map.mapId }, { $set: set });
        return { changed: true, applied: true };
    } catch (e) {
        console.error('DB update error for', map.mapId, e.message || e);
        return { changed: true, applied: false, error: e };
    }
}

async function main() {
    const apply = process.argv.includes('--apply');
    console.log('Dry-run mode (no DB changes) by default. Use --apply to write files and update DB.');
    console.log('Connect to MongoDB:', MONGO_URI.replace(/:[^:]+@/, ':***@'));
    await mongoose.connect(MONGO_URI, { maxPoolSize: 5 });
    console.log('Connected to MongoDB');

    const maps = await GameMap.find({}).lean();
    const candidates = maps.filter(m => isBase64Image(m.bgImage) || isBase64Image(m.foregroundImage) || (Array.isArray(m.objects) && m.objects.some(o => isBase64Image(o && o.image))));
    console.log(`Found ${candidates.length} maps with embedded images (candidates).`);
    for (const map of candidates) {
        console.log('Processing', map.mapId);
        const res = await processMap(map, apply);
        if (!apply) console.log('Dry-run result:', res.updates ? Object.keys(res.updates) : 'no updates');
        else console.log('Apply result:', res);
    }

    await mongoose.disconnect();
    console.log('Done');
}

main().catch(e => { console.error(e); process.exit(1); });
