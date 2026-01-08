# ⚡ CHEAT SHEET: Diálogos por Flags

## 🎯 Uso Rápido

### Como Criar um NPC com Diálogos Dinâmicos

#### 1️⃣ Abra o Lab (City ou Create)

#### 2️⃣ Crie o NPC

```
Nome: "Chefe da Loja"
Tipo: Trainer (ou qualquer tipo)
```

#### 3️⃣ DEIXE OS DIÁLOGOS VAZIOS
```
❌ NÃO PREENCHA:
- Fala Inicial
- Fala de Vitória
- Fala em Cooldown
- Fala de Sucesso

✅ Ou clique: "🧹 limpar diálogos fixos"
```

#### 4️⃣ Adicione Condições

```
Seção: "Diálogos Condicionais (POR FLAG)"

Clique: "+ adicionar condição"

Preencha:
- flagId: "quest_npc_completo"
- Diálogo: "Obrigado por ajudar!"
- Prioridade: 10

Clique: "+ adicionar condição" novamente

Preencha:
- flagId: "quest_npc_ativo"
- Diálogo: "Ainda preciso de ajuda..."
- Prioridade: 5
```

#### 5️⃣ Salve

Pronto! Seu NPC agora fala diferente baseado em flags.

---

## 🧪 Teste Rápido

### No Browser Console

```javascript
// Ativar flag
window.STORY_FLAGS = { quest_npc_completo: true };

// Interagir com NPC
// VÊ: "Obrigado por ajudar!"
// ✅ FUNCIONOU!
```

---

## 📋 Estrutura Esperada

### JSON de um NPC com Flags

```json
{
  "name": "Chefe da Loja",
  "dialogue": "",
  "winDialogue": "",
  "cooldownDialogue": "",
  "interact": {
    "enabled": true,
    "successDialogue": ""
  },
  "conditionalDialogues": [
    {
      "flagId": "quest_npc_completo",
      "dialogue": "Obrigado por ajudar!",
      "winDialogue": "Você venceu!",
      "cooldownDialogue": "Volte amanhã",
      "priority": 10
    },
    {
      "flagId": "quest_npc_ativo",
      "dialogue": "Ainda preciso de ajuda...",
      "priority": 5
    }
  ]
}
```

---

## 🔍 Debug Rápido

### Se Não Funcionar

#### 1. Verifique o Console do Servidor
```bash
tail -f server.log | grep "resolveNpcDialogue"

# Procure por:
[resolveNpcDialogue] dialogue: Flag "quest_npc_completo" ativa!

# Se ver isso = funciona!
```

#### 2. Verifique o MongoDB
```javascript
// No MongoDB Compass:
db.users.findOne({ _id: ObjectId("seu_id") })

// Procure por:
"storyFlags": { "quest_npc_completo": true }

// Se estiver lá = flag foi salva!
```

#### 3. Verifique o NPC
```javascript
// No MongoDB Compass:
db.npcs.findOne({ name: "Chefe da Loja" })

// Procure por:
"conditionalDialogues": [ { "flagId": "quest_npc_completo", ... } ]

// Se estiver lá = NPC foi salvo!
```

---

## 📊 Prioridades

Quanto MAIOR o número, MAIOR a prioridade.

```javascript
// Exemplo:
{
  "flagId": "flag1",
  "dialogue": "Mensagem 1",
  "priority": 10  // ← ESSA VENCE (maior)
},
{
  "flagId": "flag2",
  "dialogue": "Mensagem 2",
  "priority": 5   // ← Essa perde
}

// Se ambas as flags estão ativas, ve a com priority 10
```

---

## ✅ Checklist do Que Funciona

```
[✓] Diálogos padrão em npc.dialogue
[✓] Diálogos pós-vitória em npc.winDialogue
[✓] Diálogos em cooldown em npc.cooldownDialogue
[✓] Diálogos de sucesso em interact.successDialogue
[✓] Diálogos condicionais com flags
[✓] Prioridade entre múltiplas flags
[✓] Fallback automático se nenhuma flag ativa
```

---

## ❌ Erros Comuns

### Erro 1: Deixou Diálogos Padrão Preenchidos

```javascript
// ❌ ERRADO
{
  dialogue: "Olá!",  // ← Isso vai aparecer sempre
  conditionalDialogues: [
    { flagId: "flag", dialogue: "Mensagem!" }
  ]
}

// O QUE VÊ: "Olá!" sempre (ignora flag)

// ✅ CORRETO
{
  dialogue: "",  // ← VAZIO
  conditionalDialogues: [
    { flagId: "flag", dialogue: "Mensagem!" }
  ]
}

// O QUE VÊ: "Mensagem!" quando flag ativa
```

