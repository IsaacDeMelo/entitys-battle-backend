// --- SISTEMA DE DIÁLOGO RPG & NPC CONTROLLER (COM CARROSSEL & TYPEWRITER SUAVE) ---
console.log('[COMMON.JS] Arquivo carregado! Versão:', new Date().toISOString());

// =============================================================================
// 0. SOCKET GLOBAL PERSISTENTE
// =============================================================================
window.gameSocket = (() => {
    // Socket único para toda a sessão do jogo
    if (!window.__globalSocket) {
        console.log('[SOCKET] Criando conexão global persistente...');
        window.__globalSocket = io({
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
            transports: ['websocket', 'polling']
        });
        
        window.__globalSocket.on('connect', () => {
            console.log('[SOCKET] Conectado! ID:', window.__globalSocket.id);
        });
        
        window.__globalSocket.on('disconnect', (reason) => {
            console.log('[SOCKET] Desconectado:', reason);
        });
        
        window.__globalSocket.on('reconnect', (attemptNumber) => {
            console.log('[SOCKET] Reconectado após', attemptNumber, 'tentativas');
        });
    }
    return window.__globalSocket;
})();

// Alias para compatibilidade com código existente
if (typeof socket === 'undefined') {
    window.socket = window.gameSocket;
}

// =============================================================================
// 0.5 SISTEMA DE PRELOAD E CACHE
// =============================================================================
window.GameCache = (() => {
    const CACHE_VERSION = 'v1.0';
    const CACHE_DURATION = 1000 * 60 * 30; // 30 minutos
    
    const cache = {
        images: new Map(),
        preloadQueue: [],
        isPreloading: false
    };

    // Verifica se cache é válido
    function isCacheValid(timestamp) {
        return timestamp && (Date.now() - timestamp < CACHE_DURATION);
    }

    // Preload de imagem com cache
    function preloadImage(url) {
        return new Promise((resolve, reject) => {
            // Já está em cache?
            if (cache.images.has(url)) {
                resolve(cache.images.get(url));
                return;
            }

            const img = new Image();
            img.onload = () => {
                cache.images.set(url, img);
                console.log('[CACHE] Imagem carregada:', url);
                resolve(img);
            };
            img.onerror = () => {
                console.warn('[CACHE] Erro ao carregar:', url);
                reject(new Error(`Failed to load ${url}`));
            };
            img.src = url;
        });
    }

    // Preload em lote
    async function preloadBatch(urls, onProgress) {
        if (cache.isPreloading) return;
        cache.isPreloading = true;

        const total = urls.length;
        let loaded = 0;

        for (const url of urls) {
            try {
                await preloadImage(url);
                loaded++;
                if (onProgress) onProgress(loaded, total);
            } catch (e) {
                console.warn('[CACHE] Falha ao precarregar:', url);
                loaded++;
                if (onProgress) onProgress(loaded, total);
            }
        }

        cache.isPreloading = false;
        console.log('[CACHE] Preload completo:', loaded, '/', total);
    }

    // Salvar dados em sessionStorage
    function saveToSession(key, data) {
        try {
            sessionStorage.setItem(key, JSON.stringify({
                data,
                timestamp: Date.now(),
                version: CACHE_VERSION
            }));
        } catch (e) {
            console.warn('[CACHE] Erro ao salvar no sessionStorage:', e);
        }
    }

    // Carregar de sessionStorage
    function loadFromSession(key) {
        try {
            const item = sessionStorage.getItem(key);
            if (!item) return null;

            const parsed = JSON.parse(item);
            if (parsed.version !== CACHE_VERSION || !isCacheValid(parsed.timestamp)) {
                sessionStorage.removeItem(key);
                return null;
            }

            return parsed.data;
        } catch (e) {
            console.warn('[CACHE] Erro ao ler sessionStorage:', e);
            return null;
        }
    }

    // Limpar cache antigo
    function clearOldCache() {
        try {
            const keys = Object.keys(sessionStorage);
            for (const key of keys) {
                if (key.startsWith('game_')) {
                    const item = JSON.parse(sessionStorage.getItem(key));
                    if (!isCacheValid(item.timestamp)) {
                        sessionStorage.removeItem(key);
                    }
                }
            }
        } catch (e) {
            console.warn('[CACHE] Erro ao limpar cache:', e);
        }
    }

    // Assets críticos para preload
    function getCriticalAssets() {
        return [
            '/uploads/char1.png',
            '/uploads/char2.png',
            '/uploads/catchcube.gif',
            '/uploads/battle_bg.png'
        ];
    }

    // Inicializar cache
    clearOldCache();

    return {
        preloadImage,
        preloadBatch,
        saveToSession,
        loadFromSession,
        getCriticalAssets,
        getImage: (url) => cache.images.get(url)
    };
})();

