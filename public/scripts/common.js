// Funções compartilhadas entre views
function switchTab(id, btn) {
    // Suporta tabs com classes diferentes usadas nas views
    document.querySelectorAll('.content-area, .tab-content').forEach(d => d.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const el = document.getElementById(id);
    if (el) el.classList.add('active');
    // Tenta inferir o elemento clicado: primeiro param, depois activeElement, depois window.event
    const target = btn || document.activeElement || (window.event && window.event.target) || null;
    if (target && target.classList) target.classList.add('active');
}

// Pequena helper para abrir/fechar modais quando necessário (fallback)
function closeModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'none'; }
function openModal(id) { const el = document.getElementById(id); if (el) el.style.display = 'flex'; }
// Simple toast notification helper (non-blocking)
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
    toast.style.fontSize = '12px';
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

// Custom confirm modal that returns a Promise<boolean>
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
        // overlay
        const overlay = document.createElement('div');
        overlay.style.position = 'absolute'; overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.width = '100%'; overlay.style.height = '100%'; overlay.style.background = 'rgba(0,0,0,0.6)';
        // dialog
        const dialog = document.createElement('div');
        dialog.style.minWidth = '320px'; dialog.style.maxWidth = '90%'; dialog.style.background = '#0f1720'; dialog.style.color = '#fff'; dialog.style.padding = '18px'; dialog.style.borderRadius = '10px'; dialog.style.boxShadow = '0 8px 24px rgba(0,0,0,0.6)'; dialog.style.fontFamily = "'Press Start 2P', monospace";
        // message
        const msg = document.createElement('div'); msg.innerText = message; msg.style.marginBottom = '12px'; msg.style.fontSize = '13px'; msg.style.color = '#fff';
        // buttons
        const btnRow = document.createElement('div'); btnRow.style.display = 'flex'; btnRow.style.gap = '8px'; btnRow.style.justifyContent = 'flex-end';
        const btnCancel = document.createElement('button'); btnCancel.innerText = opts.cancelText || 'Cancelar'; btnCancel.style.background = '#555'; btnCancel.style.color = '#fff'; btnCancel.style.border = 'none'; btnCancel.style.padding = '8px 12px'; btnCancel.style.borderRadius = '6px'; btnCancel.style.cursor = 'pointer';
        const btnOk = document.createElement('button'); btnOk.innerText = opts.okText || 'OK'; btnOk.style.background = opts.okBg || '#27ae60'; btnOk.style.color = '#fff'; btnOk.style.border = 'none'; btnOk.style.padding = '8px 12px'; btnOk.style.borderRadius = '6px'; btnOk.style.cursor = 'pointer';
        btnRow.appendChild(btnCancel); btnRow.appendChild(btnOk);
        dialog.appendChild(msg); dialog.appendChild(btnRow);
        wrapper.appendChild(overlay); wrapper.appendChild(dialog);

        function cleanup() { try { wrapper.innerHTML = ''; wrapper.remove(); } catch(e) {} }

        btnCancel.addEventListener('click', () => { cleanup(); resolve(false); });
        btnOk.addEventListener('click', () => { cleanup(); resolve(true); });
    });
}
