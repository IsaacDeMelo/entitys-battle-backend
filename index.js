const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');

// --- IMPORTS DOS ARQUIVOS LOCAIS ---
const { BasePokemon, User } = require('./models');
const { EntityType, MoveType, TypeChart, MOVES_LIBRARY, getXpForNextLevel, getTypeEffectiveness } = require('./gameData');
const { MONGO_URI } = require('./config'); 

const SKIN_COUNT = 6;

// --- CONEXÃO COM O BANCO ---
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB Conectado'))
    .catch(e => console.log('❌ Erro no Mongo:', e));

// --- CONFIGURAÇÃO DO SERVIDOR ---
const app = express();
const server = http.createServer(app);
const io = new Server(server);

process.on('uncaughtException', (err) => { console.error('UNCAUGHT EXCEPTION:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('UNHANDLED REJECTION:', reason); });

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// --- ARMAZENAMENTO EM MEMÓRIA ---
const activeBattles = {}; 
const onlineBattles = {}; 
const players = {}; 
let matchmakingQueue = []; 
const roomSpectators = {}; 

const GRASS_PATCHES = ['grass1', 'grass2'];
const GRASS_CHANCE = { grass1: 0.35, grass2: 0.35 };

// --- FUNÇÕES UTILITÁRIAS ---

function pickWeightedPokemon(pokemonList) {
    let totalWeight = 0;
    pokemonList.forEach(p => totalWeight += (p.spawnChance || 1));
    let random = Math.random() * totalWeight;
    for (let i = 0; i < pokemonList.length; i++) {
        const weight = pokemonList[i].spawnChance || 1;
        if (random < weight) return pokemonList[i];
        random -= weight;
    }
    return pokemonList[0]; 
}

async function seedDatabase() { 
    try { 
        const count = await BasePokemon.countDocuments(); 
        if (count === 0) { 
            console.log('⚠️ Banco vazio. Crie pokemons no /lab ou importe um JSON no /admin');
        } 
    } catch (e) { console.error(e); } 
}

function calculateStats(base, level) { 
    const mult = 1 + (level * 0.05); 
    return { 
        hp: Math.floor((base.hp * 2 * level / 100) + level + 10), 
        attack: Math.floor(base.attack * mult), 
        defense: Math.floor(base.defense * mult), 
        speed: Math.floor(base.speed * mult) 
    }; 
}

// Cria instância de batalha (Selvagem/CPU)
async function createBattleInstance(baseId, level) { 
    const base = await BasePokemon.findOne({ id: baseId }).lean(); 
    if(!base) return null; 
    const stats = calculateStats(base.baseStats, level); 
    let movesIds = base.movePool ? base.movePool.filter(m => m.level <= level).map(m => m.moveId) : []; 
    if(movesIds.length === 0) movesIds = ['tackle']; 
    if(movesIds.length > 4) movesIds = movesIds.sort(() => 0.5 - Math.random()).slice(0, 4); 
    
    // Converte IDs para Objetos completos com PP cheio
    const moves = movesIds.map(mid => {
        const lib = MOVES_LIBRARY[mid];
        if(!lib) return null;
        return { 
            id: mid, 
            name: lib.name, 
            pp: lib.maxPp, 
            maxPp: lib.maxPp, 
            type: lib.type, 
            element: lib.element, 
            power: lib.power, 
            category: lib.category, 
            icon: lib.icon 
        };
    }).filter(m => m !== null);

    return { 
        instanceId: 'wild_' + Date.now(), 
        baseId: base.id, 
        name: base.name, 
        type: base.type, 
        level: level, 
        maxHp: stats.hp, 
        hp: stats.hp, 
        stats: stats, 
        moves: moves, 
        sprite: base.sprite, 
        catchRate: base.catchRate || 0.5, 
        xpYield: Math.max(5, Math.floor(level * 25)), 
        isWild: true,
        status: null 
    }; 
}

// Converte Pokémon do Usuário para Entidade de Batalha (Lê PPs do banco)
function userPokemonToEntity(userPoke, baseData) { 
    // Mapeia os movimentos salvos no banco (que agora têm PP atual salvo)
    const movesObj = userPoke.moves.map(m => { 
        const libMove = MOVES_LIBRARY[m.moveId]; 
        if(!libMove) return null;
        return { 
            ...libMove, 
            id: m.moveId, 
            pp: m.pp, // Usa o PP salvo no banco
            maxPp: libMove.maxPp // Pega o máximo da lib
        }; 
    }).filter(m => m !== null); 
    
    return { 
        instanceId: userPoke._id.toString(), 
        baseId: userPoke.baseId, 
        name: userPoke.nickname || baseData.name, 
        type: baseData.type, 
        level: userPoke.level, 
        maxHp: userPoke.stats.hp, 
        hp: userPoke.currentHp > 0 ? userPoke.currentHp : 0, 
        stats: userPoke.stats, 
        moves: movesObj, 
        sprite: baseData.sprite, 
        isWild: false, 
        xp: userPoke.xp, 
        xpToNext: getXpForNextLevel(userPoke.level),
        status: null
    }; 
}

// --- SISTEMA DE STATUS (VENENO) ---
function applyStatusDamage(pokemon, events) {
    if (!pokemon.status || pokemon.hp <= 0) return;

    if (pokemon.status.type === 'poison') {
        const dmg = Math.max(1, Math.floor(pokemon.maxHp / 8));
        pokemon.hp -= dmg;
        if (pokemon.hp < 0) pokemon.hp = 0;
        
        pokemon.status.turns--;

        events.push({ 
            type: 'STATUS_DAMAGE', 
            targetId: pokemon.instanceId || 'wild', 
            damage: dmg, 
            newHp: pokemon.hp, 
            status: 'poison',
            text: `${pokemon.name} sofreu pelo veneno!`
        });

        if (pokemon.status.turns <= 0) {
            pokemon.status = null;
            events.push({ type: 'STATUS_END', targetId: pokemon.instanceId || 'wild', text: `O veneno de ${pokemon.name} passou.` });
        }
    }
}

// --- LÓGICA DE AÇÃO/ATAQUE (CORRIGIDA PARA PP) ---
function processAction(attacker, defender, move, logArray) {
    if(!move) { logArray.push({ type: 'MSG', text: `${attacker.name} hesitou!` }); return; }
    
    // VERIFICAÇÃO DE PP (Substitui Energia)
    if (move.pp > 0) {
        move.pp--; // Desconta 1 PP
    } else {
        logArray.push({ type: 'MSG', text: `${attacker.name} não tem PP para ${move.name}!` });
        // Aqui poderia ter o "Struggle" (dano de recuo), mas por enquanto só falha
        return; 
    }
    
    logArray.push({ type: 'USE_MOVE', actorId: attacker.instanceId || 'wild', moveName: move.name, moveIcon: move.icon, moveElement: move.element || 'normal', moveCategory: move.category || 'physical', moveType: move.type });
    
    if(move.type === 'heal') { 
        const oldHp = attacker.hp; 
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + move.power); 
        logArray.push({ type: 'HEAL', actorId: attacker.instanceId || 'wild', amount: attacker.hp - oldHp, newHp: attacker.hp }); 
    } 
    else if (move.type === 'defend') { 
        logArray.push({ type: 'MSG', text: `${attacker.name} se protegeu!` }); 
    } 
    else { 
        // CÁLCULO DE DANO ATUALIZADO (DIVISOR 85 + BÔNUS 1.5x)
        let multiplier = getTypeEffectiveness(move.element, defender.type);
        
        if (multiplier > 1) {
            multiplier = multiplier * 1.5; // Bônus extra para super efetivo
        }

        const level = attacker.level || 1; 
        const atk = attacker.stats.attack; 
        const def = defender.stats.defense;
        const random = (Math.floor(Math.random() * 16) + 85) / 100;
        
        // Fórmula com divisor 85 (mais tank)
        let damage = Math.floor((((2 * level / 5 + 2) * move.power * (atk / def)) / 85 + 2) * multiplier * random);
        
        if (damage < 1) damage = 1; 
        
        defender.hp -= damage; 
        if (defender.hp < 0) defender.hp = 0;
        
        logArray.push({ type: 'ATTACK_HIT', attackerId: attacker.instanceId || 'wild', targetId: defender.instanceId || 'wild', damage, newHp: defender.hp, isEffective: multiplier > 1.5, isNotEffective: multiplier < 1 && multiplier > 0, isBlocked: multiplier === 0 }); 

        // Chance de Veneno (25%)
        if (move.element === 'poison' && !defender.status && defender.hp > 0 && Math.random() < 0.25) {
            defender.status = { type: 'poison', turns: 2 }; 
            logArray.push({ type: 'STATUS_APPLIED', targetId: defender.instanceId || 'wild', status: 'poison', text: `${defender.name} foi envenenado!` });
        }
    }
}

function performEnemyTurn(attacker, defender, events) { 
    // Inimigo escolhe apenas golpes que tenham PP > 0
    const validMoves = attacker.moves.filter(m => m.pp > 0);
    
    if(validMoves.length === 0) {
        events.push({ type: 'MSG', text: `${attacker.name} não tem movimentos!` });
        return;
    }

    const move = validMoves[Math.floor(Math.random() * validMoves.length)]; 
    processAction(attacker, defender, move, events); 
}

// --- FUNÇÃO PARA SALVAR APÓS A BATALHA ---
async function saveBattleResult(userId, p1State) {
    const user = await User.findById(userId);
    if(!user) return;
    
    const poke = user.pokemonTeam.find(p => p._id.toString() === p1State.instanceId);
    if(poke) {
        poke.currentHp = p1State.hp;
        poke.xp = p1State.xp;
        poke.level = p1State.level;
        
        // Recalcula stats se tiver upado
        const base = await BasePokemon.findOne({ id: poke.baseId });
        if(base) poke.stats = calculateStats(base.baseStats, poke.level);
        
        // SALVA OS PPs NO BANCO
        // O `p1State.moves` contém o estado atual dos golpes com o PP gasto
        poke.moves = p1State.moves.map(m => ({ 
            moveId: m.id, 
            pp: m.pp, 
            maxPp: m.maxPp 
        }));
    }
    await user.save();
}


// --- ROTAS (PÁGINAS) ---

app.get('/', async (req, res) => { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: null, skinCount: SKIN_COUNT, starters }); });
app.post('/login', async (req, res) => { const { username, password } = req.body; const user = await User.findOne({ username, password }); if (user) { res.redirect('/lobby?userId=' + user._id); } else { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: 'Credenciais inválidas', skinCount: SKIN_COUNT, starters }); } });