// =============================================================================
// 0.6 TELA DE CARREGAMENTO GLOBAL
// =============================================================================
window.GlobalLoader = (() => {
    let loaderElement = null;
    let progressBar = null;
    let progressText = null;

    function create() {
        if (loaderElement) return;

        loaderElement = document.createElement('div');
        loaderElement.id = 'globalGameLoader';
        loaderElement.innerHTML = `
            <style>
                #globalGameLoader {
                    position: fixed;
                    inset: 0;
                    background: linear-gradient(135deg, #0a0a0f 0%, #1a1a2e 50%, #0a0a0f 100%);
                    z-index: 99999;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    transition: opacity 0.5s ease-out;
                }
                #globalGameLoader.fade-out {
                    opacity: 0;
                    pointer-events: none;
                }
                .loader-logo {
                    font-family: 'Orbitron', 'Press Start 2P', cursive;
                    font-size: 2.5rem;
                    font-weight: 900;
                    background: linear-gradient(135deg, #818cf8, #fbbf24);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                    background-clip: text;
                    margin-bottom: 40px;
                    letter-spacing: 3px;
                    animation: pulse 2s ease-in-out infinite;
                }
                .loader-spinner {
                    width: 60px;
                    height: 60px;
                    border: 4px solid rgba(99, 102, 241, 0.1);
                    border-top: 4px solid #6366f1;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                    margin-bottom: 30px;
                }
                .loader-progress {
                    width: 280px;
                    height: 6px;
                    background: rgba(255, 255, 255, 0.1);
                    border-radius: 3px;
                    overflow: hidden;
                    margin-bottom: 15px;
                }
                .loader-progress-bar {
                    height: 100%;
                    background: linear-gradient(90deg, #6366f1, #818cf8);
                    width: 0%;
                    transition: width 0.3s ease-out;
                    box-shadow: 0 0 10px rgba(99, 102, 241, 0.5);
                }
                .loader-text {
                    color: #94a3b8;
                    font-family: 'Inter', sans-serif;
                    font-size: 0.85rem;
                    letter-spacing: 1px;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                @keyframes pulse {
                    0%, 100% { opacity: 1; transform: scale(1); }
                    50% { opacity: 0.8; transform: scale(1.05); }
                }
            </style>
            <div class="loader-logo">MMO-RPG</div>
            <div class="loader-spinner"></div>
            <div class="loader-progress">
                <div class="loader-progress-bar" id="loaderProgressBar"></div>
            </div>
            <div class="loader-text" id="loaderProgressText">Carregando recursos...</div>
        `;

        document.body.appendChild(loaderElement);
        progressBar = document.getElementById('loaderProgressBar');
        progressText = document.getElementById('loaderProgressText');
    }

    function show() {
        if (!loaderElement) create();
        loaderElement.classList.remove('fade-out');
        loaderElement.style.display = 'flex';
    }

    function hide() {
        if (!loaderElement) return;
        loaderElement.classList.add('fade-out');
        setTimeout(() => {
            if (loaderElement) {
                loaderElement.style.display = 'none';
            }
        }, 500);
    }

    function updateProgress(current, total) {
        if (!progressBar || !progressText) return;
        const percent = Math.round((current / total) * 100);
        progressBar.style.width = percent + '%';
        progressText.textContent = `Carregando... ${current}/${total}`;
    }

    return { create, show, hide, updateProgress };
})();

// Inicializar preload apenas na primeira carga da sessão
(function() {
    // Usa performance.navigation.type para detectar se é primeira carga
    // Ou verifica se os assets já estão em sessionStorage
    const isFirstLoad = !sessionStorage.getItem('game_session_initialized');
    
    if (isFirstLoad && (performance.navigation.type === 0 || !performance.navigation)) {
        window.addEventListener('DOMContentLoaded', async () => {
            console.log('[PRELOAD] Primeira carga detectada! Carregando assets...');
            GlobalLoader.show();
            
            const assets = GameCache.getCriticalAssets();
            await GameCache.preloadBatch(assets, (loaded, total) => {
                GlobalLoader.updateProgress(loaded, total);
            });
            
            sessionStorage.setItem('game_session_initialized', 'true');
            
            setTimeout(() => {
                GlobalLoader.hide();
            }, 300);
        }, { once: true });
    } else {
        // Sessão já inicializada, esconde loader imediatamente
        window.addEventListener('DOMContentLoaded', () => {
            const loader = document.getElementById('globalGameLoader');
            if (loader) loader.style.display = 'none';
        }, { once: true });
    }
})();

// =============================================================================
// 1. ESTILOS CSS (UI)
// =============================================================================
const rpgStyles = `
    .rpg-dialog-overlay * {
        box-sizing: border-box;
    }

    .rpg-dialog-overlay {
        position: fixed; 
        bottom: 15px; 
        left: 50%; 
        transform: translateX(-50%);
        width: 96%; 
        max-width: 600px; 
        height: 155px; 
        z-index: 12000; 
        display: none; 
        font-family: 'Press Start 2P', monospace;
        user-select: none;
        overflow: visible; 
    }
    
    .rpg-name-tag {
        position: absolute;
        top: -12px;
        left: 10px;
        background: #f1c40f; 
        color: #0f172a;
        padding: 6px 12px; 
        border: 3px solid #fff;
        font-size: 0.7rem; 
        border-radius: 4px;
        text-transform: uppercase; 
        letter-spacing: 1px;
        z-index: 12002;
        box-shadow: 0 4px 0 rgba(0,0,0,0.5);
        white-space: nowrap;
    }

    .rpg-dialog-box {
        background: rgba(15, 23, 42, 0.95); 
        border: 4px solid #fff;
        border-radius: 12px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.9);
        display: flex; 
        width: 100%;
        height: 100%;
        position: relative;
        z-index: 12001;
    }

    .rpg-portrait-box {
        width: 90px;
        min-width: 90px;
        background: rgba(0,0,0,0.3);
        border-right: 2px solid rgba(255,255,255,0.2);
        display: flex; 
        align-items: flex-end; 
        justify-content: center;
        overflow: hidden;
        border-radius: 8px 0 0 8px;
    }
    
    .rpg-portrait-img {
        width: 64px; 
        height: 64px;
        image-rendering: pixelated;
        background-size: 400% auto;
        background-position: 0 0; 
        margin-bottom: 10px;
        transform: scale(1.4);
        transform-origin: bottom center;
    }

    .rpg-text-area {
        flex: 1; 
        padding: 18px 15px 10px 15px;
        color: #fff; 
        position: relative;
        display: flex; 
        flex-direction: column;
        overflow: hidden; 
    }

    .rpg-message {
        font-size: 0.65rem;
        line-height: 1.6; /* Espaçamento melhor entre linhas */
        color: #e2e8f0; 
        text-shadow: 1px 1px 0 #000;
        flex: 1; 
        overflow-y: auto; 
        word-break: break-word;
        padding-right: 5px; 
        /* Mantém o texto no lugar, sem pular */
        white-space: pre-wrap; 
    }
    
    /* Classe para as letras invisíveis */
    .char-hidden {
        opacity: 0;
    }
    .char-visible {
        opacity: 1;
        transition: opacity 0.05s; /* Suaviza levemente a aparição */
    }

    .rpg-message::-webkit-scrollbar { width: 4px; }
    .rpg-message::-webkit-scrollbar-thumb { background: #334155; border-radius: 2px; }

    .rpg-next-arrow {
        display: none;
        position: absolute;
        bottom: 10px;
        right: 15px;
        color: #f1c40f;
        font-size: 1rem;
        animation: bounce 0.8s infinite;
        cursor: pointer;
    }
    @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(4px); } }

    .rpg-options {
        display: none; 
        gap: 8px;
        flex-wrap: wrap;
        justify-content: flex-end;
        margin-top: 8px;
        width: auto !important;
        flex-shrink: 0; 
    }

    .rpg-btn {
        background: #1e293b !important; 
        color: #fff !important; 
        border: 2px solid #64748b !important;
        padding: 10px 14px !important;
        font-family: inherit !important; 
        font-size: 0.6rem !important;
        font-weight: normal !important;
        cursor: pointer; 
        text-transform: uppercase;
        border-radius: 6px !important;
        transition: 0.1s;
        box-shadow: 0 4px 0 rgba(0,0,0,0.5) !important;
        width: auto !important; 
        margin: 0 !important;
        flex: none !important;
        display: inline-block !important;
    }
    .rpg-btn:active { transform: translateY(2px); box-shadow: 0 2px 0 rgba(0,0,0,0.5) !important; }
    .rpg-btn.confirm { border-color: #2ecc71 !important; color: #2ecc71 !important; }
    .rpg-btn.confirm:active { background: #2ecc71 !important; color: #000 !important; }
    .rpg-btn.cancel { border-color: #e74c3c !important; color: #e74c3c !important; }
    .rpg-btn.cancel:active { background: #e74c3c !important; color: #fff !important; }

    @media (min-width: 600px) {
        .rpg-portrait-box { width: 130px; min-width: 130px; }
        .rpg-portrait-img { width: 80px; height: 80px; transform: scale(1.5); }
        .rpg-message { font-size: 0.8rem; }
        .rpg-name-tag { font-size: 0.8rem; top: -16px; }
    }

    .simple-toast {
        font-family: 'Press Start 2P'; font-size: 10px;
        position: fixed; right: 12px; top: 12px; z-index: 99999;
        pointer-events: none; transition: 0.2s;
    }
`;

