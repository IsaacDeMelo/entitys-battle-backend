/* A single handheld menu, shared by touch, keyboard and virtual controls. */
(function () {
  'use strict';
  const config = window.CLASSIC_MENU_CONFIG;
  if (!config) return;
  const tabs = [['team', 'Equipe', 'Seus parceiros de aventura'], ['bag', 'Mochila', 'Prepare sua próxima jornada'], ['dex', 'Entitydex', 'Suas descobertas pelo mundo'], ['pc', 'PC', 'Organize seus parceiros'], ['rank', 'Ranking', 'A liga de treinadores'], ['card', 'Treinador', 'Seu cartão de aventura']];
  const state = { menuOpen: false, activeModal: null, tab: 'team', teamData: [], data: null, pc: null, catalog: [], rank: [], detail: null, bagPocket: 'items', bagSelection: '', busy: false, loading: false, error: '', request: 0 };
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
    return `<button class="party-card ${num(e.hp) === 0 ? 'is-fainted' : ''}" data-action="${action}" data-index="${i}"><span class="gba-ball" aria-hidden="true"></span><span class="party-index">${String(i + 1).padStart(2, '0')}</span>${sprite(e)}<span class="party-info"><span class="party-name">${esc(e.name || 'Entidade')}<small>Nv.${num(e.level)}</small></span><span class="party-type">${num(e.hp) === 0 ? 'DESMAIADO' : esc(e.type || 'Entidade')}</span>${hp(e)}</span><span class="party-arrow" aria-hidden="true">›</span></button>`;
  }
  function renderTeam() {
    const team = state.teamData, e = team[state.detail];
    if (!team.length) return empty('Sua aventura começa com um parceiro. Procure o NPC de iniciais no mapa.');
    if (!e) return `<div class="party-screen"><div class="party-lead">${partyCard(team[0], 0)}</div><div class="party-bench">${team.slice(1).map((e, i) => partyCard(e, i + 1)).join('')}${Array.from({ length: Math.max(0, 6 - team.length) }, () => '<div class="party-slot">—</div>').join('')}</div></div>`;
    const stats = e.stats || {};
    return `<div class="partner-detail"><div class="partner-portrait">${sprite(e, 'teamDetail')}<span>${esc(e.type)}</span></div><div><span class="handheld-eyebrow">SEU PARCEIRO / Nv. ${num(e.level)}</span><h3>${esc(e.name)}</h3>${hp(e)}<p class="detail-xp">EXP. ${num(e.xp)} / ${num(e.xpToNext)}</p><div class="detail-stats">${[['Ataque', stats.attack], ['Defesa', stats.defense], ['Velocidade', stats.speed]].map(([k, v]) => `<span>${k}<strong>${num(v)}</strong></span>`).join('')}</div></div></div><div class="section-line">GOLPES EQUIPADOS</div><div class="move-list">${(e.moves || []).map(move => { const def = typeof move === 'object' ? move : (state.data.allMoves || {})[move] || { name: move }; return `<div>${esc(def.name || move)}<small>${esc(def.type || '')}</small></div>`; }).join('') || '<p>Nenhum golpe equipado.</p>'}</div><div class="detail-actions">${state.detail > 0 ? button('lead', 'Colocar como líder') : '<span class="handheld-badge">Líder da equipe</span>'}${button('follow', String(state.data.followingEntityId) === String(e.instanceId) ? 'Parar de seguir' : 'Caminhar junto')}${e.evolution?.ready ? button('evolve', 'Evoluir parceiro') : ''}</div>`;
  }
  function renderPC() {
    const pc = state.pc || { team: [], pc: [] };
    if (state.detail) {
      const { from, index } = state.detail, e = pc[from][index];
      return `<div class="pc-selected">${sprite(e, 'teamDetail')}<h3>${esc(e.name)}</h3><p>Nv. ${num(e.level)} · ${esc(e.type)}</p>${button('transfer', from === 'pc' ? 'Adicionar à equipe' : 'Enviar para o PC')}</div>`;
    }
    const grid = from => `<div class="pc-grid">${pc[from].map((e, i) => `<button class="pc-cell" data-action="pc-select" data-from="${from}" data-index="${i}">${sprite(e)}<span>${esc(e.name)}</span><small>Nv. ${num(e.level)}</small></button>`).join('')}</div>`;
    return `<div class="section-line"><span>EQUIPE</span><strong>${pc.team.length} / 6</strong></div>${grid('team')}<div class="section-line"><span>BOX 01</span><strong>${pc.pc.length} parceiros</strong></div>${pc.pc.length ? grid('pc') : empty('Seu PC está vazio. Novos parceiros podem ser guardados aqui.')}`;
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
    const entries = all.filter(id => pocket(id) === state.bagPocket);
    if (!entries.includes(state.bagSelection)) state.bagSelection = entries[0] || '';
    const selected = state.bagSelection;
    const def = definition(selected);
    const name = id => definition(id).name || ({ 'rare-candy': 'Doce Raro', pokeball: 'Pokébola' })[id] || id;
    const pockets = [['items', 'ITENS'], ['keys', 'ITENS IMPORTANTES'], ['balls', 'POKÉ BOLAS']];
    return '<div class="gba-bag-screen"><aside class="gba-bag-side"><div class="gba-pockets">' + pockets.map(([id,label]) => '<button data-action="pocket" data-pocket="'+id+'" aria-pressed="'+(id===state.bagPocket)+'">'+label+'</button>').join('') + '</div><div class="gba-bag-art">'+bagArt+'</div><span class="bag-balance">$ '+money(state.data.money)+'</span></aside><div class="gba-bag-list" role="group" aria-label="Itens do bolso">'+(entries.length ? entries.map(id => '<button class="gba-item-row" data-action="bag-select" data-id="'+esc(id)+'" aria-pressed="'+(id===selected)+'"><span class="gba-item-cursor" aria-hidden="true">'+(id===selected?'▶':'')+'</span><span>'+esc(name(id))+'</span><span>×'+(num(bag[id])||1)+'</span></button>').join('') : '<p class="bag-empty">Este bolso está vazio.</p>')+'</div><div class="gba-bag-description"><span class="gba-item-art">'+(def.hasIcon ? '<img src="/api/items/icon/'+encodeURIComponent(selected)+'.png" alt="">' : '<span aria-hidden="true">◇</span>')+'</span><p>'+esc(selected ? def.description || (state.bagPocket==='keys'?'Um item importante para a aventura.':selected==='rare-candy'?'Aumenta em um o nível do Pokémon escolhido.':state.bagPocket==='balls'?'Use durante a batalha para capturar um Pokémon.':'Um item para usar durante sua aventura.') : 'Escolha outro bolso para ver seus itens.')+'</p>'+(selected==='rare-candy'?button('choose-candy','USAR'):'')+'</div></div>';
  }
  function renderDex() {
    const registered = new Set((state.data.dex || []).map(String));
    const entities = [...config.entities].sort((a, b) => num(a.dexOrder) - num(b.dexOrder));
    const selected = entities.find(e => e.id === state.detail);
    if (selected) return `<div class="pc-selected">${sprite(selected, 'dexDetail')}<span class="handheld-eyebrow">REGISTRO #${String(selected.dexOrder || entities.indexOf(selected) + 1).padStart(3, '0')}</span><h3>${esc(selected.name)}</h3><p>${esc(selected.type)}</p><span class="handheld-badge">Registrado na sua Entitydex</span></div>`;
    return `<div class="section-line"><span>REGISTROS DA JORNADA</span><strong>${registered.size} descobertos</strong></div>${entities.length ? `<div class="dex-grid">${entities.map((e, i) => { const seen = registered.has(e.id); return `<button class="dex-cell ${seen ? '' : 'is-unknown'}" data-action="dex-select" data-id="${esc(e.id)}" ${seen ? '' : 'disabled'}><small>#${String(e.dexOrder || i + 1).padStart(3, '0')}</small>${seen ? sprite(e, 'dexGrid') : '<span class="dex-mystery">?</span>'}<strong>${seen ? esc(e.name) : 'Desconhecido'}</strong></button>`; }).join('')}</div>` : empty('O catálogo de entidades ainda não está disponível.')}`;
  }
  function renderCard() {
    const d = state.data;
    return `<div class="trainer-card"><div class="trainer-card-heading"><span>CARTÃO DE TREINADOR</span><span>ENTITYS BATTLE</span></div><div class="trainer-identity">${d.skin ? `<div class="trainer-avatar" style="background-image:url('/skins/${encodeURIComponent(d.skin)}.png')"></div>` : '<div class="trainer-avatar trainer-avatar-empty">EB</div>'}<div><span class="handheld-eyebrow">TREINADOR</span><h3>${esc(d.username)}</h3><span class="handheld-badge">Em aventura</span></div></div><div class="trainer-records">${[['Dinheiro', '$ ' + money(d.money)], ['Equipe', state.teamData.length + ' / 6'], ['Entitydex', (d.dex || []).length + ' registros'], ['Treinadores vencidos', (d.defeatedNPCs || []).length]].map(([label, value]) => `<div><span>${label}</span><strong>${esc(value)}</strong></div>`).join('')}</div></div>`;
  }
  function render() {
    const restoreContentFocus = content.contains(document.activeElement);
    root.dataset.screen = state.tab;
    root.dataset.detail = state.detail === null ? 'false' : 'true';
    const tab = tabs.find(t => t[0] === state.tab);
    root.querySelector('h2').textContent = tab[1];
    root.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-current', b.dataset.tab === state.tab ? 'page' : 'false'));
    root.querySelector('#classic-hint').textContent = state.detail !== null ? 'O que deseja fazer?' : ({team: 'Escolha um POKÉMON.', bag: 'Escolha um item.', pc: 'Organize seus POKÉMON.', dex: 'Escolha um registro.'})[state.tab] || tab[2];
    if (state.loading) { content.innerHTML = '<div class="handheld-empty" role="status">Carregando sua aventura...</div>'; return; }
    if (state.error) { content.innerHTML = `<div class="handheld-empty"><p>${esc(state.error)}</p>${button('retry', 'Tentar novamente')}</div>`; return; }
    if (!state.data) return;
    const renderers = { team: renderTeam, pc: renderPC, bag: renderBag, dex: renderDex, card: renderCard, rank: () => state.rank.length ? `<div class="section-line">LIGA DE TREINADORES</div><div class="rank-list">${state.rank.map((e, i) => `<div class="rank-row"><span class="rank-position">${String(i + 1).padStart(2, '0')}</span><strong>${esc(e.username)}</strong><span>${num(e.pvpWins)} V / ${num(e.pvpLosses)} D</span><b>${num(e.pvpPoints)} pts</b></div>`).join('')}</div>` : empty('A liga ainda não tem classificados. Seu próximo desafio pode mudar isso.') };
    content.innerHTML = renderers[state.tab]();
    window.PokemonDisplay.hydrate(content);
    content.querySelectorAll('img:not([data-ent])').forEach(img => img.addEventListener('error', () => { img.hidden = true; }, { once: true }));
    if (state.menuOpen && (restoreContentFocus || document.activeElement === document.body)) (content.querySelector('button:not(:disabled)') || root.querySelector('[data-action="back"]')).focus();
  }
  async function load() {
    const token = ++state.request, tab = state.tab;
    state.loading = true;
    state.error = '';
    render();
    try {
      const data = await request(`/api/me?userId=${encodeURIComponent(config.userId)}`);
      let extra;
      if (tab === 'pc') extra = await request(`/api/pc?userId=${encodeURIComponent(config.userId)}`);
      if (tab === 'rank') extra = await request('/api/rank');
      if (tab === 'bag') extra = await request('/api/items/catalog');
      if (token !== state.request) return;
      state.data = data;
      state.teamData = Array.isArray(data.team) ? data.team : [];
      window.CURRENT_TEAM_DATA = state.teamData;
      window.USER_BAG = data.bag || {};
      window.USER_KEY_ITEMS = data.keyItems || [];
      if (tab === 'pc') state.pc = extra;
      if (tab === 'rank') state.rank = extra.list || [];
      if (tab === 'bag') state.catalog = extra.items || [];
      const balance = document.getElementById('trainerBalance');
      if (balance) balance.textContent = '$ ' + money(data.money);
      window.__ME_CACHE = data;
      if (typeof window.setFollowingEntityId === 'function') window.setFollowingEntityId(data.followingEntityId || '');
      else window.FOLLOWING_ENTITY_ID = data.followingEntityId || '';
    } catch (error) {
      if (token === state.request) state.error = error.name === 'AbortError' ? 'A conexão demorou. Tente novamente.' : error.message;
    } finally { if (token === state.request) { state.loading = false; render(); } }
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
    else if (action === 'pc-select') { state.detail = { from: target.dataset.from, index }; render(); }
    else if (action === 'dex-select') { state.detail = target.dataset.id; render(); }
    else if (action === 'pocket') { state.bagPocket = target.dataset.pocket; state.bagSelection = ''; render(); }
    else if (action === 'bag-select') { state.bagSelection = target.dataset.id; render(); }
    else if (action === 'choose-candy') { state.detail = 'rare-candy'; render(); }
    else if (action === 'candy') mutate('/api/use-item', { itemId: 'rare-candy', pokemonId: state.teamData[index].instanceId, qty: 1 }, 'Doce Raro usado! Seu parceiro ficou mais forte.');
    else if (action === 'lead' && entity) mutate('/api/set-lead', { entityId: entity.instanceId }, 'Líder da equipe atualizado.');
    else if (action === 'follow' && entity) mutate('/api/following', { instanceId: String(state.data.followingEntityId) === String(entity.instanceId) ? '' : entity.instanceId }, 'Companheiro de caminhada atualizado.');
    else if (action === 'evolve' && entity) mutate('/api/evolve', { pokemonId: entity.instanceId }, 'Seu parceiro evoluiu!');
    else if (action === 'transfer') { const { from, index: slot } = state.detail; mutate('/api/pc/move', { entityId: state.pc[from][slot].instanceId, from, to: from === 'pc' ? 'team' : 'pc' }, 'Parceiro transferido com sucesso.'); }
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
  window.MenuSystem = { state, setMenuOpen: v => v ? open() : setOpen(false), openModal: id => open(({ modalPokemon: 'team', modalPC: 'pc', modalPokedex: 'dex', modalBag: 'bag', modalRank: 'rank', modalCard: 'card' })[id]), closeModal: () => setOpen(false) };
  window.openEntityTeam = window.openPokemon = () => open('team');
  window.openPC = () => open('pc'); window.openPokedex = () => open('dex');
  window.openBag = window.openBagScreen = window.dexOpenBag = () => open('bag');
  window.openRank = () => open('rank'); window.openCard = () => open('card');
  window.closeModal = window.closeAllModals = window.closePokedex = () => setOpen(false);
  window.toggleFloatMenu = () => state.menuOpen ? setOpen(false) : open();
  window.__menuBack = back; window.__menuUp = () => focusStep(-1); window.__menuDown = () => focusStep(1);
  window.__menuConfirm = () => { if (root.contains(document.activeElement)) document.activeElement.click(); };
  window.__openStartMenu = () => open(); window.__closeStartMenu = () => setOpen(false);
  document.getElementById('startBtn')?.addEventListener('click', () => window.toggleFloatMenu());
  document.getElementById('trainerStatus')?.addEventListener('click', () => open('card'));
  document.getElementById('chatInput')?.addEventListener('keydown', event => { if (event.key === 'Enter') document.getElementById('chatSend').click(); });
})();
