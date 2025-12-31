const { PNG } = require('pngjs');

function isPngSignature(buffer) {
  if (!buffer || buffer.length < 8) return false;
  return (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  );
}

function stripTrailingAfterIend(buffer) {
  // Some generators append extra bytes after a valid PNG (after IEND).
  // Most viewers ignore it, but some decoders (including pngjs in some cases)
  // may fail with zlib errors like "unrecognised content at end of stream".
  if (!isPngSignature(buffer)) return buffer;

  try {
    let offset = 8;
    while (offset + 8 <= buffer.length) {
      const length = buffer.readUInt32BE(offset);
      const type = buffer.toString('ascii', offset + 4, offset + 8);
      const next = offset + 8 + length + 4; // len + type + data + crc
      if (next > buffer.length) break;
      if (type === 'IEND') {
        return buffer.slice(0, next);
      }
      offset = next;
    }
  } catch (_) {
    // If anything goes wrong, fall back to original buffer.
  }
  return buffer;
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function parseHexColor(hex) {
  const cleaned = String(hex || '').trim().replace(/^#/, '').toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(cleaned)) {
    throw new Error(`Cor inválida: "${hex}". Use 6 hex (ex: ff00ff).`);
  }
  const r = parseInt(cleaned.slice(0, 2), 16);
  const g = parseInt(cleaned.slice(2, 4), 16);
  const b = parseInt(cleaned.slice(4, 6), 16);
  return { r, g, b };
}

function rgbDistance(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function chromaKey(png, key, tolerance, feather) {
  const data = png.data;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const a = data[i + 3];
    if (a === 0) continue;

    const dist = rgbDistance(r, g, b, key.r, key.g, key.b);

    if (dist <= tolerance) {
      data[i + 3] = 0;
      continue;
    }

    if (feather > 0 && dist <= tolerance + feather) {
      const t = (dist - tolerance) / feather;
      const newAlpha = Math.round(255 * clamp(t, 0, 1));
      data[i + 3] = Math.min(a, newAlpha);
    }
  }
}

function despeckleByComponentSize(png, minSize) {
  if (!minSize || minSize <= 0) return;

  const { width, height, data } = png;
  const visited = new Uint8Array(width * height);
  const idx = (x, y) => y * width + x;
  const alphaAt = (x, y) => data[(idx(x, y) * 4) + 3];

  const stackX = [];
  const stackY = [];

  function clearComponent(pixels) {
    for (const p of pixels) {
      data[(p * 4) + 3] = 0;
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = idx(x, y);
      if (visited[p]) continue;
      visited[p] = 1;
      if (alphaAt(x, y) === 0) continue;

      const pixels = [];
      stackX.length = 0;
      stackY.length = 0;
      stackX.push(x);
      stackY.push(y);

      while (stackX.length) {
        const cx = stackX.pop();
        const cy = stackY.pop();
        const cp = idx(cx, cy);

        if (alphaAt(cx, cy) === 0) continue;
        pixels.push(cp);

        const n1x = cx - 1, n1y = cy;
        const n2x = cx + 1, n2y = cy;
        const n3x = cx, n3y = cy - 1;
        const n4x = cx, n4y = cy + 1;

        if (n1x >= 0) {
          const np = idx(n1x, n1y);
          if (!visited[np]) {
            visited[np] = 1;
            if (alphaAt(n1x, n1y) !== 0) { stackX.push(n1x); stackY.push(n1y); }
          }
        }
        if (n2x < width) {
          const np = idx(n2x, n2y);
          if (!visited[np]) {
            visited[np] = 1;
            if (alphaAt(n2x, n2y) !== 0) { stackX.push(n2x); stackY.push(n2y); }
          }
        }
        if (n3y >= 0) {
          const np = idx(n3x, n3y);
          if (!visited[np]) {
            visited[np] = 1;
            if (alphaAt(n3x, n3y) !== 0) { stackX.push(n3x); stackY.push(n3y); }
          }
        }
        if (n4y < height) {
          const np = idx(n4x, n4y);
          if (!visited[np]) {
            visited[np] = 1;
            if (alphaAt(n4x, n4y) !== 0) { stackX.push(n4x); stackY.push(n4y); }
          }
        }
      }

      if (pixels.length > 0 && pixels.length < minSize) {
        clearComponent(pixels);
      }
    }
  }
}

function processPngBuffer(inputBuffer, options) {
  const keyHex = options?.key ?? 'ff00ff';
  const key = parseHexColor(keyHex);

  const tolerance = clamp(Number(options?.tolerance ?? 40) || 0, 0, 441);
  const feather = clamp(Number(options?.feather ?? 0) || 0, 0, 441);
  const despeckle = clamp(parseInt(String(options?.despeckle ?? 20), 10) || 0, 0, 10000000);

  const cleaned = stripTrailingAfterIend(inputBuffer);

  let png;
  try {
    png = PNG.sync.read(cleaned);
  } catch (e) {
    const msg = (e && e.message) ? e.message : String(e);
    throw new Error(
      `Falha ao ler PNG. Motivo: ${msg}. ` +
      `Dica: exporte/reesalve como PNG (sem JPG/WebP), e evite editores que adicionam compressão/metadata estranha.`
    );
  }
  chromaKey(png, key, tolerance, feather);
  despeckleByComponentSize(png, despeckle);

  const outputBuffer = PNG.sync.write(png, { colorType: 6 });
  return {
    outputBuffer,
    meta: {
      key: keyHex.replace(/^#/, ''),
      tolerance,
      feather,
      despeckle,
      width: png.width,
      height: png.height,
    },
  };
}

module.exports = {
  processPngBuffer,
};
