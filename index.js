const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const multer = require('multer');
const fs = require('fs');

// IMPORTA OS DADOS (Agora com a tabela balanceada)
const { EntityType, MoveType, EffectType, TypeChart, MOVES_LIBRARY } = require('./gameData');

const app = express();

// =====================
// BANCO DE DADOS & UPLOAD
// =====================
const DB_FILE = path.join(__dirname, 'database.json');
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const dir = 'public/uploads/';
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage: storage });

function readDB() {
    if (!fs.existsSync(DB_FILE)) { fs.writeFileSync(DB_FILE, JSON.stringify([])); return []; }
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8')); } catch (e) { return []; }
}
function saveDB(data) { fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2)); }

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

const activeBattles = {};

// =====================
// CLASSE ENTIDADE
// =====================
class Entity {
    constructor(data) {
        this.id = data.id;
        this.name = data.name || "Sem Nome";
        this.type = data.type || EntityType.NORMAL;
        
        this.maxHp = parseInt(data.maxHp || data.hp || 100);
        this.hp = parseInt(data.hp || 100);
        this.maxEnergy = parseInt(data.maxEnergy || data.energy || 50);
        this.energy = parseInt(data.energy || 50);

        const statsSource = data.stats || data; 
        this.stats = { 
            attack: parseInt(statsSource.attack || 10), 
            defense: parseInt(statsSource.defense || 5), 
            speed: parseInt(statsSource.speed || 5) 
        };

        this.effects = []; 
        this.sprite = data.sprite; 
        this.isDefending = false;

        const movesList = data.moves || [];
        this.moves = movesList.map(m => {
            if(m && m.id && MOVES_LIBRARY[m.id]) {
                return { ...MOVES_LIBRARY[m.id], id: m.id };
            }
            if(m && m.name) {
                const libKey = Object.keys(MOVES_LIBRARY).find(k => MOVES_LIBRARY[k].name === m.name);
                if(libKey) return { ...MOVES_LIBRARY[libKey], id: libKey };
            }
            return { ...MOVES_LIBRARY['tackle'], id: 'tackle' };
        });

        if(this.moves.length === 0) this.moves.push({ ...MOVES_LIBRARY['tackle'], id: 'tackle' });
    }
}

// =====================
// MOTOR DE BATALHA
// =====================

function processAction(attacker, defender, move, logArray) {
    attacker.isDefending = false; 
    attacker.energy -= move.cost;

    logArray.push({
        type: 'USE_MOVE', actorId: attacker.id, moveName: move.name, moveIcon: move.icon || '⚡', moveType: move.type, cost: move.cost, newEnergy: attacker.energy
    });

    if (move.type === MoveType.DEFEND) {
        attacker.isDefending = true;
        logArray.push({ type: 'DEFEND', actorId: attacker.id });
    } 
    else if (move.type === MoveType.HEAL) {
        const oldHp = attacker.hp;
        attacker.hp = Math.min(attacker.maxHp, attacker.hp + move.power);
        logArray.push({ type: 'HEAL', actorId: attacker.id, amount: attacker.hp - oldHp, newHp: attacker.hp });
    } 
    else if (move.type === MoveType.ATTACK) {
        // --- CÁLCULO DE DANO (COM NEUTRO) ---
        let multiplier = 1; // Padrão Neutro
        const atkType = move.element || EntityType.NORMAL;
        const defType = defender.type;

        // Só altera se estiver explicitamente definido na tabela
        if (TypeChart[atkType] && TypeChart[atkType][defType] !== undefined) {
            multiplier = TypeChart[atkType][defType];
        }

        // STAB (Bônus fixo, não stacka)
        let stab = (attacker.type === atkType) ? 1.25 : 1;

        let damage = (move.power + attacker.stats.attack) - defender.stats.defense;
        if (damage < 1) damage = 1;
        
        let blocked = false;
        if (defender.isDefending) { 
            damage = Math.floor(damage / 2); 
            blocked = true; 
        }
        
        damage = Math.floor(damage * multiplier * stab);
        defender.hp -= damage;

        if (move.effect) {
            const existing = defender.effects.find(e => e.name === move.effect.name);
            if(existing) existing.duration = move.effect.duration;
            else defender.effects.push({ ...move.effect });
        }

        logArray.push({
            type: 'ATTACK_HIT', 
            attackerId: attacker.id, 
            targetId: defender.id, 
            damage: damage, 
            newHp: defender.hp,
            isEffective: multiplier > 1,
            isNotEffective: multiplier < 1 && multiplier > 0, // 0.5
            isImmune: multiplier === 0, // 0
            isBlocked: blocked
        });
    }
}

function processStartTurn(entity, logArray) {
    entity.effects.forEach(eff => {
        if(eff.type === EffectType.DOT) {
            entity.hp -= eff.value;
            logArray.push({ type: 'EFFECT_TICK', targetId: entity.id, damage: eff.value, effectName: eff.name, newHp: entity.hp });
        }
        eff.duration--;
    });
    entity.effects = entity.effects.filter(e => e.duration > 0);
    
    if(entity.hp > 0 && entity.energy < entity.maxEnergy) {
        entity.energy += 1;
    }
}