function initRPGDialog() {
    if (document.getElementById('rpg-dialog-style')) return;
    const style = document.createElement('style');
    style.id = 'rpg-dialog-style';
    style.innerHTML = rpgStyles;
    document.head.appendChild(style);

    const overlay = document.createElement('div');
    overlay.className = 'rpg-dialog-overlay';
    overlay.id = 'rpgOverlay';
    overlay.innerHTML = `
        <div class="rpg-name-tag" id="rpgName">NPC</div>
        <div class="rpg-dialog-box">
            <div class="rpg-portrait-box"><div class="rpg-portrait-img" id="rpgPortrait"></div></div>
            <div class="rpg-text-area">
                <div class="rpg-message" id="rpgText"></div>
                <div class="rpg-next-arrow" id="rpgArrow">▼</div>
                <div class="rpg-options" id="rpgOptions"></div>
            </div>
        </div>
    `;
    document.body.appendChild(overlay);
}

// =============================================================================
// 2. LÓGICA DO CARROSSEL DE TEXTO (CORRIGIDA)
// =============================================================================

function paginateText(text, maxChars) {
    const words = text.split(' ');
    const pages = [];
    let currentPage = '';

    words.forEach(word => {
        if ((currentPage + word).length > maxChars) {
            pages.push(currentPage.trim());
            currentPage = word + ' ';
        } else {
            currentPage += word + ' ';
        }
    });
    if (currentPage.trim().length > 0) pages.push(currentPage.trim());
    return pages;
}

