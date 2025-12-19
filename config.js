// config.js
// Centraliza configurações como a URI do Mongo para evitar duplicação.
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://isaachonorato41:brasil2021@cluster0.rxemo.mongodb.net/?appName=Cluster0";

module.exports = { MONGO_URI };
