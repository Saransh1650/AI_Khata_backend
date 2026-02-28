'use strict';
const pool = require('../config/database');

/**
 * List all order items for a user (optionally filtered by store).
 */
async function list(userId, storeId) {
    const { rows } = await pool.query(
        `SELECT id, name, unit, reason, qty
         FROM order_items
         WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)
         ORDER BY created_at ASC`,
        [userId, storeId]
    );
    return rows;
}

/**
 * Upsert an order item by (user_id, name).
 * If an item with the same name already exists for this user, update it.
 */
async function upsert(userId, storeId, { name, unit = 'units', reason = '', qty = 1 }) {
    const { rows: [item] } = await pool.query(
        `INSERT INTO order_items(user_id, store_id, name, unit, reason, qty)
         VALUES($1, $2, $3, $4, $5, $6)
         ON CONFLICT(user_id, name)
           DO UPDATE SET unit=$4, reason=$5, qty=$6, updated_at=NOW()
         RETURNING *`,
        [userId, storeId, name, unit, reason, qty]
    );
    return item;
}

/**
 * Patch qty and/or unit of a single order item.
 */
async function update(id, userId, { qty, unit }) {
    const sets = [];
    const vals = [];
    let n = 1;
    if (qty !== undefined) { sets.push(`qty=$${n++}`); vals.push(qty); }
    if (unit !== undefined) { sets.push(`unit=$${n++}`); vals.push(unit); }
    if (!sets.length) return null;
    sets.push('updated_at=NOW()');
    vals.push(id, userId);
    const { rows: [item] } = await pool.query(
        `UPDATE order_items SET ${sets.join(',')}
         WHERE id=$${n++} AND user_id=$${n++}
         RETURNING *`,
        vals
    );
    return item || null;
}

/**
 * Delete a single order item by id.
 */
async function remove(id, userId) {
    const { rowCount } = await pool.query(
        'DELETE FROM order_items WHERE id=$1 AND user_id=$2',
        [id, userId]
    );
    return rowCount > 0;
}

/**
 * Clear the entire order list for a user/store.
 */
async function clearAll(userId, storeId) {
    await pool.query(
        'DELETE FROM order_items WHERE user_id=$1 AND ($2::uuid IS NULL OR store_id=$2)',
        [userId, storeId]
    );
}

module.exports = { list, upsert, update, remove, clearAll };
