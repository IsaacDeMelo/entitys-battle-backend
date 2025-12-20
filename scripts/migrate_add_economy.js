const mongoose = require('mongoose');
const { User } = require('../models');
const { MONGO_URI } = require('../config');

async function run() {
    await mongoose.connect(MONGO_URI, { connectTimeoutMS: 5000 }).catch(e => { console.error('DB error', e); process.exit(1); });
    console.log('Connected to DB');
    // Set defaults where fields are missing or null
    const res = await User.updateMany({ $or: [ { money: { $exists: false } }, { money: null } ] }, { $set: { money: 100 } });
    console.log('Updated money for', res.modifiedCount, 'users');
    const res2 = await User.updateMany({ $or: [ { pokeballs: { $exists: false } }, { pokeballs: null } ] }, { $set: { pokeballs: 5 } });
    console.log('Updated pokeballs for', res2.modifiedCount, 'users');
    const res3 = await User.updateMany({ $or: [ { rareCandy: { $exists: false } }, { rareCandy: null } ] }, { $set: { rareCandy: 0 } });
    console.log('Updated rareCandy for', res3.modifiedCount, 'users');
    mongoose.disconnect();
    console.log('Migration complete.');
}

run().catch(e => { console.error(e); process.exit(1); });
