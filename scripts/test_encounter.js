// scripts/test_encounter.js
// Simula cliques no patch de grama (via socket.io) para medir a taxa de encontro.
// Uso: node scripts/test_encounter.js [TRIALS] [GRASS_ID] [SERVER]

const io = require('socket.io-client');
const trials = parseInt(process.argv[2], 10) || 1000;
const grassId = process.argv[3] || 'grass1';
const server = process.argv[4] || process.env.SERVER || 'http://localhost:3000';

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  const socket = io(server, { reconnection: false, transports: ['websocket'] });
  await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('Timeout connecting')), 5000);
    socket.on('connect', () => { clearTimeout(to); resolve(); });
    socket.on('connect_error', (err) => reject(err));
  });

  console.log(`Connected to ${server} as ${socket.id}. Running ${trials} trials on ${grassId}`);

  let successes = 0;
  socket.on('encounter_found', () => { successes++; });

  for (let i = 0; i < trials; i++) {
    socket.emit('check_encounter', { grassId, x: 10, y: 10 });
    // small delay to avoid overwhelming; server responds quickly
    await wait(5);
  }

  // espera eventos pendentes
  await wait(500);
  console.log(`Trials=${trials} successes=${successes} -> ${(successes / trials * 100).toFixed(2)}%`);

  socket.disconnect();
  process.exit(0);
})();