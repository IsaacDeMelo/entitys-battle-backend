/* A single handheld menu, shared by touch, keyboard and virtual controls. */
(function () {
  'use strict';
  const config = window.CLASSIC_MENU_CONFIG;
  if (!config) return;
  const tabs = [['team', 'Equipe', 'Seus parceiros de aventura'], ['bag', 'Mochila', 'Prepare sua próxima jornada'], ['card', 'Treinador', 'Seu cartão de aventura']];
  const initialData = config.initialData || window.__ME_CACHE || null;
  const state = { menuOpen: false, activeModal: null, tab: 'team', teamData: Array.isArray(initialData?.team) ? initialData.team : [], data: initialData, catalog: [], detail: null, bagPocket: 'items', bagSelection: '', bagPocketChosen: false, busy: false, loading: false, error: '', request: 0 };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const num = v => Math.max(0, Number(v) || 0);
  const money = v => num(v).toLocaleString('pt-BR');
  const root = document.createElement('div');
  root.id = 'classic-menu';
  root.hidden = true;
  root.innerHTML = `<div class="handheld-menu" role="dialog" aria-modal="true" aria-labelledby="classic-title" tabindex="-1">
    <header class="handheld-header"><div><span class="handheld-eyebrow">ENTITYS BATTLE / MENU</span><h2 id="classic-title">Equipe</h2></div><button class="handheld-close" data-action="close" aria-label="Fechar menu">×</button></header>
    <nav class="handheld-tabs" aria-label="Menu do treinador">${tabs.map(([id, label], i) => `<button data-tab="${id}"><span aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>${label}</button>`).join('')}</nav>
    <main id="classic-content" aria-live="polite"></main>
    <footer class="handheld-footer"><span id="classic-hint"></span><button data-action="back"><kbd>B</kbd> Voltar</button></footer></div>`;
  document.body.appendChild(root);
  const content = root.querySelector('main');
  const toast = document.createElement('div');
  toast.className = 'handheld-toast';
  toast.setAttribute('role', 'status');
  toast.hidden = true;
  document.body.appendChild(toast);
  let toastTimer, returnFocus;
  function notify(message) {
    toast.textContent = message;
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { toast.hidden = true; }, 3500);
  }
  async function request(url, body) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch(url, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: config.userId, ...body }), signal: controller.signal } : { signal: controller.signal });
      const data = await res.json();
      if (!res.ok || data.error || data.success === false) throw new Error(data.error || 'Não foi possível concluir. Tente novamente.');
      return data;
    } finally { clearTimeout(timer); }
  }
  function sprite(entity, context = 'team') {
    return `<img class="handheld-sprite" data-ent="${esc(context)}" data-sprite="${esc(entity.sprite || '')}" data-icon="${esc(entity.icon || '')}" src="${esc(window.PokemonDisplay.resolvePokemonImage(entity, context))}" alt="${esc(entity.name || 'Entidade')}" loading="eager">`;
  }
  function hp(e) {
    const max = num(e.maxHp), value = Math.min(max, num(e.hp)), percent = max ? Math.round(value / max * 100) : 0;
    return `<span class="party-health"><span>HP</span><span class="health-track" role="meter" aria-label="Pontos de vida" aria-valuemin="0" aria-valuemax="${max || 1}" aria-valuenow="${value}"><i style="width:${percent}%;background:${percent <= 20 ? '#bd4540' : percent <= 50 ? '#b88b27' : '#37826b'}"></i></span><span>${value}/${max}</span></span>`;
  }
  const empty = message => `<div class="handheld-empty"><span class="empty-symbol" aria-hidden="true">◇</span><p>${esc(message)}</p></div>`;
  const button = (action, label) => `<button class="handheld-action" data-action="${action}" ${state.busy ? 'disabled' : ''}>${label}</button>`;
  function partyCard(e, i, action = 'select') {
    const ball = e.obtainedViaDevMode || e.captureBall === 'master-ball' ? 'master-ball' : (e.captureBall || 'poke-ball').toLowerCase().replace(/^pokeball$/, 'poke-ball').replace(/[^a-z0-9-]/g, '');
    return `<button class="party-card ${num(e.hp) === 0 ? 'is-fainted' : ''}" data-action="${action}" data-index="${i}"><img class="gba-ball" src="https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/gen5/${encodeURIComponent(ball)}.png" data-icon-fallback="/items/catchcube.svg" alt="Poké Bola usada para capturar" title="${ball === 'master-ball' ? 'Master Ball' : 'Poké Bola'}" loading="eager"><span class="party-index">${String(i + 1).padStart(2, '0')}</span>${sprite(e)}<span class="party-info"><span class="party-name">${esc(e.name || 'Entidade')}<small>Nv.${num(e.level)}</small></span><span class="party-type">${num(e.hp) === 0 ? 'DESMAIADO' : esc(e.type || 'Entidade')}</span>${hp(e)}</span><span class="party-arrow" aria-hidden="true">›</span></button>`;
  }
  function renderTeam() {
    const team = state.teamData, e = team[state.detail];
    if (!team.length) return empty('Sua aventura começa com um parceiro. Procure o NPC de iniciais no mapa.');
    if (!e) return `<div class="party-screen"><div class="party-lead">${partyCard(team[0], 0)}</div><div class="party-bench">${team.slice(1).map((e, i) => partyCard(e, i + 1)).join('')}${Array.from({ length: Math.max(0, 6 - team.length) }, () => '<div class="party-slot">—</div>').join('')}</div></div>`;
    const stats = e.stats || {};
    return `<div class="partner-detail"><div class="partner-portrait">${sprite(e, 'teamDetail')}<span>${esc(e.type)}</span></div><div><span class="handheld-eyebrow">SEU PARCEIRO / Nv. ${num(e.level)}</span><h3>${esc(e.name)}</h3>${hp(e)}<p class="detail-xp">EXP. ${num(e.xp)} / ${num(e.xpToNext)}</p><div class="detail-stats">${[['Ataque', stats.attack], ['Defesa', stats.defense], ['Velocidade', stats.speed]].map(([k, v]) => `<span>${k}<strong>${num(v)}</strong></span>`).join('')}</div></div></div><div class="section-line">GOLPES EQUIPADOS</div><div class="move-list">${(e.moves || []).map(move => { const def = typeof move === 'object' ? move : (state.data.allMoves || {})[move] || { name: move }; return `<div>${esc(def.name || move)}<small>${esc(def.type || '')}</small></div>`; }).join('') || '<p>Nenhum golpe equipado.</p>'}</div><div class="detail-actions">${state.detail > 0 ? button('lead', 'Colocar como líder') : '<span class="handheld-badge">Líder da equipe</span>'}${button('follow', String(state.data.followingEntityId) === String(e.instanceId) ? 'Parar de seguir' : 'Caminhar junto')}${e.evolution?.ready ? button('evolve', 'Evoluir parceiro') : ''}</div>`;
  }
  const bagArt = '<svg viewBox="0 0 40 48" aria-hidden="true" shape-rendering="crispEdges"><path fill="#596448" d="M13 0h14v4h5v5h4v31h-4v6H8v-6H4V9h4V4h5z"/><path fill="#dba34c" d="M12 5h16v5h5v29H7V10h5z"/><path fill="#f9d775" d="M10 11h20v20H10zM9 34h22v7H9z"/><path fill="#ffeeb0" d="M12 12h16v12H12zM11 35h18v3H11z"/><path fill="#b47743" d="M9 29h22v4H9zM17 24h6v7h-6z"/><path fill="#faf2c4" d="M18 25h4v4h-4z"/><path fill="#78b3a5" d="M8 17h3v18H8zM29 17h3v18h-3z"/><path fill="#eee6a2" d="M15 2h10v3H15z"/></svg>';
  function renderBag() {
    if (state.detail === 'rare-candy') return '<p class="handheld-prompt">Usar Doce Raro em qual parceiro?</p><div class="party-list">' + state.teamData.map((e, i) => partyCard(e, i, 'candy')).join('') + '</div>';
    const bag = state.data.bag || {};
    const keys = new Set((state.data.keyItems || []).map(v => String(typeof v === 'object' ? v.itemId || v.id : v)));
    const all = [...new Set([...Object.keys(bag), ...keys])].filter(id => num(bag[id]) > 0 || keys.has(id));
    const balls = new Set(['pokeball', 'great-ball', 'ultra-ball', 'master-ball']);
    const definition = id => state.catalog.find(item => item.id === id) || {};
    const pocket = id => keys.has(id) || definition(id).type === 'key' ? 'keys' : balls.has(id) ? 'balls' : 'items';
    const pockets = [['items', 'ITENS'], ['keys', 'ITENS IMPORTANTES'], ['balls', 'POKÉ BOLAS']];
    const entries = all.filter(id => pocket(id) === state.bagPocket);
    if (!entries.includes(state.bagSelection)) state.bagSelection = '';
    const selected = state.bagSelection;
    const def = definition(selected);
    const name = id => definition(id).name || ({ 'rare-candy': 'Doce Raro', pokeball: 'Pokébola' })[id] || id;
    const aliases = { pokeball: 'poke-ball', capturecube: 'poke-ball', capture_cube: 'poke-ball', key_villain: 'basement-key', levelupcrystal: 'rare-candy' };
    const standardItemSprite = id => {
      const lower = String(id).toLowerCase();
      if (aliases[lower]) return aliases[lower];
      if (balls.has(id) || id === 'rare-candy') return lower;
      return '';
    };
    const iconFor = id => {
      if (!id) return '';
      const item = definition(id);
      const slug = standardItemSprite(id) || id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!standardItemSprite(id) && item.hasIcon) return '/api/items/icon/' + encodeURIComponent(id) + '.png';
      if (!standardItemSprite(id) && item.icon) return item.icon;
      return 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/gen5/' + encodeURIComponent(slug) + '.png';
    };
    const fallbackIconFor = id => pocket(id) === 'keys' ? '/items/key.svg' : pocket(id) === 'balls' ? '/items/catchcube.svg' : id === 'rare-candy' ? '/items/rarecandy.svg' : '/items/generic.svg';
    const icon = iconFor(selected);
    const itemIcon = id => '<img class="gba-item-icon" src="'+esc(iconFor(id))+'" data-icon-fallback="'+esc(fallbackIconFor(id))+'" alt="" loading="eager">';
    return '<div class="gba-bag-screen"><aside class="gba-bag-side"><div class="gba-pockets">' + pockets.map(([id,label]) => '<button data-action="pocket" data-pocket="'+id+'" aria-pressed="'+(id===state.bagPocket)+'">'+label+'</button>').join('') + '</div><div class="gba-bag-art">'+bagArt+'</div><span class="bag-balance">$ '+money(state.data.money)+'</span></aside><div class="gba-bag-list" role="group" aria-label="Itens do bolso">'+(entries.length ? entries.map(id => '<button class="gba-item-row" data-action="bag-select" data-id="'+esc(id)+'" aria-pressed="'+(id===selected)+'"><span class="gba-item-cursor" aria-hidden="true">'+(id===selected?'▶':'')+'</span>'+itemIcon(id)+'<span>'+esc(name(id))+'</span><span>×'+(num(bag[id])||1)+'</span></button>').join('') : '<p class="bag-empty">Este bolso está vazio.</p>')+'</div><div class="gba-bag-description"><span class="gba-item-art">'+(icon ? '<img src="'+esc(icon)+'" data-icon-fallback="'+esc(fallbackIconFor(selected))+'" alt="'+esc(name(selected))+'">' : '<span aria-hidden="true">◇</span>')+'</span><p>'+esc(selected ? def.description || (state.bagPocket==='keys'?'Um item importante para a aventura.':selected==='rare-candy'?'Aumenta em um o nível do Pokémon escolhido.':state.bagPocket==='balls'?'Use durante a batalha para capturar um Pokémon.':'Um item para usar durante sua aventura.') : 'Selecione um item para ver os detalhes e as opções.')+'</p>'+(selected==='rare-candy'?button('choose-candy','USAR'):'')+'</div></div>';
  }
  function renderDex() {
    const registered = new Set((state.data.dex || []).map(String));
    const entities = [...config.entities].sort((a, b) => num(a.dexOrder) - num(b.dexOrder));
    const selected = entities.find(e => e.id === state.detail);
    const heading = `<div class="pokedex-brand"><span class="pokedex-lens"><i></i></span><span><small>ENTITYS BATTLE</small><strong>ENTITYDEX</strong></span><span class="pokedex-lights"><i></i><i></i><i></i></span></div>`;
    if (selected) {
      const seen = registered.has(selected.id);
      return `<section class="pokedex-device">${heading}<div class="pokedex-screen"><div class="pokedex-screen-head"><button class="dex-back" data-action="dex-back" aria-label="Voltar à lista">◀</button><span>REGISTRO #${String(selected.dexOrder || entities.indexOf(selected) + 1).padStart(3, '0')}</span><span>${registered.size}/${entities.length}</span></div><div class="dex-detail-view">${seen ? sprite(selected, 'dexDetail') : '<span class="dex-unknown-large">?</span>'}<div class="dex-profile"><h3>${seen ? esc(selected.name) : 'DESCONHECIDO'}</h3><span>${seen ? esc(selected.type || '???') : 'TIPO: ???'}</span><p>${seen ? 'DADOS REGISTRADOS' : 'AINDA NÃO DESCOBERTO'}</p></div></div></div><div class="pokedex-controls"><span>● LIGAÇÃO</span><span>ENTITYDEX / Nº ${String(entities.indexOf(selected) + 1).padStart(3, '0')}</span></div></section>`;
    }
    return `<section class="pokedex-device">${heading}<div class="pokedex-screen"><div class="pokedex-screen-head"><span>LISTA DE ENTIDADES</span><span>VISTOS ${registered.size}</span></div>${entities.length ? `<div class="dex-list">${entities.map((e, i) => { const seen = registered.has(e.id); return `<button class="dex-entry ${seen ? '' : 'is-unknown'}" data-action="dex-select" data-id="${esc(e.id)}" ${seen ? '' : 'disabled'}><small>${String(e.dexOrder || i + 1).padStart(3, '0')}</small>${seen ? sprite(e, 'dexGrid') : '<span class="dex-entry-mystery">?</span>'}<strong>${seen ? esc(e.name) : '-----'}</strong><span>${seen ? esc(e.type || 'NORMAL') : '???'}</span></button>`; }).join('')}</div>` : '<p class="dex-no-data">O catálogo está vazio.</p>'}</div><div class="pokedex-controls"><span>● STATUS</span><span>POKÉDEX PORTÁTIL / EB-01</span></div></section>`;
  }
  function renderCard() {
    const d = state.data;
    const party = Array.from({ length: 6 }, (_, i) => state.teamData[i]);
    return `<div class="trainer-card"><div class="trainer-card-heading"><span>CARTÃO DE TREINADOR</span><span>ENTITYS BATTLE</span></div><div class="trainer-card-body"><section class="trainer-card-player">${d.skin ? `<div class="trainer-avatar" role="img" aria-label="Treinador ${esc(d.username)}" style="background-image:url('/skins/${encodeURIComponent(d.skin)}.png')"></div>` : '<div class="trainer-avatar trainer-avatar-empty">EB</div>'}<div class="trainer-card-meta"><span>TREINADOR</span><h3>${esc(d.username || 'Treinador')}</h3><p>EQUIPE <strong>${state.teamData.length}/6</strong></p><p>$ <strong>${money(d.money)}</strong></p></div></section><section class="trainer-card-party" aria-label="Equipe Pokémon">${party.map((e, i) => e ? `<div class="trainer-party-mon" title="${esc(e.name)}"><span>${sprite(e, 'teamDetail')}</span><small>${esc(e.name || `POKÉMON ${i + 1}`)}</small></div>` : `<div class="trainer-party-mon is-empty" aria-label="Espaço vazio na equipe"><span></span><small>—</small></div>`).join('')}</section></div><div class="trainer-card-badge-row"><span>INSÍGNIAS</span><div class="trainer-card-badges" aria-label="Insígnias ainda não obtidas">${Array.from({ length: 8 }, () => '<span class="trainer-badge-slot" aria-hidden="true"></span>').join('')}</div></div></div>`;
  }
  function render() {
    const restoreContentFocus = content.contains(document.activeElement);
    root.dataset.screen = state.tab;
    root.dataset.detail = state.detail === null ? 'false' : 'true';
    const tab = tabs.find(t => t[0] === state.tab);
    root.querySelector('h2').textContent = tab[1];
    root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
    root.querySelector('#classic-hint').textContent = state.detail !== null ? 'O que deseja fazer?' : ({team: 'Escolha um POKÉMON.', bag: 'Escolha um item.'})[state.tab] || tab[2];
    if (state.loading && state.tab === 'dex') { content.innerHTML = '<div class="handheld-empty" role="status">Iniciando a Entitydex...</div>'; return; }
    if (state.error && state.tab === 'dex' && !state.data) { content.innerHTML = `<div class="handheld-empty"><p>${esc(state.error)}</p>${button('retry', 'Tentar novamente')}</div>`; return; }
    if (!state.data) return;
    const renderers = { team: renderTeam, bag: renderBag, dex: renderDex, card: renderCard };
    content.innerHTML = renderers[state.tab]();
    window.PokemonDisplay.hydrate(content);
    content.querySelectorAll('img[data-icon-fallback]').forEach(img => img.addEventListener('error', () => { img.src = img.dataset.iconFallback || '/items/generic.svg'; }, { once: true }));
    content.querySelectorAll('img:not([data-ent]):not([data-icon-fallback])').forEach(img => img.addEventListener('error', () => { img.hidden = true; }, { once: true }));
    if (state.menuOpen && (restoreContentFocus || document.activeElement === document.body)) (content.querySelector('button:not(:disabled)') || root.querySelector('[data-action="back"]')).focus();
  }
  async function load() {
    const token = ++state.request, tab = state.tab;
    const cached = state.data || window.__ME_CACHE || config.initialData;
    if (cached) {
      state.data = cached;
      state.teamData = Array.isArray(cached.team) ? cached.team : [];
      state.loading = false;
      state.error = '';
      render();
    } else {
      state.loading = tab === 'dex';
      state.error = '';
      render();
    }
    const catalogPromise = tab === 'bag' && !state.catalog.length
      ? request('/api/items/catalog').then(extra => { if (token === state.request) { state.catalog = extra.items || []; if (state.menuOpen && state.tab === 'bag') render(); } }).catch(() => {})
      : Promise.resolve();
    try {
      const data = await request(`/api/me?userId=${encodeURIComponent(config.userId)}`);
      if (token !== state.request) return;
      state.data = data;
      state.teamData = Array.isArray(data.team) ? data.team : [];
      window.CURRENT_TEAM_DATA = state.teamData;
      window.USER_BAG = data.bag || {};
      window.USER_KEY_ITEMS = data.keyItems || [];
      if (tab === 'bag') {
        if (!state.bagPocketChosen) {
          const bag = data.bag || {};
          const keys = new Set((data.keyItems || []).map(v => String(typeof v === 'object' ? v.itemId || v.id : v)));
          const ids = [...new Set([...Object.keys(bag), ...keys])].filter(id => num(bag[id]) > 0 || keys.has(id));
          const balls = new Set(['pokeball', 'great-ball', 'ultra-ball', 'master-ball']);
          const pocketOf = id => keys.has(id) || state.catalog.find(item => item.id === id)?.type === 'key' ? 'keys' : balls.has(id) ? 'balls' : 'items';
          const available = ['items', 'keys', 'balls'].find(pocket => ids.some(id => pocketOf(id) === pocket));
          if (available) state.bagPocket = available;
        }
      }
      const balance = document.getElementById('trainerBalance');
      if (balance) balance.textContent = '$ ' + money(data.money);
      window.__ME_CACHE = data;
      if (typeof window.setFollowingEntityId === 'function') window.setFollowingEntityId(data.followingEntityId || '');
      else window.FOLLOWING_ENTITY_ID = data.followingEntityId || '';
    } catch (error) {
      if (token === state.request && !state.data && tab === 'dex') state.error = error.name === 'AbortError' ? 'A conexão demorou. Tente novamente.' : error.message;
    } finally { await catalogPromise; if (token === state.request) { state.loading = false; render(); } }
  }
  function setOpen(open) {
    state.menuOpen = !!open;
    state.activeModal = open ? 'classic-menu' : null;
    window.__menuOpen = !!open;
    document.body.classList.toggle('menu-open', !!open);
    root.hidden = !open;
    document.getElementById('startBtn')?.setAttribute('aria-expanded', String(!!open));
    if (!open) { state.request++; returnFocus?.focus(); }
  }
  function open(tab = 'team') {
    if (!state.menuOpen) returnFocus = document.activeElement;
    state.tab = tabs.some(t => t[0] === tab) ? tab : 'team';
    state.detail = null;
    setOpen(true);
    load();
    root.querySelector(`[data-tab="${state.tab}"]`).focus();
  }
  function back() {
    if (state.busy) return;
    if (state.detail !== null) { state.detail = null; render(); content.querySelector('button')?.focus(); }
    else setOpen(false);
  }
  async function mutate(url, body, message) {
    if (state.busy) return;
    state.busy = true;
    render();
    try {
      const result = await request(url, body);
      if (url === '/api/following' && typeof window.setFollowingEntityId === 'function') {
        window.setFollowingEntityId(result.followingEntityId || '');
      }
      state.detail = null; await load(); notify(message);
    }
    catch (error) { notify(error.name === 'AbortError' ? 'A conexão demorou. Confira os dados antes de tentar novamente.' : error.message); }
    finally { state.busy = false; render(); }
  }
  root.addEventListener('click', event => {
    const target = event.target.closest('button');
    if (!target) { if (event.target === root) back(); return; }
    if (state.busy) return;
    if (target.dataset.tab) { open(target.dataset.tab); return; }
    const action = target.dataset.action, index = Number(target.dataset.index), entity = state.teamData[state.detail];
    if (action === 'close') setOpen(false);
    else if (action === 'back') back();
    else if (action === 'retry') load();
    else if (action === 'select') { state.detail = index; render(); }
    else if (action === 'dex-select') { state.detail = target.dataset.id; render(); }
    else if (action === 'dex-back') { state.detail = null; render(); }
    else if (action === 'pocket') { state.bagPocketChosen = true; state.bagPocket = target.dataset.pocket; state.bagSelection = ''; render(); }
    else if (action === 'bag-select') { state.bagSelection = target.dataset.id; render(); }
    else if (action === 'choose-candy') { state.detail = 'rare-candy'; render(); }
    else if (action === 'candy') mutate('/api/use-item', { itemId: 'rare-candy', pokemonId: state.teamData[index].instanceId, qty: 1 }, 'Doce Raro usado! Seu parceiro ficou mais forte.');
    else if (action === 'lead' && entity) mutate('/api/set-lead', { entityId: entity.instanceId }, 'Líder da equipe atualizado.');
    else if (action === 'follow' && entity) mutate('/api/following', { instanceId: String(state.data.followingEntityId) === String(entity.instanceId) ? '' : entity.instanceId }, 'Companheiro de caminhada atualizado.');
    else if (action === 'evolve' && entity) mutate('/api/evolve', { pokemonId: entity.instanceId }, 'Seu parceiro evoluiu!');
  });
  function focusStep(step) {
    const controls = [...root.querySelectorAll('button:not(:disabled)')].filter(b => b.getClientRects().length);
    const i = controls.indexOf(document.activeElement);
    controls[(i + step + controls.length) % controls.length]?.focus();
  }
  document.addEventListener('keydown', event => {
    if (event.target.closest('input,textarea,select,[contenteditable="true"]')) return;
    if (!state.menuOpen) { if (event.key.toLowerCase() === 'm') { event.preventDefault(); open(); } return; }
    if (['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(event.key)) {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.key === 'Escape') back();
      else focusStep(event.key === 'ArrowUp' || event.key === 'ArrowLeft' || event.shiftKey ? -1 : 1);
    }
  }, true);
  document.addEventListener('focusin', event => { if (state.menuOpen && !root.contains(event.target) && !event.target.closest('#controlsDock')) root.querySelector('.handheld-close').focus(); });
  window.MenuSystem = { state, setMenuOpen: v => v ? open() : setOpen(false), openModal: id => open(({ modalPokemon: 'team', modalBag: 'bag', modalCard: 'card' })[id]), closeModal: () => setOpen(false) };
  window.openEntityTeam = window.openPokemon = () => open('team');
  window.openBag = window.openBagScreen = window.dexOpenBag = () => open('bag');
  window.openCard = () => open('card');
  window.closeModal = window.closeAllModals = window.closePokedex = () => setOpen(false);
  window.toggleFloatMenu = () => state.menuOpen ? setOpen(false) : open();
  window.__menuBack = back; window.__menuUp = () => focusStep(-1); window.__menuDown = () => focusStep(1);
  window.__menuConfirm = () => { if (root.contains(document.activeElement)) document.activeElement.click(); };
  window.__openStartMenu = () => open(); window.__closeStartMenu = () => setOpen(false);
  document.getElementById('startBtn')?.addEventListener('click', () => window.toggleFloatMenu());
  document.getElementById('trainerStatus')?.addEventListener('click', () => open('card'));
  document.getElementById('chatInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') document.getElementById('chatSend').click(); });
})();