function showRPGDialog(npcName, npcSkin, text, buttons = [], onClose = null, opts = null) {
    return new Promise((resolve) => {
        initRPGDialog();
        const overlay = document.getElementById('rpgOverlay');
        const nameEl = document.getElementById('rpgName');
        const textEl = document.getElementById('rpgText');
        const portraitEl = document.getElementById('rpgPortrait');
        const optionsEl = document.getElementById('rpgOptions');
        const arrowEl = document.getElementById('rpgArrow');

        const keepOpenForValues = Array.isArray(opts && opts.keepOpenForValues) ? opts.keepOpenForValues : [];

        nameEl.innerText = npcName || '???';
        optionsEl.innerHTML = '';
        optionsEl.style.display = 'none'; 
        arrowEl.style.display = 'none';
        
        if (npcSkin) {
            portraitEl.style.backgroundImage = (npcSkin.startsWith('data:') || npcSkin.startsWith('http')) 
                ? `url('${npcSkin}')` 
                : `url('/uploads/${npcSkin}.png')`;
        } else {
            portraitEl.style.backgroundImage = 'none';
        }

        overlay.style.display = 'block';
    // Quando o diálogo é aberto por um `pointerdown` (ex.: botão A no mobile),
    // o navegador ainda dispara um `click` no `pointerup`. Se o overlay já estiver
    // visível, esse click cai aqui e pula o typewriter instantaneamente.
    // Para manter o efeito de digitação, ignoramos cliques muito cedo após abrir.
    const openedAt = Date.now();
    const IGNORE_EARLY_CLICK_MS = 750;

        const allowHtml = !!(opts && opts.allowHtml);
        const rawText = String(text ?? '');
        let displayText = rawText;
        if (allowHtml) {
            try {
                const tmp = document.createElement('div');
                tmp.innerHTML = rawText;
                displayText = tmp.textContent || tmp.innerText || '';
            } catch (_) {
                displayText = rawText;
            }
        }

        const pages = paginateText(displayText, 90);
        let pageIndex = 0;
        let charIndex = 0;
        let typeInterval = null;
        let isTyping = false;
        let currentPageText = '';

        function typeNextPage() {
            if (pageIndex >= pages.length) return;

            // 1. Limpa o texto anterior
            textEl.textContent = '';
            charIndex = 0;
            isTyping = true;
            arrowEl.style.display = 'none';
            optionsEl.style.display = 'none';

            currentPageText = pages[pageIndex] || '';
            clearInterval(typeInterval);

            // Inicia o loop de digitação (robusto, sem depender de CSS)
            typeInterval = setInterval(() => {
                if (charIndex < currentPageText.length) {
                    charIndex++;
                    textEl.textContent = currentPageText.slice(0, charIndex);
                } else {
                    finishTyping();
                }
            }, 25); // Velocidade da digitação
        }

        function finishTyping() {
            clearInterval(typeInterval);
            isTyping = false;

            // Força o texto completo da página
            textEl.textContent = currentPageText;

            if (pageIndex < pages.length - 1) {
                arrowEl.style.display = 'block';
            } else {
                showButtons();
            }
        }

        overlay.onclick = (e) => {
            if (Date.now() - openedAt < IGNORE_EARLY_CLICK_MS) return;
            if (e.target.tagName === 'BUTTON') return; 

            if (isTyping) {
                finishTyping();
            } else {
                if (pageIndex < pages.length - 1) {
                    pageIndex++;
                    typeNextPage();
                } 
            }
        };

        function showButtons() {
            optionsEl.innerHTML = '';
            optionsEl.style.display = 'flex';

            if (buttons.length === 0) {
                const btn = document.createElement('button');
                btn.className = 'rpg-btn'; btn.innerText = 'FECHAR ▼';
                btn.onclick = (e) => { e.stopPropagation(); closeDialog(true); resolve(true); };
                optionsEl.appendChild(btn);
            } else {
                buttons.forEach(b => {
                    const btn = document.createElement('button');
                    btn.className = `rpg-btn ${b.class || ''}`; btn.innerText = b.text;
                    btn.onclick = (e) => {
                        e.stopPropagation();
                        const val = b.value;
                        const keepOpen = keepOpenForValues.includes(val);
                        if (!keepOpen) closeDialog(val);
                        resolve(val);
                    };
                    optionsEl.appendChild(btn);
                });
            }
        }

        function closeDialog(result) {
            overlay.style.display = 'none';
            overlay.onclick = null;
            if (typeof onClose === 'function') {
                try { onClose(result); } catch (_) {}
            }
        }

        typeNextPage();
    });
}

async function disengageNpc(npcId) {
    const id = String(npcId || '').trim();
    if (!id) return;
    try {
        await fetch('/api/npc/disengage', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ npcId: id })
        });
    } catch (_) {
        // best-effort
    }
}

// Marca NPC derrotado localmente e faz fade-out suave (alinha client-side com /api/npc/disengage)
window.markNpcDefeated = async function(npcId) {
    try {
        const id = String(npcId || '').trim();
        if (!id) return;
        window.DEFEATED_NPCS = Array.isArray(window.DEFEATED_NPCS) ? window.DEFEATED_NPCS : [];
        if (!window.DEFEATED_NPCS.includes(id)) window.DEFEATED_NPCS.push(id);

        const el = document.getElementById(`npc-${id}`) || document.querySelector(`.npc-entity[data-npc-id="${id}"]`);
        if (el) {
            try {
                el.style.transition = 'opacity 320ms ease, transform 320ms ease';
                el.style.opacity = '0';
                el.style.transform = 'scale(0.94)';
                setTimeout(() => { if (el && el.parentNode) el.parentNode.removeChild(el); }, 360);
            } catch (_) {}
        }

        // best-effort notify server to resume patrol
        try {
            await fetch('/api/npc/disengage', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ npcId: id }) });
        } catch (_) {}
    } catch (_) {}
};

// Ao voltar de uma batalha de NPC, retoma a patrulha do NPC imediatamente.
(function resumeNpcFromUrl() {
    try {
        const qs = new URLSearchParams(window.location.search || '');
        const npcId = qs.get('resumeNpcId');
        if (npcId) disengageNpc(npcId);
    } catch (_) {}
})();

// =============================================================================
// 3. LÓGICA DE MOVIMENTO E INTERAÇÃO COM NPC (GLOBAL)
// =============================================================================

if (typeof socket !== 'undefined') {
    socket.on('npcs_list', (list) => {
        if (typeof window !== 'undefined' && window.DISABLE_GLOBAL_NPC_RENDER) return;
        document.querySelectorAll('.npc-entity').forEach(el => el.remove());
        const gameArea = document.getElementById('gameArea');
        if(!gameArea) return;

        const defeated = Array.isArray(window.DEFEATED_NPCS) ? window.DEFEATED_NPCS.map(d => String(d)) : [];

        list.forEach(npc => {
            const npcIdStr = String(npc._id || npc.id || '');
            if (npcIdStr && defeated.includes(npcIdStr)) return; // pula NPCs já derrotados por este jogador

            const div = document.createElement('div');
            div.className = 'player npc-entity';
            // identificadores úteis para remoção/anim
            if (npcIdStr) div.id = `npc-${npcIdStr}`;
            if (npcIdStr) div.setAttribute('data-npc-id', npcIdStr);
            div.style.left = npc.x + '%';
            div.style.top = npc.y + '%';
            div.style.zIndex = Math.floor(npc.y);

            if (npc.isCustomSkin || (npc.skin && (npc.skin.startsWith('data:') || npc.skin.startsWith('http')))) {
                div.style.backgroundImage = `url('${npc.skin}')`;
            } else if (npc.skin) {
                div.style.backgroundImage = `url('/skins/${encodeURIComponent(npc.skin)}.png')`;
            } else {
                div.style.backgroundImage = 'none';
            }
            
            div.setAttribute('data-dir', npc.direction || 'down');

            const label = document.createElement('div');
            label.className = 'player-name';
            label.style.color = '#f1c40f'; 
            label.innerText = npc.name;
            div.appendChild(label);
            
            div.onclick = (e) => { 
                e.stopPropagation(); 
                moveToAndTalkToNPC(npc); 
            };
            
            gameArea.appendChild(div);
        });
    });
}

