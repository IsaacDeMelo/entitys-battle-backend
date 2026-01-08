# 📝 RESUMO: Correção de Diálogos por Flags (Condicionais)

## 🎯 O Problema

Diálogos variáveis baseados em `storyFlags` (através de `conditionalDialogues`) **não funcionavam**. Um NPC com diálogos condicionais sempre mostrava a fala padrão, ignorando as flags ativas.

---

## 🔧 O que foi Corrigido

### 1. **index.js** - Ordem de Prioridade (4 mudanças)

A função `resolveNpcDialogue()` estava sendo chamada, mas tinha BAIXA prioridade. Foi corrigido para ter ALTA prioridade:

#### Linha 1318 (Starter)
```javascript
// ANTES
const text = interact.successDialogue || resolveNpcDialogue(npc, user, 'dialogue') || '...';

// DEPOIS
const text = resolveNpcDialogue(npc, user, 'dialogue') || interact.successDialogue || '...';
```

#### Linha 1404 (Heal)
```javascript
// ANTES
const text = interact.healDialogue || interact.successDialogue || `...`;

// DEPOIS
const text = resolveNpcDialogue(npc, user, 'dialogue') || interact.healDialogue || interact.successDialogue || `...`;
```

#### Linha 1425 (Shop)
```javascript
// ANTES
const text = interact.successDialogue || resolveNpcDialogue(npc, user, 'dialogue') || '...';

// DEPOIS
const text = resolveNpcDialogue(npc, user, 'dialogue') || interact.successDialogue || '...';
```

#### Linha 1437 (Quest - PRINCIPAL)
```javascript
// ANTES
const successText = interact.successDialogue || giveMsg || resolveNpcDialogue(npc, user, 'dialogue') || 'Feito.';

// DEPOIS
const successText = resolveNpcDialogue(npc, user, 'dialogue') || interact.successDialogue || giveMsg || 'Feito.';
```

---

### 2. **city.ejs (Lab)** - UX Improvements (5 mudanças)

#### 2a. Descrição dos Diálogos (Linha 1154)
```html
<!-- ANTES -->
<div class="npcBlockDesc">Falando normal, após vitória e durante cooldown.</div>

<!-- DEPOIS -->
<div class="npcBlockDesc">Falando normal, após vitória e durante cooldown. (Deixe vazio se usar APENAS flags)</div>
```

#### 2b. Placeholder da Fala de Sucesso (Linha 1332)
```html
<!-- ANTES -->
<label>Fala de sucesso</label>
<textarea id="npcEdInteractSuccess" placeholder="Perfeito! Aqui está..."></textarea>

<!-- DEPOIS -->
<label>Fala de sucesso (opcional, sobrescrita por flags)</label>
<textarea id="npcEdInteractSuccess" placeholder="Perfeito! Aqui está... (deixe vazio para usar APENAS as falas por flag)"></textarea>
```

#### 2c. Dica Visual na Seção de Condicionais (Linha 1176)
```html
<!-- ADICIONADO -->
<div class="npcHint" style="color: #f39c12; border-left: 4px solid #f39c12;">
    💡 <strong>Dica:</strong> Se você usa APENAS diálogos por flags, deixe os campos de diálogo acima vazios para evitar duplicatas!
</div>
```

#### 2d. Botão "Limpar Diálogos Fixos" (Linha 1184)
```html
<!-- ADICIONADO -->
<button type="button" class="npcBtn npcBtnSmall" style="background: #9b59b6;" onclick="npcEdConditionalClearNonConditional()">🧹 limpar diálogos fixos</button>
```

#### 2e. Função JavaScript para Limpeza (Linha 2044)
```javascript
function npcEdConditionalClearNonConditional() {
    // Limpa os diálogos padrão quando você quer usar APENAS flags
    document.getElementById('npcEdDialogue').value = '';
    document.getElementById('npcEdWinDialogue').value = '';
    document.getElementById('npcEdCooldownDialogue').value = '';
    document.getElementById('npcEdInteractSuccess').value = '';
    if (typeof showToast === 'function') {
        showToast('Diálogos padrão limpos! Use APENAS os diálogos por flag.', { bg: '#3498db' });
    }
}
```

