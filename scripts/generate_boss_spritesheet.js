const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// Boss spritesheet generator
// Layout matches the city engine player skins:
// - 4 columns (frames) x 4 rows (directions)
// - each frame is 48x48
// - rows: down, left, right, up (same as city.ejs)

const CELL = 48;
const COLS = 4;
const ROWS = 4;

const width = CELL * COLS;
const height = CELL * ROWS;

const COLORS = {
    outline: [18, 18, 18, 255],
    body: [132, 28, 44, 255],
    bodyDark: [94, 18, 30, 255],
    horn: [182, 182, 192, 255],
    eye: [245, 214, 88, 255],
    pupil: [20, 20, 20, 255],
    highlight: [196, 56, 74, 255]
};

function setPixel(png, x, y, rgba) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
    const idx = (png.width * y + x) << 2;
    png.data[idx] = rgba[0];
    png.data[idx + 1] = rgba[1];
    png.data[idx + 2] = rgba[2];
    png.data[idx + 3] = rgba[3];
}

function fillRect(png, x, y, w, h, rgba) {
    for (let yy = y; yy < y + h; yy++) {
        for (let xx = x; xx < x + w; xx++) {
            setPixel(png, xx, yy, rgba);
        }
    }
}

function strokeRect(png, x, y, w, h, rgba) {
    for (let xx = x; xx < x + w; xx++) {
        setPixel(png, xx, y, rgba);
        setPixel(png, xx, y + h - 1, rgba);
    }
    for (let yy = y; yy < y + h; yy++) {
        setPixel(png, x, yy, rgba);
        setPixel(png, x + w - 1, yy, rgba);
    }
}

function clearCell(png, cellX, cellY) {
    fillRect(png, cellX, cellY, CELL, CELL, [0, 0, 0, 0]);
}

