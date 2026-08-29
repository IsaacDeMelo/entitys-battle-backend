// config.js
// Centraliza configurações como a URI do Mongo para evitar duplicação.
require('dotenv').config();

const DEFAULT_LOCAL_MONGO_URI = 'mongodb://127.0.0.1:27017/entitys-battle-backend';
const envMongoUri = typeof process.env.MONGO_URI === 'string' ? process.env.MONGO_URI.trim() : '';

if (!envMongoUri && process.env.NODE_ENV === 'production') {
	throw new Error('MONGO_URI não configurada em ambiente de produção.');
}

const MONGO_URI = envMongoUri || DEFAULT_LOCAL_MONGO_URI;
const USING_LOCAL_MONGO_FALLBACK = !envMongoUri;

if (USING_LOCAL_MONGO_FALLBACK) {
	console.warn('[config] MONGO_URI ausente. Usando fallback local para desenvolvimento.');
}

module.exports = { MONGO_URI, DEFAULT_LOCAL_MONGO_URI, USING_LOCAL_MONGO_FALLBACK };
