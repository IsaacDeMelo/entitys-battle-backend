const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = file => fs.readFileSync(path.join(__dirname, '../public/scripts', file), 'utf8');

test('species scale keeps small, medium and large creatures ordered in battle and on the map', () => {
  const window = {};
  vm.runInNewContext(source('pokemon-sizes.js'), { window });
  const sizes = window.PokemonSizes;
  assert.equal(sizes.height(19), 3); // Rattata
  assert.equal(sizes.height(94), 15); // Gengar
  assert.equal(sizes.height(95), 88); // Onix
  assert.ok(sizes.battleFraction(19) < sizes.battleFraction(94));
  assert.ok(sizes.battleFraction(94) < sizes.battleFraction(95));
  assert.ok(sizes.followerPixels(sizes.height(19)) < sizes.followerPixels(sizes.height(94)));
  assert.ok(sizes.followerPixels(sizes.height(94)) < sizes.followerPixels(sizes.height(95)));
  assert.ok(sizes.followerPixels(10000) <= 64);
  assert.ok(sizes.followerPixels(1) >= 22);
  assert.ok(Number.isFinite(sizes.battleFraction('unknown')));
});

test('SpriteCollab crops the opposing direction rows without stretching the full sheet', () => {
  const window = {};
  vm.runInNewContext(source('spritecollab.js'), { window });
  const draws = [];
  const ctx = { clearRect() {}, drawImage(...args) { draws.push(args); } };
  const canvas = { width: 160, height: 160, getContext: () => ctx };
  const data = { img: {}, fw: 32, fh: 40, cols: 4, rows: 8, framesPerDir: 4 };
  window.SpriteCollab.drawFrame(canvas, data, 5, 'right');
  window.SpriteCollab.drawFrame(canvas, data, 0, 'left');
  assert.equal(draws[0][1], 32);
  assert.equal(draws[0][2], 80);
  assert.equal(draws[1][2], 240);
  assert.equal(draws[0][7], 128);
  assert.equal(draws[0][8], 160);
  assert.equal(ctx.imageSmoothingEnabled, false);
});

test('battle cropping uses stable visible bounds across frames instead of transparent margins', () => {
  const window = {};
  let reads = 0;
  const pixels = new Uint8ClampedArray(8 * 4 * 4);
  pixels[(1 * 8 + 1) * 4 + 3] = 255;
  pixels[(3 * 8 + 6) * 4 + 3] = 255;
  const document = { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData() { ++reads; return { data: pixels }; } }) }) };
  vm.runInNewContext(source('spritecollab.js'), { window, document });
  const draws = [];
  const canvas = { width: 160, height: 160, getContext: () => ({ clearRect() {}, drawImage(...args) { draws.push(args); } }) };
  const data = { img: {}, fw: 4, fh: 4, cols: 2, rows: 8, framesPerDir: 2 };
  window.SpriteCollab.drawFrame(canvas, data, 0, 'right', true);
  window.SpriteCollab.drawFrame(canvas, data, 1, 'right', true);
  assert.deepEqual(draws[0].slice(1, 5), [1, 9, 2, 3]);
  assert.deepEqual(draws[1].slice(1, 5), [5, 9, 2, 3]);
  assert.equal(reads, 1);
});

test('species scale is stable across directional frame geometry and stays anchored to the ground', () => {
  const window = {};
  vm.runInNewContext(source('spritecollab.js'), { window });
  const draws = [];
  const canvas = { width: 160, height: 160, getContext: () => ({ clearRect() {}, drawImage(...args) { draws.push(args); } }) };
  const data = { img: {}, fw: 64, fh: 64, cols: 2, rows: 8, framesPerDir: 2, referenceExtent: 40,
    contentBounds: new Map([[2, { x: 0, y: 0, width: 20, height: 30 }], [6, { x: 0, y: 0, width: 30, height: 25 }]]) };
  const options = { fitContent: true, uniformScale: true, sizeFraction: 0.5, anchor: 'bottom' };
  window.SpriteCollab.drawFrame(canvas, data, 0, 'right', options);
  window.SpriteCollab.drawFrame(canvas, data, 1, 'left', options);
  assert.equal(draws[0][7] / draws[0][3], draws[1][7] / draws[1][3]);
  assert.equal(draws[0][6] + draws[0][8], 154);
  assert.equal(draws[1][6] + draws[1][8], 154);
  draws.length = 0;
  window.SpriteCollab.drawFrame(canvas, data, 0, 'right', { ...options, sizeFraction: 1 });
  assert.equal(draws[0][7], 74);
});

function battleHarness() {
  const events = {};
  const img = { dataset: {}, alt: 'ally', hidden: false };
  const canvases = [];
  const host = { dataset: {}, classList: { add() {}, remove() {} }, querySelector: selector => selector === 'img' ? img : { appendChild: canvas => canvases.push(canvas) } };
  const pending = [];
  const reduced = { matches: true, addEventListener() {} };
  const window = {
    matchMedia: () => reduced,
    PokemonDisplay: { setImage(image, entity) { image.src = entity.sprite; } },
    SpriteCollab: { load(id) { return new Promise(resolve => pending.push({ id, resolve })); }, drawFrame() {} },
    addEventListener(name, callback) { events[name] = callback; }
  };
  let boot = true;
  const document = {
    hidden: false,
    getElementById() { return boot ? null : host; },
    createElement() { return { hidden: true, setAttribute() {} }; },
    addEventListener() {}
  };
  vm.runInNewContext(source('pokemon-sizes.js'), { window });
  vm.runInNewContext(source('battle-sprites.js'), { window, document, setTimeout, clearTimeout });
  boot = false;
  return { window, img, host, pending, canvases, events };
}

test('a late sheet from a recalled creature cannot replace the newly selected creature', async () => {
  const h = battleHarness();
  const oldRequest = h.window.BattleSprites.set('p1', { dexOrder: 94, sprite: '/gengar.png' });
  const newRequest = h.window.BattleSprites.set('p1', { dexOrder: 95, sprite: '/onix.png' });
  h.pending[1].resolve({ idle: { durations: [100], framesPerDir: 1 } });
  await newRequest;
  assert.equal(h.host.dataset.dexOrder, '95');
  assert.equal(h.host.dataset.spriteSource, 'spritecollab');
  h.pending[0].resolve(null);
  await oldRequest;
  assert.equal(h.host.dataset.spriteSource, 'spritecollab');
  assert.equal(h.img.hidden, true);
});

test('missing SpriteCollab sheets and custom entities retain the ordinary image fallback', async () => {
  const h = battleHarness();
  const request = h.window.BattleSprites.set('p1', { dexOrder: 94, sprite: '/gengar.png' });
  h.pending[0].resolve(null);
  await request;
  assert.equal(h.host.dataset.spriteSource, 'fallback');
  assert.equal(h.img.hidden, false);
  await h.window.BattleSprites.set('p1', { dexOrder: 0, sprite: '/custom.gif' });
  assert.equal(h.img.src, '/custom.gif');
  assert.equal(h.pending.length, 1);
});
