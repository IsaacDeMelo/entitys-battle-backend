# 🎮 Guia de Recursos Adicionados

## 1️⃣ Barreira com StoryFlag (Story Barrier)

### O que é?
Uma barreira **laranja** que bloqueia o movimento do jogador até que uma `StoryFlag` específica seja ativada. Funciona como um gate de progressão de história.

### Como Usar no Dev Mode

#### 1. Criar uma Story Barrier

1. **Ativar o Dev Mode** (admin)
2. Clicar no botão **🟧 BARREIRA FLAG** na seção "Desenho"
3. **Desenhar a barreira** no mapa (clique e arraste)
4. Quando soltar o mouse, um prompt pedirá o **nome da StoryFlag**
   - Exemplo: `"completed_quest_1"`, `"boss_defeated"`, `"forest_unlocked"`
5. A barreira aparecerá em **laranja com um íc�one 🚫**
6. Clicar em uma barrier para **editar o nome da flag**
7. Deletar com a ferramenta Delete

#### 2. No Código do Servidor

Para **ativar a flag** durante um evento (batalha vencida, quest completa, etc.):

```javascript
// No seu handler de vitória/evento
user.storyFlags['completed_quest_1'] = true;
await user.save();
socket.emit('story_update', { storyFlags: user.storyFlags });
```

#### 3. No Cliente

O cliente automaticamente:
- Lê `window.STORY_FLAGS` que vem do servidor
- Verifica se a flag está ativa quando o jogador tenta passar
- Se `STORY_FLAGS[requiredFlag]` for `true`, a barreira não bloqueia
- Se for `false` ou undefined, bloqueia o movimento

### Exemplo Prático

```javascript
// Quando o jogador derrota o boss
if (playerWon) {
    user.storyFlags['boss_phase_1_defeated'] = true;
    // ... salva e emite para o cliente
}

// No cliente:
// A barreira que requer "boss_phase_1_defeated" desaparece
// O jogador consegue passar
```

### Estrutura no Banco de Dados

**No mapConfig (database de mapas):**
```json
{
  "id": "forest",
  "storyBarriers": [
    {
      "x": 30,
      "y": 50,
      "w": 10,
      "h": 5,
      "requiredFlag": "boss_defeated"
    }
  ]
}
```

**No usuário (MongoDB):**
```json
{
  "storyFlags": {
    "boss_defeated": true,
    "completed_quest_1": false,
    "unlocked_shop": true
  }
}
```

---

## 2️⃣ Atualizar Tipos de Monstros

### Por que usar?

Se você quer **mudar os tipos de todos os monstros** (por exemplo, converter de tipos Pokémon padrão para seus tipos personalizados), existem dois scripts:

- **`update_monster_types.js`** → Atualiza no **MongoDB**
- **`update_json_monster_types.js`** → Atualiza no **database.json** (backup local)

### Como Usar

#### 1. Editar o Mapeamento de Tipos

Abra o script desejado e edite o `TYPE_MAPPING`:

```javascript
const TYPE_MAPPING = {
    'water': 'aqua',      // water → aqua
    'fire': 'flame',      // fire → flame
    'plant': 'forest',    // plant → forest
    'bug': 'beast',       // bug → beast
    // ... adicione mais conforme necessário
};
```

#### 2. Executar o Script

**Para atualizar o MongoDB:**
```bash
node scripts/update_monster_types.js --confirm
```

**Para atualizar database.json:**
```bash
node scripts/update_json_monster_types.js --confirm
```

#### 3. O que Acontece

- 📊 Lista todos os monstros que serão alterados
- 💾 Faz um backup automático (database.json.backup)
- ✅ Aplica as mudanças
- 📋 Mostra relatório de conclusão

### Exemplo de Mudança

**Antes:**
```json
{
  "id": "1765890258837",
  "name": "Sharkgon",
  "type": "water",
  "hp": "150"
}
```

**Depois (com `"water": "aqua"`):**
```json
{
  "id": "1765890258837",
  "name": "Sharkgon",
  "type": "aqua",
  "hp": "150"
}
```

### Tipos Disponíveis Atuais

- `beast` - Fera/Normal
- `sky` - Céu/Voador
- `aqua` - Água
- `flame` - Fogo
- `forest` - Planta/Grama
- `venom` - Veneno
- `shadow` - Sombra/Escuro
- `earth` - Terra/Rocha
- `metal` - Metálico
- `mystic` - Místico/Psíquico/Dragão

### Reverter Mudanças

Se cometeu um erro:

1. Restaure do backup:
   ```bash
   cp database.json.backup database.json
   ```

2. Para MongoDB, você precisará fazer rollback manualmente ou usar seus próprios backups

---

## 🔧 Resumo Rápido

| Feature | Uso | Arquivo |
|---------|-----|---------|
| **Story Barrier** | Bloqueia movimento com flag | `views/city.ejs` |
| **Atualizar Tipos (MongoDB)** | Muda tipos no banco | `scripts/update_monster_types.js` |
| **Atualizar Tipos (JSON)** | Muda tipos em database.json | `scripts/update_json_monster_types.js` |

---

## ⚠️ Notas Importantes

- **Salvar o mapa** após criar barreiras: botão **💾 SALVAR MAPA** no dev toolbar
- **Story Flags** são case-sensitive: `"Boss_Defeated"` ≠ `"boss_defeated"`
- **Backup automático** é criado ao atualizar database.json
- Flags não precisam existir no usuário para funcionar (são criadas dinamicamente)

