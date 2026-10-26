(function (global) {
  'use strict';
  const slots = new Map();
  const reducedMotion = global.matchMedia('(prefers-reduced-motion: reduce)');
  function stop(slot) { if (slot.timer) clearTimeout(slot.timer); slot.timer = null; }
  function animate(slot) {
    stop(slot);
    if (!slot.data) return;
    global.SpriteCollab.drawFrame(slot.canvas, slot.data, slot.frame, slot.side === 'p1' ? 'right' : 'left', {
      fitContent: true, uniformScale: true, sizeFraction: slot.sizeFraction, anchor: 'bottom'
    });
    if (document.hidden || reducedMotion.matches) return;
    const duration = slot.data.durations[slot.frame] || 150;
    slot.timer = setTimeout(() => { slot.frame = (slot.frame + 1) % slot.data.framesPerDir; animate(slot); }, duration);
  }
  async function set(side, entity) {
    const host = document.getElementById(`sprite-${side}`);
    if (!host) return;
    const image = host.querySelector('img');
    if (!image) return;
    let slot = slots.get(side);
    if (!slot) {
      const canvas = document.createElement('canvas');
      canvas.className = 'battle-sprite-canvas';
      canvas.width = canvas.height = 160;
      canvas.hidden = true;
      canvas.setAttribute('role', 'img');
      host.querySelector('.battle-art').appendChild(canvas);
      slot = { side, host, image, canvas, version: 0, timer: null, data: null, frame: 0 };
      slots.set(side, slot);
    }
    const version = ++slot.version;
    stop(slot);
    slot.data = null;
    slot.canvas.hidden = true;
    image.hidden = false;
    host.classList.remove('has-spritecollab');
    host.dataset.spriteSource = 'fallback';
    global.PokemonDisplay.setImage(image, entity, 'battle');
    const dexOrder = Number(entity.dexOrder);
    slot.sizeFraction = global.PokemonSizes.battleFraction(dexOrder);
    host.dataset.sizeFraction = slot.sizeFraction.toFixed(3);
    host.dataset.dexOrder = String(dexOrder || 0);
    if (!(dexOrder > 0)) return;
    host.dataset.spriteSource = 'loading';
    const sheets = await global.SpriteCollab.load(dexOrder);
    if (slot.version !== version) return;
    if (!sheets) { host.dataset.spriteSource = 'fallback'; return; }
    slot.data = sheets.idle || sheets.walk;
    slot.frame = 0;
    slot.canvas.setAttribute('aria-label', entity.name || image.alt || 'Entidade');
    image.hidden = true;
    slot.canvas.hidden = false;
    host.classList.add('has-spritecollab');
    host.dataset.spriteSource = 'spritecollab';
    animate(slot);
  }
  document.addEventListener('visibilitychange', () => slots.forEach(slot => document.hidden ? stop(slot) : animate(slot)));
  reducedMotion.addEventListener('change', () => slots.forEach(animate));
  global.addEventListener('pagehide', () => { slots.forEach(slot => { ++slot.version; stop(slot); }); slots.clear(); });
  global.BattleSprites = { set };
  for (const side of ['p1', 'p2']) {
    const host = document.getElementById(`sprite-${side}`);
    const image = host?.querySelector('img');
    if (image) set(side, { dexOrder: host.dataset.dexOrder, sprite: image.dataset.sprite, icon: image.dataset.icon, name: host.dataset.name });
  }
})(window);