function drawBossFrame(png, cellX, cellY, dir, frame) {
    // Pixel-art boss: a compact demon-like creature.
    // dir: 0 down, 1 left, 2 right, 3 up
    // frame: 0..3 (walk cycle)

    // Body box inside the 48x48 cell
    const bodyW = 24;
    const bodyH = 22;
    const bodyX = cellX + Math.floor((CELL - bodyW) / 2);
    const bodyY = cellY + 18;

    // Subtle bob for animation
    const bob = (frame === 1 || frame === 3) ? 1 : 0;

    // Legs animation
    const legOffset = (frame === 1) ? -1 : (frame === 3) ? 1 : 0;

    // Torso
    fillRect(png, bodyX + 1, bodyY + 1 + bob, bodyW - 2, bodyH - 2, COLORS.body);
    strokeRect(png, bodyX, bodyY + bob, bodyW, bodyH, COLORS.outline);

    // Belly shading
    fillRect(png, bodyX + 6, bodyY + 8 + bob, bodyW - 12, bodyH - 10, COLORS.bodyDark);

    // Highlight stripe
    for (let i = 0; i < 6; i++) setPixel(png, bodyX + 4 + i, bodyY + 4 + bob, COLORS.highlight);

    // Horns / head crest
    const hornY = bodyY + bob - 6;
    const hornLeftX = bodyX + 4;
    const hornRightX = bodyX + bodyW - 7;

    // Horn bases
    fillRect(png, hornLeftX, hornY + 3, 3, 3, COLORS.horn);
    fillRect(png, hornRightX, hornY + 3, 3, 3, COLORS.horn);
    // Horn tips
    setPixel(png, hornLeftX + 1, hornY + 1, COLORS.horn);
    setPixel(png, hornRightX + 1, hornY + 1, COLORS.horn);
    setPixel(png, hornLeftX + 1, hornY, COLORS.outline);
    setPixel(png, hornRightX + 1, hornY, COLORS.outline);

    // Outline horn stems
    setPixel(png, hornLeftX, hornY + 2, COLORS.outline);
    setPixel(png, hornLeftX + 2, hornY + 2, COLORS.outline);
    setPixel(png, hornRightX, hornY + 2, COLORS.outline);
    setPixel(png, hornRightX + 2, hornY + 2, COLORS.outline);

    // Face (not visible when facing up)
    if (dir !== 3) {
        const eyeY = bodyY + 7 + bob;
        if (dir === 0) {
            // Down: both eyes
            fillRect(png, bodyX + 6, eyeY, 4, 3, COLORS.eye);
            fillRect(png, bodyX + bodyW - 10, eyeY, 4, 3, COLORS.eye);
            setPixel(png, bodyX + 8, eyeY + 1, COLORS.pupil);
            setPixel(png, bodyX + bodyW - 8, eyeY + 1, COLORS.pupil);
        } else if (dir === 1) {
            // Left: one eye
            fillRect(png, bodyX + 6, eyeY, 4, 3, COLORS.eye);
            setPixel(png, bodyX + 7, eyeY + 1, COLORS.pupil);
        } else if (dir === 2) {
            // Right: one eye
            fillRect(png, bodyX + bodyW - 10, eyeY, 4, 3, COLORS.eye);
            setPixel(png, bodyX + bodyW - 9, eyeY + 1, COLORS.pupil);
        }

        // Mouth / fangs (down only)
        if (dir === 0) {
            const mouthY = bodyY + 13 + bob;
            fillRect(png, bodyX + 10, mouthY, 4, 2, COLORS.outline);
            setPixel(png, bodyX + 10, mouthY + 2, COLORS.horn);
            setPixel(png, bodyX + 13, mouthY + 2, COLORS.horn);
        }
    } else {
        // Up: add a spine ridge
        for (let i = 0; i < 6; i++) {
            setPixel(png, bodyX + Math.floor(bodyW / 2), bodyY + 4 + i + bob, COLORS.outline);
        }
    }

    // Arms (directional hint)
    const armY = bodyY + 11 + bob;
    if (dir === 1) {
        // left
        fillRect(png, bodyX - 2, armY, 3, 5, COLORS.body);
        strokeRect(png, bodyX - 2, armY, 3, 5, COLORS.outline);
    } else if (dir === 2) {
        // right
        fillRect(png, bodyX + bodyW - 1, armY, 3, 5, COLORS.body);
        strokeRect(png, bodyX + bodyW - 1, armY, 3, 5, COLORS.outline);
    } else {
        // down/up: both small arms
        fillRect(png, bodyX - 1, armY, 2, 4, COLORS.body);
        strokeRect(png, bodyX - 1, armY, 2, 4, COLORS.outline);
        fillRect(png, bodyX + bodyW - 1, armY, 2, 4, COLORS.body);
        strokeRect(png, bodyX + bodyW - 1, armY, 2, 4, COLORS.outline);
    }

    // Legs/feet
    const footY = bodyY + bodyH - 3 + bob;
    const leftFootX = bodyX + 6 + legOffset;
    const rightFootX = bodyX + bodyW - 10 - legOffset;
    fillRect(png, leftFootX, footY, 4, 3, COLORS.bodyDark);
    fillRect(png, rightFootX, footY, 4, 3, COLORS.bodyDark);
    strokeRect(png, leftFootX, footY, 4, 3, COLORS.outline);
    strokeRect(png, rightFootX, footY, 4, 3, COLORS.outline);

    // Tiny shadow for grounding
    fillRect(png, bodyX + 4, bodyY + bodyH + 1 + bob, bodyW - 8, 2, [0, 0, 0, 90]);
}

async function main() {
    const png = new PNG({ width, height });

    // Init transparent
    for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = 0;
        png.data[i + 1] = 0;
        png.data[i + 2] = 0;
        png.data[i + 3] = 0;
    }

    for (let dir = 0; dir < ROWS; dir++) {
        for (let frame = 0; frame < COLS; frame++) {
            const cellX = frame * CELL;
            const cellY = dir * CELL;
            clearCell(png, cellX, cellY);
            drawBossFrame(png, cellX, cellY, dir, frame);
        }
    }

    const outPath = path.join(__dirname, '..', 'public', 'uploads', 'boss_spritesheet.png');

    await new Promise((resolve, reject) => {
        const stream = fs.createWriteStream(outPath);
        stream.on('finish', resolve);
        stream.on('error', reject);
        png.pack().pipe(stream);
    });

    console.log('[generate_boss_spritesheet] Wrote:', outPath);
}

main().catch((err) => {
    console.error('[generate_boss_spritesheet] Failed:', err);
    process.exitCode = 1;
});
