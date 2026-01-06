const mongoose = require('mongoose');
const { User } = require('../models');
const { MONGO_URI } = require('../config');

mongoose.connect(MONGO_URI)
    .then(async () => {
        console.log('Conectado ao MongoDB');
        
        const count = await User.countDocuments();
        console.log(`Encontrados ${count} usuários`);
        
        const result = await User.deleteMany({});
        console.log(`✅ ${result.deletedCount} usuários deletados com sucesso!`);
        
        process.exit(0);
    })
    .catch(err => {
        console.error('Erro:', err);
        process.exit(1);
    });
