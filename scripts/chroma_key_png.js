#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { processPngBuffer } = require('../lib/chromaKey');

function printHelp() {
  // No emojis (keep output clean in terminals/logs)
  console.log(`\nChroma key PNG -> PNG com transparência (mantém qualidade/pixel-art)\n\nUso:\n  node scripts/chroma_key_png.js --in input.png --out output.png --key ff00ff --tolerance 40 --feather 10 --despeckle 20\n\nOpções:\n  --in           Caminho do PNG de entrada\n  --out          Caminho do PNG de saída\n  --key          Cor do fundo em hex (RGB), ex: ff00ff\n  --tolerance    Tolerância (0-441). Recomendado: 20-80\n  --feather      Faixa extra para alpha suave (0-441). 0 = recorte seco\n  --despeckle    Remove componentes pequenas (pixels). 0 desliga. Recomendado: 10-60\n\nExemplos:\n  node scripts/chroma_key_png.js --in girl.png --out girl_out.png --key ff00ff --tolerance 60 --despeckle 25\n  node scripts/chroma_key_png.js --in sheet.png --out sheet_alpha.png --key ff00ff --tolerance 55 --feather 8 --despeckle 30\n`);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i++;
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    printHelp();
    process.exit(0);
  }

  const inPath = args.in;
  const outPath = args.out;
  const keyHex = args.key || 'ff00ff';

  if (!inPath || !outPath) {
    printHelp();
    process.exit(2);
  }

  const inputAbs = path.resolve(inPath);
  const outputAbs = path.resolve(outPath);

  const input = fs.readFileSync(inputAbs);
  const { outputBuffer, meta } = processPngBuffer(input, {
    key: keyHex,
    tolerance: args.tolerance,
    feather: args.feather,
    despeckle: args.despeckle,
  });

  const outBuf = outputBuffer;
  fs.writeFileSync(outputAbs, outBuf);

  console.log(`OK: ${inputAbs} -> ${outputAbs}`);
  console.log(`key=#${meta.key} tolerance=${meta.tolerance} feather=${meta.feather} despeckle<${meta.despeckle}`);
}

main().catch((err) => {
  console.error('Erro:', err && err.message ? err.message : err);
  process.exit(1);
});
