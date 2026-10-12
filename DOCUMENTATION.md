# Entitys Battle — Documentação do Projeto

> Estado atual: **menus do front-end removidos** e aguardando reconstrução.
> O jogo (mapa, batalha, APIs) funciona; as telas de EQUIPE/PC/DEX/BAG/RANK/CARD
> exibem apenas um aviso de "reconstrução". Leia este documento antes de codar.

## 1. Visão geral

Jogo estilo Pokémon multiplayer no navegador: mapa aberto com movimento em
tempo real (Socket.IO), encontros selvagens, batalhas por turno (HTTP),
NPCs (treinadores, lojistas, curandeiros, starter, box/gacha), progressão
com XP/evolução, inventário, PvP com ranking e modo espectador.

- **Back-end:** Node 24 + Express 5 + Mongoose 9 + Socket.IO 4 (`index.js`,
  ~5200 linhas — monolito; ver §5).
- **Front-end:** EJS renderizado no servidor + JS vanilla inline
  (`views/`, sem framework, sem bundler).
- **Banco:** MongoDB Atlas (`MONGO_URI` no `.env`, banco `test`).
- **Uploads:** Cloudinary (skins, sprites, mapas) com fallback base64 no banco.

## 2. Como rodar

```bash
npm install
npm test        # 13 testes, todos devem passar
node index.js   # Server ON Port 9000 → http://localhost:9000
```

`.env` (nunca commitar — está no `.gitignore`):

