/* pokemon-display.js — Fonte única de como cada pokemon aparece.
 * Regra por contexto (thumb = icon||sprite; detalhe/batalha = sprite||icon):
 *  team lista: thumb 40px | team detalhe: detail 80px | PC/box: thumb 40px
 *  dex grid: dex 44px | dex detalhe: detail 80px | starter: starter 96px
 *  batalha p1/p2: battle 110px (160px PC) | switch: thumb | follower: follower 52px
 * Fallback único: /uploads/placeholder.png (nunca string vazia, nunca /uploads/).
 */
(function (global) {
  const PLACEHOLDER = '/uploads/placeholder.png';

  const CONTEXT_RULE = {
    team: { fields: ['icon', 'sprite'], cls: 'ent-sprite--thumb' },
    pc: { fields: ['icon', 'sprite'], cls: 'ent-sprite--thumb' },
    dexGrid: { fields: ['icon', 'sprite'], cls: 'ent-sprite--dex' },
    dexDetail: { fields: ['sprite', 'icon'], cls: 'ent-sprite--detail' },
    teamDetail: { fields: ['sprite', 'icon'], cls: 'ent-sprite--detail' },
    starter: { fields: ['sprite', 'icon'], cls: 'ent-sprite--starter' },
    battle: { fields: ['sprite', 'icon'], cls: 'ent-sprite--battle' },
    switch: { fields: ['sprite', 'icon'], cls: 'ent-sprite--thumb' },
    follower: { fields: ['icon', 'sprite'], cls: 'ent-sprite--follower' },
    npcPreview: { fields: ['sprite', 'icon'], cls: 'ent-sprite--thumb' },
  };

  function resolveSrc(src) {
    if (!src) return '';
    const s = String(src).trim();
    if (!s || s === 'undefined' || s === 'null') return '';
    if (s.startsWith('http') || s.startsWith('data:') || s.startsWith('blob:')) return s;
    if (s.startsWith('/')) return s;
    return '/uploads/' + s;
  }

  function pickField(entity, context) {
    const rule = CONTEXT_RULE[context] || CONTEXT_RULE.team;
    const e = entity || {};
    for (const f of rule.fields) {
      const v = resolveSrc(e[f]);
      if (v) return v;
    }
    return PLACEHOLDER;
  }

  function resolvePokemonImage(entity, context) {
    return pickField(entity, context);
  }

  // Cria <div class="ent-sprite ..."><img ...></div> padronizado.
  function createSpriteEl(entity, context, alt) {
    const rule = CONTEXT_RULE[context] || CONTEXT_RULE.team;
    const wrap = document.createElement('div');
    wrap.className = 'ent-sprite ' + rule.cls;
    const img = document.createElement('img');
    img.alt = alt || (entity && entity.name) || 'entidade';
    img.loading = 'lazy';
    img.src = pickField(entity, context);
    img.onerror = function () {
      if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER;
    };
    wrap.appendChild(img);
    return wrap;
  }

  // Aplica em <img data-ent="team" data-icon data-sprite> existente.
  function hydrate(root) {
    const scope = root || document;
    scope.querySelectorAll('img[data-ent]').forEach((img) => {
      const ctx = img.getAttribute('data-ent') || 'team';
      const entity = { icon: img.getAttribute('data-icon'), sprite: img.getAttribute('data-sprite') };
      img.style.objectFit = 'contain';
      img.style.imageRendering = 'pixelated';
      img.loading = img.loading || 'lazy';
      const resolved = pickField(entity, ctx);
      if (img.src !== resolved) img.src = resolved;
      img.onerror = function () { if (img.src !== PLACEHOLDER) img.src = PLACEHOLDER; };
    });
  }

  const api = { PLACEHOLDER, CONTEXT_RULE, resolveSrc, resolvePokemonImage, createSpriteEl, hydrate };
  global.PokemonDisplay = api;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => hydrate(document));
  } else {
    hydrate(document);
  }
})(window);
