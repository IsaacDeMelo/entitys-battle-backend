/* Shared SpriteCollab sheets for followers and battle artwork. */
(function (global) {
  'use strict';
  const BASE = 'https://raw.githubusercontent.com/PMDCollab/SpriteCollab/master/sprite';
  const DIRECTIONS = { down: 0, downRight: 1, right: 2, upRight: 3, up: 4, upLeft: 5, left: 6, downLeft: 7 };
  const cache = new Map();
  const TTL = 10 * 60 * 1000;

  async function xmlText(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error('SpriteCollab metadata unavailable');
      return await response.text();
    } finally { clearTimeout(timer); }
  }
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      const timer = setTimeout(() => { image.onload = image.onerror = null; reject(new Error('SpriteCollab image timeout')); }, 8000);
      image.crossOrigin = 'anonymous';
      image.onload = () => { clearTimeout(timer); resolve(image); };
      image.onerror = () => { clearTimeout(timer); reject(new Error('SpriteCollab image unavailable')); };
      image.src = url;
    });
  }
  function metadata(xml, name, seen = new Set()) {
    if (seen.has(name)) return null;
    seen.add(name);
    const anim = [...xml.querySelectorAll('Anim')].find(node => node.querySelector('Name')?.textContent.trim() === name);
    if (!anim) return null;
    const copy = anim.querySelector('CopyOf')?.textContent.trim();
    if (copy) return metadata(xml, copy, seen);
    const fw = Number(anim.querySelector('FrameWidth')?.textContent);
    const fh = Number(anim.querySelector('FrameHeight')?.textContent);
    if (!(fw > 0 && fh > 0)) return null;
    const durations = [...anim.querySelectorAll('Duration')].map(node => Math.max(16, Math.min(2000, (Number(node.textContent) || 8) * 1000 / 60)));
    return { name, fw, fh, durations };
  }
  async function fetchSheets(id) {
    const base = `${BASE}/${String(id).padStart(4, '0')}`;
    const xml = new DOMParser().parseFromString(await xmlText(`${base}/AnimData.xml`), 'text/xml');
    async function sheet(name) {
      const meta = metadata(xml, name);
      if (!meta) return null;
      try {
        const img = await loadImage(`${base}/${meta.name}-Anim.png`);
        const cols = Math.floor(img.width / meta.fw), rows = Math.floor(img.height / meta.fh);
        if (!cols || !rows) return null;
        const framesPerDir = Math.min(cols, meta.durations.length || cols);
        return { ...meta, img, cols, rows, framesPerDir };
      } catch (_) { return null; }
    }
    const [walk, idle] = await Promise.all([sheet('Walk'), sheet('Idle')]);
    if (!walk && !idle) return null;
    const first = walk || idle;
    // One source-pixel scale across directions and Idle/Walk, independent of padding.
    let referenceExtent = 1;
    for (const data of [walk, idle].filter(Boolean)) for (let row = 0; row < Math.min(data.rows, 8); row++) {
      const bounds = contentBounds(data, row);
      referenceExtent = Math.max(referenceExtent, bounds.width, bounds.height);
    }
    for (const data of [walk, idle].filter(Boolean)) data.referenceExtent = referenceExtent;
    return { walk: walk || idle, idle: idle || walk, fw: first.fw, fh: first.fh, framesPerDir: first.framesPerDir };
  }
  function load(dexOrder) {
    const id = Number(dexOrder);
    if (!Number.isInteger(id) || id <= 0 || id > 9999) return Promise.resolve(null);
    const entry = cache.get(id);
    if (entry && Date.now() - entry.createdAt < TTL) return entry.promise;
    const promise = fetchSheets(id).catch(() => null).then(data => { if (!data && cache.get(id)?.promise === promise) cache.delete(id); return data; });
    cache.set(id, { promise, createdAt: Date.now() });
    if (cache.size > 128) cache.delete(cache.keys().next().value);
    return promise;
  }
  function contentBounds(data, row) {
    data.contentBounds = data.contentBounds || new Map();
    if (data.contentBounds.has(row)) return data.contentBounds.get(row);
    let bounds = { x: 0, y: 0, width: data.fw, height: data.fh };
    try {
      const sample = document.createElement('canvas');
      sample.width = data.fw * data.framesPerDir;
      sample.height = data.fh;
      const ctx = sample.getContext('2d');
      ctx.drawImage(data.img, 0, row * data.fh, sample.width, data.fh, 0, 0, sample.width, data.fh);
      const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
      let left = data.fw, top = data.fh, right = -1, bottom = -1;
      for (let y = 0; y < sample.height; y++) for (let x = 0; x < sample.width; x++) {
        if (!pixels[(y * sample.width + x) * 4 + 3]) continue;
        const localX = x % data.fw;
        left = Math.min(left, localX); right = Math.max(right, localX);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
      if (right >= left && bottom >= top) bounds = { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
    } catch (_) { /* Keep the original frame if pixel reads are unavailable. */ }
    data.contentBounds.set(row, bounds);
    return bounds;
  }
  function drawFrame(canvas, data, frame, direction, fitContent = false) {
    if (!canvas || !data) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;
    const row = Math.min(DIRECTIONS[direction] ?? 0, data.rows - 1);
    const col = frame % Math.max(1, data.framesPerDir);
    const options = typeof fitContent === 'object' ? fitContent : { fitContent };
    const bounds = options.fitContent ? contentBounds(data, row) : { x: 0, y: 0, width: data.fw, height: data.fh };
    const padding = options.padding ?? (options.fitContent ? 12 : 0);
    const fit = Math.min((canvas.width - padding) / bounds.width, (canvas.height - padding) / bounds.height);
    const fraction = Math.max(0.1, Math.min(1, options.sizeFraction ?? 1));
    const referenceExtent = data.referenceExtent || Math.max(bounds.width, bounds.height);
    const scale = options.uniformScale
      ? Math.min(fit, Math.min(canvas.width - padding, canvas.height - padding) * fraction / referenceExtent)
      : fit >= 1 ? Math.floor(fit) : fit;
    const width = bounds.width * scale, height = bounds.height * scale;
    const y = options.anchor === 'bottom' ? canvas.height - padding / 2 - height : (canvas.height - height) / 2;
    ctx.drawImage(data.img, col * data.fw + bounds.x, row * data.fh + bounds.y, bounds.width, bounds.height, (canvas.width - width) / 2, y, width, height);
  }
  global.SpriteCollab = { load, drawFrame, DIRECTIONS };
})(window);
