// --- SISTEMA DE UI (TOASTS E MODAIS) ---

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
    
    // force reflow
    void toast.offsetWidth;
    toast.style.opacity = '1'; toast.style.transform = 'translateY(0)';
    
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateY(-6px)';
        setTimeout(() => toast.remove(), 180);
    }, duration);
    return toast;
}

function showConfirm(message, opts = {}) {
    return new Promise((resolve) => {
        let wrapper = document.getElementById('global-confirm-wrapper');
        if(!wrapper) {
            wrapper = document.createElement('div');
            wrapper.id = 'global-confirm-wrapper';
            wrapper.style.position = 'fixed';
            wrapper.style.left = '0';
            wrapper.style.top = '0';
            wrapper.style.width = '100%';
            wrapper.style.height = '100%';
            wrapper.style.display = 'flex';
            wrapper.style.alignItems = 'center';
            wrapper.style.justifyContent = 'center';
            wrapper.style.zIndex = 100000;
            document.body.appendChild(wrapper);
        }
        
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.width = '100%'; overlay.style.height = '100%'; overlay.style.background = 'rgba(0,0,0,0.6)';
        
        const dialog = document.createElement('div');
        dialog.style.minWidth = '300px'; dialog.style.maxWidth = '90%'; dialog.style.background = '#0f1720'; dialog.style.color = '#fff'; dialog.style.padding = '20px'; dialog.style.borderRadius = '12px'; dialog.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)'; dialog.style.fontFamily = "'Press Start 2P', monospace"; dialog.style.border = "1px solid #3498db"; dialog.style.position = "relative"; dialog.style.zIndex = "100001";

        const msg = document.createElement('div'); msg.innerText = message; msg.style.marginBottom = '20px'; msg.style.fontSize = '12px'; msg.style.lineHeight = '1.5'; msg.style.color = '#fff'; msg.style.textAlign = 'center';
        
        const btnRow = document.createElement('div'); btnRow.style.display = 'flex'; btnRow.style.gap = '10px'; btnRow.style.justifyContent = 'center';
        
        const btnCancel = document.createElement('button'); btnCancel.innerText = opts.cancelText || 'Não'; btnCancel.style.background = '#c0392b'; btnCancel.style.color = '#fff'; btnCancel.style.border = 'none'; btnCancel.style.padding = '10px 20px'; btnCancel.style.borderRadius = '6px'; btnCancel.style.cursor = 'pointer'; btnCancel.style.fontFamily = 'inherit';
        
        const btnOk = document.createElement('button'); btnOk.innerText = opts.okText || 'Sim'; btnOk.style.background = opts.okBg || '#27ae60'; btnOk.style.color = '#fff'; btnOk.style.border = 'none'; btnOk.style.padding = '10px 20px'; btnOk.style.borderRadius = '6px'; btnOk.style.cursor = 'pointer'; btnOk.style.fontFamily = 'inherit';
        
        btnRow.appendChild(btnCancel); btnRow.appendChild(btnOk);
        dialog.appendChild(msg); dialog.appendChild(btnRow);
        wrapper.appendChild(overlay); wrapper.appendChild(dialog);

        function cleanup() { try { wrapper.innerHTML = ''; wrapper.remove(); } catch(e) {} }

        btnCancel.addEventListener('click', () => { cleanup(); resolve(false); });
        btnOk.addEventListener('click', () => { cleanup(); resolve(true); });
    });
}

// --- FUNÇÕES DE AUXÍLIO GERAIS ---
function resolveImg(src) { 
    return (src.startsWith('http') || src.startsWith('data:')) ? src : '/uploads/' + src; 
}