function moveToAndTalkToNPC(npc) {
    if (window.isPlayerMoving || window.isInteracting) return;

    let currentMap = 'lobby';
    if (window.location.pathname.includes('forest')) currentMap = 'forest';
    if (window.location.pathname.includes('city')) currentMap = 'city';
    
    const socketId = socket.id; 
    const myPlayer = document.getElementById(`p-${socketId}`);
    
    if(!myPlayer) {
        interactWithNPC(npc);
        return;
    }

    const currentLeft = parseFloat(myPlayer.style.left);
    const currentTop = parseFloat(myPlayer.style.top);
    const dx = npc.x - currentLeft;
    const dy = npc.y - currentTop;
    const dist = Math.sqrt(dx*dx + dy*dy);
    const MOVEMENT_SPEED = 55;

    function engageAt(px, py) {
        try {
            fetch('/api/npc/engage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcId: npc._id,
                    playerX: px,
                    playerY: py,
                    currentMap
                })
            });
        } catch (_) {
            // best-effort
        }
    }

    if (dist > 8) { 
        window.isInteracting = true; 
        const ratio = 6 / dist; 
        const targetX = npc.x - (dx * ratio);
        const targetY = npc.y - (dy * ratio);

        engageAt(targetX, targetY);
        
        const gameArea = document.getElementById('gameArea');
        if(gameArea) gameArea.classList.add('locked');
        
        socket.emit('move_player', { x: targetX, y: targetY });
        
        const timeToTravel = (dist / MOVEMENT_SPEED) * 1000;
        
        setTimeout(() => {
            if(gameArea) gameArea.classList.remove('locked');
            window.isInteracting = false;
            interactWithNPC(npc); 
        }, timeToTravel);
    } else {
        engageAt(currentLeft, currentTop);
        interactWithNPC(npc); 
    }
}

