/**
 * Script para migrar dados de basepokemons para entities
 * Remove a coleção entities vazia e copia os dados
 */

const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');

async function migrateData() {
    try {
        console.log('🔗 Conectando ao MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('✅ Conectado!\n');

        const db = mongoose.connection.db;

        // Verifica colções
        console.log('📦 Verificando coleções...');
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        console.log('Coleções encontradas:', collectionNames.filter(n => n.includes('pokemon') || n.includes('entit')));

        // Se entities existe, remove
        if (collectionNames.includes('entities')) {
            console.log('  Removendo coleção "entities" vazia...');
            await db.collection('entities').drop();
            console.log('  ✅ Removida!\n');
        }

        // Conta documentos em basepokemons
        const count = await db.collection('basepokemons').countDocuments();
        console.log(`📊 Encontrados ${count} documentos em basepokemons`);

        if (count === 0) {
            console.log('⚠️ Nenhum documento para migrar!');
            process.exit(0);
        }

        // Copia dados de basepokemons para entities
        console.log('\n🔄 Migrando dados...');
        const documents = await db.collection('basepokemons').find({}).toArray();
        
        if (documents.length > 0) {
            const result = await db.collection('entities').insertMany(documents);
            console.log(`✅ ${result.insertedCount} documentos inseridos em "entities"`);
        }

        // Remove a coleção basepokemons
        console.log('\n🗑️ Removendo coleção "basepokemons"...');
        await db.collection('basepokemons').drop();
        console.log('✅ Removida!\n');

        // Verifica resultado
        const newCount = await db.collection('entities').countDocuments();
        console.log('═══════════════════════════════════');
        console.log('✨ MIGRAÇÃO COMPLETADA COM SUCESSO!');
        console.log('═══════════════════════════════════');
        console.log(`
📊 Resultado:
  • Coleção "basepokemons": REMOVIDA (${count} documentos)
  • Coleção "entities": ${newCount} documentos
        `);

        process.exit(0);
    } catch (error) {
        console.error('❌ Erro:', error.message);
        process.exit(1);
    }
}

if (require.main === module) {
    const args = process.argv.slice(2);
    if (args[0] !== '--confirm') {
        console.log(`
🚨 AVISO: Esta migração vai:
  1. Remover a coleção "entities" vazia
  2. Copiar dados de "basepokemons" para "entities"
  3. Remover a coleção "basepokemons"
  
Para confirmar, rode: node scripts/migrate_basepokemons_to_entities.js --confirm
        `);
        process.exit(0);
    }
    migrateData();
}

module.exports = { migrateData };
