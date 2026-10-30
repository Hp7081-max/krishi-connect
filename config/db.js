const mongoose = require('mongoose');

let isConnected = false;
let connectionMode = 'memory'; // 'mongodb' or 'file_json'

async function connectDB() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/krishi_connect';
  const storageMode = process.env.STORAGE_MODE || 'auto';

  if (storageMode === 'file') {
    console.log('📦 STORAGE_MODE forced to local persistent JSON database.');
    connectionMode = 'file_json';
    return { isConnected: false, mode: 'file_json' };
  }

  try {
    console.log(`⏳ Attempting MongoDB connection: ${uri}...`);
    // Connect with a short timeout so that if local mongod is not running, it falls back instantly without hanging
    await mongoose.connect(uri, {
      serverSelectionTimeoutMS: 2500,
      connectTimeoutMS: 2500
    });
    isConnected = true;
    connectionMode = 'mongodb';
    console.log('✅ Connected to MongoDB successfully!');
    return { isConnected: true, mode: 'mongodb' };
  } catch (err) {
    console.warn(`⚠️ MongoDB not accessible (${err.message}).`);
    console.log('🔄 Gracefully falling back to Persistent Local JSON Database (data/db.json).');
    isConnected = false;
    connectionMode = 'file_json';
    return { isConnected: false, mode: 'file_json' };
  }
}

function getDBStatus() {
  return {
    isConnected,
    mode: connectionMode,
    database: isConnected ? mongoose.connection.name : 'local_json_db'
  };
}

module.exports = {
  connectDB,
  getDBStatus
};
