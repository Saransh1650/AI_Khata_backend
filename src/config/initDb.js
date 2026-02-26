'use strict';
const fs = require('fs');
const path = require('path');
const pool = require('./database');

async function initDb() {
    const sql = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
    await pool.query(sql);
    console.log('✅ Database schema initialized');
    await pool.end();
}

initDb().catch((err) => {
    console.error('❌ DB init failed:', err.message);
    process.exit(1);
});