---

### 3. **index.js** - Debug Console.logs (Para Ajudar a Identificar Problemas)

```javascript
function resolveNpcDialogue(npc, user, key) {
    try {
        // ... código ...
        const hit = sorted.find(d => d && d[key]);
        if (hit && hit[key]) {
            console.log(`[resolveNpcDialogue] ${key}: Flag "${hit.flagId}" ativa! Retornando: "${hit[key].substring(0, 50)}..."`);
            return hit[key];
        }
    } catch (e) {
        console.error(`[resolveNpcDialogue] Erro:`, e);
    }
    console.log(`[resolveNpcDialogue] ${key}: Nenhuma flag ativa. Usando padrão: ...`);
    return (npc && npc[key]) ? npc[key] : '';
}
```

---

## 📊 Resumo de Mudanças

| Arquivo | Linha | Tipo | Mudança |
|---------|-------|------|---------|
| index.js | 1318 | Fix | Inverter prioridade (Starter) |
| index.js | 1404 | Fix | Adicionar resolveNpcDialogue (Heal) |
| index.js | 1425 | Fix | Inverter prioridade (Shop) |
| index.js | 1437 | Fix | Inverter prioridade (Quest) |
| index.js | 272-295 | Debug | Adicionar console.logs |
| city.ejs | 1154 | UX | Melhorar descrição |
| city.ejs | 1332 | UX | Melhorar placeholder |
| city.ejs | 1176 | UX | Adicionar dica |
| city.ejs | 1184 | UX | Adicionar botão limpeza |
| city.ejs | 2044 | Code | Adicionar função limpeza |

---

## 🧪 Como Testar

Ver arquivo: [TEST_CONDITIONAL_DIALOGS.md](TEST_CONDITIONAL_DIALOGS.md)

**Resumo rápido:**
1. Crie um NPC com apenas `conditionalDialogues` (deixe diálogos padrão vazios)
2. Ative uma flag no browser console: `window.STORY_FLAGS = { flag_name: true };`
3. Interaja com o NPC
4. ✅ Deve mostrar o diálogo da flag

---

## 🔍 Debug Se Não Funcionar

1. Abra `server.log` e procure por `[resolveNpcDialogue]`
2. Verifique se a flag está realmente no banco: `db.users.findOne({ _id: ... }).storyFlags`
3. Confirme que o NPC tem `conditionalDialogues` preenchidas no banco

---

## 📚 Documentação Criada

1. **DIALOG_FLAGS_BUG_ANALYSIS.md** - Análise técnica do problema
2. **DIALOG_FLAGS_PROBLEM.md** - Problema descrito com exemplos
3. **DIALOG_FIX_VISUAL.md** - Comparação visual antes/depois
4. **DIALOG_CONDITIONAL_DEBUG.md** - Debug avançado
5. **TEST_CONDITIONAL_DIALOGS.md** - Como testar
6. **DEBUG_CONDITIONAL_DIALOGS.md** - Investigação detalhada
7. Este arquivo - Resumo geral

---

## ✅ Checklist de Verificação

- [x] Problema identificado (prioridade errada)
- [x] 4 pontos do index.js corrigidos
- [x] Lab melhorado com dicas
- [x] Botão de limpeza adicionado
- [x] Debug console.logs adicionados
- [x] Documentação completa
- [ ] Teste funcional realizado
- [ ] Deploy em produção

---

## 🚀 Próximos Passos

1. **Teste o setup:** Use [TEST_CONDITIONAL_DIALOGS.md](TEST_CONDITIONAL_DIALOGS.md)
2. **Se funcionar:** Ótimo! Diálogos por flags agora funcionam.
3. **Se não funcionar:** Verifique os logs e use [DEBUG_CONDITIONAL_DIALOGS.md](DEBUG_CONDITIONAL_DIALOGS.md)
4. **Deploy:** Faça push e teste em produção

---

## 💡 Importante

> **Diálogos Condicionais (por Flags) têm PRIORIDADE MÁXIMA!**
>
> Se uma flag está ativa, seu diálogo será mostrado em vez dos diálogos padrão.
> Isso é intencional e permite criar narrativas dinâmicas baseadas na progressão do jogador.

