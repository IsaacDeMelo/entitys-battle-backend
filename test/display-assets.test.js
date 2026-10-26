const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { PNG } = require('pngjs');

function display() {
  const window = {};
  const document = { readyState: 'loading', addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/scripts/pokemon-display.js'), 'utf8'), { window, document });
  return window.PokemonDisplay;
}

test('failed battle artwork tries its icon, then a decodable local placeholder, and stops', () => {
  const api = display();
  const img = { dataset: {} };
  api.setImage(img, { sprite: 'https://example.org/blocked.gif', icon: '/icon.png' }, 'battle');
  assert.equal(img.src, 'https://example.org/blocked.gif');
  img.onerror();
  assert.equal(img.src, '/icon.png');
  img.onerror();
  assert.equal(img.src, api.PLACEHOLDER);
  const png = PNG.sync.read(fs.readFileSync(path.join(__dirname, '../public', api.PLACEHOLDER)));
  assert.ok(png.width > 1 && png.height > 1);
  img.onerror();
  assert.equal(img.onerror, null);
  assert.equal(img.dataset.imageStatus, 'unavailable');
});

test('switching creature resets the fallback chain and preserves successful art', () => {
  const api = display();
  const img = { dataset: {} };
  api.setImage(img, { sprite: '/first.png' }, 'battle');
  img.onerror();
  api.setImage(img, { sprite: '/second.png', icon: '/second-icon.png' }, 'battle');
  assert.equal(img.src, '/second.png');
  img.onload();
  assert.equal(img.dataset.imageStatus, 'loaded');
  api.setImage(img, { sprite: '/second.png', icon: '/second-icon.png' }, 'battle');
  assert.equal(img.dataset.imageStatus, 'loaded');
});

function background(src) {
  const api = display();
  const arena = { dataset: { background: src }, style: {} };
  let image;
  class Image { constructor() { image = this; } }
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../public/scripts/battle-assets.js'), 'utf8'), {
    window: { PokemonDisplay: api }, document: { getElementById: () => arena }, Image
  });
  return { arena, image };
}

test('root-relative backgrounds are preserved; denied remote backgrounds use a local fallback', () => {
  const local = background('/uploads/custom.png');
  assert.equal(local.image.src, '/uploads/custom.png');
  local.image.onload();
  assert.equal(local.arena.dataset.backgroundStatus, 'loaded');
  const remote = background('https://example.org/denied.jpg');
  remote.image.onerror();
  assert.equal(remote.image.src, '/uploads/swamp-battle-v1.png');
  remote.image.onload();
  assert.equal(remote.arena.dataset.backgroundStatus, 'fallback');
  assert.match(remote.arena.style.backgroundImage, /swamp-battle-v1\.png/);
  remote.image.onerror();
  assert.equal(remote.image.onerror, null);
});