function duelAutomatic(entityA, entityB) {
    const events = [];
    events.push({ type: 'INIT' });

    let attacker = entityA.stats.speed >= entityB.stats.speed ? entityA : entityB;
    let defender = attacker === entityA ? entityB : entityA;
    let turnCount = 0;

    while (entityA.hp > 0 && entityB.hp > 0 && turnCount < 50) {
        turnCount++;
        processStartTurn(attacker, events);
        if(attacker.hp <= 0) break;

        let possibleMoves = attacker.moves.filter(m => attacker.energy >= m.cost);
        if (attacker.hp >= attacker.maxHp) possibleMoves = possibleMoves.filter(m => m.type !== MoveType.HEAL);
        let move = possibleMoves.length > 0 ? possibleMoves[Math.floor(Math.random() * possibleMoves.length)] : null;

        if (!move) {
            attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + 5);
            attacker.isDefending = false;
            events.push({ type: 'REST', actorId: attacker.id, newEnergy: attacker.energy });
        } else {
            processAction(attacker, defender, move, events);
        }

        if (defender.hp <= 0) break;
        [attacker, defender] = [defender, attacker];
    }
    
    let winner = null;
    if (entityA.hp > 0 && entityB.hp <= 0) winner = entityA;
    else if (entityB.hp > 0 && entityA.hp <= 0) winner = entityB;

    return { winnerId: winner ? winner.id : null, log: events };
}

// =====================
// ROTAS
// =====================

app.get('/', (req, res) => { 
    const rawList = readDB();
    const entities = rawList.map(data => new Entity(data));
    res.render('home', { entities: entities }); 
});

app.get('/create', (req, res) => { res.render('create', { types: EntityType, moves: MOVES_LIBRARY }); });

app.post('/create', upload.single('sprite'), (req, res) => {
    const { name, type, hp, energy, attack, defense, speed, selectedMoves } = req.body;
    const movesKeys = [].concat(selectedMoves || []);
    
    const finalMoves = movesKeys.map(k => {
        return MOVES_LIBRARY[k] ? { ...MOVES_LIBRARY[k], id: k } : null;
    }).filter(Boolean);

    if(finalMoves.length === 0) finalMoves.push({ ...MOVES_LIBRARY['tackle'], id: 'tackle' });

    const newEntity = {
        id: Date.now().toString(), name, type, hp, energy, 
        stats: { attack, defense, speed }, 
        moves: finalMoves, sprite: req.file ? req.file.filename : null
    };
    const entities = readDB(); entities.push(newEntity); saveDB(entities);
    res.redirect('/');
});

app.post('/battle', (req, res) => {
    const { fighter1, fighter2, mode } = req.body;
    const entities = readDB();
    const e1 = entities.find(e => e.id == fighter1);
    const e2 = entities.find(e => e.id == fighter2);

    if (!e1 || !e2) return res.redirect('/');

    try {
        const entityA = new Entity(e1);
        const entityB = new Entity(e2);

        entityA.id = 'p1_' + entityA.id;
        entityB.id = 'p2_' + entityB.id;

        if (mode === 'manual') {
            const battleId = Date.now().toString();
            activeBattles[battleId] = { p1: entityA, p2: entityB };
            
            res.render('battle', { 
                p1: entityA, p2: entityB, 
                battleMode: 'manual', battleId: battleId,
                battleData: JSON.stringify({ log: [{type: 'INIT'}] }) 
            });
        } else {
            const simP1 = new Entity(e1); simP1.id = entityA.id;
            const simP2 = new Entity(e2); simP2.id = entityB.id;

            const result = duelAutomatic(simP1, simP2);
            
            res.render('battle', { 
                p1: entityA, p2: entityB, 
                battleMode: 'auto', battleId: null,
                battleData: JSON.stringify(result) 
            });
        }
    } catch (err) {
        console.error("Erro batalha:", err);
        res.redirect('/');
    }
});

app.post('/api/turn', (req, res) => {
    const { battleId, moveId } = req.body;
    const battle = activeBattles[battleId];
    if(!battle) return res.status(404).json({ error: 'Batalha expirou' });

    const p1 = battle.p1;
    const p2 = battle.p2;
    const events = [];

    processStartTurn(p1, events);
    processStartTurn(p2, events);

    if(p1.hp <= 0 || p2.hp <= 0) {
         let winner = p1.hp > 0 ? p1 : (p2.hp > 0 ? p2 : null);
         return res.json({ events, winnerId: winner ? winner.id : 'draw' });
    }

    let p1Move = null;
    if(moveId !== 'rest') p1Move = p1.moves.find(m => m.id === moveId);
    if(p1Move && p1.energy < p1Move.cost) p1Move = null;

    let possibleMovesP2 = p2.moves.filter(m => p2.energy >= m.cost);
    if(p2.hp >= p2.maxHp) possibleMovesP2 = possibleMovesP2.filter(m => m.type !== MoveType.HEAL);
    let p2Move = possibleMovesP2.length > 0 ? possibleMovesP2[Math.floor(Math.random() * possibleMovesP2.length)] : null;

    let first, second;
    if(p1.stats.speed >= p2.stats.speed) { first = { actor: p1, target: p2, move: p1Move }; second = { actor: p2, target: p1, move: p2Move }; } 
    else { first = { actor: p2, target: p1, move: p2Move }; second = { actor: p1, target: p2, move: p1Move }; }

    if(!first.move) {
        first.actor.energy = Math.min(first.actor.maxEnergy, first.actor.energy + 5);
        first.actor.isDefending = false;
        events.push({ type: 'REST', actorId: first.actor.id, newEnergy: first.actor.energy });
    } else {
        processAction(first.actor, first.target, first.move, events);
    }

    if(second.actor.hp > 0 && second.target.hp > 0) {
        if(!second.move) {
            second.actor.energy = Math.min(second.actor.maxEnergy, second.actor.energy + 5);
            second.actor.isDefending = false;
            events.push({ type: 'REST', actorId: second.actor.id, newEnergy: second.actor.energy });
        } else {
            processAction(second.actor, second.target, second.move, events);
        }
    }

    let winnerId = null;
    if (p1.hp <= 0 || p2.hp <= 0) {
        winnerId = p1.hp > 0 ? p1.id : p2.id;
        delete activeBattles[battleId]; 
    }

    res.json({ events, winnerId });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));