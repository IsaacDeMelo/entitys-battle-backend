# 🔍 Problemas Encontrados no Lab (create.ejs)

## 📋 Análise Comparativa

### Problema 1: Interface Visual Confusa

#### create.ejs (PROBLEMA)
```html
<h4>💬 DIÁLOGOS CONDICIONAIS (POR FLAG)</h4>
<label style="display:flex; align-items:center; gap:10px; cursor:pointer;">
    <input type="checkbox" id="npcCondToggle">
    <span>Habilitar diálogos condicionais</span>
</label>

<div id="conditionalFields" style="display:none;">
    <!-- Renderização via JavaScript -->
    <div id="npcCondRows" class="row-list"></div>
</div>
```

**Problemas:**
1. ❌ Interface é via HTML puro (menos intuitivo que visual editor)
2. ❌ Sem placeholders textura (não deixa claro o que preencher)
3. ❌ Sem dicas de cor ou destaque
4. ❌ Sem botão para limpar diálogos fixos (como em city.ejs)
5. ❌ Sem aviso sobre "deixar vazio se usar APENAS flags"

---

### Problema 2: Falta de Contexto para o Usuário

#### Comparação:

**city.ejs (CORRETO):**
```html
<div class="npcBlockDesc">
    Falando normal, após vitória e durante cooldown. 
    (Deixe vazio se usar APENAS flags)
</div>
<!-- ... -->
<div class="npcHint" style="color: #f39c12; border-left: 4px solid #f39c12;">
    💡 <strong>Dica:</strong> Se você usa APENAS diálogos por flags, 
    deixe os campos de diálogo acima vazios para evitar duplicatas!
</div>
```

**create.ejs (FALTANDO):**
```html
<h4>💬 DIÁLOGOS</h4>
<div class="form-grid">
    <div class="full-width">
        <label>Fala Inicial (Antes da Luta)</label>
        <input type="text" name="dialogue" id="npcDialogue" 
               placeholder="Ei você! Vamos batalhar!" required>
    </div>
</div>
<!-- Nenhuma menção a deixar vazio para usar flags -->
```

❌ Sem indicação de que pode deixar vazio!

---

### Problema 3: Falta de Botão "Limpar Diálogos Fixos"

**city.ejs (EXISTE):**
```html
<button class="npcBtn npcBtnSmall" style="background: #9b59b6;" 
        onclick="npcEdConditionalClearNonConditional()">
    🧹 limpar diálogos fixos
</button>
```

**create.ejs (NÃO EXISTE):**
```html
<button type="button" class="mini-btn" onclick="npcCondAddRow()">
    + adicionar condição
</button>
<button type="button" class="mini-btn" onclick="npcCondClear()">
    limpar
</button>
<!-- Botão de limpar diálogos NÃO EXISTE -->
```

---

### Problema 4: Renderização em HTML Input vs Textarea

#### create.ejs (INPUTS):
```javascript
const dialogue = document.createElement('input');
dialogue.placeholder = 'fala padrão';
dialogue.value = row.dialogue || '';
```

**Problema:** 
- ❌ `<input>` não permite quebras de linha
- ❌ Textos longos ficam truncados visualmente
- ❌ Difícil editar textos complexos

#### city.ejs (TEXTAREAS):
```javascript
const dia = document.createElement('textarea');
dia.placeholder = 'Diálogo principal (override)';
dia.value = row.dialogue || '';
```

**Benefício:**
- ✅ `<textarea>` permite múltiplas linhas
- ✅ Melhor para diálogos longos
- ✅ Mais espaço visual

---

## 🎯 Problemas Encontrados (Resumido)

| Problema | create.ejs | city.ejs | Impacto |
|----------|-----------|---------|--------|
| **Inputs vs Textareas** | ❌ Input | ✅ Textarea | Diálogos truncados |
| **Contexto visual** | ❌ Faltando | ✅ Dicas claras | Confusão do usuário |
| **Botão limpar fixos** | ❌ Não existe | ✅ Existe | Duplicação de falas |
| **Dica colorida** | ❌ Não existe | ✅ Existe | Usuário não sabe usar |
| **Placeholder claro** | ❌ Genérico | ✅ "deixe vazio..." | Confusão |
| **Help text** | ❌ Mínimo | ✅ Completo | Falta educação |

---

## 💡 Recomendações de Fix

1. **Trocar `<input>` por `<textarea>` nas condições** (para textos longos)
2. **Adicionar dica colorida** igual a city.ejs
3. **Adicionar botão "🧹 limpar diálogos fixos"**
4. **Implementar função `npcCondClearNonConditional()`**
5. **Melhorar labels** com "(deixe vazio para usar APENAS flags)"
6. **Adicionar placeholder** no campo de diálogo padrão: "(deixe vazio para usar APENAS as falas por flag)"

---

## 📍 Locais Específicos a Corrigir em create.ejs

### 1. Descrição da seção de diálogos (Linha ~314)
```html
<!-- ANTES -->
<label>Fala Inicial (Antes da Luta)</label>

<!-- DEPOIS -->
<label>Fala Inicial (Deixe vazio se usar APENAS flags)</label>
```

### 2. Seção de condicionais - adicionar dica (Linha ~328)
```html
<!-- ADICIONAR -->
<div style="color:#f39c12; border-left: 4px solid #f39c12; padding:8px; margin:8px 0; font-size:0.9rem;">
    💡 <strong>Dica:</strong> Se você usa APENAS diálogos por flags, deixe os campos de diálogo acima vazios para evitar duplicatas!
</div>
```

### 3. Botões de ação - adicionar limpeza (Linha ~332)
```html
<!-- ADICIONAR -->
<button type="button" class="mini-btn" style="background: #9b59b6;" 
        onclick="npcCondClearNonConditional()">
    🧹 limpar diálogos fixos
</button>
```

### 4. Inputs de condição - trocar por textareas (Linha ~1010)
```javascript
// ANTES
const dialogue = document.createElement('input');
dialogue.placeholder = 'fala padrão';

// DEPOIS
const dialogue = document.createElement('textarea');
dialogue.placeholder = 'fala principal (deixe vazio para usar APENAS as falas por flag)';
dialogue.style.minHeight = '50px';
```

### 5. Função de limpeza (Adicionar nova função)
```javascript
function npcCondClearNonConditional() {
    document.getElementById('npcDialogue').value = '';
    document.getElementById('npcWinDialogue').value = '';
    document.getElementById('npcCdDialogue').value = '';
    if (typeof showToast === 'function') {
        showToast('Diálogos padrão limpos! Use APENAS os diálogos por flag.', { bg: '#3498db' });
    }
}
```

---

## ✅ Status: PRONTO PARA CORRIGIR

Todos os problemas foram identificados e as soluções estão documentadas acima.