app.post('/register', async (req, res) => { 
    const { username, password, skin, starterId } = req.body; 
    try { 
        let starterTeam = []; 
        if (starterId) { 
            const starter = await BasePokemon.findOne({ id: starterId, isStarter: true }); 
            if (starter) { 
                const initialStats = calculateStats(starter.baseStats, 1); 
                let initialMovesIds = starter.movePool.filter(m => m.level <= 1).map(m => m.moveId); 
                if(initialMovesIds.length === 0) initialMovesIds = ['tackle']; 
                
                // CRIA ESTRUTURA COM PP
                const movesWithPP = initialMovesIds.map(mid => {
                    const lib = MOVES_LIBRARY[mid];
                    return { moveId: mid, pp: lib.maxPp, maxPp: lib.maxPp };
                });

                starterTeam.push({ 
                    baseId: starter.id, 
                    nickname: starter.name, 
                    level: 1, 
                    currentHp: initialStats.hp, 
                    stats: initialStats, 
                    moves: movesWithPP, 
                    learnedMoves: initialMovesIds 
                }); 
            } 
        } 
        const newUser = new User({ username, password, skin, pokemonTeam: starterTeam, pc: [] }); 
        await newUser.save(); 
        res.redirect('/lobby?userId=' + newUser._id); 
    } catch (e) { const starters = await BasePokemon.find({ isStarter: true }).lean(); res.render('login', { error: 'Usuário já existe.', skinCount: SKIN_COUNT, starters }); } 
});

