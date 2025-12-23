// --- UI HELPERS GERAIS ---

// Alterna abas (usado no Lab e Modais)
function switchTab(id, btn) {
    document.querySelectorAll('.content-area, .tab-content').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    const target = btn || document.activeElement || (window.event && window.event.target) || null;
    if (target && target.classList) target.classList.add('active');
}

// Controle de Modais
function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }

// Sistema de Notificação (Toast)
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
    toast.style.opacity = '1'; 
    toast.style.transform = 'translateY(0)';
    
    setTimeout(() => {
        toast.style.opacity = '0'; 
        toast.style.transform = 'translateY(-6px)';
        setTimeout(() => toast.remove(), 180);
    }, duration);
    return toast;
}

// Modal de Confirmação (Promise)
function showConfirm(message, opts = {}) {
    return new Promise((resolve) => {
        const overlay = document.createElement('div');
        overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);z-index:100000;display:flex;justify-content:center;align-items:center;';
        
        const dialog = document.createElement('div');
        dialog.style.cssText = 'background:#1e293b;padding:20px;border-radius:10px;text-align:center;border:2px solid #3498db;max-width:300px;color:#fff;font-family:sans-serif;box-shadow:0 10px 30px rgba(0,0,0,0.5);';
        
        const msg = document.createElement('p');
        msg.innerText = message;
        msg.style.marginBottom = '20px';
        msg.style.lineHeight = '1.5';

        const btnYes = document.createElement('button');
        btnYes.innerText = opts.okText || 'Sim';
        btnYes.style.cssText = 'background:#2ecc71;border:none;padding:10px 20px;color:#fff;margin-right:10px;cursor:pointer;border-radius:5px;font-weight:bold;';
        
        const btnNo = document.createElement('button');
        btnNo.innerText = opts.cancelText || 'Não';
        btnNo.style.cssText = 'background:#e74c3c;border:none;padding:10px 20px;color:#fff;cursor:pointer;border-radius:5px;font-weight:bold;';

        btnYes.onclick = () => { overlay.remove(); resolve(true); };
        btnNo.onclick = () => { overlay.remove(); resolve(false); };

        dialog.appendChild(msg);
        dialog.appendChild(btnYes);
        dialog.appendChild(btnNo);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);
    });
}

// Resolve URL de imagem (se é upload local ou link externo)
function resolveImg(src) { 
    if(!src) return '';
    return (src.startsWith('http') || src.startsWith('data:')) ? src : '/uploads/' + src; 
}
