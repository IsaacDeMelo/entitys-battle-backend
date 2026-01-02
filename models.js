const mongoose = require('mongoose');

// --- POKEMON SCHEMA ---
const PokemonSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: String,
    type: String,
    baseStats: {
        hp: Number,
        energy: Number,
        attack: Number,
        defense: Number,
        speed: Number
    },
    spawnLocation: String, // ex: 'forest', 'house1'
    minSpawnLevel: Number,
    maxSpawnLevel: Number,
    catchRate: Number,
    spawnChance: Number,
    isStarter: Boolean,
    sprite: String, // Base64 ou URL
    evolution: {
        targetId: String,
        level: Number
    },
    movePool: [{ moveId: String, level: Number }]
});

// --- USER SCHEMA ---
const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    skin: { type: String, default: 'char1' },
    money: { type: Number, default: 1000 },
    pokeballs: { type: Number, default: 5 },
    rareCandy: { type: Number, default: 0 },

    // Inventário genérico (itens arbitrários por id => quantidade)
    // Mantém compatibilidade com pokeballs/rareCandy (que continuam existindo como campos próprios).
    inventory: { type: Object, default: {} },
    // Itens-chave (únicos, usados para gates de história/portas)
    keyItems: { type: [String], default: [] },
    // Flags de história/progressão (quest states)
    storyFlags: { type: Object, default: {} },

    isAdmin: { type: Boolean, default: false },

    // Última localização do jogador (para voltar exatamente onde parou)
    lastLocation: {
        mapId: { type: String, default: 'house1' },
        x: { type: Number, default: 50 },
        y: { type: Number, default: 50 },
        direction: { type: String, default: 'down' },
        updatedAt: { type: Number, default: 0 }
    },

    pokemonTeam: [{
        baseId: String,
        nickname: String,
        level: Number,
        currentHp: Number,
        xp: { type: Number, default: 0 },
        stats: Object,
        moves: [String],
        learnedMoves: [String]
    }],
    pc: Array,
    dex: [String],
    defeatedNPCs: [{ npcId: String, defeatedAt: Number }]
});

// --- NPC SCHEMA ---
const NPCSchema = new mongoose.Schema({
    // Tipo padronizado (opcional): 'decor' | 'quest' | 'trainer' | 'starter' | 'heal' | 'shop'
    npcType: { type: String, default: '' },
    name: String,
    map: String,
    x: Number,
    y: Number,
    direction: String,
    skin: String,
    isCustomSkin: Boolean,
    dialogue: String,
    winDialogue: String,
    cooldownDialogue: String,
    moneyReward: Number,
    cooldownMinutes: Number,
    battleBackground: String, // Fundo de batalha específico

    // Se true, o NPC pode bloquear caminho (usado no client para colisão dinâmica)
    blocksMovement: { type: Boolean, default: false },

    // Interação de história/itens (fora de batalha). Opcional e retrocompatível.
    interact: {
        enabled: { type: Boolean, default: false },

        // Tipo de serviço (opcional):
        // - '' (padrão): interação de história/itens (quest)
        // - 'heal': cura o time do jogador
        // - 'shop': abre uma lojinha (itens configuráveis)
        serviceType: { type: String, default: '' },

        // Texto opcional usado por alguns serviços
        healDialogue: { type: String, default: '' },

        // Itens vendidos quando serviceType='shop'
        // Ex: [{ itemId: 'pokeball', price: 50 }, { itemId: 'rareCandy', price: 2000 }]
        shopItems: { type: Array, default: [] },

        // Starter custom (quando serviceType='starter')
        // Lista de baseIds oferecidos por este NPC. Se vazio, usa os 3 do banco (isStarter=true).
        starterOptions: { type: [String], default: [] },

        // Requisito: precisa ter item X (no inventário genérico ou como keyItem)
        requiresItemId: { type: String, default: '' },
        requiresItemQty: { type: Number, default: 1 },
        consumesRequiredItem: { type: Boolean, default: false },

        // Recompensa ao interagir
        givesItemId: { type: String, default: '' },
        givesItemQty: { type: Number, default: 1 },
        givesKeyItem: { type: Boolean, default: false },
        givesUnique: { type: Boolean, default: false },

        // Flag (para garantir unicidade/progressão). Se vazio, usa um padrão por NPC.
        flagId: { type: String, default: '' },

        // Textos de diálogo
        successDialogue: { type: String, default: '' },
        needItemDialogue: { type: String, default: '' },
        alreadyDoneDialogue: { type: String, default: '' },

        // Ação: mover NPC após sucesso
        moveDx: { type: Number, default: 0 },
        moveDy: { type: Number, default: 0 },
        moveDirection: { type: String, default: '' }
    },

    // Movimento automático (patrulha). Opcional e retrocompatível.
    // Tipos suportados:
    // - pingpong: vai e volta entre A e B
    // - circle: circula ao redor de um centro
    // - path: percorre uma rota manual (lista de pontos)
    patrol: {
        enabled: { type: Boolean, default: false },
        mode: { type: String, default: '' }, // 'pingpong' | 'circle' | 'path'
        speed: { type: Number, default: 6 }, // em % do mapa por segundo

        pingPong: {
            ax: { type: Number, default: 0 },
            ay: { type: Number, default: 0 },
            bx: { type: Number, default: 0 },
            by: { type: Number, default: 0 }
        },

        circle: {
            cx: { type: Number, default: 0 },
            cy: { type: Number, default: 0 },
            radius: { type: Number, default: 0 },
            clockwise: { type: Boolean, default: true }
        },

        path: {
            loop: { type: Boolean, default: true },
            points: [{
                x: { type: Number, default: 0 },
                y: { type: Number, default: 0 }
            }]
        },

        // Offset pra dessicronizar NPCs (ms)
        phaseOffsetMs: { type: Number, default: 0 }
    },
    team: [{
        baseId: String,
        level: Number
    }],
    reward: {
        type: { type: String }, // 'item', 'pokemon' ou 'none'
        value: String,
        qty: Number,
        level: Number,
        // opcionais
        keyItem: { type: Boolean, default: false },
        unique: { type: Boolean, default: false }
    }
});