app.get('/lobby', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const teamData = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({id: p.baseId}); if(base) teamData.push(userPokemonToEntity(p, base)); } const allPokes = await BasePokemon.find().lean(); res.render('room', { user, playerName: user.username, playerSkin: user.skin, entities: allPokes, team: teamData, isAdmin: user.isAdmin, skinCount: SKIN_COUNT }); });
app.get('/forest', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user) return res.redirect('/'); const allPokes = await BasePokemon.find().lean(); res.render('forest', { user, playerName: user.username, playerSkin: user.skin, isAdmin: user.isAdmin, skinCount: SKIN_COUNT, entities: allPokes }); });
app.get('/lab', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if(!user || !user.isAdmin) return res.redirect('/'); const pokemons = await BasePokemon.find(); res.render('create', { types: EntityType, moves: MOVES_LIBRARY, pokemons, user }); });

// --- ROTAS ADMIN ---
app.get('/admin', (req, res) => { res.render('admin'); });
app.get('/api/admin/export', async (req, res) => { const pokemons = await BasePokemon.find().lean(); const cleanList = pokemons.map(({ _id, __v, sprite, ...rest }) => rest); res.json(cleanList); });
app.post('/api/admin/import', async (req, res) => { try { const { pokemons } = req.body; if (!Array.isArray(pokemons)) return res.status(400).json({ message: "Formato inválido" }); let count = 0; for (const p of pokemons) { await BasePokemon.findOneAndUpdate({ id: p.id }, p, { upsert: true, new: true }); count++; } res.json({ success: true, message: `${count} monstros atualizados!` }); } catch (e) { res.status(500).json({ message: "Erro: " + e.message }); } });

