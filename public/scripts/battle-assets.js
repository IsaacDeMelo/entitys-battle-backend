(function () {
  'use strict';
  const arena = document.getElementById('arena');
  if (!arena) return;
  const fallback = '/uploads/swamp-battle-v1.png';
  const configured = window.PokemonDisplay.resolveSrc(arena.dataset.background);
  const requested = !configured || configured === '/uploads/battle_bg.png' ? fallback : configured;
  const image = new Image();
  let usingFallback = false;
  arena.dataset.backgroundStatus = 'loading';
  image.onload = () => {
    arena.style.backgroundImage = `url(${JSON.stringify(image.src)})`;
    arena.dataset.backgroundStatus = usingFallback ? 'fallback' : 'loaded';
  };
  image.onerror = () => {
    if (!usingFallback && requested !== fallback) {
      usingFallback = true;
      image.src = fallback;
    } else {
      image.onerror = null;
      arena.dataset.backgroundStatus = 'unavailable';
    }
  };
  image.src = requested;
})();
