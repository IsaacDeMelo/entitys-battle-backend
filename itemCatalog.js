const fs = require('fs');
const path = require('path');

const CATALOG_PATH = path.join(__dirname, 'items.catalog.json');

const DEFAULT_ITEMS = [
  { id: 'pokeball', name: 'CatchCube', type: 'consumable', icon: '/items/catchcube.svg' },
  { id: 'rareCandy', name: 'Rare Candy', type: 'consumable', icon: '/items/rarecandy.svg' }
];

function normalizeId(id) {
  return String(id || '').trim();
}

function sanitizeItem(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const id = normalizeId(raw.id);
  if (!id) return null;
  const name = String(raw.name || id).trim();
  const type = String(raw.type || 'consumable').trim();
  const icon = raw.icon ? String(raw.icon).trim() : '';

  const normalizedType = (type === 'key' || type === 'consumable') ? type : 'consumable';

  return {
    id,
    name,
    type: normalizedType,
    icon
  };
}

function loadCatalogFromDisk() {
  try {
    if (!fs.existsSync(CATALOG_PATH)) return DEFAULT_ITEMS.slice();
    const txt = fs.readFileSync(CATALOG_PATH, 'utf8');
    const parsed = JSON.parse(txt);
    const list = Array.isArray(parsed) ? parsed : (Array.isArray(parsed && parsed.items) ? parsed.items : []);

    const out = [];
    const seen = new Set();
    for (const it of list) {
      const s = sanitizeItem(it);
      if (!s) continue;
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }

    // Garante que os básicos existam
    for (const d of DEFAULT_ITEMS) {
      if (!seen.has(d.id)) out.unshift(d);
    }

    return out;
  } catch (_) {
    return DEFAULT_ITEMS.slice();
  }
}

let _catalog = loadCatalogFromDisk();
let _catalogMap = new Map(_catalog.map(it => [it.id, it]));

function reloadItemCatalog() {
  _catalog = loadCatalogFromDisk();
  _catalogMap = new Map(_catalog.map(it => [it.id, it]));
  return _catalog;
}

function getItemCatalog() {
  return _catalog;
}

function getItemDef(itemId) {
  const id = normalizeId(itemId);
  if (!id) return null;
  return _catalogMap.get(id) || null;
}

module.exports = {
  getItemCatalog,
  getItemDef,
  reloadItemCatalog,
  normalizeId
};