app.post('/lab/create', upload.single('sprite'), async (req, res) => { 
    const { name, type, hp, energy, atk, def, spd, location, minLvl, maxLvl, catchRate, spawnChance, isStarter, movesJson, evoTarget, evoLevel, existingId } = req.body; 
    const stats = { hp: parseInt(hp), attack: parseInt(atk), defense: parseInt(def), speed: parseInt(spd) }; 
    let movePool = []; try { movePool = JSON.parse(movesJson); } catch(e){} 
    const data = { name, type, baseStats: stats, spawnLocation: location, minSpawnLevel: parseInt(minLvl), maxSpawnLevel: parseInt(maxLvl), catchRate: parseFloat(catchRate), spawnChance: parseFloat(spawnChance) || 10, isStarter: isStarter === 'on', evolution: { targetId: evoTarget, level: parseInt(evoLevel) || 100 }, movePool: movePool }; 
    if(req.file) data.sprite = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`; 
    if(existingId) await BasePokemon.findOneAndUpdate({ id: existingId }, data); else { data.id = Date.now().toString(); await new BasePokemon(data).save(); } 
    res.redirect(req.header('Referer') || '/'); 
});

// --- APIS DO JOGO ---
app.get('/api/pc', async (req, res) => { const { userId } = req.query; const user = await User.findById(userId); if (!user) return res.json({ error: 'User not found' }); const formatList = async (list) => { const output = []; for (let p of list) { const base = await BasePokemon.findOne({ id: p.baseId }); if (base) output.push(userPokemonToEntity(p, base)); } return output; }; const pcList = user.pc || []; const team = await formatList(user.pokemonTeam); const pc = await formatList(pcList); res.json({ team, pc }); });
app.post('/api/pc/move', async (req, res) => { const { userId, pokemonId, from, to } = req.body; const user = await User.findById(userId); if (!user.pc) user.pc = []; const sourceList = from === 'team' ? user.pokemonTeam : user.pc; const destList = to === 'team' ? user.pokemonTeam : user.pc; if (to === 'team' && destList.length >= 6) return res.json({ error: 'Equipe cheia' }); if (from === 'team' && sourceList.length <= 1) return res.json({ error: 'Não pode ficar sem pokémon' }); const index = sourceList.findIndex(p => p._id.toString() === pokemonId); if (index === -1) return res.json({ error: 'Erro' }); const [poke] = sourceList.splice(index, 1); destList.push(poke); await user.save(); res.json({ success: true }); });
app.get('/api/me', async (req, res) => { const { userId } = req.query; if(!userId) return res.status(400).json({ error: 'No ID' }); const user = await User.findById(userId); if(!user) return res.status(404).json({ error: 'User not found' }); const teamWithSprites = []; for(let p of user.pokemonTeam) { const base = await BasePokemon.findOne({ id: p.baseId }); const nextXp = getXpForNextLevel(p.level); const allLearned = p.learnedMoves && p.learnedMoves.length > 0 ? p.learnedMoves : p.moves.map(m=>m.moveId); teamWithSprites.push({ instanceId: p._id, name: p.nickname, level: p.level, hp: p.currentHp, maxHp: p.stats.hp, xp: p.xp, xpToNext: nextXp, sprite: base ? base.sprite : '', moves: p.moves.map(m=>m.moveId), learnedMoves: allLearned }); } res.json({ team: teamWithSprites, allMoves: MOVES_LIBRARY, money: user.money || 0, pokeballs: user.pokeballs || 0, rareCandy: user.rareCandy || 0 }); });
app.get('/api/pokedex', async (req, res) => { const { userId } = req.query; if (!userId) return res.status(400).json({ error: 'userId required' }); try { const user = await User.findById(userId); if (!user) return res.status(404).json({ error: 'User not found' }); const seen = new Set(); const addFromList = (list) => { if (!list) return; for (const p of list) { if (p && p.baseId) seen.add(String(p.baseId).toLowerCase()); } }; addFromList(user.pokemonTeam); addFromList(user.pc); return res.json({ list: Array.from(seen) }); } catch (e) { return res.status(500).json({ error: 'internal' }); } });

// HEAL (Restaura HP e PP)
app.post('/api/heal', async (req, res) => { 
    const { userId } = req.body; const user = await User.findById(userId); 
    if (!user) return res.status(404).json({ error: 'Erro' }); 
    let count = 0; 
    for (let p of user.pokemonTeam) { 
        const base = await BasePokemon.findOne({ id: p.baseId }); 
        if (base) { 
            p.stats = calculateStats(base.baseStats, p.level); 
            p.currentHp = p.stats.hp; 
            // Restaura PP
            p.moves.forEach(m => {
                const lib = MOVES_LIBRARY[m.moveId];
                if(lib) m.pp = lib.maxPp;
            });
            count++; 
        } 
    } 
    await user.save(); res.json({ success: true, message: `${count} Curados!` }); 
});

app.post('/api/equip-move', async (req, res) => { 
    const { userId, pokemonId, moves } = req.body; 
    const user = await User.findById(userId); 
    const poke = user.pokemonTeam.id(pokemonId); 
    if(!poke) return res.json({error: "Erro"}); 
    
    // Converte IDs para Objetos com PP cheio
    poke.moves = moves.map(mid => {
        const lib = MOVES_LIBRARY[mid];
        return { moveId: mid, pp: lib.maxPp, maxPp: lib.maxPp };
    });
    
    await user.save(); res.json({success: true}); 
});

app.post('/api/set-lead', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if (index > 0) { const poke = user.pokemonTeam.splice(index, 1)[0]; user.pokemonTeam.unshift(poke); await user.save(); res.json({success: true}); } else { res.json({success: true}); } });
app.post('/api/abandon-pokemon', async (req, res) => { const { userId, pokemonId } = req.body; const user = await User.findById(userId); if(user.pokemonTeam.length <= 1) return res.json({ error: 'Não pode' }); const index = user.pokemonTeam.findIndex(p => p._id.toString() === pokemonId); if(index === -1) return res.json({ error: 'Erro' }); user.pokemonTeam.splice(index, 1); await user.save(); res.json({ success: true }); });
app.post('/api/buy-item', async (req, res) => { const { userId, itemId, qty } = req.body; const q = Math.max(1, parseInt(qty) || 1); const prices = { pokeball: 50, rareCandy: 2000 }; const cost = prices[itemId] * q; const user = await User.findById(userId); if((user.money || 0) < cost) return res.json({ error: 'Saldo insuficiente' }); user.money -= cost; if(itemId === 'pokeball') user.pokeballs = (user.pokeballs || 0) + q; if(itemId === 'rareCandy') user.rareCandy = (user.rareCandy || 0) + q; await user.save(); res.json({ success: true, money: user.money, pokeballs: user.pokeballs, rareCandy: user.rareCandy }); });

app.post('/api/use-item', async (req, res) => { 
    const { userId, itemId, pokemonId, qty } = req.body; const q = Math.max(1, parseInt(qty) || 1); const user = await User.findById(userId); 
    if(itemId === 'rareCandy') { 
        let poke = user.pokemonTeam.id(pokemonId); 
        if((user.rareCandy || 0) < q) return res.json({ error: 'Sem doces' }); 
        poke.level = Math.min(100, poke.level + q); user.rareCandy -= q; 
        
        let base = await BasePokemon.findOne({ id: poke.baseId }); let evolved = false;
        if (base) {
            if (base.movePool) { 
                const newMove = base.movePool.find(m => m.level === poke.level); 
                if (newMove) { 
                    if (!poke.learnedMoves) poke.learnedMoves = [...poke.moves.map(x=>x.moveId)]; 
                    if (!poke.learnedMoves.includes(newMove.moveId)) { 
                        poke.learnedMoves.push(newMove.moveId); 
                        if(poke.moves.length < 4) { 
                             const lib = MOVES_LIBRARY[newMove.moveId]; 
                             poke.moves.push({moveId: newMove.moveId, pp: lib.maxPp, maxPp: lib.maxPp}); 
                        } 
                    } 
                } 
            }
            if (base.evolution && poke.level >= base.evolution.level) { 
                const nextPoke = await BasePokemon.findOne({ id: base.evolution.targetId }); 
                if (nextPoke) { poke.baseId = nextPoke.id; poke.nickname = nextPoke.name; base = nextPoke; evolved = true; } 
            }
            poke.stats = calculateStats(base.baseStats, poke.level); poke.currentHp = poke.stats.hp; 
        }
        await user.save(); return res.json({ success: true, rareCandy: user.rareCandy, evolved: evolved, pokemon: { instanceId: poke._id, level: poke.level, hp: poke.currentHp, name: poke.nickname } }); 
    } 
    return res.json({ error: 'Item invalido' }); 
});


// --- BATALHAS ---

app.post('/battle/wild', async (req, res) => { 
    const { userId } = req.body; const user = await User.findById(userId); const userPokeData = user.pokemonTeam.find(p => p.currentHp > 0) || user.pokemonTeam[0]; if(!userPokeData || userPokeData.currentHp <= 0) return res.json({ error: "Todos desmaiados!" }); const possibleSpawns = await BasePokemon.find({ spawnLocation: 'forest' }); if(possibleSpawns.length === 0) return res.json({ error: "Nada aqui." }); const wildBase = pickWeightedPokemon(possibleSpawns); const wildLevel = Math.floor(Math.random() * (wildBase.maxSpawnLevel - wildBase.minSpawnLevel + 1)) + wildBase.minSpawnLevel; const wildEntity = await createBattleInstance(wildBase.id, wildLevel); const userBase = await BasePokemon.findOne({ id: userPokeData.baseId }); const userEntity = userPokemonToEntity(userPokeData, userBase); userEntity.playerName = user.username; userEntity.skin = user.skin; const battleId = `wild_${Date.now()}`; activeBattles[battleId] = { p1: userEntity, p2: wildEntity, type: 'wild', userId: user._id, turn: 1 }; res.json({ battleId }); 
});

app.post('/battle', async (req, res) => { 
    const { fighterId, playerName, playerSkin, userId } = req.body; const user = await User.findById(userId); 
    const userPokeData = user.pokemonTeam.id(fighterId); if(!userPokeData || userPokeData.currentHp <= 0) return res.redirect('/lobby?userId=' + userId); 
    const b1Base = await BasePokemon.findOne({ id: userPokeData.baseId }); const p1 = userPokemonToEntity(userPokeData, b1Base); p1.playerName = playerName; p1.skin = playerSkin; 
    const allBases = await BasePokemon.find(); const randomBase = allBases[Math.floor(Math.random() * allBases.length)]; const cpuLevel = Math.max(1, p1.level + (Math.random() > 0.5 ? 1 : -1)); const wildEntity = await createBattleInstance(randomBase.id, cpuLevel); 
    const p2 = { ...wildEntity, playerName: 'CPU', skin: 'char2', instanceId: 'cpu_' + Date.now() }; 
    const battleId = 'local_' + Date.now(); activeBattles[battleId] = { p1, p2, type: 'local', userId, turn: 1 }; res.redirect('/battle/' + battleId); 
});

app.post('/battle/online', (req, res) => { res.set('Cache-Control', 'no-store'); const { roomId, meData, opponentData } = req.body; if (!onlineBattles[roomId]) return res.redirect('/'); const me = JSON.parse(meData); const op = JSON.parse(opponentData); res.render('battle', { p1: me, p2: op, battleMode: 'online', battleId: roomId, myRoleId: me.id, realUserId: me.userId, playerName: me.playerName, playerSkin: me.skin, isSpectator: false, bgImage: 'battle_bg.png', battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable: [] }); });

app.get('/battle/:id', async (req, res) => { res.set('Cache-Control', 'no-store'); const battle = activeBattles[req.params.id]; if(!battle) return res.redirect('/'); let switchable = []; if (battle.userId) { const user = await User.findById(battle.userId); if (user) { for (let p of user.pokemonTeam) { if (p._id.toString() !== battle.p1.instanceId && p.currentHp > 0) { const b = await BasePokemon.findOne({ id: p.baseId }); if(b) switchable.push(userPokemonToEntity(p, b)); } } } } const bg = battle.type === 'wild' ? 'forest_bg.png' : 'battle_bg.png'; res.render('battle', { p1: battle.p1, p2: battle.p2, battleId: req.params.id, battleMode: battle.type === 'local' ? 'manual' : battle.type, isSpectator: false, myRoleId: battle.p1.instanceId, realUserId: battle.userId, playerName: battle.p1.playerName, playerSkin: battle.p1.skin, bgImage: bg, battleData: JSON.stringify({ log: [{type: 'INIT'}] }), switchable }); });

// --- PROCESSAMENTO DE TURNO ---
app.post('/api/turn', async (req, res) => {
    const { battleId, action, moveId, isForced } = req.body; 
    const battle = activeBattles[battleId];
    if(!battle) { return res.json({ finished: true }); }
    
    let p1 = battle.p1; const p2 = battle.p2; const events = [];
    let threwPokeball = false;

    if (action === 'switch') {
        const user = await User.findById(battle.userId);
        if (!isForced) { const prevPoke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId); if(prevPoke) { prevPoke.currentHp = p1.hp; } }
        const newPokeData = user.pokemonTeam.find(p => p._id.toString() === moveId); 
        const base = await BasePokemon.findOne({ id: newPokeData.baseId });
        const newEntity = userPokemonToEntity(newPokeData, base); newEntity.playerName = p1.playerName; newEntity.skin = p1.skin;
        battle.p1 = newEntity; p1 = battle.p1; await user.save();
        events.push({ type: 'MSG', text: `Vai, ${p1.name}!` });
        events.push({ type: 'SWITCH_ANIM', side: 'p1', newSprite: p1.sprite, newHp: p1.hp, maxHp: p1.maxHp, newName: p1.name, newLevel: p1.level, newId: p1.instanceId, moves: p1.moves });
        if (p2.hp > 0 && !isForced) { performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); }
        await saveBattleResult(battle.userId, p1);
        return res.json({ events, switched: true, newP1Id: p1.instanceId, p1State: p1 });
    }

    if (action === 'catch') {
        if (battle.type !== 'wild') return res.json({ events });
        const user = await User.findById(battle.userId);
        if((user.pokeballs||0) <= 0) { events.push({type:'MSG', text:'Sem CatchCubes!'}); return res.json({events}); }
        user.pokeballs--; threwPokeball = true;
        const hpPct = p2.hp / p2.maxHp; const statusBonus = p2.status ? 0.2 : 0;
        if (Math.random() < ((p2.catchRate * (1 - hpPercent)) + 0.15 + statusBonus)) {
            const newStats = calculateStats(p2.stats, p2.level);
            // Salva moves com PP cheio no banco
            const movesForDb = p2.moves.map(m => ({ moveId: m.id, pp: m.maxPp, maxPp: m.maxPp }));
            const newPoke = { baseId: p2.baseId, nickname: p2.name, level: p2.level, currentHp: newStats.hp, stats: newStats, moves: movesForDb, learnedMoves: p2.moves.map(m=>m.id) };
            let sentToPC = false;
            if(user.pokemonTeam.length < 6) user.pokemonTeam.push(newPoke); else { user.pc.push(newPoke); sentToPC = true; }
            await user.save(); await saveBattleResult(battle.userId, p1); delete activeBattles[battleId];
            return res.json({ events, finished: true, win: true, captured: true, sentToPC, threw: true });
        }
        await user.save(); events.push({ type: 'MSG', text: `${p2.name} escapou!` });
        performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events);
    }
    else if (action === 'run') {
        if(Math.random() > 0.4) { delete activeBattles[battleId]; return res.json({ events: [{type:'MSG', text:'Fugiu!'}], finished: true, fled: true }); }
        else { events.push({ type: 'MSG', text: 'Falha ao fugir!' }); performEnemyTurn(p2, p1, events); applyStatusDamage(p1, events); applyStatusDamage(p2, events); }
    }
    else if (action === 'move') {
        const p1Move = p1.moves.find(m => m.id === moveId);
        if (p1.stats.speed >= p2.stats.speed) { processAction(p1, p2, p1Move, events); if(p2.hp > 0) performEnemyTurn(p2, p1, events); }
        else { performEnemyTurn(p2, p1, events); if(p1.hp > 0) processAction(p1, p2, p1Move, events); }
        if (p1.hp > 0) applyStatusDamage(p1, events); if (p2.hp > 0) applyStatusDamage(p2, events);
    }

    if (p1.hp <= 0) { 
        await saveBattleResult(battle.userId, p1);
        const user = await User.findById(battle.userId);
        const hasAlive = user.pokemonTeam.some(p => p.currentHp > 0);
        if(hasAlive) {
            events.push({ type: 'MSG', text: `${p1.name} desmaiou!` });
            let switchable = []; for(let p of user.pokemonTeam) { if(p.currentHp > 0) { const b = await BasePokemon.findOne({id:p.baseId}); switchable.push(userPokemonToEntity(p, b)); } }
            return res.json({ events, forceSwitch: true, switchable });
        }
        delete activeBattles[battleId]; return res.json({ events, finished: true, win: false, threw: threwPokeball });
    }
    if (p2.hp <= 0) {
        let xpGained = battle.type === 'wild' ? (p2.xpYield || 20) : 30;
        events.push({ type: 'MSG', text: `Ganhou ${xpGained} XP!` });
        const user = await User.findById(battle.userId);
        let poke = user.pokemonTeam.find(p => p._id.toString() === p1.instanceId);
        if(poke) {
            poke.xp += xpGained; const xpNext = getXpForNextLevel(poke.level);
            if (poke.xp >= xpNext && poke.level < 100) {
                poke.level++; poke.xp = 0; events.push({ type: 'MSG', text: `Subiu para o nível ${poke.level}!` });
                const base = await BasePokemon.findOne({ id: poke.baseId });
                poke.stats = calculateStats(base.baseStats, poke.level); poke.currentHp = p1.hp;
                const newMove = base.movePool.find(m => m.level === poke.level);
                if (newMove && !poke.learnedMoves.includes(newMove.moveId)) {
                    poke.learnedMoves.push(newMove.moveId); events.push({ type: 'MSG', text: `Aprendeu ${MOVES_LIBRARY[newMove.moveId].name}!` });
                    if(poke.moves.length < 4) { const lib = MOVES_LIBRARY[newMove.moveId]; poke.moves.push({moveId: newMove.moveId, pp: lib.maxPp, maxPp: lib.maxPp}); }
                }
                if (base.evolution && poke.level >= base.evolution.level) {
                     const next = await BasePokemon.findOne({id: base.evolution.targetId});
                     if(next) { poke.baseId = next.id; poke.nickname = next.name; events.push({ type: 'MSG', text: `Evoluiu para ${next.name}!` }); }
                }
            }
            poke.currentHp = p1.hp;
            // Salva PPs
            poke.moves = p1.moves.map(m => ({ moveId: m.id, pp: m.pp, maxPp: m.maxPp }));
            await user.save();
            if (battle.type === 'local') { user.money += 15; await user.save(); events.push({type:'MSG', text:'Ganhou $15'}); }
        }
        delete activeBattles[battleId]; return res.json({ events, finished: true, win: true, threw: threwPokeball });
    }
    
    await saveBattleResult(battle.userId, p1);
    return res.json({ events, p1State: p1, p2State: { hp: p2.hp }, threw: threwPokeball });
});

// --- SOCKET IO ---
io.on('connection', (socket) => {
    socket.on('join_room', (r) => socket.join(r));
    socket.on('enter_map', (d) => { socket.join(d.map); players[socket.id] = { id: socket.id, ...d, x: 50, y: 50 }; socket.emit('map_state', Object.values(players).filter(p=>p.map===d.map)); socket.to(d.map).emit('player_joined', players[socket.id]); });
    socket.on('move_player', (d) => { if(players[socket.id]) { players[socket.id].x = d.x; players[socket.id].y = d.y; players[socket.id].direction = d.direction; io.to(players[socket.id].map).emit('player_moved', { id: socket.id, ...d }); } });
    socket.on('send_chat', (d) => { const p = players[socket.id]; if(p) io.to(p.map).emit('chat_message', { id: socket.id, msg: d.msg }); });
    socket.on('disconnect', () => { if(players[socket.id]) { io.to(players[socket.id].map).emit('player_left', socket.id); delete players[socket.id]; } matchmakingQueue = matchmakingQueue.filter(u => u.socket.id !== socket.id); });
    
    socket.on('find_match', async (fid, uid, name, skin, bet) => {
        if(matchmakingQueue.find(u => u.socket.id === socket.id)) return;
        const user = await User.findById(uid);
        const pData = user.pokemonTeam.id(fid);
        if(!pData || pData.currentHp <= 0) return socket.emit('search_error', 'Pokemon invalido');
        const base = await BasePokemon.findOne({ id: pData.baseId });
        const entity = userPokemonToEntity(pData, base); entity.userId = uid; entity.id = socket.id; entity.playerName = name; entity.skin = skin;
        matchmakingQueue.push({ socket, entity, bet: Number(bet), userId: uid });
        
        if (matchmakingQueue.length >= 2) {
             const p1 = matchmakingQueue.shift(); const p2 = matchmakingQueue.shift();
             const roomId = `room_${Date.now()}`;
             onlineBattles[roomId] = { p1: p1.entity, p2: p2.entity, turn: 1, bet: Math.min(p1.bet, p2.bet) };
             p1.socket.emit('match_found', { roomId, me: p1.entity, opponent: p2.entity });
             p2.socket.emit('match_found', { roomId, me: p2.entity, opponent: p1.entity });
        }
    });

    socket.on('online_action', async ({ roomId, action, value, playerId }) => {
        const battle = onlineBattles[roomId]; if(!battle || battle.processing) return;
        const isP1 = String(playerId) === String(battle.p1.id);
        const actor = isP1 ? battle.p1 : battle.p2; const opponent = isP1 ? battle.p2 : battle.p1;
        
        if (action === 'forfeit') {
            const events = [{ type: 'MSG', text: `${actor.playerName} desistiu!` }];
            io.to(roomId).emit('turn_result', { events, winnerId: opponent.id });
            delete onlineBattles[roomId]; return;
        }

        if (action === 'switch') {
             const user = await User.findById(actor.userId);
             const newPoke = user.pokemonTeam.find(p => p._id.toString() === value);
             if(newPoke && newPoke.currentHp > 0) { 
                 actor.nextAction = { type: 'switch', data: newPoke }; 
                 actor.ready = true; 
             }
        } else if (action === 'move') {
             if (value === 'rest') actor.nextAction = { type: 'rest' };
             else { 
                 const m = actor.moves.find(x => x.id === value); 
                 if(m && m.pp > 0) { m.pp--; actor.nextAction = { type: 'move', move: m }; } 
                 else return; // Sem PP, ignora
             }
             if(actor.nextAction) actor.ready = true;
        }

        if (battle.p1.ready && battle.p2.ready) {
            battle.processing = true; const events = [];
            
            const execute = async (act, opp, p1Side) => {
                if (act.nextAction.type === 'switch') {
                    const base = await BasePokemon.findOne({ id: act.nextAction.data.baseId });
                    const newEnt = userPokemonToEntity(act.nextAction.data, base);
                    newEnt.userId = act.userId; newEnt.id = act.id; newEnt.playerName = act.playerName; newEnt.skin = act.skin;
                    if(p1Side) battle.p1 = newEnt; else battle.p2 = newEnt;
                    events.push({ type: 'MSG', text: `${act.playerName} trocou!` });
                    events.push({ type: 'SWITCH_ANIM', side: p1Side ? 'p1' : 'p2', newSprite: newEnt.sprite, newHp: newEnt.hp, maxHp: newEnt.maxHp, newName: newEnt.name, newLevel: newEnt.level, newId: newEnt.instanceId, moves: newEnt.moves });
                    return newEnt;
                }
                if (act.nextAction.type === 'move') processAction(act, opp, act.nextAction.move, events);
                return act;
            };

            let a1 = battle.p1; let a2 = battle.p2;
            if(battle.p1.nextAction.type === 'switch') a1 = await execute(battle.p1, battle.p2, true);
            if(battle.p2.nextAction.type === 'switch') a2 = await execute(battle.p2, a1, false);

            if (battle.p1.nextAction.type !== 'switch' && battle.p2.nextAction.type !== 'switch') {
                 if (a1.stats.speed >= a2.stats.speed) { await execute(a1, a2, true); if(a2.hp > 0) await execute(a2, a1, false); }
                 else { await execute(a2, a1, false); if(a1.hp > 0) await execute(a1, a2, true); }
            } else {
                 if(battle.p1.nextAction.type === 'move' && a1.hp > 0) await execute(a1, a2, true);
                 if(battle.p2.nextAction.type === 'move' && a2.hp > 0) await execute(a2, a1, false);
            }
            
            if(a1.hp > 0) applyStatusDamage(a1, events);
            if(a2.hp > 0) applyStatusDamage(a2, events);

            battle.p1.ready = false; battle.p2.ready = false; delete battle.p1.nextAction; delete battle.p2.nextAction; battle.processing = false;

            let winId = null;
            if (battle.p1.hp <= 0) winId = battle.p2.id; else if (battle.p2.hp <= 0) winId = battle.p1.id;

            if (winId) {
                if (battle.bet > 0) {
                     const wUser = await User.findById(winId === battle.p1.id ? battle.p1.userId : battle.p2.userId);
                     const lUser = await User.findById(winId === battle.p1.id ? battle.p2.userId : battle.p1.userId);
                     lUser.money = Math.max(0, lUser.money - battle.bet); wUser.money += battle.bet;
                     await lUser.save(); await wUser.save();
                     events.push({type:'MSG', text:`Aposta: ${battle.bet} moedas transferidas!`});
                }
                delete onlineBattles[roomId];
            }
            io.to(roomId).emit('turn_result', { events, winnerId: winId });
        }
    });
});

seedDatabase().then(() => { const PORT = process.env.PORT || 3000; server.listen(PORT, () => console.log(`Server ON Port ${PORT}`)); });
