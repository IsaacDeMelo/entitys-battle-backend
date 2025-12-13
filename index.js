const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.json());

// =====================
// DEFINIÇÕES
// =====================
const EntityType = {
    FIRE: 'fire', WATER: 'water', PLANT: 'plant',
    GHOST: 'ghost', FIGHTER: 'fighter', DARK: 'dark'
};

const MoveType = { ATTACK: 'attack', HEAL: 'heal', DEFEND: 'defend' };
const EffectType = { DOT: 'dot' }; 

const TypeChart = {
    [EntityType.FIRE]: EntityType.PLANT,
    [EntityType.PLANT]: EntityType.WATER,
    [EntityType.WATER]: EntityType.FIRE,
    [EntityType.GHOST]: EntityType.FIGHTER,
    [EntityType.FIGHTER]: EntityType.DARK,
    [EntityType.DARK]: EntityType.GHOST
};

const MOVES_LIBRARY = {
    'smash': { name: 'Smash', type: MoveType.ATTACK, power: 5, cost: 2, icon: '👊' },
    'fireball': { name: 'Fireball', type: MoveType.ATTACK, power: 8, cost: 4, icon: '🔥' },
    'hydro_pump': { name: 'Hydro Pump', type: MoveType.ATTACK, power: 9, cost: 5, icon: '💧' },
    'vine_whip': { name: 'Vine Whip', type: MoveType.ATTACK, power: 7, cost: 3, icon: '🍃' },
    'shadow_ball': { name: 'Shadow Ball', type: MoveType.ATTACK, power: 10, cost: 6, icon: '🟣' },
    'quick_heal': { name: 'Quick Heal', type: MoveType.HEAL, power: 5, cost: 3, icon: '💚' },
    'mega_heal': { name: 'Mega Heal', type: MoveType.HEAL, power: 15, cost: 6, icon: '🧪' },
    'iron_defense': { name: 'Iron Defense', type: MoveType.DEFEND, power: 0, cost: 2, icon: '🛡️' },
    'poison_jab': { 
        name: 'Poison Jab', type: MoveType.ATTACK, power: 3, cost: 3, icon: '☠️',
        effect: { name: 'Poison', type: EffectType.DOT, duration: 3, value: 3 }
    },
    'ultimate': { name: 'Hyper Beam', type: MoveType.ATTACK, power: 20, cost: 10, icon: '💥' }
};

class Entity {
    constructor({ id, name, type, hp, energy, attack, defense, speed, moves }) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.maxHp = parseInt(hp);
        this.hp = parseInt(hp);
        this.maxEnergy = parseInt(energy);
        this.energy = parseInt(energy);
        this.stats = { 
            attack: parseInt(attack), 
            defense: parseInt(defense), 
            speed: parseInt(speed) 
        };
        this.effects = []; 
        this.moves = moves; 
        this.isDefending = false;
    }
}

