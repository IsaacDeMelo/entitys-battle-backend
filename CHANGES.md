# Mudanças Aplicadas - Unificação e Limpeza

## ✅ Concluído

### 1. TypeChart - Remoção de Contradições
- **MYSTIC**: removida duplicata `SHADOW: 2` e `SHADOW: 0`, mantido `SHADOW: 0.5`
- **SHADOW**: removida duplicata `SHADOW: 2` e conflito `BEAST: 0`, simplificado
- **METAL**: removida duplicata `EARTH: 2` e `EARTH: 0.5`, mantido `EARTH: 2`
- **SKY**: corrigido `EARTH: 0` para `EARTH: 0.5` (imunidade removida)
- **EARTH**: removida duplicata `SKY: 2` e `SKY: 0`, mantido `SKY: 2`
- **VENOM**: removida `METAL: 0` (imunidade), mantido fraquezas normais

### 2. Inventário Unificado
- ✅ Todas as rotas de compra/uso agora usam `bag.captureCube` e `bag.levelUpCrystal`
- ✅ `/api/buy-item`: normalizado para usar apenas IDs novos
- ✅ `/api/use-item`: simplificado para trabalhar com `bag`
- ✅ `/api/npc/shop/buy`: unificado com catálogo central
- ✅ `/api/me`: responde `captureCube` e `levelUpCrystal` da bag

### 3. Renomeações Backend
- ✅ `pokeball` → `captureCube` (ID unificado)
- ✅ `rareCandy` → `levelUpCrystal` (ID unificado)
- ✅ `threwPokeball` → `threwCaptureCube` (variável de batalha)
- ✅ `pickWeightedPokemon()` → `pickWeightedEntity()`
- ✅ `reward.type === 'pokemon'` → `reward.type === 'entity'`
- ✅ `/api/abandon-pokemon` → `/api/abandon-entity`
- ✅ Parâmetros `pokemonId` → `entityId` em rotas de equipe
- ✅ `pokemons` → `entities` em `/lab`

### 4. Barreiras Laranja (storyBarriers)
- ✅ Campo `storyBarriers` agora é salvo no DB via `/api/map/save`
- ✅ Mapas padrão inicializam com `storyBarriers: []`
- ✅ Todos os jogadores agora veem as barreiras criadas no dev mode

### 5. Catálogo de Itens
- ✅ `itemCatalog.js`: atualizado para IDs novos
- ✅ `items.catalog.json`: atualizado para IDs novos

## 🔄 Próximos Passos (Views)

### Views que precisam atualização:
1. **create.ejs** - Renomear "POKEMON" para "ENTITIES"
2. **partials/menu.ejs** - Atualizar modal e referências
3. **battle.ejs** - Atualizar referências a pokeball/rareCandy
4. **city.ejs** - Atualizar placeholders e hints

### Mudanças necessárias nas views:
- Textos UI: "Pokemon" → "Entidade/Monstro"
- Nomes de modais: `modalPokemon` → `modalEntities`
- Funções JS: `openPokemon()` → `openEntities()`
- Parâmetros: `pokemonId` → `entityId`
- Comentários e placeholders

## 📝 Notas

- Compatibilidade mantida onde possível (IDs legados mapeados internamente)
- Respostas API retornam dados da `bag` unificada
- TypeChart agora consistente e sem duplicatas
- Barreiras persistem no DB e afetam todos os jogadores
