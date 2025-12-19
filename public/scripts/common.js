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