async function interactWithNPC(npc) {
    try {
        console.log(`[CLIENT] ========== interactWithNPC CHAMADO ==========`);
        console.log(`[CLIENT] NPC completo:`, npc);
        
        const myId = window.CURRENT_USER_ID;
        const defeatedList = window.DEFEATED_NPCS || [];
        updateNpcShopCtx({ npcId: npc._id, npcName: npc.name, npcSkin: npc.skin, userId: myId });
        
        console.log(`[CLIENT] myId: ${myId}`);
        console.log(`[CLIENT] defeatedList:`, defeatedList);

    function isStarterNpc(n) {
        try {
            const svc = (n && n.interact && n.interact.serviceType) ? String(n.interact.serviceType).trim() : '';
            const type = (n && n.npcType) ? String(n.npcType).trim() : '';
            return svc === 'starter' || type === 'starter';
        } catch (_) {
            return false;
        }
    }

    function escapeHtml(s) {
        return String(s || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async function chooseStarterFlow(n, text, options) {
        const list = Array.isArray(options) ? options.slice(0, 3) : [];
        if (list.length < 3) {
            await showRPGDialog(n.name, n.skin, 'Erro: opções de starter insuficientes.');
            return;
        }

        const safeHtmlText = escapeHtml(text).replace(/\n/g, '<br>');
        const buttons = [
            ...list.map(o => ({
                text: `ESCOLHER ${o && o.name ? String(o.name) : String(o && o.id ? o.id : '')}`.trim(),
                value: String(o && o.id ? o.id : ''),
                class: 'confirm'
            })),
            { text: 'SAIR', value: 'exit', class: 'cancel' }
        ];

        const pick = await showRPGDialog(n.name, n.skin, safeHtmlText, buttons, null, { allowHtml: true });
        if (!pick || pick === 'exit') return;

        try {
            const res = await fetch('/api/starter/choose', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: myId, baseId: String(pick), npcId: n._id })
            });
            const data = await res.json().catch(() => ({}));
            updateUserGlobals(data);
            if (!res.ok || (data && data.error)) {
                await showRPGDialog(n.name, n.skin, (data && data.error) ? data.error : 'Não foi possível escolher.');
                return;
            }
            const chosenName = (data && data.picked && data.picked.name) ? data.picked.name : 'seu monstro';
            await showRPGDialog(n.name, n.skin, `Você escolheu ${chosenName}! Boa sorte na jornada.`);
        } catch (e) {
            await showRPGDialog(n.name, n.skin, 'Erro ao escolher o monstro inicial.');
        }
    }

    function updateUserGlobals(payload) {
        if (!payload) return;
        if (payload.inventory && typeof payload.inventory === 'object') window.USER_INVENTORY = payload.inventory;
        if (Array.isArray(payload.keyItems)) window.USER_KEY_ITEMS = payload.keyItems;
        if (payload.storyFlags && typeof payload.storyFlags === 'object') window.STORY_FLAGS = payload.storyFlags;
        if (Array.isArray(payload.defeatedNPCs)) window.DEFEATED_NPCS = payload.defeatedNPCs.map(d => String(d));
    }

    let currentMap = 'lobby';
    let cx = 50, cy = 50;
    if (window.location.pathname.includes('forest')) currentMap = 'forest';
    if (window.location.pathname.includes('city')) currentMap = 'city';
    const pEl = document.getElementById(`p-${socket.id}`);
    if (pEl) {
        cx = parseFloat(pEl.style.left);
        cy = parseFloat(pEl.style.top);
    }

    async function engageNpc() {
        try {
            await fetch('/api/npc/engage', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    npcId: npc._id,
                    playerX: cx,
                    playerY: cy,
                    currentMap
                })
            });
        } catch (_) {
            // best-effort
        }
    }

    let ITEM_CATALOG_CACHE = null;
    let NPC_SHOP_CTX = { npcId: null, npcName: '', npcSkin: '', userId: null };

    function updateNpcShopCtx(ctx = {}) {
        NPC_SHOP_CTX = { ...NPC_SHOP_CTX, ...(ctx || {}) };
        window.NPC_SHOP_CTX = NPC_SHOP_CTX;
    }

    function ensureShopStyles() {
        if (document.getElementById('npc-shop-styles')) return;
        const css = `
        .npc-shop-overlay{position:fixed;inset:0;background:rgba(8,11,22,0.75);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;z-index:9999;}
        .npc-shop-panel{background:#0b1220;border:1px solid #1f2a3d;box-shadow:0 20px 60px rgba(0,0,0,0.45);border-radius:14px;max-width:960px;width:92vw;max-height:82vh;display:flex;flex-direction:column;overflow:hidden;color:#e6ecff;font-family:'Rajdhani',sans-serif;}
        .npc-shop-header{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #1f2a3d;background:linear-gradient(90deg,#0f172a 0%,#10213a 100%);}
        .npc-shop-header h3{margin:0;font-size:1.1rem;letter-spacing:0.5px;color:#f1c40f;}
        .npc-shop-close{background:none;border:none;color:#94a3b8;font-size:1.1rem;cursor:pointer;padding:6px 10px;border-radius:8px;}
        .npc-shop-close:hover{background:#1f2a3d;color:#fff;}
        .npc-shop-grid{padding:18px;display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;overflow:auto;}
        .npc-shop-card{background:linear-gradient(145deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02));border:1px solid #1f2a3d;border-radius:12px;padding:12px;display:flex;flex-direction:column;gap:8px;box-shadow:0 10px 26px rgba(0,0,0,0.35);}
        .npc-shop-card .icon{width:64px;height:64px;border:1px solid #24334a;border-radius:10px;background:#0f172a;display:flex;align-items:center;justify-content:center;overflow:hidden;align-self:flex-start;}
        .npc-shop-card .icon img{width:100%;height:100%;object-fit:contain;image-rendering:pixelated;}
        .npc-shop-card .title{font-weight:700;font-size:1rem;color:#e6ecff;}
        .npc-shop-card .meta{font-size:0.85rem;color:#9fb3d1;display:flex;gap:8px;align-items:center;}
        .npc-shop-card .meta .pill{padding:2px 8px;border-radius:999px;border:1px solid #24334a;background:#131d30;font-weight:700;font-size:0.75rem;color:#8dd2ff;}
        .npc-shop-card .meta .price{color:#f1c40f;font-weight:800;}
        .npc-shop-card button{margin-top:auto;background:#2ecc71;border:none;color:#052e16;font-weight:800;border-radius:10px;padding:10px;cursor:pointer;transition:0.15s;font-size:0.95rem;}
        .npc-shop-card button:hover{filter:brightness(1.05);} 
        .npc-shop-card button:disabled{background:#1f2a3d;color:#6b7280;cursor:not-allowed;}
        .npc-shop-empty{padding:24px;text-align:center;color:#94a3b8;}
        `;
        const tag = document.createElement('style');
        tag.id = 'npc-shop-styles';
        tag.textContent = css;
        document.head.appendChild(tag);
    }

    async function getItemCatalogClient() {
        if (ITEM_CATALOG_CACHE) return ITEM_CATALOG_CACHE;
        try {
            const res = await fetch('/api/items/catalog');
            const json = await res.json();
            if (json && json.success && Array.isArray(json.items)) {
                ITEM_CATALOG_CACHE = json.items;
                return ITEM_CATALOG_CACHE;
            }
        } catch (_) {}
        ITEM_CATALOG_CACHE = [];
        return ITEM_CATALOG_CACHE;
    }

    async function openNpcShop(items, ctx = {}) {
        // Permite ser chamado via window.openNpcShop
        window.openNpcShop = openNpcShop;

        const context = { ...NPC_SHOP_CTX, ...(ctx || {}) };
        if (!context.userId && window.CURRENT_USER_ID) context.userId = window.CURRENT_USER_ID;

        const list = Array.isArray(items) ? items : [];
        const catalog = await getItemCatalogClient();
        ensureShopStyles();

        const data = list.map(raw => {
            const itemId = String(raw && (raw.itemId || raw.id) || '').trim();
            const def = catalog.find(c => c.id === itemId);
            const price = Math.max(0, parseInt(raw && raw.price, 10) || 0);
            return {
                id: itemId,
                name: (raw && raw.name) || (def && def.name) || itemId || 'Item',
                type: def && def.type === 'key' ? 'key' : 'consumable',
                price,
                icon: (def && def.hasIcon) ? `/api/items/icon/${encodeURIComponent(itemId)}.png?ts=${def.updatedAt || Date.now()}` : null
            };
        }).filter(x => x.id);

        const overlay = document.createElement('div');
        overlay.className = 'npc-shop-overlay';
        overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

        const panel = document.createElement('div');
        panel.className = 'npc-shop-panel';
        overlay.appendChild(panel);

        const header = document.createElement('div');
        header.className = 'npc-shop-header';
        const title = document.createElement('h3');
        title.textContent = context.npcName ? `Loja de ${context.npcName}` : 'Loja';
        const close = document.createElement('button');
        close.className = 'npc-shop-close';
        close.textContent = 'Fechar';
        close.onclick = () => overlay.remove();
        header.appendChild(title);
        header.appendChild(close);
        panel.appendChild(header);

        const grid = document.createElement('div');
        grid.className = 'npc-shop-grid';
        panel.appendChild(grid);

        if (!data.length) {
            const empty = document.createElement('div');
            empty.className = 'npc-shop-empty';
            empty.textContent = 'Sem itens à venda agora.';
            grid.appendChild(empty);
        }

        const buyItem = async (itemId, btn) => {
            if (!itemId) return;
            if (btn) btn.disabled = true;
            try {
                const res = await fetch('/api/npc/shop/buy', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: context.userId, npcId: context.npcId, itemId })
                });
                const resp = await res.json().catch(() => ({}));
                if (!res.ok || resp.error) {
                    showToast(resp.error || 'Não foi possível comprar.');
                    if (btn) btn.disabled = false;
                    return;
                }

                // Atualiza client-side com o retorno da API (bag, keyItems, money)
                if (resp && typeof resp.money === 'number') window.USER_MONEY = resp.money;
                if (resp && resp.bag && typeof resp.bag === 'object') window.USER_INVENTORY = resp.bag;
                if (resp && Array.isArray(resp.keyItems)) window.USER_KEY_ITEMS = resp.keyItems;
                if (resp && resp.storyFlags && typeof resp.storyFlags === 'object') window.STORY_FLAGS = resp.storyFlags;

                showToast('Item comprado!');
            } catch (_) {
                showToast('Erro ao comprar.');
                if (btn) btn.disabled = false;
            }
        };

        data.forEach(it => {
            const card = document.createElement('div');
            card.className = 'npc-shop-card';

            const iconBox = document.createElement('div');
            iconBox.className = 'icon';
            if (it.icon) {
                const img = document.createElement('img');
                img.src = it.icon;
                img.alt = it.name;
                iconBox.appendChild(img);
            } else {
                const fallback = document.createElement('span');
                fallback.style.color = '#8da2c0';
                fallback.style.fontWeight = '800';
                fallback.textContent = (it.name || it.id).slice(0, 2).toUpperCase();
                iconBox.appendChild(fallback);
            }
            card.appendChild(iconBox);

            const titleEl = document.createElement('div');
            titleEl.className = 'title';
            titleEl.textContent = it.name;
            card.appendChild(titleEl);

            const meta = document.createElement('div');
            meta.className = 'meta';
            const pill = document.createElement('span');
            pill.className = 'pill';
            pill.textContent = it.type === 'key' ? 'Item-chave' : 'Consumível';
            const price = document.createElement('span');
            price.className = 'price';
            price.textContent = `$${it.price}`;
            meta.appendChild(pill);
            meta.appendChild(price);
            card.appendChild(meta);

            const btn = document.createElement('button');
            btn.textContent = `Comprar por $${it.price}`;
            btn.disabled = it.price <= 0;
            btn.onclick = () => buyItem(it.id, btn);
            card.appendChild(btn);

            grid.appendChild(card);
        });

        document.body.appendChild(overlay);
    }

    // Expõe o shop para outros scripts (ex.: city.ejs)
    window.openNpcShop = openNpcShop;

    const hasInteract = isStarterNpc(npc) || !!(npc.interact && npc.interact.enabled);
    const canBattle = npc.team && npc.team.length > 0;

    console.log(`[CLIENT] Interagindo com NPC: ${npc.name}`);
    console.log(`[CLIENT] hasInteract: ${hasInteract}, canBattle: ${canBattle}`);
    console.log(`[CLIENT] npc.team:`, npc.team);
    console.log(`[CLIENT] npc.interact:`, npc.interact);

    // NPC sem time: pode ser apenas diálogo OU interação de história
    if (!canBattle) {
        console.log(`[CLIENT] NPC sem time de batalha`);
        if (!hasInteract) {
            console.log(`[CLIENT] NPC sem interact, chamando /api/npc/dialogue...`);
            // Resolver diálogo com backend (para suportar condicionais por flag)
            try {
                const dialogRes = await fetch('/api/npc/dialogue', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: myId, npcId: npc._id })
                });
                const dialogData = await dialogRes.json();
                console.log(`[CLIENT] Resposta do servidor:`, dialogData);
                showRPGDialog(npc.name, npc.skin, dialogData.text || '...');
            } catch (e) {
                console.error(`[CLIENT] Erro ao buscar diálogo:`, e);
                showRPGDialog(npc.name, npc.skin, '...');
            }
            return;
        }

        console.log(`[CLIENT] NPC com interact, chamando /api/npc/dialogue...`);
        // Resolver diálogo com backend
        let dialogueText = '...';
        try {
            const dialogRes = await fetch('/api/npc/dialogue', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: myId, npcId: npc._id })
            });
            const dialogData = await dialogRes.json();
            console.log(`[CLIENT] Resposta do servidor:`, dialogData);
            dialogueText = dialogData.text || '...';
        } catch (e) {
            dialogueText = '...';
        }
        
        showRPGDialog(npc.name, npc.skin, dialogueText, [
            { text: 'FALAR', value: 'talk', class: 'confirm' },
            { text: 'SAIR', value: 'exit', class: 'cancel' }
        ]).then(async (choice) => {
            if (choice !== 'talk') return;
            try {
                await engageNpc();
                const res = await fetch('/api/npc/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: myId, npcId: npc._id, playerX: cx, playerY: cy, currentMap })
                });
                const data = await res.json().catch(() => ({}));
                updateUserGlobals(data);
                const txt = (data && data.text) ? data.text : (npc.dialogue || '...');

                if (data && data.alreadyDone && isStarterNpc(npc)) {
                    await showRPGDialog(npc.name, npc.skin, txt);
                    return;
                }

                if (data && data.action && data.action.type === 'starter') {
                    await chooseStarterFlow(npc, txt, data.action.options);
                    return;
                }

                // Fallback: NPC marcado como starter, mas backend não retornou action
                if (isStarterNpc(npc)) {
                    try {
                        const optRes = await fetch(`/api/starter/options?userId=${encodeURIComponent(myId)}&npcId=${encodeURIComponent(String(npc._id || ''))}`);
                        const optData = await optRes.json().catch(() => ({}));
                        updateUserGlobals(optData);
                        if (optData && optData.error) {
                            await showRPGDialog(npc.name, npc.skin, optData.error);
                            return;
                        }
                        if (optData && optData.chosen) {
                            await showRPGDialog(npc.name, npc.skin, 'Você já escolheu o seu monstro inicial.');
                            return;
                        }
                        await chooseStarterFlow(npc, txt, optData.options);
                        return;
                    } catch (_) {
                        // ignore
                    }
                }

                await showRPGDialog(npc.name, npc.skin, txt);

                if (data && data.action && data.action.type === 'shop') {
                    await openNpcShop(data.action.items);
                }
            } catch (e) {
                showToast('Erro ao interagir.');
            }
        });
        return;
    }

    const record = defeatedList.find(r => (r === npc._id) || (r.npcId === npc._id));
    if (record) {
        const defeatedAt = record.defeatedAt || 0;
        const cooldownMins = npc.cooldownMinutes || 0;

        if (cooldownMins <= 0) {
            const winText = npc.winDialogue || "Você já me venceu! Bom trabalho.";
            showRPGDialog(npc.name, npc.skin, winText);
            return;
        }

        if (defeatedAt > 0) {
            const now = Date.now();
            const diffMinutes = (now - defeatedAt) / 60000;
            if (diffMinutes < cooldownMins) {
                const cdText = npc.cooldownDialogue || "Estou descansando meus Pokémons...";
                const remaining = Math.ceil(cooldownMins - diffMinutes);
                showRPGDialog(npc.name, npc.skin, `${cdText} (Volte em ${remaining} min)`);
                return;
            }
        }
    }

    const buttons = [];
    if (hasInteract) buttons.push({ text: 'FALAR', value: 'talk', class: 'confirm' });
    buttons.push({ text: 'BATALHAR', value: 'battle', class: 'confirm' });
    buttons.push({ text: 'SAIR', value: 'exit', class: 'cancel' });

    // Resolver diálogo com backend
    let dialogueText = 'Vamos batalhar!';
    try {
        const dialogRes = await fetch('/api/npc/dialogue', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: myId, npcId: npc._id })
        });
        const dialogData = await dialogRes.json();
        dialogueText = dialogData.text || 'Vamos batalhar!';
    } catch (e) {
        dialogueText = npc.dialogue || 'Vamos batalhar!';
    }

    showRPGDialog(npc.name, npc.skin, dialogueText, buttons).then(async (choice) => {
        if(choice === 'talk') {
            try {
                await engageNpc();
                const res = await fetch('/api/npc/interact', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId: myId, npcId: npc._id, playerX: cx, playerY: cy, currentMap })
                });
                const data = await res.json().catch(() => ({}));
                updateUserGlobals(data);
                const txt = (data && data.text) ? data.text : '...';

                if (data && data.alreadyDone && isStarterNpc(npc)) {
                    await showRPGDialog(npc.name, npc.skin, txt);
                    return;
                }

                if (data && data.action && data.action.type === 'starter') {
                    await chooseStarterFlow(npc, txt, data.action.options);
                    return;
                }

                if (isStarterNpc(npc)) {
                    try {
                        const optRes = await fetch(`/api/starter/options?userId=${encodeURIComponent(myId)}&npcId=${encodeURIComponent(String(npc._id || ''))}`);
                        const optData = await optRes.json().catch(() => ({}));
                        updateUserGlobals(optData);
                        if (optData && optData.error) {
                            await showRPGDialog(npc.name, npc.skin, optData.error);
                            return;
                        }
                        if (optData && optData.chosen) {
                            await showRPGDialog(npc.name, npc.skin, 'Você já escolheu o seu monstro inicial.');
                            return;
                        }
                        await chooseStarterFlow(npc, txt, optData.options);
                        return;
                    } catch (_) {}
                }

                await showRPGDialog(npc.name, npc.skin, txt);

                if (data && data.action && data.action.type === 'shop') {
                    await openNpcShop(data.action.items);
                }
            } catch (e) {
                showToast('Erro ao interagir.');
            }
            return;
        }

        if(choice === 'battle') {
            if(typeof showLoading === 'function') showLoading('Iniciando Batalha...');
            
            fetch('/battle/npc', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ 
                    userId: myId, 
                    npcId: npc._id,
                    currentMap: currentMap,
                    currentX: cx,
                    currentY: cy
                }) 
            })
            .then(r => r.json())
            .then(data => { 
                if(data.error) { 
                    if(typeof hideLoading === 'function') hideLoading(); 
                    showToast(data.error); 
                } else { 
                    window.location.href = '/battle/' + data.battleId; 
                } 
            });
        }
    });
    } catch (ERR) {
        console.error(`[CLIENT] ERRO CRÍTICO em interactWithNPC:`, ERR);
        console.error(ERR.stack);
        showToast(`Erro: ${ERR.message}`);
    }
}

