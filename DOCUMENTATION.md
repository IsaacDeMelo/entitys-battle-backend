# Entitys Battle — Documentação do Projeto

> Estado atual: HUD da cidade e menus usam uma interface inspirada em console portátil.
> MENU (ou M) abre uma janela única com Equipe, Mochila, Entitydex, PC, Ranking e Treinador.
> Leia este documento antes de codar.

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
views/partials/menu.ejs Bootstrap seguro dos menus (ver §7)
public/scripts/classic-menu.js Estado, navegação e ações dos menus
public/styles/classic-hud.css HUD e menus da cidade no estilo portátil
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

## 7. Front-end e menus de console portátil

- `city.ejs` mantém o mapa e seus controles. `classic-hud.css` é carregado
  depois dos estilos legados e aplica o tema apenas à cidade e aos menus novos.
- `partials/menu.ejs` fornece USER_ID, IS_ADMIN e o catálogo serializado com
  escape de HTML para `classic-menu.js` (defer). Sem outro menu flutuante.
- MENU / M abre a Equipe; abas trocam a tela dentro da mesma janela.
  Escape / B retorna do detalhe ou fecha. Tab / setas e D-pad navegam; A confirma.
  O foco fica no menu e retorna ao acionador ao fechar. O mapa fica bloqueado.
- Fora dos menus, as setas do teclado movem o personagem pelo mesmo motor
  do D-pad, com colisões e movimento contínuo enquanto a tecla está pressionada.
  Chat/campos de edição, modo dev, diálogos e transições bloqueiam as setas;
  perder foco, abrir menu ou ocultar a aba interrompe o movimento.
- Equipe: sprites, nível, tipo, HP, detalhes, golpes equipados, líder,
  acompanhamento e evolução quando liberada pelo servidor.
- PC: seleção por toque/clique e transferência entre equipe e box; limites
  são validados pelo endpoint existente. Entitydex: catálogo com registros e detalhe.
- Mochila: nomes do catálogo, quantidades, itens-chave e Doce Raro com seleção
  de parceiro. Outros itens continuam nos fluxos existentes de batalha/mapa.
- Ranking: pontos, vitórias e derrotas. Treinador: skin, nome, dinheiro,
  contagem da equipe, registros e treinadores vencidos.
- Carregamento, erro com repetição, proteção contra respostas atrasadas e
  bloqueio de ações duplicadas. Respeita prefers-reduced-motion e safe areas.
- `MenuSystem`, openEntityTeam/openPokemon, openPC, openPokedex, openBag,
  openRank, openCard e os hooks __menu* continuam disponíveis. As antigas
  funções sem implementação foram removidas; não adicionar botões sem ação real.
- Imagens usam `PokemonDisplay.resolvePokemonImage`, object-fit contain e
  image-rendering pixelated. Skins usam /skins/<id>.png, quadro frontal 4×4.
- Follower e batalha compartilham `public/scripts/spritecollab.js`: carrega
  Walk/Idle e AnimData.xml por dexOrder, resolve CopyOf, recorta frames por
  direção e usa cache limitado com TTL. `battle-sprites.js` anima Idle em canvas
  com duração definida no XML; aliado olha para a direita e inimigo à esquerda.
  O recorte da batalha considera os pixels visíveis de todos os frames para
  manter tamanho e posição estáveis. Entrada, ataque e recolhimento usam um
  wrapper que preserva os efeitos CSS. Sem dexOrder ou folhas disponíveis,
  permanece o fallback da arte cadastrada. As trocas invalidam pedidos antigos;
  os timers param ao ocultar/sair da página e respeitam redução de movimento.
  dexOrder e icon acompanham os participantes e as respostas de troca do servidor.
- `pokemon-sizes.js` inclui alturas das 1.025 espécies padrão da tabela pública
  PokeAPI, servidas localmente. Uma curva logarítmica comprime a escala para
  legibilidade: as batalhas usam uma fração por espécie; followers ficam entre
  22 e 64 px. O tamanho não depende das margens da spritesheet. Walk/Idle e
  todas as direções compartilham uma referência em pixels de origem, mantendo
  a escala ao virar ou parar. O desenho fica alinhado ao chão. O contêiner do
  follower acompanha o canvas para não cortar criaturas maiores; carregamentos
  antigos do follower local são descartados ao trocar de parceiro.
  Validação: 22 testes, comparação Rattata/Onix em batalha e follower real no mapa.
- Troca de follower: menu e evento Socket.IO do próprio jogador acionam
  `setFollowingEntityId`, sincronizando o cache e a renderização sem reload.
  A imagem do novo parceiro aparece após confirmação da troca enquanto as
  folhas animadas carregam; pedidos anteriores são invalidados. Fluxo conferido
  no jogo real com Gengar → Rattata → Gengar sem recarregar a página.
- Editor de golpes, abandono e arrastar no PC não estão nesta interface.

Validação desta reformulação: 13 testes de regras/batalha; compilação EJS
e sintaxe dos scripts renderizados; inspeção visual em 1280×720 e 360×780;
navegação nas seis abas, líder, Doce Raro e transferência PC com dados locais
de demonstração. Integração com MongoDB e partida real ainda precisa ser
validada num ambiente configurado. Validação adicional: MongoDB conectado,
mapa/skin/NPCs reais do treinador M carregados e movimento por seta confirmado.
Bloqueio das setas no chat e navegação no menu verificados em sessão de teste.
Para desenvolvimento visual sem migrações globais nem seed na inicialização,
defina SKIP_STARTUP_MIGRATIONS=1 no ambiente; o catálogo existente continua carregando.

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

- Assets de batalha: o Cloudinary `dhdkifjdt` respondeu 401 com a mensagem
  `cloud_name dhdkifjdt is disabled` durante a verificação. Isso afeta fundos
  e sprites personalizados hospedados ali. Reativar a conta ou reenviar os
  originais é necessário para recuperar essas artes; os dados não foram alterados.
- `battle-assets.js` preserva URLs absolutas e caminhos iniciados por `/` e
  usa `/uploads/swamp-battle-v1.png` se o fundo configurado falhar ou usar o
  padrão legado `battle_bg.png`. O fundo de pântano foi gerado a partir de uma
  referência de plataforma oval com grama e faixas verdes; fundos customizados
  disponíveis continuam tendo prioridade.
- `PokemonDisplay.setImage` tenta sprite/ícone conforme o contexto e então
  o placeholder PNG local. A cadeia termina mesmo se o placeholder falhar;
  as trocas de parceiro recriam a cadeia. O PNG anterior estava corrompido.
- Testes de assets cobrem fundo remoto indisponível, caminhos locais,
  troca de parceiro, fallback de sprite e decodificação do PNG (16 testes totais).

- "Salvei e não aparece": cache — `?v=`/ETag em skins; Ctrl+F5 p/ CSS/JS.
- "500 em upload": limite 3MB ou arquivo não-PNG de verdade.
- "Item inválido na loja": ID fora do catálogo ou `price <= 0`.
- "Golpe não equipa": `entityId` (não `pokemonId`) e 1–4 golpes aprendidos.
- "Migração infinita": não existe mais — `fixLegacyUsers` é idempotente e
  tudo nasce canônico; se voltar, procurar escrita de chave legada.