### Erro 2: Esqueceu o `flagId`

```javascript
// ❌ ERRADO
{
  conditionalDialogues: [
    {
      // "flagId" está vazio!
      dialogue: "Mensagem!"
    }
  ]
}

// RESULTADO: Condicional é IGNORADO

// ✅ CORRETO
{
  conditionalDialogues: [
    {
      flagId: "quest_1",  // ← OBRIGATÓRIO
      dialogue: "Mensagem!"
    }
  ]
}
```

### Erro 3: Nome da Flag Errado

```javascript
// ❌ ERRADO
// NPC tem: flagId: "quest_complete"
// User ativa: storyFlags['quest_completed']
// ↑ DIFERENTE! Não funciona

// ✅ CORRETO
// NPC tem: flagId: "quest_complete"
// User ativa: storyFlags['quest_complete']
// ↑ IGUAL! Funciona
```

---

## 🚀 Dicas Pro

### Tip 1: Use Nomes Descritivos
```javascript
✓ BOM:
flagId: "boss_forest_defeated"
flagId: "quest_delivery_completed"
flagId: "npc_john_talked_twice"

✗ RUIM:
flagId: "flag1"
flagId: "x"
flagId: "done"
```

### Tip 2: Use Prioridades
```javascript
// Se múltiplas flags podem estar ativas
// coloque a mais importante com maior priority

{
  flagId: "boss_defeated",
  dialogue: "Você me venceu!",
  priority: 100  // ← Altíssima
},
{
  flagId: "visited_before",
  dialogue: "Você já foi aqui",
  priority: 1    // ← Baixa
}
```

### Tip 3: Teste Incrementalmente
```
1. Crie NPC com 1 flag
2. Teste se funciona
3. Adicione 2ª flag
4. Teste se ambas funcionam
5. Adicione complexidade
```

---

## 📞 Referência Rápida

| O Que | Onde | Como |
|------|------|------|
| Criar NPC | City/Create Lab | Clique em NPC |
| Adicionar Flag | Seção "Condicionais" | "+ adicionar condição" |
| Limpar Tudo | Seção "Condicionais" | "🧹 limpar diálogos fixos" |
| Testar Flag | Browser Console | `window.STORY_FLAGS = {...}` |
| Ver Logs | Terminal | `tail -f server.log` |
| Editar BD | MongoDB Compass | Buscar por NPC/User |

---

## 🎯 Casos de Uso Comuns

### Caso 1: NPC que Muda Após Quest

```javascript
// Antes da quest:
flagId: ""  // Sem flag = sempre mostra padrão
dialogue: "Pode me ajudar?"

// Após quest ativa (flag: "quest_npc_completo"):
flagId: "quest_npc_completo"
dialogue: "Obrigado! Você salvou o dia!"
priority: 10
```

### Caso 2: NPC com Múltiplas Reações

```javascript
// Estado 1: Primeira vez
flagId: ""
dialogue: "Olá aventureiro!"
priority: 1

// Estado 2: Quest ativa
flagId: "quest_npc_ativo"
dialogue: "Ainda está me ajudando?"
priority: 5

// Estado 3: Quest completa
flagId: "quest_npc_completo"
dialogue: "Você é meu herói!"
priority: 10
```

### Caso 3: NPC Desaparece

```javascript
// Usar um NPC "falso" com:
flagId: "npc_disappeared"
dialogue: "Ninguém aqui..."
priority: 100

// Quando flag ativa, só ele é mostrado
```

---

## ✨ Boas Práticas

```
✓ FAÇA:
- Nomes de flags descritivos
- Deixe diálogos padrão vazios quando usar flags
- Use prioridades para múltiplas flags
- Teste incrementalmente
- Documente suas flags em um arquivo

✗ EVITE:
- Nomes genéricos (flag1, x, done)
- Misturar diálogos padrão com condicionais
- Esquecer o flagId
- Duplicar nomes de flags com tipos diferentes
- Testar tudo de uma vez
```

---

## 🎉 Você Está Pronto!

Agora você sabe:
- ✅ Como criar NPCs com diálogos dinâmicos
- ✅ Como testar flags
- ✅ Como debugar problemas
- ✅ Como evitar erros comuns
- ✅ Como usar em casos reais

**Bora criar narrativas épicas!** 🎮

