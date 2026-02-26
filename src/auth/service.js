'use strict';
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/database');
const env = require('../config/env');

async function register({ name, password }) {
    const existing = await pool.query('SELECT id FROM users WHERE name=$1', [name]);
    if (existing.rows.length > 0) {
        const err = new Error('Username already taken'); err.status = 409; throw err;
    }
    const password_hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
        'INSERT INTO users(name, password_hash) VALUES($1,$2) RETURNING id, name, created_at',
        [name, password_hash]
    );
    return rows[0];
}

async function login({ name, password }) {
    const { rows } = await pool.query('SELECT * FROM users WHERE name=$1', [name]);
    if (!rows.length) { const e = new Error('Invalid credentials'); e.status = 401; throw e; }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) { const e = new Error('Invalid credentials'); e.status = 401; throw e; }

    const token = jwt.sign({ userId: user.id, name: user.name }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
    const refreshToken = jwt.sign({ userId: user.id }, env.jwtSecret, { expiresIn: env.refreshExpiresIn });

    // Return the user's first store so the app can restore storeId on login
    const { rows: stores } = await pool.query(
        'SELECT id, name, type FROM stores WHERE user_id=$1 ORDER BY created_at ASC LIMIT 1',
        [user.id]
    );
    const store = stores[0] || null;
    return { token, refreshToken, user: { id: user.id, name: user.name }, store };
}

async function refresh({ refreshToken }) {
    try {
        const payload = jwt.verify(refreshToken, env.jwtSecret);
        const { rows } = await pool.query('SELECT id, name FROM users WHERE id=$1', [payload.userId]);
        if (!rows.length) { const e = new Error('User not found'); e.status = 401; throw e; }
        const user = rows[0];
        const token = jwt.sign({ userId: user.id, name: user.name }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
        return { token };
    } catch {
        const e = new Error('Invalid refresh token'); e.status = 401; throw e;
    }
}

module.exports = { register, login, refresh };