// --- MAP SCHEMA (SISTEMA DINÂMICO) ---
const MapSchema = new mongoose.Schema({
    mapId: { type: String, required: true, unique: true }, // ex: 'city', 'house1'
    name: String,
    bgImage: String, // Base64 ou URL
    battleBackground: String, // Fundo de batalha padrão deste mapa
    // Ajuste fino do recorte (quando usado com background-size: cover no battle)
    // 0-100 (%), onde 50/50 é centralizado.
    battleBgPosX: { type: Number, default: 50 },
    battleBgPosY: { type: Number, default: 50 },
    width: { type: Number, default: 100 }, // Tamanho em %
    height: { type: Number, default: 100 }, // Tamanho em %
    darknessLevel: { type: Number, default: 0 }, // 0.0 a 0.9
    spawnPoint: { x: Number, y: Number }, // Ponto de nascimento padrão
    
    collisions: { type: Array, default: [] },
    grass: { type: Array, default: [] },
    interacts: { type: Array, default: [] },
    portals: { type: Array, default: [] },

    // Objetos decorativos do mapa (imagens PNG/base64 ou URL) com controle de z-index
    // Estrutura sugerida: { id, x, y, w, h, image, anchorY, zOffset, zMode }
    objects: { type: Array, default: [] }
});

// --- ITEM CATALOG (central, no DB) ---
// type: 'consumable' (gastável) | 'key' (item-chave)
// iconPngBase64: PNG 32x32 em base64 (sem prefixo data:)
const ItemDefinitionSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    name: { type: String, default: '' },
    type: { type: String, default: 'consumable' },
    iconPngBase64: { type: String, default: '' },
    updatedAt: { type: Number, default: () => Date.now() }
});

// --- PLAYER SKINS (catálogo de skins de criação, no DB) ---
// pngBase64: PNG em base64 (sem prefixo data:)
const PlayerSkinSchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    pngBase64: { type: String, required: true },
    createdAt: { type: Number, default: () => Date.now() },
    updatedAt: { type: Number, default: () => Date.now() }
});

const BasePokemon = mongoose.model('BasePokemon', PokemonSchema);
const User = mongoose.model('User', UserSchema);
const NPC = mongoose.model('NPC', NPCSchema);
const GameMap = mongoose.model('GameMap', MapSchema);
const ItemDefinition = mongoose.model('ItemDefinition', ItemDefinitionSchema);
const PlayerSkin = mongoose.model('PlayerSkin', PlayerSkinSchema);

module.exports = { BasePokemon, User, NPC, GameMap, ItemDefinition, PlayerSkin };