// =====================
// MOTOR DE BATALHA MODIFICADO (Gera JSON)
// =====================
function duel(entityA, entityB) {
    const events = []; // Lista de eventos para o frontend reproduzir
    
    let attacker = entityA.stats.speed >= entityB.stats.speed ? entityA : entityB;
    let defender = attacker === entityA ? entityB : entityA;

    let turnCount = 0;
    const MAX_TURNS = 50; 

    // Snapshot inicial
    events.push({
        type: 'INIT',
        p1: { id: entityA.id, hp: entityA.hp, maxHp: entityA.maxHp, energy: entityA.energy, maxEnergy: entityA.maxEnergy },
        p2: { id: entityB.id, hp: entityB.hp, maxHp: entityB.maxHp, energy: entityB.energy, maxEnergy: entityB.maxEnergy }
    });

    while (entityA.hp > 0 && entityB.hp > 0 && turnCount < MAX_TURNS) {
        turnCount++;
        attacker.isDefending = false; 

        // 1. Efeitos (DoT)
        attacker.effects.forEach(eff => {
            if(eff.type === EffectType.DOT) {
                attacker.hp -= eff.value;
                events.push({
                    type: 'EFFECT_TICK',
                    targetId: attacker.id,
                    damage: eff.value,
                    effectName: eff.name,
                    newHp: attacker.hp,
                    message: `${attacker.name} sofreu ${eff.value} de dano por ${eff.name}.`
                });
            }
            eff.duration--;
        });
        attacker.effects = attacker.effects.filter(e => e.duration > 0);

        if (attacker.hp <= 0) break;

        // 2. IA Escolha
        let possibleMoves = attacker.moves.filter(m => attacker.energy >= m.cost);
        if (attacker.hp >= attacker.maxHp) possibleMoves = possibleMoves.filter(m => m.type !== MoveType.HEAL);
        
        let chosenMove = null;
        if (possibleMoves.length > 0) {
            chosenMove = possibleMoves[Math.floor(Math.random() * possibleMoves.length)];
        }

        // 3. Execução
        if (!chosenMove) {
            const recovery = 5;
            attacker.energy = Math.min(attacker.maxEnergy, attacker.energy + recovery);
            events.push({
                type: 'REST',
                actorId: attacker.id,
                newEnergy: attacker.energy,
                message: `💤 ${attacker.name} descansou (+${recovery} EN).`
            });
        } else {
            attacker.energy -= chosenMove.cost;
            
            // Evento de uso de energia
            events.push({
                type: 'USE_MOVE',
                actorId: attacker.id,
                moveName: chosenMove.name,
                moveIcon: chosenMove.icon,
                moveType: chosenMove.type,
                cost: chosenMove.cost,
                newEnergy: attacker.energy
            });

            if (chosenMove.type === MoveType.DEFEND) {
                attacker.isDefending = true;
                events.push({
                    type: 'DEFEND',
                    actorId: attacker.id,
                    message: `🛡️ ${attacker.name} levantou a guarda!`
                });
            
            } else if (chosenMove.type === MoveType.HEAL) {
                const oldHp = attacker.hp;
                attacker.hp = Math.min(attacker.maxHp, attacker.hp + chosenMove.power);
                const healedAmount = attacker.hp - oldHp;
                events.push({
                    type: 'HEAL',
                    actorId: attacker.id,
                    amount: healedAmount,
                    newHp: attacker.hp,
                    message: `💚 ${attacker.name} curou ${healedAmount} HP.`
                });
            
            } else if (chosenMove.type === MoveType.ATTACK) {
                let multiplier = 1;
                if (TypeChart[attacker.type] === defender.type) multiplier = 1.5;
                if (TypeChart[defender.type] === attacker.type) multiplier = 0.75;

                let damage = (chosenMove.power + attacker.stats.attack) - defender.stats.defense;
                if (damage < 1) damage = 1;

                let blocked = false;
                if (defender.isDefending) {
                    damage = Math.floor(damage / 2);
                    blocked = true;
                }

                damage = Math.floor(damage * multiplier);
                defender.hp -= damage;

                if (chosenMove.effect) {
                    defender.effects.push({ ...chosenMove.effect });
                }

                events.push({
                    type: 'ATTACK_HIT',
                    attackerId: attacker.id,
                    targetId: defender.id,
                    damage: damage,
                    newHp: defender.hp,
                    isEffective: multiplier > 1,
                    isNotEffective: multiplier < 1,
                    isBlocked: blocked,
                    message: `⚔️ ${attacker.name} atacou ${defender.name} (${damage} dano)!`
                });
            }
        }

        if (defender.hp <= 0) break;
        [attacker, defender] = [defender, attacker];
    }

    // Resultado final
    let winner = null;
    if (entityA.hp > 0 && entityB.hp <= 0) winner = entityA;
    else if (entityB.hp > 0 && entityA.hp <= 0) winner = entityB;

    return {
        winnerId: winner ? winner.id : null,
        log: events
    };
}

// =====================
// DATABASE & ROTAS
// =====================
const db = { entities: [] };

app.get('/', (req, res) => {
    res.render('home', { entities: db.entities });
});

app.get('/create', (req, res) => {
    res.render('create', { types: EntityType, moves: MOVES_LIBRARY });
});

app.post('/create', (req, res) => {
    const { name, type, hp, energy, attack, defense, speed, selectedMoves } = req.body;
    const movesKeys = [].concat(selectedMoves || []);
    const finalMoves = movesKeys.map(k => MOVES_LIBRARY[k]).filter(Boolean);
    
    if(finalMoves.length === 0) finalMoves.push(MOVES_LIBRARY['smash']);

    const newEntity = {
        id: Date.now().toString(), // String ID para facilitar no front
        name, type, hp, energy, attack, defense, speed,
        moves: finalMoves
    };
    db.entities.push(newEntity);
    res.redirect('/');
});

app.post('/battle', (req, res) => {
    const { fighter1, fighter2 } = req.body;
    const blueprintA = db.entities.find(e => e.id == fighter1);
    const blueprintB = db.entities.find(e => e.id == fighter2);

    if (!blueprintA || !blueprintB) return res.redirect('/');

    const entityA = new Entity(blueprintA);
    const entityB = new Entity(blueprintB);

    // Salvar estado original para renderizar
    const p1Data = { ...entityA };
    const p2Data = { ...entityB };

    const battleResult = duel(entityA, entityB);

    res.render('battle', { 
        p1: p1Data,
        p2: p2Data,
        battleData: JSON.stringify(battleResult) 
    });
});

app.listen(3000, () => console.log('Servidor rodando em http://localhost:3000'));