// =============================================================================
// 4. UTILITÁRIOS GERAIS
// =============================================================================

function showToast(message, opts = {}) {
    const duration = opts.duration || 3000;
    let container = document.getElementById('global-toast-container');
    if(!container) {
        container = document.createElement('div');
        container.id = 'global-toast-container';
        container.style.position = 'fixed'; container.style.right = '12px'; container.style.top = '12px'; container.style.zIndex = '99999';
        container.style.display = 'flex'; container.style.flexDirection = 'column'; container.style.gap = '8px'; container.style.pointerEvents = 'none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'simple-toast'; toast.innerText = message;
    toast.style.background = opts.bg || 'rgba(0,0,0,0.85)';
    toast.style.color = opts.color || '#fff';
    toast.style.padding = '10px 12px'; toast.style.borderRadius = '8px';
    toast.style.opacity = '0';
    container.appendChild(toast);
    void toast.offsetWidth; toast.style.opacity = '1';
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 180); }, duration);
}

function showConfirm(message, opts) {
    return showRPGDialog('SISTEMA', null, message, [
        { text: opts.okText || 'SIM', value: true, class: 'confirm' },
        { text: opts.cancelText || 'NÃO', value: false, class: 'cancel' }
    ]);
}

function resolveImg(src) { 
    if(!src) return '';
    return (src.startsWith('http') || src.startsWith('data:')) ? src : '/uploads/' + src; 
}

function switchTab(id, btn) {
    document.querySelectorAll('.tab-content').forEach(d => d.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.style.display = 'block';
    if (btn) btn.classList.add('active');
}

function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }

initRPGDialog();