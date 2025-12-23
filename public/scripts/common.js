// --- SISTEMA DE DIÁLOGO RPG & NPC CONTROLLER (COM CARROSSEL & TYPEWRITER SUAVE) ---

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

function showRPGDialog(npcName, npcSkin, text, buttons = []) {
    return new Promise((resolve) => {
        initRPGDialog();
        const overlay = document.getElementById('rpgOverlay');
        const nameEl = document.getElementById('rpgName');
        const textEl = document.getElementById('rpgText');
        const portraitEl = document.getElementById('rpgPortrait');
        const optionsEl = document.getElementById('rpgOptions');
        const arrowEl = document.getElementById('rpgArrow');

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

        const pages = paginateText(text, 90);
        let pageIndex = 0;
        let charIndex = 0;
        let typeInterval = null;
        let isTyping = false;
        let spans = []; // Array para guardar os elementos span

        function typeNextPage() {
            if (pageIndex >= pages.length) return;

            // 1. Limpa o texto anterior
            textEl.innerHTML = '';
            charIndex = 0;
            isTyping = true;
            arrowEl.style.display = 'none';
            optionsEl.style.display = 'none';

            // 2. Prepara o conteúdo invisível (MÁGICA AQUI)
            const content = pages[pageIndex];
            spans = []; // Reset array

            // Cria um span para cada letra e adiciona invisível
            for (let i = 0; i < content.length; i++) {
                const span = document.createElement('span');
                span.textContent = content[i];
                span.className = 'char-hidden'; // Começa invisível
                textEl.appendChild(span);
                spans.push(span);
            }

            // 3. Inicia o loop de revelação
            typeInterval = setInterval(() => {
                if (charIndex < spans.length) {
                    spans[charIndex].className = 'char-visible'; // Revela
                    charIndex++;
                } else {
                    finishTyping();
                }
            }, 25); // Velocidade da digitação
        }

        function finishTyping() {
            clearInterval(typeInterval);
            isTyping = false;
            
            // Força todos a ficarem visíveis imediatamente
            spans.forEach(s => s.className = 'char-visible');

            if (pageIndex < pages.length - 1) {
                arrowEl.style.display = 'block';
            } else {
                showButtons();
            }
        }

        overlay.onclick = (e) => {
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
                btn.onclick = (e) => { e.stopPropagation(); closeDialog(); resolve(true); };
                optionsEl.appendChild(btn);
            } else {
                buttons.forEach(b => {
                    const btn = document.createElement('button');
                    btn.className = `rpg-btn ${b.class || ''}`; btn.innerText = b.text;
                    btn.onclick = (e) => { e.stopPropagation(); closeDialog(); resolve(b.value); };
                    optionsEl.appendChild(btn);
                });
            }
        }

        function closeDialog() {
            overlay.style.display = 'none';
            overlay.onclick = null;
        }

        typeNextPage();
    });
}

// =============================================================================
// 3. LÓGICA DE MOVIMENTO E INTERAÇÃO COM NPC (GLOBAL)
// =============================================================================

if (typeof socket !== 'undefined') {
    socket.on('npcs_list', (list) => {
        document.querySelectorAll('.npc-entity').forEach(el => el.remove());
        const gameArea = document.getElementById('gameArea');
        if(!gameArea) return;

        list.forEach(npc => {
            const div = document.createElement('div');
            div.className = 'player npc-entity'; 
            div.style.left = npc.x + '%';
            div.style.top = npc.y + '%';
            div.style.zIndex = Math.floor(npc.y);

            if (npc.isCustomSkin) div.style.backgroundImage = `url('${npc.skin}')`;
            else div.style.backgroundImage = `url('/uploads/${npc.skin}.png')`;
            
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

    if (dist > 8) { 
        window.isInteracting = true; 
        const ratio = 6 / dist; 
        const targetX = npc.x - (dx * ratio);
        const targetY = npc.y - (dy * ratio);
        
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
        interactWithNPC(npc); 
    }
}

function interactWithNPC(npc) {
    const myId = window.CURRENT_USER_ID;
    const defeatedList = window.DEFEATED_NPCS || [];

    let currentMap = 'lobby';
    let cx = 50, cy = 50;
    if (window.location.pathname.includes('forest')) currentMap = 'forest';
    const pEl = document.getElementById(`p-${socket.id}`);
    if (pEl) {
        cx = parseFloat(pEl.style.left);
        cy = parseFloat(pEl.style.top);
    }

    if (!npc.team || npc.team.length === 0) {
        showRPGDialog(npc.name, npc.skin, npc.dialogue || '...');
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

    showRPGDialog(npc.name, npc.skin, npc.dialogue || 'Vamos batalhar!', [
        { text: 'BATALHAR', value: true, class: 'confirm' },
        { text: 'SAIR', value: false, class: 'cancel' }
    ]).then(accepted => {
        if(accepted) {
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