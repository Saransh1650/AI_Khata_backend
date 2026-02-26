'use strict';
const pool = require('../config/database');

async function setupStore(userId, { name, region, type }) {
    const { rows } = await pool.query(
        'INSERT INTO stores(user_id, name, region, type) VALUES($1,$2,$3,$4) RETURNING *',
        [userId, name, region || '', type || 'general']
    );
    return rows[0];
}

async function getStores(userId) {
    const { rows } = await pool.query(
        'SELECT * FROM stores WHERE user_id=$1 ORDER BY created_at DESC',
        [userId]
    );
    return rows;
}

async function getStore(storeId, userId) {
    const { rows } = await pool.query(
        'SELECT * FROM stores WHERE id=$1 AND user_id=$2',
        [storeId, userId]
    );
    return rows[0] || null;
}

module.exports = { setupStore, getStores, getStore };
