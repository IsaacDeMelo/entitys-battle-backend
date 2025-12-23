// --- UI HELPERS ---
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

function showToast(message, opts = {}) {
    const duration = opts.duration || 3000;
    let container = document.getElementById('global-toast-container');
    if(!container) {
        container = document.createElement('div'); container.id = 'global-toast-container';
        container.style.position = 'fixed'; container.style.right = '12px'; container.style.top = '12px'; container.style.zIndex = 99999;
        container.style.display = 'flex'; container.style.flexDirection = 'column'; container.style.gap = '8px'; container.style.pointerEvents = 'none';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div'); toast.className = 'simple-toast'; toast.innerText = message;
    toast.style.background = opts.bg || 'rgba(0,0,0,0.85)'; toast.style.color = opts.color || '#fff'; toast.style.padding = '10px 12px'; toast.style.borderRadius = '8px'; toast.style.boxShadow = '0 4px 8px rgba(0,0,0,0.3)'; toast.style.fontFamily = "'Press Start 2P', monospace"; toast.style.fontSize = '10px'; toast.style.maxWidth = '320px';
    container.appendChild(toast);
    setTimeout(() => { toast.remove(); }, duration);
}

function showConfirm(message, opts = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.position = 'fixed'; overlay.style.top = '0'; overlay.style.left = '0'; overlay.style.width = '100%'; overlay.style.height = '100%'; overlay.style.background = 'rgba(0,0,0,0.7)'; overlay.style.zIndex = '100000'; overlay.style.display = 'flex'; overlay.style.justifyContent = 'center'; overlay.style.alignItems = 'center';
        
        const dialog = document.createElement('div');
        dialog.style.background = '#1e293b'; dialog.style.padding = '20px'; dialog.style.borderRadius = '10px'; dialog.style.textAlign = 'center'; dialog.style.border = '2px solid #3498db'; dialog.style.maxWidth = '300px';
        
        const msg = document.createElement('p'); msg.innerText = message; msg.style.color = '#fff'; msg.style.fontFamily = 'sans-serif'; msg.style.marginBottom = '20px';
        const btnYes = document.createElement('button'); btnYes.innerText = opts.okText || 'Sim'; btnYes.style.background = opts.okBg || '#2ecc71'; btnYes.style.border = 'none'; btnYes.style.padding = '10px 20px'; btnYes.style.color = '#fff'; btnYes.style.marginRight = '10px'; btnYes.style.cursor = 'pointer';
        const btnNo = document.createElement('button'); btnNo.innerText = opts.cancelText || 'Não'; btnNo.style.background = '#e74c3c'; btnNo.style.border = 'none'; btnNo.style.padding = '10px 20px'; btnNo.style.color = '#fff'; btnNo.style.cursor = 'pointer';

        btnYes.onclick = () => { overlay.remove(); resolve(true); };
        btnNo.onclick = () => { overlay.remove(); resolve(false); };

        dialog.appendChild(msg); dialog.appendChild(btnYes); dialog.appendChild(btnNo); overlay.appendChild(dialog); document.body.appendChild(overlay);
    });
}

function resolveImg(src) { return (src.startsWith('http') || src.startsWith('data:')) ? src : '/uploads/' + src; }

// --- NPC RENDER & INTERACTION ---
if(typeof socket !== 'undefined') {
    socket.on('npcs_list', (list) => {
        document.querySelectorAll('.npc-entity').forEach(el => el.remove());
        list.forEach(npc => {
            const div = document.createElement('div');
            div.className = 'player npc-entity'; 
            div.style.left = npc.x + '%';
            div.style.top = npc.y + '%';
            div.style.zIndex = Math.floor(npc.y);

            // CORREÇÃO SPRITE CROP
            if (npc.isCustomSkin) {
                div.style.backgroundImage = `url('${npc.skin}')`;
            } else {
                div.style.backgroundImage = `url('/uploads/${npc.skin}.png')`;
            }
            
            div.setAttribute('data-dir', npc.direction || 'down');

            const label = document.createElement('div');
            label.className = 'player-name';
            label.style.color = '#f1c40f'; 
            label.innerText = npc.name;
            div.appendChild(label);
            
            div.onclick = (e) => { e.stopPropagation(); interactWithNPC(npc); };
            document.getElementById('gameArea').appendChild(div);
        });
    });
}

function interactWithNPC(npc) {
    showConfirm(`${npc.name} diz:\n"${npc.dialogue || '...'}"\n\nAceitar batalha?`, { okText: 'BATALHAR', cancelText: 'Sair', okBg: '#e67e22' }).then(yes => {
        if(yes) {
            // Assume que showLoading e user_id estão disponíveis no escopo global do EJS
            if(typeof showLoading === 'function') showLoading('Iniciando Batalha...');
            // Pegamos o ID do user da URL ou de uma variável global se existir, 
            // mas como é common.js, precisamos injetar ou pegar do contexto.
            // Solução: Pegar do socket.emit 'enter_map' context se possível, ou URL param.
            const urlParams = new URLSearchParams(window.location.search);
            const userId = urlParams.get('userId');
            
            fetch('/battle/npc', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ userId: userId, npcId: npc._id }) })
            .then(r => r.json()).then(data => { if(data.error) { if(typeof hideLoading === 'function') hideLoading(); alert(data.error); } else { window.location.href = '/battle/' + data.battleId; } });
        }
    });
}