```env
MONGO_URI=mongodb+srv://...   # Atlas (sem nome de banco → usa "test")
PORT=9000
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Primeira carga: crie um usuário em `/`, marque `isAdmin: true` na coleção
`users`, acesse `/lab?userId=<ID>` e crie skins (obrigatório p/ registrar),
3 entidades `isStarter` e os NPCs.

## 3. Mapa de arquivos

```
index.js                Servidor: rotas HTTP + Socket.IO + regras coladas
config.js               Lê .env; MONGO_URI (fallback local em dev)
models.js               Schemas Mongoose (ver §4)
gameData.js             EntityType, TypeChart, MOVES_LIBRARY, XP, efetividade
lib/gameRules.js        Regras puras e TESTADAS (stats, movepool, validação)
lib/battleEngine.js     Motor de batalha puro e TESTADO (ver §6)
lib/chromaKey.js        Chroma key PNG (puro, ok)
lib/cloudinary.js       Upload (lê env de forma tardia de propósito)
test/                   game-rules.test.js + battle-engine.test.js (node:test)
views/city.ejs          Jogo: mapa, movimento, NPCs, loja, batalha selvagem (~8100 linhas)
views/battle.ejs        Arena de batalha por turno
views/login.ejs         Login/registro + escolha de skin
views/create.ejs        LAB admin (entidades, NPCs, itens, skins — AJAX, sem reload)
views/dev.ejs           Painel dev | views/admin.ejs, chroma.ejs, spritesheets
views/partials/menu.ejs STUB — menus removidos, só contrato (ver §7)
public/scripts/common.js   Utilidades globais (dialog, toast, socket)
public/scripts/pokemon-display.js  resolvedor único de sprite/icon/placeholder
public/styles/            entity-layout.css, hud-theme.css (base neutra)
items.catalog.json + itemCatalog.js  MORTOS (catálogo real está no Mongo)
scripts/                Migrações one-shot antigas (não usar sem ler)
```

## 4. Banco (coleções e IDs canônicos)

- `users`: `username`, `password` (texto puro — débito conhecido, migrar p/
  bcrypt+JWT), `skin` (ObjectId de PlayerSkin), `money`,
  `bag` (objeto `{ pokeball, 'rare-candy', potion, ... }`),
  `keyItems[]`, `storyFlags{}`, `entityTeam[]` (`_id, baseId, nickname,
  level, currentHp, xp, stats, moves, learnedMoves`), `pc[]`, `dex[]`,
  `defeatedNPCs[]`, `followingEntityId`, `pvpPoints/Wins/Losses`,
  `lastLocation`, `isAdmin`.
- `entities` (BaseEntity): `id` (string!), `name`, `type`, `baseStats`,
  `spawnLocation`, `min/maxSpawnLevel`, `catchRate`, `spawnChance`,
  `isStarter`, `sprite`, `icon`, `dexOrder`, `evolution{targetId, level}`,
  `movePool[{moveId, level}]`.
- `npcs`: `npcType` (decor|quest|trainer|starter|heal|shop|box),
  `map,x,y,direction,skin`, `dialogue/winDialogue/cooldownDialogue`,
  `conditionalDialogues[]`, `team[{baseId,level}]`, `moneyReward`,
  `reward{type: item|entity|none}`, `interact{...}` (shopItems, box, starterOptions…),
  `patrol{...}`.
- `gamemaps`: `mapId`, `bgImage`, `collisions[]`, `grass[{x,y,w,h,
  encounterRate, encounterKey}]`, `portals[]`, `interacts[]`,
  `storyBarriers[]`, `objects[]`, `battleBackground` + ajustes.
- `itemdefinitions`: catálogo real. **IDs canônicos: `pokeball`,
  `rare-candy`.** Aliases legados (`captureCube`, `levelUpCrystal`,
  `rareCandy`) são dobrados para o canônico em `normalizeItemId`
  (`lib/gameRules.js`, testado) — nunca grave ID legado.
- `playerskins`: `{ name (único), pngBase64 (URL Cloudinary ou base64),
  createdAt, updatedAt }`. Servida em `/skins/:id.png` com ETag por
  `updatedAt`; front usa `?v=<updatedAt>` para invalidar cache após edição.
- `devsettings`, `devlogs`.

## 5. Back-end — rotas por área (`index.js`)

- Auth/páginas: `GET /`, `POST /login|/register` (com rate-limit simples e
  sanitização de username), `GET /city` (engine do mapa),
  `GET /lab` (admin), `/admin/dev`, `/skins/:id.png` (ETag).
- Time: `GET /api/me` (time+mochila+dex+skin+username),
  `POST /api/equip-move` `{userId, entityId, moves[1..4]}`,
  `POST /api/set-lead` `{userId, entityId}`,
  `POST /api/abandon-entity` `{userId, entityId}` (nunca o último),
  `POST /api/following` `{userId, instanceId}`, `GET /api/pc`,
  `POST /api/pc/move` `{userId, entityId, from, to}`,
  `POST /api/evolve`, `POST /api/heal`.
- Itens: `GET /api/items/catalog`, `POST /api/buy-item` (compra atômica),
  `POST /api/use-item` (`rare-candy` canônico; alias legado aceito e migrado),
  `POST /api/inventory/consume`, `POST /api/items/upsert|delete|icon/set`
  (admin), `POST /api/dev/inventory/grant|revoke|money` (admin).
- Batalha: `POST /battle/wild|contract|npc|`, `POST /battle`,
  `GET /battle/:id`, `POST /api/turn` (`catch|run|move|switch`),
  `GET /api/contracts`, `GET /api/rank`, PvP via Socket.IO (`onlineBattles`
  com TTL de 30min; `activeBattles` idem — nada é eterno em memória).
- NPCs: `POST /api/npc/interact|engage|disengage|dialogue|move|save|delete`,
  `POST /api/npc/shop/buy`, `POST /api/starter/options|choose`,
  `POST /api/map/save|interact|use-key|battlebg`,
  `GET /api/map/:mapId|full`, `GET /api/dev/encounter-zones/:mapId`.
- LAB: `POST /lab/create|create-npc|delete|delete-npc|skins/create|delete`
  (aceitam `Accept: application/json` p/ AJAX ou redirect),
  `GET /lab/list?type=skins|entities|npcs`.

## 6. Regras de jogo (não reinventar)

- `lib/battleEngine.js`: `processAction` (energia→evasão→defesa 0.5x→dano→
  status), `performEnemyTurn` (prefere golpe com energia), `applyStatusDamage`
  (`poison` 1/8, `burn` 1/16, `frozen` 50% imobiliza, `paralyzed` 25%),
  `calculateCaptureChance` (HP baixo + status 2x, clamp 5–98%),
  `rest` = caminho único (cura + `restBonus` de energia). RNG injetável.
- `lib/gameRules.js`: `calculateStats`, `normalizeMovePool`,
  `pickDeterministicMovesFromPool`, `validateEntityDefinition`,
  `isEntityBattleReady`, `normalizeItemId`.
- XP: `getXpForNextLevel` (`30·level^1.4`); evolução via
  `applyOwnedEntityProgression` (preserva apelido custom).
- Efetividade: `getTypeEffectiveness` (2x nerfado p/ 1.5x).
- Energia: máx 10, `rest` é a recarga (sem rota paralela de +5 — removida).

## 7. Front-end e o MENU REMOVIDO

- `city.ejs` é o jogo: viewport 420px mobile / 960px PC; socket
  (`enter_map`, `move_player`, `check_encounter`); NPCs com patrulha;
  loja/mochila/bagOverlay próprios; START abre aviso de reconstrução.
- `views/partials/menu.ejs` é hoje um **STUB**: zero UI; exporta
  `USER_ID`, `IS_ADMIN` e ~60 funções no-op + `MenuSystem` mínimo para
  `city.ejs` não quebrar (todas com `typeof`-guard ou chamadas diretas
  seguras). Ao reconstruir, manter esses nomes ou atualizar `city.ejs` junto.
- `public/scripts/pokemon-display.js`: `resolvePokemonImage(ent, ctx)` —
  thumb=`icon||sprite`, detalhe/batalha=`sprite||icon`, fallback
  `/uploads/placeholder.png`. Usar sempre; nunca montar `/uploads/` na mão.
- Imagens: `object-fit: contain` + `image-rendering: pixelated` em sprites.
- Skins: URL `/skins/<id>.png?v=<updatedAt>`; sprite 4×4, frente = `0% 0%`
  com `background-size: 400% 400%`.

### Guia de reconstrução dos menus (destino)
Telas: EQUIPE (party de 6: retrato, nome, Nv, tipo, barra HP `atual/max`,
status OK/DESMAIADO), PC (box + time, drag e toque), DEX (grade + detalhe),
BAG (grade estilo Minecraft: consumíveis, equipado, chaves), RANK, CARD
(foto frontal da skin + nome, moedas, time, dex, PvP). Entrada: long-press
no personagem / botão START → radial de 3 fatias (BAG/TIME/CARD) que crescem
ao toque; duplo-toque em área vazia volta ao radial; tudo com `transition`
e `prefers-reduced-motion`. Endpoints na §5; formatos de resposta nos
próprios handlers. Testar: abrir cada tela, usar doce, mover no PC, trocar
de aba sem fechar, mobile 360px e PC 1280px, F12 sem erros.

## 8. Convenções obrigatórias

1. **NUNCA emojis** em código, UI ou logs (verificado por grep — manter).
2. **IDs de item sempre canônicos** (`pokeball`, `rare-candy`); ler pode
   aceitar alias, gravar nunca.
3. **Sem estado em memória sem TTL**; sem senha em log; sem `console.log`
   de debug em produção (usar `DEBUG_NPC=1` p/ diálogos).
4. **Testar antes de commitar:** `npm test` (13 testes) + `node --check`
   nos arquivos tocados + compilar EJS.
5. Uploads: limite 3MB skins; Cloudinary com fallback base64; PNG
   validado por assinatura.

## 9. Débitos conhecidos (não reintroduzir)

Senha em texto puro; auth por `userId` sem sessão; `index.js` monolito;
`scripts/` legados; `itemCatalog.js`/`items.catalog.json` mortos;
sem dano special/physical separado; `defending` expira em 1 turno por design.

## 10. Problemas comuns

- "Salvei e não aparece": cache — `?v=`/ETag em skins; Ctrl+F5 p/ CSS/JS.
- "500 em upload": limite 3MB ou arquivo não-PNG de verdade.
- "Item inválido na loja": ID fora do catálogo ou `price <= 0`.
- "Golpe não equipa": `entityId` (não `pokemonId`) e 1–4 golpes aprendidos.
- "Migração infinita": não existe mais — `fixLegacyUsers` é idempotente e
  tudo nasce canônico; se voltar, procurar escrita de chave legada.
