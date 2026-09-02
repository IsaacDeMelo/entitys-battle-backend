# 🚀 PLANO DE MELHORIAS - Sistema de Menu

## 📋 Índice de Melhorias

1. [CRÍTICA - Fix de Funções Duplicadas](#crítica---fix-de-funções-duplicadas)
2. [CRÍTICA - Função openPC() Faltante](#crítica---função-openpc-faltante)
3. [IMPORTANTE - Remover CSS Inline](#importante---remover-css-inline)
4. [IMPORTANTE - Namespace de Variáveis Globais](#importante---namespace-de-variáveis-globais)
5. [IMPORTANTE - Padronização de Nomenclatura](#importante---padronização-de-nomenclatura)
6. [MELHORIA - Quebrar Funções Longas](#melhoria---quebrar-funções-longas)
7. [MELHORIA - Template Literals](#melhoria---template-literals)
8. [MELHORIA - Tratamento de Erros](#melhoria---tratamento-de-erros)
9. [OTIMIZAÇÃO - Lazy Loading](#otimização---lazy-loading)
10. [OTIMIZAÇÃO - Consolidar Catálogos](#otimização---consolidar-catálogos)

---

## 🔴 CRÍTICA - Fix de Funções Duplicadas

### Localização
- **Arquivo**: `views/partials/menu.ejs`
- **Linhas**: ~790-830 (segunda definição de `closeAllModals` e `closeModal`)

### Problema
```javascript
// LINHA ~750: PRIMEIRA DEFINIÇÃO
window.closeAllModals = closeAllModals;
window.closeModal = closeModal;

// LINHA ~790: SEGUNDA DEFINIÇÃO (redundante!)
window.closeAllModals = function() { ... };
window.closeModal = function(id) { ... };
```

### Solução
✅ **Remover completamente as linhas 790-830** (segunda definição)

### Por Quê?
- A primeira definição já expõe as funções para `window`
- A segunda redefinição sobrescreve com menos funcionalidade
- Causa confusão e potencial comportamento imprevisto

### Impacto
- ✅ Reduz linhas do arquivo
- ✅ Remove confusão
- ✅ Performance melhor

---

## 🔴 CRÍTICA - Função `openPC()` Faltante

### Localização
- **Arquivo**: `views/partials/menu.ejs`
- **Linha do botão**: ~680 (aproximado)

### Problema
```html
<!-- BOTÃO CHAMA openPC() -->
<button class="float-btn" onclick="openPC()">
    <span>PC</span>
</button>

<!-- MAS A FUNÇÃO NÃO EXISTE! -->
<!-- Existe: openEntityTeam(), openPokedex(), openBag() -->
<!-- NÃO EXISTE: openPC() -->
```

### Solução
Adicionar a função logo após `openPokemon()`:

```javascript
function openPC() {
    const modal = document.getElementById('modalPC');
    if (!modal) return;
    
    modal.style.display = 'flex';
    window.__menuOpen = true;
    
    // Carregar dados do PC
    loadPCData();
}

async function loadPCData() {
    try {
        const cached = getCachedMe();
        if (cached && Array.isArray(cached.pc)) {
            CACHED_PC_DATA = cached.pc;
            renderPCStorage(cached.pc);
            renderPCTeamArea(cached.team);
        }
        
        // Recarregar do servidor
        const r = await fetch(`/api/me?userId=${USER_ID}`);
        const d = await r.json();
        if (d && !d.error) {
            window.__ME_CACHE = d;
            CACHED_PC_DATA = d.pc || [];
            renderPCStorage(d.pc || []);
            renderPCTeamArea(d.team || []);
        }
    } catch(e) {
        console.error('Erro carregando PC:', e);
        if (CACHED_PC_DATA) {
            renderPCStorage(CACHED_PC_DATA);
        }
    }
}
```

### Por Quê?
- Botão estava chamando função inexistente
- Usuário clicava em PC e nada acontecia
- Erro console: `openPC is not defined`

### Impacto
- ✅ PC agora abre corretamente
- ✅ Carrega dados do servidor
- ✅ Usa cache se houver erro

---

## 🟠 IMPORTANTE - Remover CSS Inline

### Localização
- **Arquivo**: `views/partials/menu.ejs`
- **Linhas**: 1-650 (todo o `<style>` block)

### Problema
```javascript
<style>
    :root { --bg-core: #0b1222; }
    * { box-sizing: border-box; }
    // ... 1500+ linhas de CSS
    .dex-move-elem { color: #64748b; }
</style>
```

### Solução
**PASSO 1**: Criar arquivo `public/css/menu-system.css`
```css
/* Mover TODO o conteúdo da tag <style> aqui */
:root {
    --bg-core: #0b1222;
    --bg-glass: rgba(26, 43, 74, 0.95);
    /* ... resto das cores ... */
}
```

**PASSO 2**: No `menu.ejs`, substituir `<style>...</style>` por:
```html
<link rel="stylesheet" href="/public/css/menu-system.css">
```

### Por Quê?
- Reduz tamanho do HTML em ~50KB
- Permite cache do CSS pelo browser
- Mais fácil manter e atualizar
- Reutilizável em outras views

### Impacto
- ✅ Carregamento mais rápido
- ✅ Arquivo EJS reduzido de 3000 para ~1500 linhas
- ✅ Cache eficiente
- ✅ Melhor performance

---

## 🟠 IMPORTANTE - Namespace de Variáveis Globais

### Localização
- **Arquivo**: `views/partials/menu.ejs`
- **Linhas**: ~650-700

### Problema Atual
```javascript
let GLOBAL_MOVES_LIB = {};
let CURRENT_TEAM_DATA = [];
let CACHED_PC_DATA = null;
let TEAM_SELECTED_IDX = 0;
let currentMonId = null;
let isSelectingMode = false;
let CURRENT_FOLLOWING_ID = '';
let ITEM_CATALOG = [];
let ITEM_CATALOG_MAP = new Map();
```

### Solução
Substituir tudo por um namespace único:

```javascript
// ============================================
// MENU SYSTEM - ESTADO CENTRALIZADO
// ============================================
window.MenuSystem = {
    // Estado do menu
    isOpen: false,
    selectedTeamIdx: 0,
    isSelectingMode: false,
    
    // Dados em cache
    teamData: [],
    pcData: null,
    followingEntityId: '',
    movesLib: {},
    
    // Catálogos
    itemCatalog: [],
    itemCatalogMap: new Map(),
    
    // Modais abertos
    openModals: new Set(),
    
    // Métodos auxiliares
    setTeamData(data) {
        this.teamData = Array.isArray(data) ? data : [];
    },
    
    setPCData(data) {
        this.pcData = Array.isArray(data) ? data : null;
    },
    
    selectTeamMember(idx) {
        if (idx >= 0 && idx < this.teamData.length) {
            this.selectedTeamIdx = idx;
        }
    },
    
    toggleSelectMode(enabled) {
        this.isSelectingMode = Boolean(enabled);
    },
    
    reset() {
        this.isOpen = false;
        this.selectedTeamIdx = 0;
        this.isSelectingMode = false;
        this.openModals.clear();
    }
};

// Aliases para compatibilidade com código existente
get CURRENT_TEAM_DATA() { return window.MenuSystem.teamData; }
set CURRENT_TEAM_DATA(v) { window.MenuSystem.setTeamData(v); }
```

### Por Quê?
- ✅ Evita conflitos de nome
- ✅ Facilita debugging
- ✅ Código mais organizado
- ✅ Menos poluição do `window`

### Impacto
- Reduz variáveis globais de 15+ para 1
- Facilita refatoração futura

---

## 🟠 IMPORTANTE - Padronização de Nomenclatura

### Problema
```javascript
// Função em um lugar
function openPokemon() { return openEntityTeam(); }

// ID de modal em outro
<div id="modalPokemon">

// Mas dados internos usam "entity"
const RAW_ENTITIES = ...
```

### Solução

#### **Opção A: Padronizar para "Team"** (Recomendado)
```javascript
// Função
function openTeam() { ... }

// ID modal
<div id="modalTeam">

// Botão
<button onclick="openTeam()">EQUIPE</button>

// Variável
const CURRENT_TEAM_DATA = ...
```

#### **Opção B: Padronizar para "Entity"**
```javascript
// Função
function openEntities() { ... }

// ID modal
<div id="modalEntities">

// Botão
<button onclick="openEntities()">ENTIDADES</button>
```

### Recomendação
Use **Opção A (Team)** porque:
- Mais intuitivo para jogadores
- Menos confusão com nomenclatura interna
- Compatível com UI atual

### Impacto
- Melhor legibilidade
- Menos confusão
- Código mais manutenível

---

## 🟡 MELHORIA - Quebrar Funções Longas

### Localização
- **Arquivo**: `views/partials/menu.ejs`
- **Função**: `renderPokemonList()` (~100 linhas)

### Problema
```javascript
function renderPokemonList(team) {
    // 100+ linhas de lógica + HTML geração
    var listContent = document.getElementById('pokemonListContent');
    // ... muita coisa aqui
}
```

### Solução
Dividir em funções menores:

```javascript
// 1. Renderizar cabeçalho
function renderTeamHeader(isSelectingMode) {
    if (!isSelectingMode) return '';
    return `
        <div style="background:rgba(251,191,36,0.1); ...">
            TOQUE PARA USAR O ITEM
        </div>
    `;
}

// 2. Renderizar um slot de criatura
function renderTeamSlot(pokemon, idx, isActive, isSelecting) {
    const hpPct = Math.min(100, Math.max(0, (pokemon.hp/pokemon.maxHp)*100));
    const hpColor = hpPct > 50 ? '#22c55e' : hpPct > 25 ? '#eab308' : '#ef4444';
    
    return `
        <div class="team-slot ${isActive ? 'active' : ''}" 
             onclick="handleTeamSlotClick(${idx})">
            <div class="team-slot-avatar">
                <img src="${resolveImg(pokemon.sprite)}" alt="">
            </div>
            <div class="team-slot-info">
                <div class="team-slot-name">
                    ${pokemon.name}
                    <span class="lvl">Lv.${pokemon.level}</span>
                </div>
                <div class="team-slot-bar-wrap">
                    <span class="team-slot-bar-label" style="color:${hpColor};">HP</span>
                    <div class="team-slot-bar">
                        <div class="team-slot-bar-fill" 
                             style="width:${hpPct}%; background:${hpColor};"></div>
                    </div>
                </div>
            </div>
        </div>
    `;
}

// 3. Função principal refatorada
function renderPokemonList(team) {
    const listContent = document.getElementById('pokemonListContent');
    const detContent = document.getElementById('pokemonDetailContent');
    
    if (!team || team.length === 0) {
        listContent.innerHTML = '<div style="text-align:center; padding:40px 20px;">Nenhuma criatura</div>';
        detContent.innerHTML = '';
        return;
    }
    
    let html = renderTeamHeader(isSelectingMode);
    
    team.forEach((p, idx) => {
        const isActive = idx === MenuSystem.selectedTeamIdx && !MenuSystem.isSelectingMode;
        html += renderTeamSlot(p, idx, isActive, isSelectingMode);
    });
    
    if (isSelectingMode) {
        html += '<button onclick="cancelSelection()" style="...">CANCELAR</button>';
    }
    
    listContent.innerHTML = html;
    
    if (!isSelectingMode && team.length > 0) {
        selectTeamMember(MenuSystem.selectedTeamIdx);
    }
}
```

### Por Quê?
- ✅ Funções menores e testáveis
- ✅ Mais fácil entender lógica
- ✅ Reutilizável

### Impacto
- Melhor legibilidade
- Mais fácil debugar
- Mais fácil testar

---

## 🟡 MELHORIA - Template Literals

### Antes
```javascript
html += '<div class="team-slot' + isActive + '" onclick="handleTeamSlotClick(' + idx + ')">';
html += '<div class="team-slot-avatar"><img src="' + resolveImg(p.sprite) + '"></div>';
```

### Depois
```javascript
const html = `
    <div class="team-slot ${isActive}" onclick="handleTeamSlotClick(${idx})">
        <div class="team-slot-avatar">
            <img src="${resolveImg(p.sprite)}" alt="">
        </div>
    </div>
`;
```

### Benefícios
- ✅ Mais legível
- ✅ Menos erro
- ✅ Melhor performance

---

## 🟡 MELHORIA - Tratamento de Erros

### Antes
```javascript
async function openEntityTeam() { 
    // ... sem validação
    const r = await fetch(`/api/me?userId=${USER_ID}`); 
    const d = await r.json(); 
    CURRENT_TEAM_DATA = d.team;  // ⚠️ E se d.team undefined?
}
```

### Depois
```javascript
async function openEntityTeam() { 
    try {
        const modal = document.getElementById('modalTeam');
        if (!modal) {
            console.error('Modal não encontrado');
            return;
        }
        
        modal.style.display = 'flex';
        window.__menuOpen = true;
        
        // Usar cache primeiro
        const cached = getCachedMe();
        if (cached && Array.isArray(cached.team)) {
            MenuSystem.setTeamData(cached.team);
            await renderTeamUI(cached.team);
        }
        
        // Recarregar do servidor
        const response = await fetch(`/api/me?userId=${USER_ID}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        const data = await response.json();
        if (data.error) throw new Error(data.error);
        if (!Array.isArray(data.team)) {
            console.warn('Team data missing, usando cache');
            return;
        }
        
        MenuSystem.setTeamData(data.team);
        window.__ME_CACHE = data;
        await renderTeamUI(data.team);
        
    } catch (error) {
        console.error('Erro ao abrir equipe:', error);
        showToast('❌ Erro ao carregar equipe');
    }
}
```

### Por Quê?
- ✅ Valida dados antes de usar
- ✅ Mostra erros claros
- ✅ Não quebra silenciosamente

---

## 🟢 OTIMIZAÇÃO - Lazy Loading

### Problema Atual
```javascript
// CARREGA TUDO QUANDO A PÁGINA ABRE
setTimeout(() => { loadItemCatalog(false); }, 0);
function preloadBagIcons() { /* carrega TODAS as imagens */ }
```

### Solução
```javascript
// Carregar catálogo apenas quando:
// 1. Quando o usuário abre o menu pela primeira vez
// 2. Quando o usuário clica em "Bag"

async function openBag() {
    const modal = document.getElementById('modalBag');
    modal.style.display = 'flex';
    window.__menuOpen = true;
    
    // Carregar catálogo se não estiver carregado
    if (!window.MENU_CATALOG_LOADED) {
        await loadItemCatalog(false);
        // Pré-carregar imagens APENAS da bag
        await preloadBagIconsOnly();
        window.MENU_CATALOG_LOADED = true;
    }
    
    renderBag();
}

function preloadBagIconsOnly() {
    // Carregar apenas ícones que estão na mochila do usuário
    // Não TODAS as imagens disponíveis
    const playerBag = MenuSystem.teamData[0]?.bag || [];
    const urls = new Set();
    
    playerBag.forEach(item => {
        const iconUrl = getItemIconUrl(item.id);
        if (iconUrl) urls.add(iconUrl);
    });
    
    return Promise.all([...urls].map(u => preloadImage(u)));
}
```

### Por Quê?
- ✅ Reduz carga inicial
- ✅ Carrega sob demanda
- ✅ Melhor UX

---

## 🟢 OTIMIZAÇÃO - Consolidar Catálogos

### Antes
```javascript
window.ITEM_CATALOG = [];              // Array
window.ITEM_CATALOG_MAP = new Map();   // Map duplicado!

// Ambos sincronizados manualmente
window.ITEM_CATALOG_MAP = new Map(list.map(it => [String(it.id), it]));
```

### Depois
```javascript
window.ITEM_CATALOG_MAP = new Map();  // Usar APENAS a Map

function getItemCatalog() {
    // Gerar Array sob demanda, usando Map
    return Array.from(window.ITEM_CATALOG_MAP.values());
}

function getItemById(id) {
    return window.ITEM_CATALOG_MAP.get(String(id));
}

async function loadItemCatalog(force = false) {
    try {
        if (!force && window.ITEM_CATALOG_MAP.size > 0) {
            return getItemCatalog();
        }
        
        const response = await fetch('/api/items/catalog');
        if (!response.ok) throw new Error('Failed to load catalog');
        
        const data = await response.json();
        if (!data.success || !Array.isArray(data.items)) {
            throw new Error('Invalid catalog format');
        }
        
        // Limpar e repopular a Map
        window.ITEM_CATALOG_MAP.clear();
        data.items.forEach(item => {
            window.ITEM_CATALOG_MAP.set(String(item.id), item);
        });
        
        return data.items;
    } catch (error) {
        console.error('Erro carregando catálogo:', error);
        return [];
    }
}
```

### Por Quê?
- ✅ Remove duplicação
- ✅ Menos memória
- ✅ Mais rápido

---

## 📋 ORDEM DE IMPLEMENTAÇÃO RECOMENDADA

### **Dia 1 - Fixes Críticos** (30 minutos)
```
1. [CRÍTICA] Remover funções duplicadas (linhas 790-830)
2. [CRÍTICA] Adicionar função openPC()
3. Testar que PC abre corretamente
```

### **Dia 2 - Refatoração** (2-3 horas)
```
1. [IMPORTANTE] Mover CSS para arquivo separado
2. [IMPORTANTE] Criar namespace MenuSystem
3. [IMPORTANTE] Padronizar nomenclatura
4. Testar tudo funciona
```

### **Dia 3-4 - Melhorias** (2-3 horas)
```
1. [MELHORIA] Quebrar renderPokemonList()
2. [MELHORIA] Converter para template literals
3. [MELHORIA] Adicionar tratamento de erros
4. Testar tudo funciona
```

### **Dia 5 - Otimizações** (1-2 horas)
```
1. [OTIMIZAÇÃO] Lazy loading
2. [OTIMIZAÇÃO] Consolidar catálogos
3. Testar performance
4. Deploy
```

---

## 🧪 TESTES NECESSÁRIOS

Após cada mudança, testar:

```javascript
// 1. Abrir menu
[ ] Menu abre com botão ☰
[ ] Botão "EQUIPE" abre modal
[ ] Botão "PC" abre modal
[ ] Botão "POKEDEX" abre modal
[ ] Botão "BAG" abre modal

// 2. Funcionalidade
[ ] Trocar criatura selecionada na equipe
[ ] Mover criatura para PC
[ ] Ver pokedex
[ ] Usar item da mochila

// 3. Erros
[ ] Desconectar e reconectar
[ ] Fechar modal enquanto carrega
[ ] Clicar botão várias vezes

// 4. Performance
[ ] Menu abre rápido
[ ] Scroll lista é suave
[ ] Mobile responsivo
```

---

## 📊 RESUMO DAS MELHORIAS

| # | Tipo | Impacto | Dificuldade | Tempo |
|---|------|---------|-------------|-------|
| 1 | Crítica | 🔴 Alto | ⚡ Fácil | 5 min |
| 2 | Crítica | 🔴 Alto | ⚡ Fácil | 10 min |
| 3 | Importante | 🟠 Médio | ⚡ Fácil | 20 min |
| 4 | Importante | 🟠 Médio | 🟡 Médio | 30 min |
| 5 | Importante | 🟠 Médio | 🟡 Médio | 40 min |
| 6 | Melhoria | 🟡 Baixo | 🟠 Alto | 60 min |
| 7 | Melhoria | 🟡 Baixo | ⚡ Fácil | 30 min |
| 8 | Melhoria | 🟡 Baixo | 🟡 Médio | 40 min |
| 9 | Otimização | 🟢 Muito Baixo | 🟠 Alto | 45 min |
| 10 | Otimização | 🟢 Muito Baixo | 🟡 Médio | 20 min |

**Total estimado**: ~4 horas de trabalho

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

```
[ ] Fase 1 - Crítica (30 min)
    [ ] Remover duplicatas
    [ ] Adicionar openPC()
    [ ] Testar
    
[ ] Fase 2 - Importante (2 horas)
    [ ] Mover CSS
    [ ] Criar namespace MenuSystem
    [ ] Padronizar nomenclatura
    [ ] Testar
    
[ ] Fase 3 - Melhoria (2-3 horas)
    [ ] Quebrar funções
    [ ] Template literals
    [ ] Tratamento de erros
    [ ] Testar
    
[ ] Fase 4 - Otimização (1-2 horas)
    [ ] Lazy loading
    [ ] Consolidar catálogos
    [ ] Testar performance
    [ ] Deploy
    
[ ] Documentação
    [ ] Atualizar comentários
    [ ] Documentar API publica
    [ ] Criar guia de manutenção
```

