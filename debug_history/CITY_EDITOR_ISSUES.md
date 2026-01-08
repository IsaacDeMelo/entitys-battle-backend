# 🔴 Problemas encontrados em city.ejs - Diálogos Condicionais

## Problema 1: Inputs Quebrados (Layout)

### Causa
Os elementos `<input>` e `<textarea>` criados dinamicamente tem classe `.npcInlineHelp`, mas os estilos CSS estão definidos para `.npcField input` e `.npcField textarea`.

```css
/* Existe */
.npcField input, .npcField select, .npcField textarea { 
  background: #0b1220; 
  color: #fff; 
  border: 1px solid #334155; 
  ...
}

/* Aplicado em */
<div class="npcInlineHelp">  ← Aqui não funciona!
  <input>
  <textarea>
</div>
```

### Solução
Adicionar estilos CSS para elementos dentro de `.npcInlineHelp` ou usar classes específicas com estilos.

---

## Problema 2: Não Sincroniza ao Adicionar (Comportamento)

### Causa
Na função `npcEdConditionalAdd()` (linha 2037), quando adiciona uma nova condição:
```javascript
function npcEdConditionalAdd() {
    npcEdConditionalState.push({ ... });
    npcEdConditionalRender();  // ← Renderiza
    // ❌ MAS NÃO CHAMA npcEdConditionalToJson()
}
```

Isso significa:
1. Adiciona à memória (`npcEdConditionalState`)
2. Renderiza visualmente
3. **MAS NÃO atualiza o JSON field**

A função `npcEdConditionalToJson()` está vazia/não existe quando deveria sincronizar!

### Por que Funciona ao Clicar Novamente

Quando você clica no NPC novamente:
1. `npcEdConditionalLoad()` é chamado
2. Carrega o NPC do servidor/BD
3. Se o NPC foi salvo com as condições, ele as mostra
4. A renderização manual funciona

**Mas** se você não salvou antes de sair e clicar novamente, o estado anterior (`npcEdConditionalState`) é limpo.

---

## 📍 Problemas Específicos

### 1. Falta de CSS para Inputs em `.npcInlineHelp`

**Localização:** city.ejs linha ~151 (CSS)

**Hoje:**
```css
.npcInlineHelp { background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 10px; padding: 10px; }
```

**Precisa:**
```css
.npcInlineHelp { background: rgba(255,255,255,0.03); border: 1px solid #334155; border-radius: 10px; padding: 10px; }
.npcInlineHelp input, 
.npcInlineHelp textarea { 
  background: #0b1220; 
  color: #fff; 
  border: 1px solid #334155; 
  border-radius: 6px; 
  padding: 9px 10px; 
  font-family: 'Roboto', sans-serif; 
  width: 100%;
}
.npcInlineHelp textarea { min-height: 60px; resize: vertical; }
```

---

### 2. Falta Sincronização em `npcEdConditionalAdd()`

**Localização:** city.ejs linha 2037

**Hoje:**
```javascript
function npcEdConditionalAdd() {
    npcEdConditionalState.push({ flagId: '', dialogue: '', winDialogue: '', cooldownDialogue: '', priority: 0 });
    npcEdConditionalRender();
}
```

**Precisa:**
```javascript
function npcEdConditionalAdd() {
    npcEdConditionalState.push({ flagId: '', dialogue: '', winDialogue: '', cooldownDialogue: '', priority: 0 });
    npcEdConditionalRender();
    npcEdConditionalToJson();  // ← ADICIONAR ISSO
}
```

---

### 3. Pode Faltar em `npcEdConditionalClear()`

**Localização:** city.ejs linha 2045

**Hoje:**
```javascript
function npcEdConditionalClear() {
    npcEdConditionalState = [];
    npcEdConditionalRender();
}
```

**Precisa:**
```javascript
function npcEdConditionalClear() {
    npcEdConditionalState = [];
    npcEdConditionalRender();
    npcEdConditionalToJson();  // ← ADICIONAR ISSO
}
```

---

## ✅ Checklist de Correção

- [ ] Adicionar CSS para `.npcInlineHelp input` e `.npcInlineHelp textarea`
- [ ] Adicionar `npcEdConditionalToJson()` em `npcEdConditionalAdd()`
- [ ] Adicionar `npcEdConditionalToJson()` em `npcEdConditionalClear()`
- [ ] Adicionar `npcEdConditionalToJson()` em `npcEdConditionalClearNonConditional()`
- [ ] Testar: Adicionar condição → ver renderizada corretamente
- [ ] Testar: Adicionar + salvar NPC → clicar em outro NPC → clicar de volta → ver condições

