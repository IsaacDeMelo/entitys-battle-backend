// --- CONFIGURAÇÃO DE UI (TOASTS E MODAIS) ---

function showToast(message, opts = {}) {
    const duration = opts.duration || 3000;
    let container = document.getElementById('global-toast-container');
    if(!container) {
        container = document.createElement('div');
        container.id = 'global-toast-container';
        container.style.position = 'fixed';
        container.style.right = '12px';
        container.style.top = '12px';
        container.style.zIndex = 99999;
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '8px';
        container.style.pointerEvents = 'none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'simple-toast';
    toast.innerText = message;
    toast.style.background = opts.bg || 'rgba(0,0,0,0.85)';
    toast.style.color = opts.color || '#fff';
    toast.style.padding = '10px 12px';
    toast.style.borderRadius = '8px';
    toast.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)';
    toast.style.fontFamily = "'Press Start 2P', monospace";
    toast.style.fontSize = '10px';
    toast.style.maxWidth = '320px';
    toast.style.wordBreak = 'break-word';
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.18s ease-out, transform 0.18s ease-out';
    toast.style.transform = 'translateY(-6px)';
    container.appendChild(toast);
    
    // Força reflow para animação
    void toast.offsetWidth;
    toast.style.opacity = '1'; toast.style.transform = 'translateY(0)';
    
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateY(-6px)';
        setTimeout(() => toast.remove(), 180);
    }, duration);
}

function showConfirm(message, opts = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed'; overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%'; overlay.style.background = 'rgba(0,0,0,0.7)'; overlay.style.zIndex = '100000'; overlay.style.display = 'flex'; overlay.style.justifyContent = 'center'; overlay.style.alignItems = 'center';
        
        const dialog = document.createElement('div');
        dialog.style.background = '#1e293b'; dialog.style.padding = '20px'; dialog.style.borderRadius = '10px'; dialog.style.textAlign = 'center'; dialog.style.border = '2px solid #3498db'; dialog.style.maxWidth = '300px';
        
        const msg = document.createElement('p'); msg.innerText = message; msg.style.color = '#fff'; msg.style.fontFamily = 'sans-serif'; msg.style.marginBottom = '20px'; msg.style.whiteSpace = 'pre-wrap';
        
        const btnRow = document.createElement('div'); btnRow.style.display = 'flex'; btnRow.style.justifyContent = 'center'; btnRow.style.gap = '10px';

        const btnYes = document.createElement('button'); btnYes.innerText = opts.okText || 'Sim'; btnYes.style.background = opts.okBg || '#2ecc71'; btnYes.style.border = 'none'; btnYes.style.padding = '10px 20px'; btnYes.style.color = '#fff'; btnYes.style.cursor = 'pointer'; btnYes.style.borderRadius = '5px';
        const btnNo = document.createElement('button'); btnNo.innerText = opts.cancelText || 'Não'; btnNo.style.background = '#e74c3c'; btnNo.style.border = 'none'; btnNo.style.padding = '10px 20px'; btnNo.style.color = '#fff'; btnNo.style.cursor = 'pointer'; btnNo.style.borderRadius = '5px';

        btnYes.onclick = () => { overlay.remove(); resolve(true); };
        btnNo.onclick = () => { overlay.remove(); resolve(false); };

        btnRow.appendChild(btnNo); btnRow.appendChild(btnYes);
        dialog.appendChild(msg); dialog.appendChild(btnRow); overlay.appendChild(dialog); document.body.appendChild(overlay);
    });
}

function resolveImg(src) { 
    return (src.startsWith('http') || src.startsWith('data:')) ? src : '/uploads/' + src; 
}

// --- FUNÇÕES DE INTERFACE DO JOGO ---
function switchTab(id, btn) {
    document.querySelectorAll('.content-area, .tab-content').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    const target = btn || document.activeElement || (window.event && window.event.target) || null;
    if (target && target.classList) target.classList.add('active');
}

function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }

// --- LÓGICA DE NPC (GLOBAL) ---
// O socket já deve existir globalmente quando este arquivo for carregado
if (typeof socket !== 'undefined') {
    socket.on('npcs_list', (list) => {
        // Limpa NPCs antigos para não duplicar
        document.querySelectorAll('.npc-entity').forEach(el => el.remove());
        
        list.forEach(npc => {
            const div = document.createElement('div');
            div.className = 'player npc-entity'; // Usa classe player para ter 48x48
            div.style.left = npc.x + '%';
            div.style.top = npc.y + '%';
            div.style.zIndex = Math.floor(npc.y);

            // Lógica de Skin (CSS Background para funcionar o recorte)
            if (npc.isCustomSkin) {
                div.style.backgroundImage = `url('${npc.skin}')`;
            } else {
                div.style.backgroundImage = `url('/uploads/${npc.skin}.png')`;
            }
            div.setAttribute('data-dir', npc.direction || 'down');

            // Nome do NPC
            const label = document.createElement('div');
            label.className = 'player-name';
            label.style.color = '#f1c40f'; // Dourado
            label.innerText = npc.name;
            div.appendChild(label);
            
            // Clique no NPC
            div.onclick = (e) => { 
                e.stopPropagation(); 
                interactWithNPC(npc); 
            };
            
            document.getElementById('gameArea').appendChild(div);
        });
    });
}

function interactWithNPC(npc) {
    // Usa window.CURRENT_USER_ID definido no EJS
    const myId = (typeof window.CURRENT_USER_ID !== 'undefined') ? window.CURRENT_USER_ID : new URLSearchParams(window.location.search).get('userId');

    showConfirm(`${npc.name} diz:\n"${npc.dialogue || '...'}"\n\nAceitar batalha?`, { okText: 'BATALHAR', cancelText: 'Sair', okBg: '#e67e22' }).then(yes => {
        if(yes) {
            if(typeof showLoading === 'function') showLoading('Iniciando Batalha...');
            
            fetch('/battle/npc', { 
                method: 'POST', 
                headers: {'Content-Type': 'application/json'}, 
                body: JSON.stringify({ userId: myId, npcId: npc._id }) 
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
