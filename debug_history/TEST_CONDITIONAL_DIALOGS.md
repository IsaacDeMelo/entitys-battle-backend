# 🧪 Como Testar Diálogos por Flags

## ✅ Checklist de Testes

### Setup: Criar um NPC de Teste

1. Vá para **City Editor** (Lab)
2. Crie um NPC com:
   - **Nome:** "Maria (Test)"
   - **Tipo:** Trainer (com time para batalha)
   - **Diálogo padrão:** (DEIXE VAZIO!)
   - **Diálogo vitória:** (DEIXE VAZIO!)
   - **Interact habilitado:** SIM
   - **Fala de sucesso:** (DEIXE VAZIO!)

### Adicionar Diálogos Condicionais (Flags)

3. Na seção **"Diálogos Condicionais (StoryFlags)"**, clique em **"+ adicionar"**
4. Preencha:
   - **flagId:** `test_flag_1`
   - **Diálogo principal:** `🎉 SUCESSO! A FLAG FUNCIONOU!`
   - **Prioridade:** 10
5. Clique em **"+ adicionar"** novamente para adicionar mais uma:
   - **flagId:** `test_flag_2`
   - **Diálogo principal:** `🎉 FLAG 2 ATIVA! ISSO É OUTRA MENSAGEM!`
   - **Prioridade:** 5

6. **Salve o NPC**

---

### Test 1: Sem Flags (Should Show Fallback)

```
Situação: Usuário sem nenhuma flag ativa
Resultado esperado: (vazio ou mensagem padrão do interact)
```

**Como testar:**
1. Abra o browser console (F12)
2. Execute:
   ```javascript
   window.STORY_FLAGS = {};
   ```
3. Interaja com o NPC "Maria (Test)"
4. **Esperado:** Uma das 3 coisas:
   - Nada é exibido (porque tudo está vazio)
   - Uma mensagem de fallback genérica
   - A "fala de sucesso" do NPC (que você deixou vazia)

---

### Test 2: Com Flag 1 Ativa (Should Show Dialog 1)

```
Situação: Flag "test_flag_1" = true
Resultado esperado: "🎉 SUCESSO! A FLAG FUNCIONOU!"
```

**Como testar:**

1. Abra o browser console (F12)
2. Ative a flag:
   ```javascript
   window.STORY_FLAGS = { test_flag_1: true };
   ```
3. Interaja com o NPC "Maria (Test)"
4. **Esperado:** Você vê `🎉 SUCESSO! A FLAG FUNCIONOU!`
5. ✅ Se vir isso = **FUNCIONANDO!**
6. ❌ Se ver outra coisa = ainda há problema

---

### Test 3: Com Flag 2 Ativa (Should Show Dialog 2)

```
Situação: Flag "test_flag_2" = true
Resultado esperado: "🎉 FLAG 2 ATIVA! ISSO É OUTRA MENSAGEM!"
```

**Como testar:**

1. Abra o browser console (F12)
2. Ative a flag 2:
   ```javascript
   window.STORY_FLAGS = { test_flag_2: true };
   ```
3. Interaja com o NPC
4. **Esperado:** Você vê `🎉 FLAG 2 ATIVA! ISSO É OUTRA MENSAGEM!`

---

### Test 4: Ambas as Flags Ativas (Should Show Dialog 1 - Higher Priority)

```
Situação: Flag "test_flag_1" = true E Flag "test_flag_2" = true
Resultado esperado: "🎉 SUCESSO! A FLAG FUNCIONOU!" (porque tem prioridade 10 vs 5)
```

**Como testar:**

1. Abra o browser console
2. Ative ambas:
   ```javascript
   window.STORY_FLAGS = { test_flag_1: true, test_flag_2: true };
   ```
3. Interaja com o NPC
4. **Esperado:** `🎉 SUCESSO! A FLAG FUNCIONOU!` (prioridade maior vence)

---

## 🐛 Se Não Funcionar

### Verificar Servidor

Abra o arquivo de log do servidor:

```bash
tail -f /workspaces/entitys-battle-backend/server.log
```

Procure por linhas como:
```
[resolveNpcDialogue] dialogue: Flag "test_flag_1" ativa! Retornando: "🎉 SUCESSO!..."
```

**Se ver isso = servidor está funcionando!**

---

### Verificar Persistência no MongoDB

Execute no MongoDB Compass ou shell:

```javascript
// Encontre seu usuário
db.users.findOne({ _id: ObjectId("seu_user_id") });

// Procure por "storyFlags"
// Deve mostrar:
// "storyFlags": { "test_flag_1": true, ... }
```

Se a flag não estiver salvando, o problema está em outra parte (não é do `resolveNpcDialogue`).

---

## 📚 Referência: Estrutura Esperada do NPC

### JSON do NPC com Flags (Correto)

```json
{
  "_id": "...",
  "name": "Maria (Test)",
  "dialogue": "",  // VAZIO
  "winDialogue": "",  // VAZIO
  "cooldownDialogue": "",  // VAZIO
  "interact": {
    "enabled": true,
    "successDialogue": "",  // VAZIO para usar APENAS flags
    "serviceType": ""
  },
  "conditionalDialogues": [
    {
      "flagId": "test_flag_1",
      "dialogue": "🎉 SUCESSO! A FLAG FUNCIONOU!",
      "winDialogue": "",
      "cooldownDialogue": "",
      "priority": 10
    },
    {
      "flagId": "test_flag_2",
      "dialogue": "🎉 FLAG 2 ATIVA! ISSO É OUTRA MENSAGEM!",
      "winDialogue": "",
      "cooldownDialogue": "",
      "priority": 5
    }
  ]
}
```

---

## 🎯 Fluxo Esperado

```
1. Cliente clica em NPC
2. Cliente chama: POST /api/npc/interact { userId, npcId }
3. Servidor recebe
4. Servidor chama: resolveNpcDialogue(npc, user, 'dialogue')
5. resolveNpcDialogue verifica:
   - Procura em conditionalDialogues
   - Filtra por flags ATIVAS do usuário
   - Ordena por prioridade
   - Retorna o diálogo encontrado
6. Servidor retorna: { text: "🎉 SUCESSO!..." }
7. Cliente exibe no dialog
```

---

## 💡 Dica: Usar o Botão de Limpeza

No Lab, agora há um botão **"🧹 limpar diálogos fixos"** que automaticamente:
- Limpa: Diálogo padrão
- Limpa: Diálogo vitória
- Limpa: Diálogo cooldown
- Limpa: Fala de sucesso

Use isso para garantir que você está usando **APENAS** flags!

