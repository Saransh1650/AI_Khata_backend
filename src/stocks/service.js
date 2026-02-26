'use strict';
const pool = require('../config/database');

async function listStock(userId, storeId) {
    const { rows } = await pool.query(
        `SELECT * FROM stock_items
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
         ORDER BY product_name ASC`,
        [userId, storeId]
    );
    return rows;
}

async function upsertStockItem(userId, storeId, { productName, quantity, unit, costPrice }) {
    const { rows } = await pool.query(
        `INSERT INTO stock_items(user_id, store_id, product_name, quantity, unit, cost_price, updated_at)
         VALUES($1,$2,$3,$4,$5,$6,NOW())
         ON CONFLICT(store_id, product_name)
         DO UPDATE SET quantity=$4, unit=$5, cost_price=$6, updated_at=NOW()
         RETURNING *`,
        [userId, storeId, productName, quantity ?? 0, unit ?? 'units', costPrice ?? null]
    );
    return rows[0];
}

async function updateStockItem(itemId, userId, { quantity, unit, costPrice, productName }) {
    const { rows } = await pool.query(
        `UPDATE stock_items
         SET quantity=COALESCE($3, quantity),
             unit=COALESCE($4, unit),
             cost_price=COALESCE($5, cost_price),
             product_name=COALESCE($6, product_name),
             updated_at=NOW()
         WHERE id=$1 AND user_id=$2
         RETURNING *`,
        [itemId, userId, quantity, unit, costPrice, productName]
    );
    return rows[0] || null;
}

async function deleteStockItem(itemId, userId) {
    const { rowCount } = await pool.query(
        'DELETE FROM stock_items WHERE id=$1 AND user_id=$2',
        [itemId, userId]
    );
    return rowCount > 0;
}

async function getStockItem(itemId, userId) {
    const { rows } = await pool.query(
        'SELECT * FROM stock_items WHERE id=$1 AND user_id=$2',
        [itemId, userId]
    );
    return rows[0] || null;
}

module.exports = { listStock, upsertStockItem, updateStockItem, deleteStockItem, getStockItem };